import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* O hub da prova no Design v2 (2026-11-24), nos três momentos antes da prova. A lógica é a do
   RaceHubView (o mesmo momento, o mesmo plano para o dia); só a forma muda. */

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => { throw new Error('sem rede nos testes'); },
    storage: { from: () => ({ createSignedUrl: (p) => Promise.resolve({ data: { signedUrl: `https://s/${p}` }, error: null }) }) },
  },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const { default: RaceHubView } = await import('./RaceHubView');
const { useAppStore } = await import('../../store');
const { setDesignV2 } = await import('../../utils/designV2');

const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const PROFILE = { experience_level: 'medio' };
const race = (days, over = {}) => ({
  id: 'r1', name: 'Meia do Porto', date: inDays(days), distance_km: 21.0975, race_type: 'estrada', race_priority: 'a',
  target_time: '1:45:00', target_time_seconds: 6300, status: 'agendada', location: 'Porto', created_at: `${inDays(-120)}T10:00:00Z`, ...over,
});
const TREINO = [
  { id: 'a', kind: 'normal', date: inDays(-20), distance_km: 10, duration_seconds: 3000 },
  { id: 'b', kind: 'normal', date: inDays(-10), distance_km: 15, duration_seconds: 4700 },
];
const SIGLAS = /Z[1-5]\b|VDOT/;

beforeEach(() => {
  window.localStorage.clear();
  useAppStore.setState({ session: { user: { id: 'u1' } }, profile: { id: 'u1' }, raceEvents: [], coachPlans: [], coachPlanItems: [], runs: [] });
  act(() => setDesignV2(true));
});
afterEach(() => act(() => setDesignV2(false)));

describe('RaceHubView — Design v2', () => {
  it('desligado: o hub de sempre', () => {
    act(() => setDesignV2(false));
    render(<RaceHubView race={race(70)} runs={TREINO} profile={PROFILE} />);
    expect(screen.getByTestId('race-hub-prerace')).not.toHaveAttribute('data-design');
    expect(screen.getByTestId('race-hub-summary')).toBeInTheDocument();
  });

  it('longe: o herói é a contagem a âmbar, com o objetivo; o objetivo e a previsão em grelha de dois', async () => {
    render(<RaceHubView race={race(70)} runs={TREINO} profile={PROFILE} />);
    await screen.findByTestId('race-hub-v2-main');
    const hub = screen.getByTestId('race-hub-prerace');
    expect(hub).toHaveAttribute('data-design', 'v2');
    expect(hub).toHaveAttribute('data-moment', 'longe');
    expect(screen.getByTestId('race-hub-countdown')).toHaveTextContent('70 dias');
    expect(screen.getByTestId('race-hub-countdown')).toHaveClass('is-race');
    // Com os dois, ficam na grelha de baixo, não repetidos à direita do herói.
    expect(screen.getByTestId('race-hub-v2-hero')).not.toHaveTextContent('1:45:00');
    expect(screen.getByTestId('race-hub-v2-forecast')).toHaveTextContent('o treino aponta');
    expect(screen.queryByTestId('race-hub-v2-splits')).toBeNull();
    expect(screen.getByTestId('race-hub-v2-carol')).toHaveTextContent(/^Carol\. /);
    // O resto recolhido, nas secções de sempre.
    expect(within(screen.getByTestId('race-hub-macro')).getAllByRole('button')[0]).toHaveAttribute('aria-expanded', 'false');
    expect(within(screen.getByTestId('race-hub-carol-section')).getAllByRole('button')[0]).toHaveAttribute('aria-expanded', 'false');
    expect(hub.textContent).not.toMatch(SIGLAS);
    expect(screen.getByTestId('race-hub-v2-main').textContent).not.toMatch(/—/);
  });

  it('longe sem objetivo: «Marcar o objetivo de tempo» leva aos Detalhes', async () => {
    const onGoToEdit = vi.fn();
    render(<RaceHubView race={race(70, { target_time: null, target_time_seconds: null })} runs={TREINO} profile={PROFILE} onGoToEdit={onGoToEdit} />);
    await screen.findByTestId('race-hub-v2-main');
    fireEvent.click(screen.getByTestId('race-forecast-set-target'));
    expect(onGoToEdit).toHaveBeenCalled();
  });

  it('última semana: o herói é a chegada planeada, e os troços todos à vista', async () => {
    render(<RaceHubView race={race(4)} runs={TREINO} profile={PROFILE} />);
    await screen.findByTestId('race-hub-v2-main');
    expect(screen.getByTestId('race-hub-prerace')).toHaveAttribute('data-moment', 'semana');
    expect(screen.getByTestId('race-pacing-finish').textContent).toMatch(/^\d:\d\d:\d\d$/);
    expect(screen.getByTestId('race-hub-phase')).toHaveTextContent('chegada planeada, daqui a 4 dias');
    const troços = screen.getAllByTestId('race-hub-v2-split');
    expect(troços.length).toBeGreaterThan(3);
    // Sem «Ver todos os km»: estão todos.
    expect(screen.queryByTestId('race-pacing-all-rows')).toBeNull();
    // O último troço chega à meta (21,1 km) com a chegada planeada.
    expect(troços[troços.length - 1]).toHaveTextContent(/a 21,1/);
    expect(troços[troços.length - 1]).toHaveTextContent(screen.getByTestId('race-pacing-finish').textContent);
    expect(screen.queryByTestId('race-hub-register')).toBeNull();
    // O objetivo é ambicioso: a chegada é a previsão, e à direita fica o objetivo (não o mesmo número).
    expect(screen.getByTestId('race-hub-v2-hero')).toHaveTextContent('1:45:00objetivo, decide ao km 15');
    // A frase inteira do objetivo ambicioso num ⓘ, recolhida.
    const why = screen.getByTestId('race-pacing-ambitious');
    expect(why).not.toBeVisible();
    const i = screen.getByRole('button', { name: 'Porque decide ao km' });
    fireEvent.click(i);
    expect(i).toHaveAttribute('aria-expanded', 'true');
    expect(why).toBeVisible();
    expect(why).toHaveTextContent(/decide-se ao km 15/);
  });

  it('os troços: uma etiqueta curta (2 a 4 palavras); a instrução inteira a um toque', async () => {
    render(<RaceHubView race={race(4)} runs={TREINO} profile={PROFILE} />);
    await screen.findByTestId('race-hub-v2-main');
    const etiquetas = screen.getAllByTestId('race-hub-v2-split-label').map((e) => e.textContent);
    expect(etiquetas[0]).toBe('Arranque controlado');
    expect(etiquetas).toContain('Decide aqui');
    expect(etiquetas[etiquetas.length - 1]).toBe('Final');
    etiquetas.forEach((t) => expect(t.split(/\s+/).length).toBeLessThanOrEqual(4));
    const primeira = screen.getAllByTestId('race-hub-v2-split')[0];
    const botao = within(primeira).getByRole('button');
    const mais = within(primeira).getByTestId('race-hub-v2-split-more');
    expect(mais).not.toBeVisible();
    fireEvent.click(botao);
    expect(botao).toHaveAttribute('aria-expanded', 'true');
    expect(mais).toBeVisible();
    expect(mais).toHaveTextContent(/mais lento do que o ritmo alvo/);
  });

  it('o resto do Plano para o dia: guardar como imagem, e o atalho para a hora de partida', async () => {
    const onGoToEdit = vi.fn();
    render(<RaceHubView race={race(4)} runs={TREINO} profile={PROFILE} onGoToEdit={onGoToEdit} />);
    await screen.findByTestId('race-hub-v2-main');
    expect(screen.getByTestId('race-pacing-save-image')).toHaveTextContent('Guardar como imagem');
    expect(screen.getByTestId('race-pacing-start-time-missing')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('race-pacing-edit'));
    expect(onGoToEdit).toHaveBeenCalled();
  });

  it('com hora de partida e um site sem percurso lido: «Partida às» e «Buscar o percurso»', async () => {
    const onFetchWebInfo = vi.fn();
    render(<RaceHubView race={race(4, { start_time: '09:30:00', website: 'https://prova.pt' })} runs={TREINO} profile={PROFILE} onFetchWebInfo={onFetchWebInfo} />);
    await screen.findByTestId('race-hub-v2-main');
    expect(screen.getByTestId('race-pacing-start-time')).toHaveTextContent('Partida às 09:30');
    fireEvent.click(screen.getByTestId('race-pacing-fetch-route'));
    expect(onFetchWebInfo).toHaveBeenCalled();
  });

  it('com o GPX carregado, «Buscar o percurso» não aparece (o percurso já é conhecido)', async () => {
    const { sanitizeCourseProfile, COURSE_PROFILE_VERSION } = await import('@formulas/courseProfile.ts');
    const course_profile = { v: COURSE_PROFILE_VERSION, source: 'gpx', distance_km: 21.1, gain_m: 120, loss_m: 120, min_alt_m: 20, max_alt_m: 25, km: [], climbs: [], track: [], start: [41.15, -8.61], finish: [41.16, -8.62] };
    expect(sanitizeCourseProfile(course_profile)).toBeTruthy();
    render(<RaceHubView race={race(4, { website: 'https://prova.pt', course_profile })} runs={TREINO} profile={PROFILE} onFetchWebInfo={vi.fn()} />);
    await screen.findByTestId('race-hub-v2-main');
    expect(screen.queryByTestId('race-pacing-fetch-route')).toBeNull();
  });

  it('no trail: «por esforço» no herói e na nota', async () => {
    render(<RaceHubView race={race(4, { race_type: 'trail', distance_km: 21, elevation_gain_m: 900 })} runs={TREINO} profile={PROFILE} />);
    await screen.findByTestId('race-hub-v2-main');
    expect(screen.getByTestId('race-hub-phase')).toHaveTextContent('por esforço');
    expect(screen.getByTestId('race-pacing-effort')).toBeInTheDocument();
  });

  it('última semana sem objetivo nem previsão: o pedido do objetivo, uma vez', async () => {
    render(<RaceHubView race={race(4, { target_time: null, target_time_seconds: null })} runs={[]} profile={PROFILE} onGoToEdit={vi.fn()} />);
    await screen.findByTestId('race-hub-v2-main');
    expect(screen.getByTestId('race-pacing-card')).toHaveTextContent('Marca um objetivo de tempo para eu montar o plano.');
    expect(screen.queryByTestId('race-forecast-set-target')).toBeNull();
  });

  it('dia: «Registar a prova» a âmbar logo a seguir ao herói, os troços e a frase da Carol do dia', async () => {
    render(<RaceHubView race={race(0)} runs={TREINO} profile={PROFILE} />);
    await screen.findByTestId('race-hub-v2-main');
    expect(screen.getByTestId('race-hub-prerace')).toHaveAttribute('data-moment', 'dia');
    const registar = screen.getByTestId('race-hub-register');
    expect(registar).toHaveClass('is-race');
    expect(!!(screen.getByTestId('race-hub-v2-hero').compareDocumentPosition(registar) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(screen.getAllByTestId('race-hub-v2-split').length).toBeGreaterThan(3);
    expect(screen.getByTestId('race-hub-day-line').textContent).toMatch(/^Carol\. .*prova/i);
    expect(screen.getByTestId('race-hub-v2-main').textContent).not.toMatch(/—/);
  });
});
