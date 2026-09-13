import React, { useEffect, useState } from 'react';
import { Award } from 'lucide-react';
import { Sheet } from '../shared/Sheet';
import Warning, { WarningAction } from '../shared/Warning';
import RaceMemoriesFields from './RaceMemoriesFields';
import { useAppStore } from '../../store';
import { pickDiploma, pickMedal, pickPhotos, signRaceMemories, persistRaceMemories } from '../../utils/raceMemories';

/* A persiana "Memórias" do hub (pedido 2026-09-13): concluir a prova é
   registar a corrida; o diploma, a medalha e as fotografias podem vir
   depois — no dia seguinte, quando o diploma chega por e-mail, ou quando
   as fotos oficiais saem. Aqui juntam-se, trocam-se e removem-se sem
   reabrir o registo da corrida (que obrigava a passar pelo formulário
   inteiro e, com a análise no caminho, era demasiado para uma foto).

   Grava direto em race_events pelo mesmo módulo do registo
   (utils/raceMemories.js); o status não se toca — a prova já está
   concluída quando isto existe. */
export default function RaceMemoriesSheet({ race, userId, onClose }) {
  const [diploma, setDiploma] = useState(null);
  const [medal, setMedal] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

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
    if (memory) { setDiploma(memory); setDirty(true); }
  };
  const onMedalFile = async (file) => {
    const { memory, error: err } = await pickMedal(file);
    setError(err);
    if (memory) { setMedal(memory); setDirty(true); }
  };
  const onPhotoFiles = async (files) => {
    const { added, error: err } = await pickPhotos(files, photos.length);
    setError(err);
    if (added.length) { setPhotos(prev => [...prev, ...added]); setDirty(true); }
  };

  const save = async () => {
    if (!race?.id || !userId) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      const patch = await persistRaceMemories({ userId, raceId: race.id, current: race, diploma, medal, photos });
      const store = useAppStore.getState();
      store.setRaceEvents((store.raceEvents || []).map(e => (e.id === race.id ? { ...e, ...patch } : e)));
      onClose?.();
    } catch (err) {
      console.error('Falha a guardar as memórias da prova', err);
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet eyebrow="Memórias" eyebrowTone="race" title={race?.name || 'A prova'} onClose={onClose} testId="race-memories-sheet" maxHeight="90dvh">
      <p className="text-[12.5px] leading-[1.5] mt-2 mb-4" style={{ color: 'var(--text-3)' }}>
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
          onRemoveDiploma={() => { setDiploma(null); setDirty(true); }}
          onRemoveMedal={() => { setMedal(null); setDirty(true); }}
          onRemovePhoto={(i) => { setPhotos(prev => prev.filter((_, idx) => idx !== i)); setDirty(true); }}
          error={error}
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
    </Sheet>
  );
}
