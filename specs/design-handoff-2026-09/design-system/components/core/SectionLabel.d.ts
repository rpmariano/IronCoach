/**
 */
export interface SectionLabelProps {
  children: React.ReactNode;
  tone?: 'race' | 'coach' | 'run' | 'gym' | 'nutrition' | 'body';
  style?: React.CSSProperties;
}
export function SectionLabel(props: SectionLabelProps): JSX.Element;
