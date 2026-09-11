/**
 * @startingPoint section="Patterns" subtitle="Trilho do macrociclo com fases" viewport="700x220"
 */
export interface RaceTrailProps {
  weeks?: number;
  /** semana atual, 1-based */
  current?: number;
  phases?: { label: string; to: number }[];
  startLabel?: string;
  endLabel?: string;
  width?: number;
}
export function RaceTrail(props: RaceTrailProps): JSX.Element;
