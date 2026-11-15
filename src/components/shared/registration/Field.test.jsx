import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Field, FieldTextarea, fitTextarea, TEXTAREA_MAX_HEIGHT } from './Field';

/* Bug #96 (2026-11-01): o objetivo vindo do plano ficava numa caixa de 2 linhas com scroll interno,
   cortado a meio. A textarea cresce com o texto até TEXTAREA_MAX_HEIGHT; só daí faz scroll. */

// O jsdom não faz layout: o scrollHeight imita-se pelo comprimento do texto (24 px por 30 letras).
function fakeScrollHeight() {
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    configurable: true,
    get() { return Math.max(1, Math.ceil(String(this.value || '').length / 30)) * 24 + 20; },
  });
}

describe('FieldTextarea — cresce com o texto (#96)', () => {
  it('o valor inicial longo já abre com a altura toda, sem scroll interno', () => {
    fakeScrollHeight();
    const longo = 'Controlo diafragmático e alinhamento lombar sem puxar pelo pescoço ou ombros. RPE 7';
    render(<Field label="Objetivo (opcional)">{(id) => <FieldTextarea id={id} value={longo} onChange={() => {}} />}</Field>);
    const ta = screen.getByLabelText('Objetivo (opcional)');
    expect(ta.style.height).toBe(`${Math.ceil(longo.length / 30) * 24 + 20}px`);
    expect(ta.style.overflowY).toBe('hidden');
  });

  it('ao escrever acompanha o texto; passado o máximo, fica no máximo e faz scroll', () => {
    fakeScrollHeight();
    function Controlado() {
      const [v, setV] = useState('');
      return <FieldTextarea aria-label="Notas" value={v} onChange={(e) => setV(e.target.value)} />;
    }
    render(<Controlado />);
    const ta = screen.getByLabelText('Notas');
    fireEvent.change(ta, { target: { value: 'x'.repeat(90) } });
    expect(ta.style.height).toBe(`${3 * 24 + 20}px`);
    fireEvent.change(ta, { target: { value: 'x'.repeat(600) } });
    expect(ta.style.height).toBe(`${TEXTAREA_MAX_HEIGHT}px`);
    expect(ta.style.overflowY).toBe('auto');
  });

  it('o mesmo tamanho e altura de linha do campo de uma linha; sem font boosting', () => {
    render(<FieldTextarea aria-label="Afinação" value="" onChange={() => {}} />);
    const cls = screen.getByLabelText('Afinação').className;
    expect(cls).toContain('text-[16px]');
    expect(cls).toContain('leading-6');
    expect(cls).not.toContain('leading-snug');
    expect(cls).toContain('[text-size-adjust:100%]');
  });

  it('fitTextarea sem layout (scrollHeight 0) não mexe na altura', () => {
    const el = { style: {}, scrollHeight: 0 };
    fitTextarea(el);
    expect(el.style.height).toBe('auto');
    fitTextarea(null);
  });
});
