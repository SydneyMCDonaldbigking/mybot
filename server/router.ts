import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { AGENT_KIND_LABEL, MENTION_ALL, findMentions } from '../shared/types.ts';
import type { Agent, Conversation, Message, ToolEvent } from '../shared/types.ts';
import { adapters } from './adapters/index.ts';
import type { AdapterEvent } from './adapters/index.ts';
import * as db from './db.ts';
import { broadcast } from './bus.ts';

/** agent 之间连续互相 @ 的最大轮数，超过就停下等人类发话 */
const MAX_HOPS = Number(process.env.MAX_HOPS ?? 4);
/** 不能续会话的 CLI，每次带上最近多少条聊天记录 */
const HISTORY_FOR_STATELESS = 20;

interface Job {
  agentId: string;
  conversationId: string;
  hop: number;
}

const queues = new Map<string, Job[]>();
const running = new Map<string, { conversationId: string; abort: AbortController }>();
/** 已经提示过「接力暂停」的会话，用户再发话后清掉 */
const hopNoticeSent = new Set<string>();

export function busyMap(): Record<string, string> {
  return Object.fromEntries([...running].map(([agentId, r]) => [agentId, r.conversationId]));
}

export function handleUserMessage(conv: Conversation, msg: Message) {
  hopNoticeSent.delete(conv.id);
  const targets = conv.type === 'dm' ? conv.memberIds : mentionedAgents(conv, msg.content, null);
  for (const agentId of targets) enqueue({ agentId, conversationId: conv.id, hop: 0 });
}

/** 停掉某个会话里正在跑和排队的 agent */
export function stopConversation(conversationId: string) {
  for (const q of queues.values()) removeWhere(q, (j) => j.conversationId === conversationId);
  for (const r of running.values()) if (r.conversationId === conversationId) r.abort.abort();
}

/** 退出前停掉所有 agent 进程，等它们把中断状态写回数据库（最多等几秒） */
export async function stopAll(timeoutMs = 3000) {
  queues.clear();
  for (const r of running.values()) r.abort.abort();
  const until = Date.now() + timeoutMs;
  while (running.size && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
}

export function forgetAgent(agentId: string) {
  queues.delete(agentId);
  running.get(agentId)?.abort.abort();
}

function removeWhere<T>(arr: T[], pred: (x: T) => boolean) {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) arr.splice(i, 1);
}

function mentionedAgents(conv: Conversation, text: string, selfId: string | null): string[] {
  const members = conv.memberIds.map((id) => db.getAgent(id)).filter((a): a is Agent => !!a);
  const hits = findMentions(text, [...members.map((a) => a.name), ...MENTION_ALL]);
  const all = MENTION_ALL.some((n) => hits.has(n));
  return members.filter((a) => a.id !== selfId && (all || hits.has(a.name))).map((a) => a.id);
}

function enqueue(job: Job) {
  const q = queues.get(job.agentId) ?? [];
  queues.set(job.agentId, q);
  // 同一个会话已经在排队了就不用再排：轮到它时会把所有新消息一起带上
  const existing = q.find((j) => j.conversationId === job.conversationId);
  if (existing) existing.hop = Math.min(existing.hop, job.hop);
  else q.push(job);
  void pump(job.agentId);
}

/** 每个 agent 同一时间只跑一轮，避免两个进程同时改同一个工作目录 */
async function pump(agentId: string) {
  if (running.has(agentId)) return;
  const job = queues.get(agentId)?.shift();
  if (!job) return;
  const abort = new AbortController();
  running.set(agentId, { conversationId: job.conversationId, abort });
  broadcast({ type: 'agent.busy', id: agentId, conversationId: job.conversationId });
  try {
    await runJob(job, abort.signal);
  } catch (err) {
    console.error('[router]', err);
  } finally {
    running.delete(agentId);
    broadcast({ type: 'agent.busy', id: agentId, conversationId: null });
    void pump(agentId);
  }
}

function workspaceFor(agent: Agent): string {
  if (agent.cwd) return agent.cwd;
  const dir = path.join(db.dataDir(), 'workspaces', agent.id);
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function runJob(job: Job, signal: AbortSignal) {
  const agent = db.getAgent(job.agentId);
  const conv = db.getConversation(job.conversationId);
  if (!agent || !conv || !conv.memberIds.includes(agent.id)) return;

  const adapter = adapters[agent.kind];
  const session = db.getSession(agent.id, conv.id);
  const fresh = db.messagesAfter(conv.id, session.lastSeq, agent.id);
  if (!fresh.length) return;

  const sessionId = adapter.keepsSession ? session.cliSessionId : null;
  const prompt = buildPrompt(agent, conv, fresh, !sessionId, adapter.keepsSession);

  const reply = db.insertMessage({ conversationId: conv.id, senderId: agent.id, content: '', status: 'streaming', hop: job.hop });
  broadcast({ type: 'message.new', message: reply });

  let newSessionId = session.cliSessionId;
  let received = false; // CLI 已经收到这轮提示词，下次就不用重发这些消息
  let finalText = '';
  let pendingBreak = false;
  const errors: string[] = [];
  const tools = new Map<string, ToolEvent>();

  let saveTimer: NodeJS.Timeout | null = null;
  const scheduleSave = () => {
    saveTimer ??= setTimeout(() => {
      saveTimer = null;
      db.saveMessage(reply);
    }, 500);
  };
  const pushUpdate = () => {
    db.saveMessage(reply);
    broadcast({ type: 'message.update', message: reply });
  };

  const emit = (e: AdapterEvent) => {
    received = true;
    switch (e.type) {
      case 'session':
        newSessionId = e.id;
        break;
      case 'block':
        if (reply.content) pendingBreak = true;
        break;
      case 'text': {
        const text = pendingBreak ? `\n\n${e.text}` : e.text;
        pendingBreak = false;
        reply.content += text;
        broadcast({ type: 'message.delta', id: reply.id, conversationId: conv.id, text });
        scheduleSave();
        break;
      }
      case 'tool':
        if (!tools.has(e.id)) {
          const t: ToolEvent = { id: e.id, name: e.name, detail: e.detail, status: 'running' };
          tools.set(e.id, t);
          reply.tools.push(t);
          pushUpdate();
        }
        break;
      case 'tool_done': {
        const t = tools.get(e.id);
        if (t) {
          t.status = e.ok ? 'done' : 'error';
          pushUpdate();
        }
        break;
      }
      case 'final':
        finalText = e.text;
        break;
      case 'error':
        errors.push(e.message);
        break;
    }
  };

  try {
    await adapter.run({ agent: { ...agent, cwd: workspaceFor(agent) }, prompt, sessionId, signal, emit });
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }
  if (saveTimer) clearTimeout(saveTimer);

  if (!reply.content.trim() && finalText) reply.content = finalText;
  for (const t of reply.tools) if (t.status === 'running') t.status = errors.length ? 'error' : 'done';
  if (errors.length) {
    reply.status = 'error';
    reply.content = `${reply.content ? `${reply.content}\n\n` : ''}⚠️ ${[...new Set(errors)].join('\n')}`;
  } else {
    reply.status = 'done';
    if (!reply.content.trim()) reply.content = '（没有文字回复）';
  }
  pushUpdate();

  db.saveSession(agent.id, conv.id, {
    cliSessionId: adapter.keepsSession ? newSessionId : null,
    lastSeq: received ? fresh[fresh.length - 1].seq : session.lastSeq,
  });
  // 未读数以服务端为准
  const updated = db.getConversation(conv.id);
  if (updated) broadcast({ type: 'conversation.upsert', conversation: updated });

  if (conv.type === 'group' && reply.status === 'done') relayMentions(agent, conv.id, reply, job.hop);
}

/** agent 回复里 @ 了别的成员，就把话递过去；超过跳数上限就停 */
function relayMentions(agent: Agent, conversationId: string, reply: Message, hop: number) {
  const conv = db.getConversation(conversationId);
  if (!conv) return;
  // 代码块里的 @（装饰器、邮箱等）不算
  const text = reply.content.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const targets = mentionedAgents(conv, text, agent.id);
  if (!targets.length) return;
  if (hop + 1 > MAX_HOPS) {
    if (hopNoticeSent.has(conversationId)) return;
    hopNoticeSent.add(conversationId);
    const note = db.insertMessage({
      conversationId,
      senderId: 'system',
      content: `agent 之间已经连续接力 ${MAX_HOPS} 轮，先暂停。要继续的话直接 @ 他们。`,
    });
    broadcast({ type: 'message.new', message: note });
    return;
  }
  for (const agentId of targets) enqueue({ agentId, conversationId, hop: hop + 1 });
}

function buildPrompt(agent: Agent, conv: Conversation, fresh: Message[], firstTurn: boolean, keepsSession: boolean): string {
  const profile = db.getProfile();
  const nameOf = (id: string) => (id === 'me' ? profile.name : (db.getAgent(id)?.name ?? '已删除的成员'));
  const parts: string[] = [];

  if (firstTurn) {
    if (conv.type === 'dm') {
      parts.push(`[你在一个聊天应用里和用户「${profile.name}」一对一聊天，你的名字是「${agent.name}」。直接回复内容即可。]`);
    } else {
      const roster = conv.memberIds
        .map((id) => db.getAgent(id))
        .filter((a): a is Agent => !!a)
        .map((a) => (a.id === agent.id ? `${a.name}（你）` : `${a.name}（${AGENT_KIND_LABEL[a.kind]}）`));
      parts.push(
        `[你在一个聊天应用的群聊「${conv.title || '未命名群聊'}」里，你的名字是「${agent.name}」。]`,
        `[群成员：${profile.name}（用户，人类）、${roster.join('、')}]`,
        `[规则：只有被 @ 时你才会收到消息，你上次发言之后群里的新消息会一起发给你，格式是「名字: 内容」。` +
          `需要别的成员接手或回答时，在回复里写 @名字；不需要时不要 @ 别人，免得来回空转。直接写回复内容，不要加名字前缀。]`,
      );
    }
    if (agent.persona.trim()) parts.push(`[你的设定]\n${agent.persona.trim()}`);
  }

  if (keepsSession) {
    if (conv.type === 'dm') parts.push(fresh.map((m) => m.content).join('\n\n'));
    else parts.push(`[群聊新消息]\n${fresh.map((m) => `${nameOf(m.senderId)}: ${m.content}`).join('\n')}`);
  } else {
    const history = db
      .listMessages(conv.id, undefined, HISTORY_FOR_STATELESS + 1)
      .filter((m) => m.senderId !== 'system' && m.status === 'done');
    parts.push(`[最近的聊天记录]\n${history.map((m) => `${nameOf(m.senderId)}: ${m.content}`).join('\n')}`);
  }
  return parts.join('\n\n');
}
