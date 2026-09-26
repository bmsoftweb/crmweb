import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AceiteProposta } from './components/AceiteProposta';
import { SuportePublico } from './components/SuportePublico';
import './index.css';
import { instalarSelecaoAoFocar } from './utils/selecaoAoFocar';

instalarSelecaoAoFocar();

// Link público de aceite da proposta (/p/<token>): tela própria, sem login
const aceite = /^\/p\/([A-Za-z0-9_-]+)\/?$/.exec(window.location.pathname);
// Suporte pelo site (painel do widget.js): /suporte?e=<empresa>&cnpj=<opcional>
const suporte = /^\/suporte\/?$/.test(window.location.pathname) ? new URLSearchParams(window.location.search) : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {aceite ? (
      <AceiteProposta token={aceite[1]} />
    ) : suporte ? (
      <SuportePublico empresa={suporte.get('e') || '1'} cnpj={suporte.get('cnpj') || ''} />
    ) : (
      <App />
    )}
  </StrictMode>,
);
