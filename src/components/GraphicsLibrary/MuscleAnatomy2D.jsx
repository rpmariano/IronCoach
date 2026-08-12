import React from 'react';
import Model from 'react-body-highlighter';
import './MuscleAnatomy2D.css';

/**
 * IronHealth Muscle Anatomy 2D
 * Renderiza um modelo SVG interativo flat do corpo humano.
 * 
 * Músculos válidos (em inglês): 
 * abs, adductors, biceps, calves, chest, forearms, gluteal, hamstring, 
 * lats, lower-back, neck, obliques, quadriceps, shoulders, spine, triceps, upper-back
 * 
 * @param {Array} activeMuscles - Lista de músculos ativados.
 * @param {Array} activeMuscles - Lista de músculos ativados.
 * @param {boolean} naked - Ocultar fundo e sombras.
 */
const MuscleAnatomy2D = ({ activeMuscles = [], naked = false }) => {
  // A library exige que os dados sejam passados num formato de exercícios
  const exerciseData = [
    {
      name: 'Ativação de Treino',
      muscles: activeMuscles
    }
  ];

  return (
    <div className={`muscle-anatomy-2d-container ${naked ? 'naked' : ''}`}>
      {/* Vista Frontal */}
      <div className="anatomy-svg-wrapper">
         <Model 
           data={exerciseData} 
           style={{ width: '100%', padding: '1rem' }}
           type="anterior" 
           // Usa a paleta da IronHealth (Coral/Vermelho para destaque)
           highlightedColors={['#e11d48']} 
         />
      </div>

      {/* Vista Posterior (Costas) */}
      <div className="anatomy-svg-wrapper">
         <Model 
           data={exerciseData} 
           style={{ width: '100%', padding: '1rem' }}
           type="posterior" 
           highlightedColors={['#e11d48']} 
         />
      </div>
    </div>
  );
};

export default MuscleAnatomy2D;
