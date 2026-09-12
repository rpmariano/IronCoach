/**
 * @startingPoint section="Components" subtitle="O cartão de vidro base" viewport="700x200"
 */
export interface GlassCardProps {
  /** muda borda/fundo (coach, race, gym) e a cor do brilho */
  tone?: 'race' | 'coach' | 'run' | 'gym' | 'nutrition' | 'body';
  /** brilho radial no canto superior direito */
  glow?: boolean;
  radius?: 'lg' | 'xl' | '2xl';
  padding?: number | string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}
export function GlassCard(props: GlassCardProps): JSX.Element;
