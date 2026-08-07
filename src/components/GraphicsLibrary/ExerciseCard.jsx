import React, { useState } from 'react';
import './ExerciseCard.css';

export default function ExerciseCard({
  title = "Treino funcional",
  tag = "Treino",
  date = "05/08/2026",
  category = "Musculação",
  exercisesCount = 1,
  setsCount = 1,
  totalWeight = "60 kg",
  duration = "45 min",
  isCollapsed: initialCollapsed = true,
  effortRating = "—",
  observations = "Sem observações.",
  photos = [
    'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300&q=80'
  ],
  metrics = {
    durationVal: "37:57",
    calories: "175 kcal",
    bpmAvg: "100 bpm méd",
    bpmMax: "139 bpm máx"
  }
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  return (
    <div className={`exercise-card-wrapper ${collapsed ? 'collapsed' : 'expanded'}`}>
      
      {/* ================= COLLAPSED STATE ================= */}
      {collapsed && (
        <div className="exercise-card collapsed-layout" onClick={() => setCollapsed(false)}>
          <div className="ec-left">
            <div className="ec-icon-wrap">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6.5 6.5 11 11"/>
                <path d="m21 21-1-1"/>
                <path d="m3 3 1 1"/>
                <path d="m18 22 4-4"/>
                <path d="m2 6 4-4"/>
                <path d="m3 10 7-7"/>
                <path d="m14 21 7-7"/>
                <path d="M6.5 12.5 12.5 6.5"/>
                <path d="m11.5 17.5 6-6"/>
              </svg>
            </div>
            
            <div className="ec-content">
              <div className="ec-top">
                <span className="ec-title">{title}</span>
              </div>
              <div className="ec-sub-row">
                <span className="ec-tag">{tag}</span>
              </div>
            </div>
          </div>

          <div className="ec-middle">
            <div className="ec-macro-pill count">{exercisesCount} {exercisesCount === 1 ? 'Exercício' : 'Exercícios'}</div>
            <div className="ec-macro-pill sets">{setsCount} {setsCount === 1 ? 'Série' : 'Séries'}</div>
            <div className="ec-macro-pill weight">{totalWeight}</div>
          </div>

          <div className="ec-right">
            <span className="ec-duration-highlight">{duration}</span>
            <button className="ec-chevron-btn" aria-label="Expandir">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: '#516071'}}>
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ================= EXPANDED STATE ================= */}
      {!collapsed && (
        <div className="exercise-card expanded-layout">
          
          {/* Header - Identical layout for seamless expand toggle */}
          <div className="ec-exp-header" onClick={() => setCollapsed(true)}>
            <div className="ec-left">
              <div className="ec-icon-wrap">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6.5 6.5 11 11"/>
                  <path d="m21 21-1-1"/>
                  <path d="m3 3 1 1"/>
                  <path d="m18 22 4-4"/>
                  <path d="m2 6 4-4"/>
                  <path d="m3 10 7-7"/>
                  <path d="m14 21 7-7"/>
                  <path d="M6.5 12.5 12.5 6.5"/>
                  <path d="m11.5 17.5 6-6"/>
                </svg>
              </div>
              <div className="ec-content">
                <div className="ec-top">
                  <span className="ec-title">{title}</span>
                  <span className="ec-tag">{tag}</span>
                </div>
                <div className="ec-sub-row">
                  <span className="ec-date-sub">{date} • {category}</span>
                </div>
              </div>
            </div>
            
            <div className="ec-right">
              <span className="ec-duration-highlight">{duration}</span>
              <button className="ec-chevron-btn" aria-label="Colapsar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: '#516071'}}>
                  <path d="M18 15l-6-6-6 6"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="ec-exp-body">
            
            {/* Metric Pills Row (Top) */}
            <div className="ec-exp-pills-row">
              <div className="ec-exp-pill purple">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>{metrics.durationVal}</span>
              </div>
              <div className="ec-exp-pill orange">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
                <span>{metrics.calories}</span>
              </div>
              <div className="ec-exp-pill pink">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                <span>{metrics.bpmAvg}</span>
              </div>
              <div className="ec-exp-pill red">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                <span>{metrics.bpmMax}</span>
              </div>
            </div>

            {/* Esforço Section (rating box) */}
            <div className="ec-exp-effort-container">
              <span className="ec-exp-effort-title">Esforço (1-10)</span>
              <div className="ec-exp-effort-val-box">
                <span>{effortRating}</span>
              </div>
            </div>

            {/* Prints Section */}
            {photos && photos.length > 0 && (
              <div className="ec-exp-photos">
                <div className="ec-exp-photos-header">Prints do treino</div>
                <div className="ec-exp-photos-grid">
                  {photos.map((url, i) => (
                    <div key={i} className="ec-exp-photo-thumb" style={{ backgroundImage: `url(${url})` }}></div>
                  ))}
                </div>
              </div>
            )}

            {/* Observations Box */}
            <div className="ec-exp-observations">
              <div className="ec-exp-obs-header">
                <span>Observações</span>
              </div>
              <p className="ec-exp-obs-text">{observations}</p>
            </div>

            {/* Actions Row: Editar e Eliminar Treino (iguais aos de corrida/nutrição) */}
            <div className="ec-exp-actions-row">
              <button className="ec-exp-btn ec-exp-edit-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                <span>Editar treino</span>
              </button>
              <button className="ec-exp-btn ec-exp-delete-btn">
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
