import React, { useMemo, useState } from 'react';
import { Droplets, BellOff } from 'lucide-react';
import CoachAvatar from '../Coach/CoachAvatar';
import { useAppStore } from '../../store';
import { lisbonTodayISO } from '../../lib/utils';
import { Sheet } from '../shared/Sheet';
import { useToast } from '../shared/ToastProvider';

/* Registar água — vive no FAB desde o redesenho 2026-09 (auditoria, achado
   7: a órbita do Início é só leitura). Três quantidades e o silêncio dos
   lembretes de hoje, que estava no antigo cartão de hidratação.

   O nível do dia vê-se numa linha de água por baixo do total. O copo que
   passa a meta é o único registo de água que não é igual aos outros: em vez
   do aviso "+250 ml" e de fechar logo, a linha enche até ao fim e a Carol
   diz uma frase — uma vez por dia, porque a meta só se passa uma vez.

   A persiana fechava-se sozinha 2,6 s depois. Desde 2026-09-21 espera pelo
   atleta («todas as mensagens que têm este caráter temporário devem deixar
   de o ter; quero que só desapareçam mediante ação do utilizador»): a frase
   dela é um botão e fecha no toque, tal como o "Fechar" da persiana. */
const AMOUNTS = [200, 250, 300];
/** Já não fecha nada — os testes usam-na como unidade de "tempo mais do que
 *  suficiente para a persiana ter fechado, se ainda fechasse sozinha". */
export const WATER_GOAL_MOMENT_MS = 2600;
const litres = (ml) => (Math.round((ml / 1000) * 10) / 10).toFixed(1).replace('.', ',');

export default function WaterSheet() {
  const { waterSheetOpen, setWaterSheetOpen, waterLogs, profile, addWaterLog, snoozeWaterReminder } = useAppStore();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [reached, setReached] = useState(false);
  const today = lisbonTodayISO();
  const total = useMemo(() => (waterLogs || []).filter((w) => w.date === today).reduce((s, w) => s + (w.amount_ml || 0), 0), [waterLogs, today]);
  const goal = Number(profile?.water_goal_ml) || 2000;
  const mutedToday = profile?.water_reminder_muted_date === today;

  if (!waterSheetOpen) return null;
  const close = () => {
    setReached(false);
    setWaterSheetOpen(false);
  };

  const log = async (ml) => {
    if (!profile?.id || busy) return;
    setBusy(true);
    const before = total;
    const row = await addWaterLog(ml, profile.id);
    setBusy(false);
    if (row) {
      // O copo que passa a meta: o momento, em vez do aviso.
      if (before < goal && before + ml >= goal) {
        setReached(true);
        return;
      }
      showToast(`+${ml} ml de água`);
      close();
    } else {
      showToast('Não consegui registar a água. Tenta outra vez.', 'error');
    }
  };

  return (
    <Sheet
      eyebrow="Registar água"
      eyebrowTone="run"
      title={(
        <span className="flex items-baseline gap-1.5">
          <span className="text-[26px] font-black leading-none" style={{ color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{litres(total)}</span>
          <span className="text-[12px] font-bold" style={{ color: 'var(--text-4)' }}>/ {litres(goal)} L hoje</span>
        </span>
      )}
      onClose={close}
      testId="water-sheet"
    >
      {/* A linha de água do dia. */}
      <div
        role="progressbar"
        aria-label="Água de hoje"
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={Math.min(total, goal)}
        className="relative overflow-hidden mt-1"
        style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,.07)' }}
      >
        <span
          className="absolute inset-0"
          style={{
            // scaleX, não width: anima no compositor, sem recalcular o layout.
            transform: `scaleX(${Math.min(1, total / goal)})`,
            transformOrigin: 'left',
            borderRadius: 99,
            background: 'linear-gradient(90deg, color-mix(in srgb, var(--run) 60%, transparent), var(--run))',
            transition: 'transform var(--dur-rings, 700ms) var(--ease-out)',
          }}
        />
      </div>

      {reached ? (
        <button
          type="button"
          data-testid="water-goal-reached"
          onClick={close}
          className="water-goal-moment w-full flex items-start gap-3 mt-4 text-left rounded-[16px]"
          style={{ padding: '14px 15px', background: 'var(--tint-run-bg)', border: '1px solid var(--tint-run-bd)' }}
        >
          <CoachAvatar size={34} mood="happy" breathing />
          <span className="flex-1 min-w-0">
            <span className="block text-[14.5px] font-black leading-[1.25]" style={{ color: 'var(--text-1)' }}>A água de hoje está feita.</span>
            <span className="block text-[12.5px] leading-[1.45] mt-1" style={{ color: 'var(--text-3)' }}>{litres(total)} L. O resto do dia é só manter.</span>
          </span>
        </button>
      ) : (
      <div className="grid grid-cols-3 gap-2 pt-3">
        {AMOUNTS.map((ml) => (
          <button key={ml} type="button" disabled={busy} onClick={() => log(ml)} className="inline-flex items-center justify-center gap-1.5 min-h-[46px] rounded-[11px] text-[13.5px] font-extrabold disabled:opacity-45" style={{ background: 'var(--tint-run-bg)', border: '1px solid var(--tint-run-bd)', color: 'var(--run)' }}>
            <Droplets size={15} /> +{ml} ml
          </button>
        ))}
      </div>
      )}
      <button
        type="button"
        disabled={mutedToday || !profile?.id}
        onClick={async () => { await snoozeWaterReminder(profile.id, 'today'); showToast('Lembretes de água silenciados por hoje.'); }}
        className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] mt-3 rounded-[11px] text-[12.5px] font-bold disabled:opacity-45"
        style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-3)' }}
      >
        <BellOff size={14} /> {mutedToday ? 'Lembretes silenciados hoje' : 'Silenciar lembretes hoje'}
      </button>
    </Sheet>
  );
}
