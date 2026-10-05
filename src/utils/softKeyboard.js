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
   ainda focado.

   --keyboard-inset (bug #56, 2026-10-05): no Safari iOS o teclado sobrepõe-se
   ao layout viewport em vez de o encolher (o interactive-widget=resizes-content
   da meta viewport só o Chrome Android respeita), e a caixa do chat ficava por
   baixo dele. Com o teclado aberto, o espaço tapado é
   innerHeight - visualViewport.height - visualViewport.offsetTop, e expõe-se no
   :root para o compositor do chat subir essa altura. No Chrome Android o
   layout viewport já encolhe, por isso o valor dá ~0 e nada se duplica; sem
   teclado fica sempre 0px. */

export function computeKeyboardInset(win) {
  const vv = win.visualViewport;
  if (!vv) return 0;
  const covered = win.innerHeight - vv.height - (vv.offsetTop || 0);
  return Number.isFinite(covered) ? Math.max(0, Math.round(covered)) : 0;
}

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

  const updateInset = () => {
    const open = root.getAttribute('data-keyboard') === 'open';
    root.style.setProperty('--keyboard-inset', `${open ? computeKeyboardInset(win) : 0}px`);
  };

  const set = (open) => {
    if (open) root.setAttribute('data-keyboard', 'open');
    else root.removeAttribute('data-keyboard');
    updateInset();
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
    // O iOS desloca o visualViewport (offsetTop) ao focar: o inset segue
    // também o scroll, não só o resize.
    updateInset();
    if (vv.height > baseline) baseline = vv.height;
    if (!focused()) set(false);
    else if (vv.height < baseline * KEYBOARD_RATIO) set(true);
    else if (vv.height >= baseline * 0.95) set(false);
  };
  // Rodar o ecrã muda a altura "de sempre".
  const onOrientation = () => { baseline = vv ? vv.height : 0; };

  updateInset();
  doc.addEventListener('focusin', onFocusIn);
  doc.addEventListener('focusout', onFocusOut);
  vv?.addEventListener('resize', onResize);
  vv?.addEventListener('scroll', updateInset);
  win.addEventListener('orientationchange', onOrientation);

  return () => {
    doc.removeEventListener('focusin', onFocusIn);
    doc.removeEventListener('focusout', onFocusOut);
    vv?.removeEventListener('resize', onResize);
  vv?.removeEventListener('scroll', updateInset);
    win.removeEventListener('orientationchange', onOrientation);
    set(false);
    root.style.removeProperty('--keyboard-inset');
  };
}
