import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import { todayISO } from '../../lib/utils';
import CarolCard from './CarolCard';

describe('CarolCard — o cartão da Carol no Início', () => {
  const loadDailySummary = vi.fn().mockResolvedValue(null);

  beforeEach(() => {
    loadDailySummary.mockClear();
    useAppStore.setState({ dailySummary: null, dailySummaryLoading: false, loadDailySummary, coachPlans: [], coachPlanItems: [], waterLogs: [], profile: { id: 'u1' } });
  });

  it('pede o resumo ao montar, sem reload — não force', () => {
    render(<CarolCard />);
    expect(loadDailySummary).toHaveBeenCalledWith();
  });

  it('sem resumo nem plano, diz-o na voz dela', () => {
    render(<CarolCard />);
    expect(screen.getByText(/Sem nada a assinalar por agora/i)).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
    expect(screen.queryByText('Ler mais')).not.toBeInTheDocument();
  });

  it('com assuntos pendentes o cabeçalho muda e conta-os', () => {
    const onOpenCoach = vi.fn();
    render(<CarolCard pendingTopics={1} onOpenCoach={onOpenCoach} />);
    expect(screen.getByText('A Carol precisa de falar contigo')).toBeInTheDocument();
    expect(screen.getByText('1 assunto a resolver')).toBeInTheDocument();
    fireEvent.click(screen.getByText('A Carol precisa de falar contigo'));
    expect(onOpenCoach).toHaveBeenCalled();
  });

  it('mostra a primeira mensagem fechada; "Ler mais" abre as restantes com etiqueta', () => {
    useAppStore.setState({ dailySummary: { date: '2026-08-11', recap: 'Treinaste 4x esta semana.', warnings: 'Bebe mais água hoje.', meal_suggestion: null, tomorrow_prep: null } });
    render(<CarolCard />);
    expect(screen.getByText('Treinaste 4x esta semana.')).toBeInTheDocument();
    expect(screen.queryByText('Bebe mais água hoje.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Ler mais'));
    expect(screen.getByText('Recapitulação')).toBeInTheDocument();
    expect(screen.getByText('Aviso de hoje')).toBeInTheDocument();
    expect(screen.getByText('Bebe mais água hoje.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ler menos'));
    expect(screen.queryByText('Bebe mais água hoje.')).not.toBeInTheDocument();
  });

  it('uma mensagem curta e única não tem "Ler mais"', () => {
    useAppStore.setState({ dailySummary: { date: '2026-08-11', recap: 'Treinaste 4x esta semana.', warnings: null, meal_suggestion: null, tomorrow_prep: null } });
    render(<CarolCard />);
    expect(screen.queryByText('Ler mais')).not.toBeInTheDocument();
  });

  it('ignora campos em branco como ausentes', () => {
    useAppStore.setState({ dailySummary: { date: '2026-08-11', recap: '', warnings: '  ', meal_suggestion: 'Come mais fibra.', tomorrow_prep: null } });
    render(<CarolCard />);
    expect(screen.getByText('Come mais fibra.')).toBeInTheDocument();
    expect(screen.queryByText('Ler mais')).not.toBeInTheDocument();
  });

  it('o aviso de hoje junta o plano de hoje e a água por registar', () => {
    // O mesmo relógio que o cartão (hora local), não o UTC de toISOString():
    // entre as 00:00 e a 01:00 de Lisboa os dois dias diferem e o plano
    // "de hoje" caía em ontem.
    const today = todayISO();
    useAppStore.setState({
      profile: { id: 'u1', water_goal_ml: 2500 },
      coachPlans: [{ id: 'p1', status: 'aceite', period_start: today, period_end: today }],
      coachPlanItems: [{ id: 'i1', plan_id: 'p1', planned_date: today, kind: 'corrida', training_type: 'longo', target_distance_km: 16, status: 'pendente' }],
    });
    render(<CarolCard />);
    expect(screen.getByText(/Para hoje tens agendado: Corrida \(longo, 16 km\)\. Ainda não registaste água hoje\./)).toBeInTheDocument();
  });

  it('não repete a água quando o aviso do servidor já fala dela', () => {
    useAppStore.setState({
      profile: { id: 'u1', water_goal_ml: 2500 },
      dailySummary: { date: '2026-08-11', recap: null, warnings: 'Ainda não registaste consumo de água hoje. Começa a hidratar-te desde já.', meal_suggestion: null, tomorrow_prep: null },
    });
    render(<CarolCard />);
    expect(screen.getByText('Ainda não registaste consumo de água hoje. Começa a hidratar-te desde já.')).toBeInTheDocument();
    expect(screen.queryByText(/Ainda não registaste água hoje\./)).not.toBeInTheDocument();
  });

  it('"Atualizar" força uma nova geração', () => {
    useAppStore.setState({ dailySummary: { date: '2026-08-11', recap: 'A', warnings: 'B', meal_suggestion: null, tomorrow_prep: null } });
    render(<CarolCard />);
    fireEvent.click(screen.getByText('Ler mais'));
    fireEvent.click(screen.getByLabelText('Atualizar resumo'));
    expect(loadDailySummary).toHaveBeenCalledWith({ force: true });
  });

  it('esqueleto enquanto carrega sem resumo', () => {
    useAppStore.setState({ dailySummary: null, dailySummaryLoading: true });
    render(<CarolCard />);
    expect(screen.getByTestId('carol-skeleton')).toBeInTheDocument();
  });
});
