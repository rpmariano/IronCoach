import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Users, Check, X, HelpCircle, Trash2 } from 'lucide-react';
import { listTeams, createTeam, updateTeam, deleteTeam } from '../../../utils/cupAdmin';

/* Clubes de uma edição (specs/trofeu.md §6.3: nome, nome curto, kind,
   eligible_final), 2026-09-26. O clube fica na inscrição, não no perfil
   (§4.2) — o admin só gere o catálogo de clubes desta edição, nunca vê
   inscrições (RLS "own rows", sem "admin read all", §3.2). */

const KIND_LABEL = { clube: 'Clube', individual: 'Individual' };

function EligibleBadge({ value }) {
  if (value === true) return <span className="flex items-center gap-1 text-[11px] font-bold text-[var(--ok-soft)]"><Check size={12} /> Elegível</span>;
  if (value === false) return <span className="flex items-center gap-1 text-[11px] font-bold text-[var(--danger)]"><X size={12} /> Não elegível</span>;
  return <span className="flex items-center gap-1 text-[11px] font-bold text-[var(--warn)]"><HelpCircle size={12} /> Por confirmar</span>;
}

function emptyForm() {
  return { name: '', short_name: '', kind: 'clube', eligible_final: '' };
}

function eligibleFromForm(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
}

export default function TeamsPanel({ edition, readOnly }) {
  const [teams, setTeams] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null); // team id | 'new' | null
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listTeams(edition.id);
    if (!res.ok) { setError(res.error?.message || 'Falha ao carregar clubes.'); setLoading(false); return; }
    setTeams(res.data);
    setLoading(false);
  }, [edition.id]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (team) => {
    setEditingId(team.id);
    setForm({
      name: team.name || '',
      short_name: team.short_name || '',
      kind: team.kind || 'clube',
      eligible_final: team.eligible_final === true ? 'true' : team.eligible_final === false ? 'false' : '',
    });
    setSaveError(null);
  };

  const startNew = () => {
    setEditingId('new');
    setForm(emptyForm());
    setSaveError(null);
  };

  const cancelEdit = () => { setEditingId(null); setSaveError(null); };

  const handleSave = async () => {
    if (!form.name.trim()) { setSaveError('O nome é obrigatório.'); return; }
    setSaving(true);
    setSaveError(null);
    const patch = {
      name: form.name.trim(),
      short_name: form.short_name.trim() || null,
      kind: form.kind,
      eligible_final: eligibleFromForm(form.eligible_final),
    };
    const res = editingId === 'new' ? await createTeam(edition.id, patch) : await updateTeam(editingId, patch);
    setSaving(false);
    if (!res.ok) { setSaveError(res.error?.message || 'Falha ao guardar clube.'); return; }
    setEditingId(null);
    load();
  };

  const handleDelete = async (team) => {
    setDeletingId(team.id);
    setDeleteError((e) => ({ ...e, [team.id]: null }));
    const res = await deleteTeam(team.id);
    setDeletingId(null);
    if (!res.ok) { setDeleteError((e) => ({ ...e, [team.id]: res.error?.message || 'Falha ao apagar.' })); return; }
    load();
  };

  if (loading) return <p className="text-xs text-[var(--text-3)] text-center py-8">A carregar clubes...</p>;
  if (error) return <p className="text-xs text-[var(--danger)] text-center py-8">{error}</p>;

  return (
    <div className="space-y-2.5 fade-in">
      {!readOnly && editingId !== 'new' && (
        <button
          onClick={startNew}
          className="tap-h-44 w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--text-2)] border border-dashed border-[var(--border-glass-strong)] rounded-xl py-2.5"
        >
          <Plus size={14} /> Novo clube
        </button>
      )}

      {editingId === 'new' && (
        <TeamFormCard form={form} setForm={setForm} onSave={handleSave} onCancel={cancelEdit} saving={saving} error={saveError} title="Novo clube" />
      )}

      {teams.length === 0 && editingId !== 'new' && (
        <div className="card rounded-2xl p-8 text-center bg-[var(--surface-soft)] border border-[var(--border-glass)] text-[var(--text-3)] text-xs">
          Sem clubes no catálogo desta edição.
        </div>
      )}

      {teams.map((t) => (
        editingId === t.id ? (
          <TeamFormCard key={t.id} form={form} setForm={setForm} onSave={handleSave} onCancel={cancelEdit} saving={saving} error={saveError} title="Editar clube" />
        ) : (
          <div key={t.id} className="card rounded-2xl p-4 bg-[var(--surface-glass)] border border-[var(--border-glass)] flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-1)] flex items-center gap-1.5">
                <Users size={12} className="text-[var(--text-3)] shrink-0" /> {t.name}
                {t.short_name && <span className="text-[var(--text-3)] font-normal">({t.short_name})</span>}
              </p>
              <p className="text-[11px] text-[var(--text-3)]">{KIND_LABEL[t.kind] || t.kind}</p>
              {deleteError[t.id] && <p className="text-[11px] text-[var(--danger)] mt-1">{deleteError[t.id]}</p>}
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <EligibleBadge value={t.eligible_final} />
              {!readOnly && (
                <>
                  <button onClick={() => startEdit(t)} className="tap-h-44 text-[11px] font-semibold text-[var(--text-2)] bg-[var(--surface-strong)] px-2.5 rounded-lg">
                    Editar
                  </button>
                  <button onClick={() => handleDelete(t)} disabled={deletingId === t.id} className="tap-h-44 shrink-0 text-[var(--danger)] px-1" aria-label={`Apagar ${t.name}`}>
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        )
      ))}
    </div>
  );
}

function TeamFormCard({ form, setForm, onSave, onCancel, saving, error, title }) {
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const inputCls = 'w-full bg-[var(--bg-app)] border border-[var(--border-glass-strong)] rounded-xl py-2 px-3 text-xs text-[var(--text-2)] outline-none';
  return (
    <div className="card rounded-2xl p-4 bg-[var(--surface-glass)] border border-[var(--border-glass-strong)] space-y-2.5">
      <p className="text-[11px] font-bold uppercase text-[var(--text-3)]">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        <input aria-label="Nome do clube" className={inputCls} value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="Nome" />
        <input aria-label="Nome curto do clube" className={inputCls} value={form.short_name} onChange={(e) => setField('short_name', e.target.value)} placeholder="Nome curto" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select aria-label="Tipo de clube" className={inputCls} value={form.kind} onChange={(e) => setField('kind', e.target.value)}>
          <option value="clube">Clube</option>
          <option value="individual">Individual</option>
        </select>
        <select aria-label="Elegibilidade para a final" className={inputCls} value={form.eligible_final} onChange={(e) => setField('eligible_final', e.target.value)}>
          <option value="">Por confirmar</option>
          <option value="true">Elegível</option>
          <option value="false">Não elegível</option>
        </select>
      </div>
      {error && <p className="text-[11px] text-[var(--danger)]">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="tap-h-44 flex-1 text-xs font-semibold text-[var(--text-3)] bg-[var(--surface-strong)] rounded-xl">Cancelar</button>
        <button onClick={onSave} disabled={saving} className="tap-h-44 flex-1 text-xs font-semibold text-[var(--race-ink)] bg-[var(--race)] rounded-xl">
          {saving ? 'A guardar…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
