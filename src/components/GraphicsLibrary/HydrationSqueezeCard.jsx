import React from 'react';
import './HydrationSqueezeCard.css';

export default function HydrationSqueezeCard() {
  return (
    <div className="hydro-card">
      <div className="hydro-header">
        <p>Daily Hydration</p>
        <h2>Mantém-te hidratado 💧</h2>
      </div>

      <div className="hydro-circle">
        <svg className="hydro-svg" viewBox="0 0 200 200">
          <circle className="hydro-bg" cx="100" cy="100" r="90" />
          <circle className="hydro-progress" cx="100" cy="100" r="90" />
        </svg>
        <div className="hydro-inner">
          <svg className="hydro-bottle-svg" width="44" height="70" viewBox="0 0 44 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L14 10H30L32 2H12Z" fill="#578297"/>
            <path d="M8 12L4 26V66C4 68.2091 5.79086 70 8 70H36C38.2091 70 40 68.2091 40 66V26L36 12H8Z" fill="#e3e8eb"/>
            <path d="M4 36V66C4 68.2091 5.79086 70 8 70H36C38.2091 70 40 68.2091 40 66V36H4Z" fill="#8baebf"/>
          </svg>
          <div className="hydro-percent">72%</div>
          <div className="hydro-status">Hidratado</div>
        </div>
      </div>

      <div className="hydro-bar-container">
        <div className="hydro-bar-segment active"></div>
        <div className="hydro-bar-segment active"></div>
        <div className="hydro-bar-segment active"></div>
        <div className="hydro-bar-segment active"></div>
        <div className="hydro-bar-segment active"></div>
        <div className="hydro-bar-segment partial"></div>
        <div className="hydro-bar-segment"></div>
        <div className="hydro-bar-segment"></div>
      </div>

      <div className="hydro-labels">
        <span className="current">1800 ml</span>
        <span className="total">/ 2500 ml</span>
      </div>

      <div className="hydro-buttons">
        <button className="hydro-btn">+ 200 ml</button>
        <button className="hydro-btn">+ 250 ml</button>
      </div>
    </div>
  );
}
