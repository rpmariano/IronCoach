import { describe, it, expect } from 'vitest';
import { cenasPreviewAtiva } from './cenasPreview';

describe('cenasPreviewAtiva — a pré-visualização das cenas só abre com ?cenas=preview e (demo ou dev)', () => {
  it('em produção só com ?demo=true', () => {
    expect(cenasPreviewAtiva('?cenas=preview&demo=true', false)).toBe(true);
    expect(cenasPreviewAtiva('?cenas=preview', false)).toBe(false);
    expect(cenasPreviewAtiva('?cenas=preview&demo=1', false)).toBe(false);
    expect(cenasPreviewAtiva('?demo=true', false)).toBe(false);
  });
  it('em desenvolvimento basta ?cenas=preview', () => {
    expect(cenasPreviewAtiva('?cenas=preview', true)).toBe(true);
    expect(cenasPreviewAtiva('?cenas=outra', true)).toBe(false);
    expect(cenasPreviewAtiva('', true)).toBe(false);
  });
});
