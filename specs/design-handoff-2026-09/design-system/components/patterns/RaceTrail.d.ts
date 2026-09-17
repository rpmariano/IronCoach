/**
 * @startingPoint section="Patterns" subtitle="Trilho do macrociclo com fases" viewport="700x220"
 *
 * IMPLEMENTADO — fonte de verdade: `src/components/shared/RaceTrail.jsx`.
 *
 * O handoff não documentava `raceId`, que é o que faz o avanço semanal
 * animar UMA vez: o marcador parte da semana anterior e percorre até
 * `current` em --dur-trail. Sem `raceId` o trilho é sempre estático.
 * A animação repete quando a SEMANA muda, não quando se volta ao ecrã.
 */
export interface RaceTrailPhase {
  label: string;
  /** a semana onde esta fase acaba (1-based) */
  to: number;
}
export interface RaceTrailProps {
  weeks?: number;
  /** semana atual, 1-based */
  current?: number;
  phases?: RaceTrailPhase[];
  startLabel?: string;
  endLabel?: string;
  width?: number;
  /** id da prova — chave do "já mostrei este avanço" em localStorage */
  raceId?: string;
}
export default function RaceTrail(props: RaceTrailProps): JSX.Element;

/** A chave de localStorage de uma prova: `ironcoach:trail-week:<raceId>`. */
export function trailWeekKey(raceId: string): string;

/** Esquece as decisões de animação em memória — para testes. */
export function resetTrailDecisions(): void;
