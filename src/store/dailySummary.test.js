import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = { invoke: vi.fn() };
vi.mock('../lib/supabase', () => ({
  supabase: {},
  invokeEdgeFunctionWithTimeout: (...args) => mocks.invoke(...args),
}));

const { useAppStore } = await import('./index');
const { todayISO } = await import('../lib/utils');

const TODAY = todayISO();
const SUMMARY = { date: TODAY, recap: 'Boa semana.', warnings: null, meal_suggestion: null, tomorrow_prep: null };

describe('loadDailySummary', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    useAppStore.setState({ dailySummary: null, dailySummaryLoading: false });
  });

  it('chama a Edge Function e guarda o resumo devolvido', async () => {
    mocks.invoke.mockResolvedValue({ data: { summary: SUMMARY, cached: false }, error: null });
    const result = await useAppStore.getState().loadDailySummary();
    expect(result).toEqual(SUMMARY);
    expect(useAppStore.getState().dailySummary).toEqual(SUMMARY);
    expect(mocks.invoke).toHaveBeenCalledWith('coach-daily-summary', { body: { force: false } });
  });

  it('não repete o pedido se já há um resumo de hoje em memória', async () => {
    useAppStore.setState({ dailySummary: SUMMARY });
    const result = await useAppStore.getState().loadDailySummary();
    expect(result).toEqual(SUMMARY);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('force=true ignora o resumo em memória e volta a pedir', async () => {
    useAppStore.setState({ dailySummary: SUMMARY });
    mocks.invoke.mockResolvedValue({ data: { summary: { ...SUMMARY, recap: 'Atualizado.' }, cached: false }, error: null });
    const result = await useAppStore.getState().loadDailySummary({ force: true });
    expect(result.recap).toBe('Atualizado.');
    expect(mocks.invoke).toHaveBeenCalledWith('coach-daily-summary', { body: { force: true } });
  });

  it('reload=true volta a pedir mesmo com um resumo de hoje em memória', async () => {
    // Apanha o resumo gerado por outra sessão/dispositivo no mesmo dia.
    useAppStore.setState({ dailySummary: SUMMARY });
    mocks.invoke.mockResolvedValue({ data: { summary: SUMMARY, cached: true }, error: null });
    await useAppStore.getState().loadDailySummary({ reload: true });
    expect(mocks.invoke).toHaveBeenCalledWith('coach-daily-summary', { body: { force: false } });
  });

  it('um resumo de um dia anterior em memória não bloqueia o novo pedido', async () => {
    useAppStore.setState({ dailySummary: { ...SUMMARY, date: '2020-01-01' } });
    mocks.invoke.mockResolvedValue({ data: { summary: SUMMARY, cached: false }, error: null });
    await useAppStore.getState().loadDailySummary();
    expect(mocks.invoke).toHaveBeenCalled();
  });

  it('em erro, devolve null e não mexe no resumo já guardado', async () => {
    useAppStore.setState({ dailySummary: null });
    mocks.invoke.mockResolvedValue({ data: null, error: 'falhou' });
    const result = await useAppStore.getState().loadDailySummary();
    expect(result).toBeNull();
    expect(useAppStore.getState().dailySummary).toBeNull();
  });

  it('desliga dailySummaryLoading mesmo quando o pedido falha', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'falhou' });
    await useAppStore.getState().loadDailySummary();
    expect(useAppStore.getState().dailySummaryLoading).toBe(false);
  });
});
