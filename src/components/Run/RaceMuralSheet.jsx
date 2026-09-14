import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Share2, Download, ArrowUpLeft, ArrowUpRight, ArrowDownLeft, ArrowDownRight } from 'lucide-react';
import { Sheet } from '../shared/Sheet';
import Warning, { WarningAction } from '../shared/Warning';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';
import { canvasToFile, muralFileName, muralCandidates } from '../../utils/raceMural';
import {
  STUDIO_FORMATS, STUDIO_TEMPLATES, STUDIO_THEMES, BRAND_CORNERS, MEDAL_CORNERS, STUDIO_GRAPHICS, MIN_STUDIO_ZOOM, MAX_STUDIO_ZOOM,
  studioLayout, muralData, defaultComposition, sanitizeComposition, switchTemplate, assignSlot, clearSlot,
  setSlotFocus, setSlotZoom, toggleGraphic, graphicUnavailableReason, coverCrop,
} from '../../utils/muralStudio';
import { loadStudioAssets, renderMuralStudio } from '../../utils/muralStudioDraw';

/* O estúdio do mural (pedido 2026-09-14): o mural automático não servia —
   a app escolhia pelo atleta e nunca acertava. Aqui é ele que monta, em três
   passos, com a pré-visualização sempre à vista:

   1. Modelo — formato (feed, story, quadrado) e modelo (Capa, Mosaicos,
      Troféu, Só números), cada um com espaços para fotos.
   2. Fotos — toca-se num espaço (na pré-visualização ou na lista) e
      escolhe-se a memória; arrasta-se a foto para a mover e desliza-se para
      ampliar (pedido 2026-09-14 — o ponto de foco fixo saiu).
   3. Grafismos — peças prontas que se ligam e desligam, o tema de cor e o
      canto da marca, que vai sempre.

   A composição grava-se na prova (`race_events.mural_composition`, pedido
   2026-09-14 — antes só ficava no telemóvel), por update à parte com
   debounce, como a hora da corrida; `onSaved` deixa quem monta tratar do
   store, como nas Memórias e no Balanço, para não repor um rascunho aberto
   noutro sítio. A legenda da Carol saiu: o texto do mural chega. */

const PREVIEW_SCALE = 0.4;
const PERSIST_DEBOUNCE_MS = 600;
const CROP_MAX_PX = 260;
const STEPS = [
  { key: 'modelo', label: 'Modelo' },
  { key: 'fotos', label: 'Fotos' },
  { key: 'grafismos', label: 'Grafismos' },
];
const CORNER_ICONS = { tl: ArrowUpLeft, tr: ArrowUpRight, bl: ArrowDownLeft, br: ArrowDownRight };
const GRAPHIC_LABEL = Object.fromEntries(STUDIO_GRAPHICS.map((g) => [g.key, g.label]));

const chip = (active) => ({
  minHeight: 44,
  borderRadius: 12,
  background: active ? 'var(--tint-race-bg)' : 'rgba(255,255,255,.05)',
  border: `1px solid ${active ? 'var(--tint-race-bd)' : 'var(--border-glass-strong)'}`,
  color: active ? 'var(--race)' : 'var(--text-3)',
});
const sectionLabel = 'text-[11px] font-extrabold uppercase mt-4 mb-2';
const sectionStyle = { letterSpacing: 'var(--tracking-label)', color: 'var(--text-3)' };

export default function RaceMuralSheet({ race, run, seconds, classification = '', achievements = [], memoryUrls, onSaved, onClose }) {
  const photosKey = (memoryUrls?.photos || []).join('|');
  const candidates = useMemo(() => muralCandidates({
    photos: memoryUrls?.photos || [],
    medal: memoryUrls?.medal || null,
    diploma: memoryUrls?.diploma || null,
    diplomaPath: race?.diploma_path || '',
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [photosKey, memoryUrls?.medal, memoryUrls?.diploma, race?.diploma_path]);
  const candidatesKey = candidates.map((c) => `${c.id}=${c.url}`).join('|');
  const data = useMemo(
    () => muralData({ race, run, seconds, classification, achievements }),
    [race, run, seconds, classification, achievements],
  );

  const storedRef = useRef(null);
  const touchedRef = useRef(false);
  const [composition, setComposition] = useState(() => {
    const fallback = defaultComposition({ candidates, data });
    // Já vem com a prova (select('*')) — sem pedido à parte.
    storedRef.current = race?.mural_composition || null;
    return sanitizeComposition(storedRef.current, fallback);
  });
  const update = (fn) => {
    touchedRef.current = true;
    setComposition((prev) => fn(prev));
  };

  /* Grava na prova por update à parte, com debounce (o mesmo padrão da hora
     da corrida/refeição): um erro fica só na consola — a composição
     continua a valer para partilhar já, só não sobrevive a fechar sem
     ligação. `onSaved` deixa quem monta tratar do store (como nas Memórias
     e no Balanço); sem ele, escreve direto. */
  const persistTimerRef = useRef(null);
  const persistComposition = async (next) => {
    if (!race?.id) return;
    try {
      const { error } = await supabase.from('race_events').update({ mural_composition: next }).eq('id', race.id);
      if (error) throw error;
      if (onSaved) {
        onSaved({ mural_composition: next });
      } else {
        const store = useAppStore.getState();
        store.setRaceEvents((store.raceEvents || []).map((e) => (e.id === race.id ? { ...e, mural_composition: next } : e)));
      }
    } catch (err) {
      console.warn('Composição do mural não gravada', err);
    }
  };
  useEffect(() => {
    if (!touchedRef.current) return undefined;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      // Já disparou: `handleClose` não tem mais nada pendente para gravar
      // outra vez (revisão pré-deploy 2026-09-14 — sem isto, fechar mesmo
      // neste instante repetia a mesma escrita).
      persistTimerRef.current = null;
      persistComposition(composition);
    }, PERSIST_DEBOUNCE_MS);
    return () => { if (persistTimerRef.current) clearTimeout(persistTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composition, race?.id]);
  // Fechar com uma alteração ainda por gravar (dentro dos 600ms): grava já,
  // em vez de a perder.
  const handleClose = () => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
      if (touchedRef.current) persistComposition(composition);
    }
    onClose?.();
  };

  // As memórias chegam assinadas depois de a persiana abrir: sem nada
  // guardado e sem o atleta ter mexido, a composição por omissão refaz-se
  // com elas.
  useEffect(() => {
    if (touchedRef.current || storedRef.current || !candidates.length) return;
    setComposition((prev) => ({
      ...defaultComposition({ candidates, data, template: prev.template, format: prev.format }),
      theme: prev.theme,
      brandCorner: prev.brandCorner,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatesKey]);

  const [assets, setAssets] = useState({ images: {}, logo: null, ready: false });
  useEffect(() => {
    let cancelled = false;
    loadStudioAssets(candidates.map((c) => c.url))
      .then((loaded) => { if (!cancelled) setAssets({ ...loaded, ready: true }); })
      .catch(() => { if (!cancelled) setAssets({ images: {}, logo: null, ready: true }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatesKey]);

  const [preview, setPreview] = useState(null);
  const [dropped, setDropped] = useState([]);
  useEffect(() => {
    if (!assets.ready) return undefined;
    const timer = setTimeout(() => {
      try {
        const { canvas, dropped: out } = renderMuralStudio({
          composition, data, candidates, images: assets.images, logo: assets.logo, scale: PREVIEW_SCALE, placeholders: true,
        });
        setPreview(canvas.toDataURL('image/jpeg', 0.85));
        setDropped(out || []);
      } catch (err) {
        console.warn('Pré-visualização do mural falhou', err);
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [composition, data, candidates, assets]);

  const [step, setStep] = useState('modelo');
  const layout = studioLayout(composition.template, composition.format, composition.brandCorner);
  const slotIds = layout.slots.map((s) => s.id);
  const [selectedSlot, setSelectedSlot] = useState('s1');
  const activeSlot = slotIds.includes(selectedSlot) ? selectedSlot : slotIds[0];
  const labelOf = (id) => candidates.find((c) => c.id === id)?.label || '';
  const slotLabel = (slotId, i) => {
    const assigned = composition.slots?.[slotId];
    return `Espaço ${i + 1}${assigned ? ` · ${labelOf(assigned.id)}` : ' · vazio'}`;
  };
  const openSlot = (slotId) => { setSelectedSlot(slotId); setStep('fotos'); };

  // ── partilhar / guardar ──
  const [shareError, setShareError] = useState('');
  const downloadRef = useRef(null);
  const fileName = muralFileName(race, composition.format);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const finalFile = async () => {
    const { canvas } = renderMuralStudio({ composition, data, candidates, images: assets.images, logo: assets.logo, scale: 1, placeholders: false });
    return canvasToFile(canvas, fileName);
  };
  const download = async (givenFile) => {
    setShareError('');
    try {
      const file = givenFile || await finalFile();
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
  const share = async () => {
    setShareError('');
    try {
      const file = await finalFile();
      if (canShare && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title: race?.name || 'A minha prova' });
        return;
      }
      download(file);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.warn('Partilha do mural falhou', err);
      setShareError('Não consegui abrir a partilha. Guarda a imagem e publica a partir da galeria.');
    }
  };

  const { width: W, height: H } = STUDIO_FORMATS[composition.format];
  const ratio = W / H;
  const assignedInActive = composition.slots?.[activeSlot];
  const focusCandidate = assignedInActive ? candidates.find((c) => c.id === assignedInActive.id) : null;
  const focusImage = focusCandidate ? assets.images[focusCandidate.url] : null;
  const naturalW = focusImage?.naturalWidth || focusImage?.width || 0;
  const naturalH = focusImage?.naturalHeight || focusImage?.height || 0;
  const activeSlotObj = layout.slots.find((s) => s.id === activeSlot);
  const slotAspect = activeSlotObj ? activeSlotObj.w / activeSlotObj.h : 1;
  // O visor tem sempre a proporção do ESPAÇO do modelo, não o seu tamanho em
  // píxeis do mural final — o recorte (o que fica visível) só depende da
  // proporção, por isso escolher um tamanho de ecrã cómodo dá o mesmo
  // resultado que desenhar direto no mural.
  const cropW = slotAspect >= 1 ? CROP_MAX_PX : CROP_MAX_PX * slotAspect;
  const cropH = slotAspect >= 1 ? CROP_MAX_PX / slotAspect : CROP_MAX_PX;
  const crop = naturalW && naturalH && assignedInActive
    ? coverCrop(naturalW, naturalH, cropW, cropH, assignedInActive.fx, assignedInActive.fy, assignedInActive.zoom)
    : null;
  const displayScale = crop ? cropW / crop.sw : 1;

  /* Arrastar move o centro do enquadramento; o zoom mantém-se fixo durante
     um gesto (o slider trata dele). `dragRef` guarda o ponto de partida e o
     recorte de então, para o cálculo não derivar com o arrastar contínuo. */
  const dragRef = useRef(null);
  const cropRef = useRef(null);
  const startDrag = (e) => {
    if (!crop || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startFx: assignedInActive.fx, startFy: assignedInActive.fy, sw: crop.sw, sh: crop.sh };
  };
  const onDragMove = (e) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dxSource = (e.clientX - d.startX) / (cropW / d.sw);
    const dySource = (e.clientY - d.startY) / (cropH / d.sh);
    update((c) => setSlotFocus(c, activeSlot, d.startFx - dxSource / naturalW, d.startFy - dySource / naturalH));
  };
  const endDrag = (e) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* já libertado */ }
    }
    dragRef.current = null;
  };
  useEffect(() => {
    const el = cropRef.current;
    if (!el) return undefined;
    // O `Sheet` arrasta o corpo para fechar (Sheet.jsx); sem isto, mover o
    // dedo aqui para enquadrar também tentava fechar a persiana.
    const stopWhileDragging = (e) => {
      if (dragRef.current) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); }
    };
    el.addEventListener('touchmove', stopWhileDragging, { passive: false });
    return () => el.removeEventListener('touchmove', stopWhileDragging);
  }, []);
  const onCropKey = (e) => {
    const map = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!map[e.key] || !assignedInActive) return;
    e.preventDefault();
    const [dx, dy] = map[e.key];
    // A um zoom maior o mesmo toque em setas move menos da imagem, para o
    // nudge parecer sempre do mesmo tamanho visual.
    const nudge = 0.04 / (assignedInActive.zoom || MIN_STUDIO_ZOOM);
    update((c) => setSlotFocus(c, activeSlot, assignedInActive.fx + dx * nudge, assignedInActive.fy + dy * nudge));
  };

  return (
    <Sheet eyebrow="Mural" eyebrowTone="race" title={race?.name || 'A prova'} onClose={handleClose} testId="race-mural-sheet" maxHeight="96dvh">
      {/* Pré-visualização, sempre à vista; os espaços tocam-se nela. */}
      <div className="sticky top-0 z-10 pt-2 pb-3" style={{ background: 'var(--bg-sheet)' }}>
        <div className="relative mx-auto" style={{ width: `min(100%, calc(40dvh * ${ratio}))`, aspectRatio: `${W} / ${H}`, borderRadius: 14, overflow: 'hidden', background: 'rgba(255,255,255,.04)', border: '1px solid var(--border-glass)' }}>
          {preview
            ? <img src={preview} alt={`Mural da ${race?.name || 'prova'}`} data-testid="race-mural-preview" style={{ width: '100%', height: '100%', display: 'block' }} />
            : <div className="w-full h-full animate-pulse" role="status" aria-label="A compor o mural" />}
          {layout.slots.map((slot, i) => {
            const active = step === 'fotos' && slot.id === activeSlot;
            return (
              <button
                key={slot.id}
                type="button"
                data-testid={`race-mural-slot-${slot.id}`}
                aria-label={slotLabel(slot.id, i)}
                aria-pressed={active}
                onClick={() => openSlot(slot.id)}
                className="absolute"
                style={{
                  left: `${(slot.x / W) * 100}%`, top: `${(slot.y / H) * 100}%`, width: `${(slot.w / W) * 100}%`, height: `${(slot.h / H) * 100}%`,
                  borderRadius: slot.shape === 'circle' ? '50%' : 6, background: 'transparent', padding: 0,
                  border: active ? '2px solid var(--race)' : '1px solid transparent',
                  boxShadow: active ? '0 0 0 3px rgba(251,191,36,.25)' : 'none',
                }}
              />
            );
          })}
        </div>
        {dropped.length > 0 && (
          <p data-testid="race-mural-dropped" className="text-[11.5px] leading-[1.45] mt-2 text-center" style={{ color: 'var(--warn)' }}>
            {`Não coube neste formato: ${dropped.map((k) => GRAPHIC_LABEL[k]).join(', ')}. Experimenta o Story ou desliga outro grafismo.`}
          </p>
        )}
        <div className="flex gap-2 mt-3" role="group" aria-label="Passos do mural">
          {STEPS.map((s) => (
            <button key={s.key} type="button" aria-pressed={step === s.key} data-testid={`race-mural-step-${s.key}`} onClick={() => setStep(s.key)} className="flex-1 text-[12.5px] font-extrabold" style={chip(step === s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {step === 'modelo' && (
        <div data-testid="race-mural-panel-modelo">
          <p className={sectionLabel} style={sectionStyle}>Formato</p>
          <div className="flex gap-2" role="group" aria-label="Formato do mural">
            {Object.entries(STUDIO_FORMATS).map(([key, f]) => (
              <button key={key} type="button" aria-pressed={composition.format === key} data-testid={`race-mural-format-${key}`} onClick={() => update((c) => ({ ...c, format: key }))} className="flex-1 flex flex-col items-center justify-center" style={chip(composition.format === key)}>
                <span className="text-[12.5px] font-extrabold">{f.label}</span>
                <span className="text-[11px]" style={{ color: 'var(--text-4)' }}>{f.hint}</span>
              </button>
            ))}
          </div>

          <p className={sectionLabel} style={sectionStyle}>Modelo</p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Modelo do mural">
            {STUDIO_TEMPLATES.map((t) => {
              const active = composition.template === t.key;
              const mini = studioLayout(t.key, composition.format, composition.brandCorner);
              return (
                <button key={t.key} type="button" aria-pressed={active} data-testid={`race-mural-template-${t.key}`} onClick={() => update((c) => switchTemplate(c, t.key, candidates))} className="flex items-center gap-2.5 text-left p-2" style={chip(active)}>
                  <span aria-hidden="true" className="relative shrink-0" style={{ width: 34, aspectRatio: `${mini.width} / ${mini.height}`, borderRadius: 4, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
                    {mini.slots.map((s) => (
                      <span key={s.id} className="absolute" style={{ left: `${(s.x / mini.width) * 100}%`, top: `${(s.y / mini.height) * 100}%`, width: `${(s.w / mini.width) * 100}%`, height: `${(s.h / mini.height) * 100}%`, borderRadius: s.shape === 'circle' ? '50%' : 2, background: active ? 'var(--race)' : 'var(--text-4)', opacity: 0.7 }} />
                    ))}
                    <span className="absolute" style={{ left: '14%', right: '30%', height: 3, borderRadius: 2, top: `${((mini.text.anchor === 'bottom' ? mini.text.bottom - 40 : mini.text.top + 10) / mini.height) * 100}%`, background: active ? 'var(--race)' : 'var(--text-3)' }} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-extrabold">{t.label}</span>
                    <span className="block text-[11px] leading-[1.3]" style={{ color: 'var(--text-4)' }}>{t.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 'fotos' && (
        <div data-testid="race-mural-panel-fotos">
          {slotIds.length === 0 ? (
            <p className="text-[12.5px] leading-[1.5] mt-4" style={{ color: 'var(--text-3)' }}>O modelo Só números não leva fotografias. Escolhe outro modelo para as usares.</p>
          ) : (
            <>
              <p className={sectionLabel} style={sectionStyle}>Espaço</p>
              <div className="flex gap-2 overflow-x-auto no-scrollbar" role="group" aria-label="Espaços do modelo">
                {slotIds.map((slotId, i) => (
                  <button key={slotId} type="button" aria-pressed={slotId === activeSlot} onClick={() => setSelectedSlot(slotId)} className="shrink-0 px-3 text-[12px] font-extrabold" style={chip(slotId === activeSlot)}>
                    {`Espaço ${i + 1}`}
                  </button>
                ))}
              </div>

              <p className={sectionLabel} style={sectionStyle}>Memória para este espaço</p>
              {candidates.length === 0 ? (
                <p className="text-[12.5px] leading-[1.5]" style={{ color: 'var(--text-3)' }}>Junta fotografias, a medalha ou o diploma nas Memórias da prova para as usares aqui.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2" role="group" aria-label="Memórias da prova">
                  {candidates.map((c) => {
                    const inActive = assignedInActive?.id === c.id;
                    const usedIn = slotIds.findIndex((sid) => composition.slots?.[sid]?.id === c.id);
                    return (
                      <button key={c.id} type="button" data-testid={`race-mural-candidate-${c.id}`} aria-pressed={inActive} aria-label={`${c.label}${usedIn >= 0 ? `, no espaço ${usedIn + 1}` : ''}`} onClick={() => update((comp) => assignSlot(comp, activeSlot, c.id))} className="relative overflow-hidden" style={{ aspectRatio: '1 / 1', borderRadius: 12, padding: 0, border: `2px solid ${inActive ? 'var(--race)' : 'var(--border-glass-strong)'}`, background: 'rgba(255,255,255,.04)' }}>
                        <img src={c.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: usedIn >= 0 && !inActive ? 0.55 : 1 }} />
                        <span className="absolute left-0 right-0 bottom-0 text-[11px] font-extrabold text-center" style={{ padding: '2px 0', background: 'rgba(8,12,22,.72)', color: '#fff' }}>
                          {usedIn >= 0 ? `${c.label} · ${usedIn + 1}` : c.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {focusCandidate && (
                <>
                  <div className="flex items-center justify-between mt-4 mb-2">
                    <p className="text-[11px] font-extrabold uppercase" style={sectionStyle}>Enquadramento</p>
                    <button type="button" onClick={() => update((c) => clearSlot(c, activeSlot))} className="text-[12px] font-bold" style={{ minHeight: 44, color: 'var(--text-3)' }}>Tirar deste espaço</button>
                  </div>
                  <p className="text-[11.5px] leading-[1.45] mb-2" style={{ color: 'var(--text-4)' }}>Arrasta a foto para a mover; desliza para ampliar.</p>
                  <div className="flex justify-center">
                    {crop ? (
                      <div
                        ref={cropRef}
                        tabIndex={0}
                        role="group"
                        data-testid="race-mural-crop"
                        aria-label="Enquadramento da foto: arrasta para mover, usa as setas para ajustar"
                        onPointerDown={startDrag}
                        onPointerMove={onDragMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        onKeyDown={onCropKey}
                        className="relative overflow-hidden"
                        style={{ width: cropW, height: cropH, borderRadius: activeSlotObj?.shape === 'circle' ? '50%' : 12, border: '1px solid var(--border-glass-strong)', background: 'rgba(255,255,255,.04)', cursor: 'grab', touchAction: 'none' }}
                      >
                        <img
                          src={focusCandidate.url}
                          alt=""
                          draggable={false}
                          style={{ position: 'absolute', left: -crop.sx * displayScale, top: -crop.sy * displayScale, width: naturalW * displayScale, height: naturalH * displayScale, maxWidth: 'none', pointerEvents: 'none' }}
                        />
                      </div>
                    ) : (
                      <div className="animate-pulse" role="status" aria-label="A carregar a foto" style={{ width: cropW, height: cropH, borderRadius: activeSlotObj?.shape === 'circle' ? '50%' : 12, background: 'rgba(255,255,255,.06)' }} />
                    )}
                  </div>
                  {crop && (
                    <div className="flex items-center gap-2.5 mt-3">
                      <span className="text-[11px] font-bold shrink-0" style={{ color: 'var(--text-4)' }}>Ampliar</span>
                      <input
                        type="range"
                        data-testid="race-mural-zoom"
                        aria-label="Ampliar a foto"
                        min={MIN_STUDIO_ZOOM}
                        max={MAX_STUDIO_ZOOM}
                        step={0.05}
                        value={assignedInActive.zoom ?? MIN_STUDIO_ZOOM}
                        onChange={(e) => update((c) => setSlotZoom(c, activeSlot, Number(e.target.value)))}
                        className="flex-1"
                        style={{ accentColor: 'var(--race)' }}
                      />
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {step === 'grafismos' && (
        <div data-testid="race-mural-panel-grafismos">
          <p className={sectionLabel} style={sectionStyle}>Grafismos</p>
          <div className="flex flex-col gap-1.5">
            {STUDIO_GRAPHICS.map((g) => {
              const reason = graphicUnavailableReason(g.key, { data, candidates, template: composition.template });
              const on = !reason && !!composition.graphics?.[g.key];
              return (
                <button key={g.key} type="button" role="switch" aria-checked={on} disabled={!!reason} data-testid={`race-mural-graphic-${g.key}`} onClick={() => update((c) => toggleGraphic(c, g.key))} className="flex items-center justify-between gap-3 text-left px-3 disabled:opacity-55" style={{ ...chip(on), minHeight: 48 }}>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-extrabold" style={{ color: on ? 'var(--race)' : 'var(--text-2)' }}>{g.label}</span>
                    {reason && <span className="block text-[11px]" style={{ color: 'var(--text-4)' }}>{reason}</span>}
                  </span>
                  <span aria-hidden="true" className="shrink-0 relative" style={{ width: 36, height: 20, borderRadius: 99, background: on ? 'var(--race)' : 'rgba(255,255,255,.14)' }}>
                    <span className="absolute" style={{ top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: on ? 'var(--race-ink)' : 'var(--text-3)', transition: 'left var(--dur-fast, 150ms)' }} />
                  </span>
                </button>
              );
            })}
          </div>

          <p className={sectionLabel} style={sectionStyle}>Cor</p>
          <div className="flex gap-2" role="group" aria-label="Tema de cor">
            {Object.entries(STUDIO_THEMES).map(([key, t]) => (
              <button key={key} type="button" aria-pressed={composition.theme === key} data-testid={`race-mural-theme-${key}`} onClick={() => update((c) => ({ ...c, theme: key }))} className="flex-1 inline-flex items-center justify-center gap-2 text-[12.5px] font-extrabold" style={chip(composition.theme === key)}>
                <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: '50%', background: t.accent, boxShadow: `0 0 0 3px ${t.bg}` }} />
                {t.label}
              </button>
            ))}
          </div>

          <p className={sectionLabel} style={sectionStyle}>Canto da marca</p>
          <div className="flex gap-2" role="group" aria-label="Canto da marca IronCoach">
            {Object.entries(BRAND_CORNERS).map(([key, label]) => {
              const Icon = CORNER_ICONS[key];
              return (
                <button key={key} type="button" aria-pressed={composition.brandCorner === key} aria-label={label} data-testid={`race-mural-corner-${key}`} onClick={() => update((c) => ({ ...c, brandCorner: key }))} className="flex-1 inline-flex items-center justify-center" style={chip(composition.brandCorner === key)}>
                  <Icon size={16} />
                </button>
              );
            })}
          </div>

          {/* Um canto de verdade para a medalha (relatado 2026-09-14: ficava
              perto do texto, por cima do que estivesse na foto por baixo) —
              só faz sentido com uma medalha para pôr e num modelo que a
              mostre como decoração (o Troféu já a põe ao centro). Só cantos
              de cima (achado na revisão pré-deploy 2026-09-14: em baixo caía
              sempre em cima do texto, que ocupa a banda de baixo da tela). */}
          {!graphicUnavailableReason('medalhao', { data, candidates, template: composition.template }) && (
            <>
              <p className={sectionLabel} style={sectionStyle}>Canto da medalha</p>
              <div className="flex gap-2" role="group" aria-label="Canto da medalha">
                {Object.entries(MEDAL_CORNERS).map(([key, label]) => {
                  const Icon = CORNER_ICONS[key];
                  return (
                    <button key={key} type="button" aria-pressed={composition.medalCorner === key} aria-label={label} data-testid={`race-mural-medal-corner-${key}`} onClick={() => update((c) => ({ ...c, medalCorner: key }))} className="flex-1 inline-flex items-center justify-center" style={chip(composition.medalCorner === key)}>
                      <Icon size={16} />
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {shareError && (
        <Warning title="Partilha" className="mt-3" actions={<WarningAction onClick={() => download()}>Guardar a imagem</WarningAction>}>{shareError}</Warning>
      )}

      <div className="flex gap-2 mt-5">
        <button type="button" data-testid="race-mural-share" onClick={share} disabled={!assets.ready} className="flex-1 inline-flex items-center justify-center gap-2 rounded-[14px] text-[13.5px] font-extrabold disabled:opacity-45" style={{ minHeight: 'var(--tap)', background: 'var(--grad-race)', color: 'var(--race-ink)', border: 'none' }}>
          <Share2 size={16} /> {canShare ? 'Partilhar' : 'Guardar'}
        </button>
        {canShare && (
          <button type="button" data-testid="race-mural-download" onClick={() => download()} disabled={!assets.ready} aria-label="Guardar a imagem" className="inline-flex items-center justify-center rounded-[14px] disabled:opacity-45" style={{ minHeight: 'var(--tap)', minWidth: 'var(--tap)', padding: '0 16px', background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-2)' }}>
            <Download size={16} />
          </button>
        )}
      </div>
      <a ref={downloadRef} href="#" hidden aria-hidden="true">guardar</a>
    </Sheet>
  );
}
