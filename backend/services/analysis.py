"""Audio analysis service using Librosa — BPM, key, energy, loudness, waveform"""

import json
import hashlib
from pathlib import Path
from typing import Optional, Dict, Any
import numpy as np

from loguru import logger
from config import settings


class AudioAnalyzer:
    """Analyzes audio files for BPM, key, energy, loudness, and waveform data"""

    def __init__(self):
        self.cache_dir = Path(settings.waveform_cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def analyze(self, file_path: str) -> Optional[Dict[str, Any]]:
        """Full analysis of an audio file.

        Returns:
            {
                'bpm': float,
                'key': str,
                'energy': float,
                'loudness': float,
                'waveform': [float, ...],   # 200-point waveform envelope
                'spectral_centroid': float,
                'zero_crossing_rate': float,
                'tempo_confidence': float
            }
        """
        cache_key = hashlib.md5(file_path.encode()).hexdigest()
        cache_path = self.cache_dir / f"{cache_key}_analysis.json"

        # Return cached result if available
        if cache_path.exists():
            try:
                with open(cache_path) as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to read analysis cache: {e}")

        try:
            import librosa

            logger.info(f"Analyzing: {file_path}")

            # Load audio (use sr=None to keep original sample rate)
            y, sr = librosa.load(file_path, sr=None, mono=True, duration=300)

            if len(y) == 0:
                logger.error(f"Empty audio file: {file_path}")
                return None

            # BPM detection
            tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
            bpm = float(np.round(tempo)) if not np.isnan(tempo) else 0.0

            # Key detection (Krumhansl-Schmuckler via librosa)
            try:
                chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
                key = self._estimate_key(chroma)
            except Exception:
                key = "C"

            # Energy (RMS energy, 0-1 normalized)
            rms = librosa.feature.rms(y=y)[0]
            energy = float(np.clip(np.mean(rms) * 10, 0.0, 1.0))

            # Loudness (perceived, in dB)
            try:
                S = librosa.stft(y)
                dB = librosa.amplitude_to_db(np.abs(S), ref=np.max)
                loudness = float(np.mean(dB[dB > -80]))
            except Exception:
                loudness = -20.0

            # Spectral centroid
            try:
                spectral_centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
            except Exception:
                spectral_centroid = 0.0

            # Zero crossing rate
            zcr = float(np.mean(librosa.feature.zero_crossing_rate(y=y)))

            # Tempo confidence
            tempo_conf = self._estimate_tempo_confidence(y, sr, tempo)

            # Waveform envelope (200-point downsampled for visualization)
            waveform = self._extract_waveform_envelope(y, 200)

            # Build result
            result = {
                "bpm": bpm,
                "key": key,
                "energy": round(energy, 4),
                "loudness": round(loudness, 2),
                "waveform": [round(float(v), 6) for v in waveform],
                "spectral_centroid": round(spectral_centroid, 2),
                "zero_crossing_rate": round(zcr, 6),
                "tempo_confidence": round(float(tempo_conf), 4),
            }

            # Cache result
            try:
                with open(cache_path, "w") as f:
                    json.dump(result, f)
            except Exception as e:
                logger.warning(f"Failed to cache analysis: {e}")

            logger.info(f"Analysis complete for {file_path}: BPM={bpm}, key={key}, energy={energy:.2f}")
            return result

        except ImportError:
            logger.error("librosa not installed. Install with: pip install librosa")
            return None
        except Exception as e:
            logger.error(f"Analysis failed for {file_path}: {e}")
            return None

    def _estimate_key(self, chroma: np.ndarray) -> str:
        """Estimate musical key from chromagram using Krumhansl-Schmuckler profiles"""
        # Major and minor key profiles (Krumhansl-Schmuckler)
        major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09,
                                  2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
        minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53,
                                  2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

        key_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

        # Average chroma over time
        chroma_mean = np.mean(chroma, axis=1)

        best_corr = -np.inf
        best_key = "C"

        for i in range(12):
            rotated = np.roll(chroma_mean, i)
            corr_major = np.corrcoef(rotated, major_profile)[0, 1]
            corr_minor = np.corrcoef(rotated, minor_profile)[0, 1]

            if corr_major > best_corr:
                best_corr = corr_major
                best_key = key_names[i]
            if corr_minor > best_corr:
                best_corr = corr_minor
                best_key = key_names[i] + "m"

        return best_key

    def _estimate_tempo_confidence(self, y: np.ndarray, sr: int, tempo: float) -> float:
        """Estimate how confident we are in the BPM detection"""
        try:
            onset_env = librosa.onset.onset_strength(y=y, sr=sr)
            tempo_values = librosa.beat.tempo(onset_envelope=onset_env, sr=sr, aggregate=None)
            if len(tempo_values) > 1:
                std = float(np.std(tempo_values))
                confidence = max(0.0, min(1.0, 1.0 - std / 20.0))
                return confidence
            return 0.5
        except Exception:
            return 0.5

    def _extract_waveform_envelope(self, y: np.ndarray, n_points: int) -> np.ndarray:
        """Extract a downsampled waveform envelope for visualization"""
        if len(y) == 0:
            return np.zeros(n_points)

        frame_length = max(1, len(y) // n_points)
        envelope = np.array([
            np.max(np.abs(y[i * frame_length:(i + 1) * frame_length]))
            for i in range(min(n_points, len(y) // frame_length + 1))
        ])

        # Normalize to 0-1
        max_val = np.max(envelope) if len(envelope) > 0 and np.max(envelope) > 0 else 1.0
        envelope = envelope / max_val

        # Pad or truncate to exact n_points
        if len(envelope) < n_points:
            envelope = np.pad(envelope, (0, n_points - len(envelope)), 'edge')
        else:
            envelope = envelope[:n_points]

        return envelope


# Global instance
audio_analyzer = AudioAnalyzer()
