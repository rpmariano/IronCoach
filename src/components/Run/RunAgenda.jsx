import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { CalendarPlus, RotateCcw, CheckCircle, Pencil, Trash2, Check, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { supabase } from '../../lib/supabase';

const RACE_TYPES = [
  { key: '5k', label: '5 km' },
  { key: '10k', label: '10 km' },
  { key: 'meia', label: 'Meia Maratona (21.1 km)' },
  { key: 'maratona', label: 'Maratona (42.2 km)' },
  { key: 'trail', label: 'Trail' },
  { key: 'outro', label: 'Outro' }
];

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function formatDatePT(isoStr) {
  if (!isoStr) return '';
  return format(parseISO(isoStr), 'd MMM yyyy', { locale: pt });
}

export default function RunAgenda({ onNewRun }) {
  const { raceEvents, profile, setRaceEvents } = useAppStore();
  const [editingEventId, setEditingEventId] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draft, setDraft] = useState({
    date: todayISO(),
    race_type: '10k',
    name: '',
    location: '',
    target_time: '',
    equipment: '',
    notes: ''
  });

  const todayIso = todayISO();
  
  // Sort events
  const upcoming = raceEvents
    .filter(e => e.status !== 'concluida' && e.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date));
    
  const past = raceEvents
    .filter(e => e.status === 'concluida' || e.date < todayIso)
    .sort((a, b) => b.date.localeCompare(a.date));

  const handleToggleStatus = async (ev) => {
    const newStatus = ev.status === 'concluida' ? 'agendada' : 'concluida';
    
    // Update local state optimistic
    setRaceEvents(raceEvents.map(e => e.id === ev.id ? { ...e, status: newStatus } : e));
    
    try {
      const { error } = await supabase
        .from('race_events')
        .update({ status: newStatus })
        .eq('id', ev.id);
        
      if (error) throw error;
    } catch (err) {
      console.error('Error toggling status:', err);
      // Revert if error
      setRaceEvents(raceEvents);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar esta prova? Não pode ser desfeito.')) return;
    
    // Optimistic delete
    const previous = [...raceEvents];
    setRaceEvents(raceEvents.filter(e => e.id !== id));
    
    try {
      const { error } = await supabase
        .from('race_events')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
    } catch (err) {
      console.error('Error deleting race event:', err);
      setRaceEvents(previous);
    }
  };

  const handleOpenForm = (eventId = null) => {
    setEditingEventId(eventId);
    if (eventId) {
      const ev = raceEvents.find(e => e.id === eventId);
      if (ev) setDraft({ ...ev });
    } else {
      setDraft({
        date: todayIso,
        race_type: '10k',
        name: '',
        location: '',
        target_time: '',
        equipment: '',
        notes: ''
      });
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setEditingEventId(null);
    setIsFormOpen(false);
  };

  const updateDraft = (key, val) => {
    setDraft(prev => ({ ...prev, [key]: val }));
  };

  const handleSaveForm = async () => {
    if (!draft.name.trim()) return;
    setIsSubmitting(true);

    try {
      if (editingEventId) {
        const { error } = await supabase
          .from('race_events')
          .update(draft)
          .eq('id', editingEventId);
        if (error) throw error;
        setRaceEvents(raceEvents.map(e => e.id === editingEventId ? { ...e, ...draft } : e));
      } else {
        const insertObj = {
          ...draft,
          user_id: profile?.id,
          status: draft.date < todayIso ? 'concluida' : 'agendada'
        };
        const { data, error } = await supabase
          .from('race_events')
          .insert(insertObj)
          .select()
          .single();
        if (error) throw error;
        if (data) {
          setRaceEvents([...raceEvents, data]);
        }
      }
      handleCloseForm();
    } catch (err) {
      console.error('Error saving race event:', err);
      alert('Erro ao guardar prova.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderRaceEventCard = (ev) => {
    const typeLabel = (RACE_TYPES.find(t => t.key === ev.race_type) || {}).label || ev.race_type;
    const isPast = ev.date < todayIso;
    const done = ev.status === 'concluida';
    
    return (
      <div key={ev.id} className={`card rounded-2xl p-4 ${done ? 'opacity-60' : ''}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
              {ev.name}
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border" style={{ color: 'var(--mod-corrida-to)', borderColor: 'var(--mod-corrida-to)' }}>
                {typeLabel}
              </span>
              {done && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">Concluída</span>}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {formatDatePT(ev.date)}
              {isPast && !done ? ' · já passou' : ''}
              {ev.location ? ` · ${ev.location}` : ''}
            </p>
            {ev.target_time && <p className="text-[11px] text-slate-500 mt-0.5">Tempo-alvo: {ev.target_time}</p>}
            {ev.equipment && <p className="text-[11px] text-slate-500 mt-0.5">Equipamento: {ev.equipment}</p>}
            {ev.notes && <p className="text-[11px] text-slate-500 mt-0.5 italic">"{ev.notes}"</p>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-row">
            <button onClick={() => handleToggleStatus(ev)} title={done ? 'Marcar como agendada' : 'Marcar como concluída'} className="p-1 text-slate-400 hover:text-emerald-500 transition">
              {done ? <RotateCcw size={16} /> : <CheckCircle size={16} />}
            </button>
            <button onClick={() => handleOpenForm(ev.id)} aria-label="Editar prova" className="p-1 text-slate-400 hover:text-[var(--accent)] transition">
              <Pencil size={16} />
            </button>
            <button onClick={() => handleDelete(ev.id)} aria-label="Eliminar prova" className="p-1 text-slate-400 hover:text-red-500 transition">
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 fade-in pb-20">
      {!isFormOpen ? (
        <button 
          onClick={() => handleOpenForm(null)}
          className="w-full text-neutral-950 font-bold text-sm rounded-2xl py-3.5 flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-lg"
          style={{ background: 'var(--accent)' }}
        >
          <CalendarPlus size={20} style={{ color: '#000' }} />
          Nova Prova
        </button>
      ) : (
        <div className="rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4 space-y-2.5">
          <p className="text-xs font-semibold text-[var(--accent)] flex items-center gap-1.5 mb-1">
            {editingEventId ? <Pencil size={14} /> : <CalendarPlus size={14} />} 
            {editingEventId ? 'Editar Prova' : 'Nova Prova'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <input 
              type="date" 
              value={draft.date} 
              onChange={e => updateDraft('date', e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-[var(--accent)]" 
            />
            <select 
              value={draft.race_type}
              onChange={e => updateDraft('race_type', e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-[var(--accent)]"
            >
              {RACE_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <input 
            type="text" 
            maxLength={120} 
            placeholder="Nome da prova (ex.: Meia Maratona de Lisboa)" 
            value={draft.name}
            onChange={e => updateDraft('name', e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--accent)]" 
          />
          <div className="grid grid-cols-2 gap-2">
            <input 
              type="text" 
              maxLength={120} 
              placeholder="Local" 
              value={draft.location}
              onChange={e => updateDraft('location', e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--accent)]" 
            />
            <input 
              type="text" 
              maxLength={60} 
              placeholder="Tempo-alvo (ex.: 1:45:00)" 
              value={draft.target_time}
              onChange={e => updateDraft('target_time', e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--accent)]" 
            />
          </div>
          <input 
            type="text" 
            maxLength={120} 
            placeholder="Equipamento (opcional) — ex.: sapatilhas novas" 
            value={draft.equipment}
            onChange={e => updateDraft('equipment', e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--accent)]" 
          />
          <textarea 
            rows={2} 
            maxLength={300} 
            placeholder="Notas (opcional)" 
            value={draft.notes}
            onChange={e => updateDraft('notes', e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--accent)] resize-none" 
          />
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button onClick={handleCloseForm} type="button" className="border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg py-2 hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button 
              onClick={handleSaveForm} 
              disabled={isSubmitting || !draft.name.trim()}
              type="button" 
              className="bg-[var(--accent)] text-neutral-950 text-xs font-bold rounded-lg py-2 flex items-center justify-center gap-1.5 disabled:opacity-50 transition"
            >
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Guardar
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-1">Próximas provas</h2>
        {upcoming.length === 0 ? (
          <p className="text-xs text-slate-400 px-1">Sem provas agendadas.</p>
        ) : (
          upcoming.map(renderRaceEventCard)
        )}
      </div>

      {past.length > 0 && (
        <div className="space-y-3 pt-2">
          <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-1">Passadas / concluídas</h2>
          {past.map(renderRaceEventCard)}
        </div>
      )}
    </div>
  );
}
