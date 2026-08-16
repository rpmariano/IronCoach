import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, ImagePlus, PencilLine, ArrowRight, HeartPulse, Zap, Navigation, Droplet, Footprints, Activity, Split, X } from 'lucide-react';
import Button from '../shared/Button';
import PremiumModal from '../shared/PremiumModal';

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
  hr_zones: { label: 'Zonas de Frequência Cardíaca', icon: <HeartPulse className="w-4 h-4 text-rose-500" /> },
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
  return (
    <PremiumModal
      isOpen={isOpen}
      onClose={onClose}
      title="Métricas em falta"
      subtitle="Como gostarias de proceder?"
      icon={Sparkles}
      theme="run"
      variant="bottom-sheet"
    >
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5 no-scrollbar bg-slate-50/30">
          {/* Lista de Métricas em Falta */}
          {missingKeys.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
              <span className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                Métricas sugeridas ({missingKeys.length}):
              </span>
              <div className="space-y-1.5">
                {missingKeys.map((key) => {
                  const cfg = METRIC_CONFIGS[key] || { label: key, icon: <Sparkles className="w-4 h-4 text-slate-500" /> };
                  return (
                    <div key={key} className="flex items-center gap-2.5 bg-slate-50/80 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-700 border border-slate-100">
                      {cfg.icon}
                      <span>{cfg.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Rodapé Fixo */}
        <div className="p-4 border-t border-slate-200 bg-white shrink-0 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Button
              variant="module"
              moduleColor="var(--mod-corrida-to)"
              onClick={() => {
                onAddPhotos();
                onClose();
              }}
              className="flex-1 text-sm py-3.5"
              icon={<ImagePlus size={18} />}
            >
              Mais prints
            </Button>

            <Button
              variant="light"
              onClick={() => {
                onGoManual();
                onClose();
              }}
              className="text-sm py-3.5 shrink-0 px-5"
              icon={<PencilLine size={16} />}
            >
              Manual
            </Button>
          </div>

          <button
            type="button"
            onClick={() => {
              onProceedAnyway();
              onClose();
            }}
            className="w-full text-slate-500 font-semibold text-[11px] uppercase tracking-wider py-2 flex items-center justify-center gap-1.5 hover:text-slate-700 transition"
          >
            <span>Prosseguir sem estas métricas</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </PremiumModal>
  );
}
