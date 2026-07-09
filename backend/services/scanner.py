"""Library scanner - recursively scans folders for audio files"""

import os
from pathlib import Path
from typing import List
from loguru import logger
from config import settings


class LibraryScanner:
    """Scans directories for audio files"""
    
    def __init__(self):
        self.supported_formats = set(settings.supported_formats)
    
    def scan_folder(self, folder_path: str) -> List[str]:
        """
        Recursively scan folder for audio files
        
        Returns list of absolute file paths
        """
        audio_files = []
        folder = Path(folder_path)
        
        if not folder.exists():
            logger.error(f"Folder does not exist: {folder_path}")
            return audio_files
        
        if not folder.is_dir():
            logger.error(f"Path is not a directory: {folder_path}")
            return audio_files
        
        logger.info(f"Scanning folder: {folder_path}")
        
        # Walk through all subdirectories
        for root, dirs, files in os.walk(folder):
            for file in files:
                file_path = Path(root) / file
                
                # Check if file has supported extension
                if file_path.suffix.lower() in self.supported_formats:
                    audio_files.append(str(file_path.absolute()))
        
        logger.info(f"Found {len(audio_files)} audio files")
        return audio_files
    
    def get_folder_structure(self, folder_path: str) -> dict:
        """
        Analyze folder structure to detect organization pattern
        
        Returns:
            {
                'type': 'organized' | 'flat',
                'pattern': 'artist/album' | 'album' | 'mixed',
                'files': int
            }
        """
        folder = Path(folder_path)
        
        if not folder.exists():
            return {'type': 'unknown', 'pattern': 'unknown', 'files': 0}
        
        audio_files = self.scan_folder(folder_path)
        
        # Simple heuristic: if we have subdirectories, it's organized
        has_subdirs = any(d.is_dir() for d in folder.iterdir())
        
        return {
            'type': 'organized' if has_subdirs else 'flat',
            'pattern': 'artist/album',  # Assume this structure
            'files': len(audio_files)
        }
