import React from 'react';
import { X, Trash2, Award, FileText, ImagePlus } from 'lucide-react';
import Warning from '../shared/Warning';
import { MAX_RACE_PHOTOS } from '../../utils/raceMemories';

/* Os três campos das memórias da prova — diploma, medalha, fotografias —
   partilhados pelo registo da prova (RunRegistration, bloco "Memórias") e
   pela persiana do hub (RaceMemoriesSheet). Sem estado próprio: quem monta
   guarda as memórias e passa os handlers; os ficheiros escolhidos chegam
   já lidos (ver utils/raceMemories.js). */

const memoryLabel = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: 'var(--tracking-label)',
  color: 'var(--text-3)',
};
const memorySlot = {
  minHeight: 'var(--tap)',
  borderRadius: 'var(--radius-sm)',
  border: '1px dashed var(--tint-race-bd)',
  background: 'var(--tint-race-bg)',
  color: 'var(--race)',
  fontSize: 12.5,
  fontWeight: 800,
};

export default function RaceMemoriesFields({
  diploma, medal, photos = [],
  onDiplomaFile, onMedalFile, onPhotoFiles,
  onRemoveDiploma, onRemoveMedal, onRemovePhoto,
  error = '',
}) {
  const takeOne = (handler) => (e) => {
    const file = (e.target.files || [])[0];
    e.target.value = '';
    if (file) handler(file);
  };
  const takeMany = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length) onPhotoFiles(files);
  };

  return (
    <>
      <div className="mb-4">
        <p style={memoryLabel}>Diploma</p>
        {diploma ? (
          <div className="flex items-center gap-2.5 mt-2">
            {diploma.isPdf ? (
              <span className="flex items-center justify-center rounded-xl shrink-0" style={{ width: 56, height: 56, background: 'var(--tint-race-bg)', border: '1px solid var(--tint-race-bd)', color: 'var(--race)' }}>
                <FileText size={20} />
              </span>
            ) : (
              <img src={diploma.dataUrl || diploma.url} alt="Diploma da prova" className="rounded-xl object-cover shrink-0" style={{ width: 56, height: 56, border: '1px solid var(--border-glass)' }} />
            )}
            <span className="flex-1 min-w-0 text-[12.5px] truncate" style={{ color: 'var(--text-2)' }}>{diploma.name || 'Diploma'}</span>
            <button
              type="button"
              onClick={onRemoveDiploma}
              aria-label="Remover o diploma"
              className="tap-44 shrink-0 text-[var(--text-3)] hover:text-[var(--danger)] transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ) : (
          <label className="flex items-center justify-center gap-2 mt-2 cursor-pointer" style={memorySlot}>
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={takeOne(onDiplomaFile)} />
            <FileText size={15} /> Adicionar o diploma
          </label>
        )}
        <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-4)' }}>Uma imagem ou um PDF, até 2 MB.</p>
      </div>

      <div className="mb-4">
        <p style={memoryLabel}>Medalha</p>
        {medal ? (
          <div className="flex items-center gap-2.5 mt-2">
            <img src={medal.dataUrl || medal.url} alt="Medalha da prova" className="rounded-xl object-cover shrink-0" style={{ width: 56, height: 56, border: '1px solid var(--border-glass)' }} />
            <span className="flex-1 min-w-0 text-[12.5px]" style={{ color: 'var(--text-2)' }}>A medalha do dia</span>
            <button
              type="button"
              onClick={onRemoveMedal}
              aria-label="Remover a medalha"
              className="tap-44 shrink-0 text-[var(--text-3)] hover:text-[var(--danger)] transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ) : (
          <label className="flex items-center justify-center gap-2 mt-2 cursor-pointer" style={memorySlot}>
            <input type="file" accept="image/*" className="hidden" onChange={takeOne(onMedalFile)} />
            <Award size={15} /> Adicionar a medalha
          </label>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <p style={memoryLabel}>Fotografias</p>
          <span className="text-[11px]" style={{ color: 'var(--text-4)' }} data-testid="race-photos-counter">
            {photos.length} de {MAX_RACE_PHOTOS}
          </span>
        </div>
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            {photos.map((p, i) => (
              <div key={p.path || p.dataUrl || i} className="relative aspect-square">
                <img src={p.dataUrl || p.url} className="w-full h-full object-cover rounded-xl border border-[var(--border-glass)]" alt={`Fotografia ${i + 1} da prova`} />
                <button
                  type="button"
                  onClick={() => onRemovePhoto(i)}
                  aria-label={`Remover a fotografia ${i + 1}`}
                  className="tap-area-44 absolute top-1 right-1 bg-[var(--bg-scrim)] rounded-full p-1 hover:bg-[var(--danger)] transition"
                  style={{ color: '#fff' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        {photos.length < MAX_RACE_PHOTOS && (
          <label className="flex items-center justify-center gap-2 mt-2 cursor-pointer" style={memorySlot}>
            <input type="file" accept="image/*" multiple className="hidden" onChange={takeMany} />
            <ImagePlus size={15} /> Adicionar fotografias
          </label>
        )}
      </div>

      {error && (
        <Warning title="Memória não aceite" className="mt-3">{error}</Warning>
      )}
    </>
  );
}
