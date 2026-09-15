import React, { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, ChevronUp, Check, X as XIcon, MessageCircle } from 'lucide-react';
import { todayISO, addDaysISO } from '../../lib/utils';
import { computeAcceptedWindow, buildPlanDays, diffDaysISO } from './WeeklyPlanCard';
import { formatDayLabel, dayTitle, dayStatus, pendingSession, isRacePlanItem, raceForDate, raceNameForDate, trainingItems, planItemTitle } from '../../utils/homeModels';
import GlassCard from '../shared/GlassCard';

/* "O que faço hoje" — o plano de HOJE, e só de hoje (redesenho 2026-09-15).
   O carrossel de dias que aqui vivia (setas, pontos, contador, a altura a
   seguir a página ativa) mudou-se para o ecrã "O plano" (PlanoScreen.jsx):
   navegar o plano inteiro é outra tarefa, não cabe num cartão do Início.
   O que fica é um cartão de três linhas — a data, o treino, e uma linha
   "Ver detalhe do treino" que abre a instrução da Carol JUNTO com o botão
   de registo (nunca um sem o outro; fechado por omissão) — mais a linha de
   rodapé que leva ao plano completo. As refeições sugeridas passaram para
   o "Como estou" (StatusCard), onde estão os anéis da nutrição.
   Aceitar/recusar propostas continua no chat (specs/plano-de-treino.md). */

/* Sem o Badge "Hoje" (o rótulo da secção já diz "O que faço hoje"): o
   estado do dia colore a própria data — --gym por fazer, --ok só quando de
   facto está feito, --warn em atraso, âmbar no dia da prova. */
function dateColor(status) {
  if (status.tone === 'race') return 'var(--race)';
  if (status.label === 'Concluído') return 'var(--ok)';
  if (status.tone === 'warn') return 'var(--warn)';
  return 'var(--gym)';
}

/* "semana 6 de 18". Não há cálculo pronto para a janela do plano ACORDADO:
   o `semana N de M` que já existia (buildTrailModel/calculateRaceTrainingPlan)
   conta as semanas do plano de PROVA, que é outra coisa — começa na data que
   o motor calcula a partir da prova, não na que o atleta e a Carol
   acordaram. Aqui é aritmética simples sobre a janela aceite: M = quantas
   semanas ela ocupa, N = a semana em que hoje cai contada a partir do
   arranque (não pela semana do calendário). Fora da janela fica presa às
   pontas — um plano que ainda não começou está na semana 1, um que já
   acabou na última. Exportada para o ecrã "O plano" mostrar o mesmo. */
export function planWeekLabel(planWindow, today = todayISO()) {
  if (!planWindow) return null;
  const total = Math.max(1, Math.ceil(planWindow.days / 7));
  const elapsed = diffDaysISO(planWindow.start, today);
  const current = Math.min(total, Math.max(1, Math.floor(elapsed / 7) + 1));
  return { current, total, text: `semana ${current} de ${total}` };
}

export default function DayPlanCard({ plans = [], planItems = [], raceEvents = [], onComplete, onNav, onOpenRace, onOpenPlano }) {
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);
  const [open, setOpen] = useState(false);

  const pendingCount = useMemo(() => (plans || []).filter((p) => p.status === 'proposto').length, [plans]);
  const planWindow = useMemo(() => computeAcceptedWindow(plans, planItems, today), [plans, planItems, today]);
  /* Dois dias, não a janela inteira: o cartão mostra hoje e só precisa de
     espreitar amanhã para o rodapé ("· amanhã: descanso"). O plano completo
     constrói-se no ecrã "O plano", com a mesma função. */
  const days = useMemo(() => {
    if (!planWindow) return [];
    const acceptedIds = new Set((plans || []).filter((p) => p.status === 'aceite').map((p) => p.id));
    return buildPlanDays((planItems || []).filter((i) => acceptedIds.has(i.plan_id)), today, 2);
  }, [plans, planItems, planWindow, today]);

  const day = days[0];
  const week = planWeekLabel(planWindow, today);

  // O título de amanhã em minúscula, porque entra a meio da frase do rodapé
  // ("Ver o plano · amanhã: rodagem longa · 14 km").
  const tomorrowPreview = useMemo(() => {
    const title = dayTitle(days[1]?.items || [], raceNameForDate(raceEvents, tomorrow));
    return title.charAt(0).toLowerCase() + title.slice(1);
  }, [days, raceEvents, tomorrow]);

  const PendingBanner = () => pendingCount > 0 && (
    <button type="button" onClick={() => onNav?.('coach')} className="flex items-center gap-2 w-full min-h-[44px] px-3 rounded-[14px] text-left" style={{ background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)' }}>
      <MessageCircle size={14} style={{ color: 'var(--coach)' }} className="shrink-0" />
      <span className="flex-1 text-[12.5px] font-semibold" style={{ color: 'var(--coach-soft)' }}>
        {pendingCount === 1 ? 'Tens 1 proposta da Carol por rever' : `Tens ${pendingCount} propostas da Carol por rever`}
      </span>
      <ChevronRight size={14} style={{ color: 'var(--coach)' }} className="shrink-0" />
    </button>
  );

  if (!planWindow || !day) {
    return (
      <div className="flex flex-col gap-2">
        <PendingBanner />
        <GlassCard tone="gym" glow>
          <h2 className="text-[20px] font-black leading-[1.15]" style={{ color: 'var(--text-1)', letterSpacing: '-.02em' }}>Sem plano acordado</h2>
          <p className="text-[12.5px] leading-[1.45] mt-1.5" style={{ color: 'var(--text-3)' }}>
            Pede-me um plano. As propostas aparecem no chat, para aceitares ou recusares.
          </p>
          <button type="button" onClick={() => onNav?.('coach')} className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] mt-3 rounded-[11px] text-[12.5px] font-extrabold" style={{ background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)', color: 'var(--coach)' }}>
            <MessageCircle size={15} /> Pedir plano à Carol
          </button>
        </GlassCard>
      </div>
    );
  }

  const status = dayStatus(day, today);

  /* O dia da prova (specs/plano-de-prova.md): o plano tem lá um item
     `corrida` com `training_type = 'prova'` e a agenda tem a prova. O nome
     vem da agenda — o item do plano não o guarda — e o botão leva ao hub,
     que é onde a prova se prepara e se regista. Num dia destes não há
     "Ver detalhe do treino": a prova não é um treino por registar, e o que
     há para fazer ("Abrir a prova") fica à vista. */
  const race = (day.items || []).find((i) => i.isRace);
  const racePlanItem = (day.items || []).find(isRacePlanItem);
  const dayRace = raceForDate(raceEvents, day.dateISO);
  const openRaceId = race ? String(race.id).replace('race-', '') : (racePlanItem && dayRace ? dayRace.id : null);

  const session = pendingSession(day, today);
  const instructions = trainingItems(day.items).filter((i) => !isRacePlanItem(i) && typeof i.notes === 'string' && i.notes.trim());
  // Os treinos "normais" do dia — os que o botão de registo (ou o estado
  // que ficou no lugar dele) representa.
  const trainings = trainingItems(day.items).filter((i) => !i.isRace && !isRacePlanItem(i));
  const done = trainings.length > 0 && trainings.every((i) => i.status === 'concluido');
  const cancelled = trainings.length > 0 && trainings.every((i) => i.status === 'cancelado');

  /* A gaveta só existe quando tem o que revelar. Um dia de descanso sem
     instrução nenhuma fica em duas linhas — a data e "Descanso" —, sem uma
     linha que promete detalhe e abre para nada. No dia da prova dá isto
     falso sozinho (a instrução, o botão e o estado saltam sempre o item da
     prova), e o que fica à vista é "Abrir a prova". */
  const hasDetail = instructions.length > 0 || !!session || done || cancelled;

  return (
    <div className="flex flex-col gap-2">
      <PendingBanner />
      <GlassCard tone="gym" glow padding="14px 16px" data-testid="day-plan-card">
        <div className="flex items-center justify-between gap-2">
          <span data-testid="day-plan-date" className="text-[11.5px] font-extrabold uppercase whitespace-nowrap" style={{ color: dateColor(status), letterSpacing: '.06em' }}>{formatDayLabel(day.dateISO)}</span>
          {week && <span data-testid="day-plan-week" className="text-[11px] font-bold whitespace-nowrap" style={{ color: 'var(--text-4)' }}>{week.text}</span>}
        </div>

        <h2 className="text-[20px] font-black leading-[1.15] mt-2" style={{ color: 'var(--text-1)', letterSpacing: '-.02em' }}>
          {race ? race.title : dayTitle(day.items, dayRace?.name || null)}
        </h2>

        {hasDetail && (
          <button
            type="button"
            data-testid="day-plan-detail-toggle"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex items-center justify-between w-full min-h-[44px] mt-1 text-left text-[12.5px] font-bold"
            style={{ color: 'var(--coach)' }}
          >
            Ver detalhe do treino
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}

        {/* A instrução da Carol (item.notes: "8×400m a 4:15/km, 90s de trote
            entre séries") e a ação do dia andam sempre juntas: ler o que há
            para fazer e marcá-lo como feito é o mesmo gesto, em dois passos. */}
        {hasDetail && open && (
          <div data-testid="day-plan-detail" className="mt-1 pt-[10px]" style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
            {instructions.map((i) => (
              <p key={i.id} data-testid="day-plan-notes" className="text-[12.5px] leading-[1.5]" style={{ color: 'var(--text-3)', whiteSpace: 'pre-line' }}>
                {instructions.length > 1 ? `${planItemTitle(i, dayRace?.name || null)}: ${i.notes.trim()}` : i.notes.trim()}
              </p>
            ))}

            {session && (
              <button type="button" onClick={() => onComplete?.(session)} className="w-full inline-flex items-center justify-center gap-[7px] min-h-[44px] mt-2.5 rounded-[11px] text-[12.5px] font-extrabold" style={{ background: 'var(--tint-ok-bg)', border: '1px solid var(--tint-ok-bd)', color: 'var(--ok)' }}>
                <Check size={15} /> Registar sessão
              </button>
            )}
            {!session && (done || cancelled) && (
              <div data-testid="day-plan-status" className="inline-flex items-center gap-[6px] min-h-[32px] mt-2.5 px-3 rounded-[11px] text-[12px] font-extrabold" style={done
                ? { background: 'var(--tint-ok-bg)', border: '1px solid var(--tint-ok-bd)', color: 'var(--ok)' }
                : { background: 'var(--tint-danger-bg)', border: '1px solid var(--tint-danger-bd)', color: 'var(--danger)' }}>
                {done ? <><Check size={14} /> Concluído</> : <><XIcon size={14} /> Cancelado</>}
              </div>
            )}
          </div>
        )}

        {openRaceId && (
          <button type="button" data-testid="day-plan-open-race" onClick={() => onOpenRace?.(openRaceId)} className="w-full inline-flex items-center justify-center gap-[7px] min-h-[44px] mt-3 rounded-[11px] text-[12.5px] font-extrabold" style={{ background: 'var(--tint-race-bg)', border: '1px solid var(--tint-race-bd)', color: 'var(--race)' }}>
            Abrir a prova
          </button>
        )}

        {/* O rodapé está sempre lá: é a única porta para o plano inteiro
            desde que o carrossel saiu daqui, e a espreitadela a amanhã
            evita ter de a abrir só para saber se há treino. */}
        <button type="button" data-testid="day-plan-open-plano" onClick={() => onOpenPlano?.()} className="flex items-center justify-between w-full min-h-[44px] mt-1.5 text-left text-[12px] font-bold" style={{ color: 'var(--text-3)', borderTop: '1px solid rgba(255,255,255,.09)' }}>
          <span>Ver o plano <span className="font-semibold" style={{ color: 'var(--text-4)' }}>· amanhã: {tomorrowPreview}</span></span>
          <ChevronRight size={15} style={{ color: 'var(--text-4)' }} className="shrink-0" />
        </button>
      </GlassCard>
    </div>
  );
}
