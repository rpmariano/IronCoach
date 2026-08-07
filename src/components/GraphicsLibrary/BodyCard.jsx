import React, { useState } from 'react';
import './BodyCard.css';

export default function BodyCard({
  title = "Avaliação Corporal",
  date = "03/08/2026",
  weight = "79.25 kg",
  bodyFat = "25.4% Gordura",
  muscleMass = "48.1% Músculo",
  bmi = "IMC 24.7",
  isCollapsed: initialCollapsed = true,
  observations = "Sem observações.",
  metricsList = [
    { name: "Peso", value: "79.25 kg", theme: "purple" },
    { name: "IMC", value: "24.7", theme: "indigo" },
    { name: "Gordura corporal", value: "25.4 %", theme: "pink" },
    { name: "Músculo esquelético", value: "48.1 %", theme: "green" },
    { name: "Massa muscular", value: "56.19 kg", theme: "green" },
    { name: "Água corporal", value: "53.9 %", theme: "blue" },
    { name: "Proteína", value: "17 %", theme: "green" },
    { name: "Massa óssea", value: "2.93 kg", theme: "purple" },
    { name: "Metabolismo basal", value: "1635 kcal", theme: "yellow" },
    { name: "Gordura visceral", value: "8", theme: "purple" },
    { name: "Gordura subcutânea", value: "22.8 %", theme: "green" },
    { name: "Idade metabólica", value: "45 anos", theme: "green" },
    { name: "Massa magra", value: "59.12 kg", theme: "teal" }
  ]
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  return (
    <div className={`body-card-wrapper ${collapsed ? 'collapsed' : 'expanded'}`}>
      
      {/* ================= COLLAPSED STATE ================= */}
      {collapsed && (
        <div className="body-card collapsed-layout" onClick={() => setCollapsed(false)}>
          <div className="bc-left">
            <div className="bc-icon-wrap">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
                <circle cx="12" cy="10" r="3" />
                <path d="M17 18a5 5 0 0 0-10 0" />
              </svg>
            </div>
            
            <div className="bc-content">
              <div className="bc-top">
                <span className="bc-title">{title}</span>
              </div>
              <div className="bc-sub-row">
                <span className="bc-date-sub">{date}</span>
              </div>
            </div>
          </div>

          <div className="bc-middle">
            <div className="bc-macro-pill fat">{bodyFat.replace(' Gordura', ' Fat')}</div>
            <div className="bc-macro-pill musc">{muscleMass.replace(' Músculo', ' Musc')}</div>
            <div className="bc-macro-pill imc">{bmi}</div>
          </div>

          <div className="bc-right">
            <span className="bc-weight-highlight">{weight}</span>
            <button className="bc-chevron-btn" aria-label="Expandir">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: '#516071'}}>
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ================= EXPANDED STATE ================= */}
      {!collapsed && (
        <div className="body-card expanded-layout">
          
          {/* Header - Identical to collapsed state layout for pixel-perfect matching */}
          <div className="bc-exp-header" onClick={() => setCollapsed(true)}>
            <div className="bc-left">
              <div className="bc-icon-wrap">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
                  <circle cx="12" cy="10" r="3" />
                  <path d="M17 18a5 5 0 0 0-10 0" />
                </svg>
              </div>
              <div className="bc-content">
                <div className="bc-top">
                  <span className="bc-title">{title}</span>
                </div>
                <div className="bc-sub-row">
                  <span className="bc-date-sub">{date}</span>
                </div>
              </div>
            </div>
            
            <div className="bc-right">
              <span className="bc-weight-highlight">{weight}</span>
              <button className="bc-chevron-btn" aria-label="Colapsar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: '#516071'}}>
                  <path d="M18 15l-6-6-6 6"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="bc-exp-body">
            
            {/* Metric Pills Row (Top) */}
            <div className="bc-exp-pills-row">
              <div className="bc-exp-pill purple">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="7" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="1.5"/><path d="M12 7V3M9 3h6"/></svg>
                <span>{weight}</span>
              </div>
              <div className="bc-exp-pill pink">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>
                <span>{bodyFat}</span>
              </div>
              <div className="bc-exp-pill green">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/></svg>
                <span>{muscleMass}</span>
              </div>
              <div className="bc-exp-pill blue">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                <span>{bmi}</span>
              </div>
            </div>

            {/* Observations Box */}
            <div className="bc-exp-observations">
              <div className="bc-exp-obs-header">
                <span>Observações</span>
              </div>
              <p className="bc-exp-obs-text">{observations}</p>
            </div>

            {/* All Metrics Grid */}
            <div className="bc-exp-metrics-section">
              <div className="bc-exp-section-title">Todas as métricas</div>
              <div className="bc-exp-metrics-grid">
                {metricsList.map((m, idx) => (
                  <div className="bc-metric-item-card" key={idx}>
                    <div className="bc-metric-item-left">
                      <span className={`bc-metric-bullet ${m.theme}`}></span>
                      <span className="bc-metric-name">{m.name}</span>
                    </div>
                    <span className="bc-metric-val">{m.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions Row: Editar e Eliminar avaliação */}
            <div className="bc-exp-actions-row">
              <button className="bc-exp-btn bc-exp-edit-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                <span>Editar avaliação</span>
              </button>
              <button className="bc-exp-btn bc-exp-delete-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                <span>Eliminar avaliação</span>
              </button>
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
