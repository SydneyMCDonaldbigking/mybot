import { useEffect } from 'react';
import { connect, useStore } from './store.ts';
import { Rail } from './components/Rail.tsx';
import { ChatList } from './components/ChatList.tsx';
import { ContactList } from './components/ContactList.tsx';
import { ChatPane } from './components/ChatPane.tsx';
import { AgentCard } from './components/AgentCard.tsx';
import { AgentEditor } from './components/AgentEditor.tsx';
import { GroupCreator } from './components/GroupCreator.tsx';
import { ProfileEditor } from './components/ProfileEditor.tsx';
import { Icon } from './icons.tsx';

export function App() {
  const ready = useStore((s) => s.ready);
  const connected = useStore((s) => s.connected);
  const tab = useStore((s) => s.tab);
  const activeId = useStore((s) => s.activeId);
  const contactId = useStore((s) => s.contactId);
  const modal = useStore((s) => s.modal);

  useEffect(connect, []);

  if (!ready) {
    return (
      <div className="splash">
        <img src="/icon.svg" alt="" width={56} height={56} />
        <span>{connected ? '加载中…' : '正在连接服务…'}</span>
      </div>
    );
  }

  const detailOpen = tab === 'chats' ? !!activeId : !!contactId;

  return (
    <div className={`app ${detailOpen ? 'show-detail' : ''}`}>
      <Rail />
      <aside className="sidebar">{tab === 'chats' ? <ChatList /> : <ContactList />}</aside>
      <main className="main">
        {tab === 'chats' && activeId && <ChatPane key={activeId} id={activeId} />}
        {tab === 'contacts' && contactId && <AgentCard key={contactId} id={contactId} />}
        {!detailOpen && (
          <div className="empty">
            <Icon name={tab === 'chats' ? 'chat' : 'contacts'} size={48} />
            <span>{tab === 'chats' ? '选一个会话开始聊天' : '选一个联系人查看资料'}</span>
          </div>
        )}
      </main>
      {!connected && <div className="offline">与服务断开，正在重连…</div>}
      {modal?.type === 'agent' && <AgentEditor agentId={modal.agentId} />}
      {modal?.type === 'group' && <GroupCreator />}
      {modal?.type === 'profile' && <ProfileEditor />}
    </div>
  );
}
