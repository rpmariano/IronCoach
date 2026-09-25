import React from 'react';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import Perfil from './Perfil';

// A Vitrina (separador novo — ver TABS em Perfil.jsx) monta a BadgesCard em
// todos os testes deste ficheiro, porque os separadores do Perfil ficam
// todos montados ao mesmo tempo (carrossel de swipe). As regras dos badges
// têm os testes delas em utils/badges.test.js; aqui só interessa a UI.

// Captura o payload de cada UPDATE para se poder afirmar o que é enviado.
const mocks = vi.hoisted(() => ({ updates: [] }));
// Os 3 separadores ficam sempre montados (carrossel de swipe — ver
// Perfil.jsx), por isso o efeito da Memória do Coach dispara em todos os
// testes, não só nos que abrem a aba Coach. select() tem de responder algo,
// senão fica uma rejeição por apanhar.
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (payload) => {
        mocks.updates.push(payload);
        return { eq: () => Promise.resolve({ error: null }) };
      },
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
    auth: { signOut: () => Promise.resolve({ error: null }) },
  },
}));

// As notificações pedem a permissão ao browser: aqui responde-se pelo teste.
const push = vi.hoisted(() => ({ result: { ok: true, error: null } }));
vi.mock('../../lib/push', () => ({
  ensurePushSubscription: () => Promise.resolve(push.result),
}));

// A procura da cidade de treino (ação 5.6) vai à Open-Meteo: aqui responde o teste.
const lugar = vi.hoisted(() => ({ search: () => Promise.resolve([]) }));
vi.mock('../../utils/trainingPlace', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, searchTrainingPlaces: (...args) => lugar.search(...args) };
});

// Valores distintos entre si para as consultas por valor não serem ambíguas.
const PROFILE = {
  id: 'user-1',
  display_name: 'Atleta',
  gender: 'M',
  height_cm: 180,
  weight_kg: 81,
  calorie_goal: 2100,
  protein_goal: 155,
  carbs_goal: 205,
  fat_goal: 71,
  water_goal_ml: 2500,
};

const abrirMetas = () => fireEvent.click(screen.getByRole('button', { name: /Metas/ }));

const sujarCalorias = (valor) => {
  fireEvent.change(screen.getByDisplayValue('2100'), { target: { value: valor } });
};

describe('Perfil — rascunho vs recarregamento do perfil', () => {
  beforeEach(() => {
    mocks.updates.length = 0;
    useAppStore.setState({
      profile: PROFILE,
      session: { user: { email: 'atleta@ironhealth.app' } },
      navGuard: null,
      activeTab: 'perfil',
    });
  });

  it('mantém as alterações por gravar quando o perfil é recarregado do servidor', () => {
    render(<Perfil />);
    abrirMetas();
    sujarCalorias('2222');
    expect(screen.getByDisplayValue('2222')).toBeInTheDocument();

    /* loadInitialData corre a cada onAuthStateChange, incluindo TOKEN_REFRESHED
       (de hora a hora), e passa sempre um objeto novo. Depender da identidade
       do objeto apagava o rascunho sem aviso. */
    act(() => {
      useAppStore.getState().setProfile({ ...PROFILE });
    });

    expect(screen.getByDisplayValue('2222')).toBeInTheDocument();
  });

  it('mantém a guarda de saída registada depois desse recarregamento', () => {
    render(<Perfil />);
    abrirMetas();
    sujarCalorias('2222');
    expect(typeof useAppStore.getState().navGuard).toBe('function');

    act(() => {
      useAppStore.getState().setProfile({ ...PROFILE });
    });

    expect(typeof useAppStore.getState().navGuard).toBe('function');
  });

  it('recarrega o rascunho quando é outro perfil', () => {
    render(<Perfil />);
    abrirMetas();
    sujarCalorias('2222');

    act(() => {
      useAppStore.getState().setProfile({ ...PROFILE, id: 'user-2', calorie_goal: 1800 });
    });

    expect(screen.queryByDisplayValue('2222')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('1800')).toBeInTheDocument();
  });

  it('trava a navegação para fora do Perfil com alterações pendentes', () => {
    render(<Perfil />);
    abrirMetas();
    sujarCalorias('2222');

    // O guard abre o aviso via setState do React — precisa de act para ser
    // processado antes de o consultarmos.
    let permitido;
    act(() => { permitido = useAppStore.getState().setActiveTab('ginasio'); });

    expect(permitido).toBe(false);
    expect(useAppStore.getState().activeTab).toBe('perfil');
    expect(screen.getByRole('dialog')).toHaveTextContent('Tens alterações por gravar');
  });

  it('deixa navegar sem alterações pendentes', () => {
    render(<Perfil />);
    abrirMetas();

    const permitido = useAppStore.getState().setActiveTab('ginasio');

    expect(permitido).toBe(true);
    expect(useAppStore.getState().activeTab).toBe('ginasio');
  });

  it('sair sem gravar reverte os campos para os valores do perfil', () => {
    render(<Perfil />);
    abrirMetas();
    sujarCalorias('2222');
    act(() => { useAppStore.getState().setActiveTab('ginasio'); });

    fireEvent.click(screen.getByRole('button', { name: 'Sair sem gravar' }));

    expect(useAppStore.getState().activeTab).toBe('ginasio');
    // Afirmar sobre o que está no ecrã, não sobre o store: o descartar nunca
    // escreve no store, por isso essa asserção passaria mesmo sem reverter.
    expect(screen.getByDisplayValue('2100')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('2222')).not.toBeInTheDocument();
  });

  it('grava só os campos alterados, sem tocar nos que o servidor também escreve', async () => {
    useAppStore.setState({
      profile: { ...PROFILE, water_last_activity_at: '2026-08-03T09:00:00Z', water_reminder_muted_date: null },
    });
    render(<Perfil />);
    abrirMetas();
    sujarCalorias('2222');

    fireEvent.click(screen.getByRole('button', { name: /Guardar altera/ }));

    await waitFor(() => expect(mocks.updates.length).toBe(1));
    const payload = mocks.updates[0];
    expect(payload).toEqual({ calorie_goal: 2222 });
    /* Enviar a linha inteira escrevia por cima destes dois, que o cron dos
       lembretes e o registo de água alteram do lado do servidor. */
    expect(payload).not.toHaveProperty('water_last_activity_at');
    expect(payload).not.toHaveProperty('water_reminder_muted_date');
    expect(payload).not.toHaveProperty('id');
  });

  it('terminar sessão com alterações pendentes passa pelo aviso', () => {
    render(<Perfil />);
    abrirMetas();
    sujarCalorias('2222');

    // O botão de terminar sessão vive no separador Pessoal — chegar lá com o
    // rascunho sujo já dispara o aviso, que é o comportamento a garantir.
    fireEvent.click(screen.getByRole('button', { name: /Pessoal/ }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Tens alterações por gravar');
  });

  // Regressão do bug-005: "Gravar e sair" ao trocar de separador deixava o
  // aviso preso reaberto e o realce do menu preso no separador anterior,
  // mesmo com o carrossel já a mostrar o separador de destino. Causa: o
  // guard de isDirty era lido do closure do useCallback, ainda desatualizado
  // no instante síncrono em que goToPendingTarget dispara o scrollTo — ver
  // isDirtyRef em Perfil.jsx.
  it('gravar e sair ao trocar de separador fecha o aviso e sincroniza o separador ativo', async () => {
    render(<Perfil />);
    abrirMetas();
    sujarCalorias('2222');

    fireEvent.click(screen.getByRole('button', { name: /Pessoal/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Tens alterações por gravar');

    fireEvent.click(screen.getByRole('button', { name: 'Gravar e sair' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(mocks.updates.length).toBe(1));

    // O separador ativo pinta-se no tom do seu assunto (ponto 4 do handoff, e
    // o mock "Perfil"): Pessoal em --gym, Metas em --race. Antes eram os
    // quatro em --mod-prova. O que importa aqui continua a ser o mesmo — só
    // um separador fica aceso, e é o que o aviso mandou abrir.
    expect(screen.getByRole('button', { name: /Pessoal/ })).toHaveStyle({ color: 'var(--gym)' });
    expect(screen.getByRole('button', { name: /Metas/ })).toHaveStyle({ color: 'var(--text-muted)' });
  });
});

// ─── Autorização do Coach para escrever metas — DECISÃO N1, camada 1 ───────
// Ver specs/coach-investigacao.md. Só proteína e gordura; calorias e
// hidratos são metas variáveis e não têm este mecanismo.
describe('Perfil — metas escritas pelo Coach', () => {
  beforeEach(() => {
    mocks.updates.length = 0;
    useAppStore.setState({
      profile: PROFILE,
      session: { user: { email: 'atleta@ironhealth.app' } },
      navGuard: null,
      activeTab: 'perfil',
    });
  });

  // O interruptor "O Coach pode ajustar as metas" saiu (bug #41): a Carol
  // propõe sempre, e é o atleta que aceita ou recusa. Fica a nota da regra.
  it('já não há interruptor de autorização; fica a nota do selo "Coach"', () => {
    render(<Perfil />);
    abrirMetas();
    expect(screen.queryByLabelText('Ativar autorização do Coach')).not.toBeInTheDocument();
    expect(screen.queryByText('O Coach pode ajustar as metas')).not.toBeInTheDocument();
    expect(screen.getByTestId('perfil-metas-coach-nota')).toHaveTextContent('só mudam aqui se aceitares');
  });

  it('mostra o selo "Coach" quando a proteína foi definida pelo Coach', () => {
    useAppStore.setState({ profile: { ...PROFILE, protein_goal_set_by_coach: true } });
    render(<Perfil />);
    abrirMetas();
    expect(screen.getByTitle('Meta definida pela Carol')).toBeInTheDocument();
  });

  it('não mostra selo nenhum quando nada foi definido pelo Coach', () => {
    render(<Perfil />);
    abrirMetas();
    expect(screen.queryByTitle('Meta definida pela Carol')).not.toBeInTheDocument();
  });

  it('editar à mão a proteína marcada pelo Coach desliga a origem e grava as duas mudanças', async () => {
    useAppStore.setState({ profile: { ...PROFILE, protein_goal_set_by_coach: true } });
    render(<Perfil />);
    abrirMetas();
    expect(screen.getByTitle('Meta definida pela Carol')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('155'), { target: { value: '160' } });
    // O selo desaparece assim que o atleta edita — o valor já não é "do coach".
    expect(screen.queryByTitle('Meta definida pela Carol')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Guardar altera/ }));
    await waitFor(() => expect(mocks.updates.length).toBe(1));
    expect(mocks.updates[0]).toEqual({ protein_goal: 160, protein_goal_set_by_coach: false });
  });

  it('editar a gordura definida pelo coach também desliga só a sua própria flag', async () => {
    useAppStore.setState({ profile: { ...PROFILE, protein_goal_set_by_coach: true, fat_goal_set_by_coach: true } });
    render(<Perfil />);
    abrirMetas();

    fireEvent.change(screen.getByDisplayValue('71'), { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar altera/ }));
    await waitFor(() => expect(mocks.updates.length).toBe(1));

    expect(mocks.updates[0]).toEqual({ fat_goal: 75, fat_goal_set_by_coach: false });
    // A proteína não foi tocada — a sua flag não deve ir no payload.
    expect(mocks.updates[0]).not.toHaveProperty('protein_goal_set_by_coach');
  });
});

// ─── FC em repouso — validação pré-save ──────────────────────────────────────
// Bug corrigido: parseInt durante a digitação produzia valores intermédios
// (ex: "5" ao escrever "52") que violavam o CHECK constraint do Postgres
// (25-120 bpm) e devolviam erro 400. Correção: descartar silenciosamente no
// handleSave sem bloquear outros campos.
//
// Nota: quando o único campo sujo é descartado, o handleSave retorna cedo
// (updates vazio, isDirty → false) sem chamar o Supabase. O teste verifica
// que o botão "Guardar" desaparece (isDirty=false) sem erro, confirmando que
// o discard foi silencioso e não ficou em loop nem lançou alerta.
describe('Perfil — FC em repouso (resting_hr_bpm)', () => {
  beforeEach(() => {
    mocks.updates.length = 0;
    useAppStore.setState({
      profile: { ...PROFILE, resting_hr_bpm: 52 },
      session: { user: { email: 'atleta@ironhealth.app' } },
      navGuard: null,
      activeTab: 'perfil',
    });
  });

  it('um valor fora do intervalo (5) é descartado silenciosamente — save completa sem erro', async () => {
    render(<Perfil />);
    // A tab Pessoal é a default — o input resting_hr_bpm já está visível.
    fireEvent.change(screen.getByDisplayValue('52'), { target: { value: '5' } });
    const saveBtn = screen.getByRole('button', { name: /Guardar altera/ });
    // Botão está ativo porque isDirty=true.
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);

    // O save completa: isDirty→false → botão fica desativado (sempre no DOM mas disabled).
    // Se houvesse erro (alert), isDirty ficaria true e o botão mantinha-se ativo.
    await waitFor(() => expect(saveBtn).toBeDisabled());
    // Nenhuma chamada ao Supabase — updates era vazio após descartar o campo.
    expect(mocks.updates.length).toBe(0);
  });

  it('um valor dentro do intervalo (58) é gravado normalmente', async () => {
    render(<Perfil />);
    fireEvent.change(screen.getByDisplayValue('52'), { target: { value: '58' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar altera/ }));

    await waitFor(() => expect(mocks.updates.length).toBe(1));
    expect(mocks.updates[0]).toEqual({ resting_hr_bpm: 58 });
  });

  it('um valor muito alto (200) também é descartado silenciosamente', async () => {
    render(<Perfil />);
    fireEvent.change(screen.getByDisplayValue('52'), { target: { value: '200' } });
    const saveBtn = screen.getByRole('button', { name: /Guardar altera/ });
    fireEvent.click(saveBtn);

    await waitFor(() => expect(saveBtn).toBeDisabled());
    expect(mocks.updates.length).toBe(0);
  });
});

describe('Perfil — Altura (height_cm) sem pontuação', () => {
  beforeEach(() => {
    mocks.updates.length = 0;
    useAppStore.setState({
      profile: { ...PROFILE, height_cm: 180 },
      session: { user: { email: 'atleta@ironhealth.app' } },
      navGuard: null,
      activeTab: 'perfil',
    });
  });

  it('um valor com casa decimal (1.75) falha a validação e impede gravação', async () => {
    render(<Perfil />);
    abrirMetas();
    fireEvent.change(screen.getByDisplayValue('180'), { target: { value: '1.75' } });
    const saveBtn = screen.getByRole('button', { name: /Guardar altera/ });
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);

    // Como falha, o botão continua ativo (isDirty=true) e não há chamadas ao Supabase
    await waitFor(() => expect(saveBtn).not.toBeDisabled());
    expect(mocks.updates.length).toBe(0);
  });

  it('um valor inteiro (175) passa na validação e é gravado', async () => {
    render(<Perfil />);
    abrirMetas();
    fireEvent.change(screen.getByDisplayValue('180'), { target: { value: '175' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar altera/ }));

    await waitFor(() => expect(mocks.updates.length).toBe(1));
    expect(mocks.updates[0]).toEqual({ height_cm: 175 });
  });
});


// Ponto 2 do handoff: a ação de cada separador do Perfil vive na barra de
// ação fixa (ActionBar), não no fim do carrossel — antes ficava abaixo da
// dobra, à altura do separador mais alto dos quatro.
describe('Perfil — ação na ActionBar', () => {
  beforeEach(() => {
    mocks.updates.length = 0;
    useAppStore.setState({
      profile: PROFILE,
      session: { user: { email: 'atleta@ironhealth.app' } },
      navGuard: null,
      activeTab: 'perfil',
      shoes: [],
      runs: [],
    });
  });

  it('mostra "Guardar alterações" dentro da barra', () => {
    render(<Perfil />);
    const bar = screen.getByTestId('action-bar');
    expect(bar).toContainElement(screen.getByRole('button', { name: /Guardar altera/ }));
  });

  it('no separador Equipamento a barra passa a "Adicionar sapatilhas"', async () => {
    render(<Perfil />);
    // O rótulo visível continua a ser "Equipa." (abreviatura do mock), mas o
    // nome acessível é agora "Equipamento" — o srLabel do SubNav.
    fireEvent.click(screen.getByRole('button', { name: /Equipamento/ }));
    const botao = await screen.findByRole('button', { name: /Adicionar sapatilhas/ });
    expect(screen.getByTestId('action-bar')).toContainElement(botao);
    expect(screen.queryByRole('button', { name: /Guardar altera/ })).not.toBeInTheDocument();
  });
});

/* Auditoria a11y (passagem "harden"): as etiquetas do Perfil eram só
   visuais — 17 campos chegavam ao leitor de ecrã sem nome. Cada uma passou
   a ter htmlFor com o id do campo. getByLabelText falha se a ligação se
   perder num refactor futuro. */
describe('Perfil — etiquetas programáticas', () => {
  beforeEach(() => {
    mocks.updates.length = 0;
    useAppStore.setState({
      profile: PROFILE,
      session: { user: { email: 'atleta@ironhealth.app' } },
      navGuard: null,
      activeTab: 'perfil',
      shoes: [],
      runs: [],
    });
  });

  it('encontra os campos pelo nome da etiqueta', () => {
    render(<Perfil />);
    expect(screen.getByLabelText('Nome')).toHaveValue('Atleta');
    expect(screen.getByLabelText('Género')).toHaveValue('M');
    expect(screen.getByLabelText('Altura (cm)')).toHaveValue(180);
    expect(screen.getByLabelText(/Calorias \(kcal\/dia\)/)).toHaveValue(2100);
  });

  it('nenhum input/select do Perfil fica sem nome acessível', () => {
    const { container } = render(<Perfil />);
    const semNome = [...container.querySelectorAll('input, select, textarea')].filter((el) => {
      if (el.getAttribute('aria-label')) return false;
      if (el.id && container.querySelector(`label[for="${el.id}"]`)) return false;
      if (el.closest('label')) return false;
      return true;
    });
    expect(semNome.map((el) => el.outerHTML.slice(0, 80))).toEqual([]);
  });
});

/* A Vitrina (2026-09-22): o separador onde vive a BadgesCard. Nasceu com
   dois cartões (badges + Palmarés) e na fase C ficou só com um — os testes
   dos medalhões foram-se com eles. O que interessa aqui continua a ser o
   separador, não o cartão: que ele monta o que tem de montar, que não suja o
   rascunho do Perfil e que não pede para guardar nada. O conteúdo da Vitrina
   em isolamento é de BadgesCard.test.jsx. */
describe('Perfil — Vitrina', () => {
  const abrirVitrina = () => fireEvent.click(screen.getByRole('button', { name: 'Vitrina' }));

  beforeEach(() => {
    mocks.updates.length = 0;
    useAppStore.setState({
      profile: PROFILE,
      session: { user: { email: 'atleta@ironhealth.app' } },
      navGuard: null,
      activeTab: 'perfil',
      shoes: [],
      raceEvents: [],
      runs: [],
      coachPlans: [],
      coachPlanItems: [],
      editingRaceId: null,
      openCreationMode: null,
    });
  });

  it('monta a Vitrina dos badges, com o "Onde estás" que herdou do Palmarés', () => {
    render(<Perfil />);
    abrirVitrina();
    expect(screen.getByTestId('badges-card')).toBeInTheDocument();
    expect(screen.getByTestId('badges-onde-estas')).toHaveTextContent('Onde estás');
  });

  it('a Vitrina não suja o rascunho: sair para outro separador não pede confirmação', () => {
    render(<Perfil />);
    abrirVitrina();
    expect(screen.getByTestId('badges-card')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pessoal' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('não mostra "Guardar alterações" nem nenhum outro botão de ação na barra', () => {
    render(<Perfil />);
    abrirVitrina();
    const bar = screen.queryByTestId('action-bar');
    expect(bar).not.toBeInTheDocument();
  });
});

describe('Perfil — notificações da Carol (P.6)', () => {
  beforeEach(() => {
    mocks.updates.length = 0;
    push.result = { ok: true, error: null };
    useAppStore.setState({
      profile: PROFILE,
      session: { user: { email: 'atleta@ironhealth.app' } },
      navGuard: null,
      activeTab: 'perfil',
    });
  });

  it('começa desligado; ligar mostra as preferências e grava só o que mudou', async () => {
    render(<Perfil />);
    abrirMetas();
    expect(screen.queryByTestId('perfil-carol-push-prefs')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Ativar notificações da Carol'));
    await waitFor(() => expect(screen.getByTestId('perfil-carol-push-prefs')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('No máximo, por dia'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('A partir das'), { target: { value: '8' } });
    const silencio = screen.getByRole('button', { name: 'Dias sem registos' });
    expect(silencio).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(silencio);
    expect(silencio).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: /Guardar altera/ }));
    await waitFor(() => expect(mocks.updates.length).toBe(1));
    expect(mocks.updates[0]).toEqual({
      carol_push_enabled: true,
      carol_push_max_per_day: 2,
      carol_push_start_hour: 8,
      carol_push_types: ['intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'missed_workout', 'week_review'],
    });
  });

  it('se o browser recusar a permissão, o interruptor fica desligado', async () => {
    push.result = { ok: false, error: 'Notificações bloqueadas.' };
    render(<Perfil />);
    abrirMetas();
    fireEvent.click(screen.getByLabelText('Ativar notificações da Carol'));
    // O pedido de permissão resolve-se; o interruptor não chega a ligar.
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByLabelText('Ativar notificações da Carol')).toBeInTheDocument();
    expect(screen.queryByTestId('perfil-carol-push-prefs')).not.toBeInTheDocument();
  });

  it('é independente da água: ligar a Carol não mexe nos lembretes de água', async () => {
    render(<Perfil />);
    abrirMetas();
    fireEvent.click(screen.getByLabelText('Ativar notificações da Carol'));
    await waitFor(() => expect(screen.getByTestId('perfil-carol-push-prefs')).toBeInTheDocument());
    expect(screen.getByLabelText('Ativar lembretes de água')).toBeInTheDocument();
  });

  it('as boas-vindas (ação P.11): sempre visíveis, ligadas sem a coluna, e desligar grava só isso', async () => {
    render(<Perfil />);
    abrirMetas();
    // Com as notificações da Carol desligadas, o interruptor continua lá.
    expect(screen.queryByTestId('perfil-carol-push-prefs')).not.toBeInTheDocument();
    const interruptor = screen.getByLabelText('Desativar boas-vindas ao abrir a app');
    expect(interruptor).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(interruptor);
    expect(screen.getByLabelText('Ativar boas-vindas ao abrir a app')).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: /Guardar altera/ }));
    await waitFor(() => expect(mocks.updates.length).toBe(1));
    expect(mocks.updates[0]).toEqual({ carol_welcome_enabled: false });
  });

  it('as boas-vindas desligadas no perfil aparecem desligadas', () => {
    useAppStore.setState({ profile: { ...PROFILE, carol_welcome_enabled: false } });
    render(<Perfil />);
    abrirMetas();
    expect(screen.getByLabelText('Ativar boas-vindas ao abrir a app')).toHaveAttribute('aria-pressed', 'false');
  });
});


/* Bug #41 (2026-09-22): Metas só com objetivos. Altura e peso atual são
   medições (Pessoal); os pedidos de notificações vivem no separador Coach;
   Metas diz o que é e leva à Carol para os afinar. Os separadores estão
   todos montados — o separador de um campo é a .tab-swipe-page onde vive. */
describe('Perfil — reorganização das Metas (#41)', () => {
  const separadorDe = (el) => el.closest('.tab-swipe-page')?.querySelector('h2.sr-only')?.textContent;

  beforeEach(() => {
    mocks.updates.length = 0;
    useAppStore.setState({
      profile: PROFILE,
      session: { user: { email: 'atleta@ironhealth.app' } },
      navGuard: null,
      activeTab: 'perfil',
      coachIntent: null,
    });
  });

  it('altura e peso atual estão no Pessoal, não em Metas', () => {
    render(<Perfil />);
    expect(separadorDe(screen.getByLabelText('Altura (cm)'))).toBe('Pessoal');
    expect(separadorDe(screen.getByLabelText('Peso atual (kg)'))).toBe('Pessoal');
  });

  it('os objetivos continuam em Metas', () => {
    render(<Perfil />);
    expect(separadorDe(screen.getByLabelText(/Calorias/))).toBe('Metas');
    expect(separadorDe(screen.getByText('Objetivos corporais'))).toBe('Metas');
    expect(separadorDe(screen.getByTestId('perfil-metas-coach-nota'))).toBe('Metas');
  });

  it('as notificações (água e Carol) passaram para o separador Carol', () => {
    render(<Perfil />);
    expect(separadorDe(screen.getByText('Lembretes de água'))).toBe('Carol');
    expect(separadorDe(screen.getByTestId('perfil-carol-push'))).toBe('Carol');
    expect(separadorDe(screen.getByTestId('perfil-notificacoes'))).toBe('Carol');
  });

  // Bug #42 (2026-09-22): "Comparar-me com o meu escalão" vive na Vitrina.
  it('a comparação com o escalão está na Vitrina, não no Pessoal', () => {
    render(<Perfil />);
    expect(separadorDe(screen.getByTestId('perfil-privacidade-tabelas'))).toBe('Vitrina');
  });

  it('Metas explica que são objetivos a afinar com a Carol e leva ao chat com a pergunta', () => {
    render(<Perfil />);
    const intro = screen.getByTestId('perfil-metas-intro');
    expect(separadorDe(intro)).toBe('Metas');
    expect(intro.textContent).toMatch(/objetivos teus/);
    fireEvent.click(screen.getByTestId('perfil-metas-carol'));
    const { coachIntent, activeTab } = useAppStore.getState();
    expect(coachIntent).toMatchObject({ kind: 'say' });
    expect(coachIntent.text).toMatch(/definir os meus objetivos/);
    expect(activeTab).toBe('coach');
  });

  // Revisão pré-deploy da Vaga 1: com alterações por gravar, o pedido à
  // Carol ficava pendurado se o atleta cancelasse a saída — e era enviado
  // sozinho, em nome dele, da próxima vez que abrisse o chat.
  it('cancelar a saída para o Coach não deixa o pedido à Carol pendurado', () => {
    render(<Perfil />);
    abrirMetas();
    sujarCalorias('2222');
    fireEvent.click(screen.getByTestId('perfil-metas-carol'));
    expect(useAppStore.getState().activeTab).toBe('perfil');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(useAppStore.getState().coachIntent).toBeNull();
  });
});

/* Onde treinas (ação 5.6, push B): a cidade de treino, para a Carol ver a
   previsão dos treinos. Procura-se, escolhe-se da lista, e as quatro colunas
   gravam-se juntas com o Guardar — procurar, só por si, não suja nada. */
describe('Perfil — onde treinas (ação 5.6)', () => {
  const LISBOA = { id: '2267057', label: 'Lisboa, Portugal', lat: 38.72509, lon: -9.1498, altitudeM: 54 };
  const MADRID = { id: '3117735', label: 'Madrid, Espanha', lat: 40.4165, lon: -3.70256, altitudeM: 657 };
  const COM_CIDADE = { ...PROFILE, training_city: 'Covilhã, Portugal', training_lat: 40.28106, training_lon: -7.50504, training_altitude_m: 703 };
  const campo = () => within(screen.getByTestId('perfil-onde-treinas'));
  const procurar = (texto) => {
    fireEvent.change(screen.getByLabelText('Onde treinas'), { target: { value: texto } });
    fireEvent.click(campo().getByRole('button', { name: 'Procurar' }));
  };
  const guardar = () => screen.getByRole('button', { name: /Guardar altera/ });

  beforeEach(() => {
    mocks.updates.length = 0;
    lugar.search = vi.fn(() => Promise.resolve([LISBOA]));
    useAppStore.setState({
      profile: PROFILE,
      session: { user: { email: 'atleta@ironhealth.app' } },
      navGuard: null,
      activeTab: 'perfil',
    });
  });

  it('procura, confirma o sítio e grava as quatro colunas juntas', async () => {
    render(<Perfil />);
    procurar('lisboa');
    expect(lugar.search).toHaveBeenCalledWith('lisboa');
    const escolha = await campo().findByRole('button', { name: 'Lisboa, Portugal' });
    expect(campo().getByText('Encontrei — é aqui?')).toBeInTheDocument();
    fireEvent.click(escolha);
    expect(screen.getByTestId('perfil-onde-treinas-cidade')).toHaveTextContent('Lisboa, Portugal');

    fireEvent.click(guardar());
    await waitFor(() => expect(mocks.updates.length).toBe(1));
    expect(mocks.updates[0]).toEqual({
      training_city: 'Lisboa, Portugal', training_lat: 38.72509, training_lon: -9.1498, training_altitude_m: 54,
    });
  });

  it('com vários, escolhe-se o certo', async () => {
    lugar.search = vi.fn(() => Promise.resolve([{ ...MADRID, id: 'co', label: 'Madrid, Colômbia' }, MADRID]));
    render(<Perfil />);
    procurar('madrid');
    fireEvent.click(await campo().findByRole('button', { name: 'Madrid, Espanha' }));
    expect(screen.getByTestId('perfil-onde-treinas-cidade')).toHaveTextContent('Madrid, Espanha');
    fireEvent.click(guardar());
    await waitFor(() => expect(mocks.updates.length).toBe(1));
    expect(mocks.updates[0].training_city).toBe('Madrid, Espanha');
  });

  it('procurar não suja o rascunho; sem resultados ou com erro, diz-o', async () => {
    const calado = vi.spyOn(console, 'error').mockImplementation(() => {});
    lugar.search = vi.fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('open-meteo 503'));
    render(<Perfil />);
    procurar('xqzwv');
    expect(await campo().findByText(/Não encontrei esse sítio/)).toBeInTheDocument();
    expect(guardar()).toBeDisabled();
    procurar('lisboa');
    expect(await campo().findByText('Não consegui procurar agora. Tenta daqui a pouco.')).toBeInTheDocument();
    expect(guardar()).toBeDisabled();
    calado.mockRestore();
  });

  it('com cidade no perfil mostra-a; Tirar limpa as quatro colunas', async () => {
    useAppStore.setState({ profile: COM_CIDADE });
    render(<Perfil />);
    expect(screen.getByTestId('perfil-onde-treinas-cidade')).toHaveTextContent('Covilhã, Portugal');
    expect(screen.queryByLabelText('Onde treinas')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tirar onde treinas' }));
    expect(screen.getByLabelText('Onde treinas')).toHaveValue('');
    fireEvent.click(guardar());
    await waitFor(() => expect(mocks.updates.length).toBe(1));
    expect(mocks.updates[0]).toEqual({
      training_city: null, training_lat: null, training_lon: null, training_altitude_m: null,
    });
  });

  it('Mudar abre a procura com o nome; Cancelar volta à cidade sem sujar nada', () => {
    useAppStore.setState({ profile: COM_CIDADE });
    render(<Perfil />);
    fireEvent.click(screen.getByRole('button', { name: 'Mudar onde treinas' }));
    expect(screen.getByLabelText('Onde treinas')).toHaveValue('Covilhã');
    fireEvent.click(campo().getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByTestId('perfil-onde-treinas-cidade')).toHaveTextContent('Covilhã, Portugal');
    expect(guardar()).toBeDisabled();
  });
});

