import React, { useEffect, useId, useMemo, useSyncExternalStore } from 'react';
import { detectCoachInsights } from '../../utils/biEngine';
import { useAppStore } from '../../store';
import { todayISO } from '../../lib/utils';
import { isInsightHidden } from '../../utils/insightState';
import { useTabPage } from '../../utils/settledTab';
import Warning from '../shared/Warning';
import CarolActions from '../shared/CarolActions';
import { noticeSeverity, noticeTone } from './noticeTones';
import useInsightActions from './useInsightActions';

/* Ponto 3 do redesenho: o aviso era âmbar (bg-amber-100) — o âmbar é da
   prova. Coral para aviso, vermelho para crítico, ciano da Carol para o
   informativo (era azul genérico). Ver src/components/shared/Warning.jsx.

   Desde 2026-09-27 os símbolos são os do código único dos avisos da Carol
   (noticeTones.js) — eram o escudo e o raio, só aqui — e um insight posto
   de lado hoje ("Agora não") sai também deste banner, não só do botão. */
const WARNING_TONE = { critical: 'danger', warning: 'warn', info: 'coach' };

/* Desde 2026-10-05 cada insight do banner tem os botões da janela da Carol
   (convenção única, shared/CarolActions.jsx): "Falar com a Carol",
   "Percebi" e "Agora não", com as mesmas funções (useInsightActions.js).
   Antes era só texto — e, como o botão flutuante esconde o que o banner
   mostra (ver abaixo), um insight à vista aqui deixava de ter onde ser
   tratado. Agora o que o banner mostra continua acionável, e tratá-lo aqui
   tira-o dos dois sítios (a mesma régua, utils/insightState.js). Os botões
   vão nas ações do Warning, não no corpo: o corpo é um <p>, e um grupo de
   botões não pode viver dentro de um parágrafo. */
function InsightWarning({ insight, actions }) {
  const severity = noticeSeverity(insight.severity);
  const { Icon } = noticeTone(severity);
  const titleId = useId();
  return (
    <Warning
      tone={WARNING_TONE[severity]}
      title={<span id={titleId}>{insight.title}</span>}
      icon={<Icon size={14} />}
      data-testid={`banner-insight-${insight.id}`}
      actions={(
        <CarolActions
          className="w-full"
          labelledBy={titleId}
          severity={severity}
          talk={{ testId: `banner-insight-talk-${insight.id}`, onClick: () => actions.talk(insight) }}
          understood={{ testId: `banner-insight-understood-${insight.id}`, onClick: () => actions.understand(insight) }}
          snooze={{ testId: `banner-insight-snooze-${insight.id}`, onClick: () => actions.snooze(insight) }}
        />
      )}
    >
      {insight.message}
    </Warning>
  );
}

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
  const actions = useInsightActions();
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
      {topInsights.map((insight) => <InsightWarning key={insight.id} insight={insight} actions={actions} />)}
    </div>
  );
}
