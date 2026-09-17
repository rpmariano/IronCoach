/**
 * PROTÓTIPO — em produção não é um componente mas um hook: `useElasticPillIndicator(containerRef, activeIndex, opts)` em `src/utils/useElasticPillIndicator.js`, que mede os separadores e devolve o estilo do indicador. Lá vivem também as durações reais, o overshoot (2.2) e a guarda `pillMotion` que garante que nunca há duas em movimento.
 *
 */
export interface ElasticPillProps {
  /** posição alvo em px dentro do contentor (position:relative) */
  target: { left: number; width: number };
  /** nav = 4px de altura, gradiente, 420+130·dist ms; sub = preenche a altura do subnav, 320ms */
  speed?: 'nav' | 'sub';
  style?: React.CSSProperties;
}
export function ElasticPill(props: ElasticPillProps): JSX.Element;
