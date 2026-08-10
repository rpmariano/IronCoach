import React, { useState, useRef, useEffect } from 'react';
import { Bell, BellOff, Droplets, Clock } from 'lucide-react';
import { useAppStore } from '../../store';
import './HydrationOptionA.css';

export default function HydrationOptionA({ 
  currentMl = 1800, 
  goalMl = 2500,
  onLogWater,
  profile
}) {
  const { snoozeWaterReminder } = useAppStore();
  const [showBellMenu, setShowBellMenu] = useState(false);
  const menuRef = useRef(null);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowBellMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const percentage = goalMl > 0 ? Math.min(100, Math.round((currentMl / goalMl) * 100)) : 0;
  const remaining = Math.max(0, goalMl - currentMl);

  const handleAddWater = (e, amount) => {
    e.preventDefault();
    e.stopPropagation();
    if (onLogWater) {
      onLogWater(amount);
    }
  };

  const handleToggleBell = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowBellMenu(prev => !prev);
  };

  const handleSnooze = (e, scope) => {
    e.preventDefault();
    e.stopPropagation();
    if (profile?.id) {
      snoozeWaterReminder(profile.id, scope);
    }
    setShowBellMenu(false);
  };

  // Determine if reminders are muted for today
  const isMutedToday = profile?.water_reminder_muted_date === new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' });

  return (
    <div className="hydro-nrc-card">
      <div className="hydro-nrc-glow"></div>
      
      <div className="hydro-nrc-left">
        <div className="hydro-nrc-header-row">
          <span className="hydro-nrc-lbl">Hidratação Diária</span>
          <span className="hydro-nrc-tag">hoje</span>
        </div>
        
        <h2 className="hydro-nrc-title">Mantém-te hidratado 💧</h2>
        
        <div className="hydro-nrc-sub">
          <div className="hydro-nrc-sub-item hydro-bell-wrapper" ref={menuRef}>
            <div className="hydro-bell-btn" onClick={handleToggleBell}>
              {isMutedToday ? <BellOff size={14} /> : <Bell size={14} />}
              <span>{isMutedToday ? 'Silenciado' : 'Lembretes ativos'}</span>
            </div>
            
            {showBellMenu && (
              <div className="hydro-bell-menu">
                <button className="hydro-bell-item" onClick={(e) => handleSnooze(e, 'next')}>
                  Ocultar próximo alarme
                </button>
                <button className="hydro-bell-item" onClick={(e) => handleSnooze(e, 'today')}>
                  Desativar para hoje
                </button>
              </div>
            )}
          </div>
          
          <div className="hydro-nrc-sub-item">
            <Droplets size={14} style={{ marginRight: '4px', color: '#0ea5e9' }} />
            Faltam: {remaining}ml
          </div>
        </div>

        <div className="hydro-nrc-progress-container">
          <div className="hydro-nrc-progress-bar">
            <div className="hydro-nrc-progress-fill" style={{ width: `${percentage}%` }}></div>
            <div className="hydro-nrc-runner" style={{ left: `${percentage}%` }}>
              <Droplets size={12} color="#0ea5e9" />
            </div>
          </div>
          <div className="hydro-nrc-progress-labels">
            <span>Início</span>
            <span style={{ color: '#0ea5e9', fontWeight: 800 }}>{percentage}%</span>
            <span>Meta</span>
          </div>
        </div>
        
        <div className="hydro-nrc-actions">
          <button className="hydro-nrc-btn" onClick={(e) => handleAddWater(e, 200)}>+ 200 ml</button>
          <button className="hydro-nrc-btn" onClick={(e) => handleAddWater(e, 250)}>+ 250 ml</button>
        </div>
      </div>

      <div className="hydro-nrc-right">
        <span className="hydro-nrc-days">{currentMl}</span>
        <span className="hydro-nrc-days-lbl">ml bebidos</span>
      </div>
    </div>
  );
}
