import React, { useState } from 'react';
import { Plus, Trash2, CalendarClock, ShieldCheck } from 'lucide-react';
import PremiumModal from '../../shared/PremiumModal';
import Button from '../../shared/Button';
import {
  createRound, updateRound, deleteRound,
  previewRoundChange, confirmRoundChange,
  createCourse, updateCourse, deleteCourse,
  createRaceSeries,
} from '../../../utils/cupAdmin';

/* O formulário de UMA jornada (specs/trofeu.md §6.2), 2026-09-26.

   DUAS VIAS DE GRAVAR, DE PROPÓSITO. Nome, série, local, terreno, prazo e
   links gravam-se num "Guardar" normal — não movem provas. Data e
   date_status são a exceção: "Confirmar jornada" é um botão à parte e pede
   SEMPRE a pré-visualização (preview_round_change) antes de gravar, porque
   podem criar, mover ou apagar `race_events` de quem já disse "Vou" (§6.2).
   updateRound() recusa um patch com essas duas chaves — não há atalho aqui
   que as grave por engano.

   APAGAR TAMBÉM MOSTRA O IMPACTO (revisão da Fase 1, 2026-09-26). Apagar uma
   jornada tira a prova a todos os que disseram "Vou" e marca race_lost_at
   nos planos deles — o mesmo risco de "mover uma jornada de muitos atletas"
   (§9). Antes de apagar pede-se preview_round_change com date_status
   'cancelada' (o efeito nas provas é o mesmo) e sugere-se cancelar: uma
   jornada cancelada fica no histórico. */

const DATE_STATUS = [
  { value: 'provavel', label: 'Provável' },
  { value: 'confirmada', label: 'Confirmada' },
  { value: 'adiada', label: 'Adiada' },
  { value: 'cancelada', label: 'Cancelada' },
];
const TERRAIN = [
  { value: '', label: '— não sei —' },
  { value: 'estrada', label: 'Estrada' },
  { value: 'corta_mato', label: 'Corta-mato' },
  { value: 'pista', label: 'Pista' },
  { value: 'trail', label: 'Trail' },
];
const DISTANCE_STATUS = [
  { value: 'provisoria', label: 'Provisória' },
  { value: 'oficial', label: 'Oficial' },
];

const BAND_LABEL = {
  atletas_vou: 'Atletas com "Vou"',
  provas_movidas: 'Provas movidas',
  provas_criadas: 'Provas criadas',
  provas_apagadas: 'Provas apagadas',
  colisoes: 'Colisões com principais',
  planos_ajustados: 'Planos aceites a ajustar',
};

const inputCls = 'w-full bg-[var(--bg-app)] border border-[var(--border-glass-strong)] rounded-xl py-2 px-3 text-xs text-[var(--text-2)] outline-none disabled:opacity-60';
const labelCls = 'text-[11px] font-semibold text-[var(--text-3)]';

function toDateInput(v) { return v ? String(v).slice(0, 10) : ''; }
function toDatetimeLocal(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromDatetimeLocal(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function fieldsFromRound(round, nextRoundNo) {
  return {
    round_no: round?.round_no ?? nextRoundNo ?? 1,
    name: round?.name ?? '',
    series_id: round?.series_id ?? '',
    date: toDateInput(round?.date),
    date_status: round?.date_status ?? 'provavel',
    location: round?.location ?? '',
    terrain: round?.terrain ?? '',
    entry_deadline_at: toDatetimeLocal(round?.entry_deadline_at),
    results_url: round?.results_url ?? '',
    team_results_url: round?.team_results_url ?? '',
  };
}

function CoursesEditor({ roundId, courses, onChange, readOnly }) {
  const [rows, setRows] = useState(() => courses.map((c) => ({ ...c, _saving: false, _error: null })));
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ code: '', name: '', distance_m: '', distance_status: 'provisoria', start_time: '' });
  const [addError, setAddError] = useState(null);
  const [addSaving, setAddSaving] = useState(false);

  const patchRow = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const handleSaveRow = async (row) => {
    patchRow(row.id, { _saving: true, _error: null });
    const res = await updateCourse(row.id, {
      code: row.code,
      name: row.name || null,
      distance_m: row.distance_m ? Number(row.distance_m) : null,
      distance_status: row.distance_status,
      start_time: row.start_time || null,
    });
    if (!res.ok) { patchRow(row.id, { _saving: false, _error: res.error?.message || 'Falha ao guardar.' }); return; }
    patchRow(row.id, { _saving: false, _error: null });
    onChange?.();
  };

  const handleDeleteRow = async (row) => {
    patchRow(row.id, { _saving: true, _error: null });
    const res = await deleteCourse(row.id);
    if (!res.ok) { patchRow(row.id, { _saving: false, _error: res.error?.message || 'Falha ao apagar.' }); return; }
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    onChange?.();
  };

  const handleAdd = async () => {
    if (!draft.code.trim()) { setAddError('O código do percurso é obrigatório.'); return; }
    setAddSaving(true);
    setAddError(null);
    const res = await createCourse(roundId, {
      code: draft.code.trim(),
      name: draft.name.trim() || null,
      distance_m: draft.distance_m ? Number(draft.distance_m) : null,
      distance_status: draft.distance_status,
      start_time: draft.start_time || null,
    });
    setAddSaving(false);
    if (!res.ok) { setAddError(res.error?.message || 'Falha ao criar percurso.'); return; }
    setRows((rs) => [...rs, { ...res.data, _saving: false, _error: null }]);
    setDraft({ code: '', name: '', distance_m: '', distance_status: 'provisoria', start_time: '' });
    setAdding(false);
    onChange?.();
  };

  return (
    <div className="space-y-2">
      <p className={labelCls}>Percursos</p>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-[var(--border-glass)] p-2.5 space-y-1.5">
            <div className="grid grid-cols-4 gap-1.5">
              <input aria-label={`Código do percurso ${row.code}`} className={inputCls} value={row.code}
                onChange={(e) => patchRow(row.id, { code: e.target.value })} disabled={readOnly} placeholder="Código" />
              <input aria-label="Metros" className={inputCls} type="number" min="1" value={row.distance_m ?? ''}
                onChange={(e) => patchRow(row.id, { distance_m: e.target.value })} disabled={readOnly} placeholder="Metros" />
              <select aria-label="Estado da distância" className={inputCls} value={row.distance_status || 'provisoria'}
                onChange={(e) => patchRow(row.id, { distance_status: e.target.value })} disabled={readOnly}>
                {DISTANCE_STATUS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input aria-label="Hora" className={inputCls} type="time" value={row.start_time || ''}
                onChange={(e) => patchRow(row.id, { start_time: e.target.value })} disabled={readOnly} />
            </div>
            <input aria-label="Nome do percurso" className={inputCls} value={row.name || ''}
              onChange={(e) => patchRow(row.id, { name: e.target.value })} disabled={readOnly} placeholder="Nome (opcional — só aparece com mais de um percurso)" />
            {row._error && <p className="text-[11px] text-[var(--danger)]">{row._error}</p>}
            {!readOnly && (
              <div className="flex gap-1.5 justify-end">
                <button onClick={() => handleDeleteRow(row)} disabled={row._saving} className="tap-h-44 text-[11px] text-[var(--danger)] px-2">Apagar</button>
                <button onClick={() => handleSaveRow(row)} disabled={row._saving} className="tap-h-44 text-[11px] font-semibold text-[var(--text-2)] bg-[var(--surface-strong)] px-3 rounded-lg">
                  {row._saving ? 'A guardar…' : 'Guardar'}
                </button>
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="text-[11px] text-[var(--text-3)]">Sem percursos ainda.</p>}
      </div>

      {!readOnly && (adding ? (
        <div className="rounded-xl border border-dashed border-[var(--border-glass-strong)] p-2.5 space-y-1.5">
          <div className="grid grid-cols-4 gap-1.5">
            <input aria-label="Código do novo percurso" className={inputCls} value={draft.code}
              onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))} placeholder="Código" />
            <input aria-label="Metros do novo percurso" className={inputCls} type="number" min="1" value={draft.distance_m}
              onChange={(e) => setDraft((d) => ({ ...d, distance_m: e.target.value }))} placeholder="Metros" />
            <select aria-label="Estado da distância do novo percurso" className={inputCls} value={draft.distance_status}
              onChange={(e) => setDraft((d) => ({ ...d, distance_status: e.target.value }))}>
              {DISTANCE_STATUS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <input aria-label="Hora do novo percurso" className={inputCls} type="time" value={draft.start_time}
              onChange={(e) => setDraft((d) => ({ ...d, start_time: e.target.value }))} />
          </div>
          {addError && <p className="text-[11px] text-[var(--danger)]">{addError}</p>}
          <div className="flex gap-1.5 justify-end">
            <button onClick={() => { setAdding(false); setAddError(null); }} className="tap-h-44 text-[11px] text-[var(--text-3)] px-2">Cancelar</button>
            <button onClick={handleAdd} disabled={addSaving} className="tap-h-44 text-[11px] font-semibold text-[var(--text-2)] bg-[var(--surface-strong)] px-3 rounded-lg">
              {addSaving ? 'A criar…' : 'Criar percurso'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="tap-h-44 w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--text-3)] border border-dashed border-[var(--border-glass-strong)] rounded-xl py-2">
          <Plus size={14} /> Novo percurso
        </button>
      ))}
    </div>
  );
}

export default function RoundForm({
  round, editionId, competitionId, nextRoundNo, seriesOptions, courses,
  onClose, onSaved, onDeleted, onCoursesChanged, readOnly,
}) {
  const isNew = !round;
  const [savedRound, setSavedRound] = useState(round || null);
  const [form, setForm] = useState(() => fieldsFromRound(round, nextRoundNo));
  const [series, setSeries] = useState(seriesOptions || []);
  const [addingSeries, setAddingSeries] = useState(false);
  const [newSeriesName, setNewSeriesName] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [deletePreview, setDeletePreview] = useState(null); // bandas | null
  const [deletePreviewing, setDeletePreviewing] = useState(false);

  const [preview, setPreview] = useState(null); // { patch, bands } | null
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const buildNonDatePatch = () => ({
    round_no: Number(form.round_no) || 1,
    name: form.name.trim(),
    series_id: form.series_id || null,
    location: form.location.trim() || null,
    terrain: form.terrain || null,
    entry_deadline_at: fromDatetimeLocal(form.entry_deadline_at),
    results_url: form.results_url.trim() || null,
    team_results_url: form.team_results_url.trim() || null,
  });

  const handleAddSeries = async () => {
    const name = newSeriesName.trim();
    if (!name) return;
    const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `serie-${Date.now()}`;
    const res = await createRaceSeries(competitionId, { slug, name });
    if (!res.ok) { setSaveError(res.error?.message || 'Falha ao criar série.'); return; }
    setSeries((s) => [...s, res.data]);
    setField('series_id', res.data.id);
    setNewSeriesName('');
    setAddingSeries(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    if (isNew && !savedRound) {
      const res = await createRound(editionId, { ...buildNonDatePatch(), date: form.date || null, date_status: form.date_status });
      setSaving(false);
      if (!res.ok) { setSaveError(res.error?.message || 'Falha ao criar jornada.'); return; }
      setSavedRound(res.data);
      onSaved?.(res.data);
      return;
    }
    const res = await updateRound(savedRound.id, buildNonDatePatch());
    setSaving(false);
    if (!res.ok) { setSaveError(res.error?.message || 'Falha ao guardar jornada.'); return; }
    setSavedRound(res.data);
    onSaved?.(res.data);
  };

  const dateChanged = savedRound && (
    toDateInput(savedRound.date) !== form.date || (savedRound.date_status || 'provavel') !== form.date_status
  );

  const handlePreview = async () => {
    const patch = {};
    if (toDateInput(savedRound.date) !== form.date) patch.date = form.date || null;
    if ((savedRound.date_status || 'provavel') !== form.date_status) patch.date_status = form.date_status;
    if (Object.keys(patch).length === 0) return;
    setPreviewing(true);
    setPreviewError(null);
    const res = await previewRoundChange(savedRound.id, patch);
    setPreviewing(false);
    if (!res.ok) { setPreviewError(res.error?.message || 'Falha ao calcular o impacto.'); return; }
    setPreview({ patch, bands: res.data });
  };

  const handleConfirmDateChange = async () => {
    if (!preview) return;
    setConfirming(true);
    const res = await confirmRoundChange(savedRound.id, preview.patch);
    setConfirming(false);
    if (!res.ok) { setPreviewError(res.error?.message || 'Falha ao gravar.'); return; }
    setSavedRound(res.data);
    setPreview(null);
    onSaved?.(res.data);
  };

  // 1.º passo do "Apagar": o impacto, em bandas, antes de qualquer escrita.
  const handleAskDelete = async () => {
    setDeleteError(null);
    setDeletePreviewing(true);
    const res = await previewRoundChange(savedRound.id, { date_status: 'cancelada' });
    setDeletePreviewing(false);
    if (!res.ok) { setDeleteError(res.error?.message || 'Falha ao calcular o impacto.'); return; }
    setDeletePreview(res.data || {});
  };

  // "Cancelar em vez de apagar": o caminho normal da data (pré-visualização
  // → "Confirmar e gravar"), com as mesmas bandas que acabaram de ser vistas.
  const handleCancelInstead = () => {
    setField('date_status', 'cancelada');
    setPreviewError(null);
    setPreview({ patch: { date_status: 'cancelada' }, bands: deletePreview });
    setDeletePreview(null);
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    const res = await deleteRound(savedRound.id);
    setDeleting(false);
    if (!res.ok) { setDeletePreview(null); setDeleteError(res.error?.message || 'Falha ao apagar jornada.'); return; }
    setDeletePreview(null);
    onDeleted?.(savedRound.id);
    onClose?.();
  };

  return (
    <PremiumModal
      isOpen
      onClose={onClose}
      title={isNew && !savedRound ? 'Nova jornada' : `Jornada ${form.round_no || ''} · ${form.name || savedRound?.name || ''}`}
      subtitle={readOnly ? 'Edição encerrada — só consulta' : undefined}
      icon={CalendarClock}
      theme="race"
      variant="dialog"
      maxWidth="max-w-lg"
    >
      <div className="p-6 space-y-4 bg-[var(--bg-sheet)] text-[var(--text-2)] max-h-[70vh] overflow-y-auto">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelCls}>Nº da jornada</label>
            <input aria-label="Número da jornada" className={inputCls} type="number" min="1" value={form.round_no}
              onChange={(e) => setField('round_no', e.target.value)} disabled={readOnly} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Nome</label>
            <input aria-label="Nome da jornada" className={inputCls} value={form.name}
              onChange={(e) => setField('name', e.target.value)} disabled={readOnly} placeholder="Ex.: Padroeira" />
          </div>
        </div>

        <div className="space-y-1">
          <label className={labelCls}>Série (identificador estável entre edições)</label>
          {addingSeries ? (
            <div className="flex gap-1.5">
              <input aria-label="Nome da nova série" className={inputCls} value={newSeriesName}
                onChange={(e) => setNewSeriesName(e.target.value)} placeholder="Ex.: Corrida CCD" />
              <button onClick={handleAddSeries} className="tap-h-44 text-[11px] font-semibold px-3 rounded-lg bg-[var(--surface-strong)]">Criar</button>
              <button onClick={() => setAddingSeries(false)} className="tap-h-44 text-[11px] text-[var(--text-3)] px-2">Cancelar</button>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <select aria-label="Série" className={inputCls} value={form.series_id} onChange={(e) => setField('series_id', e.target.value)} disabled={readOnly}>
                <option value="">— sem série —</option>
                {series.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {!readOnly && (
                <button onClick={() => setAddingSeries(true)} className="tap-h-44 shrink-0 text-[11px] font-semibold px-3 rounded-lg border border-[var(--border-glass-strong)]">
                  + Nova
                </button>
              )}
            </div>
          )}
        </div>

        {/* Data e estado da data: gravam-se só via "Confirmar jornada" (abaixo), nunca no Guardar. */}
        <div className="rounded-xl border border-[var(--tint-race-bd)] bg-[var(--tint-race-bg)] p-3 space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={labelCls}>Data</label>
              <input aria-label="Data da jornada" className={inputCls} type="date" value={form.date}
                onChange={(e) => setField('date', e.target.value)} disabled={readOnly} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Estado da data</label>
              <select aria-label="Estado da data" className={inputCls} value={form.date_status}
                onChange={(e) => setField('date_status', e.target.value)} disabled={readOnly}>
                {DATE_STATUS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          {savedRound && !readOnly && (
            <>
              <p className="text-[11px] text-[var(--text-3)]">
                Uma jornada `provável` nunca gera provas para os inscritos; só `confirmada` com data o faz.
                Mudar aqui exige sempre ver o impacto primeiro.
              </p>
              <Button
                variant="module" moduleColor="var(--grad-race)" size="sm"
                onClick={handlePreview}
                disabled={!dateChanged || previewing}
                icon={previewing ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <ShieldCheck size={14} />}
              >
                {previewing ? 'A calcular impacto…' : 'Confirmar jornada'}
              </Button>
              {previewError && <p className="text-[11px] text-[var(--danger)]">{previewError}</p>}
            </>
          )}
          {!savedRound && (
            <p className="text-[11px] text-[var(--text-3)]">Uma jornada nova ainda não tem inscritos — grava-se com o resto do formulário.</p>
          )}
        </div>

        <div className="space-y-1">
          <label className={labelCls}>Local</label>
          <input aria-label="Local" className={inputCls} value={form.location} onChange={(e) => setField('location', e.target.value)} disabled={readOnly} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelCls}>Terreno</label>
            <select aria-label="Terreno" className={inputCls} value={form.terrain} onChange={(e) => setField('terrain', e.target.value)} disabled={readOnly}>
              {TERRAIN.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Prazo de inscrição</label>
            <input aria-label="Prazo de inscrição" className={inputCls} type="datetime-local" value={form.entry_deadline_at}
              onChange={(e) => setField('entry_deadline_at', e.target.value)} disabled={readOnly} />
          </div>
        </div>

        <div className="space-y-1">
          <label className={labelCls}>Link — resultados individuais</label>
          <input aria-label="Link dos resultados individuais" className={inputCls} value={form.results_url} onChange={(e) => setField('results_url', e.target.value)} disabled={readOnly} placeholder="https://…" />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Link — resultados por equipas</label>
          <input aria-label="Link dos resultados por equipas" className={inputCls} value={form.team_results_url} onChange={(e) => setField('team_results_url', e.target.value)} disabled={readOnly} placeholder="https://…" />
        </div>

        {saveError && <p className="text-[11px] text-[var(--danger)]">{saveError}</p>}

        {!readOnly && (
          <div className="flex gap-2 pt-1">
            {savedRound && (
              <Button variant="danger-outline" onClick={handleAskDelete} disabled={deleting || deletePreviewing} icon={<Trash2 size={16} />}>
                {deletePreviewing ? 'A calcular impacto…' : deleting ? 'A apagar…' : 'Apagar'}
              </Button>
            )}
            <Button variant="module" moduleColor="var(--grad-race)" className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? 'A guardar…' : (isNew && !savedRound ? 'Criar jornada' : 'Guardar')}
            </Button>
          </div>
        )}
        {deleteError && <p className="text-[11px] text-[var(--danger)]">{deleteError}</p>}

        {savedRound && (
          <div className="pt-2 border-t border-[var(--border-glass)]">
            <CoursesEditor
              roundId={savedRound.id}
              courses={courses || []}
              onChange={onCoursesChanged}
              readOnly={readOnly}
            />
          </div>
        )}
      </div>

      {deletePreview && (
        <PremiumModal
          isOpen={!!deletePreview}
          onClose={() => !deleting && setDeletePreview(null)}
          title="Apagar a jornada?"
          subtitle={`${BAND_LABEL.atletas_vou}: ${deletePreview.atletas_vou ?? '0'}`}
          icon={Trash2}
          theme="warning"
          variant="dialog"
          maxWidth="max-w-sm"
        >
          <div className="p-6 space-y-4 bg-[var(--bg-sheet)] text-[var(--text-2)]" data-testid="round-delete-preview">
            <div className="grid grid-cols-2 gap-2">
              {['provas_apagadas', 'planos_ajustados'].map((k) => (
                <div key={k} className="rounded-xl border border-[var(--border-glass)] p-2.5 text-center">
                  <p className="text-lg font-bold">{deletePreview[k] ?? '0'}</p>
                  <p className="text-[11px] text-[var(--text-3)]">{BAND_LABEL[k]}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-[var(--text-3)]">
              Apagar tira a jornada do calendário de todos: as provas de quem disse "Vou" saem (as que o atleta já
              tinha voltam ao que eram) e os planos aceites ficam sem essa prova. Se a jornada não se realiza,
              marca-a como cancelada — o efeito nas provas é o mesmo e ela fica no histórico da edição.
            </p>
            <div className="flex flex-col gap-2 pt-1">
              {savedRound?.date_status !== 'cancelada' && (
                <Button variant="module" moduleColor="var(--grad-race)" onClick={handleCancelInstead} disabled={deleting}>
                  Marcar como cancelada
                </Button>
              )}
              <div className="flex gap-2">
                <Button variant="light" className="flex-1" onClick={() => setDeletePreview(null)} disabled={deleting}>
                  Voltar
                </Button>
                <Button variant="danger-outline" className="flex-1" onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'A apagar…' : 'Apagar mesmo assim'}
                </Button>
              </div>
            </div>
          </div>
        </PremiumModal>
      )}

      {preview && (
        <PremiumModal
          isOpen={!!preview}
          onClose={() => !confirming && setPreview(null)}
          title="Impacto da mudança"
          subtitle={`${BAND_LABEL.atletas_vou}: ${preview.bands?.atletas_vou ?? '0'}`}
          icon={ShieldCheck}
          theme="warning"
          variant="dialog"
          maxWidth="max-w-sm"
        >
          <div className="p-6 space-y-4 bg-[var(--bg-sheet)] text-[var(--text-2)]">
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(preview.bands || {}).map(([k, v]) => (
                <div key={k} className="rounded-xl border border-[var(--border-glass)] p-2.5 text-center">
                  <p className="text-lg font-bold">{v}</p>
                  <p className="text-[11px] text-[var(--text-3)]">{BAND_LABEL[k] || k}</p>
                </div>
              ))}
            </div>
            {previewError && <p className="text-[11px] text-[var(--danger)]">{previewError}</p>}
            <div className="flex gap-2 pt-1">
              <Button variant="light" className="flex-1" onClick={() => setPreview(null)} disabled={confirming}>
                Cancelar
              </Button>
              <Button variant="module" moduleColor="var(--grad-race)" className="flex-1" onClick={handleConfirmDateChange} disabled={confirming}>
                {confirming ? 'A gravar…' : 'Confirmar e gravar'}
              </Button>
            </div>
          </div>
        </PremiumModal>
      )}
    </PremiumModal>
  );
}
