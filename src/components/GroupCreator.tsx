import { useState } from 'react';
import { AGENT_KIND_LABEL } from '../../shared/types.ts';
import { api } from '../api.ts';
import { closeModal, openConversation, useStore } from '../store.ts';
import { Avatar } from './Avatar.tsx';
import { Modal } from './Modal.tsx';

export function GroupCreator() {
  const agents = Object.values(useStore((s) => s.agents));
  const [title, setTitle] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState('');

  const create = async () => {
    try {
      const conv = await api.createGroup(title, chosen);
      closeModal();
      await openConversation(conv.id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Modal
      title="发起群聊"
      footer={
        <>
          {error && <span className="form-error">{error}</span>}
          <button className="btn" onClick={closeModal}>
            取消
          </button>
          <button className="btn primary" disabled={!chosen.length} onClick={create}>
            创建{chosen.length ? `（${chosen.length}）` : ''}
          </button>
        </>
      }
    >
      <label className="field">
        <span>群名（可选）</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如 前端小分队" autoFocus />
      </label>
      <div className="field">
        <span>选择成员</span>
        {agents.length ? (
          <div className="picker">
            {agents.map((a) => (
              <label key={a.id} className="pick-row">
                <input
                  type="checkbox"
                  checked={chosen.includes(a.id)}
                  onChange={(e) => setChosen((c) => (e.target.checked ? [...c, a.id] : c.filter((x) => x !== a.id)))}
                />
                <Avatar src={a.avatar} name={a.name} size={32} />
                <span>{a.name}</span>
                <small>{AGENT_KIND_LABEL[a.kind]}</small>
              </label>
            ))}
          </div>
        ) : (
          <small>通讯录里还没有 agent，先新建几个吧。</small>
        )}
      </div>
    </Modal>
  );
}
