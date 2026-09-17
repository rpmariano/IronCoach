/**
 * IMPLEMENTADO — fonte de verdade: `src/components/shared/Sheet.jsx`.
 *
 * Diferenças face ao handoff:
 * - Não há prop `open`. Quem monta controla a existência
 *   (`{open && <Sheet …/>}`); o componente trata da entrada e, ao fechar,
 *   da saída ANTES de chamar `onClose` — por isso fecha-se sempre por
 *   `onClose`, nunca desmontando à bruta.
 * - `maxHeight` é CSS (string), não um número de px.
 * - O ficheiro exporta ainda `Dialog` e `useEscapeClose`, que o handoff não
 *   documentava.
 *
 * Os dois montam-se em `document.body` por portal: `position: fixed` deixa
 * de ser relativo ao viewport quando um antepassado tem `backdrop-filter`
 * ou `transform` (apanhado 2026-09-13 nas memórias da prova).
 */
export interface SheetProps {
  title?: React.ReactNode;
  /** etiqueta 11px uppercase por cima do título */
  eyebrow?: React.ReactNode;
  /** a cor do eyebrow — 'gym' por omissão */
  eyebrowTone?: 'race' | 'coach' | 'run' | 'gym' | 'nutrition' | 'body';
  /** chamado DEPOIS da animação de saída (240ms) */
  onClose?: () => void;
  children: React.ReactNode;
  /** qualquer valor CSS de altura; '80dvh' por omissão */
  maxHeight?: string;
  /** data-testid no painel */
  testId?: string;
}
/**
 * Persiana que sobe do fundo em 340ms (cubic-bezier(.16,1,.3,1)) e fecha em
 * 240ms, com scrim a 62% + blur 3 em sincronia. Pega de 44px, cabeçalho,
 * corpo com scroll, arrastável para baixo para fechar (só quando o corpo
 * está no topo).
 */
export function Sheet(props: SheetProps): JSX.Element;

export interface DialogProps {
  title?: React.ReactNode;
  /** 'coach' (borda ciano) por omissão; qualquer outro valor usa a borda neutra */
  tone?: 'coach' | string;
  onClose?: () => void;
  children: React.ReactNode;
  /** botões, em linha no fundo */
  actions?: React.ReactNode;
  /** substitui o título por um cabeçalho à medida */
  header?: React.ReactNode;
  testId?: string;
}
/**
 * Popup centrado: scale .96→1 + opacidade, 220ms. Confirmações e insights;
 * nunca formulários.
 */
export function Dialog(props: DialogProps): JSX.Element;

/**
 * Fechar com Escape para quem NÃO é Sheet/Dialog mas pode ficar por cima ou
 * por baixo de um deles — os ecrãs inteiros (RaceMuralSheet,
 * RaceMemoriesSheet, MedalhaoContribSheet).
 *
 * Existe uma única pilha global partilhada por Sheet, Dialog e este hook:
 * só o último a abrir responde ao Escape. Achado 2026-09-15 — duas persianas
 * empilhadas tinham cada uma o seu `addEventListener` e a tecla fechava as
 * duas de uma vez; promover uma delas a ecrã inteiro com listener próprio,
 * fora da pilha, trouxe o bug de volta no mesmo dia. Nunca registar um
 * listener de Escape à mão: usar este hook.
 */
export function useEscapeClose(onClose?: () => void): void;
