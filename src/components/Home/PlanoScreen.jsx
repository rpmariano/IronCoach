import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, MessageCircle, Utensils } from 'lucide-react';
import { useAppStore } from '../../store';
import { todayISO, addDaysISO } from '../../lib/utils';
import { computeAcceptedWindow, buildPlanDays } from './WeeklyPlanCard';
import { planWeekLabel, noPlanCopy } from './DayPlanCard';
import { formatDayMonth, formatWeekday, dayTitle, dayStatus, mealsForDay, isRacePlanItem, isUnplannedDay, liveItems, raceNameForDate, trainingItems } from '../../utils/homeModels';
import { isMealOnlyItem } from '@formulas/mealSuggestions.ts';
import MealSheet from './MealSheet';

/* "O plano" — o plano acordado inteiro, dia a dia, em ecrã cheio
   (redesenho 2026-09-15). É para aqui que veio o trabalho do carrossel que
   vivia dentro do cartão "O que faço hoje": lá dava para ver um dia de cada
   vez, sem nunca se perceber a forma da semana nem quanto falta para a
   prova. Os dados são exatamente os mesmos (computeAcceptedWindow +
   buildPlanDays), só que rendidos como lista agrupada por semana.

   Mudar o plano continua a ser conversa com a Carol — o botão do fim leva
   lá, tal como o "Adaptar plano" que este ecrã substituiu. */

/* Segunda-feira da semana ISO a que esta data pertence. */
function weekStartISO(dateISO) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  return addDaysISO(dateISO, -((d.getUTCDay() + 6) % 7));
}

/* "seg", "ter", "sáb" — as três primeiras letras do dia por extenso. O
   date-fns abrevia em pt com ponto ("seg.") e aqui a caixa da data é
   estreita; os sete dias portugueses distinguem-se todos em três letras. */
function shortWeekday(dateISO) {
  return formatWeekday(dateISO).slice(0, 3);
}

/* O estado do dia em uma palavra, como o mock. `dayStatus` dá o tom certo
   (é o mesmo que colore a data no cartão de hoje); aqui só se traduz para
   a etiqueta curta da lista, e um dia sem nada a dizer não leva nenhuma. */
function dayPill(day, today) {
  const status = dayStatus(day, today);
  if (status.tone === 'race') return { text: 'Prova', color: 'var(--race)' };
  if (day.dateISO === today) return { text: 'Hoje', color: 'var(--gym)' };
  if (status.label === 'Concluído') return { text: 'Feito', color: 'var(--ok)' };
  if (status.label === 'Em atraso') return { text: 'Em atraso', color: 'var(--warn)' };
  if (status.label === 'Cancelado') return { text: 'Cancelado', color: 'var(--danger)' };
  return null;
}

/* Os treinos que contam num dia: os vivos (liveItems) — o cancelado do
   bloco antigo ao lado do treino do novo não entra nas contas, senão um
   dia cumprido dava "1/2 feitos" (pedido 2026-09-26). */
const treinosVivos = (d) => trainingItems(liveItems(d.items));

/* O resumo que fica no cabeçalho da semana fechada — é o que torna o
   colapso honesto: sem ele, fechar uma semana esconde informação em vez de
   a arrumar. "2/4" são as sessões dadas; uma semana sem nenhum treino
   planeado diz-se pelo nome, para não se confundir com "0/0 feitos". E a
   semana que ainda está por escrever (as tranches do plano de uma prova)
   diz isso, e não "Sem treinos", que soava a semana de folga decidida. */
function weekSummary(week) {
  const days = week?.days || [];
  const items = days.flatMap(treinosVivos);
  if (items.length === 0) return days.some((d) => d.porPlanear) ? 'Por planear' : 'Sem treinos';
  const done = items.filter((i) => i.status === 'concluido').length;
  return `${done}/${items.length} feitos`;
}

/* O convite no primeiro dia por planear: "este dia" quando é só um, "estes
   dias" quando são vários — dantes era sempre o plural, mesmo para um dia
   só (pedido 2026-09-26). Na voz dela e com energia: é ela a chamar o
   atleta para o trabalho, e ele pode tocar como quem responde "vamos". */
export function convitePlanear(dias) {
  return dias > 1 ? 'Vamos planear estes dias' : 'Vamos planear este dia';
}

/* O que ele diz quando toca no convite (revisão de 2026-09-26). O botão
   lê-se como a resposta dele ("Vamos planear estes dias"), e é isso que
   entra no chat, com os dias por extenso, como se o tivesse escrito lá — o
   `say` que o balanço da prova já usa (RaceBalanceCard). Num pedido dele,
   ela tem as ferramentas todas e propõe o plano desses dias.
   Dantes ia pelo canal dos desvios que a app deteta sozinha
   (plan_divergence), e o servidor abria-lhe a conversa com "A app detetou
   que o plano já não bate certo com a realidade e chamou-te — o atleta
   abriu o chat a partir desse aviso", a pedir-lhe que explicasse o que
   mudou e perguntasse se tinha havido algum motivo. Nada disso era
   verdade: não houve aviso nenhum, foi ele que quis planear. Com o
   contexto errado, a primeira frase dela saía a falar de um desvio que não
   existiu. */
const porExtenso = (iso) => format(parseISO(iso), "d 'de' MMMM", { locale: pt });

export function pedidoPlanear(inicio, fim) {
  if (!fim || fim === inicio) return `Vamos planear o dia ${porExtenso(inicio)}.`;
  return `Vamos planear os dias de ${porExtenso(inicio)} a ${porExtenso(fim)}.`;
}

/* A proposta que já está no chat, por decidir, para os dias [inicio, fim]
   (revisão de 2026-09-26). É o caso de todos os dias num plano de prova: ela
   escreve a tranche seguinte, e até ele a aceitar esses dias continuam
   vazios no plano aceite. O convite pedia-lhe então que planeasse o que ela
   tinha acabado de planear, e ela escrevia outra proposta por cima da
   primeira. Com uma proposta assim, o convite aponta para ela, com as
   palavras do "O que faço hoje" para o mesmo caso (noPlanCopy). As
   sugestões só de refeições não contam: não planeiam treino nenhum. Sem os
   itens carregados, na dúvida, conta. */
export function propostaNoChat(plans, items, inicio, fim) {
  return (plans || []).some((p) => {
    if (p?.status !== 'proposto') return false;
    const ini = String(p.period_start || '').slice(0, 10);
    const fimP = String(p.period_end || '').slice(0, 10);
    if (!ini || !fimP || ini > fim || fimP < inicio) return false;
    const dela = (items || []).filter((i) => i?.plan_id === p.id);
    return dela.length === 0 || dela.some((i) => !isMealOnlyItem(i));
  });
}

function StatTile({ value, suffix, label, testId }) {
  return (
    <div className="flex-1 text-center rounded-[12px]" style={{ padding: '8px 4px', background: 'rgba(255,255,255,.04)', border: '1px solid var(--border-glass)' }}>
      <div data-testid={testId} className="text-[18px] font-black" style={{ color: 'var(--text-1)' }}>
        {value}<span className="text-[11px] font-bold" style={{ color: 'var(--text-4)' }}>{suffix}</span>
      </div>
      <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-4)' }}>{label}</div>
    </div>
  );
}

export default function PlanoScreen({ onClose }) {
  const { coachPlans, coachPlanItems, raceEvents, runs, setActiveTab } = useAppStore();
  const today = todayISO();
  const [mealDay, setMealDay] = useState(null);

  const planWindow = useMemo(() => computeAcceptedWindow(coachPlans, coachPlanItems, today), [coachPlans, coachPlanItems, today]);
  /* Com os planos: um cancelado que o sistema arrumou (bloco antigo
     fechado, prova antecipada) sai do dia, e um plano sem prova conta como
     escrito até ao fim — ver buildPlanDays (pedido 2026-09-26). */
  const days = useMemo(() => {
    if (!planWindow) return [];
    const aceites = (coachPlans || []).filter((p) => p.status === 'aceite');
    const acceptedIds = new Set(aceites.map((p) => p.id));
    return buildPlanDays((coachPlanItems || []).filter((i) => acceptedIds.has(i.plan_id)), planWindow.start, planWindow.days, { plans: aceites, today });
  }, [coachPlans, coachPlanItems, planWindow, today]);

  // Semanas de segunda a domingo, pela ordem em que os dias vêm.
  const weeks = useMemo(() => {
    const out = [];
    days.forEach((d) => {
      const start = weekStartISO(d.dateISO);
      const last = out[out.length - 1];
      if (last && last.start === start) last.days.push(d);
      else out.push({ start, days: [d] });
    });
    return out;
  }, [days]);

  const week = planWeekLabel(planWindow, today);
  const thisWeekStart = weekStartISO(today);
  const currentWeek = weeks.find((w) => w.start === thisWeekStart);

  /* Semanas fechadas por omissão, menos a que está a correr (pedido do
     utilizador: um plano de 10 semanas abria com 70 linhas de dias, e a
     semana de hoje ficava perdida no meio). O estado guarda as semanas
     ABERTAS — assim uma semana que apareça depois (o plano cresce quando a
     Carol detalha o microciclo seguinte) nasce fechada, sem precisar de
     ser reconciliada aqui. */
  const [openWeeks, setOpenWeeks] = useState(() => new Set());
  const initialisedRef = useRef(false);
  useEffect(() => {
    if (initialisedRef.current || weeks.length === 0) return;
    initialisedRef.current = true;
    // Sem semana em curso (plano só no futuro), abre a primeira: um ecrã
    // inteiramente fechado não diz nada a quem acabou de entrar.
    setOpenWeeks(new Set([currentWeek ? currentWeek.start : weeks[0].start]));
  }, [weeks, currentWeek]);

  const toggleWeek = (start) => {
    setOpenWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(start)) next.delete(start);
      else next.add(start);
      return next;
    });
  };

  /* O foco na semana atual: se ela não é a primeira da lista, o ecrã abre
     com ela à vista em vez de obrigar a rolar. `block: 'start'` e não
     `center` — o cabeçalho da semana deve encostar ao topo, com os dias
     dela por baixo. */
  const currentWeekRef = useRef(null);
  const jaRolouRef = useRef(false);
  useEffect(() => {
    // Uma vez só, à entrada: sem esta guarda, abrir ou fechar qualquer
    // semana puxava o ecrã de volta para a de hoje a meio da leitura.
    if (jaRolouRef.current) return undefined;
    if (!currentWeek || weeks[0]?.start === currentWeek.start) return undefined;
    if (!openWeeks.has(currentWeek.start)) return undefined;
    const node = currentWeekRef.current;
    if (!node?.scrollIntoView) return undefined;
    /* Num frame à frente, e não já: o efeito que abre a semana em curso só
       produz o layout novo no commit seguinte, e rolar antes disso media a
       página toda colapsada — o destino saía calculado com as alturas
       erradas e a semana acabava fora do sítio. */
    jaRolouRef.current = true;
    const id = requestAnimationFrame(() => {
      node.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(id);
  }, [currentWeek, weeks, openWeeks]);

  /* Dias por planear: o atleta tem de poder pedir à Carol que os escreva.
     Só os que estão mesmo por escrever (porPlanear, buildPlanDays) — um dia
     que ela deixou livre dentro do plano não é um convite a planeá-lo
     (pedido 2026-09-26). Um convite por dia seria ruído num bloco de cinco
     dias seguidos, por isso só aparece no PRIMEIRO dia de cada bloco
     contíguo, e diz quantos dias leva até ao fim dele. `porPlanear` já
     nunca é verdade no passado, e por isso um bloco nunca começa em
     ontem e perde o convite de hoje. */
  const convites = useMemo(() => {
    const out = new Map();
    let aberto = null;
    days.forEach((d) => {
      if (!d.porPlanear) { aberto = null; return; }
      if (!aberto) {
        aberto = { inicio: d.dateISO, fim: d.dateISO, dias: 0 };
        out.set(d.dateISO, aberto);
      }
      aberto.fim = d.dateISO;
      aberto.dias += 1;
    });
    // Com a tranche seguinte já no chat, o convite aponta para ela (ver
    // propostaNoChat).
    out.forEach((c) => { c.proposta = propostaNoChat(coachPlans, coachPlanItems, c.inicio, c.fim); });
    return out;
  }, [days, coachPlans, coachPlanItems]);

  /* O resumo é sempre da semana em curso. Os quilómetros são os REALMENTE
     corridos (o registo ligado por completed_run_id, o mesmo que fecha o
     dia em dayDone.js) — o alvo do plano só entra quando o treino fechou
     sem corrida ligada (ex.: ginásio, ou um registo antigo sem o campo). Um
     alvo de 10 km cumprido com 14 km reais dizia "10 km esta semana"
     (pedido 2026-09-26). */
  const summary = useMemo(() => {
    const items = (currentWeek?.days || []).flatMap(treinosVivos);
    const done = items.filter((i) => i.status === 'concluido');
    const km = done.reduce((s, i) => {
      const run = (runs || []).find((r) => r?.id === i.completed_run_id);
      const dist = Number(run?.distance_km);
      return s + (dist > 0 ? dist : (Number(i.target_distance_km) || 0));
    }, 0);
    return { done: done.length, total: items.length, km: Math.round(km) };
  }, [currentWeek, runs]);

  /* A prova a que este plano leva: a do race_id do plano aceite (pedido
     2026-09-26). Era a primeira prova da agenda que caía dentro da janela —
     num plano para a Maratona do Porto com a Meia de Lisboa a meio, o
     subtítulo dizia "para a Meia de Lisboa"; um plano sem prova ganhava a
     de qualquer prova de treino lá dentro; e o "para a" posto à frente de
     qualquer nome dava "para a Trail do Sicó". Agora é a prova do plano,
     pelo nome e sem artigo, e nenhuma quando o plano não tem prova. Entre
     vários planos com prova na janela (um bloco que muda de objetivo), o
     que cobre hoje; senão, o que acaba mais tarde. */
  const raceName = useMemo(() => {
    if (!planWindow) return null;
    const end = addDaysISO(planWindow.start, planWindow.days - 1);
    const comProva = (coachPlans || []).filter((p) => p && p.status === 'aceite' && p.race_id
      && String(p.period_start || '').slice(0, 10) <= end && String(p.period_end || '').slice(0, 10) >= planWindow.start);
    const cobreHoje = (p) => String(p.period_start).slice(0, 10) <= today && String(p.period_end).slice(0, 10) >= today;
    const plano = comProva.find(cobreHoje)
      || comProva.slice().sort((a, b) => String(b.period_end).localeCompare(String(a.period_end)))[0];
    if (!plano) return null;
    return (raceEvents || []).find((r) => r && r.id === plano.race_id)?.name || null;
  }, [coachPlans, raceEvents, planWindow, today]);

  const goCoach = (intent) => {
    if (intent) useAppStore.getState().setCoachIntent(intent);
    onClose?.();
    setActiveTab?.('coach');
  };

  const Header = ({ subtitle }) => (
    <div className="flex items-center gap-2.5" style={{ minHeight: 44 }}>
      <button type="button" aria-label="Voltar" onClick={() => onClose?.()} className="flex items-center justify-center shrink-0" style={{ width: 44, height: 44, marginLeft: -10, color: 'var(--text-3)' }}>
        <ChevronLeft size={20} />
      </button>
      <div className="min-w-0">
        <h2 className="text-[16px] font-black" style={{ color: 'var(--text-1)', letterSpacing: '-.02em' }}>O plano</h2>
        {subtitle && <div className="text-[11.5px]" style={{ color: 'var(--text-4)' }}>{subtitle}</div>}
      </div>
    </div>
  );

  if (!planWindow) {
    // O mesmo texto do "O que faço hoje" (DayPlanCard, noPlanCopy): com uma
    // proposta por decidir, ela aponta para a proposta em vez de pedir outra,
    // e fala sempre na primeira pessoa (pedido 2026-09-26).
    const copy = noPlanCopy({
      pendingCount: (coachPlans || []).filter((p) => p?.status === 'proposto').length,
      hadPlan: (coachPlans || []).some((p) => p?.status === 'aceite'),
    });
    return (
      <div className="flex flex-col gap-3 fade-in pb-2" data-testid="plano-screen">
        <Header />
        <div className="rounded-[24px]" style={{ background: 'var(--surface-glass)', border: '1px solid var(--border-glass)', padding: 16 }}>
          <h3 className="text-[16px] font-black leading-[1.15]" style={{ color: 'var(--text-1)', letterSpacing: '-.02em' }}>{copy.title}</h3>
          <p className="text-[12.5px] leading-[1.45] mt-1.5" style={{ color: 'var(--text-3)' }}>
            {copy.body}
          </p>
          <button type="button" onClick={() => goCoach(null)} className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] mt-3 rounded-[11px] text-[12.5px] font-extrabold" style={{ background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)', color: 'var(--coach)' }}>
            <MessageCircle size={15} /> {copy.cta}
          </button>
        </div>
      </div>
    );
  }

  const endISO = addDaysISO(planWindow.start, planWindow.days - 1);
  const subtitle = [`${formatDayMonth(planWindow.start)} – ${formatDayMonth(endISO)}`, raceName].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-2 fade-in pb-2" data-testid="plano-screen">
      <Header subtitle={subtitle} />

      <div className="flex gap-1.5">
        <StatTile testId="plano-sessoes" value={summary.done} suffix={`/${summary.total}`} label="sessões feitas" />
        <StatTile testId="plano-km" value={summary.km} suffix=" km" label="esta semana" />
        <StatTile testId="plano-semana" value={week.current} suffix={`/${week.total}`} label="semana" />
      </div>

      <div className="rounded-[24px]" style={{ background: 'var(--surface-glass)', border: '1px solid var(--border-glass)', padding: '4px 16px 8px', boxShadow: 'var(--shadow-card)' }}>
        {weeks.map((w) => {
          const isOpen = openWeeks.has(w.start);
          const isCurrent = w.start === thisWeekStart;
          const label = isCurrent ? 'Esta semana'
            : w.start === addDaysISO(thisWeekStart, 7) ? 'Próxima semana'
              : `Semana de ${formatDayMonth(w.start)} a ${formatDayMonth(addDaysISO(w.start, 6))}`;
          return (
          <div key={w.start} ref={isCurrent ? currentWeekRef : null} style={{ scrollMarginTop: 12 }}>
            <button
              type="button"
              data-testid={`plano-semana-${w.start}`}
              aria-expanded={isOpen}
              onClick={() => toggleWeek(w.start)}
              className="w-full flex items-center gap-2 text-left"
              style={{ minHeight: 44, padding: '10px 0 6px' }}
            >
              <span className="text-[11px] font-extrabold uppercase flex-1 min-w-0 truncate" style={{ color: isCurrent ? 'var(--text-2)' : 'var(--text-4)', letterSpacing: 'var(--tracking-eyebrow)' }}>
                {label}
              </span>
              <span className="shrink-0 text-[11px] font-bold" style={{ color: 'var(--text-4)' }}>{weekSummary(w)}</span>
              {isOpen
                ? <ChevronUp size={14} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
                : <ChevronDown size={14} style={{ color: 'var(--text-4)', flexShrink: 0 }} />}
            </button>
            {isOpen && w.days.map((d, i) => {
              const pill = dayPill(d, today);
              const meals = mealsForDay(d.items);
              const unplanned = isUnplannedDay(d.items);
              const convite = convites.get(d.dateISO);
              const notes = treinosVivos(d).filter((it) => !isRacePlanItem(it) && typeof it.notes === 'string' && it.notes.trim());
              return (
                <div
                  key={d.dateISO}
                  data-testid={`plano-dia-${d.dateISO}`}
                  className="flex gap-3"
                  style={{
                    padding: '12px 0',
                    borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,.08)',
                    ...(d.isToday ? { margin: '0 -16px', padding: '12px 16px', background: 'rgba(158,195,210,.06)', borderTopColor: 'rgba(158,195,210,.2)' } : null),
                  }}
                >
                  <div className="flex flex-col items-center justify-center shrink-0 rounded-[12px]" style={{ width: 44, height: 44, background: d.isToday ? 'rgba(158,195,210,.16)' : 'rgba(255,255,255,.06)', border: `1px solid ${d.isToday ? 'rgba(158,195,210,.4)' : 'var(--border-glass-strong)'}`, color: 'var(--text-2)' }}>
                    <b className="text-[15px] font-black leading-none">{d.dateISO.slice(8, 10)}</b>
                    <small className="text-[11px] font-extrabold uppercase leading-none mt-[3px]">{shortWeekday(d.dateISO)}</small>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-extrabold" style={{ color: unplanned ? 'var(--text-4)' : 'var(--text-1)' }}>{dayTitle(d.items, raceNameForDate(raceEvents, d.dateISO), { porPlanear: d.porPlanear })}</div>
                    {convite && (convite.proposta ? (
                      <button
                        type="button"
                        data-testid={`plano-proposta-${d.dateISO}`}
                        onClick={() => goCoach(null)}
                        className="inline-flex items-center gap-1.5 min-h-[44px] -my-[7px] text-[11.5px] font-bold text-left"
                        style={{ color: 'var(--coach)' }}
                      >
                        <MessageCircle size={13} />
                        A proposta está no chat
                        <ChevronRight size={12} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        data-testid={`plano-pedir-${d.dateISO}`}
                        onClick={() => goCoach({ kind: 'say', text: pedidoPlanear(convite.inicio, convite.fim) })}
                        className="inline-flex items-center gap-1.5 min-h-[44px] -my-[7px] text-[11.5px] font-bold text-left"
                        style={{ color: 'var(--coach)' }}
                      >
                        <MessageCircle size={13} />
                        {convitePlanear(convite.dias)}
                        <ChevronRight size={12} />
                      </button>
                    ))}
                    {notes.map((it) => (
                      <p key={it.id} className="text-[12px] leading-[1.45] mt-[3px]" style={{ color: 'var(--text-3)', whiteSpace: 'pre-line' }}>{it.notes.trim()}</p>
                    ))}
                    {meals && (
                      <button type="button" data-testid={`plano-refeicoes-${d.dateISO}`} onClick={() => setMealDay({ dateISO: d.dateISO, items: d.items })} className="inline-flex items-center gap-1.5 min-h-[44px] -my-[7px] text-[11.5px] font-bold" style={{ color: 'var(--text-4)' }}>
                        <Utensils size={13} style={{ color: 'var(--gym)' }} />
                        Refeições sugeridas{meals.kcal ? ` · ~${meals.kcal} kcal` : ''}
                        <ChevronRight size={12} />
                      </button>
                    )}
                  </div>

                  {pill && <span className="shrink-0 self-start text-[11px] font-extrabold uppercase mt-0.5" style={{ color: pill.color, letterSpacing: '.04em' }}>{pill.text}</span>}
                </div>
              );
            })}
          </div>
          );
        })}
      </div>

      <button type="button" data-testid="plano-adaptar" onClick={() => goCoach('adapt_plan')} className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] mt-1 rounded-[11px] text-[12.5px] font-extrabold" style={{ background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)', color: 'var(--coach)' }}>
        Adaptar o plano com a Carol
      </button>

      {mealDay && <MealSheet day={mealDay} onClose={() => setMealDay(null)} />}
    </div>
  );
}
