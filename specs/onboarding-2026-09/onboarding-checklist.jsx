/*
 * GettingStartedCard: a lista "O que falta para começar" no Início.
 * Destino proposto: src/components/Home/GettingStartedCard.jsx
 *
 * Porquê (auditoria 2026-09-27): a lista já existe, mas só em
 * Evolução › Geral e só enquanto não há NENHUM registo (OverviewDashboard,
 * hasNoRecords). Ou seja:
 *   - no 1.º dia, o Início mostra o FirstDayCard mas não a lista;
 *   - à primeira corrida registada, o FirstDayCard e a lista desaparecem
 *     os dois, e a pessoa cai no Início completo sem saber que ainda lhe
 *     faltam a prova, 2 corridas e a semana de refeições que tornam a
 *     prontidão e o plano úteis.
 * A lista passa a viver no Início até estar completa (ou até ser
 * dispensada), e o OverviewDashboard reutiliza o mesmo modelo.
 *
 * Integração:
 *   1. Mover a construção do `checklist` de OverviewDashboard.jsx:170-196
 *      para utils/gettingStarted.js (função pura, testável), exportando
 *      buildGettingStarted({ profile, raceEvents, runs, meals }) que devolve
 *      [{ key, label, done, progress? }] sem os onClick.
 *   2. OverviewDashboard passa a importar essa função e junta-lhe os
 *      onClick; o aspeto fica igual.
 *   3. Home.jsx, nos dois ramos (firstDay e normal): logo a seguir ao
 *      FirstDayCard / ao CarolCard,
 *        <GettingStartedCard onAction={handleGettingStarted} />
 *      onde handleGettingStarted(key) reaproveita os handlers que o Home já
 *      tem: 'perfil' → setActiveTab('perfil'), 'prova' → createRace,
 *      'corridas' → registerRun, 'refeicoes' → registerMeal.
 *   4. Esconde-se sozinho quando os 4 passos estão feitos. "Agora não"
 *      guarda a dispensa no localStorage, por utilizador (mesmo padrão do
 *      onboardingLocalKey em utils/onboarding.js).
 */
import React, { useMemo, useState } from 'react';
import { Check, ChevronRight, X } from 'lucide-react';
import { useAppStore } from '../../store';
import SectionLabel from '../shared/SectionLabel';
import { buildGettingStarted } from '../../utils/gettingStarted';

const dismissKey = (userId) => `ironcoach_getting_started_dismissed_${userId}`;

function readDismissed(userId) {
  try { return localStorage.getItem(dismissKey(userId)) === '1'; } catch { return false; }
}

export default function GettingStartedCard({ onAction }) {
  const profile = useAppStore((s) => s.profile);
  const raceEvents = useAppStore((s) => s.raceEvents);
  const runs = useAppStore((s) => s.runs);
  const meals = useAppStore((s) => s.meals);
  const userId = profile?.id;

  const [dismissed, setDismissed] = useState(() => readDismissed(userId));
  const items = useMemo(
    () => buildGettingStarted({ profile, raceEvents, runs, meals }),
    [profile, raceEvents, runs, meals],
  );

  const doneCount = items.filter((i) => i.done).length;
  if (dismissed || doneCount === items.length) return null;

  const dismiss = () => {
    try { localStorage.setItem(dismissKey(userId), '1'); } catch { /* modo privado: fica só nesta sessão */ }
    setDismissed(true);
  };

  return (
    // SectionLabel não passa `id` ao div, por isso o nome da secção vai por aria-label.
    <section aria-label="O que falta para começar" data-testid="getting-started">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '4px 2px 6px' }}>
        <SectionLabel style={{ margin: 0 }}>O que falta para começar</SectionLabel>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{doneCount} de {items.length}</span>
      </div>

      <div
        style={{
          borderRadius: 'var(--radius-xl)',
          background: 'var(--surface-glass)',
          border: '1px solid var(--border-glass)',
          padding: '6px 16px',
        }}
      >
        {/* Uma frase a dizer PARA QUE serve, que a lista do Overview não tinha:
            sem ela, "Registar 3 corridas" parece trabalho de casa. */}
        <p style={{ margin: '8px 0 4px', fontSize: 'var(--text-xs)', lineHeight: 1.5, color: 'var(--text-4)' }}>
          Com isto feito, consigo dizer-te como estás e montar o plano até à prova.
        </p>

        {items.map((item, i) => (
          <div
            key={item.key}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,.08)' : 'none',
            }}
          >
            <span
              aria-hidden="true"
              style={item.done
                ? {
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--tint-ok-bg)', border: '1px solid var(--tint-ok-bd)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ok)',
                  }
                : { width: 22, height: 22, borderRadius: '50%', flexShrink: 0, border: '1px dashed rgba(255,255,255,.28)' }}
            >
              {item.done && <Check size={12} />}
            </span>

            {item.done ? (
              <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-3)', padding: '13px 0', textDecoration: 'line-through', textDecorationColor: 'rgba(255,255,255,.25)' }}>
                {item.label}
                <span className="sr-only"> (feito)</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onAction(item.key)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                  minHeight: 'var(--tap)', background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 'var(--text-sm)', color: 'var(--text-2)', padding: 0,
                }}
              >
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.progress
                  ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{item.progress}</span>
                  : <ChevronRight size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={dismiss}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, minHeight: 'var(--tap)',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
          }}
        >
          <X size={12} aria-hidden="true" /> Agora não
        </button>
      </div>
    </section>
  );
}

/* ─── utils/gettingStarted.js (proposta) ──────────────────────────────────
import { filterByDateRange } from './biEngine';

// Os critérios são os do OverviewDashboard, sem mudar nada: se mudarem,
// mudam nos dois ecrãs ao mesmo tempo.
export function buildGettingStarted({ profile, raceEvents, runs, meals }) {
  const mealDays = new Set(filterByDateRange(meals || [], 'semana').map((m) => m.date)).size;
  const nRuns = runs?.length || 0;
  return [
    { key: 'perfil', label: 'Perfil preenchido', done: !!(profile?.experience_level && (profile?.weight_kg || profile?.height_cm)) },
    { key: 'prova', label: 'Marcar uma prova', done: (raceEvents?.length || 0) > 0 },
    { key: 'corridas', label: 'Registar 3 corridas', done: nRuns >= 3, progress: `${Math.min(nRuns, 3)} de 3` },
    { key: 'refeicoes', label: 'Registar 1 semana de refeições', done: mealDays >= 7, progress: `${Math.min(mealDays, 7)} de 7` },
  ];
}

Testes (src/utils/__tests__/gettingStarted.test.js):
  - perfil sem experience_level → não feito;
  - 7 refeições no mesmo dia → "1 de 7", não feito;
  - 3 corridas → feito, progress "3 de 3".
─────────────────────────────────────────────────────────────────────────── */
