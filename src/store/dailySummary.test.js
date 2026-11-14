import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = { invoke: vi.fn() };
vi.mock('../lib/supabase', () => ({
  supabase: {},
  invokeEdgeFunctionWithTimeout: (...args) => mocks.invoke(...args),
}));

const { useAppStore } = await import('./index');
const { lisbonTodayISO } = await import('../lib/utils');

// O dia de Lisboa, como o store (loadDailySummary) e o servidor: com
// todayISO() (o dia do processo, UTC no CI) o teste falhava entre as 23h e a
// meia-noite UTC, quando Lisboa já vai no dia seguinte — e com ele o deploy
// do Pages, que corre o Vitest.
const TODAY = lisbonTodayISO();
const SUMMARY = { date: TODAY, recap: 'Boa semana.', warnings: null, meal_suggestion: null, tomorrow_prep: null };

describe('loadDailySummary', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    useAppStore.setState({ dailySummary: null, dailySummaryLoading: false, dailySummaryNotice: null });
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

  it('o assunto da carga aberto pelo servidor aparece logo no perfil', async () => {
    useAppStore.setState({ profile: { id: 'u1', coach_intervention_status: 'resolved', coach_intervention_reason: null } });
    const reason = '[carga] Carga de corrida: 30 km nos últimos 7 dias…';
    mocks.invoke.mockResolvedValue({ data: { summary: SUMMARY, cached: false, intervention: { status: 'needed', reason } }, error: null });
    await useAppStore.getState().loadDailySummary({ force: true });
    expect(useAppStore.getState().profile).toMatchObject({ coach_intervention_status: 'needed', coach_intervention_reason: reason });
  });

  it('não pisa um assunto que já estava por resolver', async () => {
    useAppStore.setState({ profile: { id: 'u1', coach_intervention_status: 'in_progress', coach_intervention_reason: 'Check-in de hoje: dor 7/10.' } });
    mocks.invoke.mockResolvedValue({ data: { summary: SUMMARY, cached: false, intervention: { status: 'needed', reason: '[carga] …' } }, error: null });
    await useAppStore.getState().loadDailySummary({ force: true });
    expect(useAppStore.getState().profile.coach_intervention_reason).toBe('Check-in de hoje: dor 7/10.');
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

  it('duas chamadas ao mesmo tempo (StrictMode a montar o Início duas vezes) fazem UM pedido — 2026-09-11, app_logs', async () => {
    let resolve;
    mocks.invoke.mockReturnValue(new Promise((r) => { resolve = r; }));
    const first = useAppStore.getState().loadDailySummary();
    const second = useAppStore.getState().loadDailySummary({ reload: true });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);

    resolve({ data: { summary: SUMMARY, cached: false }, error: null });
    await expect(first).resolves.toEqual(SUMMARY);
    await expect(second).resolves.toEqual(SUMMARY);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().dailySummaryLoading).toBe(false);

    // Terminado o pedido, a trava solta-se: com o resumo de hoje já em
    // memória não há novo pedido; sem ele haveria.
    await useAppStore.getState().loadDailySummary();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it('force durante um pedido em curso espera por ele e pede de novo — não fica com a resposta a meio', async () => {
    let resolve;
    mocks.invoke.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    mocks.invoke.mockResolvedValueOnce({ data: { summary: { ...SUMMARY, recap: 'Atualizado.' }, cached: false }, error: null });
    const first = useAppStore.getState().loadDailySummary();
    const forced = useAppStore.getState().loadDailySummary({ force: true });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);

    resolve({ data: { summary: SUMMARY, cached: true }, error: null });
    await expect(first).resolves.toEqual(SUMMARY);
    const result = await forced;
    expect(result.recap).toBe('Atualizado.');
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.invoke).toHaveBeenLastCalledWith('coach-daily-summary', { body: { force: true } });
    expect(useAppStore.getState().dailySummaryLoading).toBe(false);
  });
});

// A quota (dev-back fd125f9e): o «Atualizar» parecia não fazer nada.
describe('loadDailySummary — quota', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    useAppStore.setState({ dailySummary: SUMMARY, dailySummaryLoading: false, dailySummaryNotice: null });
  });

  it('force com a quota passada: guarda o resumo guardado e a frase dela (quota_message)', async () => {
    mocks.invoke.mockResolvedValue({ data: { summary: SUMMARY, cached: true, quota: 'hour', quota_message: 'Fizeste muitos pedidos seguidos e preciso de uma pausa. Tenta outra vez daqui a 12 minutos.', retry_after_minutes: 12 }, error: null });
    const result = await useAppStore.getState().loadDailySummary({ force: true });
    expect(result).toEqual(SUMMARY);
    expect(useAppStore.getState().dailySummaryNotice).toEqual({ text: 'Fizeste muitos pedidos seguidos e preciso de uma pausa. Tenta outra vez daqui a 12 minutos.', scope: 'hour' });
  });

  it('429 sem resumo de hoje: a frase dela no aviso, e o resumo em memória fica', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Por hoje chega. Amanhã há mais.', isQuota: true, quotaScope: 'day', status: 429 });
    const result = await useAppStore.getState().loadDailySummary({ force: true });
    expect(result).toBeNull();
    expect(useAppStore.getState().dailySummaryNotice).toEqual({ text: 'Por hoje chega. Amanhã há mais.', scope: 'day' });
    expect(useAppStore.getState().dailySummary).toEqual(SUMMARY);
  });

  it('um pedido novo sem quota limpa o aviso; um erro qualquer não cria aviso', async () => {
    useAppStore.setState({ dailySummaryNotice: { text: 'x', scope: 'hour' } });
    mocks.invoke.mockResolvedValueOnce({ data: { summary: SUMMARY, cached: false }, error: null });
    await useAppStore.getState().loadDailySummary({ force: true });
    expect(useAppStore.getState().dailySummaryNotice).toBeNull();
    mocks.invoke.mockResolvedValueOnce({ data: null, error: 'Edge Function returned a non-2xx status code', status: 500 });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await useAppStore.getState().loadDailySummary({ force: true });
    err.mockRestore();
    expect(useAppStore.getState().dailySummaryNotice).toBeNull();
  });
});
