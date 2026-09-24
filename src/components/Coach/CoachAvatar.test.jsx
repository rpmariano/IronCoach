import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import CoachAvatar from './CoachAvatar';
import { FACE_RIGS, FACE_MOODS, lerpRig, rigFor, rigPaths, frameFor } from './carolFace';

const root = (c) => c.querySelector('[data-mood]');

describe('CoachAvatar — o rosto da Carol', () => {
  it('aceita os nomes do CAROL.md e cai na neutra com o que não conhece', () => {
    expect(root(render(<CoachAvatar mood="contente" />).container).getAttribute('data-mood')).toBe('happy');
    expect(root(render(<CoachAvatar mood="furiosa" />).container).getAttribute('data-mood')).toBe('neutral');
    expect(root(render(<CoachAvatar mood={undefined} />).container).getAttribute('data-mood')).toBe('neutral');
  });

  it('é decorativo: o nome dela vem sempre do texto ao lado', () => {
    expect(root(render(<CoachAvatar />).container).getAttribute('aria-hidden')).toBe('true');
  });

  it('pisca de olhos abertos; de olhos fechados em arco, não', () => {
    expect(render(<CoachAvatar mood="neutral" size={30} />).container.querySelector('.carol-blink')).not.toBeNull();
    expect(render(<CoachAvatar mood="proud" size={30} />).container.querySelector('.carol-blink')).toBeNull();
    expect(render(<CoachAvatar mood="neutral" size={30} alive={false} />).container.querySelector('.carol-blink')).toBeNull();
    // Pequenina demais para o piscar se ver.
    expect(render(<CoachAvatar mood="neutral" size={20} />).container.querySelector('.carol-blink')).toBeNull();
  });

  it('sem saber se o sistema pede menos movimento, não se desenha (jsdom não tem matchMedia)', () => {
    expect(root(render(<CoachAvatar size={88} draw />).container).className).not.toContain('carol-draw');
  });

  it('mantém o halo que respira quando há assunto pendente', () => {
    expect(root(render(<CoachAvatar breathing />).container).className).toContain('coach-breathing');
  });
});

describe('carolFace — a geometria', () => {
  it('todas as emoções têm a mesma forma de rig — é isso que deixa interpolar', () => {
    const shape = (r) => Object.keys(r).sort().map((k) => [k, Array.isArray(r[k]) ? r[k].length : typeof r[k]]);
    const ref = shape(FACE_RIGS.neutral);
    for (const m of FACE_MOODS) expect(shape(FACE_RIGS[m])).toEqual(ref);
  });

  it('lerpRig parte de uma e chega à outra', () => {
    const a = rigFor('neutral');
    const b = rigFor('proud');
    expect(lerpRig(a, b, 0)).toBe(a);
    expect(lerpRig(a, b, 1)).toBe(b);
    const mid = lerpRig(a, b, 0.5);
    expect(mid.tilt).toBeCloseTo((a.tilt + b.tilt) / 2);
    expect(mid.blink).toBe(false);
  });

  it('a boca só ganha cor quando se abre', () => {
    expect(rigPaths(rigFor('neutral')).mouthOpen).toBe(0);
    expect(rigPaths(rigFor('proud')).mouthOpen).toBeGreaterThan(0.9);
    expect(rigPaths(rigFor('neutral')).mouth).toMatch(/Z$/);
  });

  it('o enquadramento aproxima-se da cara nos tamanhos pequenos', () => {
    expect(frameFor(24).detail).toBe('min');
    expect(frameFor(31).detail).toBe('min');
    expect(frameFor(36).detail).toBe('mid');
    expect(frameFor(44).detail).toBe('mid');
    expect(frameFor(76).detail).toBe('full');
  });
});

describe('CoachAvatar — as feições que dizem a emoção', () => {
  // Em píxeis de ecrã: a espessura do traço × a escala do viewBox.
  const px = (container, part, size) => {
    const vbW = Number(container.querySelector('svg').getAttribute('viewBox').split(' ')[2]);
    return Number(container.querySelector(`[data-part="${part}"]`).getAttribute('stroke-width')) * (size / vbW);
  };

  it.each([24, 30, 32, 36, 40, 44, 48, 55, 56, 64, 76])('a %i px, sobrancelhas e boca com pelo menos 1,2 px', (size) => {
    const { container } = render(<CoachAvatar mood="worried" size={size} />);
    expect(px(container, 'browL', size)).toBeGreaterThanOrEqual(1.2);
    expect(px(container, 'mouth', size)).toBeGreaterThanOrEqual(1.2);
  });

  it('nos tamanhos grandes o traço volta à escala do desenho', () => {
    const { container } = render(<CoachAvatar mood="worried" size={96} />);
    const { container: small } = render(<CoachAvatar mood="worried" size={36} />);
    // Relativo ao tamanho: pequeno, mais grosso; grande, o do desenho.
    expect(px(small, 'browL', 36) / 36).toBeGreaterThan(px(container, 'browL', 96) / 96);
  });

  it('o traço não afina ao mudar de enquadramento', () => {
    // Aos 32 e aos 56 px muda o enquadramento: o traço não pode descer.
    const at = (size) => px(render(<CoachAvatar mood="worried" size={size} />).container, 'browL', size);
    expect(at(32)).toBeGreaterThanOrEqual(at(31) - 1e-9);
    expect(at(56)).toBeGreaterThanOrEqual(at(55) - 1e-9);
  });
});
