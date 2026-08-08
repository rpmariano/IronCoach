import React, { useState, useEffect } from 'react';
import { ImagePlus, X, Trash2, Loader2, Sparkles, PencilLine, Plus } from 'lucide-react';
import { useAppStore } from '../../store';
import { supabase, invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import { compressImage } from '../../lib/image';
import { CoachAnalyzeButton } from '../shared/CoachButton';
import { parseDurationToSeconds, formatDuration } from '../../utils/run';

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


/* Espelha TRAINING_TYPE_KEYS/LABELS em supabase/functions/analyze-run —
   têm de bater certo com o enum fixo do schema que o Gemini usa. O conjunto
   anterior (intervalado/progressivo/series) não existia nesse enum: a
   função descartava-o em silêncio e gravava training_type: null. */
const RUN_TRAINING_TYPES = [
  { key: 'continuo', label: 'Contínuo', group: 'Corrida solta' },
  { key: 'longo', label: 'Longo', group: 'Corrida solta' },
  { key: 'recuperacao', label: 'Recuperação', group: 'Corrida solta' },
  { key: 'tempo', label: 'Ritmo (Tempo)', group: 'Estruturado' },
  { key: 'fartlek', label: 'Fartlek', group: 'Estruturado' },
  { key: 'intervalos', label: 'Intervalos', group: 'Estruturado' },
  { key: 'subidas', label: 'Subidas', group: 'Trilho' },
  { key: 'trail', label: 'Trail', group: 'Trilho' },
  { key: 'tecnico', label: 'Técnico (trilho)', group: 'Trilho' },
];

const RUN_REPEAT_TRAINING_TYPES = new Set(['intervalos', 'subidas']);

/* Só o detalhe de competição de uma corrida já feita (runs.details.race_type)
   — não confundir com o tipo de prova da Agenda (tabela race_events, editada
   em RunAgenda.jsx), que é um conceito diferente e sem ligação a esta lista. */
const COMPLETED_RACE_TYPES = [
  { key: 'estrada', label: 'Estrada' },
  { key: 'trail', label: 'Trail' },
  { key: 'ultra', label: 'Ultra' },
  { key: '5k', label: '5 km' },
  { key: '10k', label: '10 km' },
  { key: '21k', label: 'Meia maratona' },
  { key: '42k', label: 'Maratona' },
  { key: 'outro', label: 'Outro' },
];

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// Convert "43m" or "37:57" or "1:11:26" to seconds
const MAX_PHOTOS = 6; // espelha MAX_PHOTOS em supabase/functions/analyze-run

// A Agenda de Provas (raceEvents) tem o próprio formulário dedicado em
// RunAgenda.jsx — este componente só regista corridas (tabela runs).
export default function RunRegistration({ onClose, dateIso = null, runIdToEdit = null }) {
  const { profile, runs, setRuns } = useAppStore();

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
  const [maxCadence, setMaxCadence] = useState('');
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
  // Um único cartão, forma de introdução escolhida em vez de 2 blocos
  // sempre visíveis — só um dos dois fica ativo/clicável a cada vez, por
  // isso não há risco de o utilizador preencher os dois em paralelo.
  const [entryMethod, setEntryMethod] = useState('foto'); // 'foto' | 'manual'
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Partilhado pelos dois caminhos de Corrida (foto e manual) — só um dos
  // dois blocos está visível a cada vez (ver entryMethod), por isso já não
  // há risco de a mesma mensagem aparecer em dois sítios ao mesmo tempo.
  const [errorMsg, setErrorMsg] = useState('');

  // Load existing data if editing
  useEffect(() => {
    if (runIdToEdit) {
      const r = runs.find(r => r.id === runIdToEdit);
      if (r) {
        // Editar é sempre pelos campos — a IA por foto é só para criar (e,
        // numa corrida já criada por foto, "Reanalisar" no cartão é a ação
        // dedicada a isso).
        setEntryMethod('manual');
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
        setMaxCadence(d.max_cadence_spm || '');
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
  }, [runIdToEdit, runs]);

  // Handle Photo Selection — comprime e normaliza para JPEG antes de guardar
  // (ver src/lib/image.js); o .base64 resultante é o que vai no pedido de
  // análise por IA.
  const handlePhotoSelected = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const remaining = MAX_PHOTOS - runPhotos.length;
    if (remaining <= 0) {
      setErrorMsg(`Máximo de ${MAX_PHOTOS} imagens.`);
      return;
    }

    for (const file of files.slice(0, remaining)) {
      try {
        const { dataUrl, base64 } = await compressImage(file);
        setRunPhotos(prev => [...prev, { dataUrl, base64 }]);
      } catch (err) {
        console.warn('Falha a processar imagem', err);
      }
    }
  };

  const removePhoto = (index) => {
    setRunPhotos(prev => prev.filter((_, i) => i !== index));
  };

  // ----------------------------------
  // ANALISAR CORRIDA (IA — analyze-run)
  // ----------------------------------
  // Fotos são só para este caminho: o registo manual (handleSaveCorrida)
  // nunca teve anexos de foto, no vanilla nem aqui — evita duas rotas a
  // gravar a mesma corrida de formas diferentes (uma comprimida e analisada
  // pela IA, outra crua e sem análise nenhuma).
  const handleAnalyzeRun = async () => {
    if (!runPhotos.length || analyzingRun) return;

    if (!runName.trim()) {
      setErrorMsg('Preenche o nome da corrida.');
      return;
    }
    if (runKind === 'treino' && !runTrainingType) {
      setErrorMsg('Escolhe o tipo de treino.');
      return;
    }
    if (runKind === 'competicao' && !completedRaceType) {
      setErrorMsg('Escolhe a disciplina.');
      return;
    }

    setAnalyzingRun(true);
    setErrorMsg('');
    try {
      const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-run', {
        body: {
          images: runPhotos.map(p => p.base64),
          mime_type: 'image/jpeg',
          date: runDate,
          kind: runKind,
          name: runName.trim(),
          name_is_auto: false,
          effort_rpe: runEffortRpe || null,
          training_type: runKind === 'treino' ? runTrainingType : null,
          race_type: runKind === 'competicao' ? completedRaceType : null,
        },
      });
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);

      setRuns([...runs, data.run]);
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha na análise. Tenta novamente.');
    } finally {
      setAnalyzingRun(false);
    }
  };

  // ----------------------------------
  // SAVE CORRIDA (Runs Table) — registo manual
  // ----------------------------------
  // A criar uma corrida nova, passa pelo mesmo Coach que o caminho de fotos
  // — modo "manual" da analyze-run: sem imagens, gera só o comentário a
  // partir dos números que o próprio formulário já tem. A editar uma
  // corrida existente mantém-se o update direto (sem reanálise — essa é a
  // ação dedicada "Reanalisar" no cartão da corrida).
  const handleSaveCorrida = async () => {
    if (!runName.trim()) {
      setErrorMsg('Preenche o nome da corrida.');
      return;
    }
    if (runKind === 'treino' && !runTrainingType) {
      setErrorMsg('Escolhe o tipo de treino.');
      return;
    }
    if (runKind === 'competicao' && !completedRaceType) {
      setErrorMsg('Escolhe a disciplina.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const distVal = parseFloat(runDistance);
      const durSecs = parseDurationToSeconds(runDuration);

      const parsedSplits = splits.map(s => ({
        distance_km: parseFloat(s.distance_km) || null,
        time_seconds: parseDurationToSeconds(s.minutes)
      })).filter(s => s.distance_km || s.time_seconds);

      const parsedHrZones = hrZones
        .map(z => ({ zone: parseInt(z.zone) || null, minutes: parseInt(z.minutes) || null }))
        .filter(z => z.zone && z.minutes);

      if (runIdToEdit) {
        const details = {
          elevation_gain_m: parseInt(elevationGain) || null,
          cadence_spm: parseInt(cadence) || null,
          max_cadence_spm: parseInt(maxCadence) || null,
          calories_kcal: parseInt(calories) || null,
          vo2_max: parseFloat(vo2Max) || null,
          avg_heart_rate_bpm: parseInt(avgHeartRate) || null,
          max_heart_rate_bpm: parseInt(maxHeartRate) || null,
        };
        if (parsedHrZones.length > 0) details.hr_zones = parsedHrZones;
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
          date: runDate,
          name: runName.trim(),
          kind: runKind,
          training_type: runKind === 'treino' ? runTrainingType : null,
          distance_km: !isNaN(distVal) ? distVal : null,
          duration_seconds: durSecs,
          effort_rpe: runEffortRpe || null,
          details: Object.keys(details).length > 0 ? details : null,
        };
        const { error } = await supabase.from('runs').update(payload).eq('id', runIdToEdit);
        if (error) throw error;
        setRuns(runs.map(r => r.id === runIdToEdit ? { ...r, ...payload } : r));
        onClose();
        return;
      }

      const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-run', {
        body: {
          mode: 'manual',
          date: runDate,
          kind: runKind,
          name: runName.trim(),
          effort_rpe: runEffortRpe || null,
          training_type: runKind === 'treino' ? runTrainingType : null,
          race_type: runKind === 'competicao' ? completedRaceType : null,
          distance_km: !isNaN(distVal) ? distVal : null,
          duration_seconds: durSecs,
          elevation_gain_m: parseInt(elevationGain) || null,
          cadence_spm: parseInt(cadence) || null,
          max_cadence_spm: parseInt(maxCadence) || null,
          calories_kcal: parseInt(calories) || null,
          vo2_max: parseFloat(vo2Max) || null,
          avg_heart_rate_bpm: parseInt(avgHeartRate) || null,
          max_heart_rate_bpm: parseInt(maxHeartRate) || null,
          hr_zones: parsedHrZones.length ? parsedHrZones : null,
          warmup_minutes: warmupMinutes ? parseInt(warmupMinutes) : null,
          recovery_seconds: recoverySeconds ? parseInt(recoverySeconds) : null,
          splits: parsedSplits.length ? parsedSplits : null,
          official_time_seconds: officialTime ? parseDurationToSeconds(officialTime) : null,
          position: position ? parseInt(position) : null,
        },
      });
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);

      setRuns([...runs, data.run]);
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha a gravar a corrida. Tenta novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ----------------------------------
  // RENDER CORRIDA (Runs)
  // ----------------------------------
  const renderCorridaForm = () => {
    const isRepeatType = runKind === 'treino' && RUN_REPEAT_TRAINING_TYPES.has(runTrainingType);

    const showToggle = !runIdToEdit;
    const showFotoBlock = showToggle && entryMethod === 'foto';

    return (
      <div className="space-y-4 fade-in pb-10">

        {/* Cartão único — os campos comuns ficam sempre visíveis; a forma de
            introdução (foto/IA ou manual) decide o resto. Editar uma corrida
            existente é sempre pelos campos (ver showToggle acima) — a IA por
            foto só cria; "Reanalisar" no cartão da corrida é a ação dedicada
            a reanalisar uma corrida já criada assim. */}
        <div
          className="rounded-2xl p-4 shadow-sm"
          style={{ background: 'linear-gradient(135deg, rgba(217, 70, 239, 0.01), rgba(217, 70, 239, 0.03))', borderLeft: '2px solid var(--mod-corrida-to)' }}
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <SneakerIcon className="w-4 h-4" style={{ color: 'var(--mod-corrida-to)' }} />
              <h2 className="text-sm font-semibold text-slate-800">{runIdToEdit ? 'Editar Corrida' : 'Nova Corrida'}</h2>
            </div>
            <button onClick={onClose} className="text-[11px] text-slate-500 hover:text-red-400 transition">Cancelar</button>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-3">
            {/* Cor via style, não pela classe text-white — um override global
                (globals.css:66, "portado do legado") força text-white para
                #0f172a com !important; nestes botões o fundo é mesmo escuro/
                colorido e o texto tem de ficar branco a valer. */}
            <button
              onClick={() => setRunKind('treino')}
              style={runKind === 'treino' ? { color: '#fff' } : undefined}
              className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition border ${runKind === 'treino' ? 'bg-[var(--mod-corrida-to)] border-[var(--mod-corrida-to)]' : 'bg-white border-slate-200 text-slate-500'}`}
            >
              Treino
            </button>
            <button
              onClick={() => setRunKind('competicao')}
              style={runKind === 'competicao' ? { color: '#fff' } : undefined}
              className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition border ${runKind === 'competicao' ? 'bg-[var(--mod-corrida-to)] border-[var(--mod-corrida-to)]' : 'bg-white border-slate-200 text-slate-500'}`}
            >
              Competição
            </button>
          </div>

          {runKind === 'treino' ? (
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
                  <option value="fartlek">Fartlek</option>
                  <option value="intervalos">Intervalos</option>
                </optgroup>
                <optgroup label="Trilho">
                  <option value="subidas">Subidas</option>
                  <option value="trail">Trail</option>
                  <option value="tecnico">Técnico (trilho)</option>
                </optgroup>
              </select>
              <p className="text-[10px] text-slate-400 mt-1.5">A maioria das corridas é "Contínuo" — só muda se for um treino estruturado.</p>
            </div>
          ) : (
            <div className="mb-4">
              <label className="text-[12px] text-slate-500 mb-1.5 block">Disciplina</label>
              <select
                value={completedRaceType}
                onChange={e => setCompletedRaceType(e.target.value)}
                className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-3 text-[14px] text-slate-800 outline-none focus:border-[var(--mod-corrida-to)] transition"
              >
                {COMPLETED_RACE_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
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
                  style={runEffortRpe === i + 1 ? { color: '#fff' } : undefined}
                  className={`flex-1 aspect-square rounded-lg flex items-center justify-center text-[13px] font-bold transition-colors border shadow-sm ${runEffortRpe === i + 1 ? 'bg-[var(--mod-corrida-to)] border-[var(--mod-corrida-to)]' : 'bg-white border-slate-200 text-slate-400'}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="text-[12px] text-slate-500 mb-1.5 block">Nome da corrida <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={runName}
              onChange={e => setRunName(e.target.value)}
              className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2.5 text-[14px] text-slate-800 outline-none focus:border-[var(--mod-corrida-to)] transition"
            />
            <p className="text-[10px] text-slate-400 mt-1.5">Sugestão automática — muda se quiseres.</p>
          </div>

          {showToggle && (
            <div className="mb-4">
              <label className="text-[12px] text-slate-500 mb-1.5 block">Como queres registar?</label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setEntryMethod('foto')}
                  style={entryMethod === 'foto' ? { color: '#fff' } : undefined}
                  className={`flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'foto' ? 'bg-[var(--mod-corrida-to)] border-[var(--mod-corrida-to)]' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  <Sparkles className="w-3.5 h-3.5" /> Foto (IA)
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMethod('manual')}
                  style={entryMethod === 'manual' ? { color: '#fff' } : undefined}
                  className={`flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'manual' ? 'bg-[var(--mod-corrida-to)] border-[var(--mod-corrida-to)]' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  <PencilLine className="w-3.5 h-3.5" /> Manual
                </button>
              </div>
            </div>
          )}

          {showFotoBlock ? (
            <>
              {runPhotos.length > 0 ? (
                <>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {runPhotos.map((p, i) => (
                      <div key={i} className="relative aspect-square">
                        <img src={p.dataUrl} className="w-full h-full object-cover rounded-xl border border-slate-200" alt={`Print ${i+1}`} />
                        <button onClick={() => removePhoto(i)} style={{ color: '#fff' }} className="absolute top-1 right-1 bg-slate-900/80 rounded-full p-1 hover:bg-red-500 transition">
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

              <CoachAnalyzeButton
                onClick={handleAnalyzeRun}
                disabled={!runPhotos.length || analyzingRun}
                busy={analyzingRun}
                label="Analisar Corrida"
              />
            </>
          ) : (
            <>
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
                type="number" placeholder="Cadência média (passadas/min)"
                value={cadence} onChange={e=>setCadence(e.target.value)}
                className="w-full bg-slate-100/50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-800 outline-none focus:border-slate-400 transition"
              />
              <input
                type="number" placeholder="Cadência máxima (passadas/min)"
                value={maxCadence} onChange={e=>setMaxCadence(e.target.value)}
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
                  <button onClick={() => setSplits(splits.filter((_, idx) => idx !== i))} type="button"
                    aria-label={`Remover parcial ${i + 1}`}
                    className="tap-44 text-slate-400 hover:text-red-500 shrink-0"><X className="w-3.5 h-3.5"/></button>
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

          {runIdToEdit ? (
            // Editar é só o update dos campos — não passa pelo Coach, por
            // isso não leva o gradiente (esse é exclusivo de quem vai ser
            // analisado: criar, foto ou manual).
            <button
              onClick={handleSaveCorrida}
              disabled={isSubmitting}
              className="w-full bg-[var(--accent)] text-slate-900 font-bold text-[14px] rounded-xl py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-sm disabled:opacity-30"
            >
              {isSubmitting
                ? <><Loader2 className="w-4 h-4 animate-spin" /> A gravar...</>
                : <><PencilLine className="w-4 h-4" /> Guardar Alterações</>}
            </button>
          ) : (
            // Mesmo botão do caminho de fotos — as duas formas de criar
            // passam pelo Coach, por isso têm o mesmo botão.
            <CoachAnalyzeButton
              onClick={handleSaveCorrida}
              disabled={isSubmitting}
              busy={isSubmitting}
              label="Analisar Corrida"
            />
          )}
            </>
          )}

          {errorMsg && <p className="text-red-500 text-[13px] font-medium mt-3">{errorMsg}</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-lg mx-auto pb-10">
      {renderCorridaForm()}
    </div>
  );
}
