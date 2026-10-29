import { useStore } from '../store.ts';
import { Icon } from '../icons.tsx';
import { Avatar } from './Avatar.tsx';

/** 桌面端是左侧竖栏，手机上变成底部标签栏 */
export function Rail() {
  const profile = useStore((s) => s.profile);
  const tab = useStore((s) => s.tab);
  const unread = useStore((s) => Object.values(s.conversations).reduce((n, c) => n + c.unread, 0));

  return (
    <nav className="rail">
      <button className="rail-me" title="编辑我的资料" onClick={() => useStore.setState({ modal: { type: 'profile' } })}>
        <Avatar src={profile.avatar} name={profile.name} size={36} />
      </button>
      <button className={`rail-tab ${tab === 'chats' ? 'active' : ''}`} onClick={() => useStore.setState({ tab: 'chats' })}>
        <Icon name="chat" size={22} />
        <span className="rail-label">聊天</span>
        {unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      <button className={`rail-tab ${tab === 'contacts' ? 'active' : ''}`} onClick={() => useStore.setState({ tab: 'contacts' })}>
        <Icon name="contacts" size={22} />
        <span className="rail-label">通讯录</span>
      </button>
    </nav>
  );
}
