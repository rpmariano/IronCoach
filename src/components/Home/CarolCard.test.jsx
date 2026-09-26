import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAppStore } from '../../store';
import { addDaysISO } from '../../lib/utils';
import CarolCard from './CarolCard';
import { FRASES } from './carolCardLines';
import { expectCarolVoice } from '../../test/carolVoice';

/* O relógio dos testes está fixo, na hora de Lisboa (pedido 2026-09-26): o
   cartão fala pelo dia e pela hora de Lisboa, e os testes corriam com o dia
   real, em UTC — entre as 23:00 e a meia-noite UTC os dois dias diferem.
   Sábado, 26 de setembro de 2026; Lisboa em UTC+1. */
const HOJE = '2026-09-26';
const ONTEM = addDaysISO(HOJE, -1);
const AMANHA = addDaysISO(HOJE, 1);
const at = (isoLocalLisboa) => new Date(`${isoLocalLisboa}+01:00`);
const relogio = (hhmm, dia = HOJE) => vi.setSystemTime(at(`${dia}T${hhmm}:00`));

const resumo = (extra = {}) => ({ date: HOJE, recap: null, warnings: null, meal_suggestion: null, tomorrow_prep: null, ...extra });
const plano = (items, { start = HOJE, end = HOJE } = {}) => ({
  coachPlans: [{ id: 'p1', status: 'aceite', period_start: start, period_end: end }],
  coachPlanItems: items.map((it, n) => ({ id: `i${n}`, plan_id: 'p1', planned_date: HOJE, status: 'pendente', ...it })),
});
const LONGO = { kind: 'corrida', training_type: 'longo', target_distance_km: 16 };
const COM_AGUA = { id: 'u1', water_goal_ml: 2500, water_reminder_enabled: true };

describe('CarolCard — o cartão da Carol no Início', () => {
  const loadDailySummary = vi.fn().mockResolvedValue(null);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    relogio('10:00');
    loadDailySummary.mockClear();
    useAppStore.setState({ dailySummary: null, dailySummaryLoading: false, loadDailySummary, coachPlans: [], coachPlanItems: [], waterLogs: [], profile: { id: 'u1' }, raceEvents: [], runs: [], gymSessions: [], dailyCheckins: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const textoDoCartao = () => screen.getByTestId('carol-card').textContent;
  const abrir = () => fireEvent.click(screen.getByText('Ler mais'));
  const secao = (rotulo) => screen.getByText(rotulo).parentElement.textContent;

  it('pede o resumo ao montar, sem reload — não force', () => {
    render(<CarolCard />);
    expect(loadDailySummary).toHaveBeenCalledWith();
  });

  // Os avisos "precisa de falar contigo" vivem no botão flutuante desde
  // 2026-09-13; o cabeçalho é sempre a Carol e leva ao chat.
  it('o cabeçalho é sempre a Carol e abre o chat', () => {
    const onOpenCoach = vi.fn();
    render(<CarolCard onOpenCoach={onOpenCoach} />);
    expect(screen.queryByText('A Carol precisa de falar contigo')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Carol'));
    expect(onOpenCoach).toHaveBeenCalled();
  });

  // Um bloco só (redesenho "Início e o âmbar"): sem subtítulo, sem fio, sem
  // ícone de faísca — só a Carol e o resumo.
  it('já não tem o subtítulo "a tua treinadora"', () => {
    render(<CarolCard />);
    expect(screen.queryByText('a tua treinadora')).not.toBeInTheDocument();
  });

  it('mostra a primeira mensagem fechada; "Ler mais" abre as restantes com etiqueta', () => {
    useAppStore.setState({ dailySummary: resumo({ recap: 'Treinaste 4x esta semana.', warnings: 'É risco de RED-S — fala com um profissional de saúde.' }) });
    render(<CarolCard />);
    expect(screen.getByText('Treinaste 4x esta semana.')).toBeInTheDocument();
    expect(screen.queryByText(/risco de RED-S/)).not.toBeInTheDocument();
    abrir();
    expect(screen.getByText('Recapitulação')).toBeInTheDocument();
    expect(screen.getByText('Aviso de hoje')).toBeInTheDocument();
    expect(screen.getByText(/risco de RED-S/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ler menos'));
    expect(screen.queryByText(/risco de RED-S/)).not.toBeInTheDocument();
  });

  it('uma mensagem curta e única não tem "Ler mais"', () => {
    useAppStore.setState({ dailySummary: resumo({ recap: 'Treinaste 4x esta semana.' }) });
    render(<CarolCard />);
    expect(screen.queryByText('Ler mais')).not.toBeInTheDocument();
  });

  it('ignora campos em branco como ausentes', () => {
    useAppStore.setState({ dailySummary: resumo({ recap: '', warnings: '  ', meal_suggestion: 'Come mais fibra.' }) });
    render(<CarolCard />);
    // Sem recapitulação, o cartão abre com o dia; a sugestão fica em "Ler mais".
    expect(screen.getByText(FRASES.semPlano)).toBeInTheDocument();
    expect(screen.queryByText('Recapitulação')).not.toBeInTheDocument();
    abrir();
    expect(screen.getByText('Come mais fibra.')).toBeInTheDocument();
    expect(screen.queryByText('Aviso de hoje')).not.toBeInTheDocument();
  });

  it('"Atualizar" força uma nova geração', () => {
    useAppStore.setState({ dailySummary: resumo({ recap: 'A', warnings: 'B' }) });
    render(<CarolCard />);
    abrir();
    fireEvent.click(screen.getByLabelText('Atualizar resumo'));
    expect(loadDailySummary).toHaveBeenCalledWith({ force: true });
  });

  it('esqueleto enquanto carrega sem resumo', () => {
    useAppStore.setState({ dailySummary: null, dailySummaryLoading: true });
    render(<CarolCard />);
    expect(screen.getByTestId('carol-skeleton')).toBeInTheDocument();
  });

  /* ── Backlog CarolCard.jsx:174 (alta): o resumo de outro dia ─────────────
     PWA em segundo plano desde sexta, reaberta no sábado às 03:53 (descanso):
     o resumo de sexta ficava e dizia «Para hoje tens agendado: Corrida (…)»
     por cima de «Descanso». */
  describe('o resumo só vale no dia dele', () => {
    const deSexta = { date: ONTEM, recap: 'Ontem correste 10 km. Hoje é para manter.', warnings: 'Para hoje tens agendado: Corrida (continuo, 10 km).', meal_suggestion: 'Almoço com arroz.', tomorrow_prep: 'Amanhã o plano aponta para: Corrida (longo, 16 km).' };

    it('o caso do backlog: sábado às 03:53, descanso, com o resumo de sexta no store', () => {
      relogio('03:53');
      useAppStore.setState({ dailySummary: deSexta, ...plano([{ kind: 'descanso' }]) });
      render(<CarolCard />);
      const texto = textoDoCartao();
      expect(texto).not.toMatch(/Ontem correste|agendado|continuo|Almoço com arroz|aponta para/);
      expect(FRASES.descanso).toContain(screen.getByText(/descans/).textContent);
      expect(loadDailySummary).toHaveBeenCalled();
    });

    it('a carregar o de hoje, com o de ontem ainda no store: esqueleto, não o de ontem', () => {
      useAppStore.setState({ dailySummary: deSexta, dailySummaryLoading: true });
      render(<CarolCard />);
      expect(screen.getByTestId('carol-skeleton')).toBeInTheDocument();
      expect(screen.queryByText(/Ontem correste/)).not.toBeInTheDocument();
    });

    it('o dia muda com o cartão aberto: volta a pedir o resumo e larga o de ontem', () => {
      relogio('23:50');
      useAppStore.setState({ dailySummary: resumo({ recap: 'Hoje fechaste a semana.' }) });
      render(<CarolCard />);
      expect(screen.getByText('Hoje fechaste a semana.')).toBeInTheDocument();
      expect(loadDailySummary).toHaveBeenCalledTimes(1);
      // 00:10 de domingo: a app volta a ficar à vista.
      relogio('00:10', AMANHA);
      act(() => { window.dispatchEvent(new Event('focus')); });
      expect(loadDailySummary).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('Hoje fechaste a semana.')).not.toBeInTheDocument();
    });
  });

  /* ── Backlog CarolCard.jsx:32 (média): o plano em enum cru ────────────── */
  describe('o treino de hoje dito numa frase', () => {
    it('o servidor dizia «Corrida (continuo, 8 km)»: o cartão diz o treino como se diz', () => {
      useAppStore.setState({
        ...plano([{ kind: 'corrida', training_type: 'continuo', target_distance_km: 8 }]),
        dailySummary: resumo({ recap: 'Semana boa.', warnings: 'Para hoje tens agendado: Corrida (continuo, 8 km).' }),
      });
      render(<CarolCard />);
      abrir();
      const aviso = secao('Aviso de hoje');
      expect(aviso).not.toMatch(/agendado|continuo|Corrida \(/);
      expect(FRASES.treinoHoje('uma corrida contínua de 8 km').map((f) => `Aviso de hoje${f}`)).toContain(aviso);
    });

    it('em dias seguidos, a frase roda pelo dia e nunca é a do servidor', () => {
      const vistas = new Set();
      for (let n = 0; n < 6; n++) {
        const dia = addDaysISO(HOJE, n);
        relogio('10:00', dia);
        useAppStore.setState({
          coachPlans: [{ id: 'p1', status: 'aceite', period_start: dia, period_end: dia }],
          coachPlanItems: [{ id: 'i1', plan_id: 'p1', planned_date: dia, status: 'pendente', ...LONGO }],
        });
        const { unmount } = render(<CarolCard />);
        const texto = textoDoCartao();
        const frase = FRASES.treinoHoje('uma rodagem longa de 16 km').find((f) => texto.includes(f));
        expect(frase, `${dia}: ${texto}`).toBeTruthy();
        vistas.add(frase);
        unmount();
      }
      expect(vistas.size).toBeGreaterThan(1);
    });

    it('o aviso junta o plano de hoje e a água por registar (depois das 11h)', () => {
      relogio('12:00');
      useAppStore.setState({ profile: COM_AGUA, ...plano([LONGO]) });
      render(<CarolCard />);
      const texto = textoDoCartao();
      expect(FRASES.treinoHoje('uma rodagem longa de 16 km').some((f) => texto.includes(f))).toBe(true);
      expect(FRASES.semAgua.some((f) => texto.includes(f))).toBe(true);
    });

    it('com dor acima do alarme no check-in, o treino não se anuncia sem ressalva', () => {
      useAppStore.setState({ ...plano([LONGO]), dailyCheckins: [{ date: HOJE, sleep: 4, energy: 3, stress: 2, pain: 5 }] });
      render(<CarolCard />);
      expect(screen.getByText(FRASES.treinoComDor('uma rodagem longa de 16 km'))).toBeInTheDocument();
    });
  });

  /* Bug #38 (2026-09-21): o aviso é gerado uma vez por dia e fica em cache —
     depois de registada a atividade do dia, o treino por fazer deixa de
     fazer sentido. O resto do aviso do servidor mantém-se. */
  describe('o aviso de hoje depois de registada a atividade', () => {
    const aviso = 'Para hoje tens agendado: Corrida (longo, 10.5 km). Carga de treino desta semana muito elevada face às últimas 4 semanas (ACWR 1.62).';

    it('com a corrida registada, tira a frase do plano e mantém o resto do servidor', () => {
      useAppStore.setState({
        ...plano([{ kind: 'corrida', training_type: 'longo', target_distance_km: 10.5 }]),
        runs: [{ id: 'r1', date: HOJE, distance_km: 10.6 }],
        dailySummary: resumo({ recap: 'Semana forte.', warnings: aviso }),
      });
      render(<CarolCard />);
      abrir();
      const texto = secao('Aviso de hoje');
      expect(texto).not.toMatch(/agendado|rodagem/);
      expect(texto).toMatch(/Carga de treino desta semana muito elevada/);
    });

    it('item marcado concluído no plano conta como feito, mesmo sem a corrida carregada', () => {
      useAppStore.setState({
        ...plano([{ kind: 'corrida', training_type: 'longo', target_distance_km: 10.5, status: 'concluido' }]),
        dailySummary: resumo({ recap: 'Semana forte.', warnings: aviso }),
      });
      render(<CarolCard />);
      abrir();
      expect(secao('Aviso de hoje')).not.toMatch(/agendado|rodagem/);
    });

    it('corrida e ginásio no plano, só a corrida feita: fica só o ginásio por fazer', () => {
      useAppStore.setState({
        ...plano([
          { kind: 'corrida', training_type: 'fácil', target_distance_km: 6 },
          { kind: 'ginasio', categories: ['Pernas'], target_duration_min: 40 },
        ]),
        runs: [{ id: 'r1', date: HOJE, distance_km: 6 }],
        dailySummary: resumo({ recap: 'Semana forte.', warnings: 'Para hoje tens agendado: Corrida (fácil, 6 km) e Ginásio (Pernas, 40 min).' }),
      });
      render(<CarolCard />);
      abrir();
      const texto = secao('Aviso de hoje');
      expect(FRASES.treinoPorFazer('um treino de pernas de 40 minutos').map((f) => `Aviso de hoje${f}`)).toContain(texto);
      expect(texto).not.toMatch(/corrida|agendado/i);
    });

    it('sem resumo e com o treino feito, o dia diz que está feito — e não pede registos', () => {
      useAppStore.setState({ ...plano([LONGO]), runs: [{ id: 'r1', date: HOJE, distance_km: 16 }] });
      render(<CarolCard />);
      expect(screen.queryByText('Aviso de hoje')).not.toBeInTheDocument();
      expect(FRASES.treinoFeito('uma rodagem longa de 16 km').some((f) => textoDoCartao().includes(f))).toBe(true);
      expect(textoDoCartao()).not.toMatch(/Regista/);
    });

    it('uma corrida de outro dia não conta', () => {
      useAppStore.setState({ ...plano([LONGO]), runs: [{ id: 'r1', date: ONTEM, distance_km: 16 }] });
      render(<CarolCard />);
      expect(FRASES.treinoHoje('uma rodagem longa de 16 km').some((f) => textoDoCartao().includes(f))).toBe(true);
    });
  });

  /* ── Backlog CarolCard.jsx:194 (alta) e :195 (média): a água ──────────── */
  describe('a água sai dos registos de hoje, nunca do texto do resumo', () => {
    it('o caso do backlog: resumo das 07:30 com 0 ml; às 11:00 o anel tem 1,5 L — nada sobre água', () => {
      relogio('11:00');
      useAppStore.setState({
        profile: COM_AGUA,
        waterLogs: [{ date: HOJE, amount_ml: 1000 }, { date: HOJE, amount_ml: 500 }],
        dailySummary: resumo({ recap: 'Semana boa.', warnings: 'Ainda não registaste água hoje.' }),
      });
      render(<CarolCard />);
      // Só a recapitulação sobra: nem aviso, nem "Ler mais".
      expect(screen.queryByText('Ler mais')).not.toBeInTheDocument();
      expect(textoDoCartao()).toBe('CarolSemana boa.');
    });

    it('a frase de metade da meta, do servidor, dá lugar ao ritmo de agora', () => {
      relogio('16:00');
      useAppStore.setState({
        profile: COM_AGUA,
        waterLogs: [{ date: HOJE, amount_ml: 800 }, { date: ONTEM, amount_ml: 2000 }],
        dailySummary: resumo({ recap: 'Semana boa.', warnings: 'Registaste 800 ml de água — ainda não é metade da tua meta.' }),
      });
      render(<CarolCard />);
      abrir();
      expect(secao('Aviso de hoje')).toBe('Aviso de hojeVais em 0,8 L de água, e a esta hora já devias ir em 1,4 L. Um copo agora.');
    });

    it('sem água registada, nada de madrugada nem de manhã cedo; a partir das 11h, sim — e em dias seguidos', () => {
      for (let n = 0; n < 3; n++) {
        const dia = addDaysISO(HOJE, n);
        for (const [hora, fala] of [['03:53', false], ['06:30', false], ['10:59', false], ['11:30', true], ['22:30', true], ['23:30', false]]) {
          relogio(hora, dia);
          useAppStore.setState({ profile: COM_AGUA, ...plano([{ kind: 'descanso' }], { start: dia, end: dia }), coachPlanItems: [{ id: 'i0', plan_id: 'p1', planned_date: dia, kind: 'descanso', status: 'pendente' }] });
          const { unmount } = render(<CarolCard />);
          const texto = textoDoCartao();
          expect(/água/i.test(texto), `${dia} ${hora}: ${texto}`).toBe(fala);
          // Num dia de descanso, a primeira coisa é o dia, não a água.
          expect(FRASES.descanso.some((f) => texto.startsWith(`Carol${f}`)), `${dia} ${hora}: ${texto}`).toBe(true);
          unmount();
        }
      }
    });

    it('sem lembretes de água ligados não se cobra a água (pedido 2026-09-13)', () => {
      relogio('15:00');
      useAppStore.setState({ profile: { ...COM_AGUA, water_reminder_enabled: false }, dailySummary: resumo({ recap: 'Treinaste bem.' }) });
      render(<CarolCard />);
      expect(textoDoCartao()).not.toMatch(/água/i);
    });
  });

  /* ── Backlog CarolCard.jsx:275 (média): o cartão sem resumo ───────────── */
  describe('sem resumo, o dia diz-se na mesma — sem pedir registos', () => {
    const PEDE_REGISTO = /Regista|Sem nada a assinalar|refeição/;

    it('sem plano: oferece-se para o montar', () => {
      relogio('03:53');
      render(<CarolCard />);
      expect(screen.getByText(FRASES.semPlano)).toBeInTheDocument();
      expect(textoDoCartao()).not.toMatch(PEDE_REGISTO);
      expect(screen.queryByText('Ler mais')).not.toBeInTheDocument();
    });

    it('com uma proposta por ver: aponta para ela', () => {
      useAppStore.setState({ coachPlans: [{ id: 'p9', status: 'proposto', period_start: HOJE, period_end: AMANHA }] });
      render(<CarolCard />);
      expect(screen.getByText(FRASES.propostaPorVer(1))).toBeInTheDocument();
    });

    it('descanso hoje, treino amanhã: primeiro o dia, depois o amanhã', () => {
      useAppStore.setState({
        coachPlans: [{ id: 'p1', status: 'aceite', period_start: HOJE, period_end: AMANHA }],
        coachPlanItems: [
          { id: 'i1', plan_id: 'p1', planned_date: HOJE, kind: 'descanso', status: 'pendente' },
          { id: 'i2', plan_id: 'p1', planned_date: AMANHA, status: 'pendente', ...LONGO },
        ],
      });
      render(<CarolCard />);
      expect(FRASES.descanso.some((f) => textoDoCartao().startsWith(`Carol${f}`))).toBe(true);
      abrir();
      expect(FRASES.amanhaTreino('uma rodagem longa de 16 km').map((f) => `Preparar amanhã${f}`)).toContain(secao('Preparar amanhã'));
      expect(textoDoCartao()).not.toMatch(/aponta para|Corrida \(|longo/);
    });

    it('a qualquer hora do dia, em dias seguidos, nenhum tipo de dia pede um registo', () => {
      for (let n = 0; n < 3; n++) {
        const dia = addDaysISO(HOJE, n);
        for (const hora of ['00:30', '03:53', '06:30', '14:00', '23:30']) {
          for (const itens of [[], [{ kind: 'descanso' }], [{ kind: 'descanso', categories: ['so-refeicoes'] }], [{ ...LONGO, status: 'concluido' }]]) {
            relogio(hora, dia);
            useAppStore.setState({
              coachPlans: itens.length ? [{ id: 'p1', status: 'aceite', period_start: dia, period_end: dia }] : [],
              coachPlanItems: itens.map((it, k) => ({ id: `i${k}`, plan_id: 'p1', planned_date: dia, status: 'pendente', ...it })),
            });
            const { unmount } = render(<CarolCard />);
            const texto = textoDoCartao().replace(/^Carol/, '');
            expect(texto, `${dia} ${hora}`).not.toMatch(PEDE_REGISTO);
            expectCarolVoice(texto);
            unmount();
          }
        }
      }
    });
  });

  /* ── A véspera e o dia da prova (specs/plano-de-prova.md) ──────────────── */
  describe('a prova manda no cartão', () => {
    const race = (date, extra = {}) => ({
      id: 'r1', date, name: 'Corrida do Tejo', status: 'agendada',
      race_type: 'estrada', distance_km: 10, experience_level: 'medio', ...extra,
    });

    it('véspera com hora: "Preparar amanhã" são as horas da prova, não o item do plano', () => {
      relogio('12:00');
      useAppStore.setState({
        profile: { id: 'u1', weight_kg: 70 },
        raceEvents: [race(AMANHA, { start_time: '09:00', target_time_seconds: 2880 })],
        coachPlans: [{ id: 'p1', status: 'aceite', period_start: HOJE, period_end: AMANHA }],
        coachPlanItems: [{ id: 'i1', plan_id: 'p1', planned_date: AMANHA, kind: 'corrida', training_type: 'prova', target_distance_km: 10, status: 'pendente' }],
      });
      render(<CarolCard />);
      // Na véspera, a prova é a primeira linha.
      expect(textoDoCartao()).toMatch(/^CarolAmanhã é dia de prova: Corrida do Tejo/);
      abrir();
      expect(screen.getByText('Preparar amanhã')).toBeInTheDocument();
      // As horas vêm de computeRaceEve: partida 09:00 → acordar 06:00,
      // pequeno-almoço 06:15, deitar 22:00, jantar até às 19:30.
      expect(secao('Preparar amanhã')).toBe('Preparar amanhãAmanhã é dia de prova: Corrida do Tejo (10 km), partida às 9:00. Jantar até às 19:30 (140-280 g de hidratos), deitar às 22:00, acordar às 6:00, pequeno-almoço às 6:15 e chegada às 8:00.');
      expect(screen.queryByText(/Amanhã tens|aponta para/)).not.toBeInTheDocument();
    });

    /* Backlog CarolCard.jsx:215 (média): às 23:15 o jantar e a hora de
       deitar já passaram. */
    it('véspera às 23:15: nada de jantar nem de hora de deitar — deita-te já', () => {
      relogio('23:15');
      useAppStore.setState({
        profile: { id: 'u1', weight_kg: 70 },
        raceEvents: [race(AMANHA, { start_time: '09:00', target_time_seconds: 2880 })],
      });
      render(<CarolCard />);
      expect(screen.getByText('Amanhã é dia de prova: Corrida do Tejo (10 km), partida às 9:00. Deita-te já: acordas às 6:00.')).toBeInTheDocument();
      expect(textoDoCartao()).not.toMatch(/jantar|deitar às/);
    });

    it('véspera sem hora: pede a hora em vez de inventar horários', () => {
      useAppStore.setState({ raceEvents: [race(AMANHA)] });
      render(<CarolCard />);
      expect(screen.getByText(/Sem hora de partida marcada não consigo dar horas/)).toBeInTheDocument();
      expect(screen.queryByText(/partida às/)).not.toBeInTheDocument();
    });

    it('dia da prova às 06:30: abre com a prova, sem artigo, só com os passos por vir e o ritmo do km 1', () => {
      relogio('06:30');
      useAppStore.setState({
        profile: { id: 'u1', weight_kg: 70, water_goal_ml: 2500, water_reminder_enabled: true },
        raceEvents: [race(HOJE, { start_time: '09:00', target_time_seconds: 2880 })],
      });
      render(<CarolCard />);
      const aviso = screen.getByText(/^Hoje é dia de prova: Corrida do Tejo, partida às 9:00/);
      // O pequeno-almoço das 6:15 já passou: não se manda tomar.
      expect(aviso.textContent).toMatch(/^Hoje é dia de prova: Corrida do Tejo, partida às 9:00\. Chegada às 8:00, água até às 8:15 e aquecimento às 8:35\./);
      expect(aviso.textContent).not.toMatch(/pequeno-almoço/i);
      // O primeiro km é mais lento que a base (48:00 → 4.48, +6 s), na
      // grafia de ritmo da app (formatPace: "4.54", não "4:54/km").
      expect(aviso.textContent).toMatch(/O teu plano km a km está no hub da prova: arrancas a 4\.54\.$/);
      expect(screen.getByTestId('carol-card-action')).toHaveTextContent('Abrir o plano da prova');
      // No dia da prova a água é a do horário dela; e o item do plano não se
      // repete: a frase da prova já disse o que é hoje.
      expect(aviso.textContent).not.toMatch(/Para hoje tens agendado|água registada/);
    });

    it('dia da prova sem objetivo: a frase fica sem o ritmo do km 1, e o botão marca o objetivo', () => {
      relogio('06:30');
      useAppStore.setState({
        profile: { id: 'u1', weight_kg: 70 },
        raceEvents: [race(HOJE, { start_time: '09:00' })],
      });
      render(<CarolCard />);
      expect(screen.getByText(/Hoje é dia de prova: Corrida do Tejo, partida às 9:00/)).toBeInTheDocument();
      expect(screen.queryByText(/arrancas a/)).not.toBeInTheDocument();
      expect(screen.getByText(/Marca o objetivo de tempo/)).toBeInTheDocument();
      expect(screen.getByTestId('carol-card-action')).toHaveTextContent('Marcar o objetivo na prova');
    });

    /* Backlog CarolCard.jsx:201 (média): prova às 15:00, acabada e por
       registar — o horário pré-prova ficava até às 23:00. */
    it('dia da prova às 19:00, prova acabada e por registar: o registo, e o botão abre-o', () => {
      relogio('19:00');
      const openRaceRun = vi.fn();
      useAppStore.setState({
        openRaceRun,
        profile: { id: 'u1', weight_kg: 70 },
        raceEvents: [race(HOJE, { start_time: '15:00', target_time_seconds: 2880 })],
      });
      const onOpenRace = vi.fn();
      render(<CarolCard onOpenRace={onOpenRace} />);
      const texto = textoDoCartao();
      expect(texto).not.toMatch(/pequeno-almoço|aquecimento|partida às/);
      expect(FRASES.provaPorRegistar.some((f) => texto.includes(f))).toBe(true);
      fireEvent.click(screen.getByTestId('carol-card-action'));
      expect(openRaceRun).toHaveBeenCalledWith('r1');
      expect(onOpenRace).not.toHaveBeenCalled();
    });

    it('uma prova já concluída não tem véspera nem manhã', () => {
      useAppStore.setState({ raceEvents: [race(AMANHA, { status: 'concluida', start_time: '09:00' })] });
      render(<CarolCard />);
      expect(screen.queryByText(/dia de prova: Corrida do Tejo/)).not.toBeInTheDocument();
    });

    it('a prova de hoje concluída, com o item do plano por fechar: o balanço, não o treino por fazer', () => {
      // Com a prova já concluída não há frase da prova a abrir o aviso, e o
      // item da prova no plano também não é um treino por fazer.
      useAppStore.setState({
        profile: { id: 'u1' },
        raceEvents: [race(HOJE, { status: 'concluida' })],
        coachPlans: [{ id: 'p1', status: 'aceite', period_start: HOJE, period_end: HOJE }],
        coachPlanItems: [{ id: 'i1', plan_id: 'p1', planned_date: HOJE, kind: 'corrida', training_type: 'prova', target_distance_km: 10, status: 'pendente' }],
      });
      render(<CarolCard />);
      expect(screen.getByText(FRASES.provaFeitaSemCorrida)).toBeInTheDocument();
      expect(textoDoCartao()).not.toMatch(/agendado|Hoje tens/);
    });
  });
});
