import { describe, it, expect } from 'vitest';
import { muralTexts, pickMuralPhotos, muralLayout, muralDateLabel, muralFileName, MURAL_FORMATS, MURAL_MAX_PHOTOS } from './raceMural';

/* O mural da prova (pedido 2026-09-13) — a parte pura, sem Canvas. */

const RACE = { name: 'Corrida do Tejo', date: '2026-09-13', location: 'Lisboa', distance_km: 10 };

describe('muralTexts', () => {
  it('escreve o cabeçalho, o tempo, a distância e o ritmo pela régua de sempre', () => {
    const t = muralTexts({ race: RACE, seconds: 3088, distanceKm: 10.11 });
    expect(t.eyebrow).toBe('PROVA CONCLUÍDA · 13 SET 2026');
    expect(t.name).toBe('Corrida do Tejo');
    expect(t.time).toBe('51:28');
    expect(t.stats).toBe('10.11 km · 5.05/km');
    expect(t.location).toBe('Lisboa');
  });

  it('sem distância da corrida cai para a da prova; sem tempo fica sem números', () => {
    expect(muralTexts({ race: RACE, seconds: 3000 }).stats).toBe('10 km · 5.00/km');
    expect(muralTexts({ race: RACE, seconds: 0 }).time).toBe('');
    expect(muralDateLabel('2027-02-07')).toBe('7 fev 2027');
    expect(muralDateLabel(null)).toBe('');
  });
});

describe('pickMuralPhotos', () => {
  it('as fotos do dia primeiro, a medalha a fechar, até ao teto', () => {
    const photos = ['p1', 'p2', 'p3', 'p4', 'p5'];
    expect(pickMuralPhotos({ photos: ['p1', 'p2'], medal: 'm' })).toEqual(['p1', 'p2', 'm']);
    expect(pickMuralPhotos({ photos, medal: 'm' })).toHaveLength(MURAL_MAX_PHOTOS);
  });

  it('o diploma só entra se for imagem e não houver mais nada', () => {
    expect(pickMuralPhotos({ diploma: 'd', diplomaPath: 'u/r/diploma.jpg' })).toEqual(['d']);
    expect(pickMuralPhotos({ diploma: 'd', diplomaPath: 'u/r/diploma.pdf' })).toEqual([]);
    expect(pickMuralPhotos({ photos: ['p1'], diploma: 'd', diplomaPath: 'u/r/diploma.jpg' })).toEqual(['p1']);
  });
});

describe('muralLayout', () => {
  it('sem fotos não há molduras e o texto sobe', () => {
    const l = muralLayout('quadrado', 0);
    expect(l.frames).toEqual([]);
    expect(l.hasPhotos).toBe(false);
    expect(l.width).toBe(1080);
  });

  it('uma foto é o herói; mais fotos ficam numa fila por baixo, dentro da tela', () => {
    const one = muralLayout('retrato', 1);
    expect(one.frames).toHaveLength(1);
    expect(one.frames[0].hero).toBe(true);
    expect(one.frames[0].w).toBe(1080);

    const four = muralLayout('story', 4);
    expect(four.frames).toHaveLength(4);
    const row = four.frames.slice(1);
    row.forEach((f) => {
      expect(f.x).toBeGreaterThanOrEqual(four.pad);
      expect(f.x + f.w).toBeLessThanOrEqual(four.width - four.pad + 0.01);
      expect(f.y + f.h).toBeLessThan(four.height);
    });
    // Os três da fila têm a mesma largura e não se sobrepõem.
    expect(row[1].x).toBeGreaterThan(row[0].x + row[0].w);
    expect(Math.round(row[0].w)).toBe(Math.round(row[2].w));
  });

  it('os formatos são os do Instagram', () => {
    expect(MURAL_FORMATS.quadrado).toMatchObject({ width: 1080, height: 1080 });
    expect(MURAL_FORMATS.retrato).toMatchObject({ width: 1080, height: 1350 });
    expect(MURAL_FORMATS.story).toMatchObject({ width: 1080, height: 1920 });
  });
});

describe('muralFileName', () => {
  it('nome legível, sem acentos, com o formato', () => {
    expect(muralFileName({ name: 'Meia de Lisboa · Noturna' }, 'story')).toBe('ironcoach-meia-de-lisboa-noturna-story.jpg');
    expect(muralFileName({}, 'quadrado')).toBe('ironcoach-prova-quadrado.jpg');
  });
});
