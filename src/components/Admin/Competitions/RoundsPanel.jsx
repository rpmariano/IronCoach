import React, { useEffect, useState, useCallback } from 'react';
import { Plus, MapPin, Mountain, Clock, ChevronRight } from 'lucide-react';
import { listRounds, listCourses, listRaceSeries } from '../../../utils/cupAdmin';
import RoundForm from './RoundForm';

const DATE_STATUS_LABEL = { provavel: 'Provável', confirmada: 'Confirmada', adiada: 'Adiada', cancelada: 'Cancelada' };
const DATE_STATUS_STYLE = {
  provavel: 'bg-[var(--surface-strong)] text-[var(--text-3)] border-[var(--border-glass)]',
  confirmada: 'bg-[var(--tint-ok-bg)] text-[var(--ok-soft)] border-[var(--tint-ok-bd)]',
  adiada: 'bg-[var(--tint-warn-bg)] text-[var(--warn)] border-[var(--tint-warn-bd)]',
  cancelada: 'bg-[var(--tint-danger-bg)] text-[var(--danger)] border-[var(--tint-danger-bd)]',
};

/* As jornadas de uma edição (specs/trofeu.md §6.2), 2026-09-26. Lista +
   modal de criar/editar (RoundForm, que trata do "Confirmar jornada" e dos
   percursos). */
export default function RoundsPanel({ edition, competition, readOnly }) {
  const [rounds, setRounds] = useState(null);
  const [coursesByRound, setCoursesByRound] = useState({});
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingRound, setEditingRound] = useState(null); // round | 'new' | null

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [roundsRes, seriesRes] = await Promise.all([
      listRounds(edition.id),
      listRaceSeries(competition?.id),
    ]);
    if (!roundsRes.ok) { setError(roundsRes.error?.message || 'Falha ao carregar jornadas.'); setLoading(false); return; }
    setSeries(seriesRes.ok ? seriesRes.data : []);
    setRounds(roundsRes.data);
    const coursesRes = await listCourses(roundsRes.data.map((r) => r.id));
    const grouped = {};
    for (const c of (coursesRes.ok ? coursesRes.data : [])) {
      (grouped[c.round_id] ||= []).push(c);
    }
    setCoursesByRound(grouped);
    setLoading(false);
  }, [edition.id, competition?.id]);

  useEffect(() => { load(); }, [load]);

  // Apagar ou fechar (Cancelar/X) tira o modal e relê a lista. Guardar (o
  // "Guardar" normal ou "Confirmar jornada") NÃO fecha o modal — só relê os
  // dados, para o admin continuar a mexer nos percursos sem reabrir tudo.
  const handleClosed = () => { setEditingRound(null); load(); };
  const handleSaved = () => { load(); };

  if (loading) {
    return <p className="text-xs text-[var(--text-3)] text-center py-8">A carregar jornadas...</p>;
  }
  if (error) {
    return <p className="text-xs text-[var(--danger)] text-center py-8">{error}</p>;
  }

  const nextRoundNo = rounds.length ? Math.max(...rounds.map((r) => r.round_no || 0)) + 1 : 1;

  return (
    <div className="space-y-2.5 fade-in">
      {!readOnly && (
        <button
          onClick={() => setEditingRound('new')}
          className="tap-h-44 w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--text-2)] border border-dashed border-[var(--border-glass-strong)] rounded-xl py-2.5"
        >
          <Plus size={14} /> Nova jornada
        </button>
      )}

      {rounds.length === 0 && (
        <div className="card rounded-2xl p-8 text-center bg-[var(--surface-soft)] border border-[var(--border-glass)] text-[var(--text-3)] text-xs">
          Sem jornadas ainda — o calendário nunca vai por migração (§9.1 da spec).
        </div>
      )}

      {rounds.map((r) => {
        const courses = coursesByRound[r.id] || [];
        return (
          <button
            key={r.id}
            onClick={() => setEditingRound(r)}
            className="w-full text-left card rounded-2xl p-4 bg-[var(--surface-glass)] border border-[var(--border-glass)] space-y-1.5 hover:border-[var(--border-glass-strong)] transition"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[var(--text-1)]">J{r.round_no} · {r.name}</p>
                <p className="text-[11px] text-[var(--text-3)]">
                  {r.date ? new Date(r.date).toLocaleDateString('pt-PT') : 'Sem data'}
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${DATE_STATUS_STYLE[r.date_status] || DATE_STATUS_STYLE.provavel}`}>
                  {DATE_STATUS_LABEL[r.date_status] || r.date_status}
                </span>
                <ChevronRight size={14} className="text-[var(--text-3)]" />
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-[var(--text-3)]">
              {r.location && <span className="flex items-center gap-1"><MapPin size={11} /> {r.location}</span>}
              {r.terrain && <span className="flex items-center gap-1"><Mountain size={11} /> {r.terrain}</span>}
              {r.entry_deadline_at && (
                <span className="flex items-center gap-1"><Clock size={11} /> Prazo {new Date(r.entry_deadline_at).toLocaleString('pt-PT')}</span>
              )}
            </div>
            {courses.length > 0 && (
              <p className="text-[11px] text-[var(--text-3)]">
                {courses.map((c) => `${c.code} ${c.distance_m ? `${(c.distance_m / 1000).toFixed(1).replace(/\.0$/, '')} km` : '?'}`).join(' · ')}
              </p>
            )}
          </button>
        );
      })}

      {editingRound && (
        <RoundForm
          round={editingRound === 'new' ? null : editingRound}
          editionId={edition.id}
          competitionId={competition?.id}
          nextRoundNo={nextRoundNo}
          seriesOptions={series}
          courses={editingRound === 'new' ? [] : (coursesByRound[editingRound.id] || [])}
          onClose={handleClosed}
          onSaved={handleSaved}
          onDeleted={handleClosed}
          onCoursesChanged={load}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}
