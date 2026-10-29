import { create } from 'zustand';
import type { Agent, Conversation, Message, Profile, ServerEvent } from '../shared/types.ts';
import { api, PAGE_SIZE } from './api.ts';
import { notifyReply } from './desktop.ts';

export type Modal = null | { type: 'agent'; agentId?: string } | { type: 'group' } | { type: 'profile' };

interface State {
  ready: boolean;
  connected: boolean;
  profile: Profile;
  agents: Record<string, Agent>;
  conversations: Record<string, Conversation>;
  /** 只存打开过的会话 */
  messages: Record<string, Message[]>;
  hasMore: Record<string, boolean>;
  /** agentId -> 正在回复的会话 */
  busy: Record<string, string>;
  tab: 'chats' | 'contacts';
  activeId: string | null;
  contactId: string | null;
  infoOpen: boolean;
  modal: Modal;
}

export const useStore = create<State>()(() => ({
  ready: false,
  connected: false,
  profile: { name: '我', avatar: null },
  agents: {},
  conversations: {},
  messages: {},
  hasMore: {},
  busy: {},
  tab: 'chats',
  activeId: null,
  contactId: null,
  infoOpen: false,
  modal: null,
}));

const set = useStore.setState;
const get = useStore.getState;

const byId = <T extends { id: string }>(list: T[]) => Object.fromEntries(list.map((x) => [x.id, x]));

// ---------- 连接 ----------

let socket: WebSocket | null = null;
let retry = 0;

export function connect() {
  if (socket) return;
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  socket = ws;
  ws.onopen = async () => {
    retry = 0;
    set({ connected: true });
    await refresh();
  };
  ws.onmessage = (e) => applyEvent(JSON.parse(e.data));
  ws.onclose = () => {
    socket = null;
    set({ connected: false });
    setTimeout(connect, Math.min(5000, 500 * 2 ** retry++));
  };
}

/** 连上（或重连）后整体刷新一次，断线期间漏掉的事件就补回来了 */
async function refresh() {
  const b = await api.bootstrap();
  const { activeId } = get();
  set({
    ready: true,
    profile: b.profile,
    agents: byId(b.agents),
    conversations: byId(b.conversations),
    busy: b.busy,
    messages: {},
    hasMore: {},
    activeId: activeId && b.conversations.some((c) => c.id === activeId) ? activeId : null,
  });
  const active = get().activeId;
  if (active) await loadMessages(active);
}

// ---------- 服务端事件 ----------

function putMessage(m: Message) {
  const s = get();
  const patch: Partial<State> = {};
  const list = s.messages[m.conversationId];
  if (list) {
    const i = list.findIndex((x) => x.id === m.id);
    const next = i >= 0 ? list.map((x) => (x.id === m.id ? m : x)) : [...list, m].sort((a, b) => a.seq - b.seq);
    patch.messages = { ...s.messages, [m.conversationId]: next };
  }
  const conv = s.conversations[m.conversationId];
  if (conv && (!conv.lastMessage || conv.lastMessage.seq <= m.seq)) {
    patch.conversations = {
      ...s.conversations,
      [conv.id]: { ...conv, lastMessage: m, updatedAt: Math.max(conv.updatedAt, m.createdAt) },
    };
  }
  set(patch);
}

export function applyEvent(e: ServerEvent) {
  const s = get();
  switch (e.type) {
    case 'message.new':
    case 'message.update':
      putMessage(e.message);
      if (e.message.senderId !== 'me' && e.message.status !== 'streaming' && s.activeId === e.message.conversationId)
        scheduleRead(e.message.conversationId);
      // 只有 agent 回复结束时的那次 update 才通知，系统提示和中间的工具进度不弹
      if (e.type === 'message.update' && e.message.status !== 'streaming' && e.message.senderId !== 'system')
        notifyReply(e.message);
      break;
    case 'message.delta': {
      const list = s.messages[e.conversationId];
      const m = list?.find((x) => x.id === e.id) ?? (s.conversations[e.conversationId]?.lastMessage?.id === e.id ? s.conversations[e.conversationId].lastMessage : null);
      if (m) putMessage({ ...m, content: m.content + e.text });
      break;
    }
    case 'conversation.upsert': {
      const c = e.conversation;
      const local = s.conversations[c.id];
      // 服务端的流式内容可能落后于本地，这时保留本地的 lastMessage
      const keepLocal = local?.lastMessage?.id === c.lastMessage?.id && local?.lastMessage?.status === 'streaming';
      const lastMessage = keepLocal ? local!.lastMessage : c.lastMessage;
      // 正在前台看的会话不显示未读（已读请求马上就会发出去）
      const watching = s.activeId === c.id && document.visibilityState === 'visible' && document.hasFocus();
      set({ conversations: { ...s.conversations, [c.id]: { ...c, lastMessage, unread: watching ? 0 : c.unread } } });
      break;
    }
    case 'conversation.delete': {
      const { [e.id]: _, ...rest } = s.conversations;
      set({ conversations: rest, activeId: s.activeId === e.id ? null : s.activeId });
      break;
    }
    case 'agent.upsert':
      set({ agents: { ...s.agents, [e.agent.id]: e.agent } });
      break;
    case 'agent.delete': {
      const { [e.id]: _, ...rest } = s.agents;
      set({ agents: rest, contactId: s.contactId === e.id ? null : s.contactId });
      break;
    }
    case 'agent.busy': {
      const busy = { ...s.busy };
      if (e.conversationId) busy[e.id] = e.conversationId;
      else delete busy[e.id];
      set({ busy });
      break;
    }
    case 'profile':
      set({ profile: e.profile });
      break;
  }
}

// ---------- 已读 ----------

const readTimers = new Map<string, number>();

/** 窗口在前台、正看着这个会话时才算已读；被别的窗口挡住时留着未读，切回来再标 */
function scheduleRead(id: string) {
  if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
  clearTimeout(readTimers.get(id));
  readTimers.set(
    id,
    window.setTimeout(() => {
      readTimers.delete(id);
      api.read(id).catch(() => {});
    }, 300),
  );
}

function readActiveIfUnread() {
  const { activeId, conversations } = get();
  if (activeId && conversations[activeId]?.unread) scheduleRead(activeId);
}
document.addEventListener('visibilitychange', readActiveIfUnread);
window.addEventListener('focus', readActiveIfUnread);

// ---------- 操作 ----------

export async function loadMessages(id: string, older = false) {
  const current = get().messages[id];
  const before = older && current?.length ? current[0].seq : undefined;
  const page = await api.messages(id, before);
  const merged = older && current ? [...page, ...current] : page;
  set((s) => ({
    messages: { ...s.messages, [id]: merged },
    hasMore: { ...s.hasMore, [id]: page.length === PAGE_SIZE },
  }));
}

export async function openConversation(id: string) {
  set((s) => ({
    activeId: id,
    tab: 'chats',
    infoOpen: false,
    conversations: s.conversations[id] ? { ...s.conversations, [id]: { ...s.conversations[id], unread: 0 } } : s.conversations,
  }));
  if (!get().messages[id]) await loadMessages(id);
  api.read(id).catch(() => {});
}

export async function openDm(agentId: string) {
  const conv =
    Object.values(get().conversations).find((c) => c.type === 'dm' && c.memberIds[0] === agentId) ?? (await api.openDm(agentId));
  set((s) => ({ conversations: { ...s.conversations, [conv.id]: s.conversations[conv.id] ?? conv } }));
  await openConversation(conv.id);
}

export function closeModal() {
  set({ modal: null });
}
