import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Flag, Medal, Plus, Target, Trophy } from 'lucide-react';
import { todayISO } from '../../lib/utils';
import { findRaceRun, formatDuration, formatPace } from '../../utils/run';
import { classifyRaceOutcome } from '../../utils/raceOutcome';
import { achievementsForRace } from '../../utils/achievements';
import { calculateRaceTrainingPlan } from '../../utils/racePlanEngine';
import { buildTrailModel } from '../../utils/homeModels';
import GlassCard from '../shared/GlassCard';
import RaceTrail from '../shared/RaceTrail';
import CarouselDots from '../shared/CarouselDots';
import { AchievementChip } from '../shared/AchievementCard';
import { useIntroAnimation } from '../../utils/introAnimations';
import { useCountUpText } from '../../utils/useCountUp';

/* "Para onde vou" — o cartão da prova (mock "Início"): nome em âmbar, a
   fase atual, "semana 6 de 18", os dias em número grande, o trilho do
   macrociclo e, com mais de uma prova, setas e pontos. Toca-se para abrir
   o hub. O âmbar é da prova e só da prova. */
/* Os dias que faltam, a contar (--dur-count). Em componente próprio para o
   rAF viver depois do `if (!race)` do cartão. */
function DaysCount({ days, animate }) {
  return <>{useCountUpText(days, { animate })}</>;
}

/* A partir do dia da prova, o cartão deixa de ser "para onde vou" e passa a
   ser "o que ficou por registar": a prova mantém-se aqui até 7 dias depois
   enquanto não houver uma corrida ligada a ela (specs/prova-concluida.md §3).
   Depois disso sai — o sítio dela passa a ser o hub. */
const DIAS_A_ESPERAR_PELO_REGISTO = 7;

function diasEntre(a, b) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

function rotuloDoDia(dias) {
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}

/* O dia a seguir à prova (specs/gamificacao-provas.md §3). Com a corrida já
   ligada não há nada a registar nem contagem nenhuma para a frente: o cartão
   passa a olhar para trás por uns dias — o tempo, a ordem da prova no
   palmarés, as conquistas que ela deu — e dá as duas saídas que fazem
   sentido, as memórias e a próxima prova. Sem trilho: o ciclo fechou. */
function ProvaConcluidaCard({ race, run, outcome, ordem, conquistas, dias, onOpenRace, onCreateRace }) {
  const tempo = outcome?.officialSeconds ? formatDuration(outcome.officialSeconds) : null;
  const ritmo = outcome?.officialSeconds && outcome?.distanceKm
    ? `${formatPace(Math.round(outcome.officialSeconds / outcome.distanceKm))}/km`
    : null;
  const objetivo = outcome?.targetSeconds ? `objetivo ${formatDuration(outcome.targetSeconds)}` : null;
  const linha = [tempo, ritmo, objetivo].filter(Boolean).join(' · ');

  return (
    <GlassCard glow tone="race" padding="16px" data-testid="race-card-completed">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <span
            aria-hidden="true"
            className="shrink-0 inline-flex items-center justify-center"
            style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--grad-race)', color: 'var(--race-ink)' }}
          >
            <Trophy size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold uppercase truncate" style={{ color: 'var(--race)', letterSpacing: '.05em' }}>
              {`Prova concluída · ${rotuloDoDia(dias)}`}
            </div>
            <div className="text-[17px] font-black leading-[1.1] mt-1 truncate" style={{ color: 'var(--text-1)' }}>{race.name}</div>
            {linha && (
              <div className="text-[11.5px] mt-[3px]" style={{ color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{linha}</div>
            )}
          </div>
        </div>
        {ordem > 0 && (
          <div className="text-right shrink-0">
            <div className="text-[26px] font-black leading-none" style={{ color: 'var(--race)', fontVariantNumeric: 'tabular-nums' }}>{`${ordem}.ª`}</div>
            <div className="text-[11px] font-extrabold uppercase mt-0.5" style={{ color: 'var(--race)', letterSpacing: '.05em' }}>prova</div>
          </div>
        )}
      </div>

      {conquistas.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3" data-testid="race-card-chips">
          {conquistas.map((c) => (
            <AchievementChip key={c.key} label={c.name} tone={c.tone} Icon={c.Icon} testId={`race-card-chip-${c.key}`} />
          ))}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <button
          type="button"
          data-testid="race-card-memories"
          onClick={() => onOpenRace?.(race.id)}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-[11px] text-[12.5px] font-extrabold"
          style={{ minHeight: 44, background: 'var(--tint-race-bg)', border: '1px solid var(--tint-race-bd)', color: 'var(--race)' }}
        >
          <Medal size={15} /> Ver memórias
        </button>
        <button
          type="button"
          data-testid="race-card-next"
          onClick={() => onCreateRace?.()}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-[11px] text-[12.5px] font-bold"
          style={{ minHeight: 44, background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-3)' }}
        >
          <Plus size={15} /> Próxima prova
        </button>
      </div>
    </GlassCard>
  );
}

export default function RaceCard({ raceEvents = [], runs = [], profile = {}, onOpenRace, onCreateRace, onRegisterRace }) {
  const today = todayISO();
  // Uma prova está registada quando há uma corrida ligada a ela — por
  // race_id, ou pela data nos registos antigos (ver findRaceRun).
  const estaRegistada = useMemo(() => {
    const registadas = new Set((raceEvents || []).filter((e) => findRaceRun(runs, e)).map((e) => e.id));
    return (id) => registadas.has(id);
  }, [raceEvents, runs]);
  const upcoming = useMemo(
    () => (raceEvents || [])
      .filter((e) => {
        if (!e?.date) return false;
        if (e.date >= today) return e.status !== 'concluida';
        return diasEntre(today, e.date) <= DIAS_A_ESPERAR_PELO_REGISTO && !estaRegistada(e.id);
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5),
    [raceEvents, today, estaRegistada],
  );
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(0, upcoming.length - 1));
  const race = upcoming[safeIndex];

  /* O dia a seguir (specs/gamificacao-provas.md §3): a prova mais recente já
     registada fica aqui até se marcar a próxima ou até passarem 7 dias, o
     que vier primeiro. "Marcar a próxima" é precisamente ter de novo alguma
     coisa em `upcoming` — uma prova por correr, ou outra por registar; nesse
     caso o Início volta a olhar para a frente, que é a função dele. */
  const concluida = useMemo(() => {
    if (upcoming.length) return null;
    return (raceEvents || [])
      .filter((e) => e?.date && e.date <= today && e.status === 'concluida'
        && diasEntre(today, e.date) <= DIAS_A_ESPERAR_PELO_REGISTO && estaRegistada(e.id))
      .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  }, [raceEvents, today, estaRegistada, upcoming.length]);

  const concluidaModel = useMemo(() => {
    if (!concluida) return null;
    const run = findRaceRun(runs, concluida);
    const outcome = classifyRaceOutcome({ race: concluida, run, runs, profile });
    const conquistas = achievementsForRace({ raceEvents, runs, profile }, concluida.id);
    // "Previsão batida" não é uma conquista do palmarés — é a leitura do
    // treino (raceOutcome.vsTraining) e lê-se ao lado delas.
    if (outcome?.vsTraining === 'acima') {
      conquistas.push({ key: 'previsao_batida', name: 'Previsão batida', tone: 'ok', Icon: Target });
    }
    const ordem = (raceEvents || []).filter((e) => e?.date && e.status === 'concluida'
      && e.date <= concluida.date && estaRegistada(e.id)).length;
    return { run, outcome, conquistas, ordem, dias: diasEntre(today, concluida.date) };
  }, [concluida, raceEvents, runs, profile, today, estaRegistada]);

  /* Ponto 9, animação 2: os dias que faltam contam à primeira entrada da
     sessão. Ao trocar de prova nas setas já não conta — é a mesma leitura. */
  const intro = useIntroAnimation('home-race-days');

  const model = useMemo(() => {
    if (!race) return null;
    return buildTrailModel(calculateRaceTrainingPlan({ race, profile, runs, todayISO: today }));
  }, [race, profile, runs, today]);

  if (!race && concluida) {
    return (
      <ProvaConcluidaCard
        race={concluida}
        run={concluidaModel.run}
        outcome={concluidaModel.outcome}
        ordem={concluidaModel.ordem}
        conquistas={concluidaModel.conquistas}
        dias={concluidaModel.dias}
        onOpenRace={onOpenRace}
        onCreateRace={onCreateRace}
      />
    );
  }

  if (!race) {
    return (
      <GlassCard tone="race" glow data-testid="race-card-empty">
        <div className="flex items-center gap-2">
          <Flag size={16} style={{ color: 'var(--race)' }} />
          <div className="text-[11px] font-extrabold uppercase" style={{ color: 'var(--race)', letterSpacing: '.05em' }}>Sem prova marcada</div>
        </div>
        <p className="text-[12.5px] leading-[1.45] mt-2" style={{ color: 'var(--text-3)' }}>
          Sem uma prova marcada não consigo montar um plano com fases. Diz-me a distância e a data, e trato do resto.
        </p>
        <button type="button" onClick={onCreateRace} className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] mt-3 rounded-[11px] text-[12.5px] font-extrabold" style={{ background: 'var(--tint-race-bg)', border: '1px solid var(--tint-race-bd)', color: 'var(--race)' }}>
          Marcar a próxima prova
        </button>
      </GlassCard>
    );
  }

  // A prova já chegou (é hoje ou já passou) e não tem corrida ligada: o que
  // falta aqui é o registo, não a contagem decrescente.
  const porRegistar = race.date <= today && !estaRegistada(race.id);
  const jaPassou = race.date < today;

  return (
    <GlassCard glow tone="race" padding="16px 16px 12px" data-testid="race-card">
      <div role="button" tabIndex={0} onClick={() => onOpenRace?.(race.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpenRace?.(race.id); }} className="cursor-pointer">
        <div className="flex items-end justify-between gap-2.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 -ml-1">
              {upcoming.length > 1 && (
                <button type="button" aria-label="Prova anterior" disabled={safeIndex === 0} onClick={(e) => { e.stopPropagation(); setIndex(safeIndex - 1); }} className="flex items-center justify-center rounded-full disabled:opacity-30 -my-3" style={{ width: 44, height: 44, color: 'var(--race)' }}>
                  <ChevronLeft size={17} />
                </button>
              )}
              <div className="text-[11px] font-extrabold uppercase truncate" style={{ color: 'var(--race)', letterSpacing: '.05em' }}>{race.name}</div>
              {upcoming.length > 1 && (
                <button type="button" aria-label="Prova seguinte" disabled={safeIndex >= upcoming.length - 1} onClick={(e) => { e.stopPropagation(); setIndex(safeIndex + 1); }} className="flex items-center justify-center rounded-full disabled:opacity-30 -my-3" style={{ width: 44, height: 44, color: 'var(--race)' }}>
                  <ChevronRight size={17} />
                </button>
              )}
            </div>
            <div className="text-[17px] font-black leading-[1.1] mt-1 truncate" style={{ color: 'var(--text-1)' }}>
              {porRegistar && jaPassou ? 'Prova por registar' : model.phaseName}
            </div>
            {porRegistar && jaPassou ? (
              <div className="text-[11.5px] mt-[3px] whitespace-nowrap" style={{ color: 'var(--text-3)' }}>
                {`correste há ${diasEntre(today, race.date)} ${diasEntre(today, race.date) === 1 ? 'dia' : 'dias'}`}
              </div>
            ) : model.weekLabel ? (
              <div className="text-[11.5px] mt-[3px] whitespace-nowrap" style={{ color: 'var(--text-3)' }}>{model.weekLabel}</div>
            ) : null}
          </div>
          {/* Um "0 dias" grande numa prova que já foi corrida não diz nada —
              o troféu diz. */}
          {porRegistar && jaPassou ? (
            <div className="shrink-0 flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--tint-race-bg)', border: '1px solid var(--tint-race-bd)', color: 'var(--race)' }}>
              <Trophy size={20} />
            </div>
          ) : (
            <div className="text-right shrink-0">
              <div className="text-[26px] font-black leading-none" style={{ color: 'var(--race)', fontVariantNumeric: 'tabular-nums' }}><DaysCount days={model.days} animate={intro} /></div>
              <div className="text-[11px] font-extrabold uppercase mt-0.5" style={{ color: 'var(--race)', letterSpacing: '.05em' }}>{model.days === 1 ? 'dia' : 'dias'}</div>
            </div>
          )}
        </div>
        <RaceTrail raceId={race.id} weeks={model.weeks} current={model.current} phases={model.phases} startLabel={model.startLabel} endLabel={model.endLabel} />
      </div>

      {/* A ação do dia da prova: âmbar cheio, porque é a única coisa que
          interessa fazer a partir daqui. */}
      {porRegistar && (
        <button
          type="button"
          data-testid="race-card-register"
          onClick={(e) => { e.stopPropagation(); onRegisterRace?.(race.id); }}
          className="w-full inline-flex items-center justify-center gap-2 mt-3 rounded-[11px] text-[12.5px] font-extrabold"
          style={{ minHeight: 44, background: 'var(--grad-race)', color: 'var(--race-ink)', border: 'none' }}
        >
          <Trophy size={15} /> Registar a prova
        </button>
      )}
      {upcoming.length > 1 && (
        <div className="flex justify-center mt-2.5 -mb-1 min-h-[24px] items-center">
          <CarouselDots count={upcoming.length} currentIndex={safeIndex} onSelect={setIndex} ariaLabelPrefix="Ver prova" />
        </div>
      )}
    </GlassCard>
  );
}
