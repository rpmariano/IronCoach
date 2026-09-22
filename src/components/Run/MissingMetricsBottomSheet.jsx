import React from 'react';
import { Sparkles, ImagePlus, PencilLine, ArrowRight, HeartPulse, Zap, Navigation, Droplet, Footprints, Activity, Split } from 'lucide-react';
import Button from '../shared/Button';
import PremiumModal from '../shared/PremiumModal';
import { agruparCamposPorEcra, appDaFonte } from '../../../supabase/functions/_shared/sourceApps.ts';

export const METRIC_CONFIGS = {
  distance_km: { label: 'Distância da Corrida (km)', icon: <Navigation className="w-4 h-4 text-[var(--run)]" /> },
  duration_seconds: { label: 'Duração Total da Corrida', icon: <Zap className="w-4 h-4 text-[var(--run)]" /> },
  avg_heart_rate_bpm: { label: 'Frequência Cardíaca (Média / Máxima)', icon: <HeartPulse className="w-4 h-4 text-[var(--run)]" /> },
  cadence_spm: { label: 'Cadência de Corrida (spm)', icon: <Zap className="w-4 h-4 text-[var(--run)]" /> },
  elevation_gain_m: { label: 'Desnível Acumulado (m)', icon: <Navigation className="w-4 h-4 text-[var(--run)]" /> },
  sweat_loss_ml: { label: 'Perda por Transpiração (ml)', icon: <Droplet className="w-4 h-4 text-[var(--run)]" /> },
  biomechanics: { label: 'Métricas Biomecânicas (Contacto solo, Oscilação, Assimetria)', icon: <Activity className="w-4 h-4 text-[var(--run)]" /> },
  thresholds: { label: 'Limiares Fisiológicos (FC LA / LAn)', icon: <HeartPulse className="w-4 h-4 text-[var(--run)]" /> },
  splits: { label: 'Splits / Voltas por km', icon: <Split className="w-4 h-4 text-[var(--run)]" /> },
  hr_zones: { label: 'Zonas de Frequência Cardíaca', icon: <HeartPulse className="w-4 h-4 text-[var(--run)]" /> },
  total_steps: { label: 'Passos Totais', icon: <Footprints className="w-4 h-4 text-[var(--run)]" /> },
};

/* Uma linha por métrica em falta — o que o painel sempre mostrou. */
function LinhaMetrica({ chave }) {
  const cfg = METRIC_CONFIGS[chave] || { label: chave, icon: <Sparkles className="w-4 h-4 text-[var(--text-3)]" /> };
  return (
    <div className="flex items-center gap-2.5 bg-[var(--surface-soft)] rounded-xl px-3 py-2.5 text-xs font-medium text-[var(--text-2)] border border-[var(--border-faint)]">
      {cfg.icon}
      <span>{cfg.label}</span>
    </div>
  );
}

export default function MissingMetricsBottomSheet({
  isOpen,
  missingKeys = [],
  sourceApp = null,
  onAddPhotos,
  onGoManual,
  onProceedAnyway,
  onClose,
}) {
  /* `sourceApp` é a chave gravada em `runs.details.source_app` pela extração
     (ver supabase/functions/_shared/sourceApps.ts). Uma chave que o catálogo
     não conheça — ou nenhuma, nas corridas anteriores a isto existir —
     devolve um grupo só, sem ecrã, que é o texto de hoje. */
  const app = appDaFonte(sourceApp);
  const grupos = agruparCamposPorEcra(sourceApp, missingKeys);
  const temEcras = grupos.some((g) => g.ecra);

  return (
    <PremiumModal
      isOpen={isOpen}
      onClose={onClose}
      title="Métricas em falta"
      subtitle="Como gostarias de proceder?"
      icon={Sparkles}
      theme="run"
      variant="bottom-sheet"
      testId="missing-metrics-bottom-sheet"
    >
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5 no-scrollbar bg-[var(--surface-soft)]">
          {/* Lista de Métricas em Falta */}
          {missingKeys.length > 0 && (
            <div className="bg-[var(--surface-faint)] border border-[var(--border-glass)] rounded-2xl p-4 space-y-3 shadow-sm">
              <span className="text-[11px] font-bold text-[var(--text-3)] block uppercase tracking-wider">
                Métricas sugeridas ({missingKeys.length}):
              </span>
              {temEcras ? (
                /* Fonte reconhecida: as métricas agrupam-se pelo PRINT que as
                   traz. O atleta não tem de perceber que a oscilação vertical
                   e o tempo de contacto no solo vivem no mesmo sítio — vê dois
                   ecrãs com nome, em vez de seis campos soltos. */
                <div className="space-y-4">
                  {grupos.map((grupo, i) => (
                    <div key={grupo.ecra ? grupo.ecra.id : `sem-ecra-${i}`} className="space-y-1.5">
                      <p className="text-[11px] text-[var(--text-3)] leading-snug">
                        {grupo.ecra ? (
                          <>
                            O ecrã <span className="font-bold text-[var(--text-2)]">{grupo.ecra.nome}</span>
                            {app ? ` da ${app.nome}` : ''} traz{' '}
                            {grupo.chaves.length === 1 ? 'esta' : `estas ${grupo.chaves.length}`}:
                          </>
                        ) : (
                          <>Estas não vêm de nenhum ecrã que eu conheça:</>
                        )}
                      </p>
                      <div className="space-y-1.5">
                        {grupo.chaves.map((key) => <LinhaMetrica key={key} chave={key} />)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Fonte desconhecida (ou registo antigo, sem fonte gravada):
                   exatamente o painel de sempre — nunca se inventa o nome de
                   um ecrã de uma app que o catálogo não conhece. */
                <div className="space-y-1.5">
                  {missingKeys.map((key) => <LinhaMetrica key={key} chave={key} />)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé Fixo */}
        <div className="p-4 border-t border-[var(--border-glass)] bg-[var(--surface-faint)] shrink-0 flex flex-col gap-2">
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
            className="w-full min-h-[44px] text-[var(--text-3)] font-semibold text-[11px] uppercase tracking-wider py-2 flex items-center justify-center gap-1.5 hover:text-[var(--text-2)] transition"
          >
            <span>Prosseguir sem estas métricas</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </PremiumModal>
  );
}
