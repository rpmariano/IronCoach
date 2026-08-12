import React, { Component } from 'react';
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

class MuscleAnatomyErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error.toString() };
  }
  render() {
    if (this.state.hasError) {
      return <div style={{ color: 'red', fontSize: '12px' }}>Erro no SVG: {this.state.errorMessage}</div>;
    }
    return <MuscleAnatomy2D {...this.props} />;
  }
}

export default MuscleAnatomyErrorBoundary;
