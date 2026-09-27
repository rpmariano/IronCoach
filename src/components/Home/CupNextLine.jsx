import React from 'react';
import { ChevronRight } from 'lucide-react';
import GlassCard from '../shared/GlassCard';
import { CupStatus } from '../Run/CupBits';
import { baseStatusOf, courseLine } from '../Run/CupListBlock';
import { intentLabel, roundDateText } from '../../utils/cupCalendar';
import { daysUntil } from '../../utils/raceList';

/* "Para onde vou" com inscrição no Troféu (specs/trofeu.md §4.3 — Fase 3,
   2026-09-27). As jornadas que não foram promovidas saem do carrossel (onze
   provas secundárias a passar à frente da principal não diziam para onde ele
   vai); no lugar delas, uma linha no fundo do cartão — "Troféu · próxima
   jornada" — ou, quando não há outra prova nenhuma, o cartão inteiro é a
   próxima jornada. O mesmo no Início e em Provas: é o mesmo cartão.

   A linha não é âmbar: a regra do âmbar do cartão (o nome da prova e o
   trilho, mais nada) continua a valer. O cartão da jornada, quando o cartão
   é ela, tem o âmbar no rótulo, como o nome de uma prova.

   Nada disto aparece sem inscrição: quem monta (Home/RaceCard.jsx) só o
   desenha com o `listing` de useCupListing. */

const plural = (label) => `${label}s`;

/** A frase do leitor de ecrã: "Troféu de Cascais, próxima jornada: Jornada
 *  3, Corrida CCD, domingo, 24 de janeiro. Próxima: Vou, controlar, daqui a
 *  4 dias." */
function ariaOf(view, round) {
  const l = (view.roundLabel || 'Jornada').toLowerCase();
  return `${view.shortName}, próxima ${l}: ${round.status?.ariaLabel || ''}`.trim();
}

// "✓ Vou · controlar · 7,4 km às 9h30": o estado (sem o "Próxima", que o
// rótulo já diz), o papel só com "Vou", e o percurso.
function statusLine(view, round) {
  const base = baseStatusOf(round, view);
  const rest = [base?.key === 'vou' ? intentLabel(round.intent) : null, courseLine(round)].filter(Boolean).join(' · ');
  return (
    <>
      <CupStatus status={base} showDetail={false} />
      {rest ? <span style={{ color: 'var(--text-3)' }}>{` · ${rest}`}</span> : null}
    </>
  );
}

// A mesma divisória de "Todas as provas e o Palmarés" (AllRacesLink).
const lineStyle = { borderTop: '1px solid rgba(255,255,255,.09)' };

/** A linha do Troféu no fundo do cartão, acima de "Todas as provas".
 *  `round`: a jornada a mostrar — a próxima que ainda não está no cartão
 *  (quem monta escolhe-a, nextRoundApart); null quando não há nenhuma.
 *  `loading`: há pista de inscrição e a vista ainda está a chegar.
 *  `onOpen(round | null)`: com a jornada abre-a (o hub, ou o Troféu sem
 *  prova); sem ela, o ecrã do Troféu. */
export default function CupNextLine({ view, round = null, loading = false, onOpen }) {
  const shortName = view?.shortName || 'Troféu';
  const ready = !!view?.catalogReady;

  // A ler: a linha diz-o, sem ser botão (ainda não há para onde ir).
  if (!view || (loading && !ready)) {
    return (
      <div
        data-testid="race-card-cup-line"
        data-state="loading"
        className="w-full flex items-center mt-2.5 text-[12px] font-bold"
        style={{ minHeight: 44, color: 'var(--text-4)', borderTop: '1px solid rgba(255,255,255,.09)' }}
      >
        {`${shortName} · a ler o calendário…`}
      </div>
    );
  }

  if (!ready || !round) {
    // Há jornadas pela frente, mas todas já estão no cartão (a do próprio
    // dia, uma promovida a principal): a linha não as repete.
    if (ready && view.nextRound) return null;
    const l = plural((view.roundLabel || 'Jornada').toLowerCase());
    const count = (view.rounds || []).filter((r) => r.date_status !== 'cancelada').length;
    const texto = view.catalogStatus === 'erro'
      ? `${shortName} · não consegui ler o calendário`
      : count > 0 ? `${shortName} · sem mais ${l} esta época` : `${shortName} · calendário por sair`;
    return (
      <button
        type="button"
        data-testid="race-card-cup-line"
        data-state="sem-proxima"
        onClick={(e) => { e.stopPropagation(); onOpen?.(null); }}
        className="w-full flex items-center justify-between gap-2 mt-2.5 text-left text-[12px] font-bold"
        style={{ ...lineStyle, minHeight: 44, color: 'var(--text-3)' }}
      >
        <span className="min-w-0 truncate">{texto}</span>
        <ChevronRight size={15} aria-hidden="true" style={{ color: 'var(--text-4)', flexShrink: 0 }} />
      </button>
    );
  }

  const l = (view.roundLabel || 'Jornada').toLowerCase();
  // A mudança de data não se vê nesta linha curta, e o aria-label tapava-a:
  // vai para a descrição do botão (revisão da Fase 3, aviso [e]).
  const mudancaId = round.dateChange?.label ? `race-card-cup-line-${round.id}-mudanca` : undefined;
  return (
    <button
      type="button"
      data-testid="race-card-cup-line"
      data-state="proxima"
      aria-label={ariaOf(view, round)}
      aria-describedby={mudancaId}
      onClick={(e) => { e.stopPropagation(); onOpen?.(round); }}
      className="w-full flex items-center gap-2 mt-2.5 text-left"
      style={{ ...lineStyle, minHeight: 56, paddingTop: 8 }}
    >
      {mudancaId && <span id={mudancaId} className="sr-only">{round.dateChange.label}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-extrabold uppercase truncate" style={{ color: 'var(--text-4)', letterSpacing: '.05em' }}>
          {`${shortName} · próxima ${l}`}
        </span>
        <span className="block text-[13px] font-extrabold truncate mt-[2px]" style={{ color: 'var(--text-1)' }}>
          {`${round.chip} ${round.name || ''} · ${roundDateText(round, view.today)}`}
        </span>
        <span className="block text-[11.5px] mt-[2px] truncate">{statusLine(view, round)}</span>
      </span>
      <ChevronRight size={15} aria-hidden="true" style={{ color: 'var(--text-4)', flexShrink: 0 }} />
    </button>
  );
}

/** O cartão quando não há outra prova: a próxima jornada (`round`, a mesma
 *  régua da linha) é o "para onde vou". O mesmo toque da linha; "Todas as
 *  provas" continua (`footer`). */
export function CupNextCard({ view, round = null, onOpen, footer = null }) {
  if (!view || !round) return null;
  const l = (view.roundLabel || 'Jornada').toLowerCase();
  const day = round.date_status !== 'adiada' && typeof round.date === 'string' ? round.date.slice(0, 10) : null;
  const days = day && view.today ? Math.max(0, daysUntil(day, view.today)) : null;
  const sub = [roundDateText(round, view.today), courseLine(round)].filter(Boolean).join(' · ');
  const base = baseStatusOf(round, view);
  // A mudança de data vê-se no cartão, mas o aria-label tapava-a: entra na
  // descrição do botão (revisão da Fase 3, aviso [e]).
  const mudancaId = round.dateChange?.label ? `race-card-cup-${round.id}-mudanca` : undefined;
  return (
    <GlassCard glow tone="race" padding="16px 16px 12px" data-testid="race-card-cup">
      <button
        type="button"
        data-testid="race-card-cup-body"
        aria-label={ariaOf(view, round)}
        aria-describedby={mudancaId}
        onClick={() => onOpen?.(round)}
        className="w-full text-left"
        style={{ minHeight: 56, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        <span className="flex items-end justify-between gap-2.5">
          <span className="block flex-1 min-w-0">
            <span className="block text-[11px] font-extrabold uppercase truncate" style={{ color: 'var(--race)', letterSpacing: '.05em' }}>
              {`${view.shortName} · próxima ${l}`}
            </span>
            <span className="block text-[17px] font-black leading-[1.1] mt-1 truncate" style={{ color: 'var(--text-1)' }}>
              {`${round.chip} · ${round.name || ''}`}
            </span>
            {sub && (
              <span className="block text-[11.5px] mt-[3px] truncate" style={{ color: 'var(--text-3)' }}>{sub}</span>
            )}
          </span>
          {days != null ? (
            <span className="block text-right shrink-0" data-testid="race-card-cup-days">
              <span className="block text-[26px] font-black leading-none" style={{ color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{days}</span>
              <span className="block text-[11px] font-extrabold uppercase mt-0.5" style={{ color: 'var(--text-4)', letterSpacing: '.05em' }}>{days === 1 ? 'dia' : 'dias'}</span>
            </span>
          ) : (
            <span aria-hidden="true" className="shrink-0 text-[20px] font-black" style={{ color: 'var(--text-3)' }}>▸</span>
          )}
        </span>
        <span className="block text-[12px] mt-2.5">
          <CupStatus status={base} />
        </span>
        {mudancaId && (
          <span id={mudancaId} className="block text-[11.5px] mt-1" style={{ color: 'var(--warn)' }}>{round.dateChange.label}</span>
        )}
      </button>
      {footer}
    </GlassCard>
  );
}
