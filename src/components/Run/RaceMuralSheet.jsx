import React, { useEffect, useRef, useState } from 'react';
import { Share2, Download, Sparkles, Copy, Check } from 'lucide-react';
import { Sheet } from '../shared/Sheet';
import Warning, { WarningAction } from '../shared/Warning';
import { useAppStore } from '../../store';
import { MURAL_FORMATS, DEFAULT_MURAL_FORMAT, MURAL_MAX_PHOTOS, renderRaceMural, canvasToFile, muralFileName, muralCandidates, defaultMuralSelection } from '../../utils/raceMural';
import { requestRaceCaption } from '../../utils/raceBalance';

/* A persiana do mural (pedido 2026-09-13): escolhe-se o formato, vê-se a
   imagem composta no telemóvel (utils/raceMural.js), pede-se a legenda à
   Carol, e parte-se para o Instagram — pelo menu de partilha do telemóvel,
   ou guardando o ficheiro. */
export default function RaceMuralSheet({ race, run, runs = [], profile = {}, seconds, classification = '', memoryUrls, onClose }) {
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

  // As memórias que podem entrar, e as escolhidas — pela ordem em que se
  // escolhem, que é a ordem no mural (pedido 2026-09-13: nem sempre se
  // querem todas). Até MURAL_MAX_PHOTOS.
  const candidates = muralCandidates({
    photos: memoryUrls?.photos || [],
    medal: memoryUrls?.medal || null,
    diploma: memoryUrls?.diploma || null,
    diplomaPath: race?.diploma_path || '',
  });
  const [selected, setSelected] = useState(() => defaultMuralSelection(candidates));
  const touchedRef = useRef(false);
  const toggle = (id) => {
    touchedRef.current = true;
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < MURAL_MAX_PHOTOS ? [...prev, id] : prev));
  };
  // As assinaturas das memórias podem chegar depois de a persiana abrir: a
  // escolha por omissão aplica-se assim que há candidatas, enquanto o
  // atleta não tiver mexido (revisão pré-deploy 2026-09-13).
  const candidatesKey = candidates.map((c) => c.id).join('|');
  useEffect(() => {
    if (touchedRef.current || selected.length || !candidates.length) return;
    setSelected(defaultMuralSelection(candidates));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatesKey]);
  const photoUrls = selected.map((id) => candidates.find((c) => c.id === id)?.url).filter(Boolean);
  const selectedKey = selected.join('|');

  useEffect(() => {
    let cancelled = false;
    setRendering(true);
    setError('');
    renderRaceMural({ format, race, seconds, distanceKm: run?.distance_km, classification, photoUrls })
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
    // As fotos vêm assinadas de fora; aqui mudam o formato e a escolha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, race?.id, selectedKey]);

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
        {candidates.length ? `Escolhe até ${MURAL_MAX_PHOTOS} fotografias, pela ordem em que as queres. ${photoUrls.length} de ${MURAL_MAX_PHOTOS} escolhidas.` : 'Ainda sem fotografias nas memórias: fica o mural com o teu tempo e a distância.'}
      </p>

      {candidates.length > 0 && (
        <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar" role="group" aria-label="Fotografias do mural" style={{ paddingBottom: 2 }}>
          {candidates.map((c) => {
            const order = selected.indexOf(c.id);
            const active = order >= 0;
            const full = !active && selected.length >= MURAL_MAX_PHOTOS;
            return (
              <button
                key={c.id}
                type="button"
                data-testid={`race-mural-photo-${c.id}`}
                aria-pressed={active}
                aria-label={`${c.label}${active ? `, ${order + 1}.ª no mural` : ''}`}
                disabled={full}
                onClick={() => toggle(c.id)}
                className="relative shrink-0 rounded-[12px] overflow-hidden disabled:opacity-40"
                style={{ width: 64, height: 64, border: `2px solid ${active ? 'var(--race)' : 'var(--border-glass-strong)'}`, padding: 0, background: 'rgba(255,255,255,.04)' }}
              >
                <img src={c.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: active ? 1 : 0.7 }} />
                {active && (
                  <span aria-hidden="true" className="absolute top-1 right-1 flex items-center justify-center text-[11px] font-black" style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--race)', color: 'var(--race-ink)' }}>
                    {order + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* formatos */}
      <div className="flex gap-2 mt-3" role="group" aria-label="Formato do mural">
        {Object.entries(MURAL_FORMATS).map(([key, f]) => {
          const active = key === format;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
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
          {rendering && <div className="w-full h-full animate-pulse" role="status" aria-label="A compor o mural" />}
        </div>
      </div>
      {error && <Warning title="Mural por compor" className="mt-3">{error}</Warning>}

      {/* legenda da Carol */}
      <div className="mt-4" style={{ borderRadius: 16, background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)', padding: 12 }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: '.06em', color: 'var(--coach-soft)' }}>Legenda da Carol</span>
          {caption && (
            <button type="button" onClick={copyCaption} data-testid="race-mural-copy" className="inline-flex items-center gap-1 text-[12px] font-extrabold" style={{ minHeight: 44, padding: '0 6px', color: 'var(--coach)' }}>
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
