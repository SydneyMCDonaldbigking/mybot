import { useEffect, useState } from 'react';
import { AGENT_KIND_LABEL, AGENT_NAME_RE, DEFAULT_BIN, PERMISSION_LABEL } from '../../shared/types.ts';
import type { AgentInput, AgentKind, CliStatus, PermissionLevel } from '../../shared/types.ts';
import { api } from '../api.ts';
import { closeModal, useStore } from '../store.ts';
import { AvatarPicker } from './Avatar.tsx';
import { Modal } from './Modal.tsx';

const KIND_ORDER: AgentKind[] = ['claude', 'codex', 'gemini', 'cursor', 'grok', 'antigravity', 'custom', 'mock'];

const KIND_HINT: Record<AgentKind, string> = {
  claude: '调用本机的 claude 命令（无头模式），能接着上一轮会话聊',
  codex: '调用本机的 codex exec，能接着上一轮会话聊',
  gemini: '调用本机的 gemini 命令（stream-json），能接着上一轮会话聊',
  cursor: '调用本机的 cursor-agent（-p 模式），能接着上一轮会话聊',
  grok: '调用本机的 grok 命令（单轮模式 + 续会话）',
  antigravity: '调用本机的 agy 命令（print 模式），能接着上一轮会话聊',
  custom: '执行你填的命令：提示词从 stdin 传入，stdout 当作回复；每次会带上最近 20 条聊天记录',
  mock: '不调用任何模型，只回显消息。用来试界面和群里的 @ 接力',
};

const MODEL_PLACEHOLDER: Partial<Record<AgentKind, string>> = {
  claude: '如 sonnet、opus，留空用 CLI 默认',
  codex: '如 gpt-5-codex，留空用 CLI 默认',
  gemini: '如 pro、flash，留空用 CLI 默认',
  cursor: '如 gpt-5、sonnet-4-thinking，留空用 Auto',
  grok: '如 grok-4.7，留空用 CLI 默认',
  antigravity: '留空用 CLI 默认',
};

const EMPTY: AgentInput = { name: '', avatar: null, kind: 'mock', cwd: '', model: '', persona: '', permission: 'readonly', command: '' };

export function AgentEditor({ agentId }: { agentId?: string }) {
  const editing = useStore((s) => (agentId ? s.agents[agentId] : undefined));
  const [form, setForm] = useState<AgentInput>(() => (editing ? { ...editing } : EMPTY));
  const [clis, setClis] = useState<CliStatus>({});
  const [kindTouched, setKindTouched] = useState(!!editing);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.clis().then((status) => {
      setClis(status);
      // 新建时默认选第一个本机已安装的 CLI
      if (!kindTouched) {
        const first = KIND_ORDER.find((k) => status[k]);
        if (first) setForm((f) => ({ ...f, kind: first }));
      }
    });
  }, []);

  const set = <K extends keyof AgentInput>(key: K, value: AgentInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const isCli = form.kind in DEFAULT_BIN;

  const save = async () => {
    if (!AGENT_NAME_RE.test(form.name.trim())) return setError('名字 1–24 个字，不能有空格和 @');
    setSaving(true);
    setError('');
    try {
      const agent = editing ? await api.updateAgent(editing.id, form) : await api.createAgent(form);
      closeModal();
      if (!editing) useStore.setState({ tab: 'contacts', contactId: agent.id });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? '编辑 Agent' : '新建 Agent'}
      footer={
        <>
          {error && <span className="form-error">{error}</span>}
          <button className="btn" onClick={closeModal}>
            取消
          </button>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      <AvatarPicker value={form.avatar} name={form.name} onChange={(v) => set('avatar', v)} />

      <label className="field">
        <span>名字</span>
        <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="群里 @ 它时用的名字，如 小克" autoFocus />
      </label>

      <label className="field">
        <span>类型</span>
        <select
          value={form.kind}
          onChange={(e) => {
            setKindTouched(true);
            set('kind', e.target.value as AgentKind);
          }}
        >
          {KIND_ORDER.map((k) => (
            <option key={k} value={k}>
              {AGENT_KIND_LABEL[k]}
              {k in DEFAULT_BIN && clis[k] === false ? '（本机未找到）' : ''}
            </option>
          ))}
        </select>
        <small>{KIND_HINT[form.kind]}</small>
      </label>

      {form.kind !== 'mock' && (
        <>
          {form.kind === 'custom' ? (
            <label className="field">
              <span>命令</span>
              <input value={form.command} onChange={(e) => set('command', e.target.value)} placeholder="例如：python my_bot.py" />
            </label>
          ) : (
            <label className="field">
              <span>可执行文件（可选）</span>
              <input
                value={form.command}
                onChange={(e) => set('command', e.target.value)}
                placeholder={`留空用 PATH 里的 ${DEFAULT_BIN[form.kind]}`}
              />
            </label>
          )}

          <label className="field">
            <span>工作目录</span>
            <input value={form.cwd} onChange={(e) => set('cwd', e.target.value)} placeholder="如 D:\projects\my-app；留空用它自己的独立工作区" />
          </label>

          {isCli && (
            <label className="field">
              <span>模型</span>
              <input value={form.model} onChange={(e) => set('model', e.target.value)} placeholder={MODEL_PLACEHOLDER[form.kind]} />
            </label>
          )}

          {isCli && (
            <fieldset className="field">
              <span>权限</span>
              {(Object.keys(PERMISSION_LABEL) as PermissionLevel[]).map((p) => (
                <label key={p} className={`radio ${p === 'full' ? 'warn' : ''}`}>
                  <input type="radio" checked={form.permission === p} onChange={() => set('permission', p)} />
                  {PERMISSION_LABEL[p]}
                </label>
              ))}
            </fieldset>
          )}
        </>
      )}

      <label className="field">
        <span>设定</span>
        <textarea
          rows={3}
          value={form.persona}
          onChange={(e) => set('persona', e.target.value)}
          placeholder="它是谁、负责什么，例如：你是前端工程师，负责 React 代码，回答简洁。"
        />
      </label>
    </Modal>
  );
}
