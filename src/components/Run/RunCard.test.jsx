import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import RunCard from './RunCard';

// Sem fotos gravadas neste run, por isso o expand nunca toca no storage —
// dispensa mock de supabase.storage.
vi.mock('../../lib/supabase', () => ({
  supabase: { storage: { from: () => ({ createSignedUrls: () => Promise.resolve({ data: [], error: null }) }) } },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const RUN = {
  id: 'run-1',
  name: 'Corrida de Hoje',
  kind: 'treino',
  training_type: 'continuo',
  date: '2026-08-05',
  distance_km: 10,
  duration_seconds: 3000,
  effort_rpe: 6,
  photo_paths: [],
  // As métricas do relógio vivem em details (jsonb) — ver
  // detailsFromExtraction em supabase/functions/analyze-run/index.ts.
  details: {
    elevation_gain_m: 120,
    cadence_spm: 165,
    max_cadence_spm: 182,
    calories_kcal: 650,
    avg_heart_rate_bpm: 150,
    max_heart_rate_bpm: 178,
    vo2_max: 48.5,
    hr_zones: [
      { zone: 1, minutes: 5 },
      { zone: 2, minutes: 20 },
      { zone: 3, minutes: 15 },
    ],
    splits: [
      { distance_km: 1, time_seconds: 300 },
      { distance_km: 1, time_seconds: 295 },
    ],
  },
};

describe('RunCard — métricas do relógio (details jsonb)', () => {
  beforeEach(() => {
    useAppStore.setState({ profile: { id: 'user-1' }, runs: [RUN], setRuns: () => {} });
  });

  it('mostra desnível, cadência média/máxima, calorias, FC média/máxima e VO2 máx nas pílulas', () => {
    render(<RunCard run={RUN} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes da corrida' }));

    expect(screen.getByText('120m Desnível')).toBeInTheDocument();
    expect(screen.getByText('165 spm méd')).toBeInTheDocument();
    expect(screen.getByText('182 spm máx')).toBeInTheDocument();
    expect(screen.getByText('650 kcal')).toBeInTheDocument();
    expect(screen.getByText('150 bpm méd')).toBeInTheDocument();
    expect(screen.getByText('178 bpm máx')).toBeInTheDocument();
    expect(screen.getByText('VO2 máx 48.5')).toBeInTheDocument();
  });

  it('mostra o tempo em cada zona de FC', () => {
    render(<RunCard run={RUN} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes da corrida' }));

    expect(screen.getByText('Zonas de FC')).toBeInTheDocument();
    expect(screen.getByText('Z1')).toBeInTheDocument();
    expect(screen.getByText('5 min')).toBeInTheDocument();
    expect(screen.getByText('Z2')).toBeInTheDocument();
    expect(screen.getByText('20 min')).toBeInTheDocument();
  });

  it('mostra a tabela de splits', () => {
    render(<RunCard run={RUN} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes da corrida' }));

    expect(screen.getByText('Splits')).toBeInTheDocument();
    expect(screen.getAllByText('1.00 km')).toHaveLength(2);
    expect(screen.getByText('5:00')).toBeInTheDocument();
    expect(screen.getByText('4:55')).toBeInTheDocument();
  });
});

/* Apagar a corrida de uma prova põe a prova de volta a agendada (trigger de
   2026-09-28): o aviso diz isso antes de o atleta confirmar. */
describe('RunCard — eliminar a corrida de uma prova', () => {
  beforeEach(() => {
    useAppStore.setState({ profile: { id: 'user-1' }, runs: [RUN], setRuns: () => {} });
  });

  const abrirAviso = async (run) => {
    render(<RunCard run={run} onDelete={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes da corrida' }));
    fireEvent.click(screen.getByRole('button', { name: /^Eliminar$/ }));
  };

  const PROVA = { id: 'race-1', name: 'Meia de Lisboa', status: 'concluida' };
  const DA_PROVA = { ...RUN, kind: 'competicao', race_id: 'race-1' };

  it('a última corrida de uma prova concluída: avisa que a prova volta a ficar por registar', async () => {
    useAppStore.setState({ runs: [DA_PROVA], raceEvents: [PROVA] });
    await abrirAviso(DA_PROVA);
    expect(await screen.findByText(/É o registo de «Meia de Lisboa»: a prova volta a ficar por registar e o balanço da Carol sai/)).toBeInTheDocument();
  });

  it('com outra corrida ligada à prova, o aviso de sempre', async () => {
    useAppStore.setState({ runs: [DA_PROVA, { ...DA_PROVA, id: 'run-2' }], raceEvents: [PROVA] });
    await abrirAviso(DA_PROVA);
    expect(await screen.findByText('Tem a certeza que deseja eliminar esta corrida? Esta ação não pode ser desfeita.')).toBeInTheDocument();
  });

  it('numa jornada do Troféu, o aviso de sempre (a jornada não volta atrás)', async () => {
    useAppStore.setState({ runs: [DA_PROVA], raceEvents: [{ ...PROVA, cup_round_id: 'r-1' }] });
    await abrirAviso(DA_PROVA);
    expect(await screen.findByText('Tem a certeza que deseja eliminar esta corrida? Esta ação não pode ser desfeita.')).toBeInTheDocument();
  });

  it('numa corrida sem prova, o aviso de sempre', async () => {
    await abrirAviso(RUN);
    expect(await screen.findByText('Tem a certeza que deseja eliminar esta corrida? Esta ação não pode ser desfeita.')).toBeInTheDocument();
  });
});

/* A intervenção da Carol no cartão (convenção única, 2026-10-05): o
   componente comum, com "Falar com a Carol" (não dispensa) e "Dispensar"
   (dispensa com a chave única). E o bug #55: no pré-visualizar do "Registo
   Guardado" (hideActions) não aparece — lá estão os botões do modal. */
describe('RunCard — a intervenção da Carol', () => {
  const CONVITE = 'Ritmo muito acima do previsto. Vamos adaptar o plano.';
  const comConvite = { ...RUN, coach_notes: CONVITE, ai_analysis: 'texto antigo' };

  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ profile: { id: 'user-1' }, runs: [comConvite], setRuns: () => {}, dismissedInterventions: {} });
  });

  const abrir = () => fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes da corrida' }));

  it('"Falar com a Carol" e, por baixo, "Dispensar"; "Dispensar" grava com a chave única e sai logo', () => {
    render(<RunCard run={comConvite} />);
    abrir();
    expect(screen.getByRole('button', { name: 'Falar com a Carol' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar este aviso' }));
    expect(useAppStore.getState().dismissedInterventions['run-1']).toBe(CONVITE);
    expect(screen.queryByRole('button', { name: 'Falar com a Carol' })).not.toBeInTheDocument();
  });

  it('a dispensa feita no formulário (mesma chave) também vale aqui', () => {
    useAppStore.setState({ dismissedInterventions: { 'run-1': CONVITE } });
    render(<RunCard run={comConvite} />);
    abrir();
    expect(screen.queryByRole('button', { name: 'Falar com a Carol' })).not.toBeInTheDocument();
  });

  it('com hideActions (o pré-visualizar do "Registo Guardado") não há botão (bug #55)', () => {
    render(<RunCard run={comConvite} defaultExpanded hideActions />);
    expect(screen.queryByRole('button', { name: 'Falar com a Carol' })).not.toBeInTheDocument();
  });
});
