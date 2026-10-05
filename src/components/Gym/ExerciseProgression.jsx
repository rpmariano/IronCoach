import React from 'react';
import MetricInfo from '../BI/MetricInfo';
import { DeltaVsPrevious, MinDataNote, plural } from '../BI/period';
import { fmtNumber } from '../../utils/verdicts/shared';

/**
 * Progressão por exercício (Ginásio da Evolução, 2026-10-04, D5). Substitui o
 * KPI "Vol. Carga" e o gráfico "Volume diário", que somavam kg de exercícios
 * diferentes (agachamento + curl) e não diziam se o atleta estava a evoluir.
 * Aqui cada exercício compara-se consigo próprio: o melhor 1RM estimado
 * (sempre Epley sobre peso × repetições, séries de até 12 repetições) do período contra o período anterior
 * equivalente e fechado (R5), com ▲/▼.
 *
 * Só aparecem exercícios COMPARÁVEIS: com pelo menos 2 sessões no período (1 numa
 * semana — G5, 2026-10-05: em split nunca há 2 do mesmo exercício em 7 dias) e
 * registos no anterior. Os restantes não se inventam — diz-se quantos ficaram
 * de fora (R6). A vista (store/evolution/views/gym.js) já traz tudo calculado;
 * isto só apresenta.
 *
 * Props:
 *   progression  { rows, hidden, withoutPrevious, label } da vista
 *   scope        "nesta semana" / "em setembro" — onde fica o período
 *   gate         texto do bloco quando o período ainda não permite comparar
 *                (cedo, sem anterior); sem ele usa-se o texto de "sem linhas".
 *                Pode ser { text, actionLabel, onAction } para levar ao período
 *                onde a comparação já existe ("Ver setembro ›", M4).
 */
const cardStyle = 'bg-[var(--surface-glass)] backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)]';

const infoText = (minSessions) => `O 1RM estimado é o peso máximo que levantarias numa repetição, calculado a partir da tua melhor série (fórmula de Epley sobre o peso e as repetições, só séries até 12 repetições; o 1RM guardado nas fotos não conta, para os dois períodos usarem a mesma régua). Assim 80 kg × 8 e 85 kg × 5 comparam-se. Só aparecem exercícios com pelo menos ${minSessions} ${minSessions === 1 ? 'sessão' : 'sessões'} no período e registos no período anterior${minSessions === 1 ? ' (numa semana, cada exercício compara a melhor série com a da semana passada)' : ''}. Exercícios de peso do corpo (sem carga) não entram.`;

export function progressionEmptyText({ withoutPrevious = 0, scope, minSessions = 2 }) {
  const base = minSessions === 1
    ? `Progressão por exercício: preciso de um exercício treinado ${scope} e no período anterior para comparar.`
    : `Progressão por exercício: preciso de um exercício com pelo menos ${minSessions} sessões ${scope} e registos no período anterior para comparar.`;
  if (withoutPrevious <= 0) return base;
  return `${base} ${withoutPrevious} ${plural(withoutPrevious, 'exercício ainda não tem', 'exercícios ainda não têm')} registos antes.`;
}

export default function ExerciseProgression({ progression, scope, gate }) {
  const rows = progression?.rows || [];
  const minSessions = progression?.minSessions || 2;
  if (gate) {
    const g = typeof gate === 'string' ? { text: gate } : gate;
    return <MinDataNote module="ginasio" text={g.text} actionLabel={g.actionLabel} onAction={g.onAction} />;
  }
  if (rows.length === 0) {
    return <MinDataNote module="ginasio" text={progressionEmptyText({ withoutPrevious: progression?.withoutPrevious, scope, minSessions })} />;
  }
  const { hidden = 0, withoutPrevious = 0, label } = progression;

  return (
    <section className={cardStyle} aria-label="Progressão por exercício" data-testid="progressao">
      <div className="flex items-center justify-between mb-1 gap-2">
        <h2 className="text-[11px] font-semibold text-[var(--text-2)] uppercase tracking-wider">Progressão por exercício</h2>
        <MetricInfo text={infoText(minSessions)} />
      </div>
      <p className="text-[11px] text-[var(--text-3)] mb-2">
        Melhor 1RM estimado {scope}, contra {label}.
      </p>
      <ul className="m-0 p-0 list-none">
        {rows.map((r) => (
          <li
            key={r.key}
            data-testid="progressao-linha"
            className="flex items-start justify-between gap-3 py-2 border-b border-[var(--border-glass)] last:border-0"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-2)] break-words">{r.name}</p>
              <p className="text-[11px] text-[var(--text-3)] mt-0.5">
                {r.current.sessions} {plural(r.current.sessions, 'sessão', 'sessões')} · melhor série {fmtNumber(r.current.bestSet.weight, r.current.bestSet.weight % 1 ? 1 : 0)} kg × {r.current.bestSet.reps}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-base font-extrabold text-white leading-none">
                {fmtNumber(r.current.oneRm, 0)} <span className="text-[11px] font-medium text-[var(--text-3)]">kg 1RM</span>
              </p>
              <p className="text-[11px] mt-1">
                <DeltaVsPrevious
                  current={r.current.oneRm}
                  previous={r.previous.oneRm}
                  previousLabel={label}
                  better="up"
                  unit="kg"
                />
              </p>
            </div>
          </li>
        ))}
      </ul>
      {(hidden > 0 || withoutPrevious > 0) && (
        <p data-testid="progressao-notas" className="text-[11px] text-[var(--text-4)] mt-2">
          {hidden > 0 && `Mais ${hidden} ${plural(hidden, 'exercício', 'exercícios')} não cabe${hidden === 1 ? '' : 'm'} aqui. `}
          {withoutPrevious > 0 && `${withoutPrevious} ${minSessions === 1
            ? plural(withoutPrevious, 'exercício desta semana não aparece', 'exercícios desta semana não aparecem')
            : plural(withoutPrevious, `exercício com ${minSessions}+ sessões não aparece`, `exercícios com ${minSessions}+ sessões não aparecem`)}: sem registos no período anterior para comparar.`}
        </p>
      )}
    </section>
  );
}
