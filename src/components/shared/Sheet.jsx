import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { prefersReducedMotion } from '../../utils/coachBubbles';

/* Persiana e popup do redesenho 2026-09 (design-system/components/feedback/
   Sheet). Os dois montam-se na mesma coluna max-w-md do header e da nav,
   por cima de tudo (a nav é z-40).
   - Sheet: sobe do fundo em 340 ms (cubic-bezier(.16,1,.3,1)), fecha em
     240 ms; scrim a 62% + blur 3 em sincronia. Pega de 44px, cabeçalho,
     corpo com scroll. Arrastável para baixo para fechar.
   - Dialog: scale .96→1 + opacidade, 220 ms. Confirmações e insights; nunca
     formulários.
   Quem monta controla a existência (`{open && <Sheet …/>}`); o componente
   trata da entrada e, ao fechar, da saída antes de chamar onClose — por
   isso fecha-se sempre por `onClose`, nunca desmontando à bruta. */

const OPEN_MS = 340;
const CLOSE_MS = 240;
const DIALOG_MS = 220;

function useEnterExit(onClose, closeMs) {
  const [visible, setVisible] = useState(false);
  const closingRef = useRef(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setVisible(false);
    const ms = prefersReducedMotion() ? 120 : closeMs;
    setTimeout(() => onClose?.(), ms);
  }, [onClose, closeMs]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') requestClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);
  return { visible, requestClose };
}

export function Sheet({ title, eyebrow, eyebrowTone = 'gym', onClose, children, maxHeight = '80dvh', testId }) {
  const { visible, requestClose } = useEnterExit(onClose, CLOSE_MS);
  const panelRef = useRef(null);
  const bodyRef = useRef(null);
  const [dragY, setDragY] = useState(0);
  const dragRef = useRef({ startY: 0, y: 0, active: false });

  // Arrastar para fechar — só quando o corpo está no topo, para não
  // competir com o scroll interno; cancela o pull-to-refresh do browser.
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const start = (e) => { dragRef.current = { startY: e.touches[0].clientY, y: 0, active: true }; };
    const move = (e) => {
      if (!dragRef.current.active) return;
      const dy = e.touches[0].clientY - dragRef.current.startY;
      const atTop = !bodyRef.current || bodyRef.current.scrollTop <= 0;
      if (dy > 0 && atTop) {
        if (e.cancelable) e.preventDefault();
        dragRef.current.y = dy;
        setDragY(dy);
      }
    };
    const end = () => {
      const y = dragRef.current.y;
      dragRef.current = { startY: 0, y: 0, active: false };
      if (y > 60) requestClose(); else setDragY(0);
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('touchcancel', end, { passive: true });
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [requestClose]);

  const dragging = dragY > 0;
  return (
    <>
      <div
        onClick={requestClose}
        aria-hidden="true"
        className="fixed inset-0 z-[60]"
        style={{ background: 'var(--bg-scrim)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', opacity: visible ? 1 : 0, transition: `opacity var(--dur-sheet-open)` }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || eyebrow}
        data-testid={testId}
        className="fixed left-1/2 bottom-0 z-[70] w-full max-w-md flex flex-col"
        style={{
          background: 'var(--bg-sheet)',
          borderTop: '1px solid var(--border-glass-strong)',
          borderRadius: 'var(--radius-sheet) var(--radius-sheet) 0 0',
          boxShadow: 'var(--shadow-sheet)',
          padding: '12px 18px calc(26px + env(safe-area-inset-bottom, 0px))',
          maxHeight,
          transform: `translate(-50%, ${visible ? dragY : '100%'}${visible ? 'px' : ''})`,
          transition: dragging ? 'none' : `transform ${visible ? 'var(--dur-sheet-open)' : 'var(--dur-sheet-close)'} var(--ease-out)`,
        }}
      >
        <div className="flex justify-center pb-3"><span aria-hidden="true" style={{ width: 44, height: 4, borderRadius: 99, background: 'rgba(255,255,255,.25)' }} /></div>
        <div className="flex items-start justify-between gap-2.5 pb-3" style={{ borderBottom: '1px solid var(--border-glass)' }}>
          <div className="min-w-0">
            {eyebrow && <div className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)', color: `var(--${eyebrowTone})` }}>{eyebrow}</div>}
            {title && <div style={{ marginTop: eyebrow ? 5 : 0 }}>{title}</div>}
          </div>
          <button type="button" onClick={requestClose} aria-label="Fechar" className="shrink-0 flex items-center justify-center rounded-full" style={{ width: 44, height: 44, marginTop: -8, border: '1px solid var(--border-glass-strong)', background: 'rgba(255,255,255,.06)', color: 'var(--text-3)' }}>
            <X size={16} />
          </button>
        </div>
        <div ref={bodyRef} className="overflow-y-auto no-scrollbar mt-1 min-h-0">{children}</div>
      </div>
    </>
  );
}

export function Dialog({ title, tone = 'coach', onClose, children, actions, header, testId }) {
  const { visible, requestClose } = useEnterExit(onClose, DIALOG_MS);
  return (
    <>
      <div
        onClick={requestClose}
        aria-hidden="true"
        className="fixed inset-0 z-[60]"
        style={{ background: 'rgba(4,8,15,.68)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', opacity: visible ? 1 : 0, transition: 'opacity 200ms' }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        data-testid={testId}
        className="fixed z-[70] left-1/2 top-1/2 w-[calc(100%-32px)] max-w-[calc(28rem-32px)] flex flex-col gap-3.5"
        style={{
          background: 'var(--bg-sheet)',
          border: `1px solid ${tone === 'coach' ? 'rgba(34,211,238,.28)' : 'var(--border-glass-strong)'}`,
          borderRadius: 26,
          boxShadow: 'var(--shadow-dialog)',
          padding: 20,
          maxHeight: '86dvh',
          transform: `translate(-50%, -50%) scale(${visible ? 1 : 0.96})`,
          opacity: visible ? 1 : 0,
          transition: 'transform 220ms var(--ease-out), opacity 220ms var(--ease-out)',
        }}
      >
        {(header || title) && (
          <div className="flex items-center justify-between gap-2.5">
            <div className="min-w-0 flex-1">{header || <div className="text-[16px] font-black" style={{ color: 'var(--text-1)', letterSpacing: '-.01em' }}>{title}</div>}</div>
            <button type="button" onClick={requestClose} aria-label="Fechar" className="shrink-0 flex items-center justify-center rounded-full" style={{ width: 44, height: 44, border: '1px solid var(--border-glass-strong)', background: 'rgba(255,255,255,.06)', color: 'var(--text-3)' }}>
              <X size={15} />
            </button>
          </div>
        )}
        <div className="overflow-y-auto no-scrollbar min-h-0 flex flex-col gap-3.5">{children}</div>
        {actions && <div className="flex gap-2 mt-1">{actions}</div>}
      </div>
    </>
  );
}
