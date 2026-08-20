import React from 'react';
import GymDashboard from './GymDashboard';

// GymRegistration (registar treino) já não abre aninhada aqui — é um ecrã
// de topo em App.jsx, fora do carrossel do Dashboard. Ver o comentário em
// App.jsx (isCreatingOrEditing) para o porquê.
export default function Gym() {
  return (
    <div className="flex flex-col fade-in flex-1 min-h-0">
      <GymDashboard />
    </div>
  );
}
