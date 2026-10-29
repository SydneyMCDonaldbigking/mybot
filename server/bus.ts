import type { WebSocket } from 'ws';
import type { ServerEvent } from '../shared/types.ts';

const clients = new Set<WebSocket>();

export function addClient(ws: WebSocket) {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
}

/** 单用户应用：所有事件发给所有打开的窗口 */
export function broadcast(event: ServerEvent) {
  const data = JSON.stringify(event);
  for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(data);
}
