/**
 */
export interface ActionBarProps {
  children: React.ReactNode;
  /** true = assenta sobre a nav (Perfil, registos); false = colada ao fundo (onboarding, sem nav) */
  aboveNav?: boolean;
}
export function ActionBar(props: ActionBarProps): JSX.Element;
