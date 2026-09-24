import { describe, it, expect } from 'vitest';
import {
  CAROL_MOODS, MESSAGE_MOODS, normalizeMood, normalizeMessageMood, inferMoodFromText, messageMood,
} from '@formulas/carolMood.ts';
import { FACE_MOODS } from '../components/Coach/carolFace';

describe('carolMood — o vocabulário das emoções', () => {
  it('seis estados; "a pensar" não acompanha mensagens', () => {
    expect(CAROL_MOODS).toEqual(['neutral', 'happy', 'proud', 'worried', 'caring', 'thinking']);
    expect(MESSAGE_MOODS).not.toContain('thinking');
  });

  it('o rosto tem um desenho para cada emoção, e só essas', () => {
    expect([...FACE_MOODS].sort()).toEqual([...CAROL_MOODS].sort());
  });

  it('normalizeMood aceita os nomes do CAROL.md, maiúsculas e acentos', () => {
    expect(normalizeMood('happy')).toBe('happy');
    expect(normalizeMood('Contente')).toBe('happy');
    expect(normalizeMood('preocupada')).toBe('worried');
    expect(normalizeMood('Empática')).toBe('caring');
    expect(normalizeMood('a pensar')).toBe('thinking');
    expect(normalizeMood('furiosa')).toBeNull();
    expect(normalizeMood(undefined)).toBeNull();
    expect(normalizeMood(3)).toBeNull();
  });

  it('normalizeMessageMood recusa "thinking" — não é o tom de uma resposta', () => {
    expect(normalizeMessageMood('thinking')).toBeNull();
    expect(normalizeMessageMood('proud')).toBe('proud');
  });
});

describe('inferMoodFromText — o recurso para o histórico sem emoção gravada', () => {
  it('na dúvida, neutra', () => {
    expect(inferMoodFromText('Hoje tens 8 km em Z2. Almoça cedo.')).toBe('neutral');
    expect(inferMoodFromText('')).toBe('neutral');
    expect(inferMoodFromText(null)).toBe('neutral');
  });

  it('um aviso ganha sempre — a cara nunca sorri por cima de uma dor', () => {
    expect(inferMoodFromText('Uma dor de 6 no joelho não se ignora. Hoje não se força.')).toBe('worried');
    expect(inferMoodFromText('Bom trabalho no sábado, mas essa dor óssea preocupa-me.')).toBe('worried');
    expect(inferMoodFromText('Estás bem? Há três dias que não registas nada.')).toBe('worried');
    expect(inferMoodFromText('Não concordo com a maratona em 8 semanas.')).toBe('worried');
  });

  it('empatia antes de celebração', () => {
    expect(inferMoodFromText('Dormiste mal e mesmo assim cumpriste. Hoje, com calma.')).toBe('caring');
    expect(inferMoodFromText('Energia em baixo. Não é dia de provar nada a ninguém.')).toBe('caring');
  });

  it('orgulho só com um feito concreto', () => {
    expect(inferMoodFromText('Novo recorde nos 10 km: 47:12.')).toBe('proud');
    expect(inferMoodFromText('Parabéns. Cruzaste a meta dentro do objetivo.')).toBe('proud');
    expect(inferMoodFromText('Bom trabalho esta semana.')).toBe('happy');
  });

  it('a negação desliga o marcador', () => {
    expect(inferMoodFromText('Não bateste o tempo, mas o ritmo foi certo.')).toBe('neutral');
    expect(inferMoodFromText('Não gostei dos teus almoços esta semana.')).toBe('worried');
  });

  it('messageMood prefere a emoção gravada pelo modelo', () => {
    expect(messageMood({ mood: 'caring', content: 'Novo recorde.' })).toBe('caring');
    expect(messageMood({ mood: 'thinking', content: 'Novo recorde.' })).toBe('proud');
    expect(messageMood({ content: 'Novo recorde.' })).toBe('proud');
    expect(messageMood(null)).toBe('neutral');
  });
});
