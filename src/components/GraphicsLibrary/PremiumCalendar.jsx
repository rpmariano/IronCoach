import React, { useState } from 'react';
import './PremiumCalendar.css';

export default function PremiumCalendar({
  moduleType = "nutrition", // "nutrition", "running", "body", "gym"
  accentColor = "#7c3aed",   // fallback color for single-activity dots
  activeDaysData = {
    3: { water: true, food: null },
    8: { water: true, food: "ok" },
    12: { water: true, food: "ok" },
    14: { water: true, food: "exceeded" },
    19: { water: false, food: "ok" },
    26: { water: true, food: "exceeded" }
  }, // Nutrition object map: { dayNum: { water: bool, food: "ok"|"exceeded"|null } }
  activeDaysList = [3, 8, 12, 19, 26], // Fallback list for single module calendars (e.g. running, body, gym)
  moduleLabel = "Registos"
}) {
  const [selectedDay, setSelectedDay] = useState(12);

  // Generate basic mock calendar grid (Agosto 2026 starting on a Wednesday => 2 empty slots)
  const emptySlots = 2;
  const daysInMonth = 31;

  return (
    <div className="premium-calendar-card">
      <div className="pc-header">
        <button className="pc-nav-btn" aria-label="Mês Anterior">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <span className="pc-month">Agosto 2026</span>
        <button className="pc-nav-btn" aria-label="Próximo Mês">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>

      <div className="pc-weekdays">
        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d, i) => (
          <span className="pc-weekday" key={i}>{d}</span>
        ))}
      </div>

      <div className="pc-days-grid">
        {/* Align grid */}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <div key={`empty-${i}`} className="pc-day-cell"></div>
        ))}

        {/* Calendar Day tiles */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isSelected = day === selectedDay;

          return (
            <div className="pc-day-cell" key={day}>
              <button
                onClick={() => setSelectedDay(day)}
                className={`pc-day-btn-capsule ${isSelected ? 'selected' : ''}`}
              >
                <span className="pc-day-num">{day}</span>
                
                <div className="pc-status-pills">
                  {moduleType === "nutrition" ? (
                    <>
                      {/* Left Pill: Water status */}
                      <span 
                        className="pc-mini-pill" 
                        style={{ 
                          backgroundColor: activeDaysData[day]?.water 
                            ? "#06b6d4" 
                            : isSelected ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.03)" 
                        }} 
                      />
                      {/* Right Pill: Food/Calories status */}
                      <span 
                        className="pc-mini-pill" 
                        style={{ 
                          backgroundColor: activeDaysData[day]?.food === "ok" 
                            ? "#10b981" 
                            : activeDaysData[day]?.food === "exceeded" 
                            ? "#f97316" 
                            : isSelected ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.03)" 
                        }} 
                      />
                    </>
                  ) : (
                    // Other modules: single indicator pill using the module's accentColor
                    <span 
                      className="pc-mini-pill" 
                      style={{ 
                        backgroundColor: activeDaysList.includes(day) 
                          ? accentColor 
                          : isSelected ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.03)",
                        flex: "0 0 14px",
                        margin: "0 auto"
                      }} 
                    />
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Legend Block */}
      {moduleType === "nutrition" ? (
        <div className="pc-legend-box">
          <div className="pc-legend-item">
            <span className="pc-legend-indicator pc-pill-water-met"></span>
            <span>Água Atingida</span>
          </div>
          <div className="pc-legend-item">
            <span className="pc-legend-indicator pc-pill-food-met"></span>
            <span>Calorias Ok</span>
          </div>
          <div className="pc-legend-item">
            <span className="pc-legend-indicator pc-pill-food-exceeded"></span>
            <span>Calorias Excedidas</span>
          </div>
          <div className="pc-legend-item">
            <span className="pc-legend-indicator" style={{ background: "rgba(0,0,0,0.05)" }}></span>
            <span>Sem Registo</span>
          </div>
        </div>
      ) : (
        <div className="pc-legend-box" style={{ gridTemplateColumns: "1fr" }}>
          <div className="pc-legend-item" style={{ justifyContent: "center" }}>
            <span className="pc-legend-indicator" style={{ background: accentColor, width: "14px" }}></span>
            <span>{moduleLabel} Registados</span>
          </div>
        </div>
      )}
    </div>
  );
}
