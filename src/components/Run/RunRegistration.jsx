import React, { useState, useEffect } from 'react';
import { Camera, ImagePlus, X, Trash2, Check } from 'lucide-react';
import { format } from 'date-fns';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';

const RACE_TYPES = [
  { key: '5k', label: '5 km' },
  { key: '10k', label: '10 km' },
  { key: 'meia', label: 'Meia Maratona' },
  { key: 'maratona', label: 'Maratona' },
  { key: 'trail', label: 'Trail' },
  { key: 'outro', label: 'Outro' }
];

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export default function RunRegistration({ onClose, initialMode = 'corrida', dateIso = null, eventIdToEdit = null, runIdToEdit = null }) {
  const { profile, runs, raceEvents, setRuns, setRaceEvents } = useAppStore();
  const [mode, setMode] = useState(initialMode); // 'corrida' or 'prova'
  
  // Corrida State
  const [runDate, setRunDate] = useState(dateIso || todayISO());
  const [runDistance, setRunDistance] = useState('');
  const [runDuration, setRunDuration] = useState('');
  const [runName, setRunName] = useState('Corrida de Hoje');
  
  // Prova State
  const [raceDate, setRaceDate] = useState(dateIso || todayISO());
  const [raceType, setRaceType] = useState('5k');
  const [raceName, setRaceName] = useState('');
  const [raceLocation, setRaceLocation] = useState('');
  const [raceTargetTime, setRaceTargetTime] = useState('');
  const [raceEquipment, setRaceEquipment] = useState('');
  const [raceNotes, setRaceNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Load edit data
  useEffect(() => {
    if (initialMode === 'prova' && eventIdToEdit) {
      const ev = raceEvents.find(e => e.id === eventIdToEdit);
      if (ev) {
        setRaceDate(ev.date);
        setRaceType(ev.race_type);
        setRaceName(ev.name);
        setRaceLocation(ev.location || '');
        setRaceTargetTime(ev.target_time || '');
        setRaceEquipment(ev.equipment || '');
        setRaceNotes(ev.notes || '');
      }
    } else if (initialMode === 'corrida' && runIdToEdit) {
      const r = runs.find(r => r.id === runIdToEdit);
      if (r) {
        setRunDate(r.date);
        setRunDistance(r.distance_km || '');
        setRunDuration(r.duration_seconds ? new Date(r.duration_seconds * 1000).toISOString().substring(11, 19) : '');
        setRunName(r.name || '');
      }
    }
  }, [initialMode, eventIdToEdit, runIdToEdit, raceEvents, runs]);

  const parseDurationToSeconds = (dur) => {
    if (!dur) return null;
    const parts = dur.split(':').reverse();
    let secs = 0;
    if (parts[0]) secs += parseInt(parts[0], 10) || 0;
    if (parts[1]) secs += (parseInt(parts[1], 10) || 0) * 60;
    if (parts[2]) secs += (parseInt(parts[2], 10) || 0) * 3600;
    return secs;
  };

  const handleSaveCorrida = async () => {
    if (!runDate) return setErrorMsg('Preenche a data.');
    if (!runName.trim()) return setErrorMsg('Preenche o nome.');
    
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const payload = {
        user_id: profile.id,
        date: runDate,
        name: runName.trim(),
        distance_km: runDistance ? Number(runDistance) : null,
        duration_seconds: parseDurationToSeconds(runDuration)
      };

      if (runIdToEdit) {
        const { data, error } = await supabase.from('runs').update(payload).eq('id', runIdToEdit).select().single();
        if (error) throw error;
        setRuns(runs.map(r => r.id === runIdToEdit ? data : r).sort((a,b) => b.date.localeCompare(a.date)));
      } else {
        const { data, error } = await supabase.from('runs').insert(payload).select().single();
        if (error) throw error;
        setRuns([data, ...runs].sort((a,b) => b.date.localeCompare(a.date)));
      }
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro ao guardar corrida.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveProva = async () => {
    if (!raceDate) return setErrorMsg('Preenche a data.');
    if (!raceName.trim()) return setErrorMsg('Preenche o nome.');

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const payload = {
        user_id: profile.id,
        date: raceDate,
        name: raceName.trim(),
        race_type: raceType,
        location: raceLocation.trim() || null,
        target_time: raceTargetTime.trim() || null,
        equipment: raceEquipment.trim() || null,
        notes: raceNotes.trim() || null,
        status: eventIdToEdit ? raceEvents.find(e => e.id === eventIdToEdit)?.status : 'agendada'
      };

      if (eventIdToEdit) {
        const { data, error } = await supabase.from('race_events').update(payload).eq('id', eventIdToEdit).select().single();
        if (error) throw error;
        setRaceEvents(raceEvents.map(e => e.id === eventIdToEdit ? data : e).sort((a,b) => a.date.localeCompare(b.date)));
      } else {
        const { data, error } = await supabase.from('race_events').insert(payload).select().single();
        if (error) throw error;
        setRaceEvents([...raceEvents, data].sort((a,b) => a.date.localeCompare(b.date)));
      }
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro ao guardar prova.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 fade-in pb-20">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
          {eventIdToEdit ? 'Editar Prova' : runIdToEdit ? 'Editar Corrida' : 'Registar'}
        </h2>
        <button onClick={onClose} className="text-xs text-slate-400 font-semibold hover:text-slate-600">
          Cancelar
        </button>
      </div>

      {!eventIdToEdit && !runIdToEdit && (
        <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-xl">
          <button 
            onClick={() => setMode('corrida')} 
            className={`flex-1 text-xs font-bold py-2 rounded-lg transition ${mode === 'corrida' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}
          >
            Corrida (Treino)
          </button>
          <button 
            onClick={() => setMode('prova')} 
            className={`flex-1 text-xs font-bold py-2 rounded-lg transition ${mode === 'prova' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}
          >
            Prova (Agenda)
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-50 text-red-500 text-xs p-3 rounded-lg border border-red-200">
          {errorMsg}
        </div>
      )}

      {mode === 'corrida' ? (
        <div className="space-y-3">
          <input 
            type="date" 
            value={runDate} 
            onChange={(e) => setRunDate(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
          />
          <input 
            type="text" 
            placeholder="Nome (ex: Corrida de Hoje)" 
            value={runName} 
            onChange={(e) => setRunName(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
          />
          <div className="grid grid-cols-2 gap-3">
            <input 
              type="number" 
              step="0.1"
              placeholder="Distância (km)" 
              value={runDistance} 
              onChange={(e) => setRunDistance(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
            />
            <input 
              type="text" 
              placeholder="Duração (hh:mm:ss)" 
              value={runDuration} 
              onChange={(e) => setRunDuration(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
            />
          </div>
          
          <button 
            onClick={handleSaveCorrida}
            disabled={isSubmitting}
            className="w-full mt-4 bg-[var(--accent)] text-neutral-950 font-bold text-sm rounded-2xl py-3.5 flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-lg disabled:opacity-50"
          >
            {isSubmitting ? 'A guardar...' : <><Check size={18} /> Guardar Corrida</>}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input 
              type="date" 
              value={raceDate} 
              onChange={(e) => setRaceDate(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
            />
            <select 
              value={raceType} 
              onChange={(e) => setRaceType(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
            >
              {RACE_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <input 
            type="text" 
            placeholder="Nome da prova (ex: Meia de Lisboa)" 
            value={raceName} 
            onChange={(e) => setRaceName(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
          />
          <div className="grid grid-cols-2 gap-3">
            <input 
              type="text" 
              placeholder="Local" 
              value={raceLocation} 
              onChange={(e) => setRaceLocation(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
            />
            <input 
              type="text" 
              placeholder="Tempo-alvo (hh:mm:ss)" 
              value={raceTargetTime} 
              onChange={(e) => setRaceTargetTime(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
            />
          </div>
          <input 
            type="text" 
            placeholder="Equipamento (opcional)" 
            value={raceEquipment} 
            onChange={(e) => setRaceEquipment(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
          />
          <textarea 
            placeholder="Notas (opcional)" 
            value={raceNotes} 
            onChange={(e) => setRaceNotes(e.target.value)}
            rows={2}
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400 resize-none"
          />
          
          <button 
            onClick={handleSaveProva}
            disabled={isSubmitting}
            className="w-full mt-4 text-neutral-950 font-bold text-sm rounded-2xl py-3.5 flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-lg disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {isSubmitting ? 'A guardar...' : <><Check size={18} /> Guardar Prova</>}
          </button>
        </div>
      )}
    </div>
  );
}
