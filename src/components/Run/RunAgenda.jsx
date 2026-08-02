import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { CalendarPlus, RotateCcw, CheckCircle, Pencil, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { supabase } from '../../lib/supabase';
import RunRegistration from './RunRegistration';

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
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setEditingEventId(null);
    setIsFormOpen(false);
  };

  if (isFormOpen) {
    return (
      <RunRegistration 
        onClose={handleCloseForm} 
        initialMode="prova" 
        eventIdToEdit={editingEventId}
      />
    );
  }

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
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--mod-corrida-from)]/10 border border-[var(--mod-corrida-from)]/30" style={{ color: 'var(--mod-corrida-to)' }}>
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
          <div className="flex items-center gap-1.5 shrink-0 flex-col">
            <button onClick={() => handleToggleStatus(ev)} title={done ? 'Marcar como agendada' : 'Marcar como concluída'} className="p-2 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 hover:text-emerald-500 transition">
              {done ? <RotateCcw size={16} /> : <CheckCircle size={16} />}
            </button>
            <button onClick={() => handleOpenForm(ev.id)} aria-label="Editar prova" className="p-2 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 hover:text-[var(--accent)] transition">
              <Pencil size={16} />
            </button>
            <button onClick={() => handleDelete(ev.id)} aria-label="Eliminar prova" className="p-2 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 hover:text-red-500 transition">
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 fade-in pb-20">
      <button 
        onClick={() => handleOpenForm(null)}
        className="w-full text-neutral-950 font-bold text-sm rounded-2xl py-3.5 flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-lg"
        style={{ background: 'var(--mod-corrida-to)' }}
      >
        <CalendarPlus size={20} style={{ color: 'var(--blue-dark)' }} />
        Nova Prova
      </button>

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
