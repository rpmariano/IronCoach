import React, { useMemo, useState } from 'react';
import { Droplets, BellOff } from 'lucide-react';
import { useAppStore } from '../../store';
import { lisbonTodayISO } from '../../lib/utils';
import { Sheet } from '../shared/Sheet';
import { useToast } from '../shared/ToastProvider';

/* Registar água — vive no FAB desde o redesenho 2026-09 (auditoria, achado
   7: a órbita do Início é só leitura). Três quantidades e o silêncio dos
   lembretes de hoje, que estava no antigo cartão de hidratação. */
const AMOUNTS = [200, 250, 300];
const litres = (ml) => (Math.round((ml / 1000) * 10) / 10).toFixed(1).replace('.', ',');

export default function WaterSheet() {
  const { waterSheetOpen, setWaterSheetOpen, waterLogs, profile, addWaterLog, snoozeWaterReminder } = useAppStore();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const today = lisbonTodayISO();
  const total = useMemo(() => (waterLogs || []).filter((w) => w.date === today).reduce((s, w) => s + (w.amount_ml || 0), 0), [waterLogs, today]);
  const goal = Number(profile?.water_goal_ml) || 2000;
  const mutedToday = profile?.water_reminder_muted_date === today;

  if (!waterSheetOpen) return null;
  const close = () => setWaterSheetOpen(false);

  const log = async (ml) => {
    if (!profile?.id || busy) return;
    setBusy(true);
    const row = await addWaterLog(ml, profile.id);
    setBusy(false);
    if (row) {
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
      <div className="grid grid-cols-3 gap-2 pt-3">
        {AMOUNTS.map((ml) => (
          <button key={ml} type="button" disabled={busy} onClick={() => log(ml)} className="inline-flex items-center justify-center gap-1.5 min-h-[46px] rounded-[11px] text-[13.5px] font-extrabold disabled:opacity-45" style={{ background: 'var(--tint-run-bg)', border: '1px solid var(--tint-run-bd)', color: 'var(--run)' }}>
            <Droplets size={15} /> +{ml} ml
          </button>
        ))}
      </div>
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
