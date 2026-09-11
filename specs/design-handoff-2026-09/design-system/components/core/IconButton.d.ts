/**
 */
export interface IconButtonProps {
  children: React.ReactNode;
  variant?: 'glass' | 'plain' | 'coach';
  shape?: 'square' | 'round';
  /** obrigatório: o botão não tem texto */
  label: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}
export function IconButton(props: IconButtonProps): JSX.Element;
