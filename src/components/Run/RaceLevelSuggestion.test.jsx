import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RaceLevelSuggestion from './RaceLevelSuggestion';
import { getRacePrediction } from '../../utils/biEngine';

// getRacePrediction já tem cobertura própria (biEngine.test.js) — aqui só
// interessa controlar predictedSeconds para isolar o comportamento deste
// componente. assessRaceLevelTriage NÃO é mockado: é a mesma fórmula
// partilhada com o vetor dourado (raceLevelTriage.golden.json), e os
// cenários abaixo reutilizam exatamente os dados de lá — os resultados já
// estão verificados nesse vetor, não são recalculados à mão aqui.
vi.mock('../../utils/biEngine', () => ({
  getRacePrediction: vi.fn(),
}));

const TODAY_ISO = '2026-08-27';

// Mesmos runs do cenário "trail: os dois eixos discordam" da golden —
// level esperado "medio" (2ª mais alta: tempo 4900s, D+ 520m).
const RUNS_TRAIL_MEDIO = [
  { date: '2026-08-25', duration_seconds: 5000, distance_km: 12, details: { elevation_gain_m: 550 } },
  { date: '2026-08-18', duration_seconds: 4800, distance_km: 11, details: { elevation_gain_m: 500 } },
  { date: '2026-08-11', duration_seconds: 4900, distance_km: 11.5, details: { elevation_gain_m: 520 } },
  { date: '2026-08-04', duration_seconds: 4700, distance_km: 11, details: { elevation_gain_m: 480 } },
];

// Mesmos runs do cenário "motor alto, D+ quase nulo" da golden — level
// esperado "sub_iniciante" (D+ puxa para baixo apesar do tempo em pé alto).
const RUNS_MOTOR_ALTO_SEM_DPLUS = [
  { date: '2026-08-25', duration_seconds: 7200, distance_km: 20, details: { elevation_gain_m: 60 } },
  { date: '2026-08-18', duration_seconds: 7000, distance_km: 19, details: { elevation_gain_m: 50 } },
  { date: '2026-08-11', duration_seconds: 7100, distance_km: 19.5, details: { elevation_gain_m: 55 } },
  { date: '2026-08-04', duration_seconds: 6900, distance_km: 18, details: { elevation_gain_m: 45 } },
];

// Mesmos runs do cenário "estrada" da golden — level esperado "basico",
// sem D+ (prova em estrada, eixo desligado).
const RUNS_ESTRADA_BASICO = [
  { date: '2026-08-25', duration_seconds: 3600, distance_km: 10, details: { elevation_gain_m: 0 } },
  { date: '2026-08-18', duration_seconds: 3300, distance_km: 10, details: { elevation_gain_m: 0 } },
  { date: '2026-08-11', duration_seconds: 3400, distance_km: 10, details: { elevation_gain_m: 0 } },
  { date: '2026-08-04', duration_seconds: 3200, distance_km: 10, details: { elevation_gain_m: 0 } },
];

// Mesmos runs do cenário "menos de 3 semanas com dados" da golden — level
// esperado null (não avaliável).
const RUNS_POUCOS_DADOS = [
  { date: '2026-08-25', duration_seconds: 5000, distance_km: 12, details: { elevation_gain_m: 500 } },
];

function baseProps(overrides = {}) {
  return {
    raceType: 'trail',
    distanceKm: 10,
    elevationGainM: 500,
    declaredLevel: '',
    profile: { id: 'user-1' },
    runs: RUNS_TRAIL_MEDIO,
    todayISO: TODAY_ISO,
    onUseLevel: vi.fn(),
    ...overrides,
  };
}

describe('RaceLevelSuggestion', () => {
  beforeEach(() => {
    getRacePrediction.mockReset();
  });

  it('não renderiza nada sem distância válida', () => {
    getRacePrediction.mockReturnValue({ predictedSeconds: 4000 });
    const { container } = render(<RaceLevelSuggestion {...baseProps({ distanceKm: 0 })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('não renderiza nada sem previsão de tempo (zero corridas registadas)', () => {
    getRacePrediction.mockReturnValue({ predictedSeconds: 0 });
    const { container } = render(<RaceLevelSuggestion {...baseProps({ runs: [] })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('menos de 3 semanas com dados: mostra aviso de dados insuficientes, sem propor nível', () => {
    getRacePrediction.mockReturnValue({ predictedSeconds: 4000 });
    render(<RaceLevelSuggestion {...baseProps({ runs: RUNS_POUCOS_DADOS })} />);
    expect(screen.getByText(/Ainda sem dados suficientes/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Usar nível/i })).not.toBeInTheDocument();
  });

  it('nível medido diferente do declarado: mostra a proposta com evidência e botão "Usar nível"', () => {
    getRacePrediction.mockReturnValue({ predictedSeconds: 4000 });
    const onUseLevel = vi.fn();
    render(<RaceLevelSuggestion {...baseProps({ declaredLevel: 'avancado', onUseLevel })} />);

    expect(screen.getByText(/classificas-te como/i)).toBeInTheDocument();
    expect(screen.getByText('Médio')).toBeInTheDocument();

    const btn = screen.getByRole('button', { name: /Usar nível Médio/i });
    fireEvent.click(btn);
    expect(onUseLevel).toHaveBeenCalledWith('medio');
  });

  it('nível medido igual ao declarado: confirma sem propor ação', () => {
    getRacePrediction.mockReturnValue({ predictedSeconds: 4000 });
    render(<RaceLevelSuggestion {...baseProps({ declaredLevel: 'medio' })} />);

    expect(screen.getByText(/o nível que escolheste bate certo/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Usar nível/i })).not.toBeInTheDocument();
  });

  it('sub_iniciante: avisa com firmeza, sem oferecer um nível de um clique', () => {
    getRacePrediction.mockReturnValue({ predictedSeconds: 5000 });
    render(<RaceLevelSuggestion {...baseProps({
      runs: RUNS_MOTOR_ALTO_SEM_DPLUS,
      elevationGainM: 1500,
      declaredLevel: 'avancado',
    })} />);

    expect(screen.getByText(/abaixo do que esta prova exige/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Usar nível/i })).not.toBeInTheDocument();
  });

  it('estrada: só menciona o tempo em pé na evidência, nunca D+ (eixo desligado)', () => {
    getRacePrediction.mockReturnValue({ predictedSeconds: 3600 });
    render(<RaceLevelSuggestion {...baseProps({
      raceType: 'estrada',
      elevationGainM: null,
      runs: RUNS_ESTRADA_BASICO,
      declaredLevel: 'avancado',
    })} />);

    expect(screen.getByText(/classificas-te como/i)).toBeInTheDocument();
    expect(screen.getByText('Básico')).toBeInTheDocument();
    expect(screen.queryByText(/D\+\/semana/)).not.toBeInTheDocument();
  });
});
