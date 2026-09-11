/**
 * @startingPoint section="Patterns" subtitle="Moldura de ecrã completa: fundo, header, scroll, nav" viewport="700x220"
 */
export interface ScreenFrameProps {
  /** AppHeader ou ContextHeader */
  header?: React.ReactNode;
  children: React.ReactNode;
  /** BottomNav e/ou ActionBar */
  footer?: React.ReactNode;
  /** Sheet, Dialog, menu do FAB */
  overlay?: React.ReactNode;
  /** 112 por defeito; 168 quando há ActionBar; 130 no onboarding */
  scrollPadBottom?: number;
  ambient?: 'default' | 'coach' | 'race';
  width?: number;
  height?: number;
  radius?: number;
}
export function ScreenFrame(props: ScreenFrameProps): JSX.Element;
