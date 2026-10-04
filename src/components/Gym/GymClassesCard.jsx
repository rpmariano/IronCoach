import React from 'react';
import { Users } from 'lucide-react';
import MetricInfo from '../BI/MetricInfo';
import { plural } from '../BI/period';
import { MIN_CLASSES_FOR_RPE } from '../../store/evolution/views/gym';

/**
 * Aulas & Modalidades (Ginásio da Evolução, 2026-10-04). A contagem de aulas
 * vive UMA vez, na linha do resumo do período (com "/semana"); aqui só o que
 * ela não diz: o tempo e o esforço, cada um com o seu denominador (R3):
 *  - G7: "Tempo total" é "—" quando nenhuma aula tem duração (a duração é
 *    opcional) e "em N de M aulas" quando só algumas têm — nunca "0 min";
 *  - G6: o RPE por modalidade (antes lia campos que não existem);
 *  - R6: "RPE 7,5 · média de N de M aulas" só a partir de 3 aulas com RPE —
 *    uma média de 1–2 aulas não é um nível de esforço.
 */
const cardStyle = 'bg-[var(--surface-glass)] backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)]';

export function formatDurationMinutes(seconds) {
  // Sem duração não é "0 min" (G7, 2026-10-04): é dado em falta.
  if (!seconds) return '—';
  const mins = Math.round(seconds / 60);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins} min`;
}

/* G7: o total só soma as aulas que têm duração. Nenhuma → "—"; só parte → o
   total com a nota "em N de M aulas", para não se ler como o tempo todo. */
export function classTimeSummary(totalSeconds, withDuration, totalClasses) {
  if (!(withDuration > 0)) return { value: '—', note: null };
  return {
    value: formatDurationMinutes(totalSeconds),
    note: withDuration < totalClasses ? `em ${withDuration} de ${totalClasses} aulas` : null,
  };
}

/** RPE médio com denominador; só a partir de MIN_CLASSES_FOR_RPE aulas com RPE. */
export function classRpeSummary(avgRpe, rpeCount, totalClasses) {
  if (avgRpe && rpeCount >= MIN_CLASSES_FOR_RPE) {
    return { value: `${String(avgRpe).replace('.', ',')} / 10`, note: `média de ${rpeCount} de ${totalClasses} aulas` };
  }
  if (rpeCount > 0) {
    return { value: '—', note: `só ${rpeCount} ${plural(rpeCount, 'aula com RPE', 'aulas com RPE')}, poucas para média` };
  }
  return { value: '—', note: 'sem RPE registado' };
}

export default function GymClassesCard({ classes }) {
  const total = classes?.totalClasses || 0;
  const time = classTimeSummary(classes?.totalClassSeconds, classes?.classesWithDuration, total);
  const rpe = classRpeSummary(classes?.avgRpe, classes?.rpeCount || 0, total);

  return (
    <div className={cardStyle} data-testid="aulas">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4" style={{ color: 'var(--gym)' }} aria-hidden="true" />
          <h2 className="text-[12px] font-bold text-[var(--text-2)] uppercase tracking-wider">Aulas & Modalidades</h2>
        </div>
        <MetricInfo text="Registo das tuas aulas de grupo e modalidades (HIIT, Cycling, Pilates, CrossFit, etc.): o tempo investido e o esforço percebido (RPE), cada um com o número de aulas em que se baseia. O RPE só aparece a partir de 3 aulas com RPE." />
      </div>

      {total > 0 ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 bg-[var(--surface-glass)] rounded-xl p-3 border border-[var(--border-glass)] text-center">
            <div>
              <p className="text-base font-extrabold text-white leading-none">{time.value}</p>
              <p className="text-[11px] text-[var(--text-3)] mt-1">Tempo Total</p>
              {time.note && <p className="text-[11px] text-[var(--text-3)]">{time.note}</p>}
            </div>
            <div>
              <p className="text-base font-extrabold leading-none" style={{ color: 'var(--gym)' }}>{rpe.value}</p>
              <p className="text-[11px] text-[var(--text-3)] mt-1">Esforço Médio (RPE)</p>
              <p className="text-[11px] text-[var(--text-3)]">{rpe.note}</p>
            </div>
          </div>

          <div className="space-y-1.5 mt-2">
            {classes.classList.map((c) => {
              const n = classes.rpeCountByName?.[c.name] || 0;
              const withDur = classes.durationCountByName?.[c.name] ?? c.count;
              // G6: avgRpe vem já formatado ("7.5"); só se mostra com 3+ aulas com RPE.
              const avg = c.avgRpe && n >= MIN_CLASSES_FOR_RPE ? String(c.avgRpe).replace('.', ',') : null;
              return (
                <div key={c.name} className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl bg-[var(--surface-glass)] border border-[var(--border-faint)]">
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-2)]">{c.name}</p>
                    <p className="text-[11px] text-[var(--text-3)]">
                      {c.count} {plural(c.count, 'aula', 'aulas')}
                      {c.totalSeconds > 0 ? ` · ${formatDurationMinutes(c.totalSeconds)}` : ''}
                      {/* G7 por modalidade: o tempo só soma as aulas com duração. */}
                      {c.totalSeconds > 0 && withDur < c.count ? ` (em ${withDur} de ${c.count})` : ''}
                    </p>
                  </div>
                  {avg && (
                    <div className="text-right">
                      <span className="text-[11px] font-bold text-[var(--text-3)]">RPE {avg}</span>
                      <p className="text-[11px] text-[var(--text-4)]">{n} de {c.count}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="py-6 flex flex-col items-center justify-center text-center">
          <Users className="w-8 h-8 text-[var(--text-3)] mb-2 opacity-50" aria-hidden="true" />
          <p className="text-xs text-[var(--text-3)] max-w-xs leading-relaxed">
            Sem aulas registadas neste período. Ao registares aulas (HIIT, Cycling, Pilates, etc.), verás aqui o tempo e o esforço.
          </p>
        </div>
      )}
    </div>
  );
}
