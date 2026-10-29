import { useState } from 'react';
import { openConversation, useStore } from '../store.ts';
import { conversationTitle, listTime, preview } from '../format.ts';
import { Icon } from '../icons.tsx';
import { ConversationAvatar } from './ConversationAvatar.tsx';
import { PlusMenu } from './PlusMenu.tsx';

export function ChatList() {
  const conversations = useStore((s) => s.conversations);
  const agents = useStore((s) => s.agents);
  const profile = useStore((s) => s.profile);
  const busy = useStore((s) => s.busy);
  const activeId = useStore((s) => s.activeId);
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const list = Object.values(conversations)
    .filter((c) => !q || conversationTitle(c, agents).toLowerCase().includes(q))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <>
      <div className="sidebar-head">
        <label className="search">
          <Icon name="search" size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索" />
        </label>
        <PlusMenu />
      </div>
      <div className="list">
        {list.map((c) => {
          const typing = Object.entries(busy)
            .filter(([, convId]) => convId === c.id)
            .map(([agentId]) => agents[agentId]?.name)
            .filter(Boolean);
          return (
            <button key={c.id} className={`list-item ${c.id === activeId ? 'active' : ''}`} onClick={() => openConversation(c.id)}>
              <span className="list-avatar">
                <ConversationAvatar conv={c} />
                {c.unread > 0 && <span className="badge">{c.unread > 99 ? '99+' : c.unread}</span>}
              </span>
              <span className="list-text">
                <span className="list-row">
                  <span className="list-title">{conversationTitle(c, agents)}</span>
                  <span className="list-time">{listTime(c.lastMessage?.createdAt ?? c.updatedAt)}</span>
                </span>
                <span className={`list-preview ${typing.length ? 'typing' : ''}`}>
                  {typing.length
                    ? c.type === 'dm'
                      ? '正在输入…'
                      : `${typing.join('、')} 正在输入…`
                    : preview(c.lastMessage, c, agents, profile)}
                </span>
              </span>
            </button>
          );
        })}
        {!list.length && (
          <div className="list-empty">
            {q ? (
              '没有匹配的会话'
            ) : Object.keys(agents).length ? (
              <>
                还没有会话
                <button className="link" onClick={() => useStore.setState({ tab: 'contacts' })}>
                  去通讯录找个 agent 聊聊
                </button>
              </>
            ) : (
              <>
                通讯录还是空的
                <button className="link" onClick={() => useStore.setState({ modal: { type: 'agent' } })}>
                  新建第一个 agent
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
