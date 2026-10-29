import { useState } from 'react';
import type { Conversation } from '../../shared/types.ts';
import { AGENT_KIND_LABEL } from '../../shared/types.ts';
import { api } from '../api.ts';
import { useStore } from '../store.ts';
import { Icon } from '../icons.tsx';
import { Avatar } from './Avatar.tsx';

const run = (p: Promise<unknown>) => p.catch((err) => alert((err as Error).message));

export function InfoPanel({ conv }: { conv: Conversation }) {
  return (
    <aside className="info">
      {conv.type === 'dm' ? <DmInfo conv={conv} /> : <GroupInfo conv={conv} />}
      <div className="info-actions">
        <button
          onClick={() =>
            confirm('清空上下文后，agent 会开一个新的 CLI 会话，不再记得之前聊过的内容（聊天记录保留）。继续吗？') &&
            run(api.reset(conv.id))
          }
        >
          <Icon name="reset" size={16} /> 清空上下文
        </button>
        <button
          className="danger"
          onClick={() =>
            confirm(conv.type === 'group' ? '删除群聊和全部聊天记录？' : '删除这个私聊的全部聊天记录？') &&
            run(api.deleteConversation(conv.id))
          }
        >
          <Icon name="trash" size={16} /> {conv.type === 'group' ? '删除群聊' : '删除聊天'}
        </button>
      </div>
    </aside>
  );
}

function DmInfo({ conv }: { conv: Conversation }) {
  const agent = useStore((s) => s.agents[conv.memberIds[0]]);
  if (!agent) return null;
  return (
    <div className="info-section">
      <div className="info-agent">
        <Avatar src={agent.avatar} name={agent.name} size={56} />
        <div>
          <b>{agent.name}</b>
          <span>{AGENT_KIND_LABEL[agent.kind]}</span>
        </div>
      </div>
      <dl className="kv">
        <dt>模型</dt>
        <dd>{agent.model || '默认'}</dd>
        <dt>工作目录</dt>
        <dd>{agent.cwd || '独立工作区'}</dd>
      </dl>
      <button className="btn" onClick={() => useStore.setState({ modal: { type: 'agent', agentId: agent.id } })}>
        <Icon name="edit" size={15} /> 编辑资料
      </button>
    </div>
  );
}

function GroupInfo({ conv }: { conv: Conversation }) {
  const agents = useStore((s) => s.agents);
  const profile = useStore((s) => s.profile);
  const [title, setTitle] = useState(conv.title);
  const [picking, setPicking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);

  const saveTitle = () => title.trim() !== conv.title && run(api.updateConversation(conv.id, { title }));
  const outside = Object.values(agents).filter((a) => !conv.memberIds.includes(a.id));

  return (
    <div className="info-section">
      <label className="field">
        <span>群名</span>
        <input
          value={title}
          placeholder="未命名（显示成员名字）"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
      </label>

      <div className="info-subhead">
        成员（{conv.memberIds.length + 1}）
        {conv.memberIds.length > 1 && (
          <button className="link" onClick={() => setRemoving((v) => !v)}>
            {removing ? '完成' : '移除成员'}
          </button>
        )}
      </div>
      <div className="member-grid">
        <div className="member">
          <Avatar src={profile.avatar} name={profile.name} size={44} />
          <span>{profile.name}</span>
        </div>
        {conv.memberIds.map((id) => {
          const a = agents[id];
          if (!a) return null;
          return (
            <div className="member" key={id}>
              <Avatar src={a.avatar} name={a.name} size={44} />
              <span>{a.name}</span>
              {removing && (
                <button
                  className="member-remove"
                  title={`移出 ${a.name}`}
                  onClick={() => run(api.updateConversation(conv.id, { memberIds: conv.memberIds.filter((m) => m !== id) }))}
                >
                  <Icon name="minus" size={12} />
                </button>
              )}
            </div>
          );
        })}
        {outside.length > 0 && (
          <button className="member add" onClick={() => setPicking((v) => !v)} title="邀请成员">
            <span className="member-plus">
              <Icon name="plus" size={20} />
            </span>
            <span>邀请</span>
          </button>
        )}
      </div>

      {picking && (
        <div className="picker">
          {outside.map((a) => (
            <label key={a.id} className="pick-row">
              <input
                type="checkbox"
                checked={chosen.includes(a.id)}
                onChange={(e) => setChosen((c) => (e.target.checked ? [...c, a.id] : c.filter((x) => x !== a.id)))}
              />
              <Avatar src={a.avatar} name={a.name} size={28} />
              <span>{a.name}</span>
            </label>
          ))}
          <button
            className="btn primary"
            disabled={!chosen.length}
            onClick={() =>
              run(
                api.updateConversation(conv.id, { memberIds: [...conv.memberIds, ...chosen] }).then(() => {
                  setChosen([]);
                  setPicking(false);
                }),
              )
            }
          >
            邀请 {chosen.length || ''} 位
          </button>
        </div>
      )}
    </div>
  );
}
