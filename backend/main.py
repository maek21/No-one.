"""
NO-ONE Backend Server
Main FastAPI application entry point.
"""

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from loguru import logger
import sys
from pathlib import Path

from api import library, playback, import_api, settings, lyrics, analysis, playlists
from websocket.manager import ws_manager, websocket_endpoint_handler
from services.audio import AudioPlayer
from db.database import init_database


# Global instances
audio_player = AudioPlayer()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown logic"""
    logger.info("🎵 NO-ONE Backend starting...")
    
    # Initialize database
    await init_database()
    logger.info("✓ Database initialized")
    
    # Initialize audio player
    await audio_player.initialize()
    logger.info("✓ Audio player initialized")
    
    yield
    
    # Cleanup
    logger.info("🎵 NO-ONE Backend shutting down...")
    await audio_player.cleanup()
    logger.info("✓ Cleanup complete")


# Create FastAPI app
app = FastAPI(
    title="NO-ONE API",
    description="Backend for NO-ONE music player",
    version="0.1.0",
    lifespan=lifespan,
    websocket_allowed_origins=["*"],
)

# CORS middleware for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://localhost:5173", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for artwork cache
cache_dir = Path(__file__).parent / "cache"
if cache_dir.exists():
    app.mount("/cache", StaticFiles(directory=str(cache_dir)), name="cache")

# Include routers
app.include_router(library.router, prefix="/api/library", tags=["library"])
app.include_router(playback.router, prefix="/api/playback", tags=["playback"])
app.include_router(import_api.router, prefix="/api/import", tags=["import"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(lyrics.router, prefix="/api/lyrics", tags=["lyrics"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["analysis"])
app.include_router(playlists.router, prefix="/api/playlists", tags=["playlists"])

# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket_endpoint_handler(websocket)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "app": "NO-ONE Backend",
        "version": "0.1.0",
        "status": "running"
    }


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "audio_player": audio_player.is_initialized(),
        "websocket_clients": len(ws_manager.active_connections)
    }


if __name__ == "__main__":
    import uvicorn
    
    # Configure logger
    logger.remove()
    logger.add(
        sys.stderr,
        format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level>",
        level="INFO"
    )
    
    logger.info("Starting NO-ONE Backend Server")
    logger.info("Frontend should connect to http://localhost:8000")
    
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        reload=False,
        log_level="info"
    )
