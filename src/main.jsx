import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useAppStore } from './store';
import './styles/globals.css';

window.useAppStore = useAppStore;

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
