import React, { useEffect, useMemo, useState } from 'react';
import { HeartPulse, ChevronRight, Pencil } from 'lucide-react';
import { useAppStore } from '../../store';
import { todayISO } from '../../lib/utils';
import GlassCard from '../shared/GlassCard';
import { Sheet } from '../shared/Sheet';
import { useToast } from '../shared/ToastProvider';
import { canTrackCycle, scaleLabel, summarizeCheckin, todaysCheckin } from '../../utils/checkin';
import { checkinReply } from '../../utils/checkinReply';
import { checkinDay, lisbonParts, raceToday, acordouParaAProva } from '../../utils/carolWelcome';
import CoachAvatar from '../Coach/CoachAvatar';

/* O check-in diário (specs/carol-omnisciencia-omnipresenca.md, Fase 2). Vive
   em "Como estou", por cima da órbita: é a parte do "como estou" que só o
   atleta sabe. Dez segundos — três escalas de 1 a 5, a dor de 0 a 10 com o
   local, e o ciclo só para quem se aplica e só depois de aceitar.

   A Carol lê isto no chat, no cartão diário e nas análises dos registos. Uma
   dor ≥ 4 ou sono mau persistente chama-a pelo canal da intervenção (ver
   saveDailyCheckin no store).

   Feito o check-in, quem responde é ela (utils/checkinReply.js): uma frase
   sobre o que o atleta disse, que fica no cartão o resto do dia, com o
   resumo por baixo — em vez de um "Check-in guardado" que ninguém lê. Acabado
   de gravar, ela respira e a frase entra; ao voltar mais tarde, está só lá. */
export default function CheckinCard() {
  const dailyCheckins = useAppStore((s) => s.dailyCheckins);
  const [open, setOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  // Pedido das boas-vindas da manhã ("Fazer o check-in"): abre a persiana
  // uma vez e limpa o pedido, para não voltar a abrir ao regressar ao Início.
  const checkinRequested = useAppStore((s) => s.checkinRequested);
  useEffect(() => {
    if (!checkinRequested) return;
    setOpen(true);
    useAppStore.getState().clearCheckinRequest();
  }, [checkinRequested]);
  const today = todayISO();
  const checkin = todaysCheckin(dailyCheckins, today);
  // A resposta dela sabe o que o dia é — descanso, prova, treino por fazer —
  // tal como as boas-vindas (pedido 2026-09-26).
  const coachPlans = useAppStore((s) => s.coachPlans);
  const coachPlanItems = useAppStore((s) => s.coachPlanItems);
  const raceEvents = useAppStore((s) => s.raceEvents);
  // E o que ela sabe da vida dele — uma cirurgia, uma lesão (utils/carolVida.js).
  const coachNotes = useAppStore((s) => s.coachNotes);
  const dia = useMemo(() => checkinDay(today, { coachPlans, coachPlanItems, raceEvents, coachNotes }), [today, coachPlans, coachPlanItems, raceEvents, coachNotes]);
  const reply = useMemo(() => checkinReply(dailyCheckins, today, dia), [dailyCheckins, today, dia]);
  // Depois da meia-noite e antes das 5h, a noite ainda não acabou: "Como
  // acordaste hoje?" ao lado de "Ainda acordado?" das boas-vindas era a
  // mesma fronteira da meia-noite que as boas-vindas tinham. Menos para quem
  // já acordou para a prova — a mesma regra que as boas-vindas usam.
  const lisboa = lisbonParts();
  const madrugada = lisboa.hour < 5 && !acordouParaAProva(raceToday(raceEvents, lisboa.date));

  return (
    <>
      {checkin ? (
        <GlassCard padding="12px 14px 12px 16px" data-testid="checkin-card-done">
          <div className="flex items-start gap-3">
            <CoachAvatar key={justSaved ? 'acabado' : 'antes'} size={44} mood={reply?.mood} breathing={justSaved} style={{ marginTop: 1 }} />
            <div className="flex-1 min-w-0">
              <p
                key={reply?.text}
                data-testid="checkin-reply"
                data-tone={reply?.tone}
                className={`text-[13px] font-bold leading-[1.45]${justSaved ? ' checkin-reply' : ''}`}
                style={{ color: 'var(--text-1)', textWrap: 'pretty' }}
              >
                {reply?.text}
              </p>
              <p className="text-[11.5px] leading-[1.45] mt-1" style={{ color: reply?.tone === 'warn' ? 'var(--warn)' : 'var(--text-4)' }}>{summarizeCheckin(checkin)}</p>
            </div>
            <button type="button" onClick={() => setOpen(true)} aria-label="Editar o check-in de hoje" className="tap-area-44 inline-flex items-center justify-center shrink-0 w-11 h-11 rounded-[11px]" style={{ color: 'var(--text-3)' }}>
              <Pencil size={15} />
            </button>
          </div>
        </GlassCard>
      ) : (
        <button type="button" onClick={() => setOpen(true)} data-testid="checkin-card" className="flex items-center gap-3 w-full text-left rounded-[18px]" style={{ padding: '13px 16px', minHeight: 44, background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)' }}>
          <HeartPulse size={17} style={{ color: 'var(--coach)' }} className="shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-extrabold" style={{ color: 'var(--text-1)' }}>{madrugada ? 'Quando acordares, diz-me como dormiste.' : 'Como acordaste hoje?'}</span>
            <span className="block text-[12px] leading-[1.45] mt-0.5" style={{ color: 'var(--text-3)' }}>Sono, energia, stress e dores. Dez segundos, e eu ajusto o dia.</span>
          </span>
          <ChevronRight size={16} style={{ color: 'var(--text-4)' }} className="shrink-0" aria-hidden="true" />
        </button>
      )}
      {open && <CheckinSheet initial={checkin} onClose={() => setOpen(false)} onSaved={() => setJustSaved(true)} />}
    </>
  );
}

const SCALES = [
  { field: 'sleep', label: 'Como dormiste?' },
  { field: 'energy', label: 'Como está a energia?' },
  { field: 'stress', label: 'E o stress?' },
];

function ScaleRow({ field, label, value, onChange }) {
  const selected = scaleLabel(field, value);
  return (
    <fieldset className="mt-3.5">
      <legend className="flex items-baseline justify-between w-full text-[12.5px] font-bold" style={{ color: 'var(--text-2)' }}>
        <span>{label}</span>
        <span className="text-[11.5px] font-semibold" style={{ color: selected ? 'var(--coach)' : 'var(--text-4)' }} aria-live="polite">{selected || 'escolhe de 1 a 5'}</span>
      </legend>
      <div className="grid grid-cols-5 gap-1.5 mt-2">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === n;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={on}
              aria-label={`${label} ${n} de 5: ${scaleLabel(field, n)}`}
              onClick={() => onChange(n)}
              className="min-h-[44px] rounded-[11px] text-[14px] font-extrabold"
              style={on
                ? { background: 'var(--tint-coach-bg)', border: '1px solid var(--coach)', color: 'var(--coach)' }
                : { background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass)', color: 'var(--text-3)' }}
            >
              {n}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function CheckinSheet({ initial = null, onClose, onSaved }) {
  const { profile, saveDailyCheckin, setCycleConsent, deleteAllCheckins, dailyCheckins } = useAppStore();
  const { showToast } = useToast();
  const [values, setValues] = useState({
    sleep: initial?.sleep ?? null,
    energy: initial?.energy ?? null,
    stress: initial?.stress ?? null,
    pain: initial?.pain ?? 0,
    pain_location: initial?.pain_location ?? '',
    period_today: initial?.period_today ?? null,
  });
  const [busy, setBusy] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const set = (field) => (v) => setValues((s) => ({ ...s, [field]: v }));

  const showCycle = canTrackCycle(profile);
  const hasConsent = !!profile?.cycle_tracking_consent_at;
  const ready = values.sleep && values.energy && values.stress;

  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    const { ok, alarms } = await saveDailyCheckin(values);
    setBusy(false);
    if (!ok) { showToast('Não consegui guardar o check-in. Tenta outra vez.', 'error'); return; }
    // A confirmação é a resposta dela no cartão; o aviso só fica para quando
    // o check-in a chama para uma conversa.
    if (alarms.length) showToast('Guardado. Quero falar contigo sobre isto.');
    onSaved?.();
    onClose();
  };

  const toggleConsent = async (on) => {
    const done = await setCycleConsent(on);
    if (!done) { showToast('Não consegui gravar a tua escolha. Tenta outra vez.', 'error'); return; }
    setConsentOpen(false);
    setConfirmRevoke(false);
    if (!on) setValues((s) => ({ ...s, period_today: null }));
    showToast(on ? 'Ciclo ligado.' : 'Ciclo desligado. Apaguei os dias que tinhas marcado.');
  };

  const deleteAll = async () => {
    const done = await deleteAllCheckins();
    if (!done) { showToast('Não consegui apagar os check-ins. Tenta outra vez.', 'error'); return; }
    showToast('Apaguei todos os teus check-ins.');
    onClose();
  };

  return (
    <Sheet eyebrow="Check-in" eyebrowTone="coach" title="Como estás hoje?" onClose={onClose} testId="checkin-sheet" maxHeight="88dvh">
      {SCALES.map((s) => (
        <ScaleRow key={s.field} field={s.field} label={s.label} value={values[s.field]} onChange={set(s.field)} />
      ))}

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <label htmlFor="checkin-pain" className="text-[12.5px] font-bold" style={{ color: 'var(--text-2)' }}>Dores?</label>
          <span className="text-[11.5px] font-semibold" style={{ color: values.pain >= 4 ? 'var(--warn)' : 'var(--text-4)' }} aria-live="polite">
            {values.pain === 0 ? 'nenhuma' : `${values.pain} de 10`}
          </span>
        </div>
        <input
          id="checkin-pain"
          type="range"
          min={0}
          max={10}
          step={1}
          value={values.pain}
          onChange={(e) => set('pain')(Number(e.target.value))}
          aria-valuetext={values.pain === 0 ? 'Sem dor' : `Dor ${values.pain} de 10`}
          className="w-full mt-2 min-h-[44px]"
          style={{ accentColor: values.pain >= 4 ? 'var(--warn)' : 'var(--coach)' }}
        />
        <div className="flex justify-between text-[11px]" style={{ color: 'var(--text-4)' }} aria-hidden="true">
          <span>0 · sem dor</span><span>10 · a pior possível</span>
        </div>
        {values.pain > 0 && (
          <div className="mt-3">
            <label htmlFor="checkin-pain-where" className="block text-[12px] font-bold" style={{ color: 'var(--text-3)' }}>Onde?</label>
            <input
              id="checkin-pain-where"
              type="text"
              maxLength={80}
              value={values.pain_location}
              onChange={(e) => set('pain_location')(e.target.value)}
              placeholder="ex.: gémeo direito, canela, joelho"
              className="w-full mt-1.5 min-h-[44px] px-3 rounded-[11px] text-[13px]"
              style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-1)' }}
            />
          </div>
        )}
      </div>

      {showCycle && (
        <div className="mt-4 pt-3.5" style={{ borderTop: '1px solid rgba(255,255,255,.09)' }}>
          {hasConsent ? (
            <fieldset>
              <legend className="text-[12.5px] font-bold" style={{ color: 'var(--text-2)' }}>Estás menstruada hoje?</legend>
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                {[{ v: true, t: 'Sim' }, { v: false, t: 'Não' }].map(({ v, t }) => {
                  const on = values.period_today === v;
                  return (
                    <button key={t} type="button" aria-pressed={on} onClick={() => set('period_today')(on ? null : v)} className="min-h-[44px] rounded-[11px] text-[13px] font-extrabold" style={on
                      ? { background: 'var(--tint-coach-bg)', border: '1px solid var(--coach)', color: 'var(--coach)' }
                      : { background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass)', color: 'var(--text-3)' }}>
                      {t}
                    </button>
                  );
                })}
              </div>
              {confirmRevoke ? (
                <div className="mt-2.5" data-testid="checkin-cycle-revoke">
                  <p className="text-[12px] leading-[1.5]" style={{ color: 'var(--text-3)' }}>
                    Deixo de perguntar pelo ciclo e apago todos os dias que marcaste. Não dá para desfazer.
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 mt-2">
                    <button type="button" onClick={() => toggleConsent(false)} className="min-h-[44px] rounded-[11px] text-[12.5px] font-extrabold" style={{ background: 'rgba(248,113,113,.12)', border: '1px solid rgba(248,113,113,.4)', color: 'var(--danger)' }}>
                      Apagar e desligar
                    </button>
                    <button type="button" onClick={() => setConfirmRevoke(false)} className="min-h-[44px] rounded-[11px] text-[12.5px] font-bold" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-3)' }}>
                      Manter
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmRevoke(true)} className="min-h-[44px] mt-1 text-[11.5px] font-semibold underline" style={{ color: 'var(--text-4)' }}>
                  Deixar de registar o ciclo
                </button>
              )}
            </fieldset>
          ) : consentOpen ? (
            <div data-testid="checkin-cycle-consent">
              <p className="text-[12.5px] leading-[1.55]" style={{ color: 'var(--text-3)' }}>
                Registar os dias de menstruação ajuda-me a apanhar um sinal de que estás a comer pouco para o que treinas (défice energético, RED-S). Fica guardado na tua conta e só serve para eu te acompanhar: entra nas minhas análises, que são feitas por um modelo de IA. Podes desligar aqui a qualquer momento, e apago os dias que tiveres marcado.
              </p>
              <div className="grid grid-cols-2 gap-1.5 mt-2.5">
                <button type="button" onClick={() => toggleConsent(true)} className="min-h-[44px] rounded-[11px] text-[12.5px] font-extrabold" style={{ background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)', color: 'var(--coach)' }}>
                  Aceito registar
                </button>
                <button type="button" onClick={() => setConsentOpen(false)} className="min-h-[44px] rounded-[11px] text-[12.5px] font-bold" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-3)' }}>
                  Agora não
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConsentOpen(true)} className="min-h-[44px] text-[12px] font-bold" style={{ color: 'var(--text-3)' }}>
              Registar também o ciclo menstrual (opcional)
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={!ready || busy}
        onClick={save}
        className="w-full min-h-[46px] mt-5 rounded-[11px] text-[13.5px] font-extrabold disabled:opacity-45"
        style={{ background: 'var(--grad-coach-legible)', color: 'var(--coach-ink)' }}
      >
        {busy ? 'A guardar…' : ready ? 'Guardar' : 'Falta escolher o sono, a energia e o stress'}
      </button>

      {(dailyCheckins || []).length > 0 && (
        <div className="mt-4 pt-3 text-center" style={{ borderTop: '1px solid rgba(255,255,255,.09)' }}>
          {confirmDeleteAll ? (
            <div data-testid="checkin-delete-all">
              <p className="text-[12px] leading-[1.5]" style={{ color: 'var(--text-3)' }}>
                Apago os {dailyCheckins.length} check-ins que tens guardados, com o ciclo incluído. Não dá para desfazer.
              </p>
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                <button type="button" onClick={deleteAll} className="min-h-[44px] rounded-[11px] text-[12.5px] font-extrabold" style={{ background: 'rgba(248,113,113,.12)', border: '1px solid rgba(248,113,113,.4)', color: 'var(--danger)' }}>
                  Apagar tudo
                </button>
                <button type="button" onClick={() => setConfirmDeleteAll(false)} className="min-h-[44px] rounded-[11px] text-[12.5px] font-bold" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-3)' }}>
                  Manter
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDeleteAll(true)} className="min-h-[44px] text-[11.5px] font-semibold underline" style={{ color: 'var(--text-4)' }}>
              Apagar todos os meus check-ins
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
