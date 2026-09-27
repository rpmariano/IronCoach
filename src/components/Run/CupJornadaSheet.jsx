import React, { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useAppStore } from '../../store';
import Button from '../shared/Button';
import { Sheet } from '../shared/Sheet';
import { useToast } from '../shared/ToastProvider';
import { CupStatus } from './CupBits';
import CupRoundPlanControls from './CupRoundPlanControls';
import CupPromoteDialog from './CupPromoteDialog';
import { CupLink, resultadoOficialPartes, temClube } from './CupClassificacao';
import { dataLonga, horaLabel, kmLabel } from '../../utils/cupCalendar';
import { racePriorityOf } from '@formulas/mainRace.ts';

/* A folha de UMA jornada no ecrã do Troféu (specs/trofeu.md §4.3–§4.5, Fase
   3). 2026-09-27.

   Antes da jornada: a decisão (Vou / Não vou / Ainda não sei — só "Guardar"
   grava), o papel e o prazo (CupRoundPlanControls, só com "Vou" e a data
   confirmada), a prova no calendário e promovê-la a principal (com o custo
   dito antes, CupPromoteDialog). Depois: o resultado oficial ou o lugar que
   ele próprio registou, os links oficiais, e — se ainda não registou —
   "Registar" e "Não fui". O dorsal nunca aparece. */

const DECISOES = [
  { value: 'vou', label: 'Vou', icon: '✓', color: 'var(--ok)' },
  { value: 'nao_vou', label: 'Não vou', icon: '✕', color: 'var(--danger)' },
  { value: 'nao_sei', label: 'Ainda não sei', icon: '⋯', color: 'var(--text-3)' },
];

const BOTAO = { minHeight: 44 };

const capitalizar = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/** "Domingo, 24 de janeiro · 7,4 km às 9h30 · Cascais" (+ "(provável)",
 *  "Adiada", "Cancelada", "Data por anunciar"). */
export function linhaDeDados(round, today) {
  const day = typeof round?.date === 'string' ? round.date.slice(0, 10) : null;
  let quando;
  if (round?.date_status === 'cancelada') quando = 'Cancelada';
  else if (round?.date_status === 'adiada') quando = 'Adiada';
  else if (!day) quando = 'Data por anunciar';
  else quando = `${capitalizar(dataLonga(day))}${round.date_status === 'provavel' && (!today || day >= today) ? ' (provável)' : ''}`;
  const raceKm = Number(round?.race?.distance_km);
  const km = kmLabel(Number.isFinite(raceKm) && raceKm > 0 ? raceKm : Number(round?.course?.distance_m) / 1000);
  const hora = horaLabel(round?.course?.start_time);
  const onde = km && hora ? `${km} às ${hora}` : km || (hora ? `às ${hora}` : null);
  return [quando, onde, round?.location ? String(round.location) : null].filter(Boolean).join(' · ');
}

export default function CupJornadaSheet({ view, round, onClose, onRegistar, onNaoFui, onOpenRace, registando = false }) {
  const setCupParticipation = useAppStore((s) => s.setCupParticipation);
  const setCupRoundPriority = useAppStore((s) => s.setCupRoundPriority);
  const { showToast } = useToast();
  const gravada = round?.participation?.decision ?? null;
  const [escolha, setEscolha] = useState(gravada);
  const [aGravar, setAGravar] = useState(false);
  const [promover, setPromover] = useState(false);
  const [aDespromover, setADespromover] = useState(false);

  // A decisão gravada mudou (gravou-se aqui, ou a vista releu): o rascunho segue-a.
  useEffect(() => { setEscolha(gravada); }, [gravada]);

  if (!view || !round) return null;
  const roundLabel = view.roundLabel || 'Jornada';
  const which = `${roundLabel.toLowerCase()} ${round.round_no ?? ''}`.trim();
  const today = view.today || '';
  const day = typeof round.date === 'string' ? round.date.slice(0, 10) : null;
  const cancelada = round.date_status === 'cancelada';
  const passada = !!day && day < today;
  // Decide-se antes do dia (e no próprio dia, até a registar): com a corrida
  // feita, o que a folha mostra é o resultado.
  const aplicavel = !!day && !cancelada && !passada && !round.done;
  const status = round.status;
  const colisao = round.participation?.decision_source === 'colisao' || round.suggestion?.reason === 'principal';
  const principalNome = round.suggestion?.principal?.name || null;
  const race = round.race || null;
  const prioridade = race ? racePriorityOf(race) : null;
  const clube = temClube(view.enrollment, view.teams);

  const guardar = async () => {
    setAGravar(true);
    const res = await setCupParticipation(round.id, { decision: escolha, decision_source: 'atleta' });
    setAGravar(false);
    if (!res?.ok) { showToast(res?.error?.message || 'Não foi possível gravar.', 'error'); return; }
    if (res.collided) { showToast('Ficou por decidir: é o dia de uma prova principal.', 'info'); return; }
    showToast('Decisão guardada.', 'success');
  };

  const voltarASecundaria = async () => {
    setADespromover(true);
    const res = await setCupRoundPriority(round.id, 'b');
    setADespromover(false);
    if (!res?.ok) { showToast(res?.error?.message || 'Não foi possível mudar a prova.', 'error'); return; }
    showToast(`A ${which} voltou a ser secundária.`, 'success');
  };

  const oficiais = resultadoOficialPartes(round.result);
  const lugarProprio = Number(round.run?.details?.age_group_position) > 0 ? Number(round.run.details.age_group_position) : null;
  const acoes = status?.actions || [];

  return (
    <Sheet
      eyebrow={`${roundLabel} ${round.round_no ?? ''}`.trim()}
      eyebrowTone="race"
      title={round.name || roundLabel}
      onClose={onClose}
      testId="cup-jornada-sheet"
      maxHeight="88dvh"
    >
      <div className="flex flex-col gap-3 pt-2 pb-1">
        <div className="flex flex-col gap-1">
          <p className="m-0 text-[12.5px]" data-testid="cup-jornada-dados" style={{ color: 'var(--text-3)', lineHeight: 'var(--leading-normal)' }}>
            {linhaDeDados(round, today)}
          </p>
          {round.dateChange && (
            <p className="m-0 text-[12px] font-bold" data-testid="cup-jornada-mudou" style={{ color: 'var(--warn)' }}>
              {capitalizar(round.dateChange.label)}.
            </p>
          )}
          <p className="m-0 text-[13px]"><CupStatus status={status} /></p>
          {colisao && !passada && !round.done && (
            <p className="m-0 text-[12px] font-bold" style={{ color: 'var(--warn)' }}>
              <span aria-hidden="true">⚠ </span>
              {principalNome ? `É o dia da tua ${principalNome} (principal)` : 'É o dia de uma prova principal tua'} — as principais mandam.
            </p>
          )}
        </div>

        {aplicavel && (
          <>
            <div className="flex flex-col gap-1.5">
              <p className="m-0 text-[12px] font-extrabold uppercase" style={{ color: 'var(--text-4)', letterSpacing: 'var(--tracking-label)' }}>Vais?</p>
              <div role="radiogroup" aria-label={`Decisão para a ${which}`} className="flex gap-1.5">
                {DECISOES.map((d) => {
                  const id = `cup-folha-${round.id}-${d.value}`;
                  const checked = escolha === d.value;
                  return (
                    <label
                      key={d.value}
                      htmlFor={id}
                      data-testid={`cup-folha-${d.value}`}
                      className="flex-1 flex items-center justify-center gap-1 cursor-pointer"
                      style={{
                        minHeight: 44, borderRadius: 12, padding: '0 6px',
                        background: checked ? 'var(--tint-race-bg)' : 'rgba(255,255,255,.04)',
                        border: `1px solid ${checked ? 'var(--tint-race-bd)' : 'var(--border-glass)'}`,
                      }}
                    >
                      <input
                        id={id}
                        type="radio"
                        name={`cup-folha-${round.id}`}
                        checked={checked}
                        onChange={() => setEscolha(d.value)}
                        style={{ width: 16, height: 16, accentColor: d.color, flexShrink: 0 }}
                      />
                      <span aria-hidden="true" style={{ color: d.color, fontWeight: 900 }}>{d.icon}</span>
                      <span className="text-[11.5px] font-extrabold" style={{ color: checked ? 'var(--text-1)' : 'var(--text-3)' }}>{d.label}</span>
                    </label>
                  );
                })}
              </div>
              {escolha != null && escolha !== gravada && (
                <Button variant="module" moduleColor="var(--race)" className="w-full" data-testid="cup-folha-guardar" isLoading={aGravar} onClick={guardar}>
                  Guardar
                </Button>
              )}
            </div>

            {gravada === 'vou' && round.date_status === 'confirmada' && (
              <CupRoundPlanControls view={view} round={round} />
            )}
            {gravada === 'vou' && round.date_status === 'provavel' && (
              <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-3)' }}>Vou — fica à espera da data confirmada.</p>
            )}

            {race?.id && (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="light" size="sm" style={BOTAO} data-testid="cup-abrir-prova" onClick={() => onOpenRace?.(race.id)}>
                  Abrir a prova <ChevronRight size={14} aria-hidden="true" />
                </Button>
                {prioridade === 'a' ? (
                  <>
                    <span className="text-[12px] font-extrabold" data-testid="cup-principal" style={{ color: 'var(--race)' }}>Principal</span>
                    <Button variant="ghost" size="sm" style={BOTAO} data-testid="cup-despromover" isLoading={aDespromover} onClick={voltarASecundaria}>
                      Voltar a secundária
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" size="sm" style={BOTAO} data-testid="cup-promover" onClick={() => setPromover(true)}>
                    Promover a principal
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        {round.done && (
          <div className="flex flex-col gap-1.5" data-testid="cup-jornada-resultado">
            {oficiais.length > 0 ? (
              <p className="m-0 text-[13px] font-bold" style={{ color: 'var(--text-1)' }}>{oficiais.join(' · ')}</p>
            ) : (
              <>
                <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-3)' }}>Ainda sem classificação oficial.</p>
                {lugarProprio && (
                  <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-2)' }}>Lugar no escalão (registado por ti): {lugarProprio}.º</p>
                )}
              </>
            )}
            <div className="flex flex-wrap items-center gap-x-3">
              <CupLink href={round.results_url} label={`Resultados da ${round.chip}`} testId="cup-jornada-link-resultados" />
              {clube && <CupLink href={round.team_results_url} label={`Coletiva da ${round.chip}`} testId="cup-jornada-link-coletiva" />}
            </div>
            {race?.id && (
              <Button variant="light" size="sm" style={BOTAO} className="self-start" data-testid="cup-ver-prova" onClick={() => onOpenRace?.(race.id)}>
                Ver a prova <ChevronRight size={14} aria-hidden="true" />
              </Button>
            )}
          </div>
        )}

        {acoes.length > 0 && (
          <div className="flex gap-2">
            {acoes.includes('registar') && (
              <Button variant="module" moduleColor="var(--race)" className="flex-1" data-testid="cup-folha-registar" isLoading={registando} onClick={() => onRegistar?.(round)}>
                Registar
              </Button>
            )}
            {acoes.includes('nao_fui') && (
              <Button variant="light" className="flex-1" data-testid="cup-folha-nao-fui" onClick={() => onNaoFui?.(round)}>
                Não fui
              </Button>
            )}
          </div>
        )}
      </div>

      {promover && <CupPromoteDialog view={view} round={round} onClose={() => setPromover(false)} />}
    </Sheet>
  );
}
