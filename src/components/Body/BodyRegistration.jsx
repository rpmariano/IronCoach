import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store';
import { supabase, invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import { compressImage } from '../../lib/image';
import { CoachAnalyzeButton } from '../shared/CoachButton';
import { ScanLine, X, ImagePlus, Camera, PencilLine, Loader2 } from 'lucide-react';
import { useToast } from '../shared/ToastProvider';
import UnsavedChangesModal from '../shared/UnsavedChangesModal';
import Chip from '../shared/Chip';

const BODY_METRICS = [
  { key:'weight_kg',            label:'Peso',              unit:'kg',   dec:1, color:'#dd3c71' },
  { key:'bmi',                  label:'IMC',               unit:'',     dec:1, color:'#da2fd7' },
  { key:'body_fat_pct',         label:'Gordura corporal',  unit:'%',    dec:1, color:'#dd3c94' },
  { key:'skeletal_muscle_pct',  label:'Músculo esquelético', unit:'%',  dec:1, color:'#468f19' },
  { key:'muscle_mass_kg',       label:'Massa muscular',    unit:'kg',   dec:1, color:'#2c931a' },
  { key:'body_water_pct',       label:'Água corporal',     unit:'%',    dec:1, color:'#2b82da' },
  { key:'protein_pct',          label:'Proteína',          unit:'%',    dec:1, color:'#5f8b18' },
  { key:'bone_mass_kg',         label:'Massa óssea',       unit:'kg',   dec:1, color:'#643cdd' },
  { key:'bmr_kcal',             label:'Metabolismo basal', unit:'kcal', dec:0, color:'#768618' },
  { key:'visceral_fat',         label:'Gordura visceral',  unit:'',     dec:0, color:'#bc3cdd' },
  { key:'subcutaneous_fat_pct', label:'Gordura subcutânea', unit:'%',   dec:1, color:'#1a9324' },
  { key:'metabolic_age',        label:'Idade metabólica',  unit:'anos', dec:0, color:'#1a9340' },
  { key:'lean_body_mass_kg',    label:'Massa magra',       unit:'kg',   dec:1, color:'#198f89' },
];

const MAX_PHOTOS = 6; // espelha MAX_PHOTOS em supabase/functions/analyze-body

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export default function BodyRegistration({ onClose, assessmentIdToEdit = null }) {
  const { bodyAssessments, setBodyAssessments, profile, loadInitialData, setNavGuard } = useAppStore();
  const { showToast } = useToast();
  const isEditing = !!assessmentIdToEdit;

  // Comum aos dois caminhos
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  // Um único cartão, forma de introdução à escolha — mesmo padrão da
  // Corrida e da Nutrição: só um dos dois blocos fica visível/clicável a
  // cada vez, e as duas formas passam pelo Coach.
  const [entryMethod, setEntryMethod] = useState('foto'); // 'foto' | 'manual'
  const [errorMsg, setErrorMsg] = useState('');

  // Foto (IA)
  const [photos, setPhotos] = useState([]); // [{ dataUrl, base64 }]
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Manual
  const [metrics, setMetrics] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // Edição — métricas e observações são dados ANALÍTICOS: mudá-los muda o
  // resumo do Coach e obriga a regenerá-lo. Mudar só a data é um update
  // direto, sem custo de API (mesmo padrão da Nutrição/Ginásio, ver PRD 3.2).
  const [originalSnapshot, setOriginalSnapshot] = useState(null);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  // Alvo de navegação pendente quando o navGuard intercepta uma troca de
  // separador com o formulário sujo — null quando a saída foi pedida pelo
  // botão X do próprio ecrã, sem destino nenhum.
  const pendingNavTarget = useRef(null);

  // Trava a navegação para fora deste ecrã enquanto houver alterações por
  // gravar — mesmo mecanismo usado em Perfil.jsx e RunAgenda.jsx.
  useEffect(() => {
    if (!isFormDirty) { setNavGuard(null); return; }
    setNavGuard((intendedTab) => {
      pendingNavTarget.current = intendedTab;
      setShowUnsavedModal(true);
      return false;
    });
    return () => setNavGuard(null);
  }, [isFormDirty, setNavGuard]);

  // Fechar/recarregar o separador do browser também avisa.
  useEffect(() => {
    if (!isFormDirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isFormDirty]);

  // onClose() do prop só fecha este ecrã; quando a saída veio de uma troca
  // de separador (navGuard), há ainda que completar essa navegação depois
  // de fechar — senão o utilizador ficava preso no ecrã Início/Ginásio/etc.
  // que já estava aberto antes de pedir para sair.
  // Chama o onClose() do PROP diretamente (nunca handleClose) — é a saída
  // da recursão. Tudo o resto no ficheiro que antes fechava com onClose()
  // foi trocado para handleClose(), precisamente para passar por aqui.
  const handleClose = () => {
    const target = pendingNavTarget.current;
    pendingNavTarget.current = null;
    onClose();
    if (target) {
      // O guard ainda está registado neste render — o próprio setActiveTab()
      // chamado a seguir voltaria a cair nele e a bloquear-se a si mesmo,
      // porque onClose() só desmonta este ecrã no próximo render, não já.
      // Limpar primeiro é o que falta para a navegação pendente completar
      // (mesmo detalhe já usado em Perfil.jsx/RunAgenda.jsx).
      setNavGuard(null);
      useAppStore.getState().setActiveTab(target);
    }
  };

  // Ao gravar uma avaliação NOVA (foto ou manual), vai sempre para o
  // Calendário, aberto no dia da avaliação — mesmo padrão de
  // RunAgenda.jsx (Prova) via pendingCalendarDate no store. Se isto veio
  // de "Gravar e sair" a caminho de outro separador (navGuard
  // intercetado), respeita esse destino em vez de o substituir — por isso
  // o alvo pendente é lido ANTES de handleClose() o consumir.
  const finishCreateAndGoToCalendar = () => {
    const hadPendingNav = !!pendingNavTarget.current;
    handleClose();
    if (!hadPendingNav) {
      setNavGuard(null);
      useAppStore.getState().setPendingCalendarDate(date);
      useAppStore.getState().setActiveTab('calendario');
    }
  };

  const analyticalSignature = (notesValue, metricsValue) => JSON.stringify({
    notes: (notesValue || '').trim(),
    metrics: BODY_METRICS.reduce((acc, m) => {
      const raw = metricsValue?.[m.key];
      acc[m.key] = raw === undefined || raw === '' || raw === null ? null : Number(raw);
      return acc;
    }, {}),
  });

  useEffect(() => {
    if (!assessmentIdToEdit) return;
    const a = bodyAssessments.find(x => x.id === assessmentIdToEdit);
    if (!a) return;
    setDate(a.date || todayISO());
    setNotes(a.notes || '');
    const loaded = {};
    for (const m of BODY_METRICS) {
      if (a[m.key] !== null && a[m.key] !== undefined) loaded[m.key] = String(a[m.key]);
    }
    setMetrics(loaded);
    setOriginalSnapshot(analyticalSignature(a.notes, loaded));
    setEntryMethod('manual');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentIdToEdit]);

  const needsReanalysis = isEditing
    && originalSnapshot !== null
    && analyticalSignature(notes, metrics) !== originalSnapshot;

  const handleMetricChange = (key, value) => {
    setIsFormDirty(true);
    setMetrics(prev => ({ ...prev, [key]: value }));
  };

  // ----------------------------------
  // GUARDAR ALTERAÇÕES (edição) — dois caminhos:
  //   • Métricas ou observações mudaram → passa pelo Coach (analyze-body em
  //     mode manual com assessment_id), que regenera o resumo.
  //   • Só a data mudou → update direto, sem chamada ao Gemini.
  // ----------------------------------
  const handleSaveEdit = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setErrorMsg('');
    try {
      if (needsReanalysis) {
        const payloadMetrics = {};
        for (const m of BODY_METRICS) {
          if (metrics[m.key] !== undefined && metrics[m.key] !== '') {
            payloadMetrics[m.key] = parseFloat(metrics[m.key]);
          }
        }
        const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-body', {
          body: {
            mode: 'manual',
            assessment_id: assessmentIdToEdit,
            date,
            notes: notes.trim() || null,
            metrics: payloadMetrics,
          },
        });
        if (error) throw new Error(error);
        if (data?.error) throw new Error(data.error);
      } else {
        const { error } = await supabase
          .from('body_assessments')
          .update({ date })
          .eq('id', assessmentIdToEdit);
        if (error) throw error;
      }

      if (profile?.id) await loadInitialData(profile.id);
      showToast(needsReanalysis ? 'Avaliação reanalisada pelo Coach' : 'Avaliação atualizada');
      handleClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha a guardar alterações. Tenta novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Photo Selection — comprime e normaliza para JPEG (src/lib/image.js,
  // partilhado com a Corrida/Refeição); o .base64 resultante é o que vai no
  // pedido de análise por IA.
  const handlePhotoSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      setErrorMsg(`Máximo de ${MAX_PHOTOS} fotos.`);
      return;
    }
    for (const file of files.slice(0, remaining)) {
      try {
        const { dataUrl, base64 } = await compressImage(file);
        setPhotos(prev => [...prev, { dataUrl, base64 }]);
      } catch (err) {
        console.warn('Falha a processar imagem', err);
      }
    }
  };

  const removePhoto = (idx) => setPhotos(prev => prev.filter((_, i) => i !== idx));

  // ----------------------------------
  // ANALISAR AVALIAÇÃO POR FOTO (IA — analyze-body)
  // ----------------------------------
  const handleAnalyzePhotos = async () => {
    if (!photos.length || isAnalyzing) return;
    setIsAnalyzing(true);
    setErrorMsg('');
    try {
      const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-body', {
        body: {
          images: photos.map(p => p.base64),
          mime_type: 'image/jpeg',
          date,
          notes: notes.trim() || null,
        },
      });
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);

      setBodyAssessments([data.assessment, ...bodyAssessments]);
      showToast('Avaliação registada');
      finishCreateAndGoToCalendar();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha na análise. Tenta novamente.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ----------------------------------
  // REGISTO MANUAL — os valores já vêm todos do formulário (nada para o
  // Gemini extrair de imagem nenhuma); o mesmo pedido grava a avaliação E
  // gera o comentário do Coach a partir dos números indicados, comparando
  // com o histórico — mode:"manual" em analyze-body.
  // ----------------------------------
  const handleSaveManual = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setErrorMsg('');
    try {
      const payloadMetrics = {};
      for (const m of BODY_METRICS) {
        if (metrics[m.key] !== undefined && metrics[m.key] !== '') {
          payloadMetrics[m.key] = parseFloat(metrics[m.key]);
        }
      }
      const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-body', {
        body: { mode: 'manual', date, notes: notes.trim() || null, metrics: payloadMetrics },
      });
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);

      setBodyAssessments([data.assessment, ...bodyAssessments]);
      showToast('Avaliação registada');
      finishCreateAndGoToCalendar();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha a gravar a avaliação. Tenta novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 fade-in">
      <div
        className="rounded-2xl p-4"
        // --surf-detail (#f8fafc) era o fundo claro dos cartões expansíveis
        // no tema original — aqui dava um gradiente que acaba num retângulo
        // quase branco, com a borda #e2e8f0 a condizer. Style inline, por
        // isso as overrides de dark mode do globals.css não o apanhavam.
        style={{
          background: 'radial-gradient(130% 150% at 100% 0%, color-mix(in srgb, var(--mod-corpo-to) 12%, transparent) 0%, transparent 60%), rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.8)',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3), inset 0 2px 10px rgba(255, 255, 255, 0.6)',
        }}
      >
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5" style={{ color: 'var(--mod-corpo-to)' }} />
            <h2 className="text-[15px] font-bold text-slate-800">{isEditing ? 'Editar Avaliação' : 'Nova Avaliação'}</h2>
          </div>
          <button
            onClick={() => { if (isFormDirty) setShowUnsavedModal(true); else handleClose(); }}
            type="button"
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors shrink-0"
            title="Fechar"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none focus:border-[var(--mod-corpo-to)]"
          />
          <div className="flex items-center justify-center text-[11px] text-slate-500">Data da pesagem</div>
        </div>

        {/* Como queres registar? — escondido a editar: editar é sempre pelos
            campos, sem foto nova (mesmo padrão da Nutrição/Ginásio). */}
        {!isEditing && (
          <div className="mb-4">
            <label className="text-[11px] text-slate-500 mb-1.5 block">Como queres registar?</label>
            <div className="flex gap-1.5">
              <Chip
                active={entryMethod === 'foto'}
                variant="body"
                rounded="xl"
                onClick={() => setEntryMethod('foto')}
                className="flex-1 py-2.5 gap-1.5"
                type="button"
              >
                <Camera size={14} /> Foto (IA)
              </Chip>
              <Chip
                active={entryMethod === 'manual'}
                variant="body"
                rounded="xl"
                onClick={() => setEntryMethod('manual')}
                className="flex-1 py-2.5 gap-1.5"
                type="button"
              >
                <PencilLine size={14} /> Manual
              </Chip>
            </div>
          </div>
        )}

        {entryMethod === 'foto' ? (
          <>
            {photos.length > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {photos.map((p, i) => (
                    <div key={i} className="relative aspect-square">
                      <img src={p.dataUrl} className="w-full h-full object-cover rounded-xl border border-slate-200" alt={`Print ${i+1}`} />
                      <button
                        onClick={() => removePhoto(i)}
                        aria-label={`Remover print ${i + 1}`}
                        className="tap-44 absolute -top-1.5 -right-1.5 text-slate-500 hover:text-red-500 transition"
                      >
                        <span className="bg-white/90 border border-slate-200 rounded-full p-1 shadow-sm flex items-center justify-center">
                          <X size={14} />
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] text-slate-500">{photos.length} foto(s) · máx {MAX_PHOTOS}</span>
                </div>
                {photos.length < MAX_PHOTOS && (
                  <label className="flex items-center justify-center gap-2 border-2 border-dashed border-[var(--mod-corpo-to)]/40 rounded-xl py-3 text-center cursor-pointer hover:bg-[var(--mod-corpo-to)]/5 transition mb-4">
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
                    <ImagePlus className="w-4 h-4" style={{ color: 'var(--mod-corpo-to)' }} />
                    <span className="text-[12px] font-bold" style={{ color: 'var(--mod-corpo-to)' }}>Adicionar outro print</span>
                  </label>
                )}
              </>
            ) : (
              <label className="block border-2 border-dashed border-slate-300 rounded-xl py-6 text-center cursor-pointer hover:border-slate-400 transition mb-4 bg-white/50">
                <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
                <ImagePlus className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-xs text-slate-600 font-semibold">Escolhe os prints da app Renpho Health</p>
                <p className="text-[10px] text-slate-500 mt-1 px-4">Podes juntar vários ecrãs da mesma pesagem — a IA lê e comenta os valores automaticamente</p>
              </label>
            )}
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {BODY_METRICS.map(m => (
              <label key={m.key} className="block">
                <span className="text-[10px] text-slate-500 block mb-1">{m.label} {m.unit && `(${m.unit})`}</span>
                <input
                  type="number"
                  step={m.dec > 0 ? '0.1' : '1'}
                  value={metrics[m.key] ?? ''}
                  onChange={e => handleMetricChange(m.key, e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-[var(--mod-corpo-to)] transition"
                />
              </label>
            ))}
          </div>
        )}

        <div className="mb-4">
          <label className="text-[11px] text-slate-500 mb-1.5 block">Observações (opcional) — ex.: "em jejum", "após treino"</label>
          <textarea
            rows={2}
            maxLength={500}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Contexto da pesagem..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-corpo-to)] resize-none"
          />
        </div>

        {/* Ação — mesmo botão do Coach nos dois caminhos de criação: a foto e
            o registo manual acabam ambos analisados por ele. A editar, o
            botão só leva o gradiente do Coach quando as métricas ou as
            observações mudaram; mudar só a data é update direto. */}
        {isEditing ? (
          <CoachAnalyzeButton
            onClick={handleSaveEdit}
            disabled={isSaving}
            busy={isSaving}
            label={needsReanalysis ? "Guardar e Reanalisar" : "Guardar Alterações"}
          />
        ) : entryMethod === 'foto' ? (
          <CoachAnalyzeButton
            onClick={handleAnalyzePhotos}
            disabled={!photos.length || isAnalyzing}
            busy={isAnalyzing}
            label="Analisar Avaliação"
          />
        ) : (
          <CoachAnalyzeButton
            onClick={handleSaveManual}
            disabled={isSaving}
            busy={isSaving}
            label="Analisar Avaliação"
          />
        )}

        {errorMsg && <p className="text-red-500 text-[13px] font-medium mt-3 text-center">{errorMsg}</p>}
      </div>

      {/* Modal de confirmação de saída com alterações por gravar */}
      <UnsavedChangesModal
        isOpen={showUnsavedModal}
        isSaving={isSaving || isAnalyzing}
        onSaveAndLeave={isEditing ? handleSaveEdit : handleSaveManual}
        onDiscardAndLeave={handleClose}
        onCancel={() => { pendingNavTarget.current = null; setShowUnsavedModal(false); }}
      />
    </div>
  );
}
