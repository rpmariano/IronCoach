/**
 * PROTÓTIPO — não foi implementado com este nome. Os campos reais da app são `src/components/shared/Input.jsx`, `Select.jsx` e `DurationInput.jsx`, com APIs próprias. Usar este componente só em mocks/protótipos avulsos; em código de produção, ler os de src/.
 *
 */
export interface FieldProps {
  label?: string;
  value?: string;
  placeholder?: string;
  /** cor da borda em foco — o contexto do ecrã */
  tone?: 'coach' | 'race' | 'run' | 'gym' | 'nutrition' | 'body';
  multiline?: boolean;
  focused?: boolean;
  /** nota por baixo, 11px */
  hint?: string;
  onChange?: (value: string) => void;
  style?: React.CSSProperties;
}
export function Field(props: FieldProps): JSX.Element;
