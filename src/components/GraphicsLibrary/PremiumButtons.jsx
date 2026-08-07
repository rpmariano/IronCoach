import React from 'react';
import './PremiumButtons.css';

export default function PremiumButtons() {
  return (
    <div className="buttons-demo-card">
      <div className="bd-title">Botões de Ação Global</div>
      <div className="bd-row">
        <button className="btn-premium btn-p-gradient">
          <span>Criar Registo</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        
        <button className="btn-premium btn-p-glass">
          <span>Ver Histórico</span>
        </button>
      </div>

      <div className="bd-title">Botões Temáticos de Módulo</div>
      <div className="bd-row">
        <button className="btn-premium btn-p-module nutri">
          <span>Nova Refeição</span>
        </button>
        <button className="btn-premium btn-p-module run">
          <span>Nova Corrida</span>
        </button>
        <button className="btn-premium btn-p-module gym">
          <span>Novo Treino</span>
        </button>
      </div>

      <div className="bd-title">Botões Flutuantes (FAB)</div>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
        <button className="btn-p-fab" aria-label="Adicionar">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
