import React, { useEffect, useState } from 'react';
import { Trash2, RotateCcw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import PremiumModal from '../shared/PremiumModal';
import Button from '../shared/Button';
import { useAppStore } from '../../store';
import { todayISO } from '../../lib/utils';
import { useToast } from '../shared/ToastProvider';
import { raceHasResult, raceResultRuns, clearRaceResult, deleteRaceEvent } from '../../utils/raceResultClear';

/* Apagar numa prova — o mesmo diálogo no hub (RunAgenda) e na agenda (Calendar).

   Bug de 2026-11-15: numa prova concluída, «Eliminar» era a única saída, e quem queria refazer o
   tempo apagava a prova inteira. Agora, com resultado (concluída ou com corrida ligada), a ação
   principal é «Apagar o resultado»: a prova volta a agendada e a corrida fica como treino ou
   apaga-se, à escolha. «Eliminar a prova» passa a secundária, com o que se perde dito por extenso.
   Sem resultado, é a confirmação de sempre. */

const fmtDay = (iso) => {
  try { return format(parseISO(String(iso).slice(0, 10)), 'd MMM', { locale: pt }); } catch { return ''; }
};
const fmtKm = (km) => (Number(km) > 0 ? `${String(Math.round(Number(km) * 100) / 100).replace('.', ',')} km` : '');

function runLabel(run) {
  return [fmtDay(run?.date), fmtKm(run?.distance_km)].filter(Boolean).join(' · ');
}

export default function RaceRemoveDialog({ isOpen, race, onClose, onCleared, onDeleted }) {
  const { runs, profile, session, coachPlans } = useAppStore();
  const { showToast } = useToast();
  const userId = session?.user?.id || profile?.id;
  const hasResult = raceHasResult(race, runs);
  const resultRuns = raceResultRuns(race, runs);
  const [step, setStep] = useState(hasResult ? 'result' : 'race');
  const [runChoice, setRunChoice] = useState('keep');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) { setStep(hasResult ? 'result' : 'race'); setRunChoice('keep'); setBusy(false); }
    // Só ao abrir: a escolha não se repõe a meio, se o store mudar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, race?.id]);

  if (!isOpen || !race) return null;

  const close = () => { if (!busy) onClose?.(); };

  const doClear = async () => {
    setBusy(true);
    const res = await clearRaceResult({ race, userId, deleteRuns: runChoice === 'delete' });
    setBusy(false);
    if (!res.ok) { showToast(res.message, 'error'); return; }
    showToast(runChoice === 'delete' && resultRuns.length ? 'Resultado e corrida apagados.' : 'Resultado apagado. A prova voltou a agendada.', 'success');
    onCleared?.({ deletedRuns: runChoice === 'delete' });
    onClose?.();
  };

  const doDelete = async () => {
    setBusy(true);
    const res = await deleteRaceEvent({ raceId: race.id, userId });
    setBusy(false);
    if (!res.ok) { showToast(res.message, 'error'); return; }
    showToast('Prova eliminada');
    onDeleted?.();
    onClose?.();
  };

  /* Apagar a prova-objetivo de um plano deixa o plano sem objetivo (race_lost_at, migration
     20260918074705) — e a Carol vai querer falar disso: o atleta decide sabendo
     (specs/plano-vinculado-a-prova.md §2.5). */
  const isPlanObjective = (coachPlans || []).some(
    (p) => p?.status === 'aceite' && p.race_id === race.id && String(p.period_end || '').slice(0, 10) >= todayISO(),
  );
  const nome = race.name ? `«${race.name}»` : 'A prova';
  const planNote = isPlanObjective
    ? ' É o objetivo do teu plano de treino: o plano fica sem objetivo e a Carol vai querer falar contigo sobre o que fazer a seguir.'
    : '';

  if (step === 'result') {
    return (
      <PremiumModal isOpen onClose={close} title="Apagar o resultado" icon={RotateCcw} theme="race" variant="dialog" maxWidth="max-w-sm">
        <div className="p-6 space-y-4" data-testid="race-remove-result">
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
            {nome} volta a «agendada», para a registares outra vez. O tempo, as conquistas e o balanço da Carol saem.
            As memórias (diploma, medalha, fotos) ficam.
          </p>

          {resultRuns.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-[12px] font-bold mb-2" style={{ color: 'var(--text-2)' }}>
                E a corrida{resultRuns.length === 1 && runLabel(resultRuns[0]) ? ` (${runLabel(resultRuns[0])})` : 's'}?
              </legend>
              {[
                { key: 'keep', title: 'Manter como treino', help: 'Fica no histórico e nos totais, sem ligação à prova.' },
                { key: 'delete', title: resultRuns.length === 1 ? 'Apagar também a corrida' : 'Apagar também as corridas', help: 'Sai do histórico e dos totais. Não se desfaz.' },
              ].map((opt) => (
                <label
                  key={opt.key}
                  className="flex items-start gap-3 rounded-[12px] p-3 cursor-pointer min-h-[44px]"
                  style={{ border: `1px solid ${runChoice === opt.key ? 'var(--race)' : 'var(--border-glass-strong)'}`, background: runChoice === opt.key ? 'var(--tint-race-bg)' : 'transparent' }}
                >
                  <input
                    type="radio"
                    name="race-result-run"
                    value={opt.key}
                    checked={runChoice === opt.key}
                    onChange={() => setRunChoice(opt.key)}
                    className="mt-1"
                    style={{ accentColor: 'var(--race)' }}
                  />
                  <span>
                    <span className="block text-[13px] font-bold" style={{ color: 'var(--text-1)' }}>{opt.title}</span>
                    <span className="block text-[12px]" style={{ color: 'var(--text-3)' }}>{opt.help}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <div className="space-y-3 pt-1">
            <Button type="button" variant="danger" className="w-full" onClick={doClear} disabled={busy} isLoading={busy}>
              {busy ? 'A apagar…' : 'Apagar o resultado'}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={close} disabled={busy}>
              Cancelar
            </Button>
          </div>

          <div className="pt-2 text-center" style={{ borderTop: '1px solid var(--border-glass)' }}>
            <button
              type="button"
              onClick={() => setStep('race')}
              disabled={busy}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 text-[12px] font-bold underline underline-offset-2"
              style={{ color: 'var(--text-3)' }}
            >
              <Trash2 size={13} aria-hidden="true" /> Eliminar a prova inteira
            </button>
          </div>
        </div>
      </PremiumModal>
    );
  }

  const message = hasResult
    ? (resultRuns.length
      ? `${nome} sai do calendário com tudo o que tem: o resultado, as conquistas, as memórias (diploma, medalha, fotos) e a ligação à corrida. A corrida fica no histórico, como treino.${planNote} Isto não se desfaz.`
      : `${nome} sai do calendário com tudo o que tem: o resultado, as conquistas e as memórias (diploma, medalha, fotos).${planNote} Isto não se desfaz.`)
    : `${nome} sai do calendário${isPlanObjective ? '.' : ' e o plano deixa de a ter como alvo.'} Os treinos já registados ficam.${planNote} Isto não se desfaz.`;

  return (
    <PremiumModal isOpen onClose={close} title="Eliminar prova" icon={Trash2} theme="danger" variant="dialog" maxWidth="max-w-sm">
      <div className="p-6" data-testid="race-remove-race">
        <p className="text-[13px] mb-6 leading-relaxed" style={{ color: 'var(--text-3)' }}>{message}</p>
        <div className="space-y-3">
          <Button type="button" variant="danger" className="w-full" onClick={doDelete} disabled={busy} isLoading={busy}>
            {busy ? 'A eliminar…' : 'Eliminar prova'}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={hasResult ? () => setStep('result') : close} disabled={busy}>
            {hasResult ? 'Voltar' : 'Cancelar'}
          </Button>
        </div>
      </div>
    </PremiumModal>
  );
}
