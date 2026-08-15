import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, X, Sparkles } from 'lucide-react';

const RUN_TRAINING_TYPES_DOCS = [
  {
    group: 'Corrida solta (Base)',
    items: [
      { name: 'Contínuo', desc: 'A clássica corrida leve de base (Easy Run).' },
      { name: 'Longo', desc: 'Foco na adaptação e resistência para provas maiores.' },
      { name: 'Recuperação', desc: 'Curto e lento, para circulação sanguínea após treinos duros.' }
    ]
  },
  {
    group: 'Estruturado (Qualidade)',
    items: [
      { name: 'Ritmo (Tempo)', desc: 'Treino no limiar anaeróbico (T-Pace). Rápido mas sustentável.' },
      { name: 'Fartlek', desc: 'Variações de velocidade instintivas (brincar com o ritmo).' },
      { name: 'Intervalos', desc: 'Séries curtas e intensas (VO2 Max) com pausas para recuperar.' }
    ]
  },
  {
    group: 'Trilho',
    items: [
      { name: 'Subidas', desc: 'Repetições em subida para força pura e tolerância láctica.' },
      { name: 'Trail', desc: 'Corrida contínua na montanha/trilho (Endurance base).' },
      { name: 'Técnico', desc: 'Foco na agilidade, footwork e leitura do terreno acidentado.' }
    ]
  }
];

export default function RunTrainingTypeHelp({ label, children }) {
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
        if (e.cancelable) e.preventDefault(); // CANCELA PULL-TO-REFRESH DO BROWSER
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
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="text-[12px] text-slate-500 block">{label}</label>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-expanded={isOpen}
          aria-label="O que significa cada tipo de treino?"
          title="O que significa cada tipo de treino?"
          className="inline-flex items-center justify-center rounded-full active:scale-90 transition"
          style={{
            color: 'var(--mod-corrida-to)',
            background: 'color-mix(in srgb, var(--mod-corrida-to) 15%, transparent)',
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
          {/* Overlay escuro com Backdrop Blur */}
          <div 
            className={`fixed inset-0 bg-slate-900/40 transition-all duration-500 ease-in-out ${
              isClosing ? 'opacity-0 backdrop-blur-none' : 'opacity-100 backdrop-blur-sm'
            }`}
            onClick={handleDismiss}
            aria-hidden="true"
          />

          {/* Persiana Bottom Sheet */}
          <div 
            ref={dragAreaRef}
            className="relative z-10 w-full flex flex-col rounded-t-[28px] border-t border-slate-200 bg-white shadow-2xl overflow-hidden max-h-[85vh]"
            style={{
              transform: sheetTransform,
              transition: sheetTransition,
              overscrollBehavior: 'contain',
            }}
          >
            {/* Zona de Arrasto Superior (Pega) */}
            <div className="touch-none select-none shrink-0" style={{ touchAction: 'none' }}>
              <div 
                onClick={handleDismiss}
                className="w-full py-3 cursor-pointer flex flex-col items-center justify-center group tap-44"
                role="button"
                aria-label="Fechar persiana"
              >
                <div className="w-12 h-1.5 rounded-full bg-slate-300 group-hover:bg-slate-400 transition-colors mb-1" />
                <span className="text-[10px] text-slate-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">Toca para fechar</span>
              </div>

              {/* Cabeçalho */}
              <div className="flex items-center justify-between gap-2 px-6 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                    style={{ background: 'linear-gradient(135deg, var(--mod-corrida-from), var(--mod-corrida-to))' }}
                  >
                    <HelpCircle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-800">
                      Tipos de Treino
                    </h2>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                      Doutrina Fisiológica (Regra 80/20)
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDismiss}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors shrink-0"
                  aria-label="Fechar"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Conteúdo Scrollável */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-6 bg-slate-50/30">
              {RUN_TRAINING_TYPES_DOCS.map((group, idx) => (
                <div key={idx}>
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                    {group.group}
                  </p>
                  <div className="space-y-2">
                    {group.items.map((item, i) => (
                      <div key={i} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col gap-1">
                        <span className="text-[13px] font-semibold text-slate-800">{item.name}</span>
                        <span className="text-[11px] leading-snug text-slate-500">{item.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Rodapé safe-area spacing */}
            <div className="h-6 bg-slate-50/30 shrink-0" />
          </div>
        </div>
      )}
    </div>
  );
}
