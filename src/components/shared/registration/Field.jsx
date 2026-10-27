import React, { forwardRef, useId } from 'react';

/* O campo e o bloco dos registos — o padrão da Nutrição (MealRegistration), extraído para os
   outros registos o usarem em vez de cada um repetir as classes:
   · Field: a etiqueta (11 px, por cima) + o controlo, ligados por id;
   · FieldInput / FieldTextarea: a caixa — superfície suave, contorno, cantos de 12 px, anel de foco;
     alvo de 44 px; o texto quebra (textarea) em vez de gerar scroll lateral; ao focar, o campo
     fica visível por cima do teclado do telemóvel (keepVisible);
   · FieldBlock: o bloco separado — cartão com contorno, para agrupar campos de um mesmo item. */

// 16 px em literal (não `text-base`: nos tokens da app text-base = 13.5 px): abaixo de 16 px o Safari do
// iOS faz zoom ao focar o campo.
export const FIELD_CLS = 'w-full min-h-[var(--tap)] bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2.5 text-[16px] text-[var(--text-1)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--focus-ring)] shadow-sm transition';
export const BLOCK_CLS = 'rounded-xl border border-[var(--border-glass)] bg-[var(--surface-glass)] p-3';

/** Põe o campo à vista quando ganha o foco: o teclado do telemóvel demora ~300 ms a abrir e tapa o
 *  que está por baixo. Rola para o centro quando abre, e outra vez se o ecrã visível encolher. */
export function keepVisible(el, { delay = 300 } = {}) {
  if (!el || typeof el.scrollIntoView !== 'function') return;
  const run = () => { if (el.isConnected) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  setTimeout(run, delay);
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (vv?.addEventListener) {
    const onResize = () => { if (document.activeElement === el) run(); };
    vv.addEventListener('resize', onResize, { once: true });
  }
}

const withKeepVisible = (onFocus) => (e) => {
  keepVisible(e.currentTarget);
  onFocus?.(e);
};

export const FieldInput = forwardRef(function FieldInput({ className = '', onFocus, ...props }, ref) {
  return <input ref={ref} onFocus={withKeepVisible(onFocus)} className={`${FIELD_CLS} ${className}`.trim()} {...props} />;
});

export const FieldTextarea = forwardRef(function FieldTextarea({ className = '', onFocus, rows = 2, ...props }, ref) {
  return <textarea ref={ref} rows={rows} onFocus={withKeepVisible(onFocus)} className={`${FIELD_CLS} resize-none leading-snug ${className}`.trim()} {...props} />;
});

/** Etiqueta + controlo. `children` é uma função (id) => controlo, para o par label/id ficar ligado. */
export function Field({ label, hint = null, className = '', children }) {
  const id = useId();
  return (
    <div className={`min-w-0 ${className}`.trim()}>
      <label htmlFor={id} className="text-[11px] text-[var(--text-3)] mb-1.5 block px-0.5">{label}</label>
      {children(id)}
      {hint && <p className="text-[11px] text-[var(--text-2)] mt-1.5 px-0.5 break-words">{hint}</p>}
    </div>
  );
}

export function FieldBlock({ className = '', children, ...rest }) {
  return <div className={`${BLOCK_CLS} ${className}`.trim()} {...rest}>{children}</div>;
}

export const FieldSelect = forwardRef(function FieldSelect({ className = '', ...props }, ref) {
  return <select ref={ref} className={`${FIELD_CLS} ${className}`.trim()} {...props} />;
});
