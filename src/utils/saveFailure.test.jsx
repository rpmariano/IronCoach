import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../lib/supabase', () => ({ logAppEvent: vi.fn() }));
import { logAppEvent } from '../lib/supabase';
import { saveError, saveRefusal, reportSaveFailure, saveFailureMessage, SAVE_GENERIC_TEXT, isQuotaError, isNoRetryError } from './saveFailure';
import { renderHook, act } from '@testing-library/react';
import useAnalysis from './useAnalysis';
import { SAVE_NETWORK_TEXT } from './clientRequestId';
import { saveKindOf, describeBody, saveModeOf } from '../lib/saveTelemetry';
import { queuePendingLog, flushPendingLogs, pendingLogs, __resetPendingLogsForTests } from '../lib/pendingLogs';
import SaveErrorLine from '../components/shared/SaveErrorLine';

/* #116 (2026-11-07): uma gravação que falha no cliente — frase clara, «Tentar de novo», e o
   registo em app_logs uma só vez, sem conteúdo do atleta. */
beforeEach(() => { logAppEvent.mockReset(); __resetPendingLogsForTests(); });

describe('saveFailure', () => {
  it('saveError: a frase do resultado do invoke, sem voltar a registar (o invoke já registou)', () => {
    const err = saveError({ error: 'Failed to send a request to the Edge Function', isNetwork: true });
    expect(err.message).toBe(SAVE_NETWORK_TEXT);
    expect(reportSaveFailure('meal', err)).toBe(false);
    expect(reportSaveFailure('meal', saveRefusal('A Carol não percebeu.'))).toBe(false);
    expect(logAppEvent).not.toHaveBeenCalled();
  });

  it('quota (429): saveError marca-a, a frase é a da Carol, e não se regista como save_failed', () => {
    const err = saveError({ error: 'Por hoje chega.', serverText: 'Por hoje chega.', isQuota: true, status: 429 });
    expect(isQuotaError(err)).toBe(true);
    expect(err.message).toBe('Por hoje chega.');
    expect(saveFailureMessage(err)).toBe('Por hoje chega.');
    expect(reportSaveFailure('gym', err)).toBe(false);
    expect(isQuotaError(saveError({ error: 'x', isNetwork: true }))).toBe(false);
    expect(logAppEvent).not.toHaveBeenCalled();
  });

  it('413 (imagem demasiado grande): a frase do servidor, final, sem ser quota', () => {
    const err = saveError({ error: 'Imagem demasiado grande.', serverText: 'Imagem demasiado grande.', status: 413 });
    expect(err.message).toBe('Imagem demasiado grande.');
    expect(isNoRetryError(err)).toBe(true);
    expect(isQuotaError(err)).toBe(false);
    expect(isNoRetryError(saveError({ error: 'x', serverText: 'x', status: 500 }))).toBe(false);
  });

  it('useAnalysis: um 413 fica como «final» (sem «Tentar de novo»)', async () => {
    const { result } = renderHook(() => useAnalysis({ kind: 'gym' }));
    await act(async () => { await result.current.run(async () => { throw saveError({ serverText: 'Imagem demasiado grande.', status: 413 }); }); });
    expect([result.current.quota, result.current.error]).toEqual(['final', 'Imagem demasiado grande.']);
  });

  it('useAnalysis: uma falha de quota fica em quota, e uma corrida nova limpa-a', async () => {
    const { result } = renderHook(() => useAnalysis({ kind: 'meal' }));
    await act(async () => { await result.current.run(async () => { throw saveError({ serverText: 'Amanhã leio.', isQuota: true }); }); });
    expect([result.current.hasFailed, result.current.quota, result.current.error]).toEqual([true, true, 'Amanhã leio.']);
    await act(async () => { await result.current.run(async () => { throw saveError({ serverText: 'Amanhã leio.', isQuota: true, quotaScope: 'day' }); }); });
    expect(result.current.quota).toBe('day');
    await act(async () => { await result.current.run(async () => { throw new Error('Falha na análise.'); }); });
    expect(result.current.quota).toBe(false);
  });

  it('um erro de JS antes do envio regista-se uma vez, com o nome e a mensagem técnica', () => {
    const err = new TypeError("Cannot read properties of undefined (reading 'base64')");
    expect(reportSaveFailure('gym', err, { step: 'manual' })).toBe(true);
    expect(reportSaveFailure('gym', err)).toBe(false);
    expect(logAppEvent).toHaveBeenCalledTimes(1);
    expect(logAppEvent.mock.calls[0][1]).toBe('save_failed');
    expect(logAppEvent.mock.calls[0][3]).toMatchObject({ kind: 'gym', stage: 'client', errorName: 'TypeError', step: 'manual' });
  });

  it('um update direto que falha (PostgrestError, objeto simples) leva o código', () => {
    reportSaveFailure('body', { message: 'TypeError: Failed to fetch', code: '' });
    reportSaveFailure('body', { message: 'new row violates row-level security', code: '42501' });
    expect(logAppEvent.mock.calls[1][3]).toMatchObject({ code: '42501' });
  });

  it('o atleta nunca lê «Edge Function» nem um erro de JS em inglês; as frases da app passam', () => {
    expect(saveFailureMessage(new Error('Failed to send a request to the Edge Function'))).toBe(SAVE_GENERIC_TEXT);
    expect(saveFailureMessage(new TypeError('x is not a function'))).toBe(SAVE_GENERIC_TEXT);
    expect(saveFailureMessage({ message: 'TypeError: Failed to fetch' }, 'Não gravei.')).toBe('Não gravei.');
    expect(saveFailureMessage(new Error('A refeição tem de ter um alimento.'))).toBe('A refeição tem de ter um alimento.');
    expect(saveFailureMessage(saveRefusal('Não percebi o print.'))).toBe('Não percebi o print.');
  });
});

describe('saveTelemetry', () => {
  it('só as gravações contam; o tamanho e as fotos sem o conteúdo', () => {
    expect(saveKindOf('analyze-run', { client_request_id: 'x' })).toBe('run');
    expect(saveKindOf('analyze-run', { mode: 'preview' })).toBeNull();
    expect(saveKindOf('analyze-meal', { mode: 'answer' })).toBeNull();
    expect(saveKindOf('coach-chat', {})).toBeNull();
    expect(describeBody({ images: ['abc', 'de'] })).toMatchObject({ photoCount: 2, hasPhotos: true });
    expect(describeBody(undefined)).toMatchObject({ bodyBytes: 0, hasPhotos: false });
    expect(saveModeOf({ session_id: 's' })).toBe('edit');
    expect(saveModeOf({ client_request_id: 'c' })).toBe('create');
  });
});

describe('pendingLogs', () => {
  it('sem rede ficam; com rede vão; recusados pela base de dados saem (não prendem os outros)', async () => {
    queuePendingLog({ event: 'save_failed', meta: { kind: 'meal' } });
    expect(await flushPendingLogs(async () => ({ error: { message: 'Failed to fetch', code: '' } }))).toBe(0);
    expect(pendingLogs()).toHaveLength(1);
    expect(await flushPendingLogs(async () => ({ error: { message: 'rls', code: '42501' } }))).toBe(0);
    expect(pendingLogs()).toHaveLength(0);
    queuePendingLog({ event: 'save_failed', meta: {} });
    const insert = vi.fn(async () => ({ error: null }));
    expect(await flushPendingLogs(insert)).toBe(1);
    expect(insert.mock.calls[0][0][0].meta.queuedAt).toBeTruthy();
    expect(pendingLogs()).toHaveLength(0);
  });
  it('guarda no máximo 20', () => {
    for (let i = 0; i < 25; i++) queuePendingLog({ event: `e${i}`, meta: {} });
    expect(pendingLogs()).toHaveLength(20);
    expect(pendingLogs()[0].event).toBe('e5');
  });
});

describe('SaveErrorLine', () => {
  it('com onRetry, «Tentar de novo» repete; sem ele, só a linha', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<SaveErrorLine message="Não consegui gravar." onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    rerender(<SaveErrorLine message="Escreve o nome." />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('Escreve o nome.');
  });
});
