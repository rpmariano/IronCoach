import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AppErrorBoundary from './components/shared/AppErrorBoundary';
import { useAppStore } from './store';
import { trackPageVisibility } from './utils/pageVisibility';
import './styles/globals.css';

window.useAppStore = useAppStore;

// Marca `data-page-hidden` no <html> — o CSS pára os loops enquanto a
// página está em segundo plano (ver globals.css).
trackPageVisibility();

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
