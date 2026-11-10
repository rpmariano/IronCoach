import React, { useMemo, useState } from 'react';
import { Scale } from 'lucide-react';
import { useAppStore } from '../../store';
import { todayISO } from '../../lib/utils';
import {
  LOAD_PROFILE_LABELS,
  conflictNumbersText,
  conflictOptionTexts,
  loadStateFor,
  profileLimitText,
  revertNoteText,
} from '../../utils/loadProfileState';

/* Perfil de carga por prova (2026-11-09, aprovado pelo Rui). Um só cartão em vez dos dois avisos
   que se contradiziam («estás a esforçar-te demasiado» e «fazes poucos km para a prova»):
   - conflito: os números e as duas opções, Prudente e Mais volume — a escolha é do atleta;
   - perfil: o perfil escolhido e o limite destes 7 dias, com «mudar»;
   - voltou sozinho a Prudente (até 7 dias depois): a razão e «escolher de novo».
   No Hub da prova, uma linha «Perfil de carga: X · mudar» (variant 'hub'). */

export function useLoadState() {
  const raceEvents = useAppStore((s) => s.raceEvents);
  const runs = useAppStore((s) => s.runs);
  const coachPlans = useAppStore((s) => s.coachPlans);
  const coachPlanItems = useAppStore((s) => s.coachPlanItems);
  const profile = useAppStore((s) => s.profile);
  const today = todayISO();
  return useMemo(
    () => loadStateFor({ raceEvents, runs, coachPlans, coachPlanItems, profile, todayISO: today }),
    [raceEvents, runs, coachPlans, coachPlanItems, profile, today],
  );
}

const SAVE_ERROR = 'Não consegui gravar a escolha — tenta de novo.';

function ProfileOptions({ state, busy, onChoose }) {
  const texts = conflictOptionTexts(state);
  return (
    <div className="flex flex-col gap-2 mt-3" data-testid="load-profile-options">
      {['prudente', 'mais_volume'].map((p) => {
        const current = state.chosen && state.profile === p;
        return (
          <button
            key={p}
            type="button"
            disabled={busy}
            onClick={() => onChoose(p)}
            data-testid={`load-profile-choose-${p}`}
            aria-pressed={current}
            className="w-full text-left rounded-xl px-3 py-2.5 disabled:opacity-60"
            style={{
              minHeight: 44,
              background: current ? 'var(--surface-soft)' : 'rgba(255,255,255,.04)',
              border: `1px solid ${current ? 'var(--run)' : 'var(--border-glass)'}`,
            }}
          >
            <span className="block text-[13px] font-extrabold text-[var(--text-1)]">
              {LOAD_PROFILE_LABELS[p]}{current ? ' · o teu' : ''}
            </span>
            <span className="block text-[12px] mt-0.5 text-[var(--text-2)]">{texts[p]}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function LoadProfileCard({ variant = 'card', raceId = null }) {
  const state = useLoadState();
  const setRaceLoadProfile = useAppStore((s) => s.setRaceLoadProfile);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!state?.race?.id) return null;
  // No Hub, só na prova que manda (o perfil das outras não conta para a carga desta semana).
  if (variant === 'hub' && raceId && raceId !== state.race.id) return null;

  const revertNote = revertNoteText(state, todayISO());
  const conflict = state.state === 'conflito';
  const chosenCard = state.state === 'perfil';
  if (variant === 'card' && !conflict && !chosenCard && !revertNote) return null;

  const choose = async (profile) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await setRaceLoadProfile?.(state.race.id, profile);
    setBusy(false);
    if (res?.ok) setOpen(false);
    else setError(SAVE_ERROR);
  };

  const showOptions = conflict || open;
  const errorLine = error && <p className="text-[12px] mt-2" style={{ color: 'var(--warn)' }} role="alert" data-testid="load-profile-error">{error}</p>;
  const revertLine = revertNote && !conflict && (
    <p className="text-[12px] mt-2 text-[var(--text-2)]" data-testid="load-profile-reverted">
      {revertNote}{' '}
      {!open && (
        <button type="button" className="font-bold underline" style={{ color: 'var(--text-1)', minHeight: 44 }} onClick={() => setOpen(true)} data-testid="load-profile-rechoose">
          Escolher de novo
        </button>
      )}
    </p>
  );

  if (variant === 'hub' && !conflict) {
    return (
      <div className="mt-3" data-testid="load-profile-hub">
        <p className="text-[13px] text-[var(--text-1)]" data-testid="load-profile-hub-line">
          Perfil de carga: <strong>{LOAD_PROFILE_LABELS[state.profile]}</strong>
          {' · '}
          <button type="button" className="font-bold underline" style={{ color: 'var(--text-2)', minHeight: 44 }} onClick={() => setOpen((o) => !o)} data-testid="load-profile-change" aria-expanded={open}>
            mudar
          </button>
        </p>
        {revertLine}
        {showOptions && <ProfileOptions state={state} busy={busy} onChoose={choose} />}
        {errorLine}
      </div>
    );
  }

  return (
    <section
      data-testid={conflict ? 'load-profile-conflict' : 'load-profile-card'}
      className="rounded-[18px]"
      style={{ padding: '14px 16px', background: 'rgba(255,255,255,.04)', border: '1px solid var(--border-glass)', marginTop: variant === 'hub' ? 12 : 0 }}
    >
      <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-3)]">
        <Scale size={13} aria-hidden="true" />
        {conflict ? 'Carga ou volume — escolhe tu' : 'Perfil de carga'}
      </p>
      {state.race.name ? <p className="text-[12px] font-bold mt-0.5 truncate text-[var(--text-3)]" data-testid="load-profile-race">{state.race.name}</p> : null}
      {conflict ? (
        <>
          <p className="text-[13px] mt-1.5 text-[var(--text-1)]" data-testid="load-profile-numbers">{conflictNumbersText(state)}</p>
          <p className="text-[12px] mt-1 text-[var(--text-2)]">A carga já pede cautela e o volume fica abaixo do que a prova pede. Não dá para as duas coisas — qual preferes?</p>
        </>
      ) : (
        <p className="text-[13px] mt-1.5 text-[var(--text-1)]" data-testid="load-profile-limit">
          {profileLimitText(state)}{' '}
          {!open && (
            <button type="button" className="font-bold underline" style={{ color: 'var(--text-2)', minHeight: 44 }} onClick={() => setOpen(true)} data-testid="load-profile-change">
              mudar
            </button>
          )}
        </p>
      )}
      {revertLine}
      {showOptions && <ProfileOptions state={state} busy={busy} onChoose={choose} />}
      {errorLine}
    </section>
  );
}
