import React, { useState } from 'react';
import './TimelineCard.css';

export default function TimelineCard({
  time = '20:00',
  category = 'Jantar',
  title = 'Jantar',
  subtitle = '555 kcal',
  isCollapsed: initialCollapsed = false,
  observations = 'Sem observações.',
  macros = {
    pro: '9.8g P',
    car: '72.0g C',
    fat: '25.5g G'
  },
  photos = [
    'https://images.unsplash.com/photo-1506084868230-bb9d95c24759?w=300&q=80',
    'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=300&q=80'
  ],
  items = [
    {
      name: 'Bola De Berlin',
      quantity: 150,
      unit: 'gramas',
      kcal: 555,
      macros: { pro: '9.8g', car: '72.0g', fat: '25.5g' }
    }
  ]
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  return (
    <div className={`v1-card ${collapsed ? 'collapsed' : 'expanded'}`}>
      
      {/* ================= COLLAPSED STATE ================= */}
      {collapsed && (
        <div className="v1-collapsed-content" onClick={() => setCollapsed(false)}>
          <div className="v1-c-left">
            <div className="v1-c-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
                <path d="M7 2v20" />
                <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Z" />
                <path d="M21 15v7" />
              </svg>
            </div>
            <div>
              <div className="v1-c-title">{title}</div>
              <div className="v1-c-sub">{time} • {category}</div>
            </div>
          </div>
          
          <div className="v1-c-middle">
            <div className="v1-c-macro pro">{macros.pro}</div>
            <div className="v1-c-macro car">{macros.car}</div>
            <div className="v1-c-macro fat">{macros.fat}</div>
          </div>

          <div className="v1-c-right">
            <div className="v1-c-kcal">{subtitle}</div>
            <button className="v1-c-chevron-btn" aria-label="Expandir">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ================= EXPANDED STATE ================= */}
      {!collapsed && (
        <div className="v1-expanded-content">
          
          {/* Header - Identical to collapsed state layout for pixel-perfect matching */}
          <div className="v1-exp-header" onClick={() => setCollapsed(true)}>
            <div className="v1-c-left">
              <div className="v1-c-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
                  <path d="M7 2v20" />
                  <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Z" />
                  <path d="M21 15v7" />
                </svg>
              </div>
              <div>
                <div className="v1-c-title">{title}</div>
                <div className="v1-c-sub">{time} • {category}</div>
              </div>
            </div>
            
            <div className="v1-c-right">
              <div className="v1-c-kcal">{subtitle}</div>
              <button className="v1-c-chevron-btn" aria-label="Colapsar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 15l-6-6-6 6"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="v1-exp-body">
            
            {/* Macros Pills Row */}
            <div className="v1-exp-macros-row">
              <div className="v1-exp-macro-pill kcal">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
                <span>{subtitle}</span>
              </div>
              <div className="v1-exp-macro-pill pro">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/><path d="M6.5 12.5 12.5 6.5"/><path d="m11.5 17.5 6-6"/></svg>
                <span>{macros.pro.replace(' P', ' Proteína')}</span>
              </div>
              <div className="v1-exp-macro-pill car">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M2 22 22 2"/><path d="M8 12a4 4 0 0 0 4-4"/><path d="M12 16a4 4 0 0 0 4-4"/><path d="M16 20a4 4 0 0 0 4-4"/><path d="M14 18a4 4 0 0 1-4 4"/><path d="M10 14a4 4 0 0 1-4 4"/><path d="M6 10a4 4 0 0 1-4 4"/><path d="M12 6a4 4 0 0 1-4 4"/></svg>
                <span>{macros.car.replace(' C', ' Hidratos')}</span>
              </div>
              <div className="v1-exp-macro-pill fat">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22a7 7 0 0 0 7-7c0-4.3-7-11-7-11S5 10.7 5 15a7 7 0 0 0 7 7z"/></svg>
                <span>{macros.fat.replace(' G', ' Gordura')}</span>
              </div>
            </div>

            {/* Photos Section */}
            {photos && photos.length > 0 && (
              <div className="v1-exp-photos">
                <div className="v1-exp-photos-header">Fotos</div>
                <div className="v1-exp-photos-grid">
                  {photos.map((url, i) => (
                    <div key={i} className="v1-exp-photo-thumb" style={{ backgroundImage: `url(${url})` }}></div>
                  ))}
                </div>
              </div>
            )}

            {/* Observations Box */}
            <div className="v1-exp-observations">
              <div className="v1-exp-obs-header">
                <span>Observações</span>
              </div>
              <p className="v1-exp-obs-text">{observations}</p>
            </div>

            {/* Items / Food List */}
            <div className="v1-exp-items-list">
              {items.map((item, idx) => (
                <div className="v1-exp-item-card" key={idx}>
                  <div className="v1-exp-item-top">
                    <span className="v1-exp-item-name">{item.name}</span>
                    <button className="v1-exp-item-delete" aria-label="Remover item">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
                      </svg>
                    </button>
                  </div>
                  
                  <div className="v1-exp-item-qty-row">
                    <div className="v1-exp-qty-capsule">
                      <span className="v1-exp-qty-val">{item.quantity}</span>
                      <span className="v1-exp-qty-unit">{item.unit}</span>
                    </div>
                  </div>

                  <div className="v1-exp-item-bottom">
                    <span>{item.kcal} kcal</span>
                    <span className="v1-exp-item-bullet">•</span>
                    <span>P {item.macros.pro}</span>
                    <span className="v1-exp-item-bullet">•</span>
                    <span>H {item.macros.car}</span>
                    <span className="v1-exp-item-bullet">•</span>
                    <span>G {item.macros.fat}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions Row: Editar e Eliminar Refeição */}
            <div className="v1-exp-actions-row">
              <button className="v1-exp-btn v1-exp-edit-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                <span>Editar refeição</span>
              </button>
              <button className="v1-exp-btn v1-exp-delete-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                <span>Eliminar refeição</span>
              </button>
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
