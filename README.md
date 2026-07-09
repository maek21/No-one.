# No-one.

> Music is the only designer.

A desktop music player where the interface is transformed by your music.

## Features

- Import your local music library with drag & drop
- Dynamic glass UI that responds to the currently playing track
- Audio analysis & real-time visualizations
- Metadata enrichment pipeline (MusicBrainz, Discogs, Last.fm)
- Waveform audio player with crossfade
- Queue management, playlists, and lyrics view

## Download

Pre-built installers are available on the [Releases](https://github.com/anomalyco/no-one/releases) page.

| Platform | Format |
|----------|--------|
| Windows | `.exe` (NSIS installer) |
| macOS   | `.dmg` |
| Linux   | `.AppImage`, `.deb` |

## Building from source

### Prerequisites

- **Node.js** v20+
- **Python** 3.12+
- **pip** dependencies: `pip install -r backend/requirements.txt`

### Setup

```bash
# Install Node dependencies
npm install
cd frontend && npm install && cd ..

# Install Python dependencies
pip install -r backend/requirements.txt
```

### Development

```bash
npm run dev
# Or separately:
npm run dev:backend   # Python FastAPI server (port 8000)
npm run dev:frontend  # Vite dev server (port 5174)
npm run dev:electron  # Full stack with Electron window
```

### Production build

```bash
# Build frontend + backend bundle
npm run build

# Package platform-specific installer
npm run dist:win     # Windows (.exe)
npm run dist:mac     # macOS (.dmg)
npm run dist:linux   # Linux (.AppImage / .deb)
```

The installers will be in the `release/` directory.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + WebGPU (OGL)
- **Backend**: Python 3.12+ / FastAPI
- **Database**: SQLite (via SQLAlchemy async)
- **Desktop**: Electron (with standalone PyInstaller backend)
