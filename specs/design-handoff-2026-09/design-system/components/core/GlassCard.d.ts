/**
 * @startingPoint section="Components" subtitle="O cartão de vidro base" viewport="700x200"
 *
 * IMPLEMENTADO — fonte de verdade: `src/components/shared/GlassCard.jsx`.
 *
 * Diferença face ao handoff: `radius` é um número de px (24 por omissão),
 * não 'lg'|'xl'|'2xl'.
 */
export interface GlassCardProps {
  /**
   * Muda a borda (e, na Carol, o fundo) e a cor do brilho. Sem tone, é o
   * vidro neutro: --surface-glass + --border-glass.
   * Só coach/race/gym têm borda própria; os outros usam a borda neutra e
   * mudam apenas o `glow`.
   */
  tone?: 'race' | 'coach' | 'run' | 'gym' | 'nutrition' | 'body';
  /** brilho radial no canto superior direito — só em cartões principais */
  glow?: boolean;
  /** raio em px */
  radius?: number;
  padding?: number | string;
  className?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  /** o resto vai para a <div> */
  [key: string]: unknown;
}
export default function GlassCard(props: GlassCardProps): JSX.Element;
