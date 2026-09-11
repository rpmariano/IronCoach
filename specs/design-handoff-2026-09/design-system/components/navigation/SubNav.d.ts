/**
 */
export interface SubNavProps {
  items: { icon?: React.ReactNode; label: string }[];
  active?: number;
  onChange?: (index: number) => void;
  /** cor por separador, na ordem dos items (ex.: ['run','run','gym','nutrition','body']) */
  tones?: ('run' | 'gym' | 'nutrition' | 'body' | 'coach' | 'race')[];
  width?: number;
}
export function SubNav(props: SubNavProps): JSX.Element;
