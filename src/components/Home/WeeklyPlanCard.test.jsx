import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { useAppStore } from '../../store';
import { buildPlanDays, PLAN_HORIZON_DAYS, computeAcceptedWindow, PlanDayCard, planeadoAte } from './WeeklyPlanCard';
import { dayTitle } from '../../utils/homeModels';

const item = (over = {}) => ({
  id: 'x', plan_id: 'p', kind: 'corrida', status: 'pendente',
  planned_date: '2026-08-11', ...over,
});

// isToday compara com a data real do relógio (necessário para o redesenho —
// o plano pode começar no passado, "from" já não é sempre hoje). Este helper
// dá o "hoje" real ao teste em vez de um valor fixo, que ficaria sempre
// errado assim que o dia mudasse.
function realTodayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// Mesma correção de timezone que realTodayISO — para computar "N dias antes
// de hoje" sem o resultado deslizar um dia consoante o fuso da máquina.
function addDaysToISO(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

describe('buildPlanDays', () => {
  it('devolve sempre 7 dias, mesmo sem itens nenhuns', () => {
    // O horizonte é fixo de propósito — é o que dá forma estável ao cartão.
    const days = buildPlanDays([], '2026-08-11');
    expect(days).toHaveLength(PLAN_HORIZON_DAYS);
    expect(days.every(d => d.items.length === 0)).toBe(true);
  });

  it('avança um dia de cada vez a partir de "from"', () => {
    const days = buildPlanDays([], '2026-08-11');
    expect(days.map(d => d.dateISO)).toEqual([
      '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
      '2026-08-15', '2026-08-16', '2026-08-17',
    ]);
  });

  it('isToday marca o dia que bate com a data real, não o primeiro do array — o plano pode ter começado no passado', () => {
    const today = realTodayISO();
    const days = buildPlanDays([], today);
    expect(days[0].isToday).toBe(true);
    expect(days.slice(1).every(d => d.isToday === false)).toBe(true);

    // Começando 2 dias antes de hoje, isToday cai no terceiro item, não no primeiro.
    const twoDaysAgo = addDaysToISO(today, -2);
    const daysFromPast = buildPlanDays([], twoDaysAgo, 5);
    expect(daysFromPast[0].isToday).toBe(false);
    expect(daysFromPast[1].isToday).toBe(false);
    expect(daysFromPast[2].isToday).toBe(true);
  });

  it('atravessa a fronteira do mês sem saltar dias', () => {
    const days = buildPlanDays([], '2026-08-29');
    expect(days.map(d => d.dateISO)).toEqual([
      '2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01',
      '2026-09-02', '2026-09-03', '2026-09-04',
    ]);
  });

  it('põe cada item no seu dia', () => {
    const days = buildPlanDays(
      [item({ id: 'a', planned_date: '2026-08-11' }), item({ id: 'b', planned_date: '2026-08-14' })],
      '2026-08-11',
    );
    expect(days[0].items.map(i => i.id)).toEqual(['a']);
    expect(days[3].items.map(i => i.id)).toEqual(['b']);
  });

  it('deixa cair itens fora da janela de 7 dias', () => {
    // O cartão é a semana, não o plano inteiro.
    const days = buildPlanDays([item({ planned_date: '2026-08-25' })], '2026-08-11');
    expect(days.every(d => d.items.length === 0)).toBe(true);
  });

  it('mantém visíveis itens cancelados', () => {
    const days = buildPlanDays([item({ status: 'cancelado' })], '2026-08-11', 1);
    expect(days[0].items).toHaveLength(1);
  });

  it('põe um item concluído no dia em que aconteceu, não no dia planeado', () => {
    // Mesma regra que planAffectsDay() usa para a nutrição: o que conta é o
    // dia real, senão a semana mostrava o treino no dia errado.
    const days = buildPlanDays(
      [item({ status: 'concluido', planned_date: '2026-08-11', actual_date: '2026-08-13' })],
      '2026-08-11',
    );
    expect(days[0].items).toHaveLength(0);
    expect(days[2].items).toHaveLength(1);
  });

  it('usa planned_date quando o item está concluído sem actual_date', () => {
    const days = buildPlanDays(
      [item({ status: 'concluido', planned_date: '2026-08-11', actual_date: null })],
      '2026-08-11',
    );
    expect(days[0].items).toHaveLength(1);
  });

  it('aceita dias de descanso, que só existem para carregar a refeição', () => {
    const days = buildPlanDays(
      [item({ kind: 'descanso', meal_suggestion: 'Reforça hidratos ao jantar.' })],
      '2026-08-11',
    );
    expect(days[0].items[0].kind).toBe('descanso');
  });

  it('junta no mesmo dia dois treinos diferentes', () => {
    const days = buildPlanDays(
      [item({ id: 'r', kind: 'corrida' }), item({ id: 'g', kind: 'ginasio' })],
      '2026-08-11',
    );
    expect(days[0].items).toHaveLength(2);
  });

  it('aguenta uma lista nula sem rebentar', () => {
    expect(buildPlanDays(null, '2026-08-11')).toHaveLength(PLAN_HORIZON_DAYS);
  });

  it('numera os dias a partir de 1 (dayNumber), não índice zero', () => {
    const days = buildPlanDays([], '2026-08-11', 3);
    expect(days.map(d => d.dayNumber)).toEqual([1, 2, 3]);
  });

  it('marca isOverdue num dia passado com item pendente', () => {
    const days = buildPlanDays(
      [item({ planned_date: '2026-01-01', status: 'pendente' })],
      '2026-01-01',
      1,
    );
    // '2026-01-01' é certamente passado face à data real de execução dos testes.
    expect(days[0].isOverdue).toBe(true);
  });

  it('não marca isOverdue quando o item pendente já está concluído ou cancelado', () => {
    const daysDone = buildPlanDays(
      [item({ planned_date: '2026-01-01', status: 'concluido', actual_date: '2026-01-01' })],
      '2026-01-01',
      1,
    );
    expect(daysDone[0].isOverdue).toBe(false);
  });

  it('não marca isOverdue num dia sem itens', () => {
    const days = buildPlanDays([], '2026-01-01', 1);
    expect(days[0].isOverdue).toBe(false);
  });
});

describe('computeAcceptedWindow', () => {
  const plan = (over = {}) => ({
    id: 'p1', status: 'aceite', period_start: '2026-08-10', period_end: '2026-08-16', ...over,
  });

  it('sem planos aceites, devolve null', () => {
    expect(computeAcceptedWindow([], [], '2026-08-11')).toBeNull();
    expect(computeAcceptedWindow([plan({ status: 'proposto' })], [], '2026-08-11')).toBeNull();
  });

  it('usa o período do plano aceite quando ainda decorre', () => {
    const w = computeAcceptedWindow([plan()], [], '2026-08-11');
    expect(w).toEqual({ start: '2026-08-10', days: 7 });
  });

  it('plano de 14 dias dá janela de 14 dias', () => {
    const w = computeAcceptedWindow(
      [plan({ period_start: '2026-08-01', period_end: '2026-08-14' })],
      [],
      '2026-08-05',
    );
    expect(w.days).toBe(14);
  });

  it('plano terminado sem itens pendentes desaparece (devolve null)', () => {
    const w = computeAcceptedWindow(
      [plan({ period_start: '2026-08-01', period_end: '2026-08-05' })],
      [{ plan_id: 'p1', status: 'concluido' }],
      '2026-08-11',
    );
    expect(w).toBeNull();
  });

  it('plano terminado mas com item pendente continua visível (atraso)', () => {
    const w = computeAcceptedWindow(
      [plan({ period_start: '2026-08-01', period_end: '2026-08-05' })],
      [{ plan_id: 'p1', status: 'pendente' }],
      '2026-08-11',
    );
    expect(w).toEqual({ start: '2026-08-01', days: 5 });
  });

  it('une os períodos de dois planos aceites (treino + refeições) numa só janela', () => {
    const w = computeAcceptedWindow(
      [
        plan({ id: 'treino', period_start: '2026-08-10', period_end: '2026-08-16' }),
        plan({ id: 'refeicoes', period_start: '2026-08-12', period_end: '2026-08-20' }),
      ],
      [],
      '2026-08-11',
    );
    expect(w).toEqual({ start: '2026-08-10', days: 11 }); // 08-10 .. 08-20
  });
});

/* Simulação: vários planos aceites ao mesmo tempo. Desde que aceitar passou
   a viver no chat, o atleta pode ter um plano de treino e um de refeições
   aceites em simultâneo, com períodos muito diferentes. */
describe('PlanDayCard — sugestão alimentar', () => {
  // 2026-09-05: item.meal_macros (coach_plan_items.meal_macros) traz o
  // cálculo REAL da Carol para esta sugestão — alimentos/gramas concretos
  // por trás do texto generalizado (ver MEAL_MACROS_SCHEMA_PROPERTIES e
  // buildMealMacros em coach-chat/index.ts). Os testes abaixo cobrem os dois caminhos: COM
  // meal_macros (novo — anéis reais + lista de refeições com ícone lucide)
  // e SEM (sugestões antigas ou validação do modelo falhada — cai no
  // objetivo do perfil + texto corrido via CoachText, comportamento de
  // antes desta funcionalidade).
  const suggestionText = 'Pequeno-almoço: omelete de 2 ovos + fatia de pão. ' +
    'Almoço: 150g de peixe + 100g de arroz + vegetais. Jantar: 150g de proteína + hidratos + vegetais.';

  const mealMacros = {
    items: [
      { tipo: 'pequeno-almoco', texto: '2 ovos + fatia de pão' },
      { tipo: 'almoco', texto: '150g de peixe + arroz + vegetais' },
      { tipo: 'jantar', texto: '150g de proteína + hidratos + vegetais' },
    ],
    kcal: 2150, protein_g: 130, carbs_g: 240, fat_g: 65,
  };

  const dayProps = (over = {}) => ({
    dateISO: '2026-08-11',
    dayNumber: 1,
    isToday: false,
    isOverdue: false,
    onComplete: () => {},
    onCancel: () => {},
    expanded: true,
    ...over,
  });

  it('sem meal_macros: mostra os anéis com os objetivos de macros do perfil do atleta', () => {
    const profile = { calorie_goal: 2400, protein_goal: 160, carbs_goal: 280, fat_goal: 80 };
    render(
      <PlanDayCard
        {...dayProps()}
        profile={profile}
        items={[item({ kind: 'descanso', meal_suggestion: suggestionText })]}
      />
    );
    expect(screen.getByText('2400')).toBeInTheDocument();
    expect(screen.getByText('160')).toBeInTheDocument();
    expect(screen.getByText('280')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText('Objetivo diário de calorias')).toBeInTheDocument();
  });

  it('sem meal_macros e sem perfil (ou sem metas definidas), usa os valores por omissão em vez de rebentar', () => {
    render(
      <PlanDayCard
        {...dayProps()}
        items={[item({ kind: 'descanso', meal_suggestion: suggestionText })]}
      />
    );
    // Sem calorie_goal no perfil, deriva das metas de macro por omissão
    // (150×4 + 200×4 + 70×9 = 2030) em vez do DEFAULT_CALORIE_GOAL fixo
    // (2000) — nunca mostra um total que contradiga os três anéis.
    expect(screen.getByText('2030')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument(); // DEFAULT_PROTEIN_GOAL
  });

  it('sem meal_macros: mostra sempre o texto da sugestão tal como o Coach escreveu (via CoachText), sem tentar extrair estrutura', () => {
    render(
      <PlanDayCard
        {...dayProps()}
        items={[item({ kind: 'descanso', meal_suggestion: suggestionText })]}
      />
    );
    // CoachText decompõe por refeição (ver CoachText.jsx) — verifica o
    // conteúdo real, não a string inteira como um só nó de texto.
    expect(screen.getByText(/omelete de 2 ovos \+ fatia de pão/)).toBeInTheDocument();
    expect(screen.getByText(/150g de peixe \+ 100g de arroz \+ vegetais/)).toBeInTheDocument();
  });

  it('com meal_macros: os anéis mostram os números REAIS da sugestão, não o objetivo do perfil', () => {
    const profile = { calorie_goal: 2400, protein_goal: 160, carbs_goal: 280, fat_goal: 80 };
    render(
      <PlanDayCard
        {...dayProps()}
        profile={profile}
        items={[item({ kind: 'descanso', meal_suggestion: suggestionText, meal_macros: mealMacros })]}
      />
    );
    // Números da SUGESTÃO (mealMacros), não do perfil (2400/160/280/80).
    expect(screen.getByText('2150')).toBeInTheDocument();
    expect(screen.getByText('130')).toBeInTheDocument();
    expect(screen.getByText('240')).toBeInTheDocument();
    expect(screen.getByText('65')).toBeInTheDocument();
    expect(screen.getByText('Estimativa desta sugestão')).toBeInTheDocument();
    expect(screen.queryByText('2400')).not.toBeInTheDocument();
  });

  // Trocou-se só uma refeição do dia (2026-09-23): a lista fica, os totais
  // deixam de bater certo e vêm a null — o cartão mostra o objetivo do
  // perfil e diz que é o objetivo, nunca "Estimativa desta sugestão".
  it('com meal_macros sem totais: mostra o objetivo do perfil e diz que é o objetivo', () => {
    const profile = { calorie_goal: 2400, protein_goal: 160, carbs_goal: 280, fat_goal: 80 };
    const semTotais = { items: [{ tipo: 'jantar', texto: 'Omelete.' }], kcal: null, protein_g: null, carbs_g: null, fat_g: null };
    render(
      <PlanDayCard
        {...dayProps()}
        profile={profile}
        items={[item({ kind: 'descanso', categories: ['so-refeicoes'], meal_suggestion: 'Jantar: Omelete.', meal_macros: semTotais })]}
      />
    );
    expect(screen.getByText('2400')).toBeInTheDocument();
    expect(screen.getByText('Objetivo diário de calorias')).toBeInTheDocument();
    expect(screen.queryByText('Estimativa desta sugestão')).not.toBeInTheDocument();
  });

  it('com meal_macros: mostra a lista de refeições com nome e ícone, não o texto corrido', () => {
    render(
      <PlanDayCard
        {...dayProps()}
        items={[item({ kind: 'descanso', meal_suggestion: suggestionText, meal_macros: mealMacros })]}
      />
    );
    expect(screen.getByText('Pequeno-almoço')).toBeInTheDocument();
    expect(screen.getByText('2 ovos + fatia de pão')).toBeInTheDocument();
    expect(screen.getByText('Almoço')).toBeInTheDocument();
    expect(screen.getByText('Jantar')).toBeInTheDocument();
    // Não cai no texto corrido (CoachText) quando há estrutura.
    expect(screen.queryByText(/omelete de 2 ovos/)).not.toBeInTheDocument();
  });

  it('mostra o indicador de sugestão alimentar na linha fechada do dia', () => {
    render(
      <PlanDayCard
        {...dayProps({ expanded: false })}
        items={[item({ kind: 'descanso', meal_suggestion: suggestionText })]}
      />
    );
    expect(document.querySelector('.wpc-meal-indicator')).toBeInTheDocument();
  });

  it('mostra o indicador na linha fechada mesmo sem meal_suggestion, se houver meal_macros', () => {
    // Achado do hook de pre-push: a caixa expandida já abre só com
    // meal_macros, mas o indicador da linha fechada (hasMeal) tinha
    // ficado só a olhar para meal_suggestion — o atleta não saberia que
    // havia sugestão nutricional sem abrir o dia.
    render(
      <PlanDayCard
        {...dayProps({ expanded: false })}
        items={[item({ kind: 'corrida', meal_macros: mealMacros })]}
      />
    );
    expect(document.querySelector('.wpc-meal-indicator')).toBeInTheDocument();
  });

  it('com meal_macros mas SEM meal_suggestion (dia de treino, texto não obrigatório): mostra a caixa na mesma', () => {
    // Só dias de descanso exigem meal_suggestion/notes na Edge Function
    // (coach-chat/index.ts) — um dia de treino pode ter meal_items/macros
    // válidos sem texto corrido nenhum. A caixa não pode ficar escondida
    // só porque meal_suggestion veio vazio.
    render(
      <PlanDayCard
        {...dayProps()}
        items={[item({ kind: 'corrida', meal_macros: mealMacros })]}
      />
    );
    expect(screen.getByText('Sugestão alimentar e nutricional')).toBeInTheDocument();
    expect(screen.getByText('2150')).toBeInTheDocument();
    expect(screen.getByText('Pequeno-almoço')).toBeInTheDocument();
  });
});

describe('computeAcceptedWindow — vários planos aceites (simulação)', () => {
  const plan = (over = {}) => ({
    id: 'p1', status: 'aceite', period_start: '2026-08-10', period_end: '2026-08-16', ...over,
  });

  it('plano de treino de 7 dias + sugestão alimentar solta lá à frente não faz um plano gigante', () => {
    // Treino: 10..16 (7 dias). Sugestão alimentar isolada a 09-15, um mês
    // depois. Unir os dois daria "Plano de 37 dias" com 29 dias vazios pelo
    // meio — o cartão fica ilegível e a contagem mente sobre o microciclo.
    const w = computeAcceptedWindow(
      [
        plan({ id: 'treino', period_start: '2026-08-10', period_end: '2026-08-16' }),
        plan({ id: 'refeicao', period_start: '2026-09-15', period_end: '2026-09-15' }),
      ],
      [],
      '2026-08-11',
    );
    expect(w.days).toBeLessThanOrEqual(16);
  });

  it('planos contíguos/sobrepostos continuam a unir-se numa janela só', () => {
    const w = computeAcceptedWindow(
      [
        plan({ id: 'a', period_start: '2026-08-10', period_end: '2026-08-16' }),
        plan({ id: 'b', period_start: '2026-08-14', period_end: '2026-08-20' }),
      ],
      [],
      '2026-08-11',
    );
    expect(w).toEqual({ start: '2026-08-10', days: 11 }); // 08-10 .. 08-20
  });
});

/* ── O dia da prova no plano (specs/plano-de-prova.md) ─────────────────────
   O item é um `corrida` com `training_type = 'prova'`; o nome da prova vem
   da agenda, pela data, porque o item não o guarda. */
describe('PlanDayCard — o dia da prova', () => {
  afterEach(() => useAppStore.setState({ raceEvents: [] }));

  const dayProps = {
    dateISO: '2026-08-11', dayNumber: 1, isToday: false, isOverdue: false,
    onComplete: () => {}, onCancel: () => {}, expanded: false,
  };

  it('mostra "Prova", o nome da prova desse dia e o tom âmbar', () => {
    useAppStore.setState({ raceEvents: [{ id: 'r1', date: '2026-08-11', name: 'Corrida do Tejo', status: 'agendada' }] });
    const { container } = render(
      <PlanDayCard {...dayProps} items={[item({ training_type: 'prova', target_distance_km: 10 })]} />
    );
    expect(screen.getByText('Prova · Corrida do Tejo · 10 km')).toBeInTheDocument();
    expect(container.querySelector('.wpc-day-card.race')).toBeTruthy();
  });

  it('sem prova na agenda nesse dia, o rótulo ainda diz que é prova', () => {
    render(<PlanDayCard {...dayProps} items={[item({ training_type: 'prova', target_distance_km: 10 })]} />);
    expect(screen.getByText('Prova · 10 km')).toBeInTheDocument();
  });

  it('um treino normal não fica âmbar', () => {
    useAppStore.setState({ raceEvents: [{ id: 'r1', date: '2026-08-11', name: 'Corrida do Tejo', status: 'agendada' }] });
    const { container } = render(
      <PlanDayCard {...dayProps} items={[item({ training_type: 'longo', target_distance_km: 16 })]} />
    );
    // O mesmo nome que o treino tem no resto da app (pedido 2026-09-26), e
    // não o enum cru ("Longo · 16 km").
    expect(screen.getByText('Rodagem longa · 16 km')).toBeInTheDocument();
    expect(container.querySelector('.wpc-day-card.race')).toBeFalsy();
  });

  /* A folha da proposta imprimia o valor da BD: "Prova · 21.0975 km",
     "Continuo · 8 km" — e o mesmo treino, depois de aceite, chamava-se
     "Corrida contínua · 8 km" e "21,1 km" no Início (pedido 2026-09-26). */
  it('a distância da prova com uma casa decimal e vírgula, e o tipo pelo nome', () => {
    useAppStore.setState({ raceEvents: [{ id: 'r1', date: '2026-08-11', name: 'Meia da Nazaré', status: 'agendada' }] });
    render(<PlanDayCard {...dayProps} items={[item({ training_type: 'prova', target_distance_km: 21.0975 })]} />);
    expect(screen.getByText('Prova · Meia da Nazaré · 21,1 km')).toBeInTheDocument();
    expect(screen.queryByText(/21\.0975/)).toBeNull();
  });

  it('um treino contínuo diz-se como no Início', () => {
    render(<PlanDayCard {...dayProps} items={[item({ training_type: 'continuo', target_distance_km: 8.5 })]} />);
    expect(screen.getByText('Corrida contínua · 8,5 km')).toBeInTheDocument();
  });
});

/* ── O dia vazio: decisão dela ou dia por escrever (pedido 2026-09-26) ──────
   Um dia vazio dizia sempre "Sem plano" — também a quarta que a Carol deixou
   livre de propósito a meio da "semana 3 de 8". O plano de uma prova escreve-
   se por tranches (1-2 semanas de cada vez): antes do último dia que ele já
   decidiu, um dia vazio é decisão dela; depois, está por escrever. */
describe('buildPlanDays — porPlanear', () => {
  // Um plano para uma prova a 18 out, escrito até 29 set.
  const maratona = { id: 'p', status: 'aceite', race_id: 'r-porto', period_start: '2026-09-21', period_end: '2026-10-18' };
  const itens = [
    item({ id: 'a', plan_id: 'p', planned_date: '2026-09-21', status: 'concluido' }),
    item({ id: 'b', plan_id: 'p', planned_date: '2026-09-26' }),
    item({ id: 'c', plan_id: 'p', planned_date: '2026-09-29' }),
  ];
  const porDia = (days) => Object.fromEntries(days.map((d) => [d.dateISO, d]));

  it('antes do último dia decidido é "Sem treino"; depois, "Por planear"', () => {
    const d = porDia(buildPlanDays(itens, '2026-09-21', 28, { plans: [maratona], today: '2026-09-26' }));
    // 27 e 28: livres a meio do plano — decisão dela.
    expect(d['2026-09-27'].porPlanear).toBe(false);
    expect(d['2026-09-28'].porPlanear).toBe(false);
    expect(dayTitle(d['2026-09-27'].items, null, { porPlanear: d['2026-09-27'].porPlanear })).toBe('Sem treino');
    // Depois de 29, até ao dia da prova: por escrever.
    ['2026-09-30', '2026-10-01', '2026-10-11', '2026-10-18'].forEach((iso) => {
      expect(d[iso].porPlanear).toBe(true);
      expect(dayTitle(d[iso].items, null, { porPlanear: d[iso].porPlanear })).toBe('Por planear');
    });
    // Um dia com treino nunca está por planear.
    expect(d['2026-09-29'].porPlanear).toBe(false);
  });

  /* Percorre dias seguidos, e o hoje de cada um: o que já passou nunca fica
     "por planear" (ninguém planeia ontem), e o bloco por escrever começa
     sempre no dia de hoje ou depois. */
  it('dia a dia: um dia que já passou deixa de estar por planear', () => {
    const soAte25 = [item({ id: 'x', plan_id: 'p', planned_date: '2026-09-25' })];
    ['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30'].forEach((hoje) => {
      const days = buildPlanDays(soAte25, '2026-09-21', 14, { plans: [maratona], today: hoje });
      days.forEach((d) => {
        if (d.items.length) expect(d.porPlanear).toBe(false);
        else expect(d.porPlanear).toBe(d.dateISO >= hoje);
      });
      const primeiro = days.find((d) => d.porPlanear);
      expect(primeiro.dateISO).toBe(hoje);
      expect(days.find((d) => d.dateISO === hoje).isToday).toBe(true);
    });
  });

  it('um plano sem prova escreve-se inteiro: os dias vazios do fim são folgas, não dias por escrever', () => {
    const semana = { id: 's', status: 'aceite', race_id: null, period_start: '2026-09-21', period_end: '2026-09-27' };
    const doSemana = [item({ id: 'y', plan_id: 's', planned_date: '2026-09-25' })];
    const d = porDia(buildPlanDays(doSemana, '2026-09-21', 7, { plans: [semana], today: '2026-09-26' }));
    expect(d['2026-09-26'].porPlanear).toBe(false);
    expect(d['2026-09-27'].porPlanear).toBe(false);
    // Sem os planos à mão não se sabe: fica o último dia com treino.
    const semPlanos = porDia(buildPlanDays(doSemana, '2026-09-21', 7, { today: '2026-09-26' }));
    expect(semPlanos['2026-09-27'].porPlanear).toBe(true);
  });

  it('um plano que perdeu a prova continua a ser escrito por tranches', () => {
    const perdida = { ...maratona, race_id: null, race_lost_at: '2026-09-24T10:00:00Z' };
    expect(planeadoAte(itens, [perdida])).toBe('2026-09-29');
    expect(planeadoAte(itens, [{ ...perdida, race_lost_at: null }])).toBe('2026-10-18');
  });

  it('as refeições sugeridas não decidem o treino de ninguém', () => {
    const jantar = item({ id: 'j', plan_id: 'p', kind: 'descanso', categories: ['so-refeicoes'], planned_date: '2026-10-05' });
    expect(planeadoAte([...itens, jantar], [maratona])).toBe('2026-09-29');
    // Um plano só de refeições sem prova também não conta como escrito até ao fim.
    const refeicoes = { id: 'm', status: 'aceite', race_id: null, period_start: '2026-09-21', period_end: '2026-10-10' };
    expect(planeadoAte([...itens, { ...jantar, plan_id: 'm' }], [maratona, refeicoes])).toBe('2026-09-29');
    // Um descanso a sério decide o dia.
    const descanso = item({ id: 'd', plan_id: 'p', kind: 'descanso', planned_date: '2026-10-03' });
    expect(planeadoAte([...itens, descanso], [maratona])).toBe('2026-10-03');
  });

  /* Um bloco novo aceite a meio do antigo: o antigo fecha na véspera e os
     treinos dele dali em diante ficam cancelados. Não foi o atleta que os
     cancelou — não podem aparecer como "Cancelado" ao lado do plano novo. */
  it('com os planos à mão, o cancelado que o sistema arrumou sai do dia', () => {
    const antigo = { id: 'old', status: 'aceite', race_id: null, period_start: '2026-09-14', period_end: '2026-09-25' };
    const novo = { id: 'new', status: 'aceite', race_id: 'r-porto', period_start: '2026-09-26', period_end: '2026-10-18' };
    const arrumado = item({ id: 'o1', plan_id: 'old', planned_date: '2026-09-27', training_type: 'intervalos', status: 'cancelado' });
    const doAtleta = item({ id: 'o2', plan_id: 'old', planned_date: '2026-09-24', status: 'cancelado' });
    const doNovo = item({ id: 'n1', plan_id: 'new', planned_date: '2026-09-28', training_type: 'longo' });
    const d = porDia(buildPlanDays([arrumado, doAtleta, doNovo], '2026-09-21', 14, { plans: [antigo, novo], today: '2026-09-26' }));
    expect(d['2026-09-27'].items).toEqual([]);
    expect(d['2026-09-27'].porPlanear).toBe(false); // antes de 28, o último dia decidido
    // O que o atleta cancelou dentro do período do plano dele fica.
    expect(d['2026-09-24'].items.map((i) => i.id)).toEqual(['o2']);
    // Sem os planos, nada sai (é o que o teste "mantém visíveis itens cancelados" já fixa).
    const semPlanos = porDia(buildPlanDays([arrumado, doNovo], '2026-09-21', 14, { today: '2026-09-26' }));
    expect(semPlanos['2026-09-27'].items.map((i) => i.id)).toEqual(['o1']);
  });
});

/* ── O dia por escrever conta-se pelo plano que o cobre (revisão 2026-09-26) ─
   A conta era o último dia escrito de TODOS os planos juntos. Com outro plano
   aceite mais à frente — a semana de recuperação depois da prova, já aceite,
   noutro bloco ou logo a seguir a este —, esse "último dia" passava para lá
   do plano de agora, e os dias que ela ainda não escreveu ficavam todos "Sem
   treino", sem convite para os planear. */
describe('buildPlanDays — o dia por escrever é o do plano que o cobre', () => {
  // A maratona a 18 out, escrita só até sexta, 25 set.
  const maratona = { id: 'm', status: 'aceite', race_id: 'r-porto', period_start: '2026-09-21', period_end: '2026-10-18' };
  const sexta = item({ id: 's', plan_id: 'm', planned_date: '2026-09-25', status: 'concluido' });
  const prova = item({ id: 'pr', plan_id: 'm', planned_date: '2026-10-18', training_type: 'prova', target_distance_km: 42.195 });
  const porDia = (days) => Object.fromEntries(days.map((d) => [d.dateISO, d]));

  it('um plano aceite noutro bloco, mais à frente, não esconde os dias por escrever do de agora', () => {
    const recuperacao = { id: 'rec', status: 'aceite', race_id: null, period_start: '2026-10-25', period_end: '2026-10-31' };
    const rodagem = item({ id: 'r1', plan_id: 'rec', planned_date: '2026-10-26', training_type: 'regenerativo' });
    const itens = [sexta, prova, rodagem];
    // Dias seguidos, cada um com o seu hoje: o bloco por escrever começa hoje
    // e vai até à véspera da prova.
    ['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'].forEach((hoje) => {
      const d = porDia(buildPlanDays(itens, '2026-09-21', 28, { plans: [maratona, recuperacao], today: hoje }));
      expect(d[hoje].porPlanear).toBe(true);
      expect(dayTitle(d[hoje].items, null, { porPlanear: d[hoje].porPlanear })).toBe('Por planear');
      expect(d['2026-10-17'].porPlanear).toBe(true);
      // O dia da prova tem a prova; o que já passou não se planeia.
      expect(d['2026-10-18'].porPlanear).toBe(false);
      Object.values(d).filter((x) => x.dateISO < hoje).forEach((x) => expect(x.porPlanear).toBe(false));
    });
  });

  it('um plano logo a seguir à prova, no mesmo bloco, também não', () => {
    // A prova a 4 out; a semana de recuperação, sem prova, aceite de 5 a 11.
    const meia = { id: 'm', status: 'aceite', race_id: 'r-meia', period_start: '2026-09-21', period_end: '2026-10-04' };
    const provaMeia = item({ id: 'pr', plan_id: 'm', planned_date: '2026-10-04', training_type: 'prova', target_distance_km: 21.0975 });
    const recuperacao = { id: 'rec', status: 'aceite', race_id: null, period_start: '2026-10-05', period_end: '2026-10-11' };
    const rodagem = item({ id: 'r1', plan_id: 'rec', planned_date: '2026-10-07', training_type: 'regenerativo' });
    const d = porDia(buildPlanDays([sexta, provaMeia, rodagem], '2026-09-21', 21, { plans: [meia, recuperacao], today: '2026-09-26' }));
    // A meia ainda tem de 26 set a 3 out por escrever.
    ['2026-09-26', '2026-09-30', '2026-10-03'].forEach((iso) => expect(d[iso].porPlanear).toBe(true));
    // A semana de recuperação foi escrita inteira: os dias vazios são folgas.
    ['2026-10-05', '2026-10-06', '2026-10-11'].forEach((iso) => expect(d[iso].porPlanear).toBe(false));
  });

  /* Um dia que nenhum plano aceite cobre fica pela conta de todos juntos: o
     hoje de um plano que só começa amanhã (o cartão "O que faço hoje" mostra
     hoje e amanhã) é um dia livre, não um dia por planear. */
  it('o hoje antes de um plano que começa amanhã não está por planear', () => {
    const plano = { id: 'm', status: 'aceite', race_id: 'r-porto', period_start: '2026-09-27', period_end: '2026-10-18' };
    const domingo = item({ id: 'd1', plan_id: 'm', planned_date: '2026-09-27', training_type: 'longo' });
    const [hoje, amanha] = buildPlanDays([domingo], '2026-09-26', 2, { plans: [plano], today: '2026-09-26' });
    expect(hoje.porPlanear).toBe(false);
    expect(dayTitle(hoje.items, null, { porPlanear: hoje.porPlanear })).toBe('Sem treino');
    expect(amanha.porPlanear).toBe(false);
  });

  it('o amanhã depois do fim de um plano sem prova está por planear', () => {
    const semana = { id: 's', status: 'aceite', race_id: null, period_start: '2026-09-20', period_end: '2026-09-26' };
    const hojeItem = item({ id: 'h', plan_id: 's', planned_date: '2026-09-26' });
    const [hoje, amanha] = buildPlanDays([hojeItem], '2026-09-26', 2, { plans: [semana], today: '2026-09-26' });
    expect(hoje.porPlanear).toBe(false);
    expect(amanha.porPlanear).toBe(true);
  });
});
