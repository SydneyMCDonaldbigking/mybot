import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.ts';
import { Icon } from '../icons.tsx';

export function PlusMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current?.contains(e.target as Node) || setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const pick = (modal: { type: 'group' } | { type: 'agent' }) => {
    setOpen(false);
    useStore.setState({ modal });
  };

  return (
    <div className="plus-menu" ref={ref}>
      <button className="icon-btn" title="新建" onClick={() => setOpen((v) => !v)}>
        <Icon name="plus" size={18} />
      </button>
      {open && (
        <div className="menu">
          <button onClick={() => pick({ type: 'group' })}>
            <Icon name="group" size={16} /> 发起群聊
          </button>
          <button onClick={() => pick({ type: 'agent' })}>
            <Icon name="bot" size={16} /> 新建 Agent
          </button>
        </div>
      )}
    </div>
  );
}
