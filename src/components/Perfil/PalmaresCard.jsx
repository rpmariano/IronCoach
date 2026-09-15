import React, { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useAppStore } from '../../store';
import { achievementsForRace, completedRaces } from '../../utils/achievements';
import { computeMedalhoes } from '../../utils/medalhoes';
import { formatDuration } from '../../utils/run';
import { formatDatePTShort } from '../../utils/racePlanEngine';
import { todayISO } from '../../lib/utils';
import { AchievementIcon } from '../shared/AchievementCard';
import Medalhao, { slotValueText } from '../shared/Medalhao';
import SectionLabel from '../shared/SectionLabel';
import { Sheet } from '../shared/Sheet';
import MedalhaoSheet from './MedalhaoSheet';
import MedalhaoContribSheet from './MedalhaoContribSheet';

/* O Palmarés, no separador Provas — os medalhões (specs/palmares-medalhoes.md
   §"Onde aparece", mock "Palmarés — os medalhões"). Substituiu a linha das
   cinco conquistas com cadeados: nada ali era de que um corredor se
   orgulhasse. As conquistas continuam no hub e na RecordConfirmation.

   De cima para baixo:
   1. o medalhão herói — o que está mais perto da próxima medalha
      (`heroKey`, decidido em utils/medalhoes.js), com a fita, a legenda dos
      4 encaixes e a frase de progresso, que abre a persiana dele;
   2. a coleção — os outros 5, pequenos, sem fita; cada um abre a sua;
   3. "As provas e as medalhas de cada uma" — a lista das provas concluídas
      que antes vivia no "Ver tudo". */

// A legenda tem 4 colunas estreitas: as etiquetas longas abreviam como no mock.
const LEGEND_SHORT = { Trimestre: 'Trim.', Semestre: 'Sem.' };

// "Ver os registos do mês" — O Ano em Km tem artigo; os outros dizem o rótulo.
const ANO_KM_ARIA = { mes: 'do mês', trimestre: 'do trimestre', semestre: 'do semestre', ano: 'do ano' };
const legendAria = (heroKey, slot) => `Ver os registos ${(heroKey === 'ano_km' && ANO_KM_ARIA[slot.key]) || `de ${slot.label}`}`;

const HERO_CARD = {
  background: 'var(--surface-glass)',
  border: '1px solid rgba(251,191,36,.24)',
  borderRadius: 24,
  padding: '16px 16px 14px',
  boxShadow: 'var(--shadow-card)',
};
const COLLECTION_CARD = {
  background: 'var(--surface-glass)',
  border: '1px solid var(--border-glass)',
  borderRadius: 20,
  padding: '14px 12px',
  boxShadow: 'var(--shadow-card)',
};

export default function PalmaresCard({ onOpenRace }) {
  const { raceEvents, runs, coachPlans, coachPlanItems, profile } = useAppStore();
  const [openKey, setOpenKey] = useState(null);
  const [provasOpen, setProvasOpen] = useState(false);
  // Os registos de um encaixe: { medalhaoKey, slotKey }. Guarda chaves, não o
  // encaixe, para a lista acompanhar os dados se mudarem com a persiana aberta.
  const [contrib, setContrib] = useState(null);
  const today = todayISO();

  const { medalhoes, heroKey } = useMemo(
    () => computeMedalhoes({ runs, raceEvents, coachPlans, coachPlanItems, profile, today }),
    [runs, raceEvents, coachPlans, coachPlanItems, profile, today],
  );
  const provas = useMemo(
    () => (provasOpen ? completedRaces({ raceEvents, runs, profile }) : []),
    [provasOpen, raceEvents, runs, profile],
  );

  const list = medalhoes || [];
  const hero = list.find((m) => m.key === heroKey) || list[0];
  const colecao = list.filter((m) => m !== hero);
  const aberto = openKey ? list.find((m) => m.key === openKey) : null;
  const contribMedalhao = contrib ? list.find((m) => m.key === contrib.medalhaoKey) : null;
  const contribSlot = contribMedalhao ? (contribMedalhao.slots || []).find((s) => s.key === contrib.slotKey) : null;

  const abrirProva = (raceId) => {
    setProvasOpen(false);
    onOpenRace?.(raceId);
  };

  if (!hero) return null;

  return (
    <div className="flex flex-col gap-2" data-testid="palmares-card">
      {/* O medalhão herói */}
      <div className="relative overflow-hidden shrink-0" style={HERO_CARD} data-testid="palmares-heroi" data-key={hero.key}>
        <div aria-hidden="true" className="absolute pointer-events-none" style={{ left: '50%', top: -30, width: 340, height: 300, marginLeft: -170, background: 'radial-gradient(ellipse, rgba(251,191,36,.20) 0%, transparent 68%)' }} />
        <div className="relative">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="m-0 text-[16px] font-black" style={{ letterSpacing: '-.02em', color: 'var(--text-1)' }}>{hero.name}</h3>
            <span className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: '.05em', color: 'var(--race)' }}>
              {hero.wonCount} de {hero.totalSlots} medalhas
            </span>
          </div>

          <Medalhao
            size="lg"
            ribbon
            engraving={hero.engraving}
            year={hero.year}
            footer={hero.footer}
            slots={hero.slots}
            style={{ margin: '70px auto 6px' }}
          />

          <div className="flex gap-1.5" style={{ marginTop: 14 }} data-testid="palmares-legenda">
            {(hero.slots || []).slice(0, 4).map((slot) => {
              const won = slot.state === 'won';
              return (
                <button
                  type="button"
                  key={slot.key}
                  data-testid={`palmares-legenda-${slot.key}`}
                  data-state={won ? 'won' : 'empty'}
                  aria-label={legendAria(hero.key, slot)}
                  onClick={() => setContrib({ medalhaoKey: hero.key, slotKey: slot.key })}
                  className="flex-1 text-center min-w-0"
                  style={{
                    minHeight: 44,
                    padding: '7px 2px',
                    borderRadius: 12,
                    background: won ? 'rgba(251,191,36,.08)' : 'rgba(255,255,255,.03)',
                    border: `1px solid ${won ? 'rgba(251,191,36,.22)' : 'var(--border-glass)'}`,
                  }}
                >
                  <div className="text-[11px] font-extrabold uppercase truncate" style={{ letterSpacing: '.04em', color: won ? 'var(--race)' : 'var(--text-4)' }}>
                    {LEGEND_SHORT[slot.label] || slot.label}
                  </div>
                  <div className="text-[11px] mt-[2px] truncate" style={{ color: won ? 'var(--text-3)' : 'var(--text-4)', fontVariantNumeric: 'tabular-nums' }}>
                    {won ? (slotValueText(hero.key, slot) ?? '—') : '—'}
                  </div>
                </button>
              );
            })}
          </div>

          {hero.progressLine && (
            <button
              type="button"
              data-testid="palmares-progresso"
              onClick={() => setOpenKey(hero.key)}
              className="w-full flex items-center gap-2.5 text-left"
              style={{ marginTop: 8, minHeight: 44, padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,.04)', border: '1px solid var(--border-glass)' }}
            >
              <span className="flex-1 text-[12px] leading-[1.45]" style={{ color: 'var(--text-3)' }}>{hero.progressLine}</span>
              <ChevronRight size={15} className="shrink-0" style={{ color: 'var(--text-4)' }} />
            </button>
          )}
        </div>
      </div>

      {/* A coleção */}
      <div className="grid grid-cols-2 gap-2" data-testid="palmares-colecao">
        {colecao.map((m, i) => (
          <button
            key={m.key}
            type="button"
            data-testid={`palmares-medalhao-${m.key}`}
            onClick={() => setOpenKey(m.key)}
            className={`flex flex-col items-center gap-2 text-center ${colecao.length % 2 === 1 && i === colecao.length - 1 ? 'col-span-2' : ''}`}
            style={COLLECTION_CARD}
          >
            <Medalhao size="sm" engraving={m.name} slots={m.slots} />
            <span className="text-[12px] font-extrabold" style={{ color: 'var(--text-1)' }}>{m.name}</span>
            {m.summary && <span className="text-[11px]" style={{ color: 'var(--text-4)' }}>{m.summary}</span>}
          </button>
        ))}
      </div>

      <button
        type="button"
        data-testid="palmares-provas"
        onClick={() => setProvasOpen(true)}
        className="w-full flex items-center justify-between text-left text-[12px] font-bold"
        style={{ ...COLLECTION_CARD, padding: '4px 16px', minHeight: 52, color: 'var(--text-3)' }}
      >
        As provas e as medalhas de cada uma
        <ChevronRight size={15} className="shrink-0" style={{ color: 'var(--text-4)' }} />
      </button>

      {/* A persiana dos registos monta-se POR CIMA da do medalhão (os dois
          portais vão para o body, o último fica à frente): fechá-la volta à
          persiana do medalhão, como quem recua um passo. Abrir um registo
          fecha as duas — o hub ou o registo tomam o lugar do separador. */}
      {aberto && (
        <MedalhaoSheet
          medalhao={aberto}
          onClose={() => setOpenKey(null)}
          onOpenSlot={(slot) => setContrib({ medalhaoKey: aberto.key, slotKey: slot.key })}
        />
      )}

      {contribSlot && (
        <MedalhaoContribSheet
          medalhaoName={contribMedalhao.name}
          slot={contribSlot}
          onClose={() => setContrib(null)}
          onNavigate={() => { setContrib(null); setOpenKey(null); }}
        />
      )}

      {provasOpen && (
        <Sheet eyebrow="Palmarés" eyebrowTone="race" onClose={() => setProvasOpen(false)} testId="palmares-sheet">
          <SectionLabel style={{ margin: '12px 2px 0' }}>Provas concluídas</SectionLabel>
          {provas.length === 0 ? (
            <p className="text-[12px] pt-2 pb-1" data-testid="palmares-sem-provas" style={{ color: 'var(--text-3)' }}>Ainda sem provas concluídas.</p>
          ) : (
            <div className="flex flex-col gap-2 mt-2 pb-1">
              {provas.map(({ race, outcome }) => {
                const daProva = achievementsForRace({ raceEvents, runs, profile }, race.id);
                return (
                  <button
                    key={race.id}
                    type="button"
                    data-testid={`palmares-prova-${race.id}`}
                    onClick={() => abrirProva(race.id)}
                    className="flex items-center gap-3 w-full text-left"
                    style={{
                      minHeight: 44, borderRadius: 16, padding: '10px 12px',
                      background: 'var(--surface-glass)', border: '1px solid var(--border-glass)',
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-extrabold truncate" style={{ color: 'var(--text-1)' }}>{race.name}</div>
                      <div className="text-[11px] mt-[2px]" style={{ color: 'var(--text-4)' }}>
                        {[formatDatePTShort(race.date), outcome?.officialSeconds ? formatDuration(outcome.officialSeconds) : null].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <span className="flex items-center gap-1 shrink-0">
                      {daProva.map((a) => <AchievementIcon key={a.key} achievement={a} size={24} />)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}
