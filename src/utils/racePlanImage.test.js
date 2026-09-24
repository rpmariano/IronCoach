import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildRacePacingPlan } from '@formulas/racePacing.ts';
import {
  racePlanImageModel, racePlanFileName, drawRacePlanImage, shareOrDownload, kmLabel, basisLabel,
  PLAN_IMAGE_WIDTH, PLAN_IMAGE_MIN_HEIGHT,
} from './racePlanImage';

/* O plano de ritmos como imagem (ação P.13): o texto sai do mesmo plano que
   o cartão mostra, e o desenho só pinta. Sem canvas no jsdom, o desenho
   testa-se com um contexto que regista o que lhe pedem. */

const race = { id: 'r1', name: 'Meia de Lisboa', date: '2026-09-20', start_time: '09:30:00', distance_km: 21.0975 };
const meia = () => buildRacePacingPlan({ distanceKm: 21.0975, raceType: 'estrada', targetSeconds: 105 * 60, predictedSeconds: 106 * 60 });

function stubCanvas() {
  const texts = [];
  let fills = 0;
  const ctx = {
    font: '10px sans-serif', fillStyle: '#000', strokeStyle: '#000', textAlign: 'left', textBaseline: 'alphabetic', lineWidth: 1,
    measureText(t) {
      const px = Number(/(\d+)px/.exec(this.font)?.[1] || 10);
      return { width: String(t).length * px * 0.55 };
    },
    fillText(t, x, y) { texts.push({ t, x, y, color: this.fillStyle }); },
    fillRect() {}, drawImage() {}, beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, stroke() {},
    fill() { fills += 1; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  return { canvas: { width: 0, height: 0, getContext: () => ctx }, texts, fills: () => fills };
}

describe('racePlanImageModel — o que a imagem diz', () => {
  it('a prova, quando, a chegada planeada e os troços do mesmo plano do cartão', () => {
    const plan = meia();
    const m = racePlanImageModel(plan, race);
    expect(m.name).toBe('Meia de Lisboa');
    expect(m.when).toBe('20 set 2026 · partida às 09:30');
    expect(m.finish).toMatch(/^1:4\d:\d\d$/);
    expect(m.basis).toBe(basisLabel(plan));
    expect(m.rows).toHaveLength(plan.rows.length);
    expect(m.rows[0]).toMatchObject({ km: 'km 0 a 1', label: 'controlar', tone: 'muted' });
    expect(m.rows[0].pace).toMatch(/^\d\.\d\d\/km$/);
    // O último troço acaba na distância da prova, com a vírgula da app.
    expect(m.rows.at(-1).km).toMatch(/^km \d+ a 21,1$/);
    // O ponto de decisão leva a cor da prova; acelerar, a de ganhar tempo.
    expect(m.rows.find((r) => r.label === 'decidir').tone).toBe('race');
    expect(m.rows.find((r) => r.label === 'acelerar').tone).toBe('ok');
    expect(m.fuel).toContain('km 5 · água');
    expect(m.fuel.some((f) => /hidratos$/.test(f))).toBe(true);
  });

  it('sem plano não há imagem; sem nome nem hora, fica o que houver', () => {
    expect(racePlanImageModel(null, race)).toBeNull();
    const m = racePlanImageModel(meia(), { date: '2026-09-20' });
    expect(m.name).toBe('A minha prova');
    expect(m.when).toBe('20 set 2026');
  });

  it('em trail diz "por esforço", e o objetivo ambicioso vai para o cabeçalho', () => {
    const trail = racePlanImageModel(buildRacePacingPlan({ distanceKm: 15, raceType: 'trail', targetSeconds: 100 * 60 }), race);
    expect(trail.effort).toBe(true);
    expect(trail.basis).toMatch(/· por esforço$/);
    const ambicioso = racePlanImageModel(buildRacePacingPlan({ distanceKm: 10, targetSeconds: 40 * 60, predictedSeconds: 45 * 60 }), race);
    expect(ambicioso.ambitious).toMatch(/objetivo/);
  });

  it('o km e o nome do ficheiro', () => {
    expect(kmLabel(21.0975)).toBe('21,1');
    expect(kmLabel(5)).toBe('5');
    expect(racePlanFileName(race)).toBe('ironcoach-meia-de-lisboa-plano.jpg');
  });
});

describe('drawRacePlanImage — o desenho', () => {
  it('pinta cada troço (km, ritmo, passagem, rótulo) na largura de 1080 e cresce com o plano', () => {
    const m = racePlanImageModel(meia(), race);
    const { canvas, texts, fills } = stubCanvas();
    drawRacePlanImage(canvas, m);
    expect(canvas.width).toBe(PLAN_IMAGE_WIDTH);
    expect(canvas.height).toBeGreaterThanOrEqual(PLAN_IMAGE_MIN_HEIGHT);
    const drawn = texts.map((x) => x.t);
    for (const row of m.rows) {
      expect(drawn).toContain(row.km);
      expect(drawn).toContain(row.pace);
      expect(drawn).toContain(row.passage);
      expect(drawn).toContain(`${row.label.toUpperCase()} · `);
    }
    expect(drawn).toContain('Meia de Lisboa');
    expect(drawn).toContain(m.finish);
    expect(drawn).toContain('km 5 · água');
    // Tudo o que se pinta cabe na imagem.
    expect(Math.max(...texts.map((x) => x.y))).toBeLessThan(canvas.height);
    // O ponto de decisão tem a sua faixa (mais as pastilhas do abastecimento).
    expect(fills()).toBeGreaterThan(m.fuel.length);

    const maratona = racePlanImageModel(buildRacePacingPlan({
      distanceKm: 42.195,
      targetSeconds: 210 * 60,
      routeSegments: [
        { km_marker: 12, description: 'Subida da Avenida', elevation: 'sobe' },
        { km_marker: 25, description: 'Descida para o rio', elevation: 'desce' },
      ],
    }), race);
    const grande = stubCanvas();
    drawRacePlanImage(grande.canvas, maratona);
    expect(maratona.rows.length).toBeGreaterThan(m.rows.length);
    expect(grande.canvas.height).toBeGreaterThan(canvas.height);
  });

  it('uma instrução comprida parte-se em duas linhas no máximo, com reticências', () => {
    const m = racePlanImageModel(meia(), race);
    const longa = { ...m, rows: [{ ...m.rows[0], instruction: 'palavra '.repeat(80).trim() }] };
    const { canvas, texts } = stubCanvas();
    drawRacePlanImage(canvas, longa);
    const partes = texts.filter((x) => /^palavra/.test(x.t));
    expect(partes).toHaveLength(2);
    expect(partes[1].t.endsWith('…')).toBe(true);
  });
});

describe('guardar e partilhar', () => {
  const original = { share: navigator.share, canShare: navigator.canShare };
  afterEach(() => {
    navigator.share = original.share;
    navigator.canShare = original.canShare;
    vi.restoreAllMocks();
  });

  it('com partilha de ficheiros, abre a folha do sistema', async () => {
    navigator.share = vi.fn().mockResolvedValue(undefined);
    navigator.canShare = vi.fn().mockReturnValue(true);
    const file = new File(['x'], 'plano.jpg', { type: 'image/jpeg' });
    await expect(shareOrDownload(file, 'Plano')).resolves.toBe('shared');
    expect(navigator.share).toHaveBeenCalledWith({ files: [file], title: 'Plano' });
  });

  it('sem partilha de ficheiros, descarrega', async () => {
    navigator.share = undefined;
    URL.createObjectURL = vi.fn().mockReturnValue('blob:plano');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const file = new File(['x'], 'plano.jpg', { type: 'image/jpeg' });
    await expect(shareOrDownload(file, 'Plano')).resolves.toBe('downloaded');
    expect(click).toHaveBeenCalledTimes(1);
  });
});
