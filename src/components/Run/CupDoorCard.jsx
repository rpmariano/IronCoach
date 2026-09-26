import React from 'react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { ChevronRight, Trophy } from 'lucide-react';
import GlassCard from '../shared/GlassCard';
import Button from '../shared/Button';

/* O cartão do Troféu em Provas (specs/trofeu.md §4.1). Fica no FIM do ecrã,
   tom --race, e só aparece quando useCup() diz que a porta se aplica — para
   quem não corre o circuito nenhum destes componentes chega a montar-se
   (invariância, §1). 2026-09-26. */

const mesCurto = (iso) => {
  try { return format(parseISO(iso), 'MMM', { locale: pt }).replace('.', ''); } catch { return ''; }
};

// "de dezembro a junho" (§4.1): o mês por extenso, como na spec.
const mesLongo = (iso) => {
  try { return format(parseISO(iso), 'MMMM', { locale: pt }); } catch { return ''; }
};

const diaLabel = (iso) => {
  try { return format(parseISO(iso), "dd MMM", { locale: pt }).replace('.', ''); } catch { return ''; }
};

function distanciaLabel(distanceM) {
  if (distanceM == null) return null;
  const km = Number(distanceM) / 1000;
  if (!Number.isFinite(km)) return null;
  const arredondado = Math.round(km * 10) / 10;
  return `${String(arredondado).replace('.', ',')} km`;
}

// A decisão da próxima jornada, com ícone E texto (nunca só cor, §4.3).
export function decisionMeta(decision) {
  if (decision === 'vou') return { label: 'Vou', icon: '✓', color: 'var(--ok)' };
  if (decision === 'nao_vou') return { label: 'Não vou', icon: '✕', color: 'var(--danger)' };
  if (decision === 'nao_sei') return { label: 'Ainda não sei', icon: '?', color: 'var(--text-3)' };
  // "Não fui" (§4.5) também é uma decisão — sem isto a jornada aparecia
  // "Por decidir" (revisão da Fase 1, 2026-09-26).
  if (decision === 'nao_fui') return { label: 'Não fui', icon: '✕', color: 'var(--text-3)' };
  return { label: 'Por decidir', icon: '⋯', color: 'var(--text-4)' };
}

/** "34.º Troféu de Atletismo de Cascais" (§4.1): o nome completo com o número
 *  da edição. Sem número, só o nome; sem nome, o curto. */
export function editionTitle(edition, competition) {
  const nome = competition?.name || competition?.short_name || 'Troféu';
  const n = Number(edition?.edition_no);
  return Number.isInteger(n) && n > 0 ? `${n}.º ${nome}` : nome;
}

export default function CupDoorCard({ view, onEnroll, onDismiss, onOpenTrofeu }) {
  const door = view?.door;
  if (!door) return null;

  const competition = view.competition;
  const nome = competition?.short_name || competition?.name || 'Troféu';

  if (door.kind === 'convite') {
    // "34.º Troféu de Atletismo de Cascais · 11 provas de dezembro a junho"
    // (§4.1). O resumo só aparece com o catálogo lido — antes disso contava
    // 0 provas e a linha ficava vazia (revisão da Fase 1, 2026-09-26).
    const { count, from, to } = door.span || {};
    const periodo = from && to
      ? (mesLongo(from) === mesLongo(to) ? `em ${mesLongo(from)}` : `de ${mesLongo(from)} a ${mesLongo(to)}`)
      : null;
    const resumo = !view.catalogReady
      ? null
      : count
        ? [`${count} ${count === 1 ? 'prova' : 'provas'}`, periodo].filter(Boolean).join(' ')
        : 'Calendário ainda por sair';
    return (
      <GlassCard tone="race" glow data-testid="cup-door-card" style={{ marginTop: 6 }}>
        <div className="flex items-start gap-2.5">
          <Trophy size={18} aria-hidden="true" style={{ color: 'var(--race)', flexShrink: 0, marginTop: 2 }} />
          <div className="min-w-0 flex-1">
            <h3 className="m-0 text-[15px] font-black" style={{ color: 'var(--text-1)', letterSpacing: 'var(--tracking-tight)' }}>
              {editionTitle(view.edition, competition)}
            </h3>
            {resumo && (
              <p className="m-0 text-[12.5px] mt-1" data-testid="cup-door-resumo" style={{ color: 'var(--text-3)' }}>
                {resumo}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            variant="module"
            moduleColor="var(--race)"
            className="flex-1"
            data-testid="cup-door-inscrever"
            onClick={() => onEnroll?.(view.edition)}
          >
            Inscrever-me
          </Button>
          <Button
            variant="ghost"
            data-testid="cup-door-nao-interessa"
            aria-label="Não me interessa, não voltar a mostrar este convite"
            onClick={() => onDismiss?.(view.edition?.id)}
          >
            Não me interessa
          </Button>
        </div>
      </GlassCard>
    );
  }

  // 'inscrito': a próxima jornada, e toca para o ecrã do Troféu.
  const nextRound = door.nextRound;
  const roundRow = (view.rounds || []).find((r) => r.id === nextRound?.id) || null;
  const decisao = decisionMeta(roundRow?.participation?.decision ?? null);
  const distancia = distanciaLabel(roundRow?.course?.distance_m);
  const dataLabel = nextRound?.date ? diaLabel(nextRound.date) : 'Data a anunciar';
  const provavel = nextRound?.date_status === 'provavel';

  return (
    <button
      type="button"
      data-testid="cup-door-card"
      onClick={onOpenTrofeu}
      aria-label={`Abrir o Troféu. Próxima jornada: ${nextRound?.name || nome}, ${dataLabel}${distancia ? `, ${distancia}` : ''}. ${decisao.label}.`}
      className="w-full text-left"
      style={{ marginTop: 6, minHeight: 44, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
    >
      <GlassCard tone="race" glow>
        <div className="flex items-center gap-2.5">
          <Trophy size={18} aria-hidden="true" style={{ color: 'var(--race)', flexShrink: 0 }} />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--race)' }}>
              {nome}
            </div>
            {nextRound ? (
              <p className="m-0 text-[13px] font-extrabold mt-1 truncate" style={{ color: 'var(--text-1)' }}>
                {nextRound.name || 'Próxima jornada'} · {dataLabel}{provavel ? ' (provável)' : ''}
                {distancia ? ` · ${distancia}` : ''}
              </p>
            ) : (
              <p className="m-0 text-[13px] font-bold mt-1" style={{ color: 'var(--text-3)' }}>Ainda não saiu o calendário</p>
            )}
          </div>
          {nextRound && (
            <span className="shrink-0 inline-flex items-center gap-1 text-[12px] font-extrabold" style={{ color: decisao.color }}>
              <span aria-hidden="true">{decisao.icon}</span>
              {decisao.label}
            </span>
          )}
          <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--text-4)', flexShrink: 0 }} />
        </div>
      </GlassCard>
    </button>
  );
}

export { distanciaLabel, diaLabel, mesCurto, mesLongo };
