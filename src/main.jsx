import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AppErrorBoundary from './components/shared/AppErrorBoundary';
import { useAppStore } from './store';
import { trackPageVisibility } from './utils/pageVisibility';
import { startAppUpdateWatcher } from './lib/appUpdate';
import './styles/globals.css';

window.useAppStore = useAppStore;

// Marca `data-page-hidden` no <html> — o CSS pára os loops enquanto a
// página está em segundo plano (ver globals.css).
trackPageVisibility();

// Depois de um deploy, a app recarrega-se sozinha num momento seguro — ver
// src/lib/appUpdate.js. Só em produção (em dev o id do build é vazio).
startAppUpdateWatcher();

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
