import React from 'react';
import { CoachAnalyzeButton } from '../CoachButton';

/* Os prints primeiro (bug #106, 2026-10-31): num registo com prints, o primeiro passo é «Ler os
   prints e preencher» — a Carol lê-os (mode 'preview'), os campos enchem-se, o atleta revê — e só
   depois fica o «Analisar». Transversal: treino, corrida e corporal usam isto.

   - `photosCount`: quantos prints há agora;
   - `readCount`: quantos havia na última leitura que correu bem;
   - `attemptedCount`: quantos havia na última tentativa (correu mal ou não leu nada). Uma
     tentativa falhada também abre o «Analisar»: a Carol volta a ler os prints ao gravar, e o
     atleta não fica preso por uma leitura que não resulta.
   Juntar ou tirar um print muda a contagem e volta a pedir a leitura. */
export function printsNeedRead({ photosCount, readCount, attemptedCount }) {
  if (!photosCount) return false;
  return readCount !== photosCount && attemptedCount !== photosCount;
}

export const READ_PRINTS_LABEL = 'Ler os prints e preencher';

/** O botão principal enquanto os prints estão por ler. */
export function ReadPrintsAction({ onRead, reading, disabled = false }) {
  return (
    <CoachAnalyzeButton
      onClick={onRead}
      disabled={disabled || reading}
      busy={reading}
      label={READ_PRINTS_LABEL}
      busyLabel="A ler os prints…"
    />
  );
}
