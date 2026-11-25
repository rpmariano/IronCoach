import React from 'react';
import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import { setDesignV2 } from '../../utils/designV2';
import RunCard from './RunCard';

const signed = vi.fn(() => Promise.resolve({ data: [{ signedUrl: 'https://x.test/p1.jpg' }], error: null }));
vi.mock('../../lib/supabase', () => ({
  supabase: { storage: { from: () => ({ createSignedUrls: (...a) => signed(...a) }) } },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const ANALISE = 'Bom ritmo constante. A segunda metade saiu mais rápida, o que mostra boa gestão do esforço.';
const RUN = {
  id: 'run-1',
  name: 'Corrida de Hoje',
  kind: 'treino',
  training_type: 'continuo',
  date: '2026-08-05',
  start_time: '07:30',
  distance_km: 10,
  duration_seconds: 3000,
  effort_rpe: 6,
  photo_paths: [],
  coach_notes: ANALISE,
  details: {
    calories_kcal: 650,
    hr_zones: [{ zone: 1, minutes: 5 }, { zone: 2, minutes: 20 }],
    splits: [{ distance_km: 1, time_seconds: 300 }, { distance_km: 1, time_seconds: 295 }],
  },
};

beforeEach(() => {
  window.localStorage.clear();
  act(() => setDesignV2(true));
  useAppStore.setState({ profile: { id: 'user-1' }, runs: [RUN], setRuns: () => {}, raceEvents: [], dismissedInterventions: {} });
});
afterEach(() => {
  act(() => setDesignV2(false));
});

describe('RunCard v2 — o cartão plano', () => {
  it('mostra o ponto, o tipo, o título, a hora e os números (km e ritmo)', () => {
    render(<RunCard run={RUN} />);
    const card = screen.getByTestId('run-card-v2');
    expect(card.querySelector('.v2-dot')).toBeTruthy();
    expect(within(card).getByText('Contínuo')).toBeInTheDocument();
    expect(within(card).getByText('Corrida de Hoje')).toBeInTheDocument();
    expect(within(card).getByText(/07:30/)).toBeInTheDocument();
    expect(within(card).getByText('10.00')).toBeInTheDocument();
    expect(within(card).getByText('5.00')).toBeInTheDocument();
    expect(within(card).getByText('/km')).toBeInTheDocument();
  });

  it('a Carol numa linha, com «Ler mais» a abrir no sítio', () => {
    render(<RunCard run={RUN} />);
    const btn = screen.getByRole('button', { name: 'Ler mais' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Análise da Carol')).toBeNull();
    fireEvent.click(btn);
    expect(screen.getByRole('button', { name: 'Ler menos' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Análise da Carol')).toBeInTheDocument();
  });

  it('«Ver tudo» mostra os detalhes de sempre (zonas, splits, kcal)', () => {
    render(<RunCard run={RUN} />);
    const ver = screen.getByRole('button', { name: 'Ver detalhes da corrida' });
    expect(ver).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(ver);
    expect(screen.getByText('Zonas de FC')).toBeInTheDocument();
    expect(screen.getByText('Splits')).toBeInTheDocument();
    expect(screen.getByText('650 kcal')).toBeInTheDocument();
  });

  it('Editar chama onEdit com o id', () => {
    const onEdit = vi.fn();
    render(<RunCard run={RUN} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(onEdit).toHaveBeenCalledWith('run-1');
  });

  it('Eliminar abre o aviso de sempre e confirma com onDelete', async () => {
    const onDelete = vi.fn(() => Promise.resolve());
    render(<RunCard run={RUN} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByText('Tem a certeza que deseja eliminar esta corrida? Esta ação não pode ser desfeita.')).toBeInTheDocument();
    const botoes = screen.getAllByRole('button', { name: 'Eliminar' });
    fireEvent.click(botoes[botoes.length - 1]);
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('run-1'));
  });

  it('hideActions esconde Editar e Eliminar; defaultExpanded abre a análise e os detalhes', () => {
    render(<RunCard run={RUN} onEdit={() => {}} defaultExpanded hideActions />);
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull();
    expect(screen.getByText('Análise da Carol')).toBeInTheDocument();
    expect(screen.getByTestId('run-card-v2-details')).toBeInTheDocument();
  });

  it('as fotos abrem como hoje (o print em tamanho real num separador novo)', async () => {
    render(<RunCard run={{ ...RUN, photo_paths: ['a.jpg'] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes da corrida' }));
    const img = await screen.findByAltText('Print');
    const link = img.closest('a');
    expect(link).toHaveAttribute('href', 'https://x.test/p1.jpg');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('a caminhada mantém o ícone próprio', () => {
    render(<RunCard run={{ ...RUN, name: null, training_type: 'caminhada' }} />);
    expect(screen.getByTestId('icone-caminhada')).toBeTruthy();
    expect(screen.getAllByText('Caminhada').length).toBeGreaterThan(0);
  });

  it('a prova: «Prova» e o nome da prova a âmbar, e o aviso de eliminar da prova', async () => {
    const PROVA = { id: 'race-1', name: 'Meia de Lisboa', status: 'concluida' };
    const DA_PROVA = { ...RUN, kind: 'competicao', race_id: 'race-1' };
    useAppStore.setState({ runs: [DA_PROVA], raceEvents: [PROVA] });
    render(<RunCard run={DA_PROVA} onDelete={() => {}} />);
    expect(screen.getByText('Prova')).toHaveClass('is-race');
    expect(screen.getByTestId('run-card-v2-race')).toHaveTextContent('Meia de Lisboa');
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByText(/É o registo de «Meia de Lisboa»: a prova volta a ficar por registar/)).toBeInTheDocument();
  });

  it('com o v2 desligado, o cartão de sempre', () => {
    act(() => setDesignV2(false));
    render(<RunCard run={RUN} />);
    expect(screen.queryByTestId('run-card-v2')).toBeNull();
    expect(document.querySelector('.module-card-contrast')).toBeTruthy();
  });
});
