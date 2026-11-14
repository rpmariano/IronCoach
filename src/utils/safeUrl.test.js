import { describe, it, expect } from 'vitest';
import { safeHttpUrl } from './safeUrl';

describe('safeHttpUrl — só http(s) é link', () => {
  it('aceita http e https (aparados)', () => {
    expect(safeHttpUrl('https://meiadelisboa.pt')).toBe('https://meiadelisboa.pt');
    expect(safeHttpUrl('  HTTP://corridadotejo.pt/inscricoes ')).toBe('HTTP://corridadotejo.pt/inscricoes');
  });
  it('recusa o resto: javascript:, data:, sem esquema, vazio', () => {
    for (const v of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<script>x</script>', 'meiadelisboa.pt', '//evil.example', 'https://', '', null, undefined, 42]) {
      expect([v, safeHttpUrl(v)]).toEqual([v, null]);
    }
  });
});
