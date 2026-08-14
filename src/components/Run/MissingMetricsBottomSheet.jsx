import React, { useRef } from 'react';
import { Sparkles, ImagePlus, PencilLine, ArrowRight, HeartPulse, Zap, Navigation, Droplet, Footprints, Activity, Split } from 'lucide-react';

export const METRIC_CONFIGS = {
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
  const touchStartY = useRef(null);

  if (!isOpen) return null;

  const handleTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    if (touchStartY.current !== null) {
      const deltaY = e.changedTouches[0].clientY - touchStartY.current;
      if (deltaY > 30) {
        // Deslizar para baixo ou toque no traço: fecha a persiana
        onClose();
      }
      touchStartY.current = null;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end" data-testid="missing-metrics-bottom-sheet">
      {/* Overlay Escuro */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Persiana Bottom Sheet */}
      <div 
        className="relative z-10 w-full flex flex-col rounded-t-[28px] border-t border-slate-200 bg-white shadow-2xl transition-all duration-300 ease-out max-h-[85vh] overflow-hidden"
      >
        {/* Traço de Touch (Grab Handle) — Tocar ou deslizar fecha o modal */}
        <div 
          onClick={onClose}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="w-full py-3 cursor-pointer flex flex-col items-center justify-center shrink-0 group tap-44"
          title="Toca para fechar persiana"
          role="button"
          aria-label="Fechar persiana"
        >
          <div className="w-12 h-1.5 rounded-full bg-slate-300 group-hover:bg-slate-400 transition-colors mb-1" />
          <span className="text-[10px] text-slate-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">Toca para fechar</span>
        </div>

        {/* Conteúdo */}
        <div className="px-5 pb-6 overflow-y-auto space-y-4">
          {/* Cabeçalho do Alerta */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 leading-snug">
                Métricas em falta no registo
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                O Coach detetou que faltam alguns dados importantes para uma análise completa. Como gostarias de proceder?
              </p>
            </div>
          </div>

          {/* Lista de Métricas em Falta */}
          {missingKeys.length > 0 && (
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 space-y-2">
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
          <div className="space-y-2 pt-1">
            {/* Opção 1: Upload de mais prints */}
            <button
              type="button"
              onClick={onAddPhotos}
              className="w-full bg-[var(--mod-corrida-to)] text-white font-bold text-xs rounded-xl py-3 px-4 flex items-center justify-center gap-2 shadow-sm hover:opacity-95 active:scale-[0.98] transition"
            >
              <ImagePlus className="w-4 h-4" />
              <span>Carregar mais prints da app</span>
            </button>

            {/* Opção 2: Completar no modo manual (dados preenchidos) */}
            <button
              type="button"
              onClick={onGoManual}
              className="w-full bg-slate-100 text-slate-800 font-bold text-xs rounded-xl py-3 px-4 border border-slate-200 flex items-center justify-center gap-2 hover:bg-slate-200/70 active:scale-[0.98] transition"
            >
              <PencilLine className="w-4 h-4 text-slate-600" />
              <span>Completar manualmente (manter dados)</span>
            </button>

            {/* Opção 3: Prosseguir assim mesmo */}
            <button
              type="button"
              onClick={onProceedAnyway}
              className="w-full text-slate-500 font-semibold text-[11px] py-2 flex items-center justify-center gap-1.5 hover:text-slate-700 transition"
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
