/**
 */
export interface ElasticPillProps {
  /** posição alvo em px dentro do contentor (position:relative) */
  target: { left: number; width: number };
  /** nav = 4px de altura, gradiente, 420+130·dist ms; sub = preenche a altura do subnav, 320ms */
  speed?: 'nav' | 'sub';
  style?: React.CSSProperties;
}
export function ElasticPill(props: ElasticPillProps): JSX.Element;
