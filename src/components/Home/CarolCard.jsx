import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, ChevronUp, Sparkles, RefreshCw } from 'lucide-react';
import { useAppStore } from '../../store';
import { todayISO, addDaysISO } from '../../lib/utils';
import { computeAcceptedWindow } from './WeeklyPlanCard';
import GlassCard from '../shared/GlassCard';
import CoachAvatar from '../Coach/CoachAvatar';

/* O cartão da Carol no topo do Início (mock "Início": ciano, "Ler mais").
   Duas partes: o cabeçalho — "A Carol precisa de falar contigo · N
   assuntos a resolver" quando há intervenção ou propostas por decidir,
   senão o nome dela — e uma linha do resumo diário (coach-daily-summary),
   fechada a duas linhas, que "Ler mais" abre com o resto das mensagens.
   Substitui o antigo CoachDailySummaryCard (carrossel de 4 mensagens),
   cuja composição do "aviso de hoje" (plano de hoje + água) se mantém em
   useCoachDailyMessages. Ver specs/plano-de-treino.md §11. */

function formatItemSummary(item) {
  if (item.kind === 'corrida') {
    const details = [item.training_type || 'corrida', item.target_distance_km ? `${item.target_distance_km} km` : '', item.target_duration_min ? `${item.target_duration_min} min` : ''].filter(Boolean).join(', ');
    return `Corrida (${details})`;
  }
  if (item.kind === 'ginasio') {
    const details = [item.categories?.length ? item.categories.join('/') : 'Geral', item.target_duration_min ? `${item.target_duration_min} min` : ''].filter(Boolean).join(', ');
    return `Ginásio (${details})`;
  }
  return 'Descanso';
}

const clean = (s) => (typeof s === 'string' && s.trim() ? s.trim() : null);

/** As mensagens do dia, por ordem: recapitulação, aviso de hoje (plano +
 *  água), estratégia nutricional, preparar amanhã, conceito do dia. */
export function useCoachDailyMessages() {
  const { coachPlans, coachPlanItems, dailySummary, waterLogs, profile } = useAppStore();
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);

  const activePlanItems = useMemo(() => {
    const window = computeAcceptedWindow(coachPlans, coachPlanItems, today);
    if (!window) return { today: [], tomorrow: [] };
    const accepted = (coachPlans || []).filter((p) => p.status === 'aceite');
    const relevant = accepted.filter((p) => p.period_end >= today || (coachPlanItems || []).some((i) => i.plan_id === p.id && i.status === 'pendente'));
    const activePlan = [...relevant].sort((a, b) => a.period_start.localeCompare(b.period_start)).pop();
    if (!activePlan) return { today: [], tomorrow: [] };
    const items = (coachPlanItems || []).filter((i) => i.plan_id === activePlan.id && i.status !== 'cancelado');
    return { today: items.filter((i) => i.planned_date === today), tomorrow: items.filter((i) => i.planned_date === tomorrow) };
  }, [coachPlans, coachPlanItems, today, tomorrow]);

  return useMemo(() => {
    const list = [];
    // Os rótulos das secções são a Carol a falar, não crachás de módulo: todos
    // em ciano (--coach), só o aviso em --warn. Antes cada um levava a cor do
    // seu módulo — o --gym (#9ec3d2) de "Preparar amanhã" tem quase a
    // luminância do texto corrido e desaparecia; o âmbar do conceito do dia
    // roubava a cor que é "da prova, só da prova" (bug relatado 2026-09-12).
    if (clean(dailySummary?.recap)) list.push({ key: 'recap', label: 'Recapitulação', color: 'var(--coach)', text: clean(dailySummary.recap) });

    // Aviso de hoje: o do servidor, senão o plano de hoje; a água junta-se.
    const nonRest = activePlanItems.today.filter((i) => i.kind !== 'descanso');
    let warning = clean(dailySummary?.warnings) || (nonRest.length ? `Para hoje tens agendado: ${nonRest.map(formatItemSummary).join(' e ')}.` : '');
    const waterTotal = (waterLogs || []).filter((w) => w.date === today).reduce((s, w) => s + (w.amount_ml || 0), 0);
    const waterGoal = profile?.water_goal_ml;
    // O servidor vê os mesmos registos de água e muitas vezes já os comenta
    // no aviso ("Ainda não registaste consumo de água hoje. Começa a
    // hidratar-te…"); juntar-lhe a frase local dizia a mesma coisa duas
    // vezes seguidas (bug relatado 2026-09-12). A frase local fica só para
    // quando o aviso não fala de água — que é o caso sem resumo do dia.
    // Sem \b antes de "água": em JavaScript \b é só ASCII e nunca casa entre
    // um espaço e um "á" — apanhado na revisão pré-deploy; passava só porque
    // o servidor escreve sempre "hidratar-te".
    const mentionsWater = /água|\b(agua|hidrat)/i.test(warning);
    if (waterGoal && !mentionsWater && waterTotal === 0) warning = `${warning} Ainda não registaste água hoje.`.trim();
    else if (waterGoal && !mentionsWater && waterTotal < waterGoal / 2) warning = `${warning} Só registaste ${waterTotal} ml de água.`.trim();
    if (warning) list.push({ key: 'warnings', label: 'Aviso de hoje', color: 'var(--warn)', text: warning });

    if (clean(dailySummary?.meal_suggestion)) list.push({ key: 'meal_suggestion', label: 'Estratégia nutricional', color: 'var(--coach)', text: clean(dailySummary.meal_suggestion) });

    const tomorrowNonRest = activePlanItems.tomorrow.filter((i) => i.kind !== 'descanso');
    const prep = tomorrowNonRest.length
      ? `Amanhã o plano aponta para: ${tomorrowNonRest.map(formatItemSummary).join(' e ')}.`
      : clean(dailySummary?.tomorrow_prep);
    if (prep) list.push({ key: 'tomorrow_prep', label: 'Preparar amanhã', color: 'var(--coach)', text: prep });

    if (clean(dailySummary?.daily_concept?.body)) list.push({ key: 'daily_concept', label: dailySummary.daily_concept.title || 'Conceito do dia', color: 'var(--coach)', text: clean(dailySummary.daily_concept.body) });
    return list;
  }, [dailySummary, activePlanItems, waterLogs, profile, today]);
}

/* `topic`: um assunto que ela quer tratar sem ser uma intervenção — hoje, "o
   balanço da prova" nos dias a seguir a uma prova registada (specs/
   gamificacao-provas.md §3). Mostra-se com o mesmo cabeçalho "A Carol precisa
   de falar contigo", mas sem o semblante preocupado: é uma boa notícia. */
export default function CarolCard({ pendingTopics = 0, topic = null, onOpenCoach, onDismissTopic }) {
  const { dailySummary, dailySummaryLoading, loadDailySummary } = useAppStore();
  const messages = useCoachDailyMessages();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadDailySummary();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const first = messages[0] || null;
  const canExpand = messages.length > 1 || (first && first.text.length > 120);
  const loading = dailySummaryLoading && !dailySummary;

  return (
    <GlassCard tone="coach" radius={20} padding="14px 15px" className="flex flex-col gap-[11px]" data-testid="carol-card">
      <button type="button" onClick={onOpenCoach} className="flex items-center gap-2.5 w-full text-left min-h-[44px] -my-1.5">
        <CoachAvatar size={30} mood={pendingTopics > 0 ? 'concerned' : 'neutral'} breathing={pendingTopics > 0 || !!topic} />
        <div className="flex-1 min-w-0">
          {pendingTopics > 0 ? (
            <>
              <div className="text-[13px] font-extrabold" style={{ color: 'var(--coach-soft)' }}>A Carol precisa de falar contigo</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-4)' }}>{pendingTopics === 1 ? '1 assunto a resolver' : `${pendingTopics} assuntos a resolver`}</div>
            </>
          ) : topic ? (
            <>
              <div className="text-[13px] font-extrabold" style={{ color: 'var(--coach-soft)' }}>A Carol precisa de falar contigo</div>
              <div className="text-[11px] mt-0.5" data-testid="carol-card-topic" style={{ color: 'var(--text-4)' }}>{topic}</div>
            </>
          ) : (
            <>
              <div className="text-[13px] font-extrabold" style={{ color: 'var(--coach-soft)' }}>Carol</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-4)' }}>a tua treinadora</div>
            </>
          )}
        </div>
        <ChevronRight size={16} style={{ color: 'var(--coach)' }} className="shrink-0" />
      </button>

      <div className="flex items-start gap-2.5 pt-[11px]" style={{ borderTop: '1px solid rgba(34,211,238,.2)' }}>
        <Sparkles size={16} style={{ color: 'var(--coach)', marginTop: 1 }} className="shrink-0" />
        <div className="flex-1 min-w-0">
          {loading ? (
            <div data-testid="carol-skeleton" className="flex flex-col gap-2 py-0.5" aria-label="A carregar o resumo">
              <span className="block h-3 rounded-full w-full" style={{ background: 'rgba(255,255,255,.08)' }} />
              <span className="block h-3 rounded-full w-2/3" style={{ background: 'rgba(255,255,255,.08)' }} />
            </div>
          ) : !first ? (
            <p className="text-[12.5px] leading-[1.45] font-medium" style={{ color: 'var(--text-2)' }}>
              Sem nada a assinalar por agora. Regista uma refeição ou um treino e eu tenho o que comentar.
            </p>
          ) : !expanded ? (
            <p className="text-[12.5px] leading-[1.45] font-medium" style={{ color: 'var(--text-2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {first.text}
            </p>
          ) : (
            <div className="flex flex-col">
              {/* Um fio entre secções: é o que as separa em blocos sem voltar
                  ao carrossel — a cor do rótulo sozinha não chegava. */}
              {messages.map((m, i) => (
                <div key={m.key} style={i ? { borderTop: '1px solid rgba(34,211,238,.12)', marginTop: 10, paddingTop: 10 } : undefined}>
                  <div className="text-[11px] font-extrabold uppercase" style={{ color: m.color, letterSpacing: 'var(--tracking-label)' }}>{m.label}</div>
                  <p className="text-[12.5px] leading-[1.5] font-medium mt-0.5" style={{ color: 'var(--text-2)' }}>{m.text}</p>
                </div>
              ))}
            </div>
          )}

          {(canExpand || expanded) && !loading && (
            <button type="button" onClick={() => setExpanded((e) => !e)} className="inline-flex items-center gap-0.5 min-h-[44px] mt-[3px] text-[11.5px] font-bold" style={{ color: 'var(--coach)' }}>
              {expanded ? 'Ler menos' : 'Ler mais'} {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}

          {expanded && (
            <div className="flex items-center justify-between gap-2 mt-1">
              <button type="button" onClick={() => loadDailySummary({ force: true })} disabled={dailySummaryLoading} aria-label="Atualizar resumo" className="inline-flex items-center gap-1.5 min-h-[44px] text-[11.5px] font-bold" style={{ color: 'var(--text-4)' }}>
                <RefreshCw size={13} className={dailySummaryLoading ? 'animate-spin' : ''} /> Atualizar
              </button>
              {pendingTopics > 0 && onDismissTopic && (
                <button type="button" onClick={onDismissTopic} className="min-h-[44px] text-[11.5px] font-bold" style={{ color: 'var(--text-4)' }}>
                  Dispensar aviso
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
