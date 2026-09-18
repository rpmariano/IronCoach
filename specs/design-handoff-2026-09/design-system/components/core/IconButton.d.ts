/**
 * PROTÓTIPO — não foi implementado com este nome. Em produção é `<Button variant="icon" size="icon">` (src/components/shared/Button.jsx); os casos com identidade própria são `AddButton.jsx` e `CoachButton.jsx`. Usar este só em mocks.
 *
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
