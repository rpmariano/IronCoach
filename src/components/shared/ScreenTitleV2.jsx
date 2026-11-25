import React from 'react';
import { ChevronLeft } from 'lucide-react';

/* O título com voltar dos ecrãs que se abrem pelo cabeçalho (Calendário, Perfil), só no Design v2
   (P2b da crítica de design, 2026-11-25): como os outros ecrãs, o nome no topo, e um voltar para
   onde se estava, já que nenhum separador da barra fica aceso. */
export default function ScreenTitleV2({ title, onBack, testId }) {
  return (
    <header className="v2-screen-title" data-testid={testId}>
      <button type="button" className="v2-screen-back" aria-label="Voltar" onClick={onBack}>
        <ChevronLeft size={22} aria-hidden="true" />
      </button>
      <h1 className="v2-title">{title}</h1>
    </header>
  );
}
