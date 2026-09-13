import React, { useEffect, useRef, useState } from 'react';
import { Share2, Download, Sparkles, Copy, Check } from 'lucide-react';
import { Sheet } from '../shared/Sheet';
import Warning, { WarningAction } from '../shared/Warning';
import { useAppStore } from '../../store';
import { MURAL_FORMATS, DEFAULT_MURAL_FORMAT, renderRaceMural, canvasToFile, muralFileName, pickMuralPhotos } from '../../utils/raceMural';
import { requestRaceCaption } from '../../utils/raceBalance';

/* A persiana do mural (pedido 2026-09-13): escolhe-se o formato, vê-se a
   imagem composta no telemóvel (utils/raceMural.js), pede-se a legenda à
   Carol, e parte-se para o Instagram — pelo menu de partilha do telemóvel,
   ou guardando o ficheiro. */
export default function RaceMuralSheet({ race, run, runs = [], profile = {}, seconds, memoryUrls, onClose }) {
  const { raceEvents } = useAppStore();
  const [format, setFormat] = useState(DEFAULT_MURAL_FORMAT);
  const [preview, setPreview] = useState(null);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState('');
  const [caption, setCaption] = useState('');
  const [captionLoading, setCaptionLoading] = useState(false);
  const [captionError, setCaptionError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState('');
  const canvasRef = useRef(null);
  const downloadRef = useRef(null);

  const photoUrls = pickMuralPhotos({
    photos: memoryUrls?.photos || [],
    medal: memoryUrls?.medal || null,
    diploma: memoryUrls?.diploma || null,
    diplomaPath: race?.diploma_path || '',
  });

  useEffect(() => {
    let cancelled = false;
    setRendering(true);
    setError('');
    renderRaceMural({ format, race, seconds, distanceKm: run?.distance_km, photoUrls })
      .then((canvas) => {
        if (cancelled) return;
        canvasRef.current = canvas;
        setPreview(canvas.toDataURL('image/jpeg', 0.86));
      })
      .catch((err) => {
        console.warn('Mural não desenhado', err);
        if (!cancelled) setError('Não consegui compor o mural. Verifica a ligação e tenta de novo.');
      })
      .finally(() => { if (!cancelled) setRendering(false); });
    return () => { cancelled = true; };
    // As fotos vêm assinadas de fora; só o formato muda aqui dentro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, race?.id]);

  const fileName = muralFileName(race, format);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const share = async () => {
    if (!canvasRef.current) return;
    setShareError('');
    try {
      const file = await canvasToFile(canvasRef.current, fileName);
      if (canShare && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title: race?.name || 'A minha prova', text: caption || undefined });
        return;
      }
      download(file);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.warn('Partilha do mural falhou', err);
      setShareError('Não consegui abrir a partilha. Guarda a imagem e publica a partir da galeria.');
    }
  };

  const download = async (givenFile) => {
    if (!canvasRef.current) return;
    setShareError('');
    try {
      const file = givenFile || await canvasToFile(canvasRef.current, fileName);
      const url = URL.createObjectURL(file);
      const a = downloadRef.current;
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      console.warn('Guardar o mural falhou', err);
      setShareError('Não consegui guardar a imagem.');
    }
  };

  const askCaption = async () => {
    setCaptionLoading(true);
    setCaptionError(false);
    try {
      setCaption(await requestRaceCaption({ race, run, runs, raceEvents, profile }));
    } catch (err) {
      console.warn('Legenda não obtida', err);
      setCaptionError(true);
    } finally {
      setCaptionLoading(false);
    }
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* sem clipboard — o texto continua selecionável */
    }
  };

  const { width, height } = MURAL_FORMATS[format];

  return (
    <Sheet eyebrow="Mural" eyebrowTone="race" title={race?.name || 'A prova'} onClose={onClose} testId="race-mural-sheet" maxHeight="92dvh">
      <p className="text-[12.5px] leading-[1.5] mt-2" style={{ color: 'var(--text-3)' }}>
        {photoUrls.length ? `${photoUrls.length} ${photoUrls.length === 1 ? 'fotografia' : 'fotografias'} das memórias, o teu tempo e a distância.` : 'Ainda sem fotografias nas memórias: fica o mural com o teu tempo e a distância.'}
      </p>

      {/* formatos */}
      <div className="flex gap-2 mt-3" role="tablist" aria-label="Formato do mural">
        {Object.entries(MURAL_FORMATS).map(([key, f]) => {
          const active = key === format;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`race-mural-format-${key}`}
              onClick={() => setFormat(key)}
              className="flex-1 flex flex-col items-center justify-center rounded-[12px]"
              style={{ minHeight: 48, background: active ? 'var(--tint-race-bg)' : 'rgba(255,255,255,.05)', border: `1px solid ${active ? 'var(--tint-race-bd)' : 'var(--border-glass-strong)'}`, color: active ? 'var(--race)' : 'var(--text-3)' }}
            >
              <span className="text-[12.5px] font-extrabold">{f.label}</span>
              <span className="text-[11px]" style={{ color: 'var(--text-4)' }}>{f.hint}</span>
            </button>
          );
        })}
      </div>

      {/* pré-visualização */}
      <div className="mt-3 flex justify-center">
        <div style={{ width: '100%', maxWidth: format === 'story' ? 240 : 320, aspectRatio: `${width} / ${height}`, borderRadius: 16, overflow: 'hidden', background: 'rgba(255,255,255,.04)', border: '1px solid var(--border-glass)' }}>
          {preview && !rendering && (
            <img src={preview} alt={`Mural da ${race?.name || 'prova'}`} data-testid="race-mural-preview" style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} />
          )}
          {rendering && <div className="w-full h-full animate-pulse" aria-label="A compor o mural" />}
        </div>
      </div>
      {error && <Warning title="Mural por compor" className="mt-3">{error}</Warning>}

      {/* legenda da Carol */}
      <div className="mt-4" style={{ borderRadius: 16, background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)', padding: 12 }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: '.06em', color: 'var(--coach-soft)' }}>Legenda da Carol</span>
          {caption && (
            <button type="button" onClick={copyCaption} data-testid="race-mural-copy" className="inline-flex items-center gap-1 text-[12px] font-extrabold" style={{ minHeight: 36, color: 'var(--coach)' }}>
              {copied ? <><Check size={13} /> Copiada</> : <><Copy size={13} /> Copiar</>}
            </button>
          )}
        </div>
        {caption ? (
          <p data-testid="race-mural-caption" className="text-[12.5px] leading-[1.55] mt-2 whitespace-pre-line" style={{ color: 'var(--text-1)' }}>{caption}</p>
        ) : (
          <button
            type="button"
            data-testid="race-mural-ask-caption"
            onClick={askCaption}
            disabled={captionLoading}
            className="inline-flex items-center gap-1.5 mt-1 text-[12.5px] font-extrabold disabled:opacity-60"
            style={{ minHeight: 44, color: 'var(--coach)' }}
          >
            <Sparkles size={14} /> {captionLoading ? 'A escrever…' : captionError ? 'Não consegui. Tentar de novo' : 'Pedir a legenda à Carol'}
          </button>
        )}
      </div>

      {shareError && (
        <Warning title="Partilha" className="mt-3" actions={<WarningAction onClick={() => download()}>Guardar a imagem</WarningAction>}>{shareError}</Warning>
      )}

      <div className="flex gap-2 mt-4">
        <button
          type="button"
          data-testid="race-mural-share"
          onClick={share}
          disabled={rendering || !!error}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-[14px] text-[13.5px] font-extrabold disabled:opacity-45"
          style={{ minHeight: 'var(--tap)', background: 'var(--grad-race)', color: 'var(--race-ink)', border: 'none' }}
        >
          <Share2 size={16} /> {canShare ? 'Partilhar' : 'Guardar'}
        </button>
        {canShare && (
          <button
            type="button"
            data-testid="race-mural-download"
            onClick={() => download()}
            disabled={rendering || !!error}
            aria-label="Guardar a imagem"
            className="inline-flex items-center justify-center rounded-[14px] disabled:opacity-45"
            style={{ minHeight: 'var(--tap)', minWidth: 'var(--tap)', padding: '0 16px', background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-2)' }}
          >
            <Download size={16} />
          </button>
        )}
      </div>
      <a ref={downloadRef} href="#" hidden aria-hidden="true">guardar</a>
    </Sheet>
  );
}
