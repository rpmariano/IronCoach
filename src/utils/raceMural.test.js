import { describe, it, expect } from 'vitest';
import { muralCandidates, muralDateLabel, muralFileName, MURAL_FORMATS } from './raceMural';

/* As peças do mural partilhadas pelo estúdio — a parte pura, sem Canvas. */

describe('muralCandidates', () => {
  it('as fotos do dia (até seis), a medalha, e o diploma só se for imagem', () => {
    const photos = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
    const list = muralCandidates({ photos, medal: 'm', diploma: 'd', diplomaPath: 'u/r/diploma.jpg' });
    expect(list.map((c) => c.id)).toEqual(['photo-0', 'photo-1', 'photo-2', 'photo-3', 'photo-4', 'photo-5', 'medal', 'diploma']);
    expect(list[0]).toEqual({ id: 'photo-0', url: 'p1', label: 'Foto 1' });
    expect(muralCandidates({ diploma: 'd', diplomaPath: 'u/r/diploma.pdf' })).toEqual([]);
    expect(muralCandidates({ photos: [null, 'p2'] }).map((c) => c.url)).toEqual(['p2']);
  });
});

describe('formatos, data e ficheiro', () => {
  it('os formatos são os do Instagram', () => {
    expect(MURAL_FORMATS.quadrado).toMatchObject({ width: 1080, height: 1080 });
    expect(MURAL_FORMATS.retrato).toMatchObject({ width: 1080, height: 1350 });
    expect(MURAL_FORMATS.story).toMatchObject({ width: 1080, height: 1920 });
  });

  it('a data em português', () => {
    expect(muralDateLabel('2027-02-07')).toBe('7 fev 2027');
    expect(muralDateLabel(null)).toBe('');
  });

  it('nome legível, sem acentos, com o formato', () => {
    expect(muralFileName({ name: 'Meia de Lisboa · Noturna' }, 'story')).toBe('ironcoach-meia-de-lisboa-noturna-story.jpg');
    expect(muralFileName({}, 'quadrado')).toBe('ironcoach-prova-quadrado.jpg');
  });
});
