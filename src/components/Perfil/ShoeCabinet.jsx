import React, { useState, useMemo } from 'react';
import { Footprints, Plus, Pencil, Trash2, Archive, RotateCcw, Sparkles, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../../store';
import { invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import { useToast } from '../shared/ToastProvider';
import PremiumModal from '../shared/PremiumModal';
import ConfirmDeleteModal from '../shared/ConfirmDeleteModal';
import Button from '../shared/Button';
import {
  wearStatus, shoeLabel, WEAR_LEVEL_LABELS, REFERENCE_WEIGHT_KG,
} from '../../utils/shoes';

// Tom de cada nível de desgaste. 'ok' é deliberadamente discreto — a maior
// parte dos pares está em bom estado e não precisa de chamar a atenção.
const LEVEL_STYLES = {
  sem_estimativa: { bar: '#64748b', text: 'text-slate-400', chip: 'bg-slate-800 text-slate-400 border-slate-700' },
  ok:             { bar: '#10b981', text: 'text-emerald-400', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  atencao:        { bar: '#f59e0b', text: 'text-amber-400', chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  substituir:     { bar: '#f97316', text: 'text-orange-400', chip: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  excedida:       { bar: '#ef4444', text: 'text-red-400', chip: 'bg-red-500/15 text-red-300 border-red-500/30' },
};

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const currentYear = new Date().getFullYear();
// 15 anos para trás chega para qualquer par que ainda esteja em uso.
const YEARS = Array.from({ length: 16 }, (_, i) => currentYear - i);

const emptyForm = {
  brand: '', model: '',
  startMonth: String(new Date().getMonth() + 1),
  startYear: String(currentYear),
  initial_km: '',
  lifespan_km: '',
  lifespan_source: null,
  lifespan_notes: '',
  shoe_category: '',
};

function startedOnLabel(iso) {
  if (!iso) return null;
  const [y, m] = iso.split('-');
  const monthName = MONTHS[Number(m) - 1];
  return monthName ? `${monthName} de ${y}` : y;
}

export default function ShoeCabinet() {
  const { shoes, runs, profile, addShoe, updateShoe, deleteShoe } = useAppStore();
  const { showToast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [askingCarol, setAskingCarol] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const weightKg = profile?.weight_kg;

  const { active, retired } = useMemo(() => {
    const withWear = (shoes || []).map(s => ({ shoe: s, wear: wearStatus(s, runs || [], weightKg) }));
    return {
      active: withWear.filter(x => x.shoe.status !== 'aposentada')
        .sort((a, b) => (b.wear.pct ?? -1) - (a.wear.pct ?? -1)),
      retired: withWear.filter(x => x.shoe.status === 'aposentada'),
    };
  }, [shoes, runs, weightKg]);

  const setField = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (shoe) => {
    const [y, m] = (shoe.started_on || '').split('-');
    setEditingId(shoe.id);
    setForm({
      brand: shoe.brand || '',
      model: shoe.model || '',
      startMonth: m ? String(Number(m)) : String(new Date().getMonth() + 1),
      startYear: y || String(currentYear),
      initial_km: shoe.initial_km != null ? String(shoe.initial_km) : '',
      lifespan_km: shoe.lifespan_km != null ? String(shoe.lifespan_km) : '',
      lifespan_source: shoe.lifespan_source || null,
      lifespan_notes: shoe.lifespan_notes || '',
      shoe_category: shoe.shoe_category || '',
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving || askingCarol) return;
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleAskCarol = async () => {
    const brand = form.brand.trim();
    const model = form.model.trim();
    if (!brand || !model) {
      showToast('Escreve a marca e o modelo primeiro.', 'error');
      return;
    }
    setAskingCarol(true);
    try {
      const { data, error } = await invokeEdgeFunctionWithTimeout(
        'estimate-shoe-lifespan', { body: { brand, model } }, 35000,
      );
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);

      if (!data?.estimate) {
        // A Carol não reconheceu o modelo — não é um erro, é uma resposta.
        // O atleta escreve o valor à mão e segue a vida.
        showToast(data?.message || 'A Carol não conhece este modelo.', 'error');
        return;
      }
      setForm(f => ({
        ...f,
        lifespan_km: String(data.estimate.lifespan_km),
        lifespan_source: 'carol',
        lifespan_notes: data.estimate.rationale || '',
        shoe_category: data.estimate.category || '',
      }));
      showToast('A Carol estimou a vida útil deste modelo.');
    } catch (err) {
      console.error('[ShoeCabinet] Falha a pedir estimativa:', err);
      showToast(err.message || 'Não consegui falar com a Carol. Escreve o valor à mão.', 'error');
    } finally {
      setAskingCarol(false);
    }
  };

  const handleSave = async () => {
    const brand = form.brand.trim();
    const model = form.model.trim();
    if (!brand || !model) {
      showToast('A marca e o modelo são obrigatórios.', 'error');
      return;
    }

    const lifespanRaw = form.lifespan_km.trim();
    const lifespan = lifespanRaw === '' ? null : parseInt(lifespanRaw, 10);
    if (lifespanRaw !== '' && (!Number.isFinite(lifespan) || lifespan <= 0)) {
      showToast('A vida útil tem de ser um número de km positivo.', 'error');
      return;
    }

    const initialRaw = form.initial_km.trim();
    const initial = initialRaw === '' ? 0 : parseFloat(initialRaw);
    if (!Number.isFinite(initial) || initial < 0) {
      showToast('Os km iniciais têm de ser um número igual ou maior que zero.', 'error');
      return;
    }

    const payload = {
      brand, model,
      started_on: `${form.startYear}-${String(form.startMonth).padStart(2, '0')}-01`,
      initial_km: initial,
      lifespan_km: lifespan,
      // Se o atleta mexeu no número depois de a Carol responder, a origem
      // passa a ser dele — senão o cartão continuava a dizer "estimado pela
      // Carol" por cima de um valor que ela nunca deu.
      lifespan_source: lifespan == null ? null : (form.lifespan_source || 'manual'),
      lifespan_notes: form.lifespan_notes.trim() || null,
      shoe_category: form.shoe_category.trim() || null,
    };

    setSaving(true);
    const ok = editingId ? await updateShoe(editingId, payload) : await addShoe(payload);
    setSaving(false);

    if (!ok) {
      showToast('Não consegui guardar as sapatilhas. Tenta novamente.', 'error');
      return;
    }
    showToast(editingId ? 'Sapatilhas atualizadas' : 'Sapatilhas adicionadas ao armário');
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleToggleRetired = async (shoe) => {
    const retiring = shoe.status !== 'aposentada';
    const ok = await updateShoe(shoe.id, {
      status: retiring ? 'aposentada' : 'ativa',
      retired_at: retiring ? new Date().toISOString() : null,
    });
    if (ok) showToast(retiring ? 'Par aposentado' : 'Par de volta ao ativo');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const ok = await deleteShoe(deleteTarget.id);
    setDeleting(false);
    if (ok) {
      showToast('Par removido do armário');
      setDeleteTarget(null);
    } else {
      showToast('Não consegui remover o par.', 'error');
    }
  };

  return (
    <div className="module-card-contrast">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Footprints size={16} className="text-[var(--mod-corrida)]" />
          <h2 className="text-sm font-semibold">Armário de Sapatilhas</h2>
        </div>
        <button
          onClick={openNew}
          className="tap-h-44 flex items-center gap-1 text-[11px] font-bold px-3 rounded-full bg-white/10 border border-white/10 text-slate-200 hover:bg-white/20 active:scale-95 transition"
        >
          <Plus size={13} /> Adicionar
        </button>
      </div>

      <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
        Os km de cada par somam-se sozinhos a partir das corridas em que o
        escolheres. A vida útil mostrada já está ajustada ao teu peso
        {weightKg ? ` (${weightKg} kg)` : ''} — um corredor mais pesado gasta
        a entressola mais depressa.
      </p>

      {active.length === 0 && retired.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <Footprints size={24} className="mx-auto mb-2 text-slate-600" />
          <p className="text-[11px] text-slate-500">
            Ainda não tens sapatilhas no armário. Adiciona um par para
            começares a contar os km.
          </p>
        </div>
      )}

      <div className="space-y-2.5">
        {active.map(({ shoe, wear }) => (
          <ShoeRow
            key={shoe.id}
            shoe={shoe}
            wear={wear}
            onEdit={() => openEdit(shoe)}
            onToggleRetired={() => handleToggleRetired(shoe)}
            onDelete={() => setDeleteTarget(shoe)}
          />
        ))}
      </div>

      {retired.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase font-bold tracking-wide text-slate-600 mb-2">
            Aposentadas
          </p>
          <div className="space-y-2.5 opacity-60">
            {retired.map(({ shoe, wear }) => (
              <ShoeRow
                key={shoe.id}
                shoe={shoe}
                wear={wear}
                onEdit={() => openEdit(shoe)}
                onToggleRetired={() => handleToggleRetired(shoe)}
                onDelete={() => setDeleteTarget(shoe)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Formulário (novo / editar) ─────────────────────────────────── */}
      <PremiumModal
        isOpen={formOpen}
        onClose={closeForm}
        title={editingId ? 'Editar sapatilhas' : 'Novas sapatilhas'}
        subtitle={editingId ? shoeLabel(form) : 'Adicionar um par ao armário'}
        icon={Footprints}
        theme="run"
        variant="dialog"
        maxWidth="max-w-lg"
      >
        <div className="p-6 space-y-4 bg-neutral-900 text-slate-200">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Marca">
              <input
                value={form.brand}
                onChange={e => setField('brand', e.target.value)}
                placeholder="Nike"
                className={inputClass}
              />
            </Field>
            <Field label="Modelo">
              <input
                value={form.model}
                onChange={e => setField('model', e.target.value)}
                placeholder="Pegasus 40"
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Início de utilização">
            <div className="grid grid-cols-2 gap-3">
              <select
                value={form.startMonth}
                onChange={e => setField('startMonth', e.target.value)}
                className={inputClass}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={String(i + 1)}>{m}</option>
                ))}
              </select>
              <select
                value={form.startYear}
                onChange={e => setField('startYear', e.target.value)}
                className={inputClass}
              >
                {YEARS.map(y => <option key={y} value={String(y)}>{y}</option>)}
              </select>
            </div>
          </Field>

          <Field
            label="Km que já tinham ao registar"
            hint="Deixa a zero se o par é novo."
          >
            <input
              type="number" min="0" step="1" inputMode="decimal"
              value={form.initial_km}
              onChange={e => setField('initial_km', e.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </Field>

          <div className="space-y-1.5 pt-1 border-t border-neutral-800">
            <div className="flex items-center justify-between pt-3">
              <label className="text-xs font-semibold text-slate-300">
                Vida útil (km)
              </label>
              <button
                onClick={handleAskCarol}
                disabled={askingCarol || saving}
                className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition disabled:opacity-50"
                style={{
                  background: 'color-mix(in srgb, var(--mod-coach-to) 15%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--mod-coach-to) 40%, transparent)',
                  color: 'var(--mod-coach-to)',
                }}
              >
                {askingCarol
                  ? <><div className="w-3 h-3 border-2 border-slate-600 border-t-current rounded-full animate-spin" /> A perguntar...</>
                  : <><Sparkles size={12} /> Perguntar à Carol</>}
              </button>
            </div>
            <input
              type="number" min="1" step="1" inputMode="numeric"
              value={form.lifespan_km}
              onChange={e => setForm(f => ({ ...f, lifespan_km: e.target.value, lifespan_source: 'manual' }))}
              placeholder="Ex.: 700"
              className={inputClass}
            />
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Valor de referência para um corredor de {REFERENCE_WEIGHT_KG} kg — a app
              ajusta-o ao teu peso. A Carol consegue estimá-lo a partir da marca e
              modelo; se não conhecer o par, escreve-o à mão.
            </p>
            {form.lifespan_notes && (
              <p className="text-[10px] italic mt-1 leading-relaxed" style={{ color: 'var(--mod-coach-to)' }}>
                {form.lifespan_notes}
              </p>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="light" onClick={closeForm} disabled={saving} className="flex-1">
              Cancelar
            </Button>
            <Button
              variant="module"
              moduleColor="var(--mod-corrida)"
              onClick={handleSave}
              disabled={saving || askingCarol}
              isLoading={saving}
              className="flex-1"
            >
              {saving ? 'A guardar...' : 'Guardar'}
            </Button>
          </div>
        </div>
      </PremiumModal>

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        isDeleting={deleting}
        title="Remover sapatilhas"
        message={
          deleteTarget
            ? `Remover "${shoeLabel(deleteTarget)}" do armário? As corridas que fizeste com elas mantêm-se — apenas deixam de ter par associado. Se só as queres tirar da rotação, aposenta-as em vez de as apagares.`
            : ''
        }
      />
    </div>
  );
}

const inputClass = 'w-full bg-neutral-950 border border-neutral-700 rounded-xl py-2.5 px-3 text-sm text-slate-200 outline-none focus:border-[var(--mod-corrida)]/60';

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-300">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
    </div>
  );
}

function ShoeRow({ shoe, wear, onEdit, onToggleRetired, onDelete }) {
  const style = LEVEL_STYLES[wear.level] || LEVEL_STYLES.sem_estimativa;
  const retired = shoe.status === 'aposentada';
  // A barra é o desgaste real, mas visualmente trava nos 100% — passar disso
  // transbordava o contentor e deixava de se ler como proporção.
  const barPct = wear.pct == null ? 0 : Math.min(100, wear.pct);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-slate-100 truncate">{shoeLabel(shoe)}</p>
          <p className="text-[10px] text-slate-500 truncate">
            {[startedOnLabel(shoe.started_on), shoe.shoe_category].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
        {/* Mesmo aposentado, o chip mostra o desgaste com que o par ficou —
            que estão aposentados já se percebe pelo cabeçalho da secção e
            pela opacidade; repetir isso aqui não acrescentava nada. */}
        <span className={`shrink-0 text-[9px] font-bold px-2 py-0.5 rounded border ${style.chip}`}>
          {WEAR_LEVEL_LABELS[wear.level]}
        </span>
      </div>

      {wear.level === 'sem_estimativa' ? (
        <p className="text-[11px] text-slate-400">
          <span className="font-bold text-slate-200">{wear.km} km</span> acumulados ·
          <span className="text-slate-500"> sem vida útil definida</span>
        </p>
      ) : (
        <>
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="text-slate-300">
              <span className="font-bold text-slate-100">{wear.km}</span> / {wear.lifespanKm} km
            </span>
            <span className={`font-bold ${style.text}`}>{wear.pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${barPct}%`, background: style.bar }}
            />
          </div>
          {!retired && (wear.level === 'substituir' || wear.level === 'excedida') && (
            <p className={`flex items-start gap-1.5 text-[10px] leading-relaxed ${style.text}`}>
              <AlertTriangle size={12} className="shrink-0 mt-px" />
              {wear.level === 'excedida'
                ? `Já passaste a vida útil estimada em ${Math.abs(wear.remainingKm)} km. Correr com a entressola gasta aumenta o risco de lesão — está na hora de trocar.`
                : `Faltam cerca de ${wear.remainingKm} km para o fim da vida útil. Começa a pensar no par seguinte.`}
            </p>
          )}
        </>
      )}

      <div className="flex gap-1.5 pt-0.5">
        <RowAction icon={Pencil} label="Editar" onClick={onEdit} />
        <RowAction
          icon={retired ? RotateCcw : Archive}
          label={retired ? 'Reativar' : 'Aposentar'}
          onClick={onToggleRetired}
        />
        <RowAction icon={Trash2} label="Remover" onClick={onDelete} danger />
      </div>
    </div>
  );
}

function RowAction({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold py-1.5 rounded-lg border transition active:scale-95 ${
        danger
          ? 'border-red-500/25 text-red-400/90 hover:bg-red-500/10'
          : 'border-white/10 text-slate-300 hover:bg-white/10'
      }`}
    >
      <Icon size={11} /> {label}
    </button>
  );
}
