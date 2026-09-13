import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readDiploma, diplomaFormValues, describeDiplomaReading } from './diplomaReading';

/* A Carol lê o diploma (pedido 2026-09-13), calibrado com a Corrida do Tejo:
   chip 51:27, bruto 51:51, 1668.º geral, 226.º no escalão, 5 km em 25:15. */

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../lib/supabase', () => ({ invokeEdgeFunctionWithTimeout: (...args) => mocks.invoke(...args) }));

const TEJO = {
  athlete_name: 'RUI MARIANO', race_name: 'Corrida do Tejo', race_date: '2026-09-13',
  chip_time_seconds: 3087, gun_time_seconds: 3111, position: 1668, age_group: null, age_group_position: 226,
  gender_position: null, participants: null, bib_number: null, splits: [{ km: 5, seconds: 1515 }],
};

beforeEach(() => mocks.invoke.mockReset());

describe('readDiploma', () => {
  it('manda a imagem em base64 para a analyze-diploma e devolve a leitura', async () => {
    mocks.invoke.mockResolvedValue({ data: { reading: TEJO }, error: null });
    const reading = await readDiploma({ dataUrl: 'data:image/jpeg;base64,AAA', mime: 'image/jpeg' });
    expect(reading).toEqual(TEJO);
    expect(mocks.invoke.mock.calls[0][0]).toBe('analyze-diploma');
    expect(JSON.parse(mocks.invoke.mock.calls[0][1].body)).toEqual({ image: 'AAA', mime_type: 'image/jpeg' });
  });

  it('não lê PDFs nem o vazio, e propaga a mensagem do servidor', async () => {
    await expect(readDiploma({ isPdf: true, blob: {} })).rejects.toThrow('Só consigo ler o diploma em imagem.');
    // invokeEdgeFunctionWithTimeout devolve o erro como texto: chega como Error com essa mensagem.
    mocks.invoke.mockResolvedValue({ data: null, error: 'Não consegui ler nada neste diploma.' });
    await expect(readDiploma({ dataUrl: 'data:image/jpeg;base64,AAA' })).rejects.toThrow('Não consegui ler nada');
  });
});

describe('diplomaFormValues', () => {
  it('o tempo oficial é o de chip; o bruto e os parciais ficam à parte', () => {
    expect(diplomaFormValues(TEJO)).toEqual({
      officialTime: '51:27', position: '1668', ageGroupPosition: '226', gunTimeSeconds: 3111, officialSplits: [{ km: 5, seconds: 1515 }],
    });
  });

  it('sem chip usa o bruto, e não devolve o que não veio', () => {
    expect(diplomaFormValues({ gun_time_seconds: 3111, splits: [] })).toEqual({ officialTime: '51:51' });
    expect(diplomaFormValues(null)).toEqual({});
  });
});

describe('describeDiplomaReading', () => {
  it('resume a leitura numa linha', () => {
    expect(describeDiplomaReading(TEJO)).toBe('tempo de chip 51:27 (bruto 51:51) · 1668.º geral · 226.º no escalão · passagem aos 5 km 25:15');
    expect(describeDiplomaReading({ gun_time_seconds: 3111, position: 12, participants: 900, age_group: 'M40', bib_number: '77', splits: [] }))
      .toBe('tempo 51:51 · 12.º geral de 900 · escalão M40 · dorsal 77');
  });
});
