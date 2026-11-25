import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AppErrorBoundary from './components/shared/AppErrorBoundary';
import { useAppStore } from './store';
import { trackPageVisibility } from './utils/pageVisibility';
import { startAppUpdateWatcher, reloadFresh, resumeParams, isBusy } from './lib/appUpdate';
import { isScreenOpen } from './utils/navigationRestore';
import { startDailySummaryRefresh } from './utils/dailySummaryRefresh';
import './styles/globals.css';
import './styles/v2.css';
import { bootPhase } from './utils/bootTrace';
import { applyDesignV2Class } from './utils/designV2';

// O JavaScript da app chegou e corre (utils/bootTrace.js).
bootPhase('main');

window.useAppStore = useAppStore;

// O Design v2 (utils/designV2.js): a classe no <html> antes do primeiro render, para não piscar o
// design antigo. Uma leitura do localStorage e um classList — não espera por nada, não toca no
// logo do index.html (#boot-splash tem o seu próprio CSS, que o v2.css não mexe).
applyDesignV2Class();

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

// O cartão da Carol no Início refaz-se quando entra um treino — senão,
// o resumo da meia-noite falava da corrida de hoje como estando por fazer.
startDailySummaryRefresh(useAppStore);

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
