"""WebSocket connection manager"""

from fastapi import WebSocket, WebSocketDisconnect
from typing import List
from loguru import logger
import json


class WebSocketManager:
    """Manages WebSocket connections"""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        """Accept new connection"""
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        """Remove connection"""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")
    
    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """Send message to specific connection"""
        await websocket.send_json(message)
    
    async def broadcast(self, message: dict):
        """Broadcast message to all connections"""
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting to connection: {e}")
    
    async def emit(self, event: str, data: dict):
        """Emit event to all connections"""
        message = {
            "event": event,
            "data": data
        }
        await self.broadcast(message)


# Global instance (will be used by main.py)
ws_manager = WebSocketManager()


# This function will be registered in main.py
async def websocket_endpoint_handler(websocket: WebSocket):
    """WebSocket endpoint"""
    await websocket.accept()
    ws_manager.active_connections.append(websocket)
    logger.info(f"WebSocket connected. Total connections: {len(ws_manager.active_connections)}")
    
    try:
        while True:
            # Receive messages from client
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                
                # Handle different message types
                if message.get("type") == "ping":
                    await ws_manager.send_personal_message(
                        {"type": "pong"},
                        websocket
                    )
                else:
                    logger.warning(f"Unknown message type: {message.get('type')}")
                    
            except json.JSONDecodeError:
                logger.error(f"Invalid JSON received: {data}")
                
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        ws_manager.disconnect(websocket)
