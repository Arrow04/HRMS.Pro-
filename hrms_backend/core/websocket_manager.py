"""WebSocket connection manager for real-time notifications."""
from __future__ import annotations

import json
from typing import Dict, Set
from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections per user."""

    def __init__(self):
        self._connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self._connections:
            self._connections[user_id] = set()
        self._connections[user_id].add(websocket)

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self._connections:
            self._connections[user_id].discard(websocket)
            if not self._connections[user_id]:
                del self._connections[user_id]

    async def send_to_user(self, user_id: int, message: dict):
        if user_id in self._connections:
            dead = []
            for ws in self._connections[user_id]:
                try:
                    await ws.send_json(message)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self._connections[user_id].discard(ws)

    async def broadcast(self, message: dict):
        dead = []
        for user_id, connections in self._connections.items():
            for ws in connections:
                try:
                    await ws.send_json(message)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self._connections[user_id].discard(ws)

    @property
    def active_count(self) -> int:
        return sum(len(c) for c in self._connections.values())


manager = ConnectionManager()
