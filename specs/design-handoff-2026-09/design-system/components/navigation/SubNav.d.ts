/**
 * IMPLEMENTADO — fonte de verdade: `src/components/shared/SubNav.jsx`.
 *
 * Diferenças face ao handoff: a prop chama-se `activeIndex` (não `active`),
 * não existe `tones` nem `width` — a cor vive em cada item (`item.tone`) e
 * a barra ocupa a largura do contentor. Os itens ganharam `srLabel` e `key`.
 *
 * A cor da pílula é a do separador ativo, não uma cor fixa da barra.
 * A minhoca corre a SUBNAV_PILL_DURATION (480ms, --dur-pill-sub), bem abaixo
 * da nav inferior: auditoria, achado 5 — na nav é assinatura, num subnav que
 * se troca quatro vezes seguidas para comparar módulos seria espera.
 */
export interface SubNavItem {
  icon?: React.ReactNode;
  /** curto, para caber em cinco separadores a 390px ("Geral", não "Visão Geral") */
  label: string;
  /** o nome por extenso, só para leitor de ecrã */
  srLabel?: string;
  /** a cor deste separador quando ativo; 'run' por omissão */
  tone?: 'run' | 'gym' | 'nutrition' | 'body' | 'coach' | 'race';
  key?: string;
}
export interface SubNavProps {
  items: SubNavItem[];
  activeIndex?: number;
  /** recebe o índice e o próprio item */
  onChange?: (index: number, item: SubNavItem) => void;
  className?: string;
  style?: React.CSSProperties;
}
export default function SubNav(props: SubNavProps): JSX.Element;
