import React from 'react';
import RunDashboard from './RunDashboard';

// RunRegistration (registar corrida) já não abre aninhada aqui — é um
// ecrã de topo em App.jsx, fora do carrossel do Dashboard. Ver o
// comentário em App.jsx (isCreatingOrEditing) para o porquê.
export default function Run() {
  return (
    <div className="flex flex-col fade-in flex-1 min-h-0">
      <RunDashboard />
    </div>
  );
}
