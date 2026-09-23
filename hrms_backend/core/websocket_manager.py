"""WebSocket connection manager with Redis pub/sub for multi-worker scaling."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Dict, Set
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections per user with Redis pub/sub for cross-worker messaging."""

    def __init__(self):
        self._connections: Dict[int, Set[WebSocket]] = {}
        self._pubsub = None
        self._listener_task = None

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self._connections:
            self._connections[user_id] = set()
        self._connections[user_id].add(websocket)
        # Start Redis listener if not already running
        await self._ensure_listener()

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self._connections:
            self._connections[user_id].discard(websocket)
            if not self._connections[user_id]:
                del self._connections[user_id]

    async def send_to_user(self, user_id: int, message: dict):
        # First try local connections
        if user_id in self._connections:
            dead = []
            for ws in self._connections[user_id]:
                try:
                    await ws.send_json(message)
                    return  # Delivered locally
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self._connections[user_id].discard(ws)

        # If no local connection, publish to Redis for other workers
        try:
            from core.cache import get_redis
            rc = get_redis()
            if rc:
                channel = f"ws:user:{user_id}"
                rc.publish(channel, json.dumps(message))
        except Exception:
            pass

    async def broadcast(self, message: dict):
        # Send to all local connections
        dead = []
        for uid, connections in self._connections.items():
            for ws in connections:
                try:
                    await ws.send_json(message)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self._connections[uid].discard(ws)
        # Also publish to Redis for other workers
        try:
            from core.cache import get_redis
            rc = get_redis()
            if rc:
                rc.publish("ws:broadcast", json.dumps(message))
        except Exception:
            pass

    async def _ensure_listener(self):
        """Start Redis pub/sub listener if not already running."""
        if self._listener_task and not self._listener_task.done():
            return
        try:
            from core.cache import get_redis
            rc = get_redis()
            if not rc:
                return
            self._pubsub = rc.pubsub()
            # Subscribe to broadcast channel
            self._pubsub.subscribe("ws:broadcast")
            self._listener_task = asyncio.create_task(self._listen())
        except Exception:
            pass

    async def _listen(self):
        """Listen for Redis pub/sub messages and forward to local connections."""
        try:
            while True:
                message = self._pubsub.get_message(timeout=1.0)
                if message and message["type"] == "message":
                    data = json.loads(message["data"])
                    # Broadcast to all local connections
                    for uid, connections in self._connections.items():
                        for ws in connections:
                            try:
                                await ws.send_json(data)
                            except Exception:
                                pass
                await asyncio.sleep(0.01)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Redis listener error: {e}")

    @property
    def active_count(self) -> int:
        return sum(len(c) for c in self._connections.values())


manager = ConnectionManager()
