import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const THEMES = {
  coach: {
    bg: 'linear-gradient(135deg, var(--mod-coach-from, #155e75), var(--mod-coach-to, #06b6d4))',
    sub: 'text-cyan-100'
  },
  run: {
    bg: 'linear-gradient(135deg, #7e22ce, #c026d3)',
    sub: 'text-purple-100'
  },
  gym: {
    bg: 'linear-gradient(135deg, #a16207, #eab308)',
    sub: 'text-yellow-100'
  },
  nutri: {
    bg: 'linear-gradient(135deg, #047857, #10b981)',
    sub: 'text-green-100'
  },
  body: {
    bg: 'linear-gradient(135deg, #be123c, #f43f5e)',
    sub: 'text-rose-100'
  },
  danger: {
    bg: 'linear-gradient(135deg, #991b1b, #ef4444)',
    sub: 'text-red-100'
  },
  warning: {
    bg: 'linear-gradient(135deg, #c2410c, #f97316)',
    sub: 'text-orange-100'
  },
  info: {
    bg: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
    sub: 'text-blue-100'
  },
  neutral: {
    bg: 'linear-gradient(135deg, #334155, #64748b)',
    sub: 'text-slate-200'
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
        className={`fixed inset-0 bg-slate-900/40 transition-all duration-400 ease-in-out ${overlayAnimation}`}
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
        className={`relative z-10 w-full ${maxWidth} bg-white flex flex-col shadow-2xl overflow-hidden ${
          isDialog ? 'rounded-2xl max-h-[90vh]' : 'rounded-t-[28px] max-h-[90vh] pb-safe'
        }`}
        style={transformStyle}
      >
        {/* Grab Handle for Bottom Sheet */}
        {!isDialog && enableDrag && (
          <div 
            title="Toca para fechar persiana" 
            onClick={handleDismiss}
            className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1.5 rounded-full bg-white/40 z-20 cursor-pointer" 
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
                <Icon className="w-5 h-5 text-white" strokeWidth={2.5} />
              </div>
            )}
            <div className="flex-1 min-w-0 pr-4">
              {title && <h3 id="modal-title" className={`text-base font-bold leading-tight truncate ${activeTheme.sub.replace('100', '50')}`}>{title}</h3>}
              {subtitle && <p className={`text-[12.5px] mt-0.5 leading-snug font-medium ${activeTheme.sub}`}>{subtitle}</p>}
            </div>
          </div>
          <button 
            onClick={handleDismiss}
            className="w-8 h-8 shrink-0 rounded-full bg-black/15 flex items-center justify-center text-white active:scale-95 transition-transform hover:bg-black/25"
            aria-label="Fechar"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* Content */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-contain bg-slate-50"
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
