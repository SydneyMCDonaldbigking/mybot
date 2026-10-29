import { existsSync, statSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { WebSocketServer } from 'ws';
import { AGENT_KIND_LABEL, AGENT_NAME_RE, PERMISSION_LABEL } from '../shared/types.ts';
import type { AgentInput, Bootstrap, Conversation, Profile } from '../shared/types.ts';
import * as db from './db.ts';
import { addClient, broadcast } from './bus.ts';
import * as router from './router.ts';
import { assertSafeArg } from './adapters/process.ts';
import { detectClis } from './adapters/index.ts';

const MAX_AVATAR = 400_000;

class BadRequest extends Error {}
const fail = (msg: string): never => {
  throw new BadRequest(msg);
};

const app = new Hono();

app.onError((err, c) => {
  if (err instanceof BadRequest) return c.json({ error: err.message }, 400);
  console.error(err);
  return c.json({ error: err.message }, 500);
});

// ---------- helpers ----------

function checkAvatar(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') return fail('头像格式不对');
  if (v.length > MAX_AVATAR) return fail('头像图片太大了');
  if (!v.startsWith('data:image/') && !v.startsWith('emoji:')) return fail('头像格式不对');
  return v;
}

function parseAgent(body: any): AgentInput {
  const name = String(body.name ?? '').trim();
  if (!AGENT_NAME_RE.test(name)) fail('名字 1–24 个字，不能有空格和 @');
  if (!(body.kind in AGENT_KIND_LABEL)) fail('不支持的 agent 类型');
  if (!(body.permission in PERMISSION_LABEL)) fail('不支持的权限设置');
  const cwd = String(body.cwd ?? '').trim();
  if (cwd && !(existsSync(cwd) && statSync(cwd).isDirectory())) fail(`工作目录不存在：${cwd}`);
  const model = String(body.model ?? '').trim();
  if (model) assertSafeArg(model, '模型名');
  const command = String(body.command ?? '').trim();
  if (body.kind === 'custom' && !command) fail('自定义 agent 需要填写命令');
  if (body.kind !== 'custom' && /["%^&|<>!\r\n]/.test(command)) fail('可执行文件路径里有不支持的字符');
  return {
    name,
    avatar: checkAvatar(body.avatar),
    kind: body.kind,
    cwd,
    model,
    persona: String(body.persona ?? '').slice(0, 4000),
    permission: body.permission,
    command,
  };
}

function nameTaken(err: unknown) {
  return err instanceof Error && /UNIQUE constraint failed: agents.name/.test(err.message);
}

function conversationOr404(id: string): Conversation {
  return db.getConversation(id) ?? fail('会话不存在');
}

function systemNote(conversationId: string, content: string) {
  const m = db.insertMessage({ conversationId, senderId: 'system', content });
  broadcast({ type: 'message.new', message: m });
}

function pushConversation(id: string) {
  const c = db.getConversation(id);
  if (c) broadcast({ type: 'conversation.upsert', conversation: c });
}

const agentNames = (ids: string[]) => ids.map((id) => db.getAgent(id)?.name).filter(Boolean).join('、');

// ---------- bootstrap / profile ----------

app.get('/api/bootstrap', (c) => {
  const data: Bootstrap = {
    profile: db.getProfile(),
    agents: db.listAgents(),
    conversations: db.listConversations(),
    busy: router.busyMap(),
  };
  return c.json(data);
});

app.put('/api/profile', async (c) => {
  const body = await c.req.json();
  const name = String(body.name ?? '').trim();
  if (!name || name.length > 24) fail('昵称 1–24 个字');
  const profile: Profile = { name, avatar: checkAvatar(body.avatar) };
  db.setProfile(profile);
  broadcast({ type: 'profile', profile });
  return c.json(profile);
});

// ---------- agents ----------

app.get('/api/clis', async (c) => c.json(await detectClis()));

app.post('/api/agents', async (c) => {
  const input = parseAgent(await c.req.json());
  try {
    const agent = db.createAgent(input);
    broadcast({ type: 'agent.upsert', agent });
    return c.json(agent);
  } catch (err) {
    if (nameTaken(err)) fail(`已经有叫「${input.name}」的 agent 了`);
    throw err;
  }
});

app.put('/api/agents/:id', async (c) => {
  const id = c.req.param('id');
  const before = db.getAgent(id) ?? fail('agent 不存在');
  const input = parseAgent(await c.req.json());
  try {
    const agent = db.updateAgent(id, input);
    if (before.kind !== agent.kind) db.clearAgentSessions(id);
    broadcast({ type: 'agent.upsert', agent });
    return c.json(agent);
  } catch (err) {
    if (nameTaken(err)) fail(`已经有叫「${input.name}」的 agent 了`);
    throw err;
  }
});

app.delete('/api/agents/:id', (c) => {
  const id = c.req.param('id');
  router.forgetAgent(id);
  const { dmIds, groupIds } = db.deleteAgent(id);
  broadcast({ type: 'agent.delete', id });
  for (const dm of dmIds) broadcast({ type: 'conversation.delete', id: dm });
  for (const g of groupIds) pushConversation(g);
  return c.json({ ok: true });
});

/** 打开和某个 agent 的私聊，没有就建一个 */
app.post('/api/agents/:id/dm', (c) => {
  const id = c.req.param('id');
  if (!db.getAgent(id)) fail('agent 不存在');
  let conv = db.findDm(id);
  if (!conv) {
    conv = db.createConversation('dm', '', [id]);
    broadcast({ type: 'conversation.upsert', conversation: conv });
  }
  return c.json(conv);
});

// ---------- conversations ----------

app.post('/api/groups', async (c) => {
  const body = await c.req.json();
  const memberIds: string[] = Array.isArray(body.memberIds) ? body.memberIds.filter((id: string) => db.getAgent(id)) : [];
  if (!memberIds.length) fail('至少选一个 agent');
  const title = String(body.title ?? '').trim().slice(0, 40);
  const conv = db.createConversation('group', title, memberIds);
  broadcast({ type: 'conversation.upsert', conversation: conv });
  systemNote(conv.id, `你创建了群聊，邀请了 ${agentNames(memberIds)}。在消息里 @ 谁，谁就会回复。`);
  return c.json(db.getConversation(conv.id));
});

app.put('/api/conversations/:id', async (c) => {
  const conv = conversationOr404(c.req.param('id'));
  const body = await c.req.json();
  if (typeof body.title === 'string' && conv.type === 'group') {
    const title = body.title.trim().slice(0, 40);
    if (title !== conv.title) {
      db.updateConversation(conv.id, { title });
      systemNote(conv.id, title ? `群名改为「${title}」` : '清除了群名');
    }
  }
  if ('avatar' in body) db.updateConversation(conv.id, { avatar: checkAvatar(body.avatar) });
  if (Array.isArray(body.memberIds) && conv.type === 'group') {
    const next: string[] = body.memberIds.filter((id: string) => db.getAgent(id));
    if (!next.length) fail('群里至少要留一个 agent');
    const added = next.filter((id) => !conv.memberIds.includes(id));
    const removed = conv.memberIds.filter((id) => !next.includes(id));
    if (added.length || removed.length) {
      const removedNames = agentNames(removed);
      db.setMembers(conv.id, next);
      if (added.length) systemNote(conv.id, `你邀请 ${agentNames(added)} 加入了群聊`);
      if (removed.length) systemNote(conv.id, `你把 ${removedNames} 移出了群聊`);
    }
  }
  pushConversation(conv.id);
  return c.json(db.getConversation(conv.id));
});

app.delete('/api/conversations/:id', (c) => {
  const conv = conversationOr404(c.req.param('id'));
  router.stopConversation(conv.id);
  db.deleteConversation(conv.id);
  broadcast({ type: 'conversation.delete', id: conv.id });
  return c.json({ ok: true });
});

app.get('/api/conversations/:id/messages', (c) => {
  const conv = conversationOr404(c.req.param('id'));
  const before = c.req.query('before');
  return c.json(db.listMessages(conv.id, before ? Number(before) : undefined));
});

app.post('/api/conversations/:id/messages', async (c) => {
  const conv = conversationOr404(c.req.param('id'));
  const content = String((await c.req.json()).content ?? '').trim();
  if (!content) fail('消息不能为空');
  const msg = db.insertMessage({ conversationId: conv.id, senderId: 'me', content });
  db.markRead(conv.id);
  broadcast({ type: 'message.new', message: msg });
  router.handleUserMessage(conv, msg);
  return c.json(msg);
});

app.post('/api/conversations/:id/read', (c) => {
  const conv = conversationOr404(c.req.param('id'));
  db.markRead(conv.id);
  pushConversation(conv.id);
  return c.json({ ok: true });
});

app.post('/api/conversations/:id/stop', (c) => {
  router.stopConversation(conversationOr404(c.req.param('id')).id);
  return c.json({ ok: true });
});

app.post('/api/conversations/:id/reset', (c) => {
  const conv = conversationOr404(c.req.param('id'));
  router.stopConversation(conv.id);
  db.resetSessions(conv.id);
  systemNote(conv.id, '已清空上下文，之后的对话会开新的 CLI 会话');
  return c.json({ ok: true });
});

// ---------- 启动 ----------

export interface ServerOptions {
  /** 0 表示随便找个空闲端口（桌面版用） */
  port: number;
  host: string;
  dataDir: string;
  /** 打包好的网页目录；不存在时只提供接口（开发时网页由 Vite 提供） */
  distDir: string;
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

export function startServer(opts: ServerOptions): Promise<RunningServer> {
  db.openDb(opts.dataDir);

  const dist = path.resolve(opts.distDir);
  if (existsSync(dist)) {
    app.use('/*', serveStatic({ root: dist }));
    app.get('*', serveStatic({ root: dist, path: 'index.html' }));
  }

  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port: opts.port, hostname: opts.host }, (info: AddressInfo) => {
      const wss = new WebSocketServer({ server: server as any, path: '/ws' });
      wss.on('connection', addClient);
      resolve({
        port: info.port,
        close: async () => {
          await router.stopAll();
          for (const ws of wss.clients) ws.terminate();
          wss.close();
          await new Promise<void>((done) => {
            server.close(() => done());
            (server as any).closeAllConnections?.();
          });
          db.closeDb();
        },
      });
    });
    server.once('error', reject);
  });
}
