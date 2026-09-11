/**
 */
export interface ChipProps {
  tone?: 'neutral' | 'race' | 'coach' | 'run' | 'gym' | 'nutrition' | 'body' | 'ok' | 'warn' | 'danger';
  /** seletor ativo — borda de 1.5px na cor cheia */
  selected?: boolean;
  /** badge pequeno (24px), uppercase */
  badge?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}
export function Chip(props: ChipProps): JSX.Element;
