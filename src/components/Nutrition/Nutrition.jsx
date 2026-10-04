import React from 'react';
import NutritionDashboard from './NutritionDashboard';

// MealRegistration (registar refeição) já não abre aninhada aqui — é um
// ecrã de topo em App.jsx, fora do carrossel do Dashboard. Ver o
// comentário em App.jsx (isCreatingOrEditing) para o porquê.
function Nutrition() {
  return (
    <div className="flex flex-col fade-in flex-1 min-h-0">
      <NutritionDashboard />
    </div>
  );
}

/* React.memo (2026-10-04): os 5 separadores da Evolução montam todos ao mesmo
   tempo no carrossel, e o Dashboard redesenha a cada deslize (muda o
   separador ativo). Sem memo, cada deslize redesenhava os cinco — e fazia
   `update()` a todos os gráficos já criados — só para dar o mesmo resultado.
   Sem props que mudem, só redesenha quando um campo do store que usa muda. */
export default React.memo(Nutrition);
