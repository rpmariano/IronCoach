/* Teclado do telemóvel aberto → <html data-keyboard="open"> (relato
   2026-09-23, com imagem: a escrever à Carol, a barra de baixo, o "+" e o
   botão dos bugs ficavam por cima da caixa de texto e o texto deixava de se
   ver). Com o atributo, o CSS (globals.css) esconde o que flutua no fundo e
   encolhe o respiro do scroll — a caixa encosta ao teclado.

   Só em ecrãs de toque (pointer: coarse): num computador focar um campo não
   abre teclado nenhum, e a barra não pode desaparecer por isso.

   Aberto = um campo de texto com foco. Mas no Android o "voltar" fecha o
   teclado SEM tirar o foco ao campo — por isso, quando o browser dá a
   visualViewport, é ela que manda depois do foco: se a área visível voltar
   à altura de sempre, o teclado fechou (e a barra volta), mesmo com o campo
   ainda focado. */

const NON_TEXT_INPUTS = new Set([
  'button', 'checkbox', 'color', 'date', 'datetime-local', 'file', 'hidden',
  'image', 'month', 'radio', 'range', 'reset', 'submit', 'time', 'week',
]);

export function isTextField(el) {
  if (!el || el.disabled || el.readOnly) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return false;
  return !NON_TEXT_INPUTS.has(String(el.type || 'text').toLowerCase());
}

// A área visível abaixo disto (em fração da maior altura vista) é teclado.
const KEYBOARD_RATIO = 0.8;

export function installSoftKeyboardWatcher(win = window) {
  const doc = win.document;
  const root = doc.documentElement;
  const coarse = win.matchMedia?.('(pointer: coarse)')?.matches;
  if (!coarse) return () => {};

  const vv = win.visualViewport || null;
  let baseline = vv ? vv.height : 0;

  const set = (open) => {
    if (open) root.setAttribute('data-keyboard', 'open');
    else root.removeAttribute('data-keyboard');
  };

  const focused = () => isTextField(doc.activeElement);

  const onFocusIn = (e) => { if (isTextField(e.target)) set(true); };
  // O foco pode saltar de um campo para outro: decide-se depois do salto.
  const onFocusOut = () => { win.setTimeout(() => set(focused()), 0); };

  // Durante a animação do teclado a altura passa pelos valores do meio:
  // só se abre abaixo de 80% e só se fecha de volta acima de 95% — no meio
  // fica como está, para a barra não piscar.
  const onResize = () => {
    if (!vv) return;
    if (vv.height > baseline) baseline = vv.height;
    if (!focused()) set(false);
    else if (vv.height < baseline * KEYBOARD_RATIO) set(true);
    else if (vv.height >= baseline * 0.95) set(false);
  };
  // Rodar o ecrã muda a altura "de sempre".
  const onOrientation = () => { baseline = vv ? vv.height : 0; };

  doc.addEventListener('focusin', onFocusIn);
  doc.addEventListener('focusout', onFocusOut);
  vv?.addEventListener('resize', onResize);
  win.addEventListener('orientationchange', onOrientation);

  return () => {
    doc.removeEventListener('focusin', onFocusIn);
    doc.removeEventListener('focusout', onFocusOut);
    vv?.removeEventListener('resize', onResize);
    win.removeEventListener('orientationchange', onOrientation);
    set(false);
  };
}
