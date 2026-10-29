// 前后端共用的数据结构

export type AgentKind = 'claude' | 'codex' | 'gemini' | 'cursor' | 'grok' | 'antigravity' | 'custom' | 'mock';

/** readonly：需要审批的操作一律拒绝；edit：允许改工作目录里的文件；full：完全放权 */
export type PermissionLevel = 'readonly' | 'edit' | 'full';

export interface Agent {
  id: string;
  name: string;
  /** data URL、"emoji:🤖" 或 null（按名字生成） */
  avatar: string | null;
  kind: AgentKind;
  cwd: string;
  model: string;
  persona: string;
  permission: PermissionLevel;
  /** kind=custom：一条从 stdin 读提示词、往 stdout 写回复的命令；其他 CLI：可执行文件路径（留空用默认命令名） */
  command: string;
  createdAt: number;
}

export type AgentInput = Omit<Agent, 'id' | 'createdAt'>;

export type ConversationType = 'dm' | 'group';

export interface Conversation {
  id: string;
  type: ConversationType;
  title: string;
  avatar: string | null;
  memberIds: string[];
  createdAt: number;
  updatedAt: number;
  lastMessage: Message | null;
  unread: number;
}

export interface ToolEvent {
  id: string;
  name: string;
  detail: string;
  status: 'running' | 'done' | 'error';
}

/** senderId：'me' 是用户本人，'system' 是系统提示，其余是 agent id */
export interface Message {
  id: string;
  seq: number;
  conversationId: string;
  senderId: string;
  content: string;
  status: 'done' | 'streaming' | 'error';
  tools: ToolEvent[];
  hop: number;
  createdAt: number;
}

export interface Profile {
  name: string;
  avatar: string | null;
}

export interface Bootstrap {
  profile: Profile;
  agents: Agent[];
  conversations: Conversation[];
  /** agentId -> 正在回复的会话 id */
  busy: Record<string, string>;
}

export type ServerEvent =
  | { type: 'message.new'; message: Message }
  | { type: 'message.update'; message: Message }
  | { type: 'message.delta'; id: string; conversationId: string; text: string }
  | { type: 'conversation.upsert'; conversation: Conversation }
  | { type: 'conversation.delete'; id: string }
  | { type: 'agent.upsert'; agent: Agent }
  | { type: 'agent.delete'; id: string }
  | { type: 'agent.busy'; id: string; conversationId: string | null }
  | { type: 'profile'; profile: Profile };

export const AGENT_KIND_LABEL: Record<AgentKind, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  gemini: 'Gemini CLI',
  cursor: 'Cursor CLI',
  grok: 'Grok CLI',
  antigravity: 'Antigravity CLI',
  custom: '自定义命令',
  mock: '测试机器人',
};

/** 每种 CLI 默认调用的命令名；custom 和 mock 没有 */
export const DEFAULT_BIN: Partial<Record<AgentKind, string>> = {
  claude: 'claude',
  codex: 'codex',
  gemini: 'gemini',
  cursor: 'cursor-agent',
  grok: 'grok',
  antigravity: 'agy',
};

/** GET /api/clis：kind -> 是否在 PATH 里找到 */
export type CliStatus = Partial<Record<AgentKind, boolean>>;

export const PERMISSION_LABEL: Record<PermissionLevel, string> = {
  readonly: '只读：需要审批的操作会被拒绝',
  edit: '可改文件：自动允许编辑工作目录',
  full: '完全放权：不做任何确认（危险）',
};

/** agent 名字里不能有空白和 @，否则没法 @ 它 */
export const AGENT_NAME_RE = /^[^\s@]{1,24}$/;

export const MENTION_ALL = ['所有人', 'all'];

/**
 * 找出文本里 @ 到的名字。按最长匹配，且名字后面紧跟英文字母/数字时不算，
 * 避免 @Claude2 被识别成 @Claude；中文允许紧跟正文，如「@小明帮我看下」。
 */
export function findMentions(text: string, names: string[]): Set<string> {
  const hit = new Set<string>();
  const sorted = [...names].sort((a, b) => b.length - a.length);
  for (const m of text.matchAll(/@([^\s@]+)/gu)) {
    const token = m[1];
    const name = sorted.find((n) => token.startsWith(n) && !/^[A-Za-z0-9_-]/.test(token.slice(n.length)));
    if (name) hit.add(name);
  }
  return hit;
}
