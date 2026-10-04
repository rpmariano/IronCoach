import React from 'react';
import TimeFilterBar from '../TimeFilterBar';
import PeriodNavigator from '../PeriodNavigator';
import { useCalendarPeriod } from '../../../utils/useCalendarPeriod';
import { useTodayISO } from '../../../utils/useTodayISO';
import { closedCoverageLabel, kindText, toneOf } from './periodText';

/**
 * PeriodHeader / PeriodNav — o topo de cada separador da Evolução
 * (2026-10-04, R1): seletor de granularidade (Dia · Semana · Mês · …) e o
 * navegador ‹ título / intervalo ›, ligados ao período do separador no
 * store pequeno (periodStore, via useCalendarPeriod).
 *
 * No mock-up o navegador vive DENTRO do cartão "Resumo do período". Por isso:
 *   - <PeriodHeader navigator="none" cal={cal} …/> + <PeriodSummary navigator={<PeriodNav cal={cal} …/>} …/>
 *     é a forma do mock-up (Nutrição);
 *   - <PeriodHeader …/> sozinho (navigator="card") põe o navegador no seu
 *     próprio cartão de vidro, para quem ainda não tem resumo.
 *
 * `cal` é o resultado de useCalendarPeriod(tab, opts). Passa-se o MESMO
 * objeto ao cabeçalho e ao resumo para os dois lerem o mesmo rótulo (o
 * `daysWithData`/`dataStartISO` de quem chama). Sem `cal`, o cabeçalho
 * chama useCalendarPeriod(tab, calOpts) ele próprio.
 */

/* O TimeFilterBar não é deste agente: a forma do mock-up (pílula com fundo
   de vidro, botões a dividir a largura, 12,5 px, inativos transparentes)
   chega-lhe por classes de variante do Tailwind 4 no contentor. Um seletor
   ".x > button" é mais específico que as classes do próprio botão, por isso
   ganha sem `!important`. */
const FILTER_CLASS = [
  'rounded-full border border-[var(--border-glass)] bg-[var(--surface-glass)]',
  '[&>button]:flex-1 [&>button]:text-[12.5px] [&>button]:font-bold',
  '[&>button[aria-pressed=false]]:bg-transparent [&>button[aria-pressed=true]]:font-extrabold',
].join(' ');

/* `closedDays` + `dataStartISO` (opcionais, 2026-10-04): os dias fechados que a
   vista do separador realmente conta (desde o 1.º registo). Quando o histórico
   começa dentro do período, o navegador diz ESSE número com o "desde 13 jul",
   em vez dos "276 de 365" do calendário — uma só definição no ecrã
   (closedCoverageLabel). Sem eles o rótulo vai como veio de periodLabel. */
export function PeriodNav({ cal, module = 'nutricao', className = '', style, closedDays, dataStartISO }) {
  const today = useTodayISO();
  if (!cal) return null;
  const tone = toneOf(module);
  const isPast = (cal.offset ?? 0) < 0;
  const label = closedCoverageLabel(cal.label, { period: cal.period, closedDays, dataStartISO, todayISO: today });
  return (
    <div className={className} style={style} data-testid="period-nav">
      <PeriodNavigator
        kind={cal.kind}
        label={label}
        canGoNext={cal.canGoNext}
        onPrev={cal.prev}
        onNext={cal.next}
        module={module}
      />
      {isPast && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: -6 }}>
          {/* "Voltar a este mês" (mock-up, mês/trimestre fechados): repõe o
              período atual sem obrigar a tocar ‹ › várias vezes. setKind com a
              mesma granularidade põe o offset a 0. 44 px de alvo (o mock tinha
              32 — regra do projeto). */}
          <button
            type="button"
            onClick={() => cal.setKind(cal.kind)}
            style={{
              minHeight: 'var(--tap)',
              padding: '0 8px',
              border: 0,
              background: 'transparent',
              color: tone.color,
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
            }}
          >
            {kindText(cal.kind).back}
          </button>
        </div>
      )}
    </div>
  );
}

export default function PeriodHeader({
  tab,
  options,
  module = tab,
  cal: calProp,
  calOpts,
  navigator = 'card',
  onKindChange,
  className = '',
  style,
}) {
  // Chamado sempre (regras dos hooks); se o separador passou `cal`, é esse que vale.
  const own = useCalendarPeriod(tab, calOpts);
  const cal = calProp || own;

  const handleKind = (k) => {
    cal.setKind(k);
    onKindChange?.(k);
  };

  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', ...style }}
      data-testid="period-header"
      data-tab={tab}
    >
      <TimeFilterBar
        activeRange={cal.kind}
        onChange={handleKind}
        module={module}
        options={options}
        className={FILTER_CLASS}
      />
      {navigator === 'card' && (
        <section
          aria-label="Período"
          style={{
            borderRadius: 'var(--radius-2xl)',
            padding: '14px 16px',
            background: 'var(--surface-glass)',
            border: '1px solid var(--border-glass)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <PeriodNav cal={cal} module={module} />
        </section>
      )}
      {navigator === 'plain' && <PeriodNav cal={cal} module={module} />}
    </div>
  );
}
