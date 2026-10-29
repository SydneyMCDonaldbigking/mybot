import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type {
  Agent,
  AgentInput,
  Conversation,
  ConversationType,
  Message,
  Profile,
  ToolEvent,
} from '../shared/types.ts';

export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? 'data');
mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'chat.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    avatar TEXT,
    kind TEXT NOT NULL,
    cwd TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    persona TEXT NOT NULL DEFAULT '',
    permission TEXT NOT NULL DEFAULT 'readonly',
    command TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    avatar TEXT,
    last_read_seq INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS members (
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (conversation_id, agent_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL,
    tools TEXT NOT NULL DEFAULT '[]',
    hop INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (conversation_id, seq);
  CREATE TABLE IF NOT EXISTS agent_sessions (
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    cli_session_id TEXT,
    last_seq INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (agent_id, conversation_id)
  );
`);

// 上次进程退出时还在输出的消息，标成中断
db.prepare(`UPDATE messages SET status = 'error', content = content || ? WHERE status = 'streaming'`).run(
  '\n\n（服务重启，回复中断）',
);

type Row = Record<string, any>;

const toAgent = (r: Row): Agent => ({
  id: r.id,
  name: r.name,
  avatar: r.avatar ?? null,
  kind: r.kind,
  cwd: r.cwd,
  model: r.model,
  persona: r.persona,
  permission: r.permission,
  command: r.command,
  createdAt: r.created_at,
});

const toMessage = (r: Row): Message => ({
  id: r.id,
  seq: r.seq,
  conversationId: r.conversation_id,
  senderId: r.sender_id,
  content: r.content,
  status: r.status,
  tools: JSON.parse(r.tools) as ToolEvent[],
  hop: r.hop,
  createdAt: r.created_at,
});

// ---------- profile ----------

export function getProfile(): Profile {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'profile'`).get() as Row | undefined;
  return row ? JSON.parse(row.value) : { name: '我', avatar: null };
}

export function setProfile(p: Profile) {
  db.prepare(`INSERT INTO settings (key, value) VALUES ('profile', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(
    JSON.stringify(p),
  );
}

// ---------- agents ----------

export function listAgents(): Agent[] {
  return (db.prepare(`SELECT * FROM agents ORDER BY created_at`).all() as Row[]).map(toAgent);
}

export function getAgent(id: string): Agent | undefined {
  const r = db.prepare(`SELECT * FROM agents WHERE id = ?`).get(id) as Row | undefined;
  return r && toAgent(r);
}

export function createAgent(input: AgentInput): Agent {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO agents (id, name, avatar, kind, cwd, model, persona, permission, command, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.name, input.avatar, input.kind, input.cwd, input.model, input.persona, input.permission, input.command, Date.now());
  return getAgent(id)!;
}

export function updateAgent(id: string, input: AgentInput): Agent {
  db.prepare(
    `UPDATE agents SET name = ?, avatar = ?, kind = ?, cwd = ?, model = ?, persona = ?, permission = ?, command = ? WHERE id = ?`,
  ).run(input.name, input.avatar, input.kind, input.cwd, input.model, input.persona, input.permission, input.command, id);
  return getAgent(id)!;
}

/** 删除 agent，连带删掉和它的私聊；返回被删的私聊 id 和受影响的群 id */
export function deleteAgent(id: string): { dmIds: string[]; groupIds: string[] } {
  const convs = db
    .prepare(`SELECT c.id, c.type FROM conversations c JOIN members m ON m.conversation_id = c.id WHERE m.agent_id = ?`)
    .all(id) as Row[];
  const dmIds = convs.filter((c) => c.type === 'dm').map((c) => c.id as string);
  const groupIds = convs.filter((c) => c.type === 'group').map((c) => c.id as string);
  for (const dm of dmIds) db.prepare(`DELETE FROM conversations WHERE id = ?`).run(dm);
  db.prepare(`DELETE FROM agents WHERE id = ?`).run(id);
  return { dmIds, groupIds };
}

// ---------- conversations ----------

function memberIds(conversationId: string): string[] {
  return (
    db.prepare(`SELECT agent_id FROM members WHERE conversation_id = ? ORDER BY joined_at, rowid`).all(conversationId) as Row[]
  ).map((r) => r.agent_id);
}

function lastMessage(conversationId: string): Message | null {
  const r = db.prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq DESC LIMIT 1`).get(conversationId) as
    | Row
    | undefined;
  return r ? toMessage(r) : null;
}

function toConversation(r: Row): Conversation {
  const unread = db
    .prepare(`SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND seq > ? AND sender_id <> 'me' AND status <> 'streaming'`)
    .get(r.id, r.last_read_seq) as Row;
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    avatar: r.avatar ?? null,
    memberIds: memberIds(r.id),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastMessage: lastMessage(r.id),
    unread: unread.n,
  };
}

export function listConversations(): Conversation[] {
  return (db.prepare(`SELECT * FROM conversations ORDER BY updated_at DESC`).all() as Row[]).map(toConversation);
}

export function getConversation(id: string): Conversation | undefined {
  const r = db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(id) as Row | undefined;
  return r && toConversation(r);
}

export function createConversation(type: ConversationType, title: string, agentIds: string[]): Conversation {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(`INSERT INTO conversations (id, type, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`).run(id, type, title, now, now);
  setMembers(id, agentIds);
  return getConversation(id)!;
}

export function findDm(agentId: string): Conversation | undefined {
  const r = db
    .prepare(`SELECT c.* FROM conversations c JOIN members m ON m.conversation_id = c.id WHERE c.type = 'dm' AND m.agent_id = ?`)
    .get(agentId) as Row | undefined;
  return r && toConversation(r);
}

export function updateConversation(id: string, patch: { title?: string; avatar?: string | null }) {
  if (patch.title !== undefined) db.prepare(`UPDATE conversations SET title = ? WHERE id = ?`).run(patch.title, id);
  if (patch.avatar !== undefined) db.prepare(`UPDATE conversations SET avatar = ? WHERE id = ?`).run(patch.avatar, id);
}

export function setMembers(conversationId: string, agentIds: string[]) {
  const current = new Set(memberIds(conversationId));
  const next = new Set(agentIds);
  const now = Date.now();
  for (const id of current) if (!next.has(id)) db.prepare(`DELETE FROM members WHERE conversation_id = ? AND agent_id = ?`).run(conversationId, id);
  for (const id of next) {
    if (current.has(id)) continue;
    db.prepare(`INSERT INTO members (conversation_id, agent_id, joined_at) VALUES (?, ?, ?)`).run(conversationId, id, now);
    // 新成员只从入群这一刻开始看消息
    db.prepare(
      `INSERT INTO agent_sessions (agent_id, conversation_id, last_seq) VALUES (?, ?, (SELECT COALESCE(MAX(seq), 0) FROM messages WHERE conversation_id = ?))
       ON CONFLICT DO NOTHING`,
    ).run(id, conversationId, conversationId);
  }
}

export function deleteConversation(id: string) {
  db.prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
}

export function touchConversation(id: string, at = Date.now()) {
  db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(at, id);
}

export function markRead(id: string) {
  db.prepare(`UPDATE conversations SET last_read_seq = (SELECT COALESCE(MAX(seq), 0) FROM messages WHERE conversation_id = ?) WHERE id = ?`).run(
    id,
    id,
  );
}

// ---------- messages ----------

export function insertMessage(m: {
  conversationId: string;
  senderId: string;
  content: string;
  status?: Message['status'];
  hop?: number;
}): Message {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO messages (id, conversation_id, sender_id, content, status, hop, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, m.conversationId, m.senderId, m.content, m.status ?? 'done', m.hop ?? 0, now);
  touchConversation(m.conversationId, now);
  return getMessage(id)!;
}

export function getMessage(id: string): Message | undefined {
  const r = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as Row | undefined;
  return r && toMessage(r);
}

export function saveMessage(m: Message) {
  db.prepare(`UPDATE messages SET content = ?, status = ?, tools = ? WHERE id = ?`).run(m.content, m.status, JSON.stringify(m.tools), m.id);
}

export function listMessages(conversationId: string, beforeSeq?: number, limit = 50): Message[] {
  const rows = db
    .prepare(`SELECT * FROM messages WHERE conversation_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?`)
    .all(conversationId, beforeSeq ?? Number.MAX_SAFE_INTEGER, limit) as Row[];
  return rows.map(toMessage).reverse();
}

/** 某个 agent 上次发言之后，会话里别人说的话 */
export function messagesAfter(conversationId: string, afterSeq: number, excludeSender: string): Message[] {
  return (
    db
      .prepare(
        `SELECT * FROM messages WHERE conversation_id = ? AND seq > ? AND sender_id NOT IN (?, 'system') AND status <> 'streaming' ORDER BY seq`,
      )
      .all(conversationId, afterSeq, excludeSender) as Row[]
  ).map(toMessage);
}

// ---------- agent sessions ----------

export interface AgentSession {
  cliSessionId: string | null;
  lastSeq: number;
}

export function getSession(agentId: string, conversationId: string): AgentSession {
  const r = db.prepare(`SELECT * FROM agent_sessions WHERE agent_id = ? AND conversation_id = ?`).get(agentId, conversationId) as
    | Row
    | undefined;
  return { cliSessionId: r?.cli_session_id ?? null, lastSeq: r?.last_seq ?? 0 };
}

export function saveSession(agentId: string, conversationId: string, s: AgentSession) {
  db.prepare(
    `INSERT INTO agent_sessions (agent_id, conversation_id, cli_session_id, last_seq) VALUES (?, ?, ?, ?)
     ON CONFLICT(agent_id, conversation_id) DO UPDATE SET cli_session_id = excluded.cli_session_id, last_seq = excluded.last_seq`,
  ).run(agentId, conversationId, s.cliSessionId, s.lastSeq);
}

/** 换了 CLI 类型后，旧的会话 id 对新 CLI 没意义 */
export function clearAgentSessions(agentId: string) {
  db.prepare(`UPDATE agent_sessions SET cli_session_id = NULL WHERE agent_id = ?`).run(agentId);
}

/** 清空上下文：丢掉 CLI 会话，之后从最新一条消息重新开始 */
export function resetSessions(conversationId: string) {
  db.prepare(
    `UPDATE agent_sessions SET cli_session_id = NULL, last_seq = (SELECT COALESCE(MAX(seq), 0) FROM messages WHERE conversation_id = ?)
     WHERE conversation_id = ?`,
  ).run(conversationId, conversationId);
}
