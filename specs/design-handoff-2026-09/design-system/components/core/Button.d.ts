/**
 * @startingPoint section="Components" subtitle="Ação com 44px mínimo, oito tons de significado" viewport="700x200"
 *
 * IMPLEMENTADO — a fonte de verdade é `src/components/shared/Button.jsx`.
 * O `.jsx` ao lado é o stub de protótipo do handoff e tem uma API mais
 * pequena; esta interface descreve o que a app usa mesmo.
 *
 * Diferença principal face ao handoff: não existe prop `tone`. A cor de
 * significado entra por `variant` (para os tons fixos) ou por `moduleColor`
 * com `variant="module"` (para a cor do módulo/prova, que é dinâmica).
 */
export interface ButtonProps {
  /**
   * primary   = --accent cheio, tinta --accent-on; um por ecrã
   * secondary = vidro neutro
   * outline   = só borda
   * ghost     = só texto
   * danger / danger-ghost / danger-outline = as três forças do vermelho
   * light / light-danger = superfície clara (listas, cartões de detalhe)
   * module    = fundo em `moduleColor`, tinta resolvida por resolveModuleInk
   * icon      = redondo, 44x44, sem texto (usar com size="icon")
   */
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'danger-ghost'
    | 'danger-outline' | 'light' | 'light-danger' | 'module' | 'icon';
  /** sm/md/lg respeitam o piso de 44px (tap-44); icon = 44x44 fixo */
  size?: 'sm' | 'md' | 'lg' | 'icon';
  /** só para variant="module": `var(--mod-*)`, gradiente ou color-mix */
  moduleColor?: string;
  /** troca o ícone por um spinner e desativa o botão */
  isLoading?: boolean;
  disabled?: boolean;
  /** nó lucide; renderiza antes do texto, ou sozinho em variant="icon" */
  icon?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  /** o resto vai para o <button> (onClick, type, aria-*, data-testid, ...) */
  [key: string]: unknown;
}
export function Button(props: ButtonProps): JSX.Element;
export default Button;

/** Junta classes ignorando falsy — o `cn` que todos os componentes usam. */
export function cn(...inputs: unknown[]): string;

/**
 * A tinta legível para um `moduleColor`. Aceita `var(--x)`, gradientes e
 * `color-mix(...)`; o que não reconhece cai em --coach-ink (omissão segura,
 * porque todas as cores de significado da app são claras).
 */
export function resolveModuleInk(moduleColor?: string): string;
