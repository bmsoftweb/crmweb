import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AceiteProposta } from './components/AceiteProposta';
import './index.css';
import { instalarSelecaoAoFocar } from './utils/selecaoAoFocar';

instalarSelecaoAoFocar();

// Link público de aceite da proposta (/p/<token>): tela própria, sem login
const aceite = /^\/p\/([A-Za-z0-9_-]+)\/?$/.exec(window.location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {aceite ? <AceiteProposta token={aceite[1]} /> : <App />}
  </StrictMode>,
);
