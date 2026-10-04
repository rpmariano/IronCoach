import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, Flag, ChevronRight, Footprints, Zap, Utensils, TrendingUp, Target, Sunrise } from 'lucide-react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { calculateReadinessIndex } from '../../utils/biEngine';
import { todayISO } from '../../lib/utils';
import { useAppStore, sliceReady } from '../../store';
import { useRevealAnimation } from '../../utils/useRevealAnimation';
import { useCountUpDisplay } from '../../utils/useCountUp';
import { DUR_COUNT_REVEAL } from '../../utils/introAnimations';
import { calculateRaceTrainingPlan } from '../../utils/racePlanEngine';
import { buildTrailModel } from '../../utils/homeModels';
import { focusRace } from '@formulas/mainRace.ts';
import { PILLAR_GLOSSARY } from '../../utils/glossary';
import { readinessHint } from '../../utils/readinessHints';

/* Ponto 3 do redesenho: os pilares tinham emoji (🏃 ⚡ 🥗 📈 🎯). Passam a
   lucide, cada um na cor do que mede — os dois de nutrição/energia no roxo
   da nutrição, os de corrida no ciano da corrida. A tática é da prova. */
const PILLAR_ICONS = {
  acwr: <Footprints size={13} style={{ color: 'var(--run)' }} />,
  ea: <Zap size={13} style={{ color: 'var(--nutrition)' }} />,
  calories: <Utensils size={13} style={{ color: 'var(--nutrition)' }} />,
  vdot: <TrendingUp size={13} style={{ color: 'var(--run)' }} />,
  tactic: <Target size={13} style={{ color: 'var(--race)' }} />,
  checkin: <Sunrise size={13} style={{ color: 'var(--coach)' }} />,
};

/* 2026-10-04 (F5, animação ao ficar visível — plano §2.1, ponto 7): o anel e
   as barras dos pilares não tinham entrada nenhuma. Passam a desenhar-se a
   partir de zero quando o cartão fica à vista com o separador assente (o
   gatilho é o do useRevealAnimation em modo separador), com o % a contar ao
   mesmo ritmo (DUR_COUNT_REVEAL, 800 ms), e a voltar a zero ao rearmar (o
   separador saiu há mais de ~3 s e o cartão já não se vê — fica à espera,
   no estado zero, da próxima visita). Com reduced-motion nada anima e tudo
   aparece já no valor final. Fora do carrossel (sem TabPageContext) o hook
   está no modo antigo, sem `active`: o cartão fica como era. */

// Fatia que o cartão lê e que o separador Geral não lista (os check-ins).
const READINESS_EXTRA_SLICES = ['checkins'];

/** O número em %, que conta de 0 ao valor quando `animate` e se remonta com
 *  `key={playKey}` a cada reveal. Armado (`zero`) mostra "0%" — o valor real
 *  fica num texto só para o leitor de ecrã, como no BigNumber do ChartFrame. */
function CountPct({ value, animate, zero }) {
  const shown = useCountUpDisplay(value, { animate, duration: DUR_COUNT_REVEAL, decimals: 0 });
  if (zero) {
    return (
      <>
        <span aria-hidden="true">0%</span>
        <span className="sr-only">{value}%</span>
      </>
    );
  }
  return <>{shown}%</>;
}

export default function RaceReadinessCard({ runs, meals, bodyAssessments, gymSessions, raceEvents, profile, onClickRace, coachPlans, coachPlanItems }) {
  const [selectedPillar, setSelectedPillar] = useState(null);

  const extraReady = useAppStore((st) => sliceReady(st, READINESS_EXTRA_SLICES));
  const reveal = useRevealAnimation({ ready: extraReady });
  const reduced = !!reveal.reduced;
  // Há movimento a gerir só dentro do carrossel da Evolução e sem reduced-motion.
  const motion = reveal.active === true && !reduced;
  // Zero até ao 1.º reveal e depois de rearmar.
  const hold = motion && (reveal.seen === false || reveal.armed === true);
  // `drawn` liga num rAF DEPOIS do reveal: o cartão aparece primeiro no zero
  // e só então muda para o valor, que é o que dispara a transição CSS.
  const [drawn, setDrawn] = useState(!motion);
  useEffect(() => {
    if (!motion) { setDrawn(true); return undefined; }
    if (hold) { setDrawn(false); return undefined; }
    if (typeof requestAnimationFrame !== 'function') { setDrawn(true); return undefined; }
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, [motion, hold, reveal.playKey]);
  // Em zero: ao rearmar volta já, no mesmo render (sem um frame de valor cheio).
  const atFinal = !motion || (!hold && drawn);
  // A transição só vale a subir; a descer (rearmar) é instantânea, fora de vista.
  const animateIn = motion && atFinal;
  // O anel e os pilares ficam transparentes até ao 1.º reveal (opacity, nunca
  // visibility:hidden: o valor tem de continuar no leitor de ecrã); o texto
  // do cartão (prova, fase, dias) fica sempre à vista. O ref vai no cartão
  // todo: o critério de "à vista" é sobre ele, não só sobre o anel.
  const fadeStyle = motion ? { ...reveal.style, transition: 'opacity var(--dur-tap) var(--ease-out)' } : undefined;
  // O dia de Lisboa, como o resto da app: a data UTC ainda é ontem entre a
  // meia-noite e a 01:00, e a prova de ontem aparecia com "Faltam -1 dias"
  // (revisão de 2026-09-26).
  const today = todayISO();
  const nextRace = useMemo(() => {
    if (!raceEvents?.length) return null;
    // 2026-09-26 (Fase 0 do Troféu): igual ao ramo "Reta Final" de
    // biEngine.js detectCoachInsights — entre as provas futuras, a
    // PRINCIPAL manda sobre a mais próxima por data, senão uma prova de
    // treino marcada para amanhã "roubava" a prontidão à prova-objetivo.
    // A régua é focusRace de @formulas/mainRace.ts (revisão da Fase 0: uma
    // só régua para o cliente e o servidor, em vez de a reimplementar aqui).
    return focusRace(raceEvents, today);
  }, [raceEvents, today]);

  const dailyCheckins = useAppStore((s) => s.dailyCheckins);
  // Há treino previsto hoje (pedido 2026-09-26)? Para o pilar "Como
  // acordaste" não dizer "hoje o treino é mais leve" num dia de descanso.
  // Sem plano aceite em vigor hoje não se sabe se é descanso: undefined, e o
  // pilar não o afirma (revisão pré-deploy de 2026-09-26). Um plano só de
  // refeições (dias de `descanso`, save_meal_suggestions) não conta: não
  // decide descansos (segunda revisão).
  const trainingToday = useMemo(() => {
    const comTreino = new Set((coachPlanItems || []).filter((i) => (i?.kind === 'corrida' || i?.kind === 'ginasio') && i.status !== 'cancelado').map((i) => i.plan_id));
    const emVigor = (coachPlans || []).filter((p) => p?.status === 'aceite' && comTreino.has(p.id)
      && String(p.period_start || '').slice(0, 10) <= today && String(p.period_end || '').slice(0, 10) >= today);
    if (!emVigor.length) return undefined;
    const aceites = new Set(emVigor.map((p) => p.id));
    return (coachPlanItems || []).some((i) => i && aceites.has(i.plan_id) && i.planned_date === today
      && (i.kind === 'corrida' || i.kind === 'ginasio') && i.status !== 'cancelado');
  }, [coachPlans, coachPlanItems, today]);
  const readiness = useMemo(() =>
    calculateReadinessIndex(runs, meals, bodyAssessments, gymSessions, profile, nextRace, dailyCheckins, trainingToday),
    [runs, meals, bodyAssessments, gymSessions, profile, nextRace, dailyCheckins, trainingToday]
  );

  // Em dias de calendário, com a mesma função do biEngine, para os dois não
  // discordarem: differenceInDays truncava as horas e, na véspera às 10:00,
  // já dizia "É hoje" (revisão de 2026-09-26).
  const daysLeft = nextRace ? differenceInCalendarDays(parseISO(nextRace.date), parseISO(today)) : null;

  /* Ponto 6 do redesenho: "Prontidão com o bloco da prova". O cartão dizia
     só o nome e os dias que faltam; passa a dizer também em que FASE do
     macrociclo se está e em que SEMANA — a mesma informação que o trilho do
     Início mostra. Não se recalcula nada aqui: reaproveita-se o
     calculateRaceTrainingPlan (racePlanEngine) e o buildTrailModel
     (homeModels) que o Início já usa, para os dois ecrãs não poderem
     divergir. Sem prova, `trail` é null e o bloco inteiro não aparece. */
  const trail = useMemo(() => {
    if (!nextRace) return null;
    try {
      const plan = calculateRaceTrainingPlan({ race: nextRace, profile: profile || {}, runs: runs || [] });
      return plan ? buildTrailModel(plan) : null;
    } catch (e) {
      // Uma prova com datas impossíveis não pode partir o cartão inteiro:
      // sem plano, mostra-se só o nome e os dias, como antes.
      return null;
    }
  }, [nextRace, profile, runs]);

  /* Prontidão alta/média/baixa = dentro do alvo / atenção / erro. A média
     era âmbar (#f59e0b) — o âmbar é da prova; atenção é o coral --warn. */
  const LEVEL_CONFIG = {
    high: { color: 'var(--ok)', label: 'Alta' },
    medium: { color: 'var(--warn)', label: 'Média' },
    low: { color: 'var(--danger)', label: 'Baixa' },
  };
  /* "A calibrar" (auditoria de onboarding, 2026-09-27): sem nenhum pilar de
     treino, nutrição ou prova com dados, o score não diz nada. Mostrava
     "18% · Baixa" a vermelho a quem tinha registado 2 corridas — lê-se
     "estás mal preparado" quando a verdade é "ainda não sei". O motor
     (readinessIndex.ts) já não conta os pilares sem dados; aqui só se
     deixa de pintar um número que não existe. */
  const calibrating = !!readiness.calibrating;
  const NO_DATA = { color: 'var(--text-3)', label: 'a calibrar' };
  const cfg = calibrating ? NO_DATA : (LEVEL_CONFIG[readiness.level] || LEVEL_CONFIG.low);
  const hint = readinessHint(readiness);

  // SVG circle ring math
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const progress = circumference - ((calibrating ? 0 : readiness.score) / 100) * circumference;

  const HeaderComponent = nextRace && onClickRace ? 'button' : 'div';
  const headerProps = HeaderComponent === 'button' ? { 
    onClick: () => onClickRace(nextRace.id),
    className: "w-full text-left flex items-start gap-4 active:scale-[0.98] transition-transform cursor-pointer"
  } : {
    className: "w-full text-left flex items-start gap-4"
  };

  return (
    <div ref={motion ? reveal.ref : undefined} className="w-full bg-[var(--surface-glass)] backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)]">
      {/* Header */}
      <HeaderComponent {...headerProps}>
        {/* Ring */}
        <div className="relative shrink-0 w-20 h-20" style={fadeStyle}>
          <svg viewBox="0 0 88 88" className="w-20 h-20 -rotate-90">
            <circle cx="44" cy="44" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" strokeDasharray={calibrating ? '4 6' : undefined} />
            <circle
              cx="44" cy="44" r={radius}
              fill="none"
              stroke={cfg.color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={atFinal ? progress : circumference}
              style={{ transition: animateIn ? `stroke-dashoffset ${DUR_COUNT_REVEAL}ms var(--ease-out)` : 'none' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-black leading-none" style={{ color: cfg.color }}>{calibrating ? '—' : <CountPct key={reveal.playKey} value={readiness.score} animate={motion && !!reveal.animate} zero={hold} />}</span>
            <span className="text-[11px] text-[var(--text-3)] font-semibold mt-0.5">Prontidão</span>
          </div>
        </div>

        {/* Race info or generic */}
        <div className="flex-1 min-w-0">
          {nextRace ? (
            <>
              <div className="flex items-center gap-1.5 mb-1">
                <Trophy className="w-3.5 h-3.5 text-[var(--race)] shrink-0" />
                <span className="text-[11px] text-[var(--race)] font-bold uppercase tracking-wider">Próxima Prova</span>
              </div>
              <p className="text-sm font-bold text-white leading-tight truncate">{nextRace.name || nextRace.race_name || 'Prova'}</p>
              {trail?.phaseName && (
                <p
                  data-testid="readiness-race-phase"
                  className="text-[11px] font-semibold mt-0.5 truncate"
                  style={{ color: 'var(--race)' }}
                >
                  {trail.phaseName}
                  {trail.weekLabel ? ` · ${trail.weekLabel}` : ''}
                </p>
              )}
              <p className="text-[11px] text-[var(--text-3)] font-medium mt-0.5">
                {daysLeft === 0 ? 'É hoje' : daysLeft === 1 ? 'Amanhã' : `Faltam ${daysLeft} dias`}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 mb-1">
                <Flag className="w-3.5 h-3.5 text-[var(--text-3)] shrink-0" />
                <span className="text-[11px] text-[var(--text-3)] font-bold uppercase tracking-wider">Forma Geral</span>
              </div>
              <p className="text-sm font-bold text-white leading-tight">Nenhuma prova agendada</p>
              <p className="text-[11px] text-[var(--text-3)] mt-0.5">Adiciona uma prova para ver a prontidão direcionada</p>
            </>
          )}
          <div className="mt-2 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold" style={{ color: cfg.color }} data-testid="readiness-level">
                Prontidão {cfg.label}
              </span>
              {nextRace && (
                <span className="text-[11px] text-[var(--text-3)] font-medium"> — {nextRace.distance_km || '?'}km</span>
              )}
            </div>
            {HeaderComponent === 'button' && (
              <ChevronRight className="w-4 h-4 text-[var(--text-3)]" />
            )}
          </div>
        </div>
      </HeaderComponent>

      {hint && (
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-3)]" data-testid="readiness-hint">{hint}</p>
      )}

      {/* Pillar breakdown */}
      <div className="mt-4 grid grid-cols-2 gap-2" style={fadeStyle}>
        {readiness.pillars.map(pillar => {
          // Um pilar sem dados não tem nota: "—" e a barra vazia, sem o 0%
          // a vermelho (auditoria de onboarding, 2026-09-27).
          const noData = pillar.hasData === false;
          const pCfg = noData ? NO_DATA : pillar.score >= 75 ? LEVEL_CONFIG.high : pillar.score >= 45 ? LEVEL_CONFIG.medium : LEVEL_CONFIG.low;
          return (
            <div 
              key={pillar.key} 
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPillar(pillar);
              }}
              className="bg-[var(--surface-glass)] rounded-xl p-2.5 border border-[var(--border-glass)] cursor-pointer hover:bg-[var(--surface-strong)] transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-[var(--text-3)] font-semibold truncate pr-1 flex items-center gap-1.5">
                  <span className="flex shrink-0" aria-hidden="true">{PILLAR_ICONS[pillar.key]}</span>
                  <span className="truncate">{pillar.label}</span>
                </span>
                {/* 12,5px: é um número que o atleta lê de relance, não uma
                    etiqueta — o handoff manda subir acima do piso nesses
                    casos (ponto 2, "12px para dados lidos em movimento"). */}
                <span className="text-[12.5px] font-bold shrink-0" style={{ color: pCfg.color }}>{noData ? '—' : <CountPct key={reveal.playKey} value={pillar.score} animate={motion && !!reveal.animate} zero={hold} />}</span>
              </div>
              {/* Cresce por transform, não por width: animar width obriga o
                  browser a refazer layout a cada frame (as barras são
                  várias e crescem ao mesmo tempo). scaleX com origem à
                  esquerda dá o mesmo desenho e fica no compositor.
                  --dur-bars/--ease-out em vez de 0.8s ease: é a mesma
                  barra a crescer que o resto do redesenho. */}
              <div className="h-1 bg-[var(--surface-strong)] rounded-full overflow-hidden">
                <div
                  className="h-full w-full rounded-full"
                  style={{
                    background: pCfg.color,
                    transform: `scaleX(${noData || !atFinal ? 0 : Math.max(0, Math.min(100, pillar.score)) / 100})`,
                    transformOrigin: 'left',
                    // Nunca com reduced-motion; em modo separador só a subir.
                    transition: reduced || (motion && !animateIn) ? 'none' : 'transform var(--dur-bars) var(--ease-out)',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {selectedPillar && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm fade-in"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedPillar(null);
          }}
        >
          <div 
            className="bg-[var(--bg-sheet)] border border-[var(--border-glass)] rounded-3xl p-6 w-full max-w-sm shadow-2xl scale-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="flex" aria-hidden="true">{PILLAR_ICONS[selectedPillar.key]}</span>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">{selectedPillar.label}</h3>
              </div>
              <span className="text-sm font-bold" style={{
                color: selectedPillar.hasData === false ? 'var(--text-3)'
                  : selectedPillar.score >= 75 ? 'var(--ok)'
                  : selectedPillar.score >= 45 ? 'var(--warn)' : 'var(--danger)',
              }}>{selectedPillar.hasData === false ? 'Sem dados' : `${selectedPillar.score}%`}</span>
            </div>
            
            <p className="text-sm text-[var(--text-3)] leading-relaxed mb-4">
              {selectedPillar.desc}
            </p>

            {/* O que o pilar mede: o nome chega cortado a 375px e os title="…"
                não existem num ecrã tátil (auditoria de onboarding). */}
            {PILLAR_GLOSSARY[selectedPillar.key] && (
              <p className="text-[12px] text-[var(--text-3)] leading-relaxed mb-6 pt-3 border-t border-[var(--border-glass)]" data-testid="pillar-glossary">
                {PILLAR_GLOSSARY[selectedPillar.key]}
              </p>
            )}
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPillar(null);
              }}
              className="w-full py-3 bg-[var(--surface-strong)] hover:bg-white/20 active:bg-[var(--surface-glass)] text-white text-sm font-bold rounded-2xl transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
