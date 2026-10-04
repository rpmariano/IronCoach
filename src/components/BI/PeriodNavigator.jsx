import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Navegador de período ‹ título / intervalo · estado › (2026-10-04), como a
 * secção "Resumo do período" do mock-up aprovado. Só apresenta: recebe o
 * `label` de periodLabel() e os callbacks (ver useCalendarPeriod).
 * Setas com alvo de toque de 44 px; o › fica desativado (aria-disabled) no
 * período atual porque não há futuro.
 */
const UNIT = {
  dia: { prev: 'Dia anterior', next: 'Dia seguinte' },
  semana: { prev: 'Semana anterior', next: 'Semana seguinte' },
  mes: { prev: 'Mês anterior', next: 'Mês seguinte' },
  trimestre: { prev: 'Trimestre anterior', next: 'Trimestre seguinte' },
  ano: { prev: 'Ano anterior', next: 'Ano seguinte' },
};

export default function PeriodNavigator({
  kind = 'semana',
  label,
  canGoNext = false,
  onPrev,
  onNext,
  module = 'nutricao',
  className = '',
}) {
  const names = UNIT[kind] || UNIT.semana;
  // 2026-10-04: UMA só linha pequena, como no mock-up aprovado. Dia mostra
  // "intervalo · estado"; mês/trimestre/ano mostram a cobertura (que já traz o estado,
  // ex. "em curso · 3 de 31 dias fechados") e só sem cobertura recuam para o intervalo.
  // A semana não tem título com o mês, por isso leva o intervalo e o que a cobertura
  // traz de DIFERENTE do calendário: "desde 30 set", "2 avaliações", "5 de 7 dias com
  // registo". O progresso do calendário ("6 de 7 dias fechados", "ainda sem dias
  // fechados") fica de fora: o mock-up diz só "28 set – 4 out · em curso", a contagem
  // vive no resumo (um só sítio a dizê-la) e a linha não parte em duas a 390 px.
  // Revisão 2026-10-04: antes juntava sempre a cobertura inteira.
  const rangeStatus = [label?.range, label?.status].filter(Boolean).join(' · ');
  const coverage = label?.coverage;
  let subtitle;
  if (kind === 'dia') subtitle = rangeStatus;
  else if (kind === 'semana') {
    const parts = coverage ? coverage.split(' · ') : [];
    const isProgress = (s) => /dias? fechados?$/.test(s);
    const kept = parts.filter((s) => s !== label?.status && !isProgress(s));
    const since = kept.filter((s) => /^desde /.test(s));
    const rest = kept.filter((s) => !/^desde /.test(s));
    subtitle = [label?.range, ...since, label?.status, ...rest].filter(Boolean).join(' · ');
  } else subtitle = coverage || rangeStatus;

  const arrow = (disabled) => ({
    width: 44,
    height: 44,
    flexShrink: 0,
    color: 'var(--text-2, #e2e8f0)',
    opacity: disabled ? 0.3 : 1,
  });

  return (
    <div
      className={`flex items-center justify-between gap-2 ${className}`}
      data-testid="period-navigator"
      data-module={module}
    >
      <button
        type="button"
        aria-label={names.prev}
        onClick={onPrev}
        className="flex items-center justify-center rounded-xl bg-transparent border-0"
        style={arrow(false)}
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <div aria-live="polite" className="flex flex-col items-center min-w-0 text-center">
        <div className="text-[15px] font-black" style={{ color: 'var(--text-1, #f8fafc)' }} data-testid="period-title">
          {label?.title}
        </div>
        {subtitle && (
          <div className="text-[11px] leading-snug mt-0.5 tabular-nums" style={{ color: 'var(--text-3, #cbd5e1)' }}>
            {subtitle}
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label={names.next}
        aria-disabled={!canGoNext}
        disabled={!canGoNext}
        onClick={canGoNext ? onNext : undefined}
        className="flex items-center justify-center rounded-xl bg-transparent border-0"
        style={arrow(!canGoNext)}
      >
        <ChevronRight size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
