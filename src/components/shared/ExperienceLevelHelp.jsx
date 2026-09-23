import React, { useState } from 'react';
import { HelpCircle, Sparkles } from 'lucide-react';
import { EXPERIENCE_LEVELS, EXPERIENCE_TIEBREAK_HINT, experienceLevelLabel } from '../../utils/experience';
import { elevationRatioLabel } from '../../utils/run';
import { categorizeDistance, categorizeElevationRatio, MIN_PREP_WEEKS, MIN_VOLUME_KM } from '@formulas/vocabulary.ts';
import { TIME_ON_FEET_FLOORS_PCT, ELEVATION_FLOORS_PCT } from '@formulas/raceLevelTriage.ts';
import PremiumModal from './PremiumModal';
import { formatHoursMinutes } from '../Run/RaceLevelSuggestion';

const LEVEL_KEYS = ['iniciante', 'basico', 'medio', 'avancado'];

const DISTANCE_CATEGORY_LABELS = {
  '5k': '5 km', '10k': '10 km', meia: 'Meia Maratona', maratona: 'Maratona', ultra: 'Ultra',
};

// Trail sem números da prova: a banda dita por palavras. Os limites são os
// de TIME_ON_FEET_FLOORS_PCT / ELEVATION_FLOORS_PCT, arredondados à fração
// que se entende de cabeça.
const TIME_WORDS = {
  iniciante: 'um pouco menos do que a prova',
  basico: 'mais ou menos o tempo da prova',
  medio: 'um pouco mais do que a prova',
  avancado: 'quase uma vez e meia a prova, ou mais',
};
const CLIMB_WORDS = {
  iniciante: 'entre ⅓ e metade da subida da prova',
  basico: 'mais de metade da subida da prova',
  medio: 'quase toda a subida da prova',
  avancado: 'toda a subida da prova, ou mais',
};

const roundTo = (v, step) => Math.round(v / step) * step;

// Com números da prova: o intervalo do nível em horas / metros, a partir dos
// MESMOS pisos que classificam — nunca uma cópia que possa divergir.
function bandRange(floors, key, total, step, fmt) {
  const idx = LEVEL_KEYS.indexOf(key);
  const nextKey = LEVEL_KEYS[idx + 1];
  const lo = fmt(roundTo((total * floors[key]) / 100, step));
  if (!nextKey) return `${lo} ou mais`;
  return `${lo} a ${fmt(roundTo((total * floors[nextKey]) / 100, step))}`;
}

function timeCell(key, raceSeconds) {
  if (!raceSeconds) return TIME_WORDS[key];
  return bandRange(TIME_ON_FEET_FLOORS_PCT, key, raceSeconds, 300, formatHoursMinutes);
}

function climbCell(key, raceElevation) {
  if (!raceElevation) return CLIMB_WORDS[key];
  return bandRange(ELEVATION_FLOORS_PCT, key, raceElevation, 10, (m) => `${m} m`);
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
   que possa divergir. Em trail, em linguagem simples: horas e metros desta
   prova quando há `predictedSeconds`/D+, palavras quando não há. Precisa de `raceType` e `distanceKm`; `elevationGainM`
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
  // id do campo que este componente embrulha — a etiqueta é visual mas tem
  // de ser também programática (auditoria a11y): quem usa passa o mesmo id
  // ao <select> que mete como children.
  fieldId,
  children,
  context = 'geral',
  raceType,
  distanceKm,
  elevationGainM,
  // Tempo previsto para a prova (predictRaceSeconds) — em trail, a tabela
  // mostra horas em vez de "x% do previsto". Sem ele, palavras.
  predictedSeconds,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dark = variant === 'dark';
  const labelClass = dark
    ? 'text-[11px] text-[var(--text-3)]' // O perfil dark usa texto slate-500 na label
    : 'text-[11px] text-[var(--text-3)]';

  const isProva = context === 'prova';
  const isTrail = isProva && raceType === 'trail';
  const distCat = isProva ? categorizeDistance(distanceKm) : null;
  const elevCat = isTrail ? categorizeElevationRatio(distanceKm, elevationGainM) : null;
  const raceSeconds = isTrail && predictedSeconds > 0 ? predictedSeconds : null;
  const raceElevation = isTrail && elevationGainM > 0 ? Math.round(elevationGainM) : null;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className={labelClass} htmlFor={fieldId}>{label}</label>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-expanded={isOpen}
          aria-label="O que significa cada nível?"
          title="O que significa cada nível?"
          // tap-area-44: o botao continua a desenhar-se com 18px e ganha,
          // por cima, uma area de toque invisivel de 44 (ver globals.css).
          className="tap-area-44 inline-flex items-center justify-center rounded-full active:scale-90 transition"
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
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-[var(--surface-soft)]">

          {/* Era âmbar: a caixa da dica não é a prova nem um aviso — é a
              Carol a explicar, por isso fica no ciano dela (ponto 3). */}
          <div
            className="rounded-xl p-3 flex gap-2"
            style={{ background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)' }}
          >
            <Sparkles className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--coach)' }} />
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--coach-soft)' }}>
              {EXPERIENCE_TIEBREAK_HINT}
            </p>
          </div>

          {isProva ? (
            <div>
              {isTrail ? (
                <>
                  {/* Linguagem simples (pedido de 2026-09-23): nada de "Tempo
                      em Pé", "D+" nem percentagens. Sempre que há dados, os
                      limites mostram-se em horas e metros para ESTA prova. */}
                  <p className="text-[11px] leading-relaxed text-[var(--text-2)] mb-1.5">
                    Em trail, o nível mede-se por quanto a tua semana de treino já se parece com esta prova:
                  </p>
                  <ul className="text-[11px] leading-relaxed text-[var(--text-3)] space-y-1 mb-2">
                    <li>
                      <strong className="text-[var(--text-2)]">Tempo a correr</strong> — as horas que corres numa
                      semana, comparadas com o que deves demorar na prova
                      {raceSeconds ? <> (cerca de <strong>{formatHoursMinutes(raceSeconds)}</strong>)</> : null}.
                    </li>
                    <li>
                      <strong className="text-[var(--text-2)]">Subida</strong> — os metros que sobes numa semana,
                      comparados com tudo o que a prova sobe
                      {raceElevation ? <> (<strong>{raceElevation} m</strong>)</> : null}.
                    </li>
                  </ul>
                  {elevCat && (
                    <p className="text-[11px] text-[var(--text-3)] mb-2">
                      Terreno desta prova: <strong>{elevationRatioLabel(elevCat)}</strong>
                      {' '}— cerca de {Math.round(elevationGainM / distanceKm)} m a subir por cada km.
                    </p>
                  )}
                  <div className="overflow-x-auto -mx-1 px-1">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="text-[var(--text-3)] text-left">
                          <th className="pb-1.5 font-semibold">Nível</th>
                          <th className="pb-1.5 font-semibold">Corres por semana</th>
                          <th className="pb-1.5 font-semibold">Sobes por semana</th>
                        </tr>
                      </thead>
                      <tbody>
                        {LEVEL_KEYS.map((lvl) => (
                          <tr key={lvl} className="border-t border-[var(--border-faint)]">
                            <td className="py-1.5 font-semibold text-[var(--text-2)] whitespace-nowrap">{experienceLevelLabel(lvl)}</td>
                            <td className="py-1.5 text-[var(--text-3)]">{timeCell(lvl, raceSeconds)}</td>
                            <td className="py-1.5 text-[var(--text-3)]">{climbCell(lvl, raceElevation)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] leading-relaxed text-[var(--text-3)] mt-3">
                    Conta uma semana boa das tuas últimas quatro — não a melhor, para uma semana fora do normal
                    não enganar. Se o tempo te põe num nível e a subida noutro, fica o mais baixo: é o mais seguro.
                    Abaixo do Iniciante, esta prova ainda é cedo demais.
                  </p>
                </>
              ) : distCat ? (
                <>
                  <div className="overflow-x-auto -mx-1 px-1">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="text-[var(--text-3)] text-left">
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
                            <tr key={lvl} className="border-t border-[var(--border-faint)]">
                              <td className="py-1.5 font-semibold text-[var(--text-2)] whitespace-nowrap">{experienceLevelLabel(lvl)}</td>
                              <td className="py-1.5 text-[var(--text-3)]">{weeks == null ? 'Desaconselhado' : `${weeks} semanas`}</td>
                              <td className="py-1.5 text-[var(--text-3)]">{vol == null ? '—' : `${vol} km/semana`}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] leading-relaxed text-[var(--text-3)] mt-3">
                    Valores para {DISTANCE_CATEGORY_LABELS[distCat]}. Pré-requisitos cumulativos —
                    as duas colunas somam-se, não se substituem.
                  </p>
                </>
              ) : (
                <p className="text-[11px] leading-relaxed text-[var(--text-3)] mt-3">
                  Escolhe a distância da prova para veres os valores de referência.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {EXPERIENCE_LEVELS.map(level => (
                  <div key={level.key} className="bg-[var(--surface-faint)] border border-[var(--border-glass)] rounded-xl p-3 shadow-sm">
                    <p className="text-[12px] font-bold text-[var(--text-2)] mb-1.5">{level.label}</p>
                    <ul className="space-y-1">
                      {level.criteria.map((c, i) => (
                        <li key={i} className="text-[11px] leading-snug flex gap-1.5 text-[var(--text-3)]">
                          <span aria-hidden="true" className="font-bold text-[var(--text-3)]">·</span>
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <p className="text-[11px] leading-relaxed text-[var(--text-3)] text-center pb-2">
                Valores de referência para provas de 10 km a meia maratona. Com objetivo de maratona, o volume semanal sobe. O Coach ajusta.
              </p>
            </>
          )}
        </div>
      </PremiumModal>
    </div>
  );
}
