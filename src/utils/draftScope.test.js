import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scopedDraftKey, clearAllDrafts, purgeUnscopedDrafts } from './draftScope';
import { draftMediaStore } from './draftMediaPersistence';
import { usePersistedFormDraft } from './formDraftPersistence';
import { renderHook } from '@testing-library/react';

/* Auditoria de segurança B2: num telemóvel partilhado, o atleta seguinte via o peso e as fotos
   do anterior (chaves de rascunho fixas). */
describe('draftScope — rascunhos por conta', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('a chave leva o id da conta; sem conta (sem sessão) fica a de sempre', () => {
    expect(scopedDraftKey('ironcoach:avaliacao-rascunho:nova', 'u1')).toBe('ironcoach:u:u1:avaliacao-rascunho:nova');
    expect(scopedDraftKey('ironcoach:corrida-rascunho:r-9', 'u2')).toBe('ironcoach:u:u2:corrida-rascunho:r-9');
    expect(scopedDraftKey('ironcoach:carol-chat-rascunho', 'u1')).toBe('ironcoach:u:u1:carol-chat-rascunho');
    expect(scopedDraftKey('ironcoach:avaliacao-rascunho:nova', null)).toBe('ironcoach:avaliacao-rascunho:nova');
  });

  it('clearAllDrafts apaga os rascunhos de todas as contas (texto e fotos), e mais nada', () => {
    const clearAll = vi.spyOn(draftMediaStore, 'clearAll').mockResolvedValue(undefined);
    localStorage.setItem('ironcoach:u:a:avaliacao-rascunho:nova', '{"w":80}');
    localStorage.setItem('ironcoach:u:b:refeicao-rascunho:m1', '{}');
    localStorage.setItem('ironcoach:treino-rascunho:nova', '{}');
    localStorage.setItem('ironcoach:u:a:carol-chat-rascunho', '{}');
    localStorage.setItem('ironcoach_onboarding_draft_a', '{}');
    localStorage.setItem('ironcoach:outra-coisa', '1');
    clearAllDrafts();
    expect(Object.keys(localStorage).sort()).toEqual(['ironcoach:outra-coisa', 'ironcoach_onboarding_draft_a']);
    expect(clearAll).toHaveBeenCalledTimes(1);
  });

  it('um rascunho com escrita pendente (debounce) não volta depois de limpo', () => {
    vi.useFakeTimers();
    vi.spyOn(draftMediaStore, 'clearAll').mockResolvedValue(undefined);
    renderHook(() => usePersistedFormDraft('ironcoach:u:a:avaliacao-rascunho:nova', { w: 80 }, { isDirty: true }));
    clearAllDrafts();
    vi.advanceTimersByTime(5000);
    expect(localStorage.getItem('ironcoach:u:a:avaliacao-rascunho:nova')).toBeNull();
  });

  it('purgeUnscopedDrafts só apaga os rascunhos sem conta (e as fotos, que não se sabe de quem são)', () => {
    const clearAll = vi.spyOn(draftMediaStore, 'clearAll').mockResolvedValue(undefined);
    localStorage.setItem('ironcoach:avaliacao-rascunho:nova', '{}');
    localStorage.setItem('ironcoach:u:a:avaliacao-rascunho:nova', '{}');
    purgeUnscopedDrafts();
    expect(localStorage.getItem('ironcoach:avaliacao-rascunho:nova')).toBeNull();
    expect(localStorage.getItem('ironcoach:u:a:avaliacao-rascunho:nova')).not.toBeNull();
    expect(clearAll).toHaveBeenCalledTimes(1);
    clearAll.mockClear();
    purgeUnscopedDrafts();
    expect(clearAll).not.toHaveBeenCalled();
  });
});
