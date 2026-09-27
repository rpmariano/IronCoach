import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAppStore } from '../../store';
import { addDaysISO } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { CUP_EMPTY, cupEnrolledHintKey, __resetCupModuleState } from '../../store/cupSlice';
import * as F from '@formulas/cup.fixtures.ts';
import CarolCard, { useCoachDailyMessages } from './CarolCard';
import CarolCardAntesDaFase3, { useCoachDailyMessagesAntesDaFase3 } from '../../test/CarolCardAntesDaFase3';
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
    useAppStore.setState({ dailySummary: null, dailySummaryLoading: false, loadDailySummary, coachPlans: [], coachPlanItems: [], waterLogs: [], profile: { id: 'u1' }, raceEvents: [], runs: [], gymSessions: [], dailyCheckins: [], coachNotes: [] });
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

    // Quando está errado: às 22:45, com o treino ainda pendente, o cartão não
    // pode ler a agenda do dia como se a hora não contasse.
    it('às 22:45, com o treino ainda pendente, pergunta em vez de anunciar o plano', () => {
      relogio('22:45');
      useAppStore.setState({ ...plano([LONGO]) });
      render(<CarolCard />);
      expect(screen.getByText(FRASES.treinoFicouPorRegistar)).toBeInTheDocument();
      expect(textoDoCartao()).not.toMatch(/agendado|tens uma rodagem/);
    });

    /* Revisão de 2026-09-26: a memória dela lê-se desde a abertura (App.jsx),
       e o check-in logo abaixo já diz «hoje, descansar é o teu treino» a quem
       foi operado ontem. O cartão, por cima, dizia «Hoje tens uma rodagem
       longa de 16 km.» — e às 21h perguntava «Aconteceu alguma coisa?». */
    describe('o que ela sabe da vida dele passa à frente do plano', () => {
      const CIRURGIA = { id: 'n1', category: 'saude', note: `Cirurgia a rutura do bíceps direito a ${ONTEM}; paragem de corrida de pelo menos 2 semanas no pós-operatório.` };

      it('no dia a seguir à cirurgia, de manhã e à noite, e na véspera dela o treino de amanhã', () => {
        relogio('10:00');
        useAppStore.setState({ ...plano([LONGO]), coachNotes: [CIRURGIA] });
        const { unmount } = render(<CarolCard />);
        expect(textoDoCartao()).toBe(`Carol${FRASES.treinoComVida('uma rodagem longa de 16 km', { da: 'da cirurgia' })}`);
        unmount();

        relogio('21:30');
        render(<CarolCard />);
        expect(textoDoCartao()).toBe('CarolO treino de hoje não apareceu, e com a cirurgia faz todo o sentido. Como te sentes?');
        expect(textoDoCartao()).not.toMatch(/Aconteceu alguma coisa|Correu tudo bem|o que se passou/);
      });

      it('na véspera da cirurgia, "Preparar amanhã" não anuncia o treino do dia dela', () => {
        relogio('18:00');
        useAppStore.setState({
          coachNotes: [{ id: 'n1', note: `Cirurgia ao joelho marcada para ${AMANHA}.` }],
          coachPlans: [{ id: 'p1', status: 'aceite', period_start: HOJE, period_end: AMANHA }],
          coachPlanItems: [
            { id: 'i1', plan_id: 'p1', planned_date: HOJE, kind: 'descanso', status: 'pendente' },
            { id: 'i2', plan_id: 'p1', planned_date: AMANHA, status: 'pendente', ...LONGO },
          ],
        });
        render(<CarolCard />);
        abrir();
        expect(secao('Preparar amanhã')).toBe('Preparar amanhãAmanhã o plano tem uma rodagem longa de 16 km. Por causa da cirurgia, fala comigo antes de treinares.');
      });
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

    // Revisão de 2026-09-26: 5 km corridos fecham a rodagem de 16 km do dia,
    // mas não se diz que ele fez 16.
    it('sem resumo, com uma corrida bem mais curta do que a do plano: conta o que ele correu', () => {
      useAppStore.setState({ ...plano([LONGO]), runs: [{ id: 'r1', date: HOJE, distance_km: 5 }] });
      render(<CarolCard />);
      expect(FRASES.treinoFeitoKm('5').some((f) => textoDoCartao() === `Carol${f}`)).toBe(true);
      expect(textoDoCartao()).not.toMatch(/16 km|rodagem longa/);
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
      expect(secao('Aviso de hoje')).toBe('Aviso de hojeVais em 0,8 L de água. A esta hora já devias ir em 1,4 L.');
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

    /* Revisão de 2026-09-26: a linha do dia abre sempre com "Hoje"; a da água,
       logo a seguir, também abria («Hoje é dia de descanso. Hoje ainda não vi
       nenhum copo de água registado.») — duas frases coladas pelo mesmo molde. */
    it('o dia e a água não abrem as duas com "Hoje" — em três semanas seguidas', () => {
      for (let n = 0; n < 21; n++) {
        const dia = addDaysISO(HOJE, n);
        for (const itens of [[{ kind: 'descanso' }], [LONGO], []]) {
          relogio('12:00', dia);
          useAppStore.setState({
            profile: COM_AGUA,
            coachPlans: itens.length ? [{ id: 'p1', status: 'aceite', period_start: dia, period_end: dia }] : [],
            coachPlanItems: itens.map((it, k) => ({ id: `i${k}`, plan_id: 'p1', planned_date: dia, status: 'pendente', ...it })),
          });
          const { unmount } = render(<CarolCard />);
          const texto = textoDoCartao().replace(/^Carol/, '');
          const inicios = texto.split(/(?<=\.)\s+/).map((f) => f.split(' ')[0]);
          for (let k = 1; k < inicios.length; k++) expect(`${inicios[k - 1]} ${inicios[k]}`, `${dia}: ${texto}`).not.toBe('Hoje Hoje');
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

    /* Revisão de 2026-09-26: o cartão do plano, logo abaixo, diz «O último
       plano acabou» (DayPlanCard, noPlanCopy) — «Ainda não temos plano»
       desdizia-o. */
    it('com um plano aceite que já acabou, não diz "ainda não temos plano"', () => {
      useAppStore.setState({
        coachPlans: [{ id: 'p0', status: 'aceite', period_start: '2026-09-01', period_end: '2026-09-20' }],
        coachPlanItems: [{ id: 'i0', plan_id: 'p0', planned_date: '2026-09-20', kind: 'corrida', training_type: 'longo', target_distance_km: 14, status: 'concluido' }],
      });
      render(<CarolCard />);
      expect(textoDoCartao()).toBe(`Carol${FRASES.planoAcabou}`);
      expect(textoDoCartao()).not.toMatch(/Ainda não temos plano/);
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

    // Quando está errado: a um sábado às 00:40, "amanhã" é ambíguo para quem
    // ainda não dormiu — diz-se o dia da semana, com a preposição de quem fala.
    it('à 00:40 de um sábado, "Preparar amanhã" diz o dia da semana, não "amanhã"', () => {
      relogio('00:40');
      useAppStore.setState({
        coachPlans: [{ id: 'p1', status: 'aceite', period_start: HOJE, period_end: AMANHA }],
        coachPlanItems: [
          { id: 'i1', plan_id: 'p1', planned_date: HOJE, kind: 'descanso', status: 'pendente' },
          { id: 'i2', plan_id: 'p1', planned_date: AMANHA, status: 'pendente', ...LONGO },
        ],
      });
      render(<CarolCard />);
      abrir();
      expect(secao('Preparar amanhã')).toBe('Preparar amanhãNo domingo tens uma rodagem longa de 16 km.');
      expect(textoDoCartao()).not.toMatch(/amanhã tens/i);
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

    /* Revisão de 2026-09-26: com os lembretes de água ligados e sem
       recapitulação, a partir das 11h o aviso da água passava à frente da
       prova — «Ainda não vi água registada hoje.» era a primeira coisa que
       ela dizia na véspera. A água fica, mas depois. */
    it('véspera com os lembretes de água: a prova continua a ser a primeira linha — em dias seguidos', () => {
      for (let n = 0; n < 4; n++) {
        const dia = addDaysISO(HOJE, n);
        for (const hora of ['11:30', '16:00', '22:30']) {
          relogio(hora, dia);
          useAppStore.setState({
            profile: { ...COM_AGUA, weight_kg: 70 },
            raceEvents: [race(addDaysISO(dia, 1), { start_time: '09:00', target_time_seconds: 2880 })],
            coachPlans: [{ id: 'p1', status: 'aceite', period_start: dia, period_end: dia }],
            coachPlanItems: [{ id: 'i0', plan_id: 'p1', planned_date: dia, kind: 'descanso', status: 'pendente' }],
          });
          const { unmount } = render(<CarolCard />);
          expect(textoDoCartao(), `${dia} ${hora}`).toMatch(/^CarolAmanhã é dia de prova: Corrida do Tejo/);
          abrir();
          // A água não se perdeu: vem a seguir.
          expect(FRASES.semAgua.some((f) => secao('Aviso de hoje').includes(f)), `${dia} ${hora}`).toBe(true);
          unmount();
        }
      }
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

  /* ── O Troféu no cartão (specs/trofeu.md §4.4, Fase 3, 2026-09-27) ────
     O prazo de inscrição numa jornada (com [Inscrever-me ↗] e [Já me
     inscrevi]) e a linha da semana da jornada (D−7 a D−2, com a previsão
     calculada). Sem inscrição, a lista é exatamente a de hoje — e o cartão
     não lê nada da competição. */
  describe('o Troféu', () => {
    const USER = 'u1';
    // Nasceu a 24/1/1982: na J3 (24/01/2027) faz 45 — M45, percurso longo (7,4 km às 9h30).
    const PERFIL = { id: USER, gender: 'M', birth_date: '1982-01-24', experience_level: 'medio' };
    const ENR = { id: 'enr1', user_id: USER, edition_id: F.CASCAIS_34.id, team_id: 't-naza', season_goal: 'premio', status: 'ativa', entry_by: 'atleta', bib: '4321' };
    const X3 = { id: 'x3', name: 'Corrida CCD Cascais', date: '2027-01-24', distance_km: 7.4, race_type: 'estrada', race_priority: 'b', status: 'agendada', cup_round_id: 'r-c3' };
    // 10 km em 45:00 → 7,4 km em 32:42 (a mesma conta do hub).
    const CORRIDAS = [{ id: 'run1', date: '2027-01-10', distance_km: 10, duration_seconds: 2700 }];
    const ROUNDS = F.CASCAIS_ROUNDS.map((r) => (r.id === 'r-c3' ? { ...r, entry_deadline_at: '2027-01-21T00:00:00+00:00' } : r));
    const catalogo = { [F.CASCAIS_34.id]: { status: 'ready', rounds: ROUNDS, courses: F.CASCAIS_COURSES, overrides: F.CASCAIS_OVERRIDES, categories: F.CASCAIS_CATEGORIES, teams: F.CASCAIS_TEAMS } };
    const inscrito = ({ enrollment = ENR, participation = { decision: 'vou' }, edition = { entry_url: 'https://example.org/inscricao' } } = {}) => ({
      ...CUP_EMPTY,
      status: 'ready', userId: USER, dismissals: [],
      editions: [{ ...F.CASCAIS_34_ABERTA, ...edition, competition: F.CASCAIS_COMPETITION }],
      enrollments: [enrollment],
      participations: participation ? [{ id: 'p3', enrollment_id: 'enr1', round_id: 'r-c3', decision_source: 'atleta', ...participation }] : [],
      catalog: catalogo,
      results: { status: 'ready', enrollmentId: 'enr1', rows: [], teamRows: [] },
    });
    const REAL_MARK = useAppStore.getState().markCupEntryDone;
    let markCupEntryDone;
    let from;

    beforeEach(() => {
      markCupEntryDone = vi.fn().mockResolvedValue({ ok: true, data: {} });
      from = vi.spyOn(supabase, 'from').mockImplementation(() => { throw new Error('sem rede nos testes'); });
      useAppStore.setState({ markCupEntryDone, cup: CUP_EMPTY, session: null });
    });

    afterEach(() => {
      from.mockRestore();
      useAppStore.setState({ cup: CUP_EMPTY, markCupEntryDone: REAL_MARK });
    });

    const leituras = () => from.mock.calls.map(([t]) => t).filter((t) => String(t).startsWith('cup_'));

    function mensagens() {
      let out = null;
      function Sonda() {
        out = useCoachDailyMessages(new Date());
        return null;
      }
      const { unmount } = render(<Sonda />);
      unmount();
      return JSON.stringify(out);
    }

    /* INVARIÂNCIA (§10; revisão da Fase 3). A régua é o cartão de ANTES da
       Fase 3 (CarolCardAntesDaFase3, src/test/ — cópia congelada de ef3c4af,
       com as mesmas frases), não o cartão novo sem inscrição comparado
       consigo próprio: uma mudança igual para todos os não inscritos (a
       ordem das mensagens, um invólucro no texto, o MessageText) passava. */
    function mensagensAntes() {
      let out = null;
      function Sonda() {
        out = useCoachDailyMessagesAntesDaFase3(new Date());
        return null;
      }
      const { unmount } = render(<Sonda />);
      unmount();
      return JSON.stringify(out);
    }
    // O piscar da Carol é sorteado a cada montagem (CoachAvatar): fora da
    // comparação.
    const semPiscar = (h) => h.replace(/--carol-blink-(dur|delay): -?[\d.]+s;/g, '--carol-blink-$1: :s;');
    // O cartão aberto ("Ler mais"), para comparar todas as mensagens desenhadas.
    function cartaoAberto(Cartao) {
      const r = render(<Cartao />);
      if (screen.queryByText('Ler mais')) abrir();
      const out = semPiscar(r.container.innerHTML);
      r.unmount();
      return out;
    }
    const ESTADOS = [
      ['nada lido (idle)', () => CUP_EMPTY],
      ['lido, sem edição', () => ({ ...CUP_EMPTY, status: 'ready', userId: USER, editions: [], enrollments: [], dismissals: [] })],
      ['convite na área', () => ({ ...inscrito(), enrollments: [], participations: [] })],
      ['saiu desta edição', () => ({ ...inscrito(), enrollments: [{ ...ENR, status: 'saiu' }], participations: [] })],
      ['M1 por aplicar', () => ({ ...CUP_EMPTY, status: 'indisponivel', userId: USER })],
    ];
    const diaComTudo = () => {
      relogio('12:00');
      try { window.localStorage.removeItem(cupEnrolledHintKey(USER)); } catch { /* sem storage */ }
      useAppStore.setState({
        profile: { ...PERFIL, ...COM_AGUA },
        dailySummary: resumo({ recap: 'Treinaste 4x esta semana.', meal_suggestion: 'Almoço com arroz.', daily_concept: { title: 'Limiar', body: 'O limiar é…' } }),
        raceEvents: [race(AMANHA, { start_time: '09:00' }), { ...X3, date: '2026-01-10', status: 'concluida' }],
        runs: CORRIDAS,
        ...plano([LONGO]),
      });
    };

    it('invariância: sem inscrição, em todos os estados da competição, as mensagens e o cartão são os de antes da Fase 3 — e nada se lê', () => {
      diaComTudo();
      useAppStore.setState({ cup: CUP_EMPTY });
      const antes = mensagensAntes();
      // A régua não pode ser uma lista vazia por engano.
      expect(JSON.parse(antes).map((m) => m.key)).toEqual(['recap', 'warnings', 'meal_suggestion', 'tomorrow_prep', 'daily_concept']);
      const cartaoAntes = cartaoAberto(CarolCardAntesDaFase3);
      expect(cartaoAntes).toContain('Almoço com arroz.');

      for (const [estado, cup] of ESTADOS) {
        useAppStore.setState({ cup: cup() });
        expect(mensagens(), estado).toBe(antes);
        expect(cartaoAberto(CarolCard), estado).toBe(cartaoAntes);
      }
      expect(leituras()).toEqual([]);
    });

    /* O único caminho em que o código novo corre para quem não está
       inscrito: a pista local velha (inscrito neste telemóvel noutra época,
       ou noutra conta). Lê-se a competição — e, a ler e depois de lida sem
       inscrição, o cartão é o de antes. */
    it('invariância com a pista local velha: a ler e depois de lida sem inscrição, o cartão é o de antes', async () => {
      diaComTudo();
      useAppStore.setState({ cup: CUP_EMPTY });
      const antes = mensagensAntes();
      const cartaoAntes = cartaoAberto(CarolCardAntesDaFase3);

      __resetCupModuleState();
      const vazio = () => {
        const b = {};
        for (const m of ['select', 'eq', 'in', 'order']) b[m] = () => b;
        b.then = (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej);
        return b;
      };
      from.mockImplementation(() => vazio());
      window.localStorage.setItem(cupEnrolledHintKey(USER), '1');

      const r = render(<CarolCard />);
      abrir();
      // A ler (a vista ainda não existe): o cartão é o de antes.
      expect(useAppStore.getState().cup.status).toBe('loading');
      expect(semPiscar(r.container.innerHTML)).toBe(cartaoAntes);
      await waitFor(() => expect(useAppStore.getState().cup.status).toBe('ready'));
      expect(semPiscar(r.container.innerHTML)).toBe(cartaoAntes);
      r.unmount();
      expect(mensagens()).toBe(antes);
      // Lida sem inscrição, a pista apaga-se: o Início deixa de ler.
      expect(window.localStorage.getItem(cupEnrolledHintKey(USER))).toBeNull();
      expect(leituras()).toContain('cup_enrollments');
    });

    // Uma prova qualquer (a "Preparar amanhã" da invariância).
    function race(date, extra = {}) {
      return { id: 'r1', date, name: 'Corrida do Tejo', status: 'agendada', race_type: 'estrada', distance_km: 10, experience_level: 'medio', ...extra };
    }

    describe('inscrito', () => {
      beforeEach(() => {
        // Segunda, 18/01/2027: a J3 é no domingo (D−6); a inscrição fecha à
        // meia-noite de quinta — "quarta às 24h".
        relogio('10:00', '2027-01-18');
        useAppStore.setState({ profile: PERFIL, raceEvents: [X3], runs: CORRIDAS, cup: inscrito() });
        try { window.localStorage.setItem(cupEnrolledHintKey(USER), '1'); } catch { /* sem storage */ }
      });

      it('o prazo: a frase, [Inscrever-me ↗] (noutra janela) e [Já me inscrevi]', async () => {
        render(<CarolCard />);
        abrir();
        expect(secao('Inscrição')).toBe('InscriçãoA inscrição na jornada 3 (Corrida CCD Cascais) fecha quarta às 24h.Inscrever-me Já me inscrevi');
        const link = screen.getByTestId('carol-card-link');
        expect(link.getAttribute('href')).toBe('https://example.org/inscricao');
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');
        expect(link.getAttribute('aria-label')).toBe('Inscrever-me na jornada 3 (abre o site oficial)');
        expect(parseInt(link.style.minHeight, 10)).toBe(44);
        const btn = screen.getByTestId('carol-card-entry-done');
        expect(parseInt(btn.style.minHeight, 10)).toBe(44);
        await act(async () => { fireEvent.click(btn); });
        expect(markCupEntryDone).toHaveBeenCalledWith('r-c3', true);
        // O aviso é da inscrição: âmbar não, coral (--warn), como os avisos.
        expect(screen.getByText('Inscrição').style.color).toBe('var(--warn)');
      });

      it('sem o link do organizador, só [Já me inscrevi]', () => {
        useAppStore.setState({ cup: inscrito({ edition: {} }) });
        render(<CarolCard />);
        abrir();
        expect(screen.getByText('A inscrição na jornada 3 (Corrida CCD Cascais) fecha quarta às 24h.')).toBeInTheDocument();
        expect(screen.queryByTestId('carol-card-link')).not.toBeInTheDocument();
        expect(screen.getByTestId('carol-card-entry-done')).toBeInTheDocument();
      });

      it('nada de prazo a quem respondeu "o meu clube", a quem já se inscreveu, nem sem "Vou"', () => {
        for (const cup of [
          inscrito({ enrollment: { ...ENR, entry_by: 'clube' } }),
          inscrito({ participation: { decision: 'vou', entry_done_at: '2027-01-17T20:00:00Z' } }),
          inscrito({ participation: { decision: 'nao_sei' } }),
        ]) {
          useAppStore.setState({ cup });
          const { unmount } = render(<CarolCard />);
          expect(screen.queryByText(/A inscrição na jornada/)).not.toBeInTheDocument();
          if (screen.queryByText('Ler mais')) {
            abrir();
            expect(screen.queryByText('Inscrição')).not.toBeInTheDocument();
          }
          unmount();
        }
      });

      it('a semana da jornada: o dia, a prova, a distância e a hora, o papel e a previsão com o ícone de cálculo', () => {
        const onOpenRace = vi.fn();
        render(<CarolCard onOpenRace={onOpenRace} />);
        abrir();
        expect(secao('Troféu de Cascais')).toBe('Troféu de CascaisDomingo, Corrida CCD Cascais, 7,4 km às 9h30. Pelas contas: atacar, previsão calculada: 32:42.Ver a jornada');
        const prev = screen.getByTestId('cup-previsao');
        expect(prev.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
        expect(prev.getAttribute('title')).toBe('Previsão calculada pelo teu treino — não fica gravada');
        fireEvent.click(screen.getByText('Ver a jornada'));
        expect(onOpenRace).toHaveBeenCalledWith('x3');
        // A previsão não se grava (§2.6).
        expect(useAppStore.getState().raceEvents[0].target_time).toBeUndefined();
      });

      it('a semana só de D−7 a D−2 (a véspera e o dia são das linhas da prova)', () => {
        const temSemana = (dia) => {
          relogio('10:00', dia);
          let msgs = null;
          function Sonda() { msgs = useCoachDailyMessages(new Date()); return null; }
          const { unmount } = render(<Sonda />);
          unmount();
          return msgs.some((m) => m.key === 'cup_week');
        };
        expect(temSemana('2027-01-16')).toBe(false); // D−8
        expect(temSemana('2027-01-17')).toBe(true); // D−7
        expect(temSemana('2027-01-22')).toBe(true); // D−2
        expect(temSemana('2027-01-23')).toBe(false); // D−1: "Preparar amanhã" é a prova
        expect(temSemana('2027-01-24')).toBe(false); // D0
      });

      it('o texto do cartão nunca tem o dorsal', () => {
        render(<CarolCard />);
        abrir();
        expect(textoDoCartao()).not.toContain('4321');
        expect(textoDoCartao()).not.toMatch(/dorsal/i);
      });
    });
  });
});
