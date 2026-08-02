import React, { useState, useEffect } from 'react';
import { ImagePlus, X, Trash2, Check, Loader2, Sparkles, PencilLine, Plus } from 'lucide-react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';

// -------------------------------------
// ICONS & UTILS
// -------------------------------------
const SneakerIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14.1 7.9 12.5 10" />
    <path d="M17.4 10.1 16 12" />
    <path d="M2 16a2 2 0 0 0 2 2h13c2.8 0 5-2.2 5-5a2 2 0 0 0-2-2c-.8 0-1.6-.2-2.2-.7l-6.2-4.2c-.4-.3-.9-.2-1.3.1 0 0-.6.8-1.2 1.1a3.5 3.5 0 0 1-4.2.1C4.4 7 3.7 6.3 3.7 6.3A.92.92 0 0 0 2 7Z" />
    <path d="M2 11c0 1.7 1.3 3 3 3h7" />
  </svg>
);

const RACE_TYPES = [
  { key: '5k', label: '5 km' },
  { key: '10k', label: '10 km' },
  { key: 'meia', label: 'Meia Maratona' },
  { key: 'maratona', label: 'Maratona' },
  { key: 'trail', label: 'Trail' },
  { key: 'ultra', label: 'Ultra Trail' },
  { key: 'outro', label: 'Outro' }
];

const RUN_TRAINING_TYPES = [
  { key: 'continuo', label: 'Contínuo', group: 'Corrida solta' },
  { key: 'longo', label: 'Longo', group: 'Corrida solta' },
  { key: 'recuperacao', label: 'Recuperação', group: 'Corrida solta' },
  { key: 'intervalado', label: 'Intervalado', group: 'Estruturado' },
  { key: 'fartlek', label: 'Fartlek', group: 'Estruturado' },
  { key: 'progressivo', label: 'Progressivo', group: 'Estruturado' },
  { key: 'series', label: 'Séries', group: 'Estruturado' }
];

const RUN_REPEAT_TRAINING_TYPES = new Set(['intervalado', 'series']);

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// Convert "43m" or "37:57" or "1:11:26" to seconds
function parseDurationToSeconds(durStr) {
  if (!durStr) return null;
  const str = durStr.toString().trim().toLowerCase();
  let parts;
  if (str.endsWith('m')) {
    const mins = parseFloat(str.replace('m', ''));
    if (!isNaN(mins)) return Math.round(mins * 60);
  }
  if (str.includes(':')) {
    parts = str.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1]; // mm:ss
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]; // hh:mm:ss
  }
  const val = parseFloat(str);
  if (!isNaN(val)) return Math.round(val * 60); // assume minutes if just a number
  return null;
}

function formatDuration(totalSeconds) {
  if (!totalSeconds) return '';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const MAX_PHOTOS = 4;

export default function RunRegistration({ onClose, initialMode = 'corrida', dateIso = null, eventIdToEdit = null, runIdToEdit = null }) {
  const { profile, runs, raceEvents, setRuns, setRaceEvents } = useAppStore();
  const [mode, setMode] = useState(initialMode); // 'corrida' (runs table) or 'prova' (raceEvents table)
  
  // --- RUNS STATE ---
  const [runKind, setRunKind] = useState('treino'); // 'treino' | 'competicao'
  const [runTrainingType, setRunTrainingType] = useState('continuo');
  const [runDate, setRunDate] = useState(dateIso || todayISO());
  const [runName, setRunName] = useState('Corrida de Hoje');
  
  // Basic metrics
  const [runDistance, setRunDistance] = useState('');
  const [runDuration, setRunDuration] = useState('');
  const [runEffortRpe, setRunEffortRpe] = useState(0); // 0-10
  
  // Detailed metrics
  const [elevationGain, setElevationGain] = useState('');
  const [cadence, setCadence] = useState('');
  const [calories, setCalories] = useState('');
  const [vo2Max, setVo2Max] = useState('');
  const [avgHeartRate, setAvgHeartRate] = useState('');
  const [maxHeartRate, setMaxHeartRate] = useState('');
  
  // Training structure
  const [warmupMinutes, setWarmupMinutes] = useState('');
  const [recoverySeconds, setRecoverySeconds] = useState('');
  const [splits, setSplits] = useState([]); // { distance_km, minutes }
  const [hrZones, setHrZones] = useState([]); // { zone, minutes }
  
  // Competition specifics (when runKind === 'competicao')
  const [officialTime, setOfficialTime] = useState('');
  const [position, setPosition] = useState('');
  const [completedRaceType, setCompletedRaceType] = useState('10k');
  
  // Photos
  const [runPhotos, setRunPhotos] = useState([]); // [{ file?, dataUrl, url? }]
  const [analyzingRun, setAnalyzingRun] = useState(false);
  
  // --- PROVAS (AGENDA) STATE ---
  const [raceDate, setRaceDate] = useState(dateIso || todayISO());
  const [raceType, setRaceType] = useState('5k');
  const [raceName, setRaceName] = useState('');
  const [raceLocation, setRaceLocation] = useState('');
  const [raceTargetTime, setRaceTargetTime] = useState('');
  const [raceEquipment, setRaceEquipment] = useState('');
  const [raceNotes, setRaceNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Load existing data if editing
  useEffect(() => {
    if (initialMode === 'prova' && eventIdToEdit) {
      const ev = raceEvents.find(e => e.id === eventIdToEdit);
      if (ev) {
        setRaceDate(ev.date || todayISO());
        setRaceType(ev.race_type || '5k');
        setRaceName(ev.name || '');
        setRaceLocation(ev.location || '');
        setRaceTargetTime(ev.target_time_minutes ? formatDuration(ev.target_time_minutes * 60) : '');
        setRaceEquipment(ev.equipment || '');
        setRaceNotes(ev.notes || '');
      }
    } else if (initialMode === 'corrida' && runIdToEdit) {
      const r = runs.find(r => r.id === runIdToEdit);
      if (r) {
        setRunKind(r.kind || 'treino');
        setRunTrainingType(r.training_type || 'continuo');
        setRunDate(r.date || todayISO());
        setRunName(r.name || '');
        setRunDistance(r.distance_km || '');
        setRunDuration(r.duration_seconds ? formatDuration(r.duration_seconds) : '');
        setRunEffortRpe(r.effort_rpe || 0);
        
        const d = r.details || {};
        setElevationGain(d.elevation_gain_m || '');
        setCadence(d.cadence_spm || '');
        setCalories(d.calories_kcal || '');
        setVo2Max(d.vo2_max || '');
        setAvgHeartRate(d.avg_heart_rate_bpm || '');
        setMaxHeartRate(d.max_heart_rate_bpm || '');
        
        setWarmupMinutes(d.warmup_minutes || '');
        setRecoverySeconds(d.recovery_seconds || '');
        setSplits(d.splits ? d.splits.map(s => ({ distance_km: s.distance_km || '', minutes: s.time_seconds ? formatDuration(s.time_seconds) : '' })) : []);
        setHrZones(d.hr_zones ? d.hr_zones.map(z => ({ zone: z.zone || '', minutes: z.minutes || '' })) : []);
        
        setOfficialTime(d.official_time_seconds ? formatDuration(d.official_time_seconds) : '');
        setPosition(d.position || '');
        setCompletedRaceType(d.race_type || '10k');
        
        // Load photos (for display only, we won't allow replacing them here in simple edit)
        if (r.photo_paths && r.photo_paths.length > 0) {
           // We just show a placeholder or load them if needed. For now, empty or mock if editing.
        }
      }
    }
  }, [initialMode, eventIdToEdit, runIdToEdit, raceEvents, runs]);

  // Handle Photo Selection
  const handlePhotoSelected = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const remaining = MAX_PHOTOS - runPhotos.length;
    if (remaining <= 0) {
      setErrorMsg(`Máximo de ${MAX_PHOTOS} imagens.`);
      return;
    }
    
    // Read files as Data URLs
    files.slice(0, remaining).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setRunPhotos(prev => [...prev, { file, dataUrl: ev.target.result }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (index) => {
    setRunPhotos(prev => prev.filter((_, i) => i !== index));
  };

  // ----------------------------------
  // SAVE CORRIDA (Runs Table)
  // ----------------------------------
  const handleSaveCorrida = async () => {
    if (!runName.trim()) {
      setErrorMsg('Preenche o nome da corrida.');
      return;
    }
    
    setIsSubmitting(true);
    setErrorMsg('');

    try {
      // 1. Upload photos if any
      let uploadedPaths = [];
      if (runPhotos.length > 0) {
        for (const p of runPhotos) {
          if (p.file) {
            const ext = p.file.name.split('.').pop() || 'jpg';
            const fileName = `${profile.id}_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
            const { error: uploadErr } = await supabase.storage.from('run-photos').upload(fileName, p.file);
            if (!uploadErr) uploadedPaths.push(fileName);
          } else if (p.url) {
            uploadedPaths.push(p.url); // keep existing
          }
        }
      }

      const distVal = parseFloat(runDistance);
      const durSecs = parseDurationToSeconds(runDuration);
      
      const parsedSplits = splits.map(s => ({
        distance_km: parseFloat(s.distance_km) || null,
        time_seconds: parseDurationToSeconds(s.minutes)
      })).filter(s => s.distance_km || s.time_seconds);

      const details = {
        elevation_gain_m: parseInt(elevationGain) || null,
        cadence_spm: parseInt(cadence) || null,
        calories_kcal: parseInt(calories) || null,
        vo2_max: parseFloat(vo2Max) || null,
        avg_heart_rate_bpm: parseInt(avgHeartRate) || null,
        max_heart_rate_bpm: parseInt(maxHeartRate) || null,
      };

      const parsedHrZones = hrZones
        .map(z => ({ zone: parseInt(z.zone) || null, minutes: parseInt(z.minutes) || null }))
        .filter(z => z.zone && z.minutes);
      if (parsedHrZones.length > 0) {
        details.hr_zones = parsedHrZones;
      }

      if (runKind === 'treino') {
        if (warmupMinutes) details.warmup_minutes = parseInt(warmupMinutes);
        if (recoverySeconds) details.recovery_seconds = parseInt(recoverySeconds);
        if (parsedSplits.length) details.splits = parsedSplits;
      } else {
        details.race_type = completedRaceType;
        if (officialTime) details.official_time_seconds = parseDurationToSeconds(officialTime);
        if (position) details.position = parseInt(position);
      }

      const payload = {
        user_id: profile.id,
        date: runDate,
        name: runName.trim(),
        kind: runKind,
        training_type: runKind === 'treino' ? runTrainingType : null,
        distance_km: !isNaN(distVal) ? distVal : null,
        duration_seconds: durSecs,
        effort_rpe: runEffortRpe || null,
        details: Object.keys(details).length > 0 ? details : null,
        photo_paths: uploadedPaths.length > 0 ? uploadedPaths : null
      };

      if (runIdToEdit) {
        const { error } = await supabase.from('runs').update(payload).eq('id', runIdToEdit);
        if (error) throw error;
        setRuns(runs.map(r => r.id === runIdToEdit ? { ...r, ...payload } : r));
      } else {
        const { data, error } = await supabase.from('runs').insert([payload]).select().single();
        if (error) throw error;
        setRuns([...runs, data]);
      }

      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ----------------------------------
  // SAVE PROVA (RaceEvents Table)
  // ----------------------------------
  const handleSaveProva = async () => {
    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const targetTimeSecs = parseDurationToSeconds(raceTargetTime);
      const targetTimeMins = targetTimeSecs ? Math.round(targetTimeSecs / 60) : null;
      
      const payload = {
        user_id: profile.id,
        date: raceDate,
        race_type: raceType,
        name: raceName.trim(),
        location: raceLocation.trim() || null,
        target_time_minutes: targetTimeMins,
        equipment: raceEquipment.trim() || null,
        notes: raceNotes.trim() || null,
        status: 'agendada'
      };

      if (eventIdToEdit) {
        const { error } = await supabase.from('race_events').update(payload).eq('id', eventIdToEdit);
        if (error) throw error;
        setRaceEvents(raceEvents.map(e => e.id === eventIdToEdit ? { ...e, ...payload } : e));
      } else {
        const { data, error } = await supabase.from('race_events').insert([payload]).select().single();
        if (error) throw error;
        setRaceEvents([...raceEvents, data]);
      }

      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ----------------------------------
  // RENDER CORRIDA (Runs)
  // ----------------------------------
  const renderCorridaForm = () => {
    const isRepeatType = runKind === 'treino' && RUN_REPEAT_TRAINING_TYPES.has(runTrainingType);

    return (
      <div className="space-y-4 fade-in pb-10">
        
        {/* Bloco 1: Detalhes Básicos */}
        <div 
          className="rounded-2xl p-4 shadow-sm"
          style={{ background: 'linear-gradient(135deg, rgba(217, 70, 239, 0.03), rgba(217, 70, 239, 0.08))', borderLeft: '3px solid var(--mod-corrida-to)' }}
        >
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <SneakerIcon className="w-5 h-5" style={{ color: 'var(--mod-corrida-to)' }} />
              <h2 className="text-[15px] font-bold text-slate-800">{runIdToEdit ? 'Editar Corrida' : 'Nova Corrida'}</h2>
            </div>
            <button onClick={onClose} className="text-[12px] text-slate-400 hover:text-slate-600 transition font-medium">Cancelar</button>
          </div>

          <div className="flex gap-2 mb-4">
            <button 
              onClick={() => setRunKind('treino')}
              className={`flex-1 rounded-2xl py-2.5 text-[13px] font-bold transition border shadow-sm ${runKind === 'treino' ? 'border-[var(--mod-corrida-to)] bg-[var(--mod-corrida-to)] text-white' : 'border-slate-200 bg-white text-slate-500'}`}
            >
              Treino
            </button>
            <button 
              onClick={() => setRunKind('competicao')}
              className={`flex-1 rounded-2xl py-2.5 text-[13px] font-bold transition border shadow-sm ${runKind === 'competicao' ? 'border-[var(--mod-corrida-to)] bg-[var(--mod-corrida-to)] text-white' : 'border-slate-200 bg-white text-slate-500'}`}
            >
              Competição
            </button>
          </div>

          {runKind === 'treino' && (
            <div className="mb-4">
              <label className="text-[12px] text-slate-500 mb-1.5 block">Tipo de treino</label>
              <select 
                value={runTrainingType} 
                onChange={e => setRunTrainingType(e.target.value)}
                className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-3 text-[14px] text-slate-800 outline-none focus:border-[var(--mod-corrida-to)] transition"
              >
                <optgroup label="Corrida solta">
                  <option value="continuo">Contínuo</option>
                  <option value="longo">Longo</option>
                  <option value="recuperacao">Recuperação</option>
                </optgroup>
                <optgroup label="Estruturado">
                  <option value="tempo">Ritmo (Tempo)</option>
                  <option value="intervalado">Intervalado</option>
                  <option value="fartlek">Fartlek</option>
                  <option value="progressivo">Progressivo</option>
                  <option value="series">Séries</option>
                </optgroup>
              </select>
              <p className="text-[10px] text-slate-400 mt-1.5">A maioria das corridas é "Contínuo" — só muda se for um treino estruturado.</p>
            </div>
          )}

          <div className="mb-4">
            <label className="text-[12px] text-slate-500 mb-1.5 block">Data da corrida</label>
            <input 
              type="date" 
              value={runDate} 
              max={todayISO()} 
              onChange={e => setRunDate(e.target.value)}
              className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2.5 text-[14px] text-slate-800 outline-none focus:border-[var(--mod-corrida-to)] transition" 
            />
          </div>

          <div className="mb-4">
            <label className="text-[12px] text-slate-500 mb-1.5 block">Nível de esforço (RPE, opcional)</label>
            <div className="flex gap-1.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <button 
                  key={i}
                  onClick={() => setRunEffortRpe(runEffortRpe === i + 1 ? 0 : i + 1)}
                  className={`flex-1 aspect-square rounded-lg flex items-center justify-center text-[13px] font-bold transition-colors border shadow-sm ${runEffortRpe === i + 1 ? 'bg-[var(--mod-corrida-to)] text-white border-[var(--mod-corrida-to)]' : 'bg-white border-slate-200 text-slate-400'}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-1">
            <label className="text-[12px] text-slate-500 mb-1.5 block">Nome da corrida <span className="text-red-400">*</span></label>
            <input 
              type="text" 
              value={runName} 
              onChange={e => setRunName(e.target.value)}
              className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2.5 text-[14px] text-slate-800 outline-none focus:border-[var(--mod-corrida-to)] transition" 
            />
            <p className="text-[10px] text-slate-400 mt-1.5">Sugestão automática — muda se quiseres.</p>
          </div>
        </div>

        {/* Bloco 2: Fotos e IA */}
        <div 
          className="rounded-2xl p-4 shadow-sm"
          style={{ background: 'linear-gradient(135deg, rgba(217, 70, 239, 0.03), rgba(217, 70, 239, 0.08))', borderLeft: '3px solid var(--mod-corrida-to)' }}
        >
          {runPhotos.length > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {runPhotos.map((p, i) => (
                  <div key={i} className="relative aspect-square">
                    <img src={p.dataUrl} className="w-full h-full object-cover rounded-xl border border-slate-200" alt={`Print ${i+1}`} />
                    <button onClick={() => removePhoto(i)} className="absolute top-1 right-1 bg-slate-900/80 rounded-full p-1 text-white hover:bg-red-500 transition">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] text-slate-500">{runPhotos.length} print(s) · máx {MAX_PHOTOS}</span>
                <button onClick={() => setRunPhotos([])} className="text-[11px] text-slate-500 hover:text-red-400 flex items-center gap-1 transition">
                  <Trash2 className="w-3.5 h-3.5" /> Limpar todos
                </button>
              </div>
              {runPhotos.length < MAX_PHOTOS && (
                <label className="flex items-center justify-center gap-2 border-2 border-dashed border-[var(--mod-corrida-to)]/40 rounded-xl py-3 text-center cursor-pointer hover:bg-[var(--mod-corrida-to)]/5 transition mb-3">
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelected} />
                  <ImagePlus className="w-4 h-4 text-[var(--mod-corrida-to)]" />
                  <span className="text-[12px] font-bold text-[var(--mod-corrida-to)]">Adicionar outro print</span>
                </label>
              )}
            </>
          ) : (
            <label className="block border-2 border-dashed border-slate-300 rounded-xl py-6 text-center cursor-pointer hover:border-slate-400 transition mb-3 bg-white/50">
              <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelected} />
              <ImagePlus className="w-7 h-7 text-slate-400 mx-auto mb-2" />
              <p className="text-[12px] text-slate-500 font-bold">Escolhe os prints da app de corrida (Strava, Garmin...)</p>
              <p className="text-[10px] text-slate-400 mt-1 px-4">A IA lê a distância, duração, tipo de treino e splits automaticamente</p>
            </label>
          )}

          <button 
            onClick={() => alert('Análise IA será implementada na próxima fase!')}
            disabled={!runPhotos.length || analyzingRun}
            className="w-full bg-[var(--accent)] text-slate-900 font-bold text-[14px] rounded-xl py-3 flex items-center justify-center gap-1.5 active:scale-[0.98] transition shadow-sm disabled:opacity-30"
          >
            {analyzingRun ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {analyzingRun ? 'A ler com IA...' : 'Analisar Corrida'}
          </button>
        </div>

        {/* Bloco 3: Detalhes Manuais */}
        <div 
          className="rounded-2xl p-4 shadow-sm"
          style={{ background: 'linear-gradient(135deg, rgba(217, 70, 239, 0.03), rgba(217, 70, 239, 0.08))', borderLeft: '3px solid var(--mod-corrida-to)' }}
        >
          <p className="text-[13px] font-bold text-slate-700 mb-4 flex items-center gap-1.5">
            <PencilLine className="w-4 h-4 text-slate-500" /> Registo manual <span className="text-slate-400 font-normal">— sem foto</span>
          </p>

          {/* Metrics Grid inside "Métricas do relógio" sub-container */}
          <div className="rounded-xl border border-slate-200 bg-white/50 p-3 mb-4">
            <p className="text-[12px] font-bold text-slate-500 mb-2.5">Métricas do relógio (opcional)</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <input 
                type="number" placeholder="Desnível (m)" 
                value={elevationGain} onChange={e=>setElevationGain(e.target.value)} 
                className="w-full bg-slate-100/50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-800 outline-none focus:border-slate-400 transition" 
              />
              <input 
                type="number" placeholder="Cadência (passadas/min)" 
                value={cadence} onChange={e=>setCadence(e.target.value)} 
                className="w-full bg-slate-100/50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-800 outline-none focus:border-slate-400 transition" 
              />
              <input 
                type="number" placeholder="Calorias (kcal)" 
                value={calories} onChange={e=>setCalories(e.target.value)} 
                className="w-full bg-slate-100/50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-800 outline-none focus:border-slate-400 transition" 
              />
              <input 
                type="number" step="0.1" placeholder="VO2 máx" 
                value={vo2Max} onChange={e=>setVo2Max(e.target.value)} 
                className="w-full bg-slate-100/50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-800 outline-none focus:border-slate-400 transition" 
              />
              <input 
                type="number" placeholder="FC média (bpm)" 
                value={avgHeartRate} onChange={e=>setAvgHeartRate(e.target.value)} 
                className="w-full bg-slate-100/50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-800 outline-none focus:border-slate-400 transition" 
              />
              <input 
                type="number" placeholder="FC máxima (bpm)" 
                value={maxHeartRate} onChange={e=>setMaxHeartRate(e.target.value)} 
                className="w-full bg-slate-100/50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-800 outline-none focus:border-slate-400 transition" 
              />
            </div>

            {/* FC Zones */}
            <div className="flex items-center justify-between mt-3 mb-2">
              <label className="text-[12px] text-slate-500">Zonas de FC (tempo em cada zona)</label>
              <button 
                onClick={() => setHrZones([...hrZones, { zone: '', minutes: '' }])} 
                type="button" 
                className="text-[12px] text-[#f07167] font-semibold flex items-center gap-1 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar zona
              </button>
            </div>
            {hrZones.length === 0 ? (
              <p className="text-[11px] text-slate-400">Sem zonas ainda — usa "Adicionar zona" para cada uma que o relógio mostrar.</p>
            ) : (
              hrZones.map((z, idx) => (
                <div key={idx} className="flex items-center gap-1.5 mb-1.5">
                  <select 
                    value={z.zone} 
                    onChange={e => {
                      const copy = [...hrZones]; copy[idx].zone = e.target.value; setHrZones(copy);
                    }} 
                    className="bg-slate-100/50 border border-slate-200 rounded-xl px-2 py-2 text-xs text-slate-800 outline-none"
                  >
                    <option value="">Zona</option>
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>Z{n}</option>)}
                  </select>
                  <input 
                    type="number" placeholder="Minutos" 
                    value={z.minutes} 
                    onChange={e => {
                      const copy = [...hrZones]; copy[idx].minutes = e.target.value; setHrZones(copy);
                    }} 
                    className="w-full bg-slate-100/50 border border-slate-200 rounded-xl px-2 py-2 text-xs text-slate-800 outline-none" 
                  />
                  <button 
                    onClick={() => setHrZones(hrZones.filter((_, i) => i !== idx))} 
                    type="button" 
                    className="p-1 text-slate-400 hover:text-red-500"
                  >
                    <X className="w-3.5 h-3.5"/>
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Repeat Specifics */}
          {runKind === 'treino' && isRepeatType && (
            <div className="bg-white/50 rounded-xl p-3 border border-slate-200 mb-4">
              <p className="text-[12px] font-semibold text-slate-500 mb-2">Estrutura da Sessão</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Aquecimento (min)</label>
                  <input type="number" value={warmupMinutes} onChange={e=>setWarmupMinutes(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2 py-1.5 text-xs outline-none" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Recuperação (seg)</label>
                  <input type="number" value={recoverySeconds} onChange={e=>setRecoverySeconds(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2 py-1.5 text-xs outline-none" />
                </div>
              </div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] text-slate-500">Splits (voltas)</label>
                <button onClick={() => setSplits([...splits, { distance_km: '', minutes: '' }])} className="text-[11px] text-[var(--accent)] font-bold flex items-center gap-0.5">
                  <Plus className="w-3 h-3" /> Adicionar split
                </button>
              </div>
              {splits.map((s, i) => (
                <div key={i} className="flex gap-1 mb-1.5 items-center">
                  <span className="text-[10px] text-slate-400 w-3">{i+1}.</span>
                  <input type="number" step="0.01" placeholder="km" value={s.distance_km} onChange={e => {
                    const newSplits = [...splits]; newSplits[i].distance_km = e.target.value; setSplits(newSplits);
                  }} className="w-20 bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs" />
                  <input type="text" placeholder="Tempo" value={s.minutes} onChange={e => {
                    const newSplits = [...splits]; newSplits[i].minutes = e.target.value; setSplits(newSplits);
                  }} className="flex-1 bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs" />
                  <button onClick={() => setSplits(splits.filter((_, idx) => idx !== i))} className="p-1 text-slate-400 hover:text-red-500"><X className="w-3.5 h-3.5"/></button>
                </div>
              ))}
            </div>
          )}

          {/* Competition Specifics */}
          {runKind === 'competicao' && (
            <div className="grid grid-cols-2 gap-2 mb-4 bg-white/50 border border-slate-200 rounded-xl p-3">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">Tempo Oficial</label>
                <input type="text" placeholder="ex: 1:45:00" value={officialTime} onChange={e=>setOfficialTime(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2 py-1.5 text-xs outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">Posição</label>
                <input type="number" placeholder="ex: 12" value={position} onChange={e=>setPosition(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2 py-1.5 text-xs outline-none" />
              </div>
            </div>
          )}

          {/* Main Manual Fields */}
          <div className="relative mb-3">
            <input 
              type="number" min="0" step="0.01" 
              placeholder={isRepeatType ? 'Distância total (opcional)' : 'Distância'} 
              value={runDistance} onChange={e => setRunDistance(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-3 pr-10 py-3 text-sm text-slate-800 outline-none focus:border-slate-400 transition" 
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-medium text-slate-400 pointer-events-none">km</span>
          </div>
          
          <input 
            type="text" 
            placeholder={isRepeatType ? 'Duração total (ex.: 43m ou 37:57)' : (runKind==='competicao' ? 'Tempo pessoal (ex.: 1:11:26)' : 'Duração (ex.: 43m ou 37:57)')}
            value={runDuration} onChange={e => setRunDuration(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-3 text-sm text-slate-800 outline-none focus:border-slate-400 transition mb-4" 
          />

          {errorMsg && <p className="text-red-500 text-[13px] font-medium mt-3 mb-3">{errorMsg}</p>}

          <button 
            onClick={handleSaveCorrida}
            disabled={isSubmitting}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-[13px] font-bold rounded-xl py-3 flex items-center justify-center gap-1.5 active:scale-[0.98] transition border border-slate-200 shadow-sm"
          >
            {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> A gravar...</> : <><PencilLine className="w-4 h-4 text-slate-500" /> Registar Corrida Manualmente</>}
          </button>
        </div>
      </div>
    );
  };

  // ----------------------------------
  // RENDER PROVA (Race Events)
  // ----------------------------------
  const renderProvaForm = () => {
    return (
      <div className="space-y-4 fade-in">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">Data da prova</label>
            <input 
              type="date" 
              value={raceDate} 
              onChange={e => setRaceDate(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none focus:border-[var(--accent)]" 
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">Distância</label>
            <select 
              value={raceType} 
              onChange={e => setRaceType(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none focus:border-[var(--accent)]"
            >
              {RACE_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-[11px] text-slate-500 mb-1 block">Nome da Prova</label>
          <input 
            type="text" 
            placeholder="Ex: Meia Maratona de Lisboa" 
            value={raceName} 
            onChange={e => setRaceName(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none focus:border-[var(--accent)]" 
          />
        </div>

        <div>
          <label className="text-[11px] text-slate-500 mb-1 block">Localização (Opcional)</label>
          <input 
            type="text" 
            placeholder="Ex: Ponte 25 de Abril" 
            value={raceLocation} 
            onChange={e => setRaceLocation(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none focus:border-[var(--accent)]" 
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">Tempo Alvo (Opcional)</label>
            <input 
              type="text" 
              placeholder="Ex: 1:45:00" 
              value={raceTargetTime} 
              onChange={e => setRaceTargetTime(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none focus:border-[var(--accent)]" 
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">Sapatilhas (Opcional)</label>
            <input 
              type="text" 
              placeholder="Ex: Vaporfly" 
              value={raceEquipment} 
              onChange={e => setRaceEquipment(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none focus:border-[var(--accent)]" 
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] text-slate-500 mb-1 block">Notas (Opcional)</label>
          <textarea 
            rows="2" 
            placeholder="Logística, nutrição planeada..." 
            value={raceNotes} 
            onChange={e => setRaceNotes(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none focus:border-[var(--accent)] resize-none" 
          />
        </div>

        {errorMsg && <p className="text-red-500 text-xs text-center mt-2 font-medium">{errorMsg}</p>}

        <button 
          onClick={handleSaveProva}
          disabled={isSubmitting || !raceName.trim()}
          className="w-full bg-[var(--accent)] text-neutral-950 font-bold text-sm rounded-2xl py-3.5 flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-lg disabled:opacity-50 mt-2"
        >
          {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> A guardar...</> : <><Check className="w-5 h-5" /> Agendar Prova</>}
        </button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto">
      <div className="min-h-screen pb-10">
        <div className="p-4 pt-6 max-w-lg mx-auto">
          {mode === 'corrida' ? renderCorridaForm() : renderProvaForm()}
        </div>
      </div>
    </div>
  );
}
