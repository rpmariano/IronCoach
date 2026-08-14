import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, ImagePlus, PencilLine, ArrowRight, HeartPulse, Zap, Navigation, Droplet, Footprints, Activity, Split } from 'lucide-react';

export const METRIC_CONFIGS = {
  distance_km: { label: 'Distância da Corrida (km)', icon: <Navigation className="w-4 h-4 text-emerald-500" /> },
  duration_seconds: { label: 'Duração Total da Corrida', icon: <Zap className="w-4 h-4 text-amber-500" /> },
  avg_heart_rate_bpm: { label: 'Frequência Cardíaca (Média / Máxima)', icon: <HeartPulse className="w-4 h-4 text-rose-500" /> },
  cadence_spm: { label: 'Cadência de Corrida (spm)', icon: <Zap className="w-4 h-4 text-amber-500" /> },
  elevation_gain_m: { label: 'Desnível Acumulado (m)', icon: <Navigation className="w-4 h-4 text-teal-500" /> },
  sweat_loss_ml: { label: 'Perda por Transpiração (ml)', icon: <Droplet className="w-4 h-4 text-sky-500" /> },
  biomechanics: { label: 'Métricas Biomecânicas (Contacto solo, Oscilação, Assimetria)', icon: <Activity className="w-4 h-4 text-indigo-500" /> },
  thresholds: { label: 'Limiares Fisiológicos (FC LA / LAn)', icon: <HeartPulse className="w-4 h-4 text-emerald-500" /> },
  splits: { label: 'Splits / Voltas por km', icon: <Split className="w-4 h-4 text-purple-500" /> },
  total_steps: { label: 'Passos Totais', icon: <Footprints className="w-4 h-4 text-emerald-600" /> },
};

export default function MissingMetricsBottomSheet({
  isOpen,
  missingKeys = [],
  onAddPhotos,
  onGoManual,
  onProceedAnyway,
  onClose,
}) {
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  
  const touchStartY = useRef(0);
  const dragYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const isClosingRef = useRef(false);
  
  const scrollRef = useRef(null);
  const dragAreaRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

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
      onCloseRef.current?.();
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

  if (!isOpen) return null;

  const sheetTransform = isClosing
    ? 'translateY(100%)'
    : dragY > 0
    ? `translateY(${dragY}px)`
    : 'translateY(0%)';

  const sheetTransition = isDragging
    ? 'none'
    : 'transform 0.5s ease-in-out';

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end" data-testid="missing-metrics-bottom-sheet">
      {/* Overlay escuro com Backdrop Blur */}
      <div 
        className={`fixed inset-0 bg-white/[0.01] transition-all duration-500 ease-in-out ${
          isClosing ? 'opacity-0 backdrop-blur-none' : 'opacity-100 backdrop-blur-sm animate-bottom-sheet-overlay'
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
          {/* Traço de Touch (Grab Handle) */}
          <div 
            onClick={handleDismiss}
            className="w-full py-3 cursor-pointer flex flex-col items-center justify-center group tap-44"
            title="Toca para fechar persiana"
            role="button"
            aria-label="Fechar persiana"
          >
            <div className="w-12 h-1.5 rounded-full bg-slate-300 group-hover:bg-slate-400 transition-colors mb-1" />
            <span className="text-[10px] text-slate-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">Toca para fechar</span>
          </div>

          {/* Cabeçalho do Alerta, agora na zona fixa tal como no chat */}
          <div className="flex items-center justify-between gap-2 px-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-800">
                  Métricas em falta
                </h2>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                  Como gostarias de proceder?
                </p>
              </div>
            </div>

            {/* Botão Cancelar */}
            <button
              type="button"
              onClick={handleDismiss}
              className="text-[11px] font-medium text-slate-500 hover:text-slate-800 active:scale-95 transition-all shrink-0"
              title="Cancelar"
              aria-label="Cancelar"
            >
              Cancelar
            </button>
          </div>
        </div>

        {/* Conteúdo Scrollável */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-5 no-scrollbar bg-slate-50/30">
          {/* Lista de Métricas em Falta */}
          {missingKeys.length > 0 && (
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 space-y-2 shadow-sm">
              <span className="text-[11px] font-bold text-amber-900 block uppercase tracking-wider">
                Métricas sugeridas ({missingKeys.length}):
              </span>
              <div className="space-y-1.5">
                {missingKeys.map((key) => {
                  const cfg = METRIC_CONFIGS[key] || { label: key, icon: <Sparkles className="w-4 h-4 text-amber-500" /> };
                  return (
                    <div key={key} className="flex items-center gap-2.5 bg-white/80 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 border border-amber-100/60 shadow-2xs">
                      {cfg.icon}
                      <span>{cfg.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="space-y-2 pb-2">
            <button
              type="button"
              onClick={() => {
                onAddPhotos();
                handleDismiss();
              }}
              className="w-full bg-[var(--mod-corrida-to)] text-white font-bold text-sm rounded-2xl py-3.5 px-4 flex items-center justify-center gap-2 shadow-md hover:shadow-lg hover:opacity-95 active:scale-[0.98] transition"
            >
              <ImagePlus className="w-4 h-4" />
              <span>Carregar mais prints da app</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onGoManual();
                handleDismiss();
              }}
              className="w-full bg-white text-slate-800 font-bold text-sm rounded-2xl py-3.5 px-4 border border-slate-200 flex items-center justify-center gap-2 hover:bg-slate-50 active:scale-[0.98] transition shadow-sm"
            >
              <PencilLine className="w-4 h-4 text-slate-600" />
              <span>Completar manualmente</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onProceedAnyway();
                handleDismiss();
              }}
              className="w-full text-slate-500 font-semibold text-xs py-3 flex items-center justify-center gap-1.5 hover:text-slate-700 transition"
            >
              <span>Prosseguir sem estas métricas</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
