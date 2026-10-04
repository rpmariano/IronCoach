import React, { useEffect, useMemo, useSyncExternalStore } from 'react';
import { detectCoachInsights } from '../../utils/biEngine';
import { useAppStore } from '../../store';
import { todayISO } from '../../lib/utils';
import { isInsightHidden } from '../../utils/insightState';
import { useTabPage } from '../../utils/settledTab';
import Warning from '../shared/Warning';
import { noticeSeverity, noticeTone } from './noticeTones';

/* Ponto 3 do redesenho: o aviso era âmbar (bg-amber-100) — o âmbar é da
   prova. Coral para aviso, vermelho para crítico, ciano da Carol para o
   informativo (era azul genérico). Ver src/components/shared/Warning.jsx.

   Desde 2026-09-27 os símbolos são os do código único dos avisos da Carol
   (noticeTones.js) — eram o escudo e o raio, só aqui — e um insight posto
   de lado hoje ("Agora não") sai também deste banner, não só do botão. */
const WARNING_TONE = { critical: 'danger', warning: 'warn', info: 'coach' };

/* O que o banner está a mostrar, para o botão da Carol não o repetir
   (2026-10-04, Geral): o banner mostrava os insights à cabeça do Geral e o botão
   flutuante — montado no Dashboard, em todos os separadores — contava e listava
   os mesmos, por isso o atleta via "2 insights" no botão e os mesmos 2 por cima.
   Store externo mínimo (sem zustand, sem props atravessando o Dashboard): o
   banner publica os ids que mostra e a página do carrossel em que vive
   (`useTabPage`); o CoachInsightsDock só os esconde enquanto essa página é a
   assente — noutro separador o banner não se vê e o botão volta a dizer tudo. */
const NO_SHOWN = Object.freeze({ ids: Object.freeze([]), page: null });
let shown = NO_SHOWN;
const listeners = new Set();

function publishShown(next) {
  const same = next.page === shown.page && next.ids.length === shown.ids.length
    && next.ids.every((id, i) => id === shown.ids[i]);
  if (same) return;
  shown = next;
  [...listeners].forEach((l) => l());
}

const subscribeShown = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
const getShown = () => shown;

/** { ids, page }: os insights que o banner mostra agora e a página do carrossel
 *  (null fora dele). Sem banner montado, ids é []. */
export function useBannerShown() {
  return useSyncExternalStore(subscribeShown, getShown, getShown);
}

/** Só para testes. */
export function resetBannerShown() {
  publishShown(NO_SHOWN);
}

export default function SmartInsightsBanner({ data, profile, excludeIds = [], maxItems = 2 }) {
  const { insightStates, insightSnoozes } = useAppStore();
  const page = useTabPage();
  const today = todayISO();
  const insights = useMemo(() => {
    // Retorna todos os insights cruzados (RED-S, ACWR, etc) ordenados por severidade,
    // filtrando aqueles já percebidos, postos de lado hoje ou visíveis noutros painéis.
    return detectCoachInsights(data, profile).filter(
      i => !isInsightHidden(i.id, { states: insightStates, snoozes: insightSnoozes, today }) && !excludeIds.includes(i.id)
    );
  }, [data, profile, excludeIds, insightStates, insightSnoozes, today]);

  // `maxItems` (2026-10-04): o Geral pedia 3 e o banner ignorava-o (cortava
  // sempre a 2). Por omissão continua a ser 2.
  const limit = Number.isFinite(Number(maxItems)) && Number(maxItems) > 0 ? Math.floor(Number(maxItems)) : 2;
  const topInsights = useMemo(() => (insights || []).slice(0, limit), [insights, limit]);
  const shownKey = topInsights.map((i) => i.id).join('|');

  useEffect(() => {
    publishShown(topInsights.length ? { ids: topInsights.map((i) => i.id), page } : NO_SHOWN);
    // As dependências são `shownKey` (resume os ids) e `page`: `topInsights` muda de referência a cada render.
  }, [shownKey, page]);
  // Ao desmontar (saída da Evolução) o botão volta a dizer tudo.
  useEffect(() => () => publishShown(NO_SHOWN), []);

  if (topInsights.length === 0) {
    return null; // Nenhum insight, não mostra nada
  }

  return (
    <div className="space-y-3">
      {topInsights.map(insight => {
        const severity = noticeSeverity(insight.severity);
        const { Icon } = noticeTone(severity);

        return (
          <Warning
            key={insight.id}
            tone={WARNING_TONE[severity]}
            title={insight.title}
            icon={<Icon size={14} />}
          >
            {insight.message}
          </Warning>
        );
      })}
    </div>
  );
}
