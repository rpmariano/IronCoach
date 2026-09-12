import React, { useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useAppStore } from '../../store';
import { computeAchievements, achievementsForRace, completedRaces } from '../../utils/achievements';
import { formatDuration } from '../../utils/run';
import AchievementCard, { AchievementIcon } from '../shared/AchievementCard';
import SectionLabel from '../shared/SectionLabel';
import { Sheet } from '../shared/Sheet';
import { formatDatePTShort } from '../../utils/racePlanEngine';

/* O Palmarés no topo do separador Pessoal (specs/gamificacao-provas.md §5,
   opção B do canvas). Não é um separador novo: é o arquivo do que já
   aconteceu, à cabeça do "quem sou", antes do nome e da idade.

   A linha das cinco conquistas lê-se de relance — cor quer dizer
   desbloqueada, cadeado quer dizer o caminho ainda por fazer. "Ver tudo"
   abre a persiana com o detalhe de cada uma e a lista das provas
   concluídas; tocar numa prova leva ao hub dela, que é onde vivem as
   memórias. */

function mesEAno(dateStr) {
  try {
    return format(parseISO(dateStr), "MMMM 'de' yyyy", { locale: pt });
  } catch {
    return dateStr;
  }
}

export default function PalmaresCard({ onOpenRace }) {
  const { raceEvents, runs, profile } = useAppStore();
  const [open, setOpen] = useState(false);

  const achievements = useMemo(
    () => computeAchievements({ raceEvents, runs, profile }),
    [raceEvents, runs, profile],
  );
  const provas = useMemo(
    () => completedRaces({ raceEvents, runs, profile }),
    [raceEvents, runs, profile],
  );

  const desbloqueadas = achievements.filter((a) => a.unlocked).length;
  // A mais antiga é a última da lista (vem por data descendente).
  const primeira = provas.length ? provas[provas.length - 1].race : null;
  const resumo = provas.length
    ? `${desbloqueadas} de ${achievements.length} conquistas · desde ${mesEAno(primeira.date)}`
    : 'Ainda sem provas concluídas';

  const abrirProva = (raceId) => {
    setOpen(false);
    onOpenRace?.(raceId);
  };

  return (
    <div className="module-card-contrast" data-testid="palmares-card">
      <div className="flex items-center gap-2 mb-1">
        <Trophy size={16} style={{ color: 'var(--race)' }} />
        <h3 className="text-sm font-semibold">Palmarés</h3>
      </div>
      <p className="text-[11.5px]" data-testid="palmares-resumo" style={{ color: 'var(--text-3)' }}>{resumo}</p>

      <div className="flex items-start justify-between gap-1 mt-4">
        {achievements.map((a) => (
          <div key={a.key} className="flex flex-col items-center gap-1.5" style={{ minWidth: 0, flex: '1 1 0' }}>
            <AchievementIcon achievement={a} />
            <span
              className="text-[11px] font-semibold text-center leading-[1.2]"
              style={{ color: a.unlocked ? 'var(--text-2)' : 'var(--text-4)' }}
            >
              {a.short}
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        data-testid="palmares-ver-tudo"
        onClick={() => setOpen(true)}
        className="w-full inline-flex items-center justify-center gap-2 mt-4 rounded-[11px] text-[12.5px] font-extrabold"
        style={{ minHeight: 44, background: 'var(--tint-run-bg)', border: '1px solid var(--tint-run-bd)', color: 'var(--run)' }}
      >
        Ver tudo
      </button>

      {open && (
        <Sheet eyebrow="Palmarés" eyebrowTone="race" onClose={() => setOpen(false)} testId="palmares-sheet">
          <p className="text-[11.5px] pt-1" style={{ color: 'var(--text-3)' }}>{resumo}</p>

          <div className="flex flex-col gap-2 mt-3">
            {achievements.map((a) => <AchievementCard key={a.key} achievement={a} />)}
          </div>

          {provas.length > 0 && (
            <>
              <SectionLabel style={{ margin: '18px 2px 0' }}>Provas concluídas</SectionLabel>
              <div className="flex flex-col gap-2 mt-2 pb-1">
                {provas.map(({ race, outcome }) => {
                  const daProva = achievementsForRace(achievements, race.id);
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
            </>
          )}
        </Sheet>
      )}
    </div>
  );
}
