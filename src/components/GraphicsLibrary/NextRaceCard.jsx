import React from 'react';
import './NextRaceCard.css';

export default function NextRaceCard({
  title = "Corrida do Tejo",
  date = "13 Set 2026",
  location = "Lisboa",
  tag = "estrada",
  daysRemaining = 40,
  progressPercentage = 60
}) {
  return (
    <div className="next-race-card">
      <div className="nrc-glow"></div>
      
      <div className="nrc-left">
        <div className="nrc-header-row">
          <span className="nrc-lbl">Próxima Prova</span>
          <span className="nrc-tag">{tag}</span>
        </div>
        
        <h2 className="nrc-title">{title}</h2>
        
        <div className="nrc-sub">
          <div className="nrc-sub-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '4px'}}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            {date}
          </div>
          <div className="nrc-sub-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '4px'}}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            {location}
          </div>
        </div>

        <div className="nrc-progress-container">
          <div className="nrc-progress-bar">
            <div className="nrc-progress-fill" style={{ width: `${progressPercentage}%` }}></div>
            <div className="nrc-runner" style={{ left: `${progressPercentage}%` }}></div>
          </div>
          <div className="nrc-progress-labels">
            <span>Início do Plano</span>
            <span style={{ color: '#d97706', fontWeight: 800 }}>{daysRemaining} dias restantes</span>
            <span>Meta (Prova)</span>
          </div>
        </div>
      </div>

      <div className="nrc-right">
        <span className="nrc-days">{daysRemaining}</span>
        <span className="nrc-days-lbl">dias rest.</span>
      </div>
    </div>
  );
}
