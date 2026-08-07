import React from 'react';
import './NutritionMacroCard.css';

export default function NutritionMacroCard() {
  return (
    <div className="nutri-card">
      <div className="nutri-circle">
        <svg className="nutri-svg" viewBox="0 0 140 140">
          <circle className="nutri-bg" cx="70" cy="70" r="64" />
          <circle className="nutri-progress" cx="70" cy="70" r="64" />
        </svg>
        <div className="nutri-inner">
          <span className="nutri-kcal">2345</span>
          <span className="nutri-lbl">Kcal Rest.</span>
        </div>
      </div>
      
      <div className="nutri-pills">
        <div className="nutri-pill pill-pro">
          <div className="nutri-pill-bg"></div>
          <div className="nutri-pill-content">
            <span className="nutri-pill-name">Proteína</span>
            <span className="nutri-pill-val">145g / 160g</span>
          </div>
        </div>
        
        <div className="nutri-pill pill-car">
          <div className="nutri-pill-bg"></div>
          <div className="nutri-pill-content">
            <span className="nutri-pill-name">Hidratos</span>
            <span className="nutri-pill-val">210g / 250g</span>
          </div>
        </div>
        
        <div className="nutri-pill pill-fat">
          <div className="nutri-pill-bg"></div>
          <div className="nutri-pill-content">
            <span className="nutri-pill-name">Gordura</span>
            <span className="nutri-pill-val">52g / 65g</span>
          </div>
        </div>
      </div>
    </div>
  );
}
