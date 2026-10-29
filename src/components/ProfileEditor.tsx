import { useState } from 'react';
import { api } from '../api.ts';
import { closeModal, useStore } from '../store.ts';
import { AvatarPicker } from './Avatar.tsx';
import { Modal } from './Modal.tsx';

export function ProfileEditor() {
  const profile = useStore((s) => s.profile);
  const [form, setForm] = useState(profile);
  const [error, setError] = useState('');

  const save = async () => {
    try {
      await api.saveProfile({ name: form.name.trim(), avatar: form.avatar });
      closeModal();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Modal
      title="我的资料"
      footer={
        <>
          {error && <span className="form-error">{error}</span>}
          <button className="btn" onClick={closeModal}>
            取消
          </button>
          <button className="btn primary" onClick={save}>
            保存
          </button>
        </>
      }
    >
      <AvatarPicker value={form.avatar} name={form.name} onChange={(avatar) => setForm({ ...form, avatar })} />
      <label className="field">
        <span>昵称</span>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        <small>agent 在群里看到的你的名字</small>
      </label>
    </Modal>
  );
}
