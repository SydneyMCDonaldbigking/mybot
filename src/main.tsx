import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { initDesktop } from './desktop.ts';
import './styles.css';

initDesktop();
createRoot(document.getElementById('root')!).render(<App />);
