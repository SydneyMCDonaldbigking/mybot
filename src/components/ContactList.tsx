import { useState } from 'react';
import { AGENT_KIND_LABEL } from '../../shared/types.ts';
import { useStore } from '../store.ts';
import { Icon } from '../icons.tsx';
import { Avatar } from './Avatar.tsx';
import { PlusMenu } from './PlusMenu.tsx';

export function ContactList() {
  const agents = useStore((s) => s.agents);
  const busy = useStore((s) => s.busy);
  const contactId = useStore((s) => s.contactId);
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const list = Object.values(agents)
    .filter((a) => !q || a.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

  return (
    <>
      <div className="sidebar-head">
        <label className="search">
          <Icon name="search" size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索联系人" />
        </label>
        <PlusMenu />
      </div>
      <div className="list">
        <button className="list-item compact" onClick={() => useStore.setState({ modal: { type: 'agent' } })}>
          <span className="list-icon accent">
            <Icon name="bot" size={20} />
          </span>
          <span className="list-title">新建 Agent</span>
        </button>
        <button className="list-item compact" onClick={() => useStore.setState({ modal: { type: 'group' } })}>
          <span className="list-icon">
            <Icon name="group" size={20} />
          </span>
          <span className="list-title">发起群聊</span>
        </button>
        <div className="list-section">Agent（{list.length}）</div>
        {list.map((a) => (
          <button
            key={a.id}
            className={`list-item compact ${a.id === contactId ? 'active' : ''}`}
            onClick={() => useStore.setState({ contactId: a.id })}
          >
            <Avatar src={a.avatar} name={a.name} size={36} busy={!!busy[a.id]} />
            <span className="list-text">
              <span className="list-title">{a.name}</span>
              <span className="list-preview">{AGENT_KIND_LABEL[a.kind]}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
