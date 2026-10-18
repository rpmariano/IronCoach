import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CoachAvatar, { AVATAR_MOODS } from './CoachAvatar';

const root = (c) => c.querySelector('[data-mood]');
const visible = (c) => [...c.querySelectorAll('[data-part^="bust-"]')];

describe('CoachAvatar — o rosto da Carol', () => {
  it('aceita os nomes do CAROL.md e cai na neutra com o que não conhece', () => {
    expect(root(render(<CoachAvatar mood="contente" />).container).getAttribute('data-mood')).toBe('happy');
    expect(root(render(<CoachAvatar mood="furiosa" />).container).getAttribute('data-mood')).toBe('neutral');
    expect(root(render(<CoachAvatar mood={undefined} />).container).getAttribute('data-mood')).toBe('neutral');
  });

  it('é decorativo: o nome dela vem sempre do texto ao lado', () => {
    const { container } = render(<CoachAvatar />);
    expect(root(container).getAttribute('aria-hidden')).toBe('true');
    for (const img of container.querySelectorAll('img')) expect(img.getAttribute('alt')).toBe('');
  });

  it('monta só o busto da emoção atual', () => {
    const { container } = render(<CoachAvatar mood="proud" />);
    const busts = container.querySelectorAll('[data-part^="bust-"]');
    expect(busts).toHaveLength(1);
    expect(busts[0].getAttribute('src')).toMatch(/carol-avatar\/busto_proud\.webp$/);
  });

  it('há um busto para cada emoção do vocabulário', () => {
    for (const m of AVATAR_MOODS) {
      expect(render(<CoachAvatar mood={m} />).container.querySelector(`[data-part="bust-${m}"]`)).not.toBeNull();
    }
  });

  it('ao mudar de emoção, a nova entra por cima e a anterior fica por baixo até ao fim do fade', () => {
    vi.useFakeTimers();
    try {
      window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      const { container, rerender } = render(<CoachAvatar mood="neutral" />);
      rerender(<CoachAvatar mood="worried" />);
      const parts = () => [...container.querySelectorAll('[data-part^="bust-"]')].map((i) => i.getAttribute('data-part'));
      expect(parts()).toEqual(['bust-neutral', 'bust-worried']);
      expect(container.querySelector('[data-part="bust-worried"]').className).toContain('carol-layer-in');
      act(() => { vi.advanceTimersByTime(400); });
      expect(parts()).toEqual(['bust-worried']);
    } finally {
      delete window.matchMedia;
      vi.useRealTimers();
    }
  });

  it('abaixo de 32 px aproxima-se da cara', () => {
    expect(root(render(<CoachAvatar size={28} />).container).getAttribute('data-close')).toBe('true');
    expect(root(render(<CoachAvatar size={36} />).container).getAttribute('data-close')).toBeNull();
  });

  it('pisca só na neutra, de olhos abertos e com tamanho para se ver', () => {
    expect(render(<CoachAvatar mood="neutral" size={30} />).container.querySelector('.carol-blink')).not.toBeNull();
    expect(render(<CoachAvatar mood="proud" size={30} />).container.querySelector('.carol-blink')).toBeNull();
    expect(render(<CoachAvatar mood="neutral" size={30} alive={false} />).container.querySelector('.carol-blink')).toBeNull();
    expect(render(<CoachAvatar mood="neutral" size={20} />).container.querySelector('.carol-blink')).toBeNull();
  });

  it('a falar: busto neutro com a boca por cima, sem piscar', () => {
    const { container } = render(<CoachAvatar mood="thinking" talking />);
    expect(visible(container)[0].getAttribute('data-part')).toBe('bust-neutral');
    expect(container.querySelector('[data-part="mouth"]')).not.toBeNull();
    expect(container.querySelector('.carol-blink')).toBeNull();
    expect(root(container).getAttribute('data-talking')).toBe('true');
  });

  it('sem saber se o sistema pede menos movimento, não faz a entrada (jsdom não tem matchMedia)', () => {
    expect(root(render(<CoachAvatar size={88} draw />).container).className).not.toContain('carol-draw');
  });

  it('mantém o halo que respira quando há assunto pendente', () => {
    expect(root(render(<CoachAvatar breathing />).container).className).toContain('coach-breathing');
  });
});
