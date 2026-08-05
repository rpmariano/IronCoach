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
