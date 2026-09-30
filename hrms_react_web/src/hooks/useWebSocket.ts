import { useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function useWebSocket(userId: number | undefined) {
  const connected = useRef(false);

  const connect = useCallback(() => {
    if (!userId || connected.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/api/notifications/ws/${userId}`;

    try {
      ws = new WebSocket(url);

      ws.onopen = () => {
        connected.current = true;
        // Send heartbeat every 30s
        const interval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send('ping');
        }, 30000);
        ws!.addEventListener('close', () => clearInterval(interval));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'notification') {
            toast(data.title || 'New notification', {
              description: data.body || '',
              icon: '🔔',
              duration: 5000,
            } as Parameters<typeof toast>[1] & { description?: string });
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        connected.current = false;
        // Reconnect after 3s
        reconnectTimer = setTimeout(() => connect(), 3000);
      };

      ws.onerror = () => {
        connected.current = false;
      };
    } catch { /* WebSocket not available */ }
  }, [userId]);

  useEffect(() => {
    connect();
    return () => {
      if (ws) { ws.close(); ws = null; }
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      connected.current = false;
    };
  }, [connect]);
}
