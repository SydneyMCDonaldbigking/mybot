import type { Agent, AgentInput, Bootstrap, CliStatus, Conversation, Message, Profile } from '../shared/types.ts';

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `请求失败（${res.status}）`);
  return data as T;
}

export const api = {
  bootstrap: () => req<Bootstrap>('GET', '/api/bootstrap'),
  clis: () => req<CliStatus>('GET', '/api/clis'),
  saveProfile: (p: Profile) => req<Profile>('PUT', '/api/profile', p),
  createAgent: (a: AgentInput) => req<Agent>('POST', '/api/agents', a),
  updateAgent: (id: string, a: AgentInput) => req<Agent>('PUT', `/api/agents/${id}`, a),
  deleteAgent: (id: string) => req('DELETE', `/api/agents/${id}`),
  openDm: (agentId: string) => req<Conversation>('POST', `/api/agents/${agentId}/dm`),
  createGroup: (title: string, memberIds: string[]) => req<Conversation>('POST', '/api/groups', { title, memberIds }),
  updateConversation: (id: string, patch: { title?: string; memberIds?: string[] }) =>
    req<Conversation>('PUT', `/api/conversations/${id}`, patch),
  deleteConversation: (id: string) => req('DELETE', `/api/conversations/${id}`),
  messages: (id: string, before?: number) =>
    req<Message[]>('GET', `/api/conversations/${id}/messages${before ? `?before=${before}` : ''}`),
  send: (id: string, content: string) => req<Message>('POST', `/api/conversations/${id}/messages`, { content }),
  read: (id: string) => req('POST', `/api/conversations/${id}/read`),
  stop: (id: string) => req('POST', `/api/conversations/${id}/stop`),
  reset: (id: string) => req('POST', `/api/conversations/${id}/reset`),
};

export const PAGE_SIZE = 50;
