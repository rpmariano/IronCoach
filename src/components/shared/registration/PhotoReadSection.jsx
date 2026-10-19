import React from 'react';
import { ImagePlus, Sparkles, X } from 'lucide-react';

/* Os prints de um registo, opcionais — escolher, ver, tirar e "Ler os prints":
   a Carol lê-os e preenche o formulário SEM gravar; o atleta revê e só
   depois grava (registo unificado, F2, Opção A — specs/plano-registo-plano-coach.md
   decisão 6). Só apresentação: as fotos, a leitura e a frase de resultado
   vivem em quem a usa. Extraído do GymRegistration; `accent` é a cor do
   módulo (Ginásio por omissão, Corpo, …) e `emptyExtra` uma linha a mais no
   vazio (ex.: o ecrã da Renpho que traz tudo). */
export default function PhotoReadSection({
  photos, maxPhotos, onSelect, onRemove, onRead, reading = false, note = null,
  emptyTitle = 'Prints da app de treino (opcional)',
  emptyHint = 'Hevy, Strong… Junta os ecrãs da mesma sessão e eu leio o que não escreveres abaixo.',
  emptyExtra = null, accent = 'var(--mod-ginasio-to)', inputRef = undefined,
}) {
  return (
    <div className="mb-4" style={{ '--pr-accent': accent }}>
      {photos.length > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-2 mb-2">
            {photos.map((p, i) => (
              <div key={i} className="relative aspect-square">
                <img src={p.dataUrl} className="w-full h-full object-cover rounded-xl border border-[var(--border-glass)]" alt={`Print ${i + 1}`} />
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  aria-label={`Remover print ${i + 1}`}
                  className="tap-44 absolute -top-1.5 -right-1.5 text-slate-800 hover:text-[var(--danger)] transition"
                >
                  <span className="bg-white/90 border border-[var(--border-glass)] rounded-full p-1 shadow-sm flex items-center justify-center">
                    <X size={14} />
                  </span>
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-[var(--text-3)]">{photos.length} foto(s) · máx {maxPhotos}</span>
          </div>
          {photos.length < maxPhotos && (
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-[var(--pr-accent)]/40 rounded-xl py-3 text-center cursor-pointer hover:bg-[var(--pr-accent)]/5 transition mb-2 min-h-[44px] focus-within:ring-2 focus-within:ring-[var(--pr-accent)]">
              <input ref={inputRef} type="file" accept="image/*" multiple className="sr-only" onChange={onSelect} />
              <ImagePlus className="w-4 h-4" style={{ color: 'var(--pr-accent)' }} />
              <span className="text-[12px] font-bold" style={{ color: 'var(--pr-accent)' }}>Adicionar outro print</span>
            </label>
          )}
          <button
            type="button"
            onClick={onRead}
            disabled={reading}
            aria-busy={reading || undefined}
            className="w-full min-h-[44px] rounded-xl border text-[12px] font-bold flex items-center justify-center gap-2 transition active:scale-[0.99] disabled:opacity-60"
            style={{ borderColor: 'color-mix(in srgb, var(--pr-accent) 55%, transparent)', color: 'var(--pr-accent)', background: 'color-mix(in srgb, var(--pr-accent) 10%, transparent)' }}
          >
            <Sparkles size={14} />
            {reading ? 'A ler os prints…' : 'Ler os prints e preencher'}
          </button>
        </>
      ) : (
        <label className="block border-2 border-dashed border-[var(--border-glass-strong)] rounded-xl py-4 text-center cursor-pointer hover:border-[var(--border-control)] transition bg-[var(--surface-glass)] focus-within:ring-2 focus-within:ring-[var(--pr-accent)]">
          <input ref={inputRef} type="file" accept="image/*" multiple className="sr-only" onChange={onSelect} />
          <ImagePlus className="w-6 h-6 text-[var(--text-3)] mx-auto mb-2" />
          <p className="text-xs text-[var(--text-3)] font-semibold">{emptyTitle}</p>
          <p className="text-[11px] text-[var(--text-3)] mt-1 px-4">{emptyHint}</p>
          {emptyExtra && <p className="text-[11px] text-[var(--text-3)] mt-1 px-4">{emptyExtra}</p>}
        </label>
      )}
      {/* Sem prints, a nota da leitura (só notas) mostra-se junto das observações. */}
      {photos.length > 0 && (
        <p
          role="status"
          aria-live="polite"
          className="text-[12px] mt-2"
          style={{ color: note?.tone === 'warn' ? 'var(--warn)' : 'var(--text-2)' }}
        >
          {note?.text || ''}
        </p>
      )}
    </div>
  );
}
