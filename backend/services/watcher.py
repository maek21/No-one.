"""File system watcher using Watchdog — live library updates"""

import os
import threading
from pathlib import Path
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from loguru import logger
from config import settings


class LibraryFileHandler(FileSystemEventHandler):
    """Handles filesystem events for the music library"""

    def __init__(self, import_callback, delete_callback):
        self.import_callback = import_callback
        self.delete_callback = delete_callback
        self._processed = set()
        self.supported_extensions = set(settings.supported_formats)

    def _is_audio(self, path: str) -> bool:
        return Path(path).suffix.lower() in self.supported_extensions

    def on_created(self, event):
        if event.is_directory or not self._is_audio(event.src_path):
            return
        # Debounce: skip if we just processed this path
        if event.src_path in self._processed:
            return
        self._processed.add(event.src_path)
        logger.info(f"[Watcher] New file detected: {event.src_path}")
        self.import_callback(event.src_path)

    def on_deleted(self, event):
        if event.is_directory or not self._is_audio(event.src_path):
            return
        logger.info(f"[Watcher] File deleted: {event.src_path}")
        self.delete_callback(event.src_path)

    def on_modified(self, event):
        if event.is_directory or not self._is_audio(event.src_path):
            return
        # Re-import on modification (metadata might have changed)
        if event.src_path in self._processed:
            self._processed.discard(event.src_path)
        logger.info(f"[Watcher] File modified: {event.src_path}")
        self.import_callback(event.src_path)


class LibraryWatcher:
    """Watches library directories for changes and updates the database"""

    def __init__(self):
        self._observer: Optional[Observer] = None
        self._handler: Optional[LibraryFileHandler] = None
        self._watch_path: Optional[str] = None
        self._thread: Optional[threading.Thread] = None

    def watch(self, path: str, import_callback, delete_callback):
        """Start watching a directory for changes.

        Args:
            path: Directory path to watch
            import_callback: Called with file_path when a new/modified file is detected
            delete_callback: Called with file_path when a file is deleted
        """
        if self._observer and self._observer.is_alive():
            logger.warning(f"[Watcher] Already watching {self._watch_path}, stopping first")
            self.stop()

        if not os.path.isdir(path):
            logger.error(f"[Watcher] Not a directory: {path}")
            return

        self._watch_path = path
        self._handler = LibraryFileHandler(import_callback, delete_callback)
        self._observer = Observer()

        # Watch recursively
        self._observer.schedule(self._handler, path, recursive=True)
        self._observer.start()

        logger.info(f"[Watcher] Started watching: {path}")

    def stop(self):
        """Stop watching"""
        if self._observer and self._observer.is_alive():
            self._observer.stop()
            self._observer.join(timeout=5)
            logger.info(f"[Watcher] Stopped watching: {self._watch_path}")
        self._observer = None
        self._handler = None
        self._watch_path = None

    @property
    def is_watching(self) -> bool:
        return self._observer is not None and self._observer.is_alive()

    @property
    def current_path(self) -> Optional[str]:
        return self._watch_path


# Global instance
library_watcher = LibraryWatcher()
