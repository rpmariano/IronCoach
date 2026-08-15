import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, X, Sparkles } from 'lucide-react';
import { EXPERIENCE_LEVELS, EXPERIENCE_TIEBREAK_HINT } from '../../utils/experience';

/* Ajuda para escolher o nível de corredor, partilhada pelos dois sítios onde
   o atleta o declara — Perfil (nível geral) e Agenda de Provas (nível para
   aquela prova). Ver src/utils/experience.js para os critérios e a fonte.

   O componente embrulha o campo inteiro (etiqueta + select + descrição) em vez
   de se colar por baixo dele. A razão é de descoberta: o ícone tem de estar
   encostado à etiqueta, senão ninguém repara que a ajuda existe.

   Abre um Bottom Sheet. A escolha é comparativa ("onde é que eu encaixo?"),
   mostrando todos os níveis de uma vez.

   `variant` ajusta a cor da label (o Perfil é escuro, a Agenda é clara).
   O Bottom Sheet propriamente dito será sempre claro para manter a consistência UI. */
export default function ExperienceLevelHelp({ label, variant = 'light', children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const touchStartY = useRef(0);
  const dragYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const isClosingRef = useRef(false);

  const scrollRef = useRef(null);
  const dragAreaRef = useRef(null);

  const dark = variant === 'dark';
  const labelClass = dark
    ? 'text-[11px] text-slate-500' // O perfil dark usa texto slate-500 na label
    : 'text-[10px] text-slate-500';

  useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
      isClosingRef.current = false;
      setDragY(0);
      dragYRef.current = 0;
    }
  }, [isOpen]);

  const handleDismiss = () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
    }, 500);
  };

  useEffect(() => {
    const el = dragAreaRef.current;
    if (!el || !isOpen) return;

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
        if (e.cancelable) e.preventDefault();
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
  }, [isOpen]);

  const sheetTransform = isClosing
    ? 'translateY(100%)'
    : dragY > 0
    ? `translateY(${dragY}px)`
    : 'translateY(0%)';

  const sheetTransition = isDragging
    ? 'none'
    : 'transform 0.5s ease-in-out';

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className={labelClass}>{label}</label>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-expanded={isOpen}
          aria-label="O que significa cada nível?"
          title="O que significa cada nível?"
          className="inline-flex items-center justify-center rounded-full active:scale-90 transition"
          style={{
            color: 'var(--mod-coach-to)',
            background: 'color-mix(in srgb, var(--mod-coach-to) 15%, transparent)',
            width: 18,
            height: 18,
          }}
        >
          <HelpCircle size={12} />
        </button>
      </div>

      {children}

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          {/* Overlay */}
          <div 
            className={`fixed inset-0 bg-slate-900/40 transition-all duration-500 ease-in-out ${
              isClosing ? 'opacity-0 backdrop-blur-none' : 'opacity-100 backdrop-blur-sm'
            }`}
            onClick={handleDismiss}
            aria-hidden="true"
          />

          {/* Bottom Sheet */}
          <div 
            ref={dragAreaRef}
            className="relative z-10 w-full flex flex-col rounded-t-[28px] border-t border-slate-200 bg-white shadow-2xl overflow-hidden max-h-[85vh]"
            style={{
              transform: sheetTransform,
              transition: sheetTransition,
              overscrollBehavior: 'contain',
            }}
          >
            {/* Pega / Header */}
            <div className="touch-none select-none shrink-0" style={{ touchAction: 'none' }}>
              <div 
                onClick={handleDismiss}
                className="w-full py-3 cursor-pointer flex flex-col items-center justify-center group tap-44"
                role="button"
                aria-label="Fechar"
              >
                <div className="w-12 h-1.5 rounded-full bg-slate-300 group-hover:bg-slate-400 transition-colors mb-1" />
                <span className="text-[10px] text-slate-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">Toca para fechar</span>
              </div>

              <div className="flex items-center justify-between gap-2 px-6 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                    style={{ background: 'linear-gradient(135deg, var(--mod-coach-from), var(--mod-coach-to))' }}
                  >
                    <HelpCircle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-800">
                      Nível de Corredor
                    </h2>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                      Onde é que eu encaixo?
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDismiss}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors shrink-0"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Conteúdo */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-slate-50/30">
              
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-2">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed text-amber-800">
                  {EXPERIENCE_TIEBREAK_HINT}
                </p>
              </div>

              <div className="space-y-4">
                {EXPERIENCE_LEVELS.map(level => (
                  <div key={level.key} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                    <p className="text-[12px] font-bold text-slate-700 mb-1.5">{level.label}</p>
                    <ul className="space-y-1">
                      {level.criteria.map((c, i) => (
                        <li key={i} className="text-[11px] leading-snug flex gap-1.5 text-slate-600">
                          <span aria-hidden="true" className="font-bold text-slate-400">·</span>
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <p className="text-[10px] leading-relaxed text-slate-400 text-center pb-2">
                Valores de referência para provas de 10 km a meia maratona. Com objetivo de maratona, o volume semanal sobe. O Coach ajusta.
              </p>
            </div>
            
            <div className="h-4 bg-slate-50/30 shrink-0" />
          </div>
        </div>
      )}
    </div>
  );
}
