/**
 * IMPLEMENTADO — fonte de verdade: `src/components/shared/SectionLabel.jsx`.
 * 11px, 800, uppercase, --tracking-eyebrow. Sem tone é --text-4.
 */
export interface SectionLabelProps {
  children: React.ReactNode;
  /** qualquer cor de significado; vira `var(--<tone>)` */
  tone?: 'race' | 'coach' | 'run' | 'gym' | 'nutrition' | 'body' | 'ok' | 'warn' | 'danger';
  className?: string;
  style?: React.CSSProperties;
}
export default function SectionLabel(props: SectionLabelProps): JSX.Element;
