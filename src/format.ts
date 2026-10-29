import type { Agent, Conversation, Message, Profile } from '../shared/types.ts';

const pad = (n: number) => String(n).padStart(2, '0');

/** 会话列表里的时间：今天显示时分，昨天显示「昨天」，更早显示日期 */
export function listTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= startOfToday) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (ts >= startOfToday - 86_400_000) return '昨天';
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** 聊天里的时间分隔条 */
export function dividerTime(ts: number): string {
  const d = new Date(ts);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const day = listTime(ts);
  return day.includes(':') ? hm : `${day} ${hm}`;
}

export function conversationTitle(c: Conversation, agents: Record<string, Agent>): string {
  if (c.type === 'dm') return agents[c.memberIds[0]]?.name ?? '已删除的 agent';
  if (c.title) return c.title;
  const names = c.memberIds.map((id) => agents[id]?.name).filter(Boolean);
  return names.length > 3 ? `${names.slice(0, 3).join('、')}…` : names.join('、') || '群聊';
}

export function senderName(id: string, agents: Record<string, Agent>, profile: Profile): string {
  if (id === 'me') return profile.name;
  if (id === 'system') return '系统';
  return agents[id]?.name ?? '已删除的 agent';
}

/** 会话列表里最后一条消息的预览 */
export function preview(m: Message | null, c: Conversation, agents: Record<string, Agent>, profile: Profile): string {
  if (!m) return '';
  const text = m.content
    .replace(/```[\s\S]*?```/g, '[代码]')
    .replace(/[#>*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const body = m.status === 'streaming' && !text ? '正在输入…' : text || (m.tools.length ? '[工具调用]' : '');
  if (m.senderId === 'system' || c.type === 'dm') return body;
  return `${senderName(m.senderId, agents, profile)}: ${body}`;
}
