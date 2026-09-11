import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/* Ponto 3 do redesenho: cada tema passa à cor do seu significado. O 'gym'
   era âmbar (#a16207 → #eab308) — o âmbar é da prova; o 'warning' era
   laranja e passa ao coral; o 'run' era roxo e o 'nutri' verde (que é o
   --ok), ambos fora do esquema. O subtítulo lê-se sobre a cor cheia, por
   isso é a tinta escura do tom em vez de um branco esbatido. */
const THEMES = {
  coach: {
    bg: 'var(--grad-coach)',
    subColor: 'var(--coach-ink)'
  },
  race: {
    bg: 'var(--grad-race)',
    subColor: 'var(--race-ink)'
  },
  run: {
    bg: 'linear-gradient(135deg, var(--mod-corrida-from), var(--run))',
    subColor: 'var(--run-ink)'
  },
  gym: {
    bg: 'linear-gradient(135deg, var(--mod-ginasio-from), var(--gym))',
    subColor: 'var(--gym-ink)'
  },
  nutri: {
    bg: 'linear-gradient(135deg, var(--mod-nutricao-from), var(--nutrition))',
    subColor: 'var(--nutrition-ink)'
  },
  body: {
    bg: 'linear-gradient(135deg, var(--mod-corpo-from), var(--body))',
    subColor: 'var(--body-ink)'
  },
  danger: {
    bg: 'linear-gradient(135deg, color-mix(in srgb, var(--danger) 55%, var(--bg-app)), var(--danger))',
    subColor: 'var(--danger-ink)'
  },
  warning: {
    bg: 'linear-gradient(135deg, color-mix(in srgb, var(--warn) 55%, var(--bg-app)), var(--warn))',
    subColor: 'var(--warn-ink)'
  },
  info: {
    bg: 'var(--grad-coach)',
    subColor: 'var(--coach-ink)'
  },
  neutral: {
    bg: 'linear-gradient(135deg, var(--brand-deep-1), var(--brand-deep-2))',
    subColor: 'var(--text-2)'
  }
};

export default function PremiumModal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon: Icon,
  theme = 'neutral',
  variant = 'bottom-sheet', // 'bottom-sheet' or 'dialog'
  children,
  maxWidth = 'max-w-md',
  enableDrag = true,
  testId,
}) {
  const [isClosing, setIsClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [renderOpen, setRenderOpen] = useState(isOpen);

  const touchStartY = useRef(0);
  const dragYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const scrollRef = useRef(null);
  const dragAreaRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Handle open state transitions
  useEffect(() => {
    if (isOpen) {
      setRenderOpen(true);
      setIsClosing(false);
      setDragY(0);
      dragYRef.current = 0;
    } else if (renderOpen) {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setRenderOpen(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isOpen, renderOpen]);

  const handleDismiss = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onCloseRef.current?.();
    }, 400); // match animation duration
  };

  useEffect(() => {
    if (!renderOpen || variant !== 'bottom-sheet' || !enableDrag) return;

    const el = dragAreaRef.current;
    if (!el) return;

    const handleTouchStart = (e) => {
      touchStartY.current = e.touches[0].clientY;
      isDraggingRef.current = true;
      setIsDragging(true);
    };

    const handleTouchMove = (e) => {
      if (!isDraggingRef.current) return;
      const currentY = e.touches[0].clientY;
      const deltaY = currentY - touchStartY.current;
      const isAtTop = !scrollRef.current || scrollRef.current.scrollTop <= 0;

      if (deltaY > 0 && isAtTop) {
        if (e.cancelable) e.preventDefault(); // CANCELA PULL-TO-REFRESH
        dragYRef.current = deltaY;
        setDragY(deltaY);
      } else if (deltaY < 0 && dragYRef.current > 0) {
        if (e.cancelable) e.preventDefault();
        const nextVal = Math.max(0, deltaY);
        dragYRef.current = nextVal;
        setDragY(nextVal);
      }
    };

    const handleTouchEnd = () => {
      if (dragYRef.current > 60) {
        handleDismiss();
      } else {
        setDragY(0);
      }
      dragYRef.current = 0;
      isDraggingRef.current = false;
      setIsDragging(false);
    };

    const handleTouchCancel = () => {
      setDragY(0);
      dragYRef.current = 0;
      isDraggingRef.current = false;
      setIsDragging(false);
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [renderOpen, variant, enableDrag]);

  if (!renderOpen) return null;

  const activeTheme = THEMES[theme] || THEMES.neutral;
  const isDialog = variant === 'dialog';
  const overlayAnimation = isClosing ? 'opacity-0 backdrop-blur-none' : 'opacity-100 backdrop-blur-sm';
  
  let transformStyle = {};
  if (!isDialog) {
    transformStyle = {
      transform: isClosing ? 'translateY(100%)' : dragY > 0 ? `translateY(${dragY}px)` : 'translateY(0%)',
      transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
    };
  } else {
    transformStyle = {
      transform: isClosing ? 'scale(0.95) translateY(10px)' : 'scale(1) translateY(0)',
      opacity: isClosing ? 0 : 1,
      transition: 'all 0.3s cubic-bezier(0.32, 0.72, 0, 1)'
    };
  }

  // Portal para o body: sem isto, "fixed" ancora-se ao antepassado mais
  // próximo com transform/filter/backdrop-filter (em vez do ecrã) — e com
  // glassmorphism a espalhar backdrop-filter por toda a app, cada vez mais
  // sítios tinham essa propriedade. O sintoma era a persiana abrir presa a
  // meio da página, com a maior parte por baixo da dobra e sem forma de lhe
  // chegar por scroll.
  return createPortal(
    <div className={`fixed inset-0 z-[100] flex ${isDialog ? 'items-center justify-center p-4' : 'flex-col justify-end'}`}>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-[var(--bg-scrim)] transition-all duration-400 ease-in-out ${overlayAnimation}`}
        onClick={handleDismiss}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div 
        ref={dragAreaRef}
        data-testid={testId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
        className={`relative z-10 w-full ${maxWidth} bg-[var(--bg-sheet)] backdrop-blur-[20px] border border-[var(--border-glass)] flex flex-col shadow-[inset_0_2px_10px_rgba(255,255,255,0.05),0_30px_60px_rgba(0,0,0,0.4)] overflow-hidden ${
          isDialog ? 'rounded-2xl max-h-[90vh]' : 'rounded-t-[28px] max-h-[90vh] pb-safe'
        }`}
        style={transformStyle}
      >
        {/* Grab Handle for Bottom Sheet */}
        {!isDialog && enableDrag && (
          <div 
            title="Toca para fechar persiana" 
            onClick={handleDismiss}
            className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1.5 rounded-full bg-[var(--surface-dim)] z-20 cursor-pointer" 
          />
        )}

        {/* Header */}
        <div 
          className={`px-5 ${!isDialog && enableDrag ? 'pt-7' : 'pt-5'} pb-5 flex items-start justify-between relative shrink-0`}
          style={{ background: activeTheme.bg }}
        >
          <div className="flex items-center gap-3 pr-2">
            {Icon && (
              <div className="w-10 h-10 shrink-0 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30 shadow-sm">
                <Icon className="w-5 h-5" style={{ color: activeTheme.subColor }} strokeWidth={2.5} />
              </div>
            )}
            <div className="flex-1 min-w-0 pr-4">
              {title && <h3 id="modal-title" className="text-base font-bold leading-tight truncate" style={{ color: activeTheme.subColor }}>{title}</h3>}
              {subtitle && <p className="text-[12.5px] mt-0.5 leading-snug font-medium" style={{ color: activeTheme.subColor, opacity: .82 }}>{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={handleDismiss}
            // O circulo mantem os 32px de desenho; a area tocavel e de 44.
            className="tap-44 shrink-0 active:scale-95 transition-transform"
            aria-label="Fechar"
          >
            <span className="w-8 h-8 rounded-full bg-black/15 flex items-center justify-center text-white hover:bg-black/25">
              <X size={18} strokeWidth={2.5} />
            </span>
          </button>
        </div>

        {/* Content */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-contain bg-[var(--surface-soft)]"
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
