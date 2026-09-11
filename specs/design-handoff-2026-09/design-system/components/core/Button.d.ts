/**
 * @startingPoint section="Components" subtitle="Ação com 44px mínimo, oito tons de significado" viewport="700x200"
 */
export interface ButtonProps {
  /** primary = gradiente/cheio; tinted = fundo 16% + borda; secondary = vidro neutro; ghost = só texto */
  variant?: 'primary' | 'tinted' | 'secondary' | 'ghost';
  /** cor de significado. Nunca 'race' fora do contexto da prova. */
  tone?: 'coach' | 'race' | 'ok' | 'run' | 'gym' | 'nutrition' | 'body' | 'warn';
  /** sm = 44px, md = 46px, lg = 52px */
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  children?: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}
export function Button(props: ButtonProps): JSX.Element;
