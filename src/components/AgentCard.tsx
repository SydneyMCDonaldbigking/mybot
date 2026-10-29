import { AGENT_KIND_LABEL, PERMISSION_LABEL } from '../../shared/types.ts';
import { api } from '../api.ts';
import { openDm, useStore } from '../store.ts';
import { Icon } from '../icons.tsx';
import { Avatar } from './Avatar.tsx';

export function AgentCard({ id }: { id: string }) {
  const agent = useStore((s) => s.agents[id]);
  if (!agent) return null;

  const remove = () => {
    if (!confirm(`删除「${agent.name}」？和它的私聊记录会一起删掉，群聊里它说过的话保留。`)) return;
    api.deleteAgent(agent.id).catch((err) => alert((err as Error).message));
  };

  return (
    <div className="card-page">
      <header className="chat-head">
        <button className="icon-btn back" onClick={() => useStore.setState({ contactId: null })} title="返回">
          <Icon name="back" />
        </button>
        <div className="chat-title">
          <h1>联系人</h1>
        </div>
      </header>
      <div className="card">
        <div className="card-top">
          <Avatar src={agent.avatar} name={agent.name} size={72} />
          <div>
            <h2>{agent.name}</h2>
            <span className="kind-tag">{AGENT_KIND_LABEL[agent.kind]}</span>
          </div>
        </div>
        <dl className="kv">
          <dt>模型</dt>
          <dd>{agent.model || 'CLI 默认'}</dd>
          <dt>工作目录</dt>
          <dd>{agent.cwd || '独立工作区（data/workspaces）'}</dd>
          <dt>权限</dt>
          <dd>{PERMISSION_LABEL[agent.permission]}</dd>
          {agent.kind === 'custom' ? (
            <>
              <dt>命令</dt>
              <dd>
                <code>{agent.command}</code>
              </dd>
            </>
          ) : (
            agent.command && (
              <>
                <dt>可执行文件</dt>
                <dd>
                  <code>{agent.command}</code>
                </dd>
              </>
            )
          )}
          <dt>设定</dt>
          <dd className="pre">{agent.persona || '—'}</dd>
        </dl>
        <div className="card-actions">
          <button className="btn primary" onClick={() => openDm(agent.id)}>
            <Icon name="chat" size={16} /> 发消息
          </button>
          <button className="btn" onClick={() => useStore.setState({ modal: { type: 'agent', agentId: agent.id } })}>
            <Icon name="edit" size={16} /> 编辑
          </button>
          <button className="btn danger" onClick={remove}>
            <Icon name="trash" size={16} /> 删除
          </button>
        </div>
      </div>
    </div>
  );
}
