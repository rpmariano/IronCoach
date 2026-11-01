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
   Juntar ou tirar um print volta a pedir a leitura: quem usa isto limpa readCount e
   attemptedCount (null) nesse momento — só a contagem não chegava (tirar um e juntar outro
   deixava o mesmo número). */
export function printsNeedRead({ photosCount, readCount, attemptedCount }) {
  if (!photosCount) return false;
  return readCount !== photosCount && attemptedCount !== photosCount;
}

export const AWAITING_READ_HINT = 'Primeiro lê os prints, no botão junto das fotos.';

/** O botão principal enquanto os prints estão por ler (bug #110): o «Analisar» fica à vista mas
    desativado, e a leitura faz-se no botão junto das fotos (PhotoReadSection) — nunca aqui. */
export function AwaitingReadAction({ label }) {
  return (
    <div className="w-full flex flex-col gap-1.5">
      <p id="awaiting-read-hint" className="text-[11.5px] leading-snug text-center text-[var(--text-2)]">
        {AWAITING_READ_HINT}
      </p>
      <CoachAnalyzeButton label={label} disabled aria-describedby="awaiting-read-hint" />
    </div>
  );
}
