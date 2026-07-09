"""Metadata extraction using Mutagen"""

from pathlib import Path
from typing import Optional, Dict, Any
import hashlib
from mutagen import File as MutagenFile
from mutagen.flac import FLAC, Picture
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, APIC
from mutagen.mp4 import MP4
from loguru import logger


class MetadataExtractor:
    """Extracts metadata from audio files using Mutagen"""
    
    def extract(self, file_path: str) -> Optional[Dict[str, Any]]:
        """
        Extract metadata from audio file
        
        Returns:
            {
                'title': str,
                'artist': str,
                'album': str,
                'album_artist': str,
                'genre': str,
                'year': int,
                'track_number': int,
                'disc_number': int,
                'duration': float,
                'bitrate': int,
                'sample_rate': int,
                'format': str,
                'has_artwork': bool
            }
        """
        try:
            audio = MutagenFile(file_path)
            
            if audio is None:
                logger.warning(f"Could not read file: {file_path}")
                return None
            
            path = Path(file_path)
            
            # Base metadata
            metadata = {
                'path': str(path.absolute()),
                'file_size': path.stat().st_size,
                'format': self._get_format(audio),
                'duration': getattr(audio.info, 'length', 0),
                'bitrate': getattr(audio.info, 'bitrate', 0),
                'sample_rate': getattr(audio.info, 'sample_rate', 0),
                'has_artwork': False
            }
            
            # Extract tags based on file type
            if isinstance(audio, MP3):
                metadata.update(self._extract_id3_tags(audio))
            elif isinstance(audio, FLAC):
                metadata.update(self._extract_flac_tags(audio))
            elif isinstance(audio, MP4):
                metadata.update(self._extract_mp4_tags(audio))
            else:
                # Generic tag extraction
                metadata.update(self._extract_generic_tags(audio))
            
            # Track data provenance
            was_title_from_filename = not bool(metadata.get('title'))
            
            # Generate unique ID
            metadata['id'] = self._generate_id(file_path)
            
            # Fallback to filename if title is missing
            if was_title_from_filename:
                metadata['title'] = path.stem
            
            # Set source_* fields based on extraction
            # "tag" = from file tags, "filename" = parsed from filename, None = not available
            metadata['source_title'] = 'filename' if was_title_from_filename else ('tag' if metadata.get('title') else None)
            metadata['source_artist'] = 'tag' if metadata.get('artist') else None
            metadata['source_album'] = 'tag' if metadata.get('album') else None
            metadata['source_album_artist'] = 'tag' if metadata.get('album_artist') else None
            metadata['source_genre'] = 'tag' if metadata.get('genre') else None
            metadata['source_year'] = 'tag' if metadata.get('year') is not None else None
            metadata['source_track_number'] = 'tag' if metadata.get('track_number') is not None else None
            metadata['source_disc_number'] = 'tag' if metadata.get('disc_number') is not None else None
            metadata['source_duration'] = 'tag'  # Always from file header
            metadata['source_artwork'] = 'tag' if metadata.get('has_artwork') else None
            
            return metadata
            
        except Exception as e:
            logger.error(f"Error extracting metadata from {file_path}: {e}")
            return None
    
    def _get_format(self, audio) -> str:
        """Get audio format string"""
        if isinstance(audio, MP3):
            return 'MP3'
        elif isinstance(audio, FLAC):
            return 'FLAC'
        elif isinstance(audio, MP4):
            return 'M4A/AAC'
        else:
            return audio.__class__.__name__.upper()
    
    def _extract_id3_tags(self, audio: MP3) -> dict:
        """Extract ID3 tags (MP3)"""
        tags = {}
        
        if audio.tags:
            tags['title'] = str(audio.tags.get('TIT2', [''])[0])
            tags['artist'] = str(audio.tags.get('TPE1', [''])[0])
            tags['album'] = str(audio.tags.get('TALB', [''])[0])
            tags['album_artist'] = str(audio.tags.get('TPE2', [''])[0])
            tags['genre'] = str(audio.tags.get('TCON', [''])[0])
            
            # Year
            year_tag = audio.tags.get('TDRC') or audio.tags.get('TYER')
            if year_tag:
                try:
                    tags['year'] = int(str(year_tag[0])[:4])
                except:
                    tags['year'] = None
            
            # Track number
            track = str(audio.tags.get('TRCK', [''])[0])
            if track and '/' in track:
                track = track.split('/')[0]
            try:
                tags['track_number'] = int(track) if track else None
            except:
                tags['track_number'] = None
            
            # Disc number
            disc = str(audio.tags.get('TPOS', [''])[0])
            if disc and '/' in disc:
                disc = disc.split('/')[0]
            try:
                tags['disc_number'] = int(disc) if disc else None
            except:
                tags['disc_number'] = None
            
            # Check for artwork
            tags['has_artwork'] = any(isinstance(tag, APIC) for tag in audio.tags.values())
        
        return tags
    
    def _extract_flac_tags(self, audio: FLAC) -> dict:
        """Extract FLAC tags"""
        tags = {}
        
        tags['title'] = audio.get('title', [''])[0]
        tags['artist'] = audio.get('artist', [''])[0]
        tags['album'] = audio.get('album', [''])[0]
        tags['album_artist'] = audio.get('albumartist', [''])[0]
        tags['genre'] = audio.get('genre', [''])[0]
        
        # Year
        year = audio.get('date', [''])[0] or audio.get('year', [''])[0]
        try:
            tags['year'] = int(year[:4]) if year else None
        except:
            tags['year'] = None
        
        # Track number
        try:
            track = audio.get('tracknumber', [''])[0]
            if track and '/' in track:
                track = track.split('/')[0]
            tags['track_number'] = int(track) if track else None
        except:
            tags['track_number'] = None
        
        # Disc number
        try:
            disc = audio.get('discnumber', [''])[0]
            if disc and '/' in disc:
                disc = disc.split('/')[0]
            tags['disc_number'] = int(disc) if disc else None
        except:
            tags['disc_number'] = None
        
        # Check for artwork
        tags['has_artwork'] = len(audio.pictures) > 0
        
        return tags
    
    def _extract_mp4_tags(self, audio: MP4) -> dict:
        """Extract MP4/M4A tags"""
        tags = {}
        
        tags['title'] = audio.get('\xa9nam', [''])[0]
        tags['artist'] = audio.get('\xa9ART', [''])[0]
        tags['album'] = audio.get('\xa9alb', [''])[0]
        tags['album_artist'] = audio.get('aART', [''])[0]
        tags['genre'] = audio.get('\xa9gen', [''])[0]
        
        # Year
        year = audio.get('\xa9day', [''])[0]
        try:
            tags['year'] = int(year[:4]) if year else None
        except:
            tags['year'] = None
        
        # Track number
        track_data = audio.get('trkn', [None])[0]
        if track_data:
            tags['track_number'] = track_data[0]
        else:
            tags['track_number'] = None
        
        # Disc number
        disc_data = audio.get('disk', [None])[0]
        if disc_data:
            tags['disc_number'] = disc_data[0]
        else:
            tags['disc_number'] = None
        
        # Check for artwork
        tags['has_artwork'] = 'covr' in audio
        
        return tags
    
    def _extract_generic_tags(self, audio) -> dict:
        """Extract tags for unsupported formats"""
        tags = {
            'title': None,
            'artist': None,
            'album': None,
            'album_artist': None,
            'genre': None,
            'year': None,
            'track_number': None,
            'disc_number': None,
            'has_artwork': False
        }
        
        # Try to get basic tags if available
        if hasattr(audio, 'tags') and audio.tags:
            for key in ['title', 'artist', 'album']:
                if key in audio.tags:
                    tags[key] = str(audio.tags[key][0])
        
        return tags
    
    def _generate_id(self, file_path: str) -> str:
        """Generate unique ID for track based on file path"""
        return hashlib.md5(file_path.encode()).hexdigest()
