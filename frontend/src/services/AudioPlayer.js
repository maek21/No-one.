class AudioPlayerService {
  constructor() {
    this._el = new Audio();
    this._el.preload = 'auto';
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 0;
    this.onTimeUpdate = null;
    this.onEnded = null;
    this.onAudioData = null;

    // Web Audio API for real-time analysis
    this._audioCtx = null;
    this._analyser = null;
    this._source = null;
    this._gainNode = null;
    this._analysisData = { bass: 0, mid: 0, treble: 0, energy: 0 };
    this._analysisRaf = null;

    this._el.addEventListener('timeupdate', () => {
      this.currentTime = this._el.currentTime;
      this.duration = this._el.duration || 0;
      if (this.onTimeUpdate) {
        this.onTimeUpdate({ currentTime: this.currentTime, duration: this.duration });
      }
    });

    this._el.addEventListener('ended', () => {
      this.isPlaying = false;
      this._stopAnalysis();
      if (this.onEnded) this.onEnded();
    });

    this._el.addEventListener('error', (e) => {
      console.error('Audio error:', e.target.error);
    });

    this._el.addEventListener('play', () => {
      this._startAnalysis();
    });

    this._el.addEventListener('pause', () => {
      this._stopAnalysis();
    });
  }

  async play(url) {
    try {
      this._setupAudioContext();
      this._el.src = url;
      this._el.load();
      await this._el.play();
      this.isPlaying = true;
      return true;
    } catch (e) {
      console.warn('Play failed:', e.message);
      return false;
    }
  }

  pause() {
    this._el.pause();
    this.isPlaying = false;
  }

  resume() {
    this._el.play().catch(() => {});
    this.isPlaying = true;
  }

  stop() {
    this._el.pause();
    this._el.currentTime = 0;
    this._el.removeAttribute('src');
    this._el.load();
    this.isPlaying = false;
    this._stopAnalysis();
  }

  seek(time) {
    if (isFinite(time)) this._el.currentTime = time;
  }

  setVolume(volume) {
    this._el.volume = Math.max(0, Math.min(1, volume));
  }

  get audio() {
    const el = this._el;
    return {
      get currentTime() { return el.currentTime || 0; },
      get duration() { return el.duration || 0; },
    };
  }

  get analysis() {
    return this._analysisData;
  }

  // ── Private: Web Audio setup ──

  _setupAudioContext() {
    if (this._audioCtx) return;
    try {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this._analyser = this._audioCtx.createAnalyser();
      this._analyser.fftSize = 256;
      this._analyser.smoothingTimeConstant = 0.8;

      this._gainNode = this._audioCtx.createGain();
      this._gainNode.gain.value = 1.0;

      this._source = this._audioCtx.createMediaElementSource(this._el);
      this._source.connect(this._analyser);
      this._analyser.connect(this._gainNode);
      this._gainNode.connect(this._audioCtx.destination);
    } catch (e) {
      console.warn('Web Audio analysis unavailable:', e.message);
    }
  }

  _startAnalysis() {
    if (!this._analyser || this._analysisRaf) return;

    const bufferLength = this._analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const tick = () => {
      this._analyser.getByteFrequencyData(dataArray);

      // Split frequencies: bass (0-3), mid (4-7), treble (8+)
      let bassSum = 0, midSum = 0, trebleSum = 0;
      const bassEnd = Math.floor(bufferLength * 0.15);
      const midEnd = Math.floor(bufferLength * 0.45);

      for (let i = 0; i < bufferLength; i++) {
        const val = dataArray[i] / 255;
        if (i < bassEnd) bassSum += val;
        else if (i < midEnd) midSum += val;
        else trebleSum += val;
      }

      const bass = bassSum / Math.max(1, bassEnd);
      const mid = midSum / Math.max(1, midEnd - bassEnd);
      const treble = trebleSum / Math.max(1, bufferLength - midEnd);
      const energy = (bass + mid + treble) / 3;

      this._analysisData = { bass, mid, treble, energy };

      if (this.onAudioData) {
        this.onAudioData(this._analysisData);
      }

      this._analysisRaf = requestAnimationFrame(tick);
    };

    this._analysisRaf = requestAnimationFrame(tick);
  }

  _stopAnalysis() {
    if (this._analysisRaf) {
      cancelAnimationFrame(this._analysisRaf);
      this._analysisRaf = null;
    }
  }
}

export const audioPlayer = new AudioPlayerService();
