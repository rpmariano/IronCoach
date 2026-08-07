import React, { useState } from 'react';
import './RunningCard.css';

export default function RunningCard({
  title = "Treino da tarde",
  tag = "Contínuo",
  distance = "11.32 km",
  time = "1h 05m",
  pace = "5'45\"",
  date = "30 jul 2026",
  isCollapsed: initialCollapsed = true,
  effortValue = 4,
  coachAnalysis = "Hoje fixaste os 11.32 km num pace de 6'19\"/km com um RPE de 4/10 e FC de 142 bpm, o que fica 16s/km mais lento do que a tua média recente de 6'03\"/km, embora alinhado com a tendência geral de melhoria de ~20s/km face ao teu histórico mais antigo. O teu esforço percebido de 4/10 hoje foi significativamente mais baixo do que os 7/10 que registaste no mesmo percurso e pace no treino de ontem (com apenas 1 dia de intervalo), o que mostra uma recuperação neurológica rápida, mas a tua cadência de 146 spm continua criticamente baixa para este ritmo e exige atenção imediata para evitar sobrecarga nas articulações. Com uma média de 39.3 km/semana e corridas de 11.3 km em dias consecutivos (28, 29 e 30 de julho), estás a acumular bastante volume linear, pelo que o risco atual não é a falta de forma, mas sim a ineficiência da passada. Para o próximo treino, faz 8 km a ritmo suave, mas foca-te exclusivamente em manter a cadência acima dos 160 spm, encurtando o passo sem aumentar a velocidade.",
  photos = [
    'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=300&q=80',
    'https://images.unsplash.com/photo-1502224562085-639556652f33?w=300&q=80'
  ]
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  return (
    <div className={`running-card-wrapper ${collapsed ? 'collapsed' : 'expanded'}`}>
      
      {/* ================= COLLAPSED STATE ================= */}
      {collapsed && (
        <div className="running-card collapsed-layout" onClick={() => setCollapsed(false)}>
          <div className="rc-left">
            <div className="rc-icon-wrap">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.1 7.9 12.5 10"/>
                <path d="M17.4 10.1 16 12"/>
                <path d="M2 16a2 2 0 0 0 2 2h13c2.8 0 5-2.2 5-5a2 2 0 0 0-2-2c-.8 0-1.6-.2-2.2-.7l-6.2-4.2c-.4-.3-.9-.2-1.3.1 0 0-.6.8-1.2 1.1a3.5 3.5 0 0 1-4.2.1C4.4 7 3.7 6.3 3.7 6.3A.92.92 0 0 0 2 7Z"/>
                <path d="M2 11c0 1.7 1.3 3 3 3h7"/>
              </svg>
            </div>
            
            <div className="rc-content">
              <div className="rc-top">
                <span className="rc-title">{title}</span>
              </div>
              <div className="rc-sub-row">
                <span className="rc-tag">{tag}</span>
              </div>
            </div>
          </div>

          <div className="rc-middle">
            <div className="rc-macro-pill tempo">{time}</div>
            <div className="rc-macro-pill pace">{pace}</div>
          </div>

          <div className="rc-right">
            <span className="rc-dist">{distance}</span>
            <button className="rc-chevron-btn" aria-label="Expandir">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: '#516071'}}>
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ================= EXPANDED STATE ================= */}
      {!collapsed && (
        <div className="running-card expanded-layout">
          
          {/* Header - Identical to collapsed state layout for pixel-perfect matching */}
          <div className="rc-exp-header" onClick={() => setCollapsed(true)}>
            <div className="rc-left">
              <div className="rc-icon-wrap">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.1 7.9 12.5 10"/>
                  <path d="M17.4 10.1 16 12"/>
                  <path d="M2 16a2 2 0 0 0 2 2h13c2.8 0 5-2.2 5-5a2 2 0 0 0-2-2c-.8 0-1.6-.2-2.2-.7l-6.2-4.2c-.4-.3-.9-.2-1.3.1 0 0-.6.8-1.2 1.1a3.5 3.5 0 0 1-4.2.1C4.4 7 3.7 6.3 3.7 6.3A.92.92 0 0 0 2 7Z"/>
                  <path d="M2 11c0 1.7 1.3 3 3 3h7"/>
                </svg>
              </div>
              <div className="rc-content">
                <div className="rc-top">
                  <span className="rc-title">{title}</span>
                  <span className="rc-tag">{tag}</span>
                </div>
                <div className="rc-sub-row">
                  <span className="rc-date-sub">{date}</span>
                </div>
              </div>
            </div>
            
            <div className="rc-right">
              <span className="rc-dist">{distance}</span>
              <button className="rc-chevron-btn" aria-label="Colapsar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: '#516071'}}>
                  <path d="M18 15l-6-6-6 6"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="rc-exp-body">
            
            {/* Metric Pills Row */}
            <div className="rc-exp-metrics-row">
              <div className="rc-exp-metric-pill dist">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                <span>{distance}</span>
              </div>
              <div className="rc-exp-metric-pill tempo">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>1:11:26</span>
              </div>
              <div className="rc-exp-metric-pill pace">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M6.34 17.66l-1.41 1.41"/><path d="M19.07 4.93l-1.41 1.41"/><path d="m12 12 5-5"/></svg>
                <span>6'19"/km</span>
              </div>
            </div>

            {/* Prints Section */}
            {photos && photos.length > 0 && (
              <div className="rc-exp-photos">
                <div className="rc-exp-photos-header">Prints</div>
                <div className="rc-exp-photos-grid">
                  {photos.map((url, i) => (
                    <div key={i} className="rc-exp-photo-thumb" style={{ backgroundImage: `url(${url})` }}></div>
                  ))}
                </div>
              </div>
            )}

            {/* Esforço Section */}
            <div className="rc-exp-effort">
              <div className="rc-exp-effort-header">Esforço</div>
              <div className="rc-exp-effort-slider">
                {Array.from({ length: 10 }).map((_, idx) => (
                  <div 
                    key={idx} 
                    className={`rc-exp-effort-bar ${idx < effortValue ? 'active' : ''}`}
                  ></div>
                ))}
              </div>
            </div>

            {/* Análise do Coach Box */}
            <div className="rc-exp-coach-box">
              <div className="rc-exp-coach-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
                </svg>
                <span>Análise do Coach</span>
              </div>
              <p className="rc-exp-coach-text">{coachAnalysis}</p>
            </div>

            {/* Actions Row: Editar e Eliminar Treino (iguais aos da nutrição) */}
            <div className="rc-exp-actions-row">
              <button className="rc-exp-btn rc-exp-edit-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                <span>Editar treino</span>
              </button>
              <button className="rc-exp-btn rc-exp-delete-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                <span>Eliminar treino</span>
              </button>
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
