import React from 'react';
import { ChevronLeft, ChevronRight, Check, ArrowDown, ArrowUp, Minus } from 'lucide-react';
import GlassCard from '../shared/GlassCard';

/* Um dia de nutrição contra o objetivo DESSE dia (bug #51, 2026-10-02): «se
   quiser saber qual era o objetivo de calorias ou outro macro, no dia de
   ontem, e saber se atingi objetivos, não temos como saber». As setas andam
   de dia em dia; o objetivo de cada dia vem do histórico
   (utils/goalHistory.js), não do perfil de hoje. */

const COLOR = {
  calories: 'var(--neon-kcal)',
  protein: 'var(--neon-proteina)',
  carbs: 'var(--neon-hidratos)',
  fat: 'var(--neon-gordura)',
  water: 'var(--neon-agua)',
};

const STATUS = {
  ok: { label: 'Dentro', Icon: Check, color: 'var(--ok)' },
  abaixo: { label: 'Abaixo', Icon: ArrowDown, color: 'var(--warn)' },
  acima: { label: 'Acima', Icon: ArrowUp, color: 'var(--warn)' },
  sem_registo: { label: 'Sem registo', Icon: Minus, color: 'var(--text-4)' },
};

const fmt = (n) => Math.round(n).toLocaleString('pt-PT');

/** "Hoje", "Ontem", ou "qui, 1 out". */
export function dayTitle(dayISO, todayISO) {
  const ms = Date.parse(`${dayISO}T12:00:00Z`) - Date.parse(`${todayISO}T12:00:00Z`);
  const diff = Math.round(ms / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === -1) return 'Ontem';
  return new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${dayISO}T12:00:00Z`))
    .replace(/\./g, '');
}

export default function DayNutritionCard({ dayISO, todayISO, rows, estimated = false, plan = null, onPrev, onNext }) {
  const isToday = dayISO >= todayISO;
  const hits = rows.filter((r) => r.status === 'ok').length;
  const recorded = rows.some((r) => r.status !== 'sem_registo');
  return (
    <GlassCard padding="14px 16px" data-testid="day-nutrition-card">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onPrev} aria-label="Dia anterior" className="tap-44 shrink-0 flex items-center justify-center" style={{ color: 'var(--text-2)' }}>
          <ChevronLeft size={20} />
        </button>
        <div className="text-center min-w-0">
          <p data-testid="day-nutrition-title" className="text-[15px] font-black" style={{ color: 'var(--text-1)' }}>{dayTitle(dayISO, todayISO)}</p>
          <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            {recorded ? `${hits} de ${rows.length} objetivos atingidos` : 'Sem registos neste dia'}
          </p>
        </div>
        <button type="button" onClick={onNext} disabled={isToday} aria-label="Dia seguinte" className="tap-44 shrink-0 flex items-center justify-center disabled:opacity-30" style={{ color: 'var(--text-2)' }}>
          <ChevronRight size={20} />
        </button>
      </div>

      <ul className="mt-3 space-y-3" aria-label="Objetivos do dia">
        {rows.map((r) => {
          const s = STATUS[r.status];
          const pct = r.target > 0 ? Math.min(1, r.value / r.target) : 0;
          return (
            <li key={r.key} data-testid={`day-row-${r.key}`} data-status={r.status}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-extrabold uppercase" style={{ color: 'var(--text-3)', letterSpacing: 'var(--tracking-label)' }}>{r.label}</span>
                <span className="text-[13px] font-black whitespace-nowrap" style={{ color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(r.value)} <span className="text-[11px] font-bold" style={{ color: 'var(--text-4)' }}>/ {fmt(r.target)} {r.unit}</span>
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.08)' }} aria-hidden="true">
                  <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: COLOR[r.key], boxShadow: `0 0 8px ${COLOR[r.key]}` }} />
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold shrink-0 w-[92px] justify-end" style={{ color: s.color }}>
                  <s.Icon size={12} aria-hidden="true" />
                  {s.label}{r.status !== 'sem_registo' && r.pct != null ? ` · ${r.pct}%` : ''}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {plan && (
        <p data-testid="day-nutrition-plan" className="text-[11px] leading-[1.5] mt-3 pt-3" style={{ color: 'var(--text-3)', borderTop: '1px solid rgba(255,255,255,.09)' }}>
          O plano da Carol sugeria ~{fmt(plan.kcal)} kcal
          {plan.protein != null && plan.carbs != null && plan.fat != null ? ` · proteína ${plan.protein} g · hidratos ${plan.carbs} g · gordura ${plan.fat} g` : ''}.
        </p>
      )}
      {estimated && (
        <p data-testid="day-nutrition-estimated" className="text-[11px] leading-[1.5] mt-2" style={{ color: 'var(--text-4)' }}>
          Objetivos aproximados: antes de 3 de outubro a app não guardava a mudança dos objetivos, por isso estes são os mais próximos que se conhecem.
        </p>
      )}
    </GlassCard>
  );
}
