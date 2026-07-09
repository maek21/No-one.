"""Artwork extraction and palette generation"""

import hashlib
from pathlib import Path
from typing import Optional, List, Tuple
from io import BytesIO

from mutagen import File as MutagenFile
from mutagen.flac import FLAC
from mutagen.mp3 import MP3
from mutagen.id3 import APIC
from mutagen.mp4 import MP4
from PIL import Image
import numpy as np
from sklearn.cluster import KMeans
from loguru import logger

from config import settings


class ArtworkExtractor:
    """Extracts artwork from audio files and generates color palettes"""
    
    def __init__(self):
        self.cache_dir = Path(settings.artwork_cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
    
    def extract_artwork(self, file_path: str) -> Optional[str]:
        """
        Extract artwork from audio file and save to cache
        
        Returns: Path to cached artwork file, or None
        """
        try:
            audio = MutagenFile(file_path)
            
            if audio is None:
                return None
            
            # Extract artwork binary data
            artwork_data = None
            
            if isinstance(audio, MP3) and audio.tags:
                # MP3 with ID3 tags
                for tag in audio.tags.values():
                    if isinstance(tag, APIC):
                        artwork_data = tag.data
                        break
            
            elif isinstance(audio, FLAC) and audio.pictures:
                # FLAC
                artwork_data = audio.pictures[0].data
            
            elif isinstance(audio, MP4) and 'covr' in audio:
                # MP4/M4A
                artwork_data = bytes(audio['covr'][0])
            
            if not artwork_data:
                return None
            
            # Generate cache filename
            file_hash = hashlib.md5(file_path.encode()).hexdigest()
            cache_path = self.cache_dir / f"{file_hash}.jpg"
            
            # If already cached, return path
            if cache_path.exists():
                return str(cache_path)
            
            # Save artwork
            try:
                image = Image.open(BytesIO(artwork_data))
                
                # Convert to RGB if necessary
                if image.mode != 'RGB':
                    image = image.convert('RGB')
                
                # Resize to reasonable size (max 500x500)
                image.thumbnail((500, 500), Image.Resampling.LANCZOS)
                
                # Save as JPEG
                image.save(cache_path, 'JPEG', quality=90)
                
                logger.info(f"Cached artwork: {cache_path}")
                return str(cache_path)
                
            except Exception as e:
                logger.error(f"Error processing artwork: {e}")
                return None
        
        except Exception as e:
            logger.error(f"Error extracting artwork from {file_path}: {e}")
            return None
    
    def generate_palette(self, artwork_path: str, n_colors: int = 6) -> Optional[dict]:
        """
        Generate color palette from artwork using K-means clustering
        
        Returns:
            {
                'primary': '#RRGGBB',
                'secondary': '#RRGGBB',
                'accent': '#RRGGBB',
                'shadow': '#RRGGBB',
                'highlight': '#RRGGBB',
                'ambient': '#RRGGBB'
            }
        """
        try:
            image = Image.open(artwork_path)
            
            # Resize for faster processing
            image.thumbnail((150, 150))
            
            # Convert to RGB
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # Get pixel data as numpy array
            pixels = np.array(image)
            pixels = pixels.reshape(-1, 3)
            
            # Remove very dark and very light pixels
            brightness = np.mean(pixels, axis=1)
            mask = (brightness > 20) & (brightness < 235)
            pixels = pixels[mask]
            
            if len(pixels) < n_colors:
                logger.warning(f"Not enough valid pixels in artwork: {artwork_path}")
                return None
            
            # K-means clustering to find dominant colors
            kmeans = KMeans(n_clusters=n_colors, random_state=42, n_init=10)
            kmeans.fit(pixels)
            
            colors = kmeans.cluster_centers_.astype(int)
            
            # Sort colors by brightness
            brightness = np.mean(colors, axis=1)
            sorted_indices = np.argsort(brightness)
            colors = colors[sorted_indices]
            
            # Assign semantic meaning to colors
            palette = {
                'shadow': self._rgb_to_hex(colors[0]),      # Darkest
                'secondary': self._rgb_to_hex(colors[1]),
                'primary': self._rgb_to_hex(colors[2]),     # Mid-tone (most important)
                'accent': self._rgb_to_hex(colors[3]),
                'ambient': self._rgb_to_hex(colors[4]),
                'highlight': self._rgb_to_hex(colors[5])    # Lightest
            }
            
            logger.info(f"Generated palette: {palette}")
            return palette
            
        except Exception as e:
            logger.error(f"Error generating palette from {artwork_path}: {e}")
            return None
    
    def _rgb_to_hex(self, rgb: np.ndarray) -> str:
        """Convert RGB array to hex color string"""
        return f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"
