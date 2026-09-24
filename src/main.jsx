import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AppErrorBoundary from './components/shared/AppErrorBoundary';
import { useAppStore } from './store';
import { trackPageVisibility } from './utils/pageVisibility';
import { startAppUpdateWatcher, reloadFresh, resumeParams, isBusy } from './lib/appUpdate';
import { isScreenOpen } from './utils/navigationRestore';
import './styles/globals.css';

window.useAppStore = useAppStore;

// Marca `data-page-hidden` no <html> — o CSS pára os loops enquanto a
// página está em segundo plano (ver globals.css).
trackPageVisibility();

// Depois de um deploy, a app recarrega-se sozinha num momento seguro — ver
// src/lib/appUpdate.js. Só em produção (em dev o id do build é vazio).
// A recarga volta ao separador onde se estava, em vez de cair no Início.
// E nunca com um ecrã de registo ou edição aberto: são ecrãs inteiros, não
// folhas com role="dialog", e o isBusy sozinho não os via — voltar à app a
// meio de um registo, com uma versão nova publicada, recarregava-a e deitava
// o ecrã fora (relatado 2026-09-24).
startAppUpdateWatcher({
  reload: (build) => reloadFresh(build, window.location, resumeParams(useAppStore.getState().activeTab)),
  busy: () => isBusy(document) || isScreenOpen(useAppStore.getState()),
});

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
