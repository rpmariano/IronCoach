import React, { useState } from 'react';
import { Camera, ImagePlus, PencilLine, Check, Loader2 } from 'lucide-react';
import PremiumModal from '../shared/PremiumModal';
import { useAppStore } from '../../store';
import { useToast } from '../shared/ToastProvider';
import { compressImage } from '../../lib/image';
import { confirmPantryFood, deletePantryFood, EDITABLE_NUTRIENTS, savePantryFood } from '../../utils/pantry';

/* Adicionar ou ajustar um alimento da despensa (bug #48, fase C; mockup
   "Despensa e perguntas da Carol", ecrãs 8 e 9). Tudo o que entra é
   confirmado pela Carol — pela descrição, ou a ler o rótulo de uma foto — e
   depois pode ser ajustado à mão: um valor mudado passa a ser o que ela usa
   («assim quando registamos refeição, estes alimentos já não precisam de ser
   analisados, a Carol já os conhece»). */

const toForm = (f) => ({
  name: f?.name ?? '',
  portion_grams: f?.portion_grams != null ? String(Math.round(Number(f.portion_grams))) : '',
  portion_label: f?.portion_label ?? '',
  ...Object.fromEntries(EDITABLE_NUTRIENTS.map(({ key }) => [key, f?.[key] != null ? String(Math.round(Number(f[key]) * 10) / 10) : ''])),
});

const fmtDate = (iso) => (iso ? new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' }).format(new Date(iso)).replace('.', '') : null);

export default function PantryFoodSheet({ food = null, onClose }) {
  const { profile, loadPantry } = useAppStore();
  const { showToast } = useToast();
  const editing = !!food;
  const [way, setWay] = useState('descrever');
  const [description, setDescription] = useState('');
  const [confirmed, setConfirmed] = useState(food); // o que a Carol devolveu (ou o gravado)
  const [form, setForm] = useState(food ? toForm(food) : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ask = async (payload) => {
    setBusy(true);
    setError('');
    try {
      const f = await confirmPantryFood(payload);
      setConfirmed(f);
      setForm(toForm(f));
    } catch (e) {
      setError(e?.message || 'Não consegui ler este alimento.');
    } finally {
      setBusy(false);
    }
  };

  const onPhotos = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, 3);
    e.target.value = '';
    if (!files.length) return;
    const images = [];
    for (const file of files) {
      try { images.push((await compressImage(file)).base64); } catch { /* foto ilegível: segue sem ela */ }
    }
    if (images.length) ask({ images, description: description.trim() || null });
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await savePantryFood({
        userId: profile?.id,
        values: { ...confirmed, ...form },
        confirmed,
        existing: food,
        source: confirmed?.from_label ? 'rotulo' : 'manual',
      });
      await loadPantry?.();
      showToast(editing ? 'Alimento atualizado' : 'Guardado na despensa');
      onClose();
    } catch (e) {
      setError(e?.message || 'Não consegui guardar.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deletePantryFood(food.id);
      await loadPantry?.();
      showToast('Tirado da despensa');
      onClose();
    } catch (e) {
      setError(e?.message || 'Não consegui tirar.');
      setBusy(false);
    }
  };

  const field = (key, label, props = {}) => (
    <label className="block">
      <span className="block text-[11px] mb-1.5" style={{ color: 'var(--text-3)' }}>{label}</span>
      <input
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="w-full min-h-[44px] rounded-[10px] px-3 text-[15px] font-extrabold outline-none"
        style={{ border: '1px solid var(--border-glass)', background: 'var(--surface-soft)', color: 'var(--text-1)' }}
        {...props}
      />
    </label>
  );

  return (
    <PremiumModal isOpen onClose={onClose} title={editing ? food.name : 'Adicionar à despensa'} subtitle={editing ? undefined : 'A Carol confirma os valores; tu podes ajustar.'} theme="nutri" variant="bottom-sheet" maxWidth="max-w-md">
      <div className="px-5 py-4 space-y-4" data-testid="pantry-food-sheet">
        {!editing && !form && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[['descrever', 'Descrever', PencilLine], ['foto', 'Foto ao rótulo', Camera], ['galeria', 'Da galeria', ImagePlus]].map(([key, label, Icon]) => {
                const on = way === key;
                const style = on
                  ? { border: '1px solid var(--nutrition)', background: 'var(--tint-nutrition-bg)', color: 'var(--text-1)' }
                  : { border: '1px solid var(--border-glass)', background: 'rgba(255,255,255,.04)', color: 'var(--text-2)' };
                const inner = <><Icon size={22} /><span>{label}</span></>;
                const cls = 'min-h-[80px] rounded-2xl flex flex-col items-center justify-center gap-2 text-[12.5px] font-extrabold cursor-pointer';
                return key === 'descrever' ? (
                  <button key={key} type="button" aria-pressed={on} onClick={() => setWay(key)} className={cls} style={style}>{inner}</button>
                ) : (
                  <label key={key} className={cls} style={style}>
                    <input type="file" accept="image/*" className="hidden" multiple={key === 'galeria'} {...(key === 'foto' ? { capture: 'environment' } : {})} onChange={(e) => { setWay(key); onPhotos(e); }} disabled={busy} />
                    {inner}
                  </label>
                );
              })}
            </div>
            <label className="block">
              <span className="block text-[11px] mb-1.5" style={{ color: 'var(--text-3)' }}>O que é, e a porção que costumas comer</span>
              <textarea
                rows={2}
                maxLength={300}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex.: pão de mistura do Lidl, uma fatia de 40 g"
                className="w-full rounded-xl px-3 py-2.5 text-[15px] outline-none resize-none"
                style={{ border: '1px solid var(--border-glass)', background: 'var(--surface-soft)', color: 'var(--text-1)' }}
              />
            </label>
            <button
              type="button"
              onClick={() => ask({ description: description.trim() })}
              disabled={busy || !description.trim()}
              className="w-full min-h-[48px] rounded-xl text-[14px] font-black inline-flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'var(--coach)', color: '#062a33' }}
            >
              {busy ? <><Loader2 size={16} className="animate-spin" /> A Carol está a ler…</> : 'Confirmar com a Carol'}
            </button>
          </>
        )}

        {form && (
          <div className="p-3.5 rounded-2xl space-y-3" style={{ background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)' }}>
            <p className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--coach)' }}>
              <Check size={14} />
              {editing
                ? (food.edited_by_athlete ? 'Ajustado por ti' : `Confirmado pela Carol${fmtDate(food.updated_at) ? ` a ${fmtDate(food.updated_at)}` : ''}`)
                : `${confirmed?.from_label ? 'Rótulo lido' : 'Confirmado'} pela Carol · ajusta se precisares`}
            </p>
            {field('name', 'Nome', { maxLength: 120 })}
            <div className="grid grid-cols-2 gap-2">
              {field('portion_grams', 'Porção habitual (g)', { inputMode: 'decimal' })}
              {field('portion_label', 'Chama-se (opcional)', { placeholder: '1 fatia', maxLength: 40 })}
            </div>
            <div>
              <span className="block text-[11px] mb-1.5" style={{ color: 'var(--text-3)' }}>Por 100 g</span>
              <div className="grid grid-cols-4 gap-1.5">
                {EDITABLE_NUTRIENTS.map(({ key, label }) => (
                  <label key={key} className="block text-center">
                    <input
                      aria-label={`${label} por 100 g`}
                      inputMode="decimal"
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="w-full min-h-[44px] rounded-[10px] text-center text-[15px] font-extrabold outline-none"
                      style={{ border: '1px solid var(--border-glass)', background: 'var(--surface-soft)', color: 'var(--text-1)' }}
                    />
                    <span className="block text-[10.5px] mt-1" style={{ color: 'var(--text-4)' }}>{label}</span>
                  </label>
                ))}
              </div>
            </div>
            {editing && (
              <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Um valor que mudes passa a ser o que a Carol usa. As refeições já gravadas não mudam.
              </p>
            )}
          </div>
        )}

        {error && <p role="alert" className="text-[12.5px]" style={{ color: 'var(--danger)' }}>{error}</p>}

        {form && (
          <div className="space-y-2">
            <button type="button" onClick={save} disabled={busy || !form.name.trim()} className="w-full min-h-[48px] rounded-xl text-[14px] font-black disabled:opacity-50" style={{ background: 'var(--nutrition)', color: 'var(--nutrition-ink)' }}>
              {busy ? 'A guardar…' : (editing ? 'Guardar alterações' : 'Guardar')}
            </button>
            {editing && (
              <button type="button" onClick={remove} disabled={busy} className="w-full min-h-[46px] rounded-xl text-[13.5px] font-extrabold" style={{ border: '1px solid var(--tint-danger-bd)', color: 'var(--danger)' }}>
                Tirar da despensa
              </button>
            )}
          </div>
        )}
      </div>
    </PremiumModal>
  );
}
