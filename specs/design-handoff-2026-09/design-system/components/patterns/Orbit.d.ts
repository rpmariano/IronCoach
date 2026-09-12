/**
 * @startingPoint section="Patterns" subtitle="Anéis de calorias, proteína e água" viewport="700x220"
 */
export interface OrbitProps {
  /** exatamente 3, de fora para dentro: calorias, proteína, água */
  rings: { label: string; value: number; target: number; color: string; unit?: string; display?: string; targetDisplay?: string }[];
  size?: number;
  /** desenha à entrada (1100ms, stagger 80ms) */
  animate?: boolean;
}
export function Orbit(props: OrbitProps): JSX.Element;
