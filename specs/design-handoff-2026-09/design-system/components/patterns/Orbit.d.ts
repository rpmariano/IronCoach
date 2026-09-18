/**
 * @startingPoint section="Patterns" subtitle="Anéis de calorias, proteína e água" viewport="700x220"
 *
 * IMPLEMENTADO — fonte de verdade: `src/components/shared/Orbit.jsx`.
 *
 * Só leitura; o registo vive no FAB (auditoria 2026-09-09, achado 7: o
 * "+250" dentro dos anéis era o alvo mais pequeno da app). O handoff não
 * documentava `empty` nem a `OrbitLegend`.
 */
export interface OrbitRing {
  label: string;
  value: number;
  target: number;
  color: string;
  unit?: string;
  /** o valor já formatado (a água vem em "1,5"); usado pela legenda */
  display?: string;
  targetDisplay?: string;
}
export interface OrbitProps {
  /** até 3, de fora para dentro: calorias, proteína, água */
  rings?: OrbitRing[];
  size?: number;
  /** anéis tracejados do primeiro dia */
  empty?: boolean;
  /**
   * Anima os três a partir de zero, de fora para dentro, 80ms de
   * desfasamento, --dur-rings (1100ms). Quem decide é quem monta — no Início
   * é o useRevealAnimation do StatusCard.
   */
  animate?: boolean;
}
export function Orbit(props: OrbitProps): JSX.Element;

export interface OrbitLegendProps {
  rings?: OrbitRing[];
  /** números que contam a subir (animação 2 do ponto 9) */
  animate?: boolean;
}
/** Ponto de cor, etiqueta uppercase, valor / alvo. Vive ao lado dos anéis. */
export function OrbitLegend(props: OrbitLegendProps): JSX.Element;
