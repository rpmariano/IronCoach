import React, { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../../utils/coachBubbles';

/* Trilho do macrociclo: semanas feitas como pontos, marcador âmbar,
   divisões de fase, seta na meta. No Início e no Hub de prova. A única
   animação que vale repetir semanalmente: quando a semana muda, o marcador
   avança (1600 ms).

   Animação 3 do ponto 9 — e a exceção à regra do "uma vez por sessão": não
   é a entrada no ecrã que a dispara, é haver novidade. Por isso a memória
   é `localStorage` por prova (sobrevive à sessão) e não sessionStorage: o
   avanço mostra-se uma vez por semana nova, não uma vez por separador
   aberto. Sem prova identificada (ou à primeira visita) fica estático. */

export const trailWeekKey = (raceId) => `ironcoach:trail-week:${raceId}`;

/** A semana já vista desta prova, ou null se nunca se viu / sem storage. */
function readSeenWeek(raceId) {
  try {
    const raw = localStorage.getItem(trailWeekKey(raceId));
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeSeenWeek(raceId, week) {
  try { localStorage.setItem(trailWeekKey(raceId), String(week)); } catch { /* sem storage, sem memória */ }
}

/* A decisão "esta semana é nova" é tomada UMA vez por prova+semana em cada
   carregamento da página, e fica aqui guardada. Sem isto, o StrictMode do
   React (que monta, desmonta e volta a montar cada componente em
   desenvolvimento) matava a animação sozinho: a primeira passagem escrevia a
   semana nova no localStorage e a segunda já a lia como "nada mudou". O
   mesmo vale para qualquer remontagem no mesmo ecrã. */
const trailDecisions = new Map();

/** Só para testes — esquece as decisões tomadas neste carregamento. */
export function resetTrailDecisions() { trailDecisions.clear(); }

/**
 * A semana por onde o marcador COMEÇA: a anterior quando a semana mudou
 * desde a última visita (é esse salto que se anima), senão a atual.
 *
 * Decide-se no PRIMEIRO render e não num efeito: a decidir depois, o
 * primeiro pintado ficava já na semana nova e a transição corria ao
 * contrário — o marcador recuava 1600 ms e só depois avançava.
 */
function startWeekFor(raceId, current) {
  if (!raceId) return current;
  const key = `${raceId}:${current}`;
  let advanced = trailDecisions.get(key);
  if (advanced === undefined) {
    const seen = readSeenWeek(raceId);
    advanced = seen !== null && seen !== current;
    trailDecisions.set(key, advanced);
    writeSeenWeek(raceId, current);
  }
  if (!advanced || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') return current;
  return Math.max(0, current - 1);
}

export default function RaceTrail({ weeks = 18, current = 6, phases = [], startLabel, endLabel, width = 322, raceId }) {
  const x0 = 4;
  const x1 = width - 4;
  const span = x1 - x0;
  const safeWeeks = Math.max(1, weeks);
  const px = (w) => x0 + (Math.max(0, Math.min(safeWeeks, w)) / safeWeeks) * span;

  // Onde o marcador está DESENHADO agora: normalmente `current`; no primeiro
  // pintado de um avanço semanal, a semana anterior — é a diferença entre os
  // dois que a transição de --dur-trail percorre.
  const [shownWeek, setShownWeek] = useState(() => startWeekFor(raceId, current));

  useEffect(() => {
    if (shownWeek === current) return undefined;
    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      setShownWeek(current);
      return undefined;
    }
    // Dois frames: o primeiro deixa o browser pintar a semana anterior, o
    // segundo troca o valor — e é aí que a transição arranca. Com um só, o
    // browser junta as duas mudanças no mesmo pintado e não anima nada.
    let inner = null;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        // O avanço já foi mostrado: as próximas montagens desta prova nesta
        // mesma semana ficam estáticas (a animação repete quando a SEMANA
        // muda, não quando se volta ao ecrã).
        if (raceId) trailDecisions.set(`${raceId}:${current}`, false);
        setShownWeek(current);
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner !== null) cancelAnimationFrame(inner);
    };
  }, [raceId, current, shownWeek]);

  // A semana virou com o ecrã aberto (domingo à meia-noite): guarda a nova
  // para a próxima visita não voltar a animar o mesmo salto.
  useEffect(() => {
    if (raceId) writeSeenWeek(raceId, current);
  }, [raceId, current]);

  const end = px(current);          // fim do troço feito, já na semana nova
  const cur = px(shownWeek);        // onde o marcador está DESENHADO agora
  const done = Math.max(0, end - x0);
  return (
    <svg viewBox={`0 0 ${width} 58`} style={{ width: '100%', height: 58, display: 'block', overflow: 'visible', marginTop: 14 }} aria-hidden="true">
      <line x1={x0} y1="34" x2={x1} y2="34" stroke="rgba(255,255,255,.12)" strokeWidth="3" strokeLinecap="round" />
      {/* O troço feito desenha-se com stroke-dashoffset, como no mock
          (`@keyframes trail`), e não a mexer no x2: x1/x2 são só atributos —
          não são propriedades CSS, e por isso NÃO transitam. O stroke-
          dashoffset transita, e é o que faz o traço avançar em --dur-trail. */}
      <line
        x1={x0} y1="34" x2={end} y2="34" stroke="var(--race)" strokeWidth="3" strokeLinecap="round"
        strokeDasharray={done} strokeDashoffset={Math.max(0, end - cur)}
        style={{ strokeDashoffset: Math.max(0, end - cur), transition: 'stroke-dashoffset var(--dur-trail) var(--ease-out)' }}
      />
      {/* As semanas feitas acendem à passagem do marcador (mock: keyframes
          `tick`) — por isso contam-se a partir de `shownWeek`, não de
          `current`, e a que falta aparece no sítio de onde o marcador
          acabou de sair. */}
      {Array.from({ length: Math.max(0, shownWeek - 1) }, (_, i) => (
        <circle key={i} cx={px(i + 1)} cy="34" r="3" fill="var(--race)" />
      ))}
      {/* `cx` (ao contrário de x1/x2) É propriedade CSS nos browsers atuais,
          mas só transita quando vem do style — o atributo sozinho não chega.
          Fica nos dois: o atributo para quem não a suporta (e para os
          testes), o style para a transição. */}
      <circle cx={cur} cy="34" r="7" fill="var(--race)" stroke="var(--bg-app)" strokeWidth="3" style={{ cx: `${cur}px`, transition: 'cx var(--dur-trail) var(--ease-out)' }} />
      {phases.slice(0, -1).map((p, i) => (
        <line key={i} x1={px(p.to)} y1="24" x2={px(p.to)} y2="44" stroke="rgba(255,255,255,.18)" strokeWidth="2" />
      ))}
      <polygon points={`${x1 - 8},26 ${x1 + 4},34 ${x1 - 8},42`} fill="var(--race-deep)" />
      {phases.map((p, i) => {
        const from = i ? phases[i - 1].to : 0;
        const active = current > from && current <= p.to;
        return (
          <text key={p.label} x={px(from) + (i ? 6 : 0)} y="14" fill={active ? 'var(--race)' : 'var(--text-muted)'} fontSize="11" fontWeight="700" fontFamily="var(--font-sans)">{p.label}</text>
        );
      })}
      {startLabel && <text x={x0} y="55" fill="var(--text-muted)" fontSize="11" fontWeight="600" fontFamily="var(--font-sans)">{startLabel}</text>}
      {endLabel && <text x={x1} y="55" fill="var(--text-muted)" fontSize="11" fontWeight="600" fontFamily="var(--font-sans)" textAnchor="end">{endLabel}</text>}
    </svg>
  );
}
