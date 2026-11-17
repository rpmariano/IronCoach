import React, { useMemo, useState } from 'react';
import { Scale } from 'lucide-react';
import { useAppStore } from '../../store';
import { todayISO } from '../../lib/utils';
import {
  LOAD_PROFILE_LABELS,
  PROFILE_WHY,
  conflictOptionTexts,
  loadStateFor,
  revertNoteText,
  whatSentences,
} from '../../utils/loadProfileState';

/* Perfil de carga por prova (2026-11-09, aprovado pelo Rui). Um só cartão em vez dos dois avisos
   que se contradiziam («estás a esforçar-te demasiado» e «fazes poucos km para a prova»):
   - conflito: os números e as duas opções, Prudente e Mais volume — a escolha é do atleta;
   - perfil: o perfil escolhido e o limite destes 7 dias, com «mudar»;
   - voltou sozinho a Prudente (até 7 dias depois): a razão e «escolher de novo».
   No Hub da prova, uma linha «Perfil de carga: X · mudar» (variant 'hub').

   Bug #123 (2026-11-17): o Rui perguntou «O que é esta informação?». Em todos os estados, a
   primeira frase diz o que se mede e porquê agora (whatSentences, utils/loadProfileState.js) — a
   carga compara os últimos 7 dias com o habitual, o volume compara com o que a prova pede — e um
   «Porquê?» explica Prudente e Mais volume sem jargão. */

/* O «Porquê?»: os dois perfis e a regra, numa linha cada. */
function ProfileWhy() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="load-profile-why-toggle"
        className="text-[12px] font-bold underline"
        style={{ color: 'var(--text-2)', minHeight: 44 }}
      >
        {open ? 'Fechar' : 'Porquê?'}
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 text-[12px] leading-[1.5] text-[var(--text-2)]" data-testid="load-profile-why">
          <p>{PROFILE_WHY.regra}</p>
          <p>{PROFILE_WHY.prudente}</p>
          <p>{PROFILE_WHY.mais_volume}</p>
        </div>
      )}
    </div>
  );
}

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

/* A escolha no chat (bug #123): o servidor manda load_profile_choice com a conversa da carga e o
   chat põe por baixo as duas opções, com os mesmos textos do hub. O toque grava pelo caminho de
   sempre (setRaceLoadProfile, RLS do próprio) e `onDone` diz ao chat o que foi escolhido. */
export function LoadProfileChoice({ raceId, disabled = false, onDone, onLater }) {
  const state = useLoadState();
  const setRaceLoadProfile = useAppStore((s) => s.setRaceLoadProfile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!state?.race?.id || (raceId && raceId !== state.race.id)) return null;
  const choose = async (profile) => {
    if (busy || disabled) return;
    setBusy(true);
    setError(null);
    const res = await setRaceLoadProfile?.(state.race.id, profile);
    setBusy(false);
    if (res?.ok) onDone?.(profile);
    else setError(SAVE_ERROR);
  };
  return (
    /* Um grupo com nome (o título), anunciado quando aparece (aria-live), e com saída: «Agora não». */
    <div
      role="group"
      aria-labelledby="load-choice-title"
      aria-live="polite"
      className="rounded-[18px]"
      style={{ padding: '12px 14px', background: 'rgba(255,255,255,.04)', border: '1px solid var(--border-glass)' }}
    >
      <p id="load-choice-title" className="text-[12px] font-bold text-[var(--text-2)]">O perfil de carga para a prova {state.race.name || ''}</p>
      <ProfileOptions state={state} busy={busy || disabled} onChoose={choose} />
      {onLater && (
        <button
          type="button"
          onClick={onLater}
          disabled={busy}
          data-testid="load-choice-later"
          className="w-full mt-2 text-[13px] font-bold rounded-xl"
          style={{ minHeight: 44, color: 'var(--text-2)', border: '1px solid var(--border-glass)' }}
        >
          Agora não
        </button>
      )}
      {error && <p className="text-[12px] mt-2" style={{ color: 'var(--warn)' }} role="alert">{error}</p>}
    </div>
  );
}

/* Só no hub da prova (revisão do #123: no Início é um aviso da Carol, utils/loadTopic.js). */
export default function LoadProfileCard({ raceId = null }) {
  const state = useLoadState();
  const setRaceLoadProfile = useAppStore((s) => s.setRaceLoadProfile);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!state?.race?.id) return null;
  // Só na prova que manda (o perfil das outras não conta para a carga desta semana).
  if (raceId && raceId !== state.race.id) return null;

  const revertNote = revertNoteText(state, todayISO());
  const conflict = state.state === 'conflito';

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

  if (!conflict) {
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
      data-testid="load-profile-conflict"
      className="rounded-[18px]"
      style={{ padding: '14px 16px', background: 'rgba(255,255,255,.04)', border: '1px solid var(--border-glass)', marginTop: 12 }}
    >
      <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-3)]">
        <Scale size={13} aria-hidden="true" />
        Carga ou volume — escolhe tu
      </p>
      {state.race.name ? <p className="text-[12px] font-bold mt-0.5 truncate text-[var(--text-3)]" data-testid="load-profile-race">{state.race.name}</p> : null}
      {/* O que é, e porquê agora — primeiro, em todos os estados (bug #123). */}
      <div className="flex flex-col gap-1 mt-1.5" data-testid="load-profile-what">
        {whatSentences(state).map((t) => <p key={t} className="text-[13px] leading-[1.5] text-[var(--text-1)]">{t}</p>)}
      </div>
      <p className="text-[12px] mt-1 text-[var(--text-2)]">Não dá para as duas coisas — qual preferes?</p>
      <ProfileWhy />
      {showOptions && <ProfileOptions state={state} busy={busy} onChoose={choose} />}
      {errorLine}
    </section>
  );
}
