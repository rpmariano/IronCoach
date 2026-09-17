/**
 * PROTÓTIPO — não foi implementado como cartão próprio. Em produção a voz da Carol aparece por `<Warning tone="coach">` (avisos e insights) e por `src/components/shared/CoachText.jsx` (que formata o texto dela, não o envolve num cartão). Usar este só em mocks.
 *
 */
export interface CoachNoteProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}
export function CoachNote(props: CoachNoteProps): JSX.Element;
