import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import PremiumModal from '../shared/PremiumModal';
import Button from '../shared/Button';
import { useAppStore } from '../../store';
import { todayISO } from '../../lib/utils';
import { useToast } from '../shared/ToastProvider';
import { raceHasResult, raceResultRuns, clearRaceResult, deleteRaceEvent } from '../../utils/raceResultClear';

/* Apagar numa prova (bug de 2026-11-15: a atleta queria refazer o tempo e apagou a prova inteira).
   Regras do Rui — dois diálogos, cada um no seu sítio:

   · mode "prova" (o hub e a agenda): o botão diz sempre «Eliminar prova», e a confirmação diz o que
     se perde — o resultado, o diploma, as fotos e a ligação à corrida.
   · mode "registo" (dentro de «Editar o registo da prova»): «Eliminar registo» apaga a corrida, ou só
     o resultado (a corrida fica como treino) — nunca a prova, que volta a agendada. */

const fmtDay = (iso) => {
  try { return format(parseISO(String(iso).slice(0, 10)), 'd MMM', { locale: pt }); } catch { return ''; }
};
const fmtKm = (km) => (Number(km) > 0 ? `${String(Math.round(Number(km) * 100) / 100).replace('.', ',')} km` : '');
const runLabel = (run) => [fmtDay(run?.date), fmtKm(run?.distance_km)].filter(Boolean).join(' · ');

export default function RaceRemoveDialog({ mode = 'prova', isOpen, race, runId = null, onClose, onCleared, onDeleted }) {
  const { runs, profile, session, coachPlans } = useAppStore();
  const { showToast } = useToast();
  const userId = session?.user?.id || profile?.id;
  const [runChoice, setRunChoice] = useState('delete');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) { setRunChoice('delete'); setBusy(false); }
  }, [isOpen, race?.id]);

  if (!isOpen || !race) return null;

  const hasResult = raceHasResult(race, runs);
  const resultRuns = raceResultRuns(race, runs);
  const editing = runId ? (runs || []).find((r) => r.id === runId) : null;
  if (editing && !resultRuns.some((r) => r.id === editing.id)) resultRuns.push(editing);
  const close = () => { if (!busy) onClose?.(); };
  const nome = race.name ? `«${race.name}»` : 'A prova';

  if (mode === 'registo') {
    const doClear = async () => {
      setBusy(true);
      const deleteRuns = runChoice === 'delete';
      const res = await clearRaceResult({ race, userId, deleteRuns, runId });
      setBusy(false);
      if (!res.ok) { showToast(res.message, 'error'); return; }
      showToast(deleteRuns ? 'Registo eliminado. A prova voltou a agendada.' : 'Resultado apagado. A corrida ficou como treino.', 'success');
      onCleared?.({ deletedRuns: deleteRuns });
      onClose?.();
    };
    const label = resultRuns.length === 1 && runLabel(resultRuns[0]) ? ` (${runLabel(resultRuns[0])})` : '';
    const options = [
      { key: 'delete', title: `Apagar a corrida${label}`, help: 'Sai do histórico e dos totais. Não se desfaz.' },
      { key: 'keep', title: 'Apagar só o resultado', help: 'A corrida fica no histórico, como treino, sem o tempo oficial nem a classificação.' },
    ];
    return (
      <PremiumModal isOpen onClose={close} title="Eliminar registo" icon={Trash2} theme="danger" variant="dialog" maxWidth="max-w-sm">
        <div className="p-6 space-y-4" data-testid="race-remove-record">
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
            {nome} fica na agenda e volta a «agendada», para a registares outra vez. O balanço da Carol sai;
            o diploma, a medalha e as fotos ficam na prova.
          </p>
          {resultRuns.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-[12px] font-bold mb-2" style={{ color: 'var(--text-2)' }}>O que apagar?</legend>
              {options.map((opt) => (
                <label
                  key={opt.key}
                  className="flex items-start gap-3 rounded-[12px] p-3 cursor-pointer min-h-[44px]"
                  style={{ border: `1px solid ${runChoice === opt.key ? 'var(--danger)' : 'var(--border-glass-strong)'}` }}
                >
                  <input
                    type="radio"
                    name="race-record-remove"
                    value={opt.key}
                    checked={runChoice === opt.key}
                    onChange={() => setRunChoice(opt.key)}
                    className="mt-1"
                    style={{ accentColor: 'var(--danger)' }}
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
              {busy ? 'A eliminar…' : 'Eliminar registo'}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={close} disabled={busy}>
              Cancelar
            </Button>
          </div>
        </div>
      </PremiumModal>
    );
  }

  /* Apagar a prova-objetivo de um plano deixa o plano sem objetivo (race_lost_at, migration
     20260918074705) — e a Carol vai querer falar disso: o atleta decide sabendo
     (specs/plano-vinculado-a-prova.md §2.5). */
  const isPlanObjective = (coachPlans || []).some(
    (p) => p?.status === 'aceite' && p.race_id === race.id && String(p.period_end || '').slice(0, 10) >= todayISO(),
  );
  const planNote = isPlanObjective
    ? ' É o objetivo do teu plano de treino: o plano fica sem objetivo e a Carol vai querer falar contigo sobre o que fazer a seguir.'
    : '';
  const message = hasResult
    ? `${nome} sai do calendário e perdes o resultado, o diploma, as fotos e a ligação à corrida.${resultRuns.length ? ' A corrida fica no histórico, como treino.' : ''} Para refazer só o tempo, usa «Eliminar registo» em «Editar o registo».${planNote} Isto não se desfaz.`
    : `${nome} sai do calendário${isPlanObjective ? '.' : ' e o plano deixa de a ter como alvo.'} Os treinos já registados ficam.${planNote} Isto não se desfaz.`;

  const doDelete = async () => {
    setBusy(true);
    const res = await deleteRaceEvent({ raceId: race.id, userId });
    setBusy(false);
    if (!res.ok) { showToast(res.message, 'error'); return; }
    showToast('Prova eliminada');
    onDeleted?.();
    onClose?.();
  };

  return (
    <PremiumModal isOpen onClose={close} title="Eliminar prova" icon={Trash2} theme="danger" variant="dialog" maxWidth="max-w-sm">
      <div className="p-6" data-testid="race-remove-race">
        <p className="text-[13px] mb-6 leading-relaxed" style={{ color: 'var(--text-3)' }}>{message}</p>
        <div className="space-y-3">
          <Button type="button" variant="danger" className="w-full" onClick={doDelete} disabled={busy} isLoading={busy}>
            {busy ? 'A eliminar…' : 'Eliminar prova'}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={close} disabled={busy}>
            Cancelar
          </Button>
        </div>
      </div>
    </PremiumModal>
  );
}
