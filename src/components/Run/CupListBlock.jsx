import React, { useId } from 'react';
import { ChevronRight, Trophy } from 'lucide-react';
import { countdownLabel, daysUntil } from '../../utils/raceList';
import { cupRoundStatus, horaLabel, intentLabel, kmLabel, nextRoundApart } from '../../utils/cupCalendar';
import { raceDistanceLabel, findRaceRun } from '../../utils/run';
import { CupStatus } from './CupBits';
import { DateTile } from './DateTile';

/* O Troféu na lista de Provas (specs/trofeu.md §4.3, "bloco fixo por
   edição" — Fase 3, 2026-09-27). Só se monta com inscrição (ou com a pista
   dela, enquanto a leitura chega): quem não está inscrito nunca passa por
   aqui e a lista fica exatamente como era.

   PORQUÊ UM BLOCO. Onze jornadas a meio das próximas provas afogavam as
   principais — que são as que mandam. As jornadas que não foram promovidas
   saem das linhas normais (groupRaces, `trofeu`) e ficam aqui: o cabeçalho
   da edição, a próxima jornada e "+N no calendário", que abre o ecrã do
   Troféu. As que já passaram e estão por registar entram no grupo "Por
   registar", no máximo duas, com [Registar] e [Não fui] à vista.

   ACESSIBILIDADE (§4.3). O estado vai sempre em texto e com ícone (CupStatus,
   nunca só cor); a linha da próxima jornada lê-se pela frase da régua
   (`status.ariaLabel`) e o resto (distância, hora, mudança de data) fica
   como descrição; linhas de 56 px, botões de 44 px, e nunca um botão dentro
   de outro. O âmbar é só do rótulo da edição — as datas ficam em vidro
   neutro, como no resto da lista. */

/** "7,4 km às 9h30" — o percurso da jornada (o do escalão dele), com a
 *  distância da prova como recurso. null sem nenhum dos dois. */
export function courseLine(round) {
  const course = round?.course;
  const km = course?.distance_m != null
    ? kmLabel(Number(course.distance_m) / 1000)
    : kmLabel(round?.race?.distance_km);
  const hora = horaLabel(course?.start_time);
  if (km && hora) return `${km} às ${hora}`;
  return km || (hora ? `às ${hora}` : null);
}

/** O estado da jornada sem o "Próxima" — Vou, Não vou, Ainda não sei, Por
 *  decidir (§4.3). A régua é a mesma; só não se marca a próxima, porque o
 *  sítio onde isto aparece já o diz. */
export function baseStatusOf(round, view) {
  if (!round) return null;
  return cupRoundStatus(round, { today: view?.today, nextRoundId: null, roundLabel: view?.roundLabel });
}

/** Quando é: "daqui a 4 dias", "amanhã", "adiada", "data por anunciar";
 *  com data provável, "(data provável)". */
export function roundWhenLabel(round, today) {
  if (round?.date_status === 'adiada') return 'adiada';
  const day = typeof round?.date === 'string' ? round.date.slice(0, 10) : null;
  if (!day || !today) return 'data por anunciar';
  const when = countdownLabel(daysUntil(day, today));
  return round.date_status === 'provavel' ? `${when} (data provável)` : when;
}

// A data que se pode mostrar num azulejo: sem data, ou adiada (a data que
// lá está já não vale), o azulejo mostra o chip e um traço.
function tileDate(round) {
  if (round?.date_status === 'adiada') return null;
  return typeof round?.date === 'string' && round.date.length >= 10 ? round.date : null;
}

/** O azulejo da data de uma jornada: o de sempre, ou "J3 / —" sem data. */
export function CupDateTile({ round }) {
  const date = tileDate(round);
  if (date) return <DateTile date={date} />;
  return (
    <span
      aria-hidden="true"
      className="flex flex-col items-center justify-center shrink-0"
      style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,.06)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-2)' }}
    >
      <span className="text-[13px] font-black leading-none">{round?.chip || ''}</span>
      <span className="text-[11px] font-extrabold leading-none mt-[3px]">—</span>
    </span>
  );
}

const plural = (label) => `${label}s`;

/** "J3 · Corrida CCD": o chip é visual; o leitor de ecrã ouve "Jornada 3". */
function JornadaTitulo({ chip, roundLabel, roundNo, name }) {
  return (
    <>
      <span aria-hidden="true">{chip}</span>
      <span className="sr-only">{`${roundLabel} ${roundNo ?? ''}`.trim()}</span>
      {name ? ` · ${name}` : ''}
    </>
  );
}

function semProximaTexto(view, loading) {
  if (loading || !view) return 'A ler o calendário…';
  if (view.catalogStatus === 'erro') return 'Não consegui ler o calendário.';
  const count = (view.rounds || []).filter((r) => r.date_status !== 'cancelada').length;
  return count > 0 ? `Sem mais ${plural(view.roundLabel.toLowerCase())} esta época` : 'Ainda não saiu o calendário';
}

/** A próxima jornada numa linha (56 px): o toque abre o hub da prova dela
 *  ou, sem prova, a jornada no ecrã do Troféu. */
function ProximaRow({ round, view, onOpenRace, onOpenTrofeu }) {
  const metaId = useId();
  const changeId = useId();
  const base = baseStatusOf(round, view);
  const meta = [
    roundWhenLabel(round, view.today),
    courseLine(round),
    base?.key === 'vou' ? intentLabel(round.intent) : null,
  ].filter(Boolean).join(' · ');
  const open = () => {
    if (round.race?.id) onOpenRace(round.race.id);
    else onOpenTrofeu({ roundId: round.id, mode: 'calendario' });
  };
  return (
    <button
      type="button"
      data-testid="cup-list-proxima"
      aria-label={round.status?.ariaLabel}
      aria-describedby={round.dateChange ? `${metaId} ${changeId}` : metaId}
      onClick={open}
      className="flex items-center gap-3 w-full text-left"
      style={{ minHeight: 56, borderRadius: 16, padding: '6px 8px 6px 6px', background: 'none', border: 'none', cursor: 'pointer' }}
    >
      <CupDateTile round={round} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-extrabold truncate" style={{ color: 'var(--text-1)' }}>
          <JornadaTitulo chip={round.chip} roundLabel={view.roundLabel} roundNo={round.round_no} name={round.name} />
        </span>
        <span id={metaId} className="block text-[11.5px] mt-[2px] truncate" style={{ color: 'var(--text-4)' }}>{meta}</span>
        {round.dateChange && (
          <span id={changeId} className="block text-[11.5px] mt-[2px] truncate" data-testid="cup-list-mudou" style={{ color: 'var(--warn)' }}>
            {round.dateChange.label}
          </span>
        )}
      </span>
      <CupStatus status={base} showDetail={false} className="text-[11.5px] shrink-0" />
      <ChevronRight size={15} aria-hidden="true" style={{ color: 'var(--text-4)', flexShrink: 0 }} />
    </button>
  );
}

/** O bloco fixo da edição no fim das "Próximas" (§4.3).
 *  `listing` é o de useCupListing (com `loading` e `view`); `onOpenTrofeu`
 *  recebe { roundId?, mode? } e abre o ecrã do Troféu: o cabeçalho sem modo
 *  (o ecrã decide — com jornadas por decidir, a lista pré-marcada, §4.3), o
 *  "+N" e uma jornada concreta no calendário. */
export function CupListBlock({ listing, onOpenRace, onOpenTrofeu }) {
  const view = listing?.view || null;
  if (!listing) return null;
  const ready = !!view?.catalogReady;
  const shortName = view?.shortName || 'Troféu';
  const editionNo = Number(view?.edition?.edition_no);
  const label = Number.isInteger(editionNo) && editionNo > 0 ? `${shortName} · ${editionNo}.ª` : shortName;
  const roundLabel = view?.roundLabel || 'Jornada';
  const l = roundLabel.toLowerCase();
  // A próxima que ainda não está nas linhas normais: uma promovida a
  // principal já lá está, com o chip — o bloco não a repete (passa à
  // seguinte). Quando todas as que faltam já estão lá, não há linha, só o
  // "+N no calendário".
  const next = ready ? nextRoundApart(view, (race) => !listing.isFixed(race)) : null;
  const todasNasLinhas = ready && !next && !!view.nextRound;
  const more = ready ? Math.max(0, (view.aheadCount ?? 0) - (next ? 1 : 0)) : 0;
  const progress = ready ? view.progress : null;

  return (
    <div
      data-testid="cup-list-block"
      className="mt-1.5"
      style={{ borderRadius: 16, border: '1px solid var(--border-glass)', background: 'var(--surface-glass)', padding: '2px 2px 4px' }}
    >
      <button
        type="button"
        data-testid="cup-list-cabecalho"
        aria-label={progress
          ? `${label}: ${progress.done} de ${progress.total} ${plural(l)} feitas. Abrir as ${plural(l)}.`
          : `${label}. Abrir as ${plural(l)}.`}
        onClick={() => onOpenTrofeu({ mode: null })}
        className="flex items-center gap-2 w-full text-left"
        style={{ minHeight: 44, padding: '0 8px', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <Trophy size={14} aria-hidden="true" style={{ color: 'var(--race)', flexShrink: 0 }} />
        <span className="flex-1 min-w-0 truncate text-[11px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--race)' }}>
          {label}
        </span>
        {progress && (
          <span className="text-[11.5px] font-extrabold shrink-0" style={{ color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
            {`${progress.done} de ${progress.total}`}
          </span>
        )}
        <ChevronRight size={15} aria-hidden="true" style={{ color: 'var(--text-4)', flexShrink: 0 }} />
      </button>

      {next ? (
        <ProximaRow round={next} view={view} onOpenRace={onOpenRace} onOpenTrofeu={onOpenTrofeu} />
      ) : todasNasLinhas ? null : (
        // Um estado ("A ler o calendário…", "Não consegui ler…", "Sem mais
        // jornadas…"): role="status" (revisão da Fase 3, aviso [e]).
        <p
          role="status"
          data-testid="cup-list-sem-proxima"
          className="m-0 flex items-center text-[12.5px] font-bold"
          style={{ minHeight: 44, padding: '0 10px', color: 'var(--text-3)' }}
        >
          {semProximaTexto(view, listing.loading)}
        </p>
      )}

      {more > 0 && (
        <button
          type="button"
          data-testid="cup-list-mais"
          aria-label={more === 1
            ? `Ver a outra ${l} no calendário (${shortName})`
            : `Ver as outras ${more} ${plural(l)} no calendário (${shortName})`}
          onClick={() => onOpenTrofeu({ mode: 'calendario' })}
          className="flex items-center gap-1 w-full text-left text-[12px] font-extrabold"
          style={{ minHeight: 44, padding: '0 10px', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}
        >
          {`+${more} no calendário`}
          <ChevronRight size={14} aria-hidden="true" style={{ color: 'var(--text-4)' }} />
        </button>
      )}
    </div>
  );
}

/** Quantas jornadas por registar se mostram na lista; o resto está no
 *  calendário do Troféu (§4.3). */
export const CUP_REGISTAR_MAX = 2;

/** As jornadas por registar, a seguir às normais do grupo "Por registar"
 *  (§4.3): no máximo duas, a mais recente primeiro, cada uma com a linha
 *  (→ hub), [Registar] e — só sem corrida ligada — [Não fui]; o resto em
 *  "+N por registar ›". `entries` são as de groupRaces (`trofeu.porRegistar`). */
export function CupPorRegistarRows({ entries, view, runs, onOpenRace, onRegister, onNaoFui, onOpenTrofeu }) {
  if (!entries?.length) return null;
  const shown = entries.slice(0, CUP_REGISTAR_MAX);
  const rest = entries.length - shown.length;
  const roundOf = (entry) => (entry.jornada && view ? (view.rounds || []).find((r) => r.id === entry.jornada.roundId) || null : null);
  return (
    <>
      {shown.map((entry) => {
        const { race, jornada } = entry;
        const round = roundOf(entry);
        const nome = race.name || round?.name || 'Prova sem nome';
        // Para os botões: "Jornada 2, Corta-mato do NAZA".
        const falado = jornada ? `${jornada.roundLabel} ${jornada.roundNo ?? ''}, ${nome}` : nome;
        // "Não fui" só sem corrida ligada: com ela, ele foi (§4.5).
        const semCorrida = !findRaceRun(runs, race);
        return (
          <div key={race.id} data-testid={`cup-list-registar-${race.id}`}>
            <button
              type="button"
              data-testid={`cup-list-registar-${race.id}-abrir`}
              // A frase da régua ("… Por registar."), como no calendário.
              aria-label={round?.status?.ariaLabel || undefined}
              onClick={() => onOpenRace(race.id)}
              className="flex items-center gap-3 w-full text-left"
              style={{ minHeight: 56, borderRadius: 16, padding: '6px 8px 6px 6px', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <DateTile date={race.date} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-extrabold truncate" style={{ color: 'var(--text-1)' }}>
                  {jornada
                    ? <JornadaTitulo chip={jornada.chip} roundLabel={jornada.roundLabel} roundNo={jornada.roundNo} name={nome} />
                    : nome}
                </span>
                <span className="block text-[11.5px] mt-[2px] truncate" style={{ color: 'var(--text-4)' }}>
                  {[raceDistanceLabel(race.distance_km), 'já passou'].filter(Boolean).join(' · ')}
                </span>
              </span>
              <ChevronRight size={15} aria-hidden="true" style={{ color: 'var(--text-4)', flexShrink: 0 }} />
            </button>
            <div className="flex gap-2" style={{ padding: '0 8px 6px 62px' }}>
              <button
                type="button"
                data-testid={`cup-list-registar-${race.id}-registar`}
                aria-label={`Registar: ${falado}`}
                onClick={() => onRegister(race.id)}
                className="flex-1 inline-flex items-center justify-center rounded-[11px] text-[12.5px] font-extrabold"
                style={{ minHeight: 44, background: 'var(--tint-warn-bg)', border: '1px solid var(--tint-warn-bd)', color: 'var(--warn)' }}
              >
                Registar
              </button>
              {semCorrida && round && (
                <button
                  type="button"
                  data-testid={`cup-list-registar-${race.id}-nao-fui`}
                  aria-label={`Não fui: ${falado}`}
                  onClick={() => onNaoFui(round)}
                  className="flex-1 inline-flex items-center justify-center rounded-[11px] text-[12.5px] font-extrabold"
                  style={{ minHeight: 44, background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-2)' }}
                >
                  Não fui
                </button>
              )}
            </div>
          </div>
        );
      })}
      {rest > 0 && (
        <button
          type="button"
          data-testid="cup-list-registar-mais"
          aria-label={`Ver as outras ${rest} por registar no calendário${view?.shortName ? ` (${view.shortName})` : ''}`}
          onClick={() => onOpenTrofeu({ mode: 'calendario' })}
          className="flex items-center gap-1 w-full text-left text-[12px] font-extrabold"
          style={{ minHeight: 44, padding: '0 10px', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}
        >
          {`+${rest} por registar`}
          <ChevronRight size={14} aria-hidden="true" style={{ color: 'var(--text-4)' }} />
        </button>
      )}
    </>
  );
}

export default CupListBlock;
