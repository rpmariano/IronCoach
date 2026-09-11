import React, { useState, useMemo, useImperativeHandle, forwardRef } from 'react';
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
/* Ponto 3 do redesenho: 'atencao' era âmbar e 'substituir' laranja — duas
   cores só para dizer a mesma coisa (aviso), e uma delas era a da prova.
   Passam as duas ao coral --warn e distinguem-se pela força da tinta;
   'excedida' é o vermelho do erro, 'ok' o verde do dentro-do-alvo. */
const LEVEL_STYLES = {
  sem_estimativa: { bar: 'var(--text-muted)', color: 'var(--text-4)', chipBg: 'rgba(255,255,255,.05)', chipBd: 'rgba(255,255,255,.10)' },
  ok:             { bar: 'var(--ok)',     color: 'var(--ok)',     chipBg: 'var(--tint-ok-bg)',     chipBd: 'var(--tint-ok-bd)' },
  atencao:        { bar: 'var(--warn)',   color: 'var(--warn)',   chipBg: 'var(--tint-warn-bg)',   chipBd: 'var(--tint-warn-bd)' },
  substituir:     { bar: 'var(--warn)',   color: 'var(--warn)',   chipBg: 'rgba(251,124,77,.22)',  chipBd: 'rgba(251,124,77,.55)' },
  excedida:       { bar: 'var(--danger)', color: 'var(--danger)', chipBg: 'var(--tint-danger-bg)', chipBd: 'var(--tint-danger-bd)' },
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

/* forwardRef: o "Adicionar sapatilhas" do separador Equipamento vive agora na
   ActionBar fixa do Perfil (ponto 2 do handoff) e precisa de abrir o mesmo
   formulário que o botão "Adicionar" do cabeçalho deste cartão. */
const ShoeCabinet = forwardRef(function ShoeCabinet(props, ref) {
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

  useImperativeHandle(ref, () => ({ openNew }), []);

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
          <h3 className="text-sm font-semibold">Armário de Sapatilhas</h3>
        </div>
        <button
          onClick={openNew}
          className="tap-h-44 flex items-center gap-1 text-[11px] font-bold px-3 rounded-full bg-[var(--surface-strong)] border border-[var(--border-glass)] text-[var(--text-2)] hover:bg-white/20 active:scale-95 transition"
        >
          <Plus size={13} /> Adicionar
        </button>
      </div>

      <p className="text-[11px] text-[var(--text-3)] mb-3 leading-relaxed">
        Os km de cada par somam-se sozinhos a partir das corridas em que o
        escolheres. A vida útil mostrada já está ajustada ao teu peso
        {weightKg ? ` (${weightKg} kg)` : ''} — um corredor mais pesado gasta
        a entressola mais depressa.
      </p>

      {active.length === 0 && retired.length === 0 && (
        <div className="rounded-2xl border border-[var(--border-glass)] bg-[var(--surface-glass)] p-6 text-center">
          <Footprints size={24} className="mx-auto mb-2 text-[var(--text-3)]" />
          <p className="text-[11px] text-[var(--text-3)]">
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
          <p className="text-[11px] uppercase font-bold tracking-wide text-[var(--text-3)] mb-2">
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
        <div className="p-6 space-y-4 bg-[var(--bg-sheet)] text-[var(--text-2)]">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Marca" htmlFor="shoe-marca">
              <input
                id="shoe-marca"
                value={form.brand}
                onChange={e => setField('brand', e.target.value)}
                placeholder="Nike"
                className={inputClass}
              />
            </Field>
            <Field label="Modelo" htmlFor="shoe-modelo">
              <input
                id="shoe-modelo"
                value={form.model}
                onChange={e => setField('model', e.target.value)}
                placeholder="Pegasus 40"
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Início de utilização" htmlFor="shoe-inicio-mes">
            <div className="grid grid-cols-2 gap-3">
              <select
                id="shoe-inicio-mes"
                aria-label="Mês de início de utilização"
                value={form.startMonth}
                onChange={e => setField('startMonth', e.target.value)}
                className={inputClass}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={String(i + 1)}>{m}</option>
                ))}
              </select>
              <select
                aria-label="Ano de início de utilização"
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
            htmlFor="shoe-km-iniciais"
          >
            <input
              id="shoe-km-iniciais"
              type="number" min="0" step="1" inputMode="decimal"
              value={form.initial_km}
              onChange={e => setField('initial_km', e.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </Field>

          <div className="space-y-1.5 pt-1 border-t border-[var(--border-glass)]">
            <div className="flex items-center justify-between pt-3">
              <label htmlFor="shoe-vida-util" className="text-xs font-semibold text-[var(--text-3)]">
                Vida útil (km)
              </label>
              <button
                onClick={handleAskCarol}
                disabled={askingCarol || saving}
                className="flex items-center gap-1.5 min-h-[44px] text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition disabled:opacity-50"
                style={{
                  background: 'color-mix(in srgb, var(--mod-coach-to) 15%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--mod-coach-to) 40%, transparent)',
                  color: 'var(--mod-coach-to)',
                }}
              >
                {askingCarol
                  ? <><div className="w-3 h-3 border-2 border-[var(--border-glass-strong)] border-t-current rounded-full animate-spin" /> A perguntar...</>
                  : <><Sparkles size={12} /> Perguntar à Carol</>}
              </button>
            </div>
            <input
              id="shoe-vida-util"
              type="number" min="1" step="1" inputMode="numeric"
              value={form.lifespan_km}
              onChange={e => setForm(f => ({ ...f, lifespan_km: e.target.value, lifespan_source: 'manual' }))}
              placeholder="Ex.: 700"
              className={inputClass}
            />
            <p className="text-[11px] text-[var(--text-3)] leading-relaxed">
              Valor de referência para um corredor de {REFERENCE_WEIGHT_KG} kg — a app
              ajusta-o ao teu peso. A Carol consegue estimá-lo a partir da marca e
              modelo; se não conhecer o par, escreve-o à mão.
            </p>
            {form.lifespan_notes && (
              <p className="text-[11px] italic mt-1 leading-relaxed" style={{ color: 'var(--mod-coach-to)' }}>
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
});

export default ShoeCabinet;

const inputClass = 'w-full bg-[var(--bg-app)] border border-[var(--border-glass-strong)] rounded-xl py-2.5 px-3 text-sm text-[var(--text-2)] outline-none focus:border-[var(--mod-corrida)]/60';

/* `htmlFor` liga a etiqueta ao campo que o Field embrulha — sem isto a
   etiqueta é só visual e o campo chega ao leitor de ecrã sem nome
   (auditoria a11y). Quem usa passa o mesmo id ao controlo em children. */
function Field({ label, hint, htmlFor, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-[var(--text-3)]" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="text-[11px] text-[var(--text-3)]">{hint}</p>}
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
    <div className="rounded-2xl border border-[var(--border-glass)] bg-[var(--surface-glass)] p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-[var(--text-1)] truncate">{shoeLabel(shoe)}</p>
          <p className="text-[11px] text-[var(--text-3)] truncate">
            {[startedOnLabel(shoe.started_on), shoe.shoe_category].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
        {/* Mesmo aposentado, o chip mostra o desgaste com que o par ficou —
            que estão aposentados já se percebe pelo cabeçalho da secção e
            pela opacidade; repetir isso aqui não acrescentava nada. */}
        <span
          className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded border"
          style={{ background: style.chipBg, borderColor: style.chipBd, color: style.color }}
        >
          {WEAR_LEVEL_LABELS[wear.level]}
        </span>
      </div>

      {wear.level === 'sem_estimativa' ? (
        <p className="text-[11px] text-[var(--text-3)]">
          <span className="font-bold text-[var(--text-2)]">{wear.km} km</span> acumulados ·
          <span className="text-[var(--text-3)]"> sem vida útil definida</span>
        </p>
      ) : (
        <>
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="text-[var(--text-3)]">
              <span className="font-bold text-[var(--text-1)]">{wear.km}</span> / {wear.lifespanKm} km
            </span>
            <span className="font-bold" style={{ color: style.color }}>{wear.pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--surface-strong)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${barPct}%`, background: style.bar }}
            />
          </div>
          {!retired && (wear.level === 'substituir' || wear.level === 'excedida') && (
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: style.color }}>
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
      className={`flex-1 flex items-center justify-center gap-1 min-h-[44px] text-[11px] font-semibold py-1.5 rounded-lg border transition active:scale-95 ${
        danger
          ? 'border-[var(--tint-danger-bd)] text-[var(--danger)] hover:bg-[var(--tint-danger-bg)]'
          : 'border-[var(--border-glass)] text-[var(--text-3)] hover:bg-[var(--surface-strong)]'
      }`}
    >
      <Icon size={11} /> {label}
    </button>
  );
}
