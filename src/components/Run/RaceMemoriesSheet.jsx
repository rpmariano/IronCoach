import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Award, ChevronLeft } from 'lucide-react';
import { useEscapeClose } from '../shared/Sheet';
import Warning, { WarningAction } from '../shared/Warning';
import RaceMemoriesFields from './RaceMemoriesFields';
import { useAppStore } from '../../store';
import { pickDiploma, pickMedal, pickPhotos, signRaceMemories, persistRaceMemories, MAX_RACE_PHOTOS } from '../../utils/raceMemories';
import { applyDiplomaToRun } from '../../utils/diplomaReading';
import DiplomaReadingCard, { useDiplomaReading } from './DiplomaReadingCard';

/* O ecrã "Memórias" do hub (pedido 2026-09-13, promovido de persiana a ecrã
   inteiro em 2026-09-15 — três fluxos de carregamento independentes,
   leitura do diploma com aplicar/dispensar e estado por gravar são mais um
   destino do que um detalhe rápido; o mesmo argumento que já tinha levado
   o Mural, ao lado, a deixar de ser persiana). Concluir a prova é registar
   a corrida; o diploma, a medalha e as fotografias podem vir depois — no
   dia seguinte, quando o diploma chega por e-mail, ou quando as fotos
   oficiais saem. Aqui juntam-se, trocam-se e removem-se sem reabrir o
   registo da corrida (que obrigava a passar pelo formulário inteiro e, com
   a análise no caminho, era demasiado para uma foto).

   Grava direto em race_events pelo mesmo módulo do registo
   (utils/raceMemories.js); o status não se toca — a prova já está
   concluída quando isto existe. */
/* `onSaved(patch)`: quem monta pode tratar da escrita no store — o RunAgenda
   precisa, para a marcar como sua e não repor o rascunho por gravar dos
   "Detalhes" (revisão pré-deploy 2026-09-13). Sem ele, escreve direto.

   `run`: a corrida ligada à prova. O diploma chega quase sempre aqui, dias
   depois de a corrida estar registada pelos prints do relógio — e é aqui
   que a Carol o lê (DiplomaReadingCard) e "Aplicar à corrida" grava o tempo
   oficial de chip e a classificação em runs.details, na hora. O diploma em
   si continua a guardar-se com "Guardar as memórias". */
export default function RaceMemoriesSheet({ race, run = null, userId, onClose, onSaved }) {
  const [diploma, setDiploma] = useState(null);
  const [medal, setMedal] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const diplomaReading = useDiplomaReading();

  // O que já está guardado, com as URLs assinadas na hora (bucket privado).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const current = await signRaceMemories(race);
      if (cancelled) return;
      setDiploma(current.diploma);
      setMedal(current.medal);
      setPhotos(current.photos);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
    // Só à abertura: a persiana é curta e o que muda a seguir muda aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [race?.id]);

  const onDiplomaFile = async (file) => {
    const { memory, error: err } = await pickDiploma(file);
    setError(err);
    if (memory) {
      setDiploma(memory);
      setDirty(true);
      /* Só há onde aplicar com a corrida registada; um PDF não se lê. A
         leitura aplica-se SOZINHA: o diploma é o documento oficial da prova
         e ganha ao que foi escrito à mão (pedido do utilizador). */
      if (run?.id) {
        const reading = await diplomaReading.ask(memory);
        if (reading) await aplicarLeitura(reading);
      }
    }
  };

  const aplicarLeitura = async (reading) => {
    if (!reading || !run?.id) return;
    diplomaReading.markApplying();
    try {
      const updated = await applyDiplomaToRun(run, reading);
      const store = useAppStore.getState();
      store.setRuns((store.runs || []).map((r) => (r.id === updated.id ? { ...r, details: updated.details } : r)));
      diplomaReading.markApplied();
    } catch (err) {
      console.warn('Leitura do diploma não aplicada à corrida', err);
      diplomaReading.failApply(err?.message ? `Não consegui gravar na corrida: ${err.message}` : 'Não consegui gravar na corrida. Tenta outra vez.');
    }
  };
  const onMedalFile = async (file) => {
    const { memory, error: err } = await pickMedal(file);
    setError(err);
    if (memory) { setMedal(memory); setDirty(true); }
  };
  const onPhotoFiles = async (files) => {
    const { added, error: err } = await pickPhotos(files, photos.length);
    setError(err);
    // Teto outra vez no estado: duas seleções seguidas contavam com o mesmo `length`.
    if (added.length) { setPhotos(prev => [...prev, ...added].slice(0, MAX_RACE_PHOTOS)); setDirty(true); }
  };

  const save = async () => {
    if (!race?.id || !userId) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      const patch = await persistRaceMemories({ userId, raceId: race.id, current: race, diploma, medal, photos });
      if (onSaved) {
        onSaved(patch);
      } else {
        const store = useAppStore.getState();
        store.setRaceEvents((store.raceEvents || []).map(e => (e.id === race.id ? { ...e, ...patch } : e)));
      }
      onClose?.();
    } catch (err) {
      console.error('Falha a guardar as memórias da prova', err);
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  // Esc fecha, como fechava a persiana — pela mesma pilha do Sheet.jsx
  // (useEscapeClose), não um listener à parte: nada empilha por baixo
  // deste ecrã hoje, mas se algum dia empilhar, o mecanismo já está certo
  // (achado 2026-09-15 na revisão pré-push da promoção de um ecrã irmão a
  // ecrã inteiro — um listener próprio não sabe o que está por baixo dele).
  useEscapeClose(onClose);

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Memórias — ${race?.name || 'a prova'}`}
      data-testid="race-memories-sheet"
      className="fixed inset-0 z-[80] flex flex-col fade-in"
      style={{ background: 'var(--bg-app)' }}
    >
      <div className="flex items-center gap-2.5 shrink-0" style={{ minHeight: 52, padding: '8px 14px', borderBottom: '1px solid var(--border-glass)' }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 44, height: 44, background: 'none', border: 'none', color: 'var(--text-3)' }}
        >
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--race)' }}>Memórias</div>
          <div className="text-[14.5px] font-extrabold truncate" style={{ color: 'var(--text-1)' }}>{race?.name || 'A prova'}</div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar" style={{ padding: '0 18px calc(26px + env(safe-area-inset-bottom, 0px))' }}>
        <p className="text-[12.5px] leading-[1.5] mt-3 mb-4" style={{ color: 'var(--text-3)' }}>
          O diploma, a medalha e as fotografias do dia. Podes juntar agora ou voltar cá quando chegarem.
        </p>

        {loaded ? (
          <RaceMemoriesFields
            diploma={diploma}
            medal={medal}
            photos={photos}
            onDiplomaFile={onDiplomaFile}
            onMedalFile={onMedalFile}
            onPhotoFiles={onPhotoFiles}
            onRemoveDiploma={() => { setDiploma(null); diplomaReading.clear(); setDirty(true); }}
            onRemoveMedal={() => { setMedal(null); setDirty(true); }}
            onRemovePhoto={(i) => { setPhotos(prev => prev.filter((_, idx) => idx !== i)); setDirty(true); }}
            error={error}
            afterDiploma={(
              <DiplomaReadingCard
                state={diplomaReading.state}
                appliedLabel="Aplicado à corrida"
                appliedHint="O que o diploma diz ficou na corrida, por cima do que estava. Guarda as memórias para ficares com o diploma."
                manualHint="Podes acrescentar à mão em “Editar a corrida”."
              />
            )}
          />
        ) : (
          <div className="animate-pulse rounded-2xl" style={{ height: 180, background: 'var(--surface-faint)' }} aria-label="A carregar as memórias" />
        )}

        {saveFailed && (
          <Warning
            title="Memórias por guardar"
            className="mt-3"
            actions={<WarningAction onClick={save} disabled={saving}>{saving ? 'A guardar…' : 'Tentar de novo'}</WarningAction>}
          >
            Não consegui guardar as memórias — podes tentar outra vez sem perder nada.
          </Warning>
        )}

        <button
          type="button"
          data-testid="race-memories-save"
          onClick={save}
          disabled={!dirty || saving || !loaded}
          className="w-full inline-flex items-center justify-center gap-2 mt-5 rounded-[14px] text-[13.5px] font-extrabold disabled:opacity-45"
          style={{ minHeight: 'var(--tap)', background: 'var(--grad-race)', color: 'var(--race-ink)', border: 'none' }}
        >
          <Award size={16} /> {saving ? 'A guardar…' : 'Guardar as memórias'}
        </button>
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
