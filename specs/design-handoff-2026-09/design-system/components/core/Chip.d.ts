/**
 * IMPLEMENTADO — fonte de verdade: `src/components/shared/Chip.jsx`.
 *
 * Diferenças face ao handoff: a prop de estado chama-se `active` (não
 * `selected`), a cor chama-se `variant` (não `tone`), e não existe `badge` —
 * o tamanho é fixo. O ativo é uma pílula de vidro (fundo /15, borda /40,
 * texto na cor), não preenchimento sólido.
 */
export interface ChipProps {
  /** estado selecionado */
  active?: boolean;
  /** a cor quando ativo. 'accent' é o nome histórico da Carol (= coach). */
  variant?: 'accent' | 'gym' | 'run' | 'nutrition' | 'body' | 'coach' | 'light';
  /** arredondamento: 'full' pílula, 'xl' cantos de cartão */
  rounded?: 'full' | 'xl';
  children: React.ReactNode;
  className?: string;
  /** o resto vai para o <button> (onClick, type, aria-*, ...) */
  [key: string]: unknown;
}
export function Chip(props: ChipProps): JSX.Element;
export default Chip;
