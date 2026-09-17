/**
 * IMPLEMENTADO — fonte de verdade: `src/components/shared/Warning.jsx`.
 * Nunca âmbar: o âmbar é da prova e só da prova. Nunca anima nem pulsa —
 * a cor já faz o trabalho parada.
 *
 * Diferenças face ao handoff: existe o tom `coach` (os dois banners de
 * insights tinham uma severidade "info" que era azul genérico, e o azul
 * genérico não é nenhum dos oito significados), e o ficheiro exporta ainda
 * `WarningAction`, o botão que deve preencher `actions`.
 */
export interface WarningProps {
  /** eyebrow uppercase de 11px, na cor do tom */
  title?: React.ReactNode;
  /** o texto do aviso, 12,5px */
  children: React.ReactNode;
  /** nó opcional; por omissão o ícone lucide do tom */
  icon?: React.ReactNode;
  /** botões por baixo — usar <WarningAction> */
  actions?: React.ReactNode;
  /**
   * warn   coral    — atenção, viabilidade, energia disponível
   * ok     verde    — dentro do alvo, concluído
   * danger vermelho — erro e admin (role="alert"; os outros são "status")
   * coach  ciano    — a Carol a explicar algo que não é aviso
   */
  tone?: 'warn' | 'ok' | 'danger' | 'coach';
  className?: string;
  style?: React.CSSProperties;
  [key: string]: unknown;
}
export default function Warning(props: WarningProps): JSX.Element;

export interface WarningActionProps {
  tone?: 'warn' | 'ok' | 'danger' | 'coach';
  onClick?: () => void;
  children: React.ReactNode;
  type?: 'button' | 'submit' | 'reset';
  /** é FUNDIDO com o estilo base, não o substitui — o piso de 44px não pode
   *  depender de quem chama se lembrar dele */
  style?: React.CSSProperties;
  [key: string]: unknown;
}
export function WarningAction(props: WarningActionProps): JSX.Element;
