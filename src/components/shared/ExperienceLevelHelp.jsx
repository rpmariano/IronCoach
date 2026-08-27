import React, { useState } from 'react';
import { HelpCircle, Sparkles } from 'lucide-react';
import { EXPERIENCE_LEVELS, EXPERIENCE_TIEBREAK_HINT, experienceLevelLabel } from '../../utils/experience';
import { elevationRatioLabel } from '../../utils/run';
import { categorizeDistance, categorizeElevationRatio, MIN_PREP_WEEKS, MIN_VOLUME_KM } from '@formulas/vocabulary.ts';
import { TIME_ON_FEET_FLOORS_PCT, ELEVATION_FLOORS_PCT } from '@formulas/raceLevelTriage.ts';
import PremiumModal from './PremiumModal';

const LEVEL_KEYS = ['iniciante', 'basico', 'medio', 'avancado'];

const DISTANCE_CATEGORY_LABELS = {
  '5k': '5 km', '10k': '10 km', meia: 'Meia Maratona', maratona: 'Maratona', ultra: 'Ultra',
};

// "70-90%", "90-110%"... até ao último nível, que fica aberto ("≥140%") —
// mesma convenção de fronteira de categorizeElevationRatio: cada banda
// fechada no piso próprio, aberta no piso seguinte.
function pctRangeLabel(floors, key) {
  const idx = LEVEL_KEYS.indexOf(key);
  const nextKey = LEVEL_KEYS[idx + 1];
  return nextKey ? `${floors[key]}-${floors[nextKey]}%` : `≥${floors[key]}%`;
}

/* Ajuda para escolher o nível de corredor, partilhada pelos dois sítios onde
   o atleta o declara — Perfil (nível GERAL) e Agenda de Provas (nível PARA
   AQUELA prova). Os dois sítios perguntam coisas diferentes (ver
   src/coach-knowledge/08-nivel-por-prova-trail.md, Bloco 8): o geral é
   transversal (volume, anos de prática); o de prova depende da distância
   e, em trail, do desnível — por isso `context` muda a tabela mostrada,
   não só o texto.

   `context='geral'` (omissão): critérios transversais de EXPERIENCE_LEVELS,
   comportamento inalterado desde sempre — usado em Perfil.jsx.

   `context='prova'`: tabela por categoria, construída a partir das MESMAS
   tabelas que classificam (MIN_PREP_WEEKS/MIN_VOLUME_KM em estrada,
   TIME_ON_FEET_FLOORS_PCT/ELEVATION_FLOORS_PCT em trail) — nunca uma cópia
   que possa divergir. Precisa de `raceType` e `distanceKm`; `elevationGainM`
   só importa em trail. Ver RaceLevelSuggestion.jsx para a proposta MEDIDA
   a partir do histórico — este componente é só a tabela de referência.

   O componente embrulha o campo inteiro (etiqueta + select + descrição) em vez
   de se colar por baixo dele. A razão é de descoberta: o ícone tem de estar
   encostado à etiqueta, senão ninguém repara que a ajuda existe.

   Abre um Bottom Sheet. A escolha é comparativa ("onde é que eu encaixo?"),
   mostrando todos os níveis de uma vez.

   `variant` ajusta a cor da label (o Perfil é escuro, a Agenda é clara).
   O Bottom Sheet propriamente dito será sempre claro para manter a consistência UI. */
export default function ExperienceLevelHelp({
  label,
  variant = 'light',
  children,
  context = 'geral',
  raceType,
  distanceKm,
  elevationGainM,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dark = variant === 'dark';
  const labelClass = dark
    ? 'text-[11px] text-slate-500' // O perfil dark usa texto slate-500 na label
    : 'text-[10px] text-slate-500';

  const isProva = context === 'prova';
  const isTrail = isProva && raceType === 'trail';
  const distCat = isProva ? categorizeDistance(distanceKm) : null;
  const elevCat = isTrail ? categorizeElevationRatio(distanceKm, elevationGainM) : null;

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

      <PremiumModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Nível de Corredor"
        subtitle="Onde é que eu encaixo?"
        icon={HelpCircle}
        theme="info"
        variant="bottom-sheet"
      >
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-slate-50/30">

          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-2">
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-amber-800">
              {EXPERIENCE_TIEBREAK_HINT}
            </p>
          </div>

          {isProva ? (
            <div>
              {isTrail && elevCat && (
                <p className="text-[11px] text-slate-500 mb-2">
                  Esta prova cai na banda <strong>{elevationRatioLabel(elevCat)}</strong>
                  {' '}({Math.round(elevationGainM / distanceKm)} m de D+ por km).
                </p>
              )}

              {isTrail ? (
                <>
                  <div className="overflow-x-auto -mx-1 px-1">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="text-slate-400 text-left">
                          <th className="pb-1.5 font-semibold">Nível</th>
                          <th className="pb-1.5 font-semibold">Tempo em Pé/semana</th>
                          <th className="pb-1.5 font-semibold">D+/semana</th>
                        </tr>
                      </thead>
                      <tbody>
                        {LEVEL_KEYS.map((lvl) => (
                          <tr key={lvl} className="border-t border-slate-100">
                            <td className="py-1.5 font-semibold text-slate-700 whitespace-nowrap">{experienceLevelLabel(lvl)}</td>
                            <td className="py-1.5 text-slate-600">{pctRangeLabel(TIME_ON_FEET_FLOORS_PCT, lvl)} do previsto</td>
                            <td className="py-1.5 text-slate-600">{pctRangeLabel(ELEVATION_FLOORS_PCT, lvl)} do D+ da prova</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] leading-relaxed text-slate-400 mt-3">
                    Percentagens relativas a ESTA prova (tempo previsto e D+), não valores absolutos —
                    quanto mais perto de 100%, mais o teu treino recente se parece com o esforço da prova.
                    As duas colunas são independentes: o teu nível é o mais baixo das duas.
                  </p>
                </>
              ) : distCat ? (
                <>
                  <div className="overflow-x-auto -mx-1 px-1">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="text-slate-400 text-left">
                          <th className="pb-1.5 font-semibold">Nível</th>
                          <th className="pb-1.5 font-semibold">Prep. mínima</th>
                          <th className="pb-1.5 font-semibold">Volume semanal mín.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {LEVEL_KEYS.map((lvl) => {
                          const weeks = MIN_PREP_WEEKS[lvl]?.[distCat];
                          const vol = MIN_VOLUME_KM[lvl]?.[distCat];
                          return (
                            <tr key={lvl} className="border-t border-slate-100">
                              <td className="py-1.5 font-semibold text-slate-700 whitespace-nowrap">{experienceLevelLabel(lvl)}</td>
                              <td className="py-1.5 text-slate-600">{weeks == null ? 'Desaconselhado' : `${weeks} semanas`}</td>
                              <td className="py-1.5 text-slate-600">{vol == null ? '—' : `${vol} km/semana`}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] leading-relaxed text-slate-400 mt-3">
                    Valores para {DISTANCE_CATEGORY_LABELS[distCat]}. Pré-requisitos cumulativos —
                    as duas colunas somam-se, não se substituem.
                  </p>
                </>
              ) : (
                <p className="text-[10px] leading-relaxed text-slate-400 mt-3">
                  Escolhe a distância da prova para veres os valores de referência.
                </p>
              )}
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      </PremiumModal>
    </div>
  );
}
