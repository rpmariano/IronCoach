import { describe, it, expect } from 'vitest';
import {
  STUDIO_FORMATS, STUDIO_TEMPLATES, MIN_STUDIO_ZOOM, MAX_STUDIO_ZOOM, DEFAULT_MEDAL_CORNER, BRAND_CORNERS, MEDAL_CORNERS, studioLayout,
  templateSlotIds, coverCrop, fillSlots, defaultComposition, switchTemplate, assignSlot, clearSlot, setSlotFocus,
  setSlotZoom, toggleGraphic, sanitizeComposition, planBlocks, pacePoints, muralData, graphicUnavailableReason,
  splitPaces, paceLabel, distanceLabel, brandBox, medalCornerBox,
} from './muralStudio';

/* O estúdio do mural (pedido 2026-09-14): o atleta monta o mural com
   modelos e grafismos prontos. Aqui, a parte pura. */

const CANDIDATES = [
  { id: 'photo-0', url: 'p0' }, { id: 'photo-1', url: 'p1' }, { id: 'photo-2', url: 'p2' },
  { id: 'photo-3', url: 'p3' }, { id: 'photo-4', url: 'p4' }, { id: 'photo-5', url: 'p5' },
  { id: 'medal', url: 'm' }, { id: 'diploma', url: 'd' },
];

const TEJO = { id: 'race-1', name: 'Corrida do Tejo', date: '2026-09-13', location: 'Lisboa', distance_km: 10 };
const RUN = {
  id: 'run-1', distance_km: 10.11,
  details: {
    official_time_seconds: 3087, gun_time_seconds: 3111, position: 1668, age_group_position: 226,
    official_splits: [{ km: 5, seconds: 1515 }],
    splits: [{ distance_km: 1, time_seconds: 305 }, { distance_km: 1, time_seconds: 291 }, { distance_km: 1, time_seconds: 312 }, { distance_km: 0.11, time_seconds: 30 }],
  },
};

describe('studioLayout', () => {
  it('cada modelo, em cada formato: os espaços cabem na imagem e a zona do texto tem altura', () => {
    const expected = { capa: 1, mosaico4: 4, mosaico6: 6, trofeu: 1, numeros: 0 };
    for (const { key } of STUDIO_TEMPLATES) {
      for (const format of Object.keys(STUDIO_FORMATS)) {
        for (const corner of ['tl', 'br']) {
          const l = studioLayout(key, format, corner);
          expect(l.slots).toHaveLength(expected[key]);
          l.slots.forEach((s) => {
            expect(s.x).toBeGreaterThanOrEqual(0);
            expect(s.y).toBeGreaterThanOrEqual(0);
            expect(s.x + s.w).toBeLessThanOrEqual(l.width + 0.5);
            expect(s.y + s.h).toBeLessThanOrEqual(l.height + 0.5);
            expect(s.w).toBeGreaterThan(80);
            expect(s.h).toBeGreaterThan(80);
          });
          expect(l.text.bottom - l.text.top).toBeGreaterThan(200);
          // Nos mosaicos o texto começa abaixo das fotos.
          if (key.startsWith('mosaico')) expect(l.text.top).toBeGreaterThan(Math.max(...l.slots.map((s) => s.y + s.h)));
        }
      }
    }
  });

  it('a marca em baixo tira altura ao texto; em cima não', () => {
    const top = studioLayout('capa', 'retrato', 'tl');
    const bottom = studioLayout('capa', 'retrato', 'br');
    expect(bottom.text.bottom).toBeLessThan(top.text.bottom);
    expect(brandBox('retrato', 'br')).toMatchObject({ left: false, top: false });
    expect(brandBox('story', 'tl')).toMatchObject({ x: 48, y: 48, left: true, top: true });
  });

  it('o Troféu tem um espaço redondo ao centro; o formato desconhecido cai para o retrato', () => {
    const l = studioLayout('trofeu', 'story');
    expect(l.slots[0].shape).toBe('circle');
    expect(l.slots[0].x + l.slots[0].w / 2).toBeCloseTo(l.width / 2);
    expect(studioLayout('capa', 'inventado').height).toBe(1350);
    expect(templateSlotIds('mosaico6')).toEqual(['s1', 's2', 's3', 's4', 's5', 's6']);
  });
});

describe('medalCornerBox', () => {
  it('um canto de verdade, redondo — nunca perto do texto (relatado 2026-09-14: "estragava uma foto")', () => {
    const { width, height } = STUDIO_FORMATS.retrato;
    expect(medalCornerBox('retrato', 'tl')).toMatchObject({ x: 48, y: 48, shape: 'circle' });
    const br = medalCornerBox('retrato', 'br');
    expect(br.x + br.w).toBeCloseTo(width - 48);
    expect(br.y + br.h).toBeCloseTo(height - 48);
    expect(br.w).toBe(br.h); // é uma medalha, redonda
  });

  it('no mesmo canto que a marca, afasta-se dela ao longo do lado partilhado, sem se sobrepor', () => {
    const brand = brandBox('retrato', 'tl');
    const medal = medalCornerBox('retrato', 'tl', 'tl');
    expect(medal.x).toBe(brand.x); // mesmo lado (esquerda)
    expect(medal.y).toBeGreaterThanOrEqual(brand.y + brand.h); // por baixo, sem tocar
    const bottomBrand = brandBox('retrato', 'br');
    const bottomMedal = medalCornerBox('retrato', 'br', 'br');
    expect(bottomMedal.y + bottomMedal.h).toBeLessThanOrEqual(bottomBrand.y);
  });

  it('em cantos diferentes, cada um fica no seu — sem afastamento nenhum', () => {
    expect(medalCornerBox('retrato', 'br', 'tl')).toEqual(medalCornerBox('retrato', 'br'));
  });
});

describe('coverCrop', () => {
  it('sem zoom (1), centra no ponto de foco e nunca sai da imagem', () => {
    // Foto 2000×1000 numa caixa quadrada: recorte 1000×1000.
    expect(coverCrop(2000, 1000, 500, 500, 0.5, 0.5)).toEqual({ sx: 500, sy: 0, sw: 1000, sh: 1000 });
    expect(coverCrop(2000, 1000, 500, 500, 0, 0.5).sx).toBe(0);
    expect(coverCrop(2000, 1000, 500, 500, 1, 0.5).sx).toBe(1000);
    expect(coverCrop(2000, 1000, 500, 500, 0.6, 0.5).sx).toBe(700);
    // Um foco perto da borda encosta à borda, não sai da imagem.
    expect(coverCrop(2000, 1000, 500, 500, 0.9, 0.5).sx).toBe(1000);
  });

  it('ampliar aperta o recorte à volta do centro; o mínimo é o que preenche a caixa', () => {
    // Ao dobrar o zoom, o recorte fica com metade da largura e da altura.
    expect(coverCrop(2000, 1000, 500, 500, 0.5, 0.5, 2)).toEqual({ sx: 750, sy: 250, sw: 500, sh: 500 });
    // Zoom abaixo do mínimo trata-se como o mínimo (sem zoom).
    expect(coverCrop(2000, 1000, 500, 500, 0.5, 0.5, 0.3)).toEqual({ sx: 500, sy: 0, sw: 1000, sh: 1000 });
    // Um recorte apertado ainda respeita as bordas com o foco encostado.
    expect(coverCrop(2000, 1000, 500, 500, 0.02, 0.5, 3).sx).toBe(0);
  });
});

describe('composição', () => {
  const data = muralData({ race: TEJO, run: RUN, seconds: 3087, classification: '1668.º geral · 226.º no escalão', achievements: [{ name: 'Prova concluída' }] });

  it('por omissão: Capa, a primeira foto, e só os grafismos que os dados permitem', () => {
    const c = defaultComposition({ candidates: CANDIDATES, data });
    expect(c).toMatchObject({ template: 'capa', format: 'retrato', theme: 'dourado', brandCorner: 'tl', medalCorner: DEFAULT_MEDAL_CORNER });
    expect(c.slots).toEqual({ s1: { id: 'photo-0', fx: 0.5, fy: 0.42, zoom: 1 } });
    expect(c.graphics).toEqual({ titulo: true, tempo: true, numeros: true, classificacao: true, ritmo: true, conquistas: false, diploma: false, medalhao: true });
    const semNada = defaultComposition({ candidates: [], data: muralData({ race: TEJO, run: { distance_km: 10, details: {} }, seconds: 3087 }) });
    expect(semNada.graphics).toMatchObject({ ritmo: false, classificacao: false, medalhao: false, diploma: false });
  });

  it('enche os espaços: fotos do dia primeiro, medalha e diploma no fim; no Troféu a medalha vai ao centro', () => {
    const m6 = fillSlots('mosaico6', CANDIDATES);
    expect(Object.values(m6).map((s) => s.id)).toEqual(['photo-0', 'photo-1', 'photo-2', 'photo-3', 'photo-4', 'photo-5']);
    expect(Object.values(fillSlots('mosaico6', [CANDIDATES[0], CANDIDATES[6], CANDIDATES[7]])).map((s) => s.id)).toEqual(['photo-0', 'medal', 'diploma']);
    expect(fillSlots('trofeu', CANDIDATES).s1.id).toBe('medal');
    expect(fillSlots('numeros', CANDIDATES)).toEqual({});
  });

  it('trocar de modelo mantém as fotos escolhidas pela ordem, os focos e o zoom', () => {
    let c = defaultComposition({ candidates: CANDIDATES, data, template: 'mosaico4' });
    c = assignSlot(c, 's1', 'photo-3');
    c = setSlotFocus(c, 's1', 0.2, 0.9);
    c = setSlotZoom(c, 's1', 2);
    const capa = switchTemplate(c, 'capa', CANDIDATES);
    expect(capa.slots.s1).toEqual({ id: 'photo-3', fx: 0.2, fy: 0.9, zoom: 2 });
    const m6 = switchTemplate(c, 'mosaico6', CANDIDATES);
    expect(m6.slots.s1.id).toBe('photo-3');
    expect(Object.values(m6.slots)).toHaveLength(6);
    const trofeu = switchTemplate(c, 'trofeu', CANDIDATES);
    expect(trofeu.slots.s1.id).toBe('medal');
    expect(trofeu.graphics.medalhao).toBe(false);
    expect(switchTemplate(c, 'inventado', CANDIDATES)).toBe(c);
  });

  it('pôr uma foto que já está noutro espaço troca as duas (foco e zoom incluídos); tirar esvazia', () => {
    let c = defaultComposition({ candidates: CANDIDATES, data, template: 'mosaico4' });
    c = setSlotFocus(c, 's3', 0.1, 0.1);
    c = setSlotZoom(c, 's3', 2.5);
    c = assignSlot(c, 's1', 'photo-2');
    expect(c.slots.s1).toEqual({ id: 'photo-2', fx: 0.1, fy: 0.1, zoom: 2.5 });
    expect(c.slots.s3).toMatchObject({ id: 'photo-0', zoom: 1 });
    c = clearSlot(c, 's2');
    expect(c.slots.s2).toBeUndefined();
    c = assignSlot(c, 's4', 'photo-2');
    expect(c.slots.s4).toMatchObject({ id: 'photo-2', zoom: 2.5 });
    expect(c.slots.s1.id).toBe('photo-3');
    expect(setSlotFocus(c, 's2', 0.5, 0.5)).toBe(c);
    expect(setSlotFocus(c, 's4', 7, -3).slots.s4).toMatchObject({ fx: 1, fy: 0 });
    expect(setSlotZoom(c, 's2', 2)).toBe(c);
    expect(setSlotZoom(c, 's4', 10).slots.s4.zoom).toBe(MAX_STUDIO_ZOOM);
    expect(setSlotZoom(c, 's4', 0).slots.s4.zoom).toBe(MIN_STUDIO_ZOOM);
  });

  it('interruptores só para grafismos conhecidos', () => {
    const c = defaultComposition({ candidates: CANDIDATES, data });
    expect(toggleGraphic(c, 'ritmo').graphics.ritmo).toBe(false);
    expect(toggleGraphic(c, 'inventado')).toBe(c);
  });

  it('o que vem gravado (doutro dispositivo, ou de uma versão antiga sem zoom) só entra validado', () => {
    const fallback = defaultComposition({ candidates: CANDIDATES, data });
    const s = sanitizeComposition({
      format: 'story', template: 'mosaico4', theme: 'rosa', brandCorner: 'br', medalCorner: 'tr',
      slots: { s1: { id: 'photo-1', fx: 3, fy: 'x', zoom: 12 }, s9: { id: 'photo-2' }, s2: { id: '' }, s3: { id: 'photo-3' } },
      graphics: { ritmo: false, conquistas: 'sim', inventado: true },
    }, fallback);
    expect(s).toMatchObject({ format: 'story', template: 'mosaico4', theme: 'dourado', brandCorner: 'br', medalCorner: 'tr' });
    // Sem medalCorner (um mural gravado antes de existir), cai no valor por omissão da composição atual.
    expect(sanitizeComposition({ template: 'capa' }, fallback).medalCorner).toBe(fallback.medalCorner);
    // 'br'/'bl' gravado antes da correção (caía em cima do texto) também cai no valor por omissão.
    expect(sanitizeComposition({ template: 'capa', medalCorner: 'br' }, fallback).medalCorner).toBe(fallback.medalCorner);
    // fx=3 encosta ao máximo (1); zoom=12 encosta ao máximo (3); sem zoom (s3, um mural gravado antes de existir) cai no mínimo (1).
    expect(s.slots).toEqual({ s1: { id: 'photo-1', fx: 1, fy: 0.42, zoom: MAX_STUDIO_ZOOM }, s3: { id: 'photo-3', fx: 0.5, fy: 0.42, zoom: MIN_STUDIO_ZOOM } });
    expect(s.graphics).toMatchObject({ ritmo: false, conquistas: false });
    expect(s.graphics).not.toHaveProperty('inventado');
    expect(sanitizeComposition(null, fallback)).toBe(fallback);
  });
});

describe('planBlocks', () => {
  const block = (key, h) => ({ key, height: (s) => h * s });
  it('cabe à primeira; senão encolhe; senão tira pela ordem, e o tempo nunca sai', () => {
    const blocks = [block('titulo', 200), block('tempo', 300), block('ritmo', 200), block('diploma', 300)];
    expect(planBlocks(blocks, 1000)).toEqual({ scale: 1, kept: ['titulo', 'tempo', 'ritmo', 'diploma'], dropped: [] });
    expect(planBlocks(blocks, 900).scale).toBe(0.9);
    // Sem o diploma cabe a 70%.
    expect(planBlocks(blocks, 500)).toEqual({ scale: 0.7, kept: ['titulo', 'tempo', 'ritmo'], dropped: ['diploma'] });
    const apertado = planBlocks(blocks, 400);
    expect(apertado.dropped).toEqual(['diploma', 'ritmo']);
    expect(apertado.kept).toEqual(['titulo', 'tempo']);
    expect(apertado.scale).toBe(0.8);
    const impossivel = planBlocks([block('tempo', 5000)], 100);
    expect(impossivel).toEqual({ scale: 0.7, kept: ['tempo'], dropped: [] });
  });
});

describe('dados do mural', () => {
  it('ritmo por km sem o bocado final, rótulos em português', () => {
    expect(splitPaces(RUN.details.splits)).toEqual([305, 291, 312]);
    expect(splitPaces(null)).toEqual([]);
    expect(paceLabel(305.4)).toBe('5:05');
    expect(paceLabel(0)).toBe('');
    expect(distanceLabel(10.11)).toBe('10,11 km');
    expect(distanceLabel(0)).toBe('');
  });

  it('cabeçalho, tempo, números, cartão do diploma e conquistas', () => {
    const d = muralData({ race: TEJO, run: RUN, seconds: 3087, classification: '1668.º geral', achievements: [{ name: 'Prova concluída' }, { name: 'Objetivo batido' }] });
    expect(d).toMatchObject({
      eyebrow: 'PROVA CONCLUÍDA · 13 SET 2026 · LISBOA', name: 'Corrida do Tejo', time: '51:27',
      distance: '10,11 km', pace: '5:05 /km', classification: '1668.º geral', fastestPace: '4:51',
      achievements: ['Prova concluída', 'Objetivo batido'],
    });
    expect(d.diplomaCells).toEqual([
      { label: 'Tempo chip', value: '51:27' }, { label: 'Tempo bruto', value: '51:51' },
      { label: '5 km', value: '25:15' }, { label: 'Geral', value: '1668.º' }, { label: 'Escalão', value: '226.º' },
    ]);
    // Só o tempo oficial não faz um cartão: repetia o tempo em grande.
    expect(muralData({ race: TEJO, run: { details: { official_time_seconds: 3087 } }, seconds: 3087 }).diplomaCells).toEqual([]);
  });

  it('diz porque um grafismo não está disponível', () => {
    const d = muralData({ race: TEJO, run: { distance_km: 10, details: {} }, seconds: 3087 });
    expect(graphicUnavailableReason('ritmo', { data: d, candidates: [] })).toBe('Sem parciais por km');
    expect(graphicUnavailableReason('medalhao', { data: d, candidates: [] })).toBe('Sem fotografia da medalha');
    expect(graphicUnavailableReason('medalhao', { data: d, candidates: CANDIDATES, template: 'trofeu' })).toMatch(/Troféu/);
    // "Só números" não tem canto de cima livre (o texto ocupa quase a tela toda).
    expect(graphicUnavailableReason('medalhao', { data: d, candidates: CANDIDATES, template: 'numeros' })).toBe('Sem espaço livre neste modelo');
    expect(graphicUnavailableReason('medalhao', { data: d, candidates: CANDIDATES, template: 'capa' })).toBeNull();
    expect(graphicUnavailableReason('titulo', { data: d })).toBeNull();
  });

  it('a medalha nunca cobre o texto, mesmo empilhada com a marca no mesmo canto (achado na revisão pré-deploy 2026-09-14)', () => {
    for (const template of ['capa', 'mosaico4', 'mosaico6']) {
      for (const format of Object.keys(STUDIO_FORMATS)) {
        for (const brandCorner of Object.keys(BRAND_CORNERS)) {
          for (const medalCorner of Object.keys(MEDAL_CORNERS)) {
            const layout = studioLayout(template, format, brandCorner);
            const box = medalCornerBox(format, medalCorner, brandCorner);
            expect(box.y + box.h).toBeLessThanOrEqual(layout.text.top + 0.5);
          }
        }
      }
    }
  });

  it('a linha do ritmo: mais rápido em cima, plana se não houver diferença', () => {
    expect(pacePoints([300, 280], 100, 50)).toEqual([{ x: 0, y: 50 }, { x: 100, y: 0 }]);
    expect(pacePoints([300, 300], 100, 50)).toEqual([{ x: 0, y: 25 }, { x: 100, y: 25 }]);
    expect(pacePoints([300], 100, 50)).toEqual([]);
  });
});
