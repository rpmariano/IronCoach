import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import { todayISO, addDaysISO } from '../../lib/utils';
import CarolCard from './CarolCard';

describe('CarolCard — o cartão da Carol no Início', () => {
  const loadDailySummary = vi.fn().mockResolvedValue(null);

  beforeEach(() => {
    loadDailySummary.mockClear();
    useAppStore.setState({ dailySummary: null, dailySummaryLoading: false, loadDailySummary, coachPlans: [], coachPlanItems: [], waterLogs: [], profile: { id: 'u1' }, raceEvents: [], runs: [] });
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
      profile: { id: 'u1', water_goal_ml: 2500, water_reminder_enabled: true },
      coachPlans: [{ id: 'p1', status: 'aceite', period_start: today, period_end: today }],
      coachPlanItems: [{ id: 'i1', plan_id: 'p1', planned_date: today, kind: 'corrida', training_type: 'longo', target_distance_km: 16, status: 'pendente' }],
    });
    render(<CarolCard />);
    expect(screen.getByText(/Para hoje tens agendado: Corrida \(longo, 16 km\)\. Ainda não registaste água hoje\./)).toBeInTheDocument();
  });

  it('a água conta mesmo sem "hidratar" no aviso (o \\b não casa antes de "á")', () => {
    useAppStore.setState({
      profile: { id: 'u1', water_goal_ml: 2500, water_reminder_enabled: true },
      dailySummary: { date: '2026-08-11', recap: null, warnings: 'Bebe mais água ao longo do dia.', meal_suggestion: null, tomorrow_prep: null },
    });
    render(<CarolCard />);
    expect(screen.getByText('Bebe mais água ao longo do dia.')).toBeInTheDocument();
    expect(screen.queryByText(/Ainda não registaste água hoje\./)).not.toBeInTheDocument();
  });

  it('sem lembretes de água ligados não se cobra a água (pedido 2026-09-13)', () => {
    useAppStore.setState({
      profile: { id: 'u1', water_goal_ml: 2500, water_reminder_enabled: false },
      waterLogs: [],
      dailySummary: { date: '2026-08-11', recap: 'Treinaste bem.', warnings: null, meal_suggestion: null, tomorrow_prep: null },
    });
    render(<CarolCard />);
    expect(screen.queryByText(/Ainda não registaste água hoje/)).not.toBeInTheDocument();
  });

  it('não repete a água quando o aviso do servidor já fala dela', () => {
    useAppStore.setState({
      profile: { id: 'u1', water_goal_ml: 2500, water_reminder_enabled: true },
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

  /* ── A véspera e o dia da prova (specs/plano-de-prova.md) ──────────────── */
  describe('a prova manda no cartão', () => {
    const today = todayISO();
    const tomorrow = addDaysISO(today, 1);

    const race = (date, extra = {}) => ({
      id: 'r1', date, name: 'Corrida do Tejo', status: 'agendada',
      race_type: 'estrada', distance_km: 10, experience_level: 'medio', ...extra,
    });

    it('véspera com hora: "Preparar amanhã" são as horas da prova, não o item do plano', () => {
      useAppStore.setState({
        profile: { id: 'u1', weight_kg: 70 },
        raceEvents: [race(tomorrow, { start_time: '09:00', target_time_seconds: 2880 })],
        coachPlans: [{ id: 'p1', status: 'aceite', period_start: today, period_end: tomorrow }],
        coachPlanItems: [{ id: 'i1', plan_id: 'p1', planned_date: tomorrow, kind: 'corrida', training_type: 'prova', target_distance_km: 10, status: 'pendente' }],
      });
      render(<CarolCard />);
      fireEvent.click(screen.getByText('Ler mais'));
      expect(screen.getByText('Preparar amanhã')).toBeInTheDocument();
      // As horas vêm de computeRaceEve: partida 09:00 → acordar 06:00,
      // pequeno-almoço 06:15, deitar 22:00, jantar até às 19:30.
      expect(screen.getByText(/partida às 09:00/)).toBeInTheDocument();
      expect(screen.getByText(/jantar até às 19:30 \(140-280 g de hidratos\)/)).toBeInTheDocument();
      expect(screen.getByText(/acordar às 06:00/)).toBeInTheDocument();
      // E NÃO o texto do item do plano de amanhã.
      expect(screen.queryByText(/Amanhã o plano aponta para/)).not.toBeInTheDocument();
    });

    it('véspera sem hora: pede a hora em vez de inventar horários', () => {
      useAppStore.setState({ raceEvents: [race(tomorrow)] });
      render(<CarolCard />);
      expect(screen.getByText(/Sem hora de partida marcada não consigo dar horas/)).toBeInTheDocument();
      expect(screen.queryByText(/partida às/)).not.toBeInTheDocument();
    });

    it('dia da prova: o aviso abre com a prova, a hora e o ritmo do km 1', () => {
      useAppStore.setState({
        profile: { id: 'u1', weight_kg: 70, water_goal_ml: 2500, water_reminder_enabled: true },
        raceEvents: [race(today, { start_time: '09:00', target_time_seconds: 2880 })],
      });
      render(<CarolCard />);
      const aviso = screen.getByText(/^Hoje é Corrida do Tejo, partida às 09:00/);
      expect(aviso).toBeInTheDocument();
      expect(aviso.textContent).toMatch(/pequeno-almoço às 06:15/);
      // O primeiro km é mais lento que a base (48:00 → 4.48, +6 s), na
      // grafia de ritmo da app (formatPace: "4.54", não "4:54/km").
      expect(aviso.textContent).toMatch(/O teu plano km a km está no hub da prova: arrancas a 4\.54\./);
      expect(screen.getByTestId('carol-card-action')).toHaveTextContent('Abrir o plano da prova');
      // O resto do aviso vem a seguir, não à frente.
      expect(aviso.textContent).toMatch(/Ainda não registaste água hoje\.$/);
      // E o item do plano não se repete: a frase da prova já disse o que é
      // hoje.
      expect(aviso.textContent).not.toMatch(/Para hoje tens agendado/);
    });

    it('dia da prova sem objetivo: a frase fica sem o ritmo do km 1', () => {
      useAppStore.setState({
        profile: { id: 'u1', weight_kg: 70 },
        raceEvents: [race(today, { start_time: '09:00' })],
      });
      render(<CarolCard />);
      expect(screen.getByText(/Hoje é Corrida do Tejo, partida às 09:00/)).toBeInTheDocument();
      expect(screen.queryByText(/arrancas a/)).not.toBeInTheDocument();
      expect(screen.getByText(/Marca o objetivo de tempo/)).toBeInTheDocument();
    });

    it('uma prova já concluída não tem véspera nem manhã', () => {
      useAppStore.setState({ raceEvents: [race(tomorrow, { status: 'concluida', start_time: '09:00' })] });
      render(<CarolCard />);
      expect(screen.queryByText(/Amanhã é Corrida do Tejo/)).not.toBeInTheDocument();
    });

    it('o item de prova do plano de hoje mostra "Prova" e o nome dela', () => {
      // Com a prova já concluída não há frase da prova a abrir o aviso — é
      // o item do plano que tem de dizer o que era aquele dia.
      useAppStore.setState({
        profile: { id: 'u1' },
        raceEvents: [race(today, { status: 'concluida' })],
        coachPlans: [{ id: 'p1', status: 'aceite', period_start: today, period_end: today }],
        coachPlanItems: [{ id: 'i1', plan_id: 'p1', planned_date: today, kind: 'corrida', training_type: 'prova', target_distance_km: 10, status: 'pendente' }],
      });
      render(<CarolCard />);
      expect(screen.getByText(/Para hoje tens agendado: Prova \(Corrida do Tejo, 10 km\)\./)).toBeInTheDocument();
    });
  });
});
