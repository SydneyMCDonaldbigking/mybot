import { AGENT_KIND_LABEL } from '../../shared/types.ts';
import { api } from '../api.ts';
import { useStore } from '../store.ts';
import { conversationTitle } from '../format.ts';
import { Icon } from '../icons.tsx';
import { MessageList } from './MessageList.tsx';
import { Composer } from './Composer.tsx';
import { InfoPanel } from './InfoPanel.tsx';

export function ChatPane({ id }: { id: string }) {
  const conv = useStore((s) => s.conversations[id]);
  const agents = useStore((s) => s.agents);
  const busy = useStore((s) => s.busy);
  const infoOpen = useStore((s) => s.infoOpen);
  if (!conv) return null;

  const typing = Object.entries(busy)
    .filter(([, convId]) => convId === id)
    .map(([agentId]) => agents[agentId]?.name)
    .filter(Boolean);
  const dmAgent = conv.type === 'dm' ? agents[conv.memberIds[0]] : null;
  const subtitle = typing.length
    ? conv.type === 'dm'
      ? '正在输入…'
      : `${typing.join('、')} 正在输入…`
    : dmAgent
      ? `${AGENT_KIND_LABEL[dmAgent.kind]}${dmAgent.cwd ? ` · ${dmAgent.cwd}` : ''}`
      : `${conv.memberIds.length} 个 agent`;

  return (
    <div className="chat">
      <header className="chat-head">
        <button className="icon-btn back" onClick={() => useStore.setState({ activeId: null })} title="返回">
          <Icon name="back" />
        </button>
        <div className="chat-title">
          <h1>
            {conversationTitle(conv, agents)}
            {conv.type === 'group' && <small>（{conv.memberIds.length + 1}）</small>}
          </h1>
          <span className={typing.length ? 'typing-text' : ''}>{subtitle}</span>
        </div>
        {typing.length > 0 && (
          <button className="stop-btn" onClick={() => api.stop(id)} title="停止回复">
            <Icon name="stop" size={14} /> 停止
          </button>
        )}
        <button
          className={`icon-btn ${infoOpen ? 'active' : ''}`}
          onClick={() => useStore.setState({ infoOpen: !infoOpen })}
          title={conv.type === 'group' ? '群设置' : '聊天信息'}
        >
          <Icon name="more" />
        </button>
      </header>
      <div className="chat-body">
        <div className="chat-main">
          <MessageList id={id} isGroup={conv.type === 'group'} />
          <Composer key={id} conv={conv} />
        </div>
        {infoOpen && <InfoPanel conv={conv} />}
      </div>
    </div>
  );
}
