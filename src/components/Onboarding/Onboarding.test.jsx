import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { ToastProvider } from '../shared/ToastProvider';
import Onboarding from './Onboarding';
import { shouldShowOnboarding, shouldSilentlyMarkDone, onboardingLocalKey } from '../../utils/onboarding';

// Mesmo padrão de mock de RunAgenda.test.jsx/Coach.test.jsx: supabase.from é
// um vi.fn() reconfigurável, para se poder inspecionar o que cada tabela
// recebeu.
vi.mock('../../lib/supabase', () => ({
  supabase: { from: vi.fn() },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

let profileUpdates;
let coachNoteInserts;
let raceInserts;

function wireSupabase({ profilesError = null, raceError = null } = {}) {
  profileUpdates = [];
  coachNoteInserts = [];
  raceInserts = [];
  supabase.from.mockImplementation((table) => {
    if (table === 'profiles') {
      return {
        update: (payload) => {
          profileUpdates.push(payload);
          return { eq: () => Promise.resolve({ error: profilesError }) };
        },
      };
    }
    if (table === 'coach_notes') {
      return {
        insert: (row) => { coachNoteInserts.push(row); return Promise.resolve({ error: null }); },
        select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
      };
    }
    if (table === 'race_events') {
      return {
        insert: (row) => {
          raceInserts.push(row);
          return {
            select: () => ({
              single: () => Promise.resolve(
                raceError ? { data: null, error: raceError } : { data: { id: 'race-nova', ...row }, error: null },
              ),
            }),
          };
        },
      };
    }
    return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) };
  });
}

function seedStore(profile = { id: 'user-1' }) {
  useAppStore.setState({
    profile,
    session: { user: { id: 'user-1' } },
    coachNotes: [],
    raceEvents: [],
    runs: [], meals: [], gymSessions: [], bodyAssessments: [],
    activeTab: 'home',
    openCreationMode: null,
    racePrefill: null,
    onboardingOpen: false,
  });
}

const renderOnboarding = (props = {}) =>
  render(<ToastProvider><Onboarding {...props} /></ToastProvider>);

const passo = () => screen.getByTestId('onboarding').dataset.step;
const clicar = (nome) => fireEvent.click(screen.getByRole('button', { name: nome }));

/* Anda do primeiro ecrã até ao Fecho, sempre pelo botão principal de cada
   passo (os dois últimos têm nome próprio). */
function percorrerTudo() {
  clicar('Vamos a isso');        // 1 · quem é a Carol
  clicar('Continuar');           // 2 · quem és
  clicar('Continuar');           // 3 · objetivo
  clicar('Continuar');           // 4 · como corres
  clicar('Continuar');           // 5 · como comes
  clicar('Criar o meu plano');   // 6 · a tua prova
}

beforeEach(() => {
  localStorage.clear();
  supabase.from.mockReset();
  wireSupabase();
  seedStore();
});

describe('Onboarding — os seis passos', () => {
  it('percorre os 6 passos com "Continuar" e volta atrás com "Voltar"', () => {
    renderOnboarding();
    expect(passo()).toBe('carol');

    clicar('Vamos a isso');
    expect(passo()).toBe('quem-es');
    expect(screen.getByText('Diz-me quem és.')).toBeInTheDocument();

    clicar('Continuar');
    expect(passo()).toBe('objetivo');
    expect(screen.getByText('O que te traz aqui?')).toBeInTheDocument();

    clicar('Continuar');
    expect(passo()).toBe('como-corres');

    clicar('Continuar');
    expect(passo()).toBe('como-comes');

    clicar('Continuar');
    expect(passo()).toBe('prova');
    expect(screen.getByText('Para que dia treinamos?')).toBeInTheDocument();

    clicar('Criar o meu plano');
    expect(passo()).toBe('fecho');

  });

  it('"Voltar" recua um passo de cada vez', () => {
    renderOnboarding();
    clicar('Vamos a isso');
    clicar('Continuar');
    clicar('Continuar');
    expect(passo()).toBe('como-corres');

    clicar('Voltar');
    expect(passo()).toBe('objetivo');
    clicar('Voltar');
    expect(passo()).toBe('quem-es');
    clicar('Voltar');
    expect(passo()).toBe('carol');
  });

  it('cada passo traz a nota da Carol — menos o do objetivo, que no mock não a tem', () => {
    renderOnboarding();
    const comNota = { carol: true, 'quem-es': true, objetivo: false, 'como-corres': true, 'como-comes': true, prova: true, fecho: true };
    for (const nome of ['Vamos a isso', 'Continuar', 'Continuar', 'Continuar', 'Continuar', 'Criar o meu plano']) {
      expect(screen.queryAllByTestId('carol-note').length > 0).toBe(comNota[passo()]);
      clicar(nome);
    }
    expect(passo()).toBe('fecho');
    expect(screen.queryAllByTestId('carol-note').length).toBeGreaterThan(0);
  });

  it('os campos do passo 2 são <input>/<select> reais, nunca <div>', () => {
    renderOnboarding();
    clicar('Vamos a isso');
    expect(screen.getByLabelText(/Como te chamo/).tagName).toBe('INPUT');
    expect(screen.getByLabelText(/Nascimento/).tagName).toBe('INPUT');
    expect(screen.getByLabelText(/Altura/).tagName).toBe('INPUT');
    expect(screen.getByLabelText(/Peso atual/).tagName).toBe('INPUT');
    expect(screen.getByLabelText(/Sexo/).tagName).toBe('SELECT');
  });
});

describe('Onboarding — o que fica gravado', () => {
  it('as respostas do passo 2 vão para profiles e o fecho grava onboarding_done', async () => {
    renderOnboarding();
    clicar('Vamos a isso');

    fireEvent.change(screen.getByLabelText(/Como te chamo/), { target: { value: 'Rui' } });
    fireEvent.change(screen.getByLabelText(/Nascimento/), { target: { value: '1988-04-14' } });
    fireEvent.change(screen.getByLabelText(/Altura/), { target: { value: '178' } });
    fireEvent.change(screen.getByLabelText(/Peso atual/), { target: { value: '72.4' } });
    fireEvent.change(screen.getByLabelText(/Sexo/), { target: { value: 'M' } });

    clicar('Continuar');                                  // → objetivo
    clicar(/Preparar uma prova/);
    clicar('Continuar');                                  // → como corres
    clicar(/Um a três anos/);
    fireEvent.change(screen.getByLabelText(/Km por semana/), { target: { value: '38' } });
    fireEvent.change(screen.getByLabelText(/Dias por semana/), { target: { value: '5' } });
    clicar('Continuar');                                  // → como comes
    clicar('Sem lactose');
    clicar('Continuar');                                  // → a tua prova
    clicar('Ainda não tenho prova marcada');              // → fecho

    clicar('Ver o Início primeiro');

    await waitFor(() => expect(profileUpdates.length).toBeGreaterThan(0));
    const update = profileUpdates[0];
    expect(update).toMatchObject({
      display_name: 'Rui',
      birth_date: '1988-04-14',
      height_cm: 178,
      weight_kg: 72.4,
      gender: 'M',
      experience_level: 'medio',
      dietary_restrictions: ['sem_lactose'],
      onboarding_done: true,
    });

    // O store reflete o fim do arranque mesmo antes de qualquer releitura.
    expect(useAppStore.getState().profile.onboarding_done).toBe(true);
  });

  it('o objetivo e a disponibilidade vão para a Memória do Coach', async () => {
    renderOnboarding();
    clicar('Vamos a isso');
    clicar('Continuar');
    clicar(/Voltar depois de uma pausa/);
    clicar('Continuar');
    fireEvent.change(screen.getByLabelText(/Km por semana/), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText(/Dias por semana/), { target: { value: '3' } });
    clicar('Continuar');
    clicar('Continuar');
    clicar('Ainda não tenho prova marcada');
    clicar('Ver o Início primeiro');

    await waitFor(() => expect(coachNoteInserts.length).toBe(2));
    expect(coachNoteInserts[0]).toMatchObject({ category: 'objetivo_pessoal' });
    expect(coachNoteInserts[0].note).toMatch(/Voltar depois de uma pausa/);
    expect(coachNoteInserts[1]).toMatchObject({ category: 'disponibilidade' });
    expect(coachNoteInserts[1].note).toMatch(/20 km por semana, 3 dias por semana/);
  });

  it('prova do passo 6 SEM os obrigatórios todos: segue para o formulário, pré-preenchida', async () => {
    renderOnboarding();
    clicar('Vamos a isso');
    clicar('Continuar');
    clicar('Continuar');
    clicar('Continuar');
    clicar('Continuar');
    fireEvent.change(screen.getByLabelText(/Nome da prova/), { target: { value: 'Meia de Lisboa' } });
    fireEvent.change(screen.getByLabelText(/Data/), { target: { value: '2027-03-08' } });
    fireEvent.change(screen.getByLabelText(/Distância/), { target: { value: '21.1' } });
    clicar('Criar o meu plano');
    clicar('Ver o Início primeiro');

    await waitFor(() => expect(useAppStore.getState().openCreationMode).toBe('race'));
    expect(useAppStore.getState().racePrefill).toMatchObject({
      name: 'Meia de Lisboa',
      date: '2027-03-08',
      distance_km: '21.1',
      race_type: 'estrada',
    });
  });

  /* Relatado pelo utilizador: o arranque perguntava meia dúzia de campos da
     prova e depois atirava-o para o formulário de criar prova. Perguntados
     todos os obrigatórios, a prova nasce gravada e o formulário não abre. */
  it('prova do passo 6 COM os obrigatórios todos: grava-se e o formulário não abre', async () => {
    renderOnboarding();
    clicar('Vamos a isso');
    clicar('Continuar');
    clicar('Continuar');
    clicar('Continuar');
    clicar('Continuar');
    fireEvent.change(screen.getByLabelText(/Nome da prova/), { target: { value: 'Meia de Lisboa' } });
    fireEvent.change(screen.getByLabelText(/Data/), { target: { value: '2027-03-08' } });
    fireEvent.change(screen.getByLabelText(/Distância/), { target: { value: '21.1' } });
    fireEvent.change(screen.getByLabelText(/Local/), { target: { value: 'Lisboa' } });
    fireEvent.change(screen.getByLabelText(/Objetivo de tempo/), { target: { value: '1:45:00' } });
    clicar('Criar o meu plano');
    clicar('Ver o Início primeiro');

    await waitFor(() => expect(raceInserts.length).toBe(1));
    expect(raceInserts[0]).toMatchObject({
      name: 'Meia de Lisboa',
      date: '2027-03-08',
      location: 'Lisboa',
      distance_km: 21.1,
      target_time: '1:45:00',
      target_time_seconds: 6300,
      race_type: 'estrada',
    });
    /* Sem `status`, como o formulário da prova: deixa o default da coluna.
       Forçá-lo criava uma prova 'concluida' sem corrida ligada, que corta a
       sequência no Palmarés. */
    expect(raceInserts[0]).not.toHaveProperty('status');
    // 6300 s / 21,1 km = 298,58 → 299 s/km
    expect(raceInserts[0].target_pace_seconds_per_km).toBe(299);
    expect(useAppStore.getState().openCreationMode).toBeNull();
    expect(useAppStore.getState().raceEvents).toHaveLength(1);
  });

  /* Reabrir o arranque pelo Perfil restaura o rascunho com a prova ainda
     preenchida; sem dedupe, terminá-lo outra vez gravava uma segunda igual. */
  it('não grava a prova duas vezes se ela já existir com o mesmo nome e data', async () => {
    useAppStore.setState({
      raceEvents: [{ id: 'ja-existe', name: 'Meia de Lisboa', date: '2027-03-08', distance_km: 21.1 }],
    });
    renderOnboarding();
    clicar('Vamos a isso');
    clicar('Continuar');
    clicar('Continuar');
    clicar('Continuar');
    clicar('Continuar');
    fireEvent.change(screen.getByLabelText(/Nome da prova/), { target: { value: 'Meia de Lisboa' } });
    fireEvent.change(screen.getByLabelText(/Data/), { target: { value: '2027-03-08' } });
    fireEvent.change(screen.getByLabelText(/Distância/), { target: { value: '21.1' } });
    fireEvent.change(screen.getByLabelText(/Local/), { target: { value: 'Lisboa' } });
    fireEvent.change(screen.getByLabelText(/Objetivo de tempo/), { target: { value: '1:45:00' } });
    clicar('Criar o meu plano');
    clicar('Ver o Início primeiro');

    await waitFor(() => expect(profileUpdates.length).toBeGreaterThan(0));
    expect(raceInserts).toHaveLength(0);
    // E não manda o atleta para o formulário: a prova já lá está.
    expect(useAppStore.getState().openCreationMode).toBeNull();
  });

  /* Falhar a gravação não pode perder a prova: cai no formulário, como antes. */
  it('se a gravação da prova falhar, o formulário abre pré-preenchido', async () => {
    wireSupabase({ raceError: { message: 'boom' } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderOnboarding();
    clicar('Vamos a isso');
    clicar('Continuar');
    clicar('Continuar');
    clicar('Continuar');
    clicar('Continuar');
    fireEvent.change(screen.getByLabelText(/Nome da prova/), { target: { value: 'Meia de Lisboa' } });
    fireEvent.change(screen.getByLabelText(/Data/), { target: { value: '2027-03-08' } });
    fireEvent.change(screen.getByLabelText(/Distância/), { target: { value: '21.1' } });
    fireEvent.change(screen.getByLabelText(/Local/), { target: { value: 'Lisboa' } });
    fireEvent.change(screen.getByLabelText(/Objetivo de tempo/), { target: { value: '1:45:00' } });
    clicar('Criar o meu plano');
    clicar('Ver o Início primeiro');

    await waitFor(() => expect(useAppStore.getState().openCreationMode).toBe('race'));
    expect(useAppStore.getState().racePrefill).toMatchObject({ name: 'Meia de Lisboa', location: 'Lisboa', target_time: '1:45:00' });
  });

  it('sem prova declarada não abre formulário nenhum', async () => {
    renderOnboarding();
    percorrerTudo();
    clicar('Ver o Início primeiro');
    await waitFor(() => expect(profileUpdates.length).toBeGreaterThan(0));
    expect(useAppStore.getState().openCreationMode).toBeNull();
    expect(useAppStore.getState().activeTab).toBe('home');
  });

  it('"Combinar o meu plano" termina o arranque e abre o chat com a Carol a falar', async () => {
    renderOnboarding();
    percorrerTudo();
    clicar('Combinar o meu plano');
    await waitFor(() => expect(useAppStore.getState().activeTab).toBe('coach'));
    expect(useAppStore.getState().profile.onboarding_done).toBe(true);
    /* O arranque prometeu um plano: é ela que abre a conversa, não o atleta
       que tem de pedir (ver Coach/Coach.jsx, onboarding_start). */
    expect(useAppStore.getState().coachIntent).toBe('onboarding_start');
  });

  it('a coluna onboarding_done ainda não existir não perde as respostas', async () => {
    // O UPDATE inteiro falha (a coluna não existe); o store repete-o sem ela
    // e o fallback local impede o arranque de reaparecer neste dispositivo.
    wireSupabase({ profilesError: { code: '42703', message: 'column "onboarding_done" does not exist' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderOnboarding();
    clicar('Vamos a isso');
    fireEvent.change(screen.getByLabelText(/Como te chamo/), { target: { value: 'Rui' } });
    percorrerTudoAPartirDoPasso2();
    clicar('Ver o Início primeiro');

    await waitFor(() => expect(profileUpdates.length).toBe(2));
    expect(profileUpdates[0]).toHaveProperty('onboarding_done', true);
    expect(profileUpdates[1]).not.toHaveProperty('onboarding_done');
    expect(profileUpdates[1]).toMatchObject({ display_name: 'Rui' });
    expect(localStorage.getItem(onboardingLocalKey('user-1'))).toBe('1');
  });
});

function percorrerTudoAPartirDoPasso2() {
  clicar('Continuar');           // → objetivo
  clicar('Continuar');           // → como corres
  clicar('Continuar');           // → como comes
  clicar('Continuar');           // → a tua prova
  clicar('Criar o meu plano');   // → fecho
}

describe('Onboarding — reentrada pelo Perfil', () => {
  it('preenche os campos a partir do perfil e da Memória do Coach', () => {
    seedStore({
      id: 'user-1',
      display_name: 'Rui',
      birth_date: '1988-04-14',
      height_cm: 178,
      weight_kg: 72.4,
      gender: 'M',
      experience_level: 'avancado',
      dietary_restrictions: ['sem_gluten'],
      dietary_notes: 'frutos secos',
    });
    useAppStore.setState({
      coachNotes: [
        { id: 'n1', category: 'objetivo_pessoal', note: 'Correr mais rápido — sem prova, foco em ritmo.' },
        { id: 'n2', category: 'disponibilidade', note: 'No arranque declarou 38 km por semana, 5 dias por semana.' },
      ],
    });

    renderOnboarding({ reentry: true });
    clicar('Vamos a isso');

    expect(screen.getByLabelText(/Como te chamo/)).toHaveValue('Rui');
    expect(screen.getByLabelText(/Nascimento/)).toHaveValue('1988-04-14');
    expect(screen.getByLabelText(/Altura/)).toHaveValue(178);
    expect(screen.getByLabelText(/Peso atual/)).toHaveValue(72.4);
    expect(screen.getByLabelText(/Sexo/)).toHaveValue('M');

    clicar('Continuar');
    expect(screen.getByRole('button', { name: /Correr mais rápido/ })).toHaveAttribute('aria-pressed', 'true');

    clicar('Continuar');
    expect(screen.getByRole('button', { name: /Mais de três anos/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/Km por semana/)).toHaveValue(38);
    expect(screen.getByLabelText(/Dias por semana/)).toHaveValue(5);

    clicar('Continuar');
    expect(screen.getByRole('button', { name: 'Sem glúten' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/Alergias/)).toHaveValue('frutos secos');
  });

  it('na reentrada o primeiro passo tem "Voltar", que fecha o arranque', () => {
    const onDone = vi.fn();
    renderOnboarding({ reentry: true, onDone });
    clicar('Voltar');
    expect(onDone).toHaveBeenCalled();
  });

  it('no primeiro acesso o primeiro passo não tem "Voltar"', () => {
    renderOnboarding();
    expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull();
  });

  it('a prova já marcada volta a aparecer no passo 6', () => {
    useAppStore.setState({
      raceEvents: [{ id: 'r1', name: 'Meia de Lisboa', date: '2099-03-08', distance_km: 21.1, race_type: 'trail' }],
    });
    renderOnboarding({ reentry: true });
    clicar('Vamos a isso');
    clicar('Continuar');
    clicar('Continuar');
    clicar('Continuar');
    clicar('Continuar');
    expect(screen.getByLabelText(/Nome da prova/)).toHaveValue('Meia de Lisboa');
    expect(screen.getByRole('button', { name: 'Trail' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Onboarding — regra de arranque', () => {
  const semNada = { runs: [], meals: [], gymSessions: [], bodyAssessments: [], raceEvents: [] };

  it('mostra-se a quem não tem registo nenhum nem prova', () => {
    expect(shouldShowOnboarding({ profile: { id: 'u', onboarding_done: false }, ...semNada })).toBe(true);
    // Coluna ainda não existente na BD conta como "por fazer".
    expect(shouldShowOnboarding({ profile: { id: 'u' }, ...semNada })).toBe(true);
  });

  it('NÃO se mostra a quem já tem registos, mesmo sem onboarding_done', () => {
    const comRegistos = { ...semNada, runs: [{ id: 'r', date: '2026-09-01' }] };
    expect(shouldShowOnboarding({ profile: { id: 'u', onboarding_done: false }, ...comRegistos })).toBe(false);
    expect(shouldSilentlyMarkDone({ profile: { id: 'u', onboarding_done: false }, ...comRegistos })).toBe(true);
  });

  it('NÃO se mostra a quem já tem prova marcada', () => {
    const comProva = { ...semNada, raceEvents: [{ id: 'p', date: '2099-01-01' }] };
    expect(shouldShowOnboarding({ profile: { id: 'u', onboarding_done: false }, ...comProva })).toBe(false);
    expect(shouldSilentlyMarkDone({ profile: { id: 'u', onboarding_done: false }, ...comProva })).toBe(true);
  });

  it('NÃO se mostra depois de concluído — nem pela coluna nem pelo fallback local', () => {
    expect(shouldShowOnboarding({ profile: { id: 'u', onboarding_done: true }, ...semNada })).toBe(false);
    localStorage.setItem(onboardingLocalKey('u'), '1');
    expect(shouldShowOnboarding({ profile: { id: 'u', onboarding_done: false }, ...semNada })).toBe(false);
  });

  it('sem perfil carregado não decide nada', () => {
    expect(shouldShowOnboarding({ profile: null, ...semNada })).toBe(false);
    expect(shouldSilentlyMarkDone({ profile: null, ...semNada })).toBe(false);
  });
});

/* Auditoria a11y (passagem "harden"): a barra de seis segmentos é a única
   indicação de onde se está nos passos. Sem semântica de progressbar,
   quem ouve o ecrã não tem nada. */
describe('Onboarding — progresso anunciado', () => {
  it('a barra é um progressbar que diz o passo em que se está', () => {
    renderOnboarding();
    clicar('Vamos a isso');
    const barra = screen.getByRole('progressbar');
    expect(barra).toHaveAttribute('aria-valuenow', '2');
    expect(barra).toHaveAttribute('aria-valuemax', '6');
    expect(barra).toHaveAttribute('aria-valuetext', 'Passo 2 de 6');
  });
});

describe('Onboarding — a Carol responde', () => {
  it('trata o atleta pelo nome a partir do passo 3 e no fecho', () => {
    renderOnboarding();
    clicar('Vamos a isso');
    fireEvent.change(screen.getByLabelText(/Como te chamo/), { target: { value: 'Rui Mariano' } });
    clicar('Continuar');
    expect(screen.getByText('O que te traz aqui, Rui?')).toBeInTheDocument();
    clicar('Continuar');
    clicar('Continuar');
    clicar('Continuar');
    clicar('Ainda não tenho prova marcada');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Está feito, Rui.');
  });

  it('a nota do passo passa a ser a resposta dela à escolha', () => {
    renderOnboarding();
    clicar('Vamos a isso');
    clicar('Continuar');
    expect(screen.queryByTestId('carol-note')).not.toBeInTheDocument();
    clicar(/Voltar depois de uma pausa/);
    const nota = screen.getByTestId('carol-note');
    expect(nota).toHaveTextContent(/as pernas não/);
    expect(nota).toHaveAttribute('data-reacting', 'true');
    // Desfazer a escolha cala-a outra vez.
    clicar(/Voltar depois de uma pausa/);
    expect(screen.queryByTestId('carol-note')).not.toBeInTheDocument();
  });

  it('com prova marcada, o fecho desenha as semanas até lá, uma a uma', () => {
    renderOnboarding();
    clicar('Vamos a isso');
    clicar('Continuar');
    clicar('Continuar');
    clicar('Continuar');
    clicar('Continuar');
    const d = new Date();
    d.setDate(d.getDate() + 7 * 12 + 2);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    fireEvent.change(screen.getByLabelText(/Nome da prova/), { target: { value: 'Maratona do Porto' } });
    fireEvent.change(screen.getByLabelText(/^Data/), { target: { value: iso } });
    fireEvent.change(screen.getByLabelText(/Distância/), { target: { value: '42.2' } });
    clicar('Criar o meu plano');
    const semanas = screen.getByTestId('onboarding-semanas');
    expect(semanas).toHaveAttribute('aria-label', '12 semanas até Maratona do Porto');
    expect(semanas.querySelectorAll('.onb-week')).toHaveLength(12);
    expect(semanas.querySelectorAll('.onb-week-race')).toHaveLength(1);
  });

  it('sem prova, o fecho não desenha semanas', () => {
    renderOnboarding();
    percorrerTudo();
    expect(screen.queryByTestId('onboarding-semanas')).not.toBeInTheDocument();
  });

  it('prova a menos de uma semana, ainda sem nome: não diz "0 semanas até lá"', () => {
    renderOnboarding();
    clicar('Vamos a isso');
    clicar('Continuar');
    clicar('Continuar');
    fireEvent.change(screen.getByLabelText(/Km por semana/), { target: { value: '30' } });
    clicar('Continuar');
    clicar('Continuar');
    const d = new Date();
    d.setDate(d.getDate() + 5);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    fireEvent.change(screen.getByLabelText(/^Data/), { target: { value: iso } });
    const nota = screen.getByTestId('carol-note');
    expect(nota).toHaveTextContent('É já esta semana. Não há plano que caiba; preparo-te a véspera e o dia.');
    expect(nota).not.toHaveTextContent(/0 semanas/);
  });

  it('na reentrada com a prova já marcada, o objetivo não promete perguntar a data', () => {
    useAppStore.setState({
      coachNotes: [{ id: 'n1', category: 'objetivo_pessoal', note: 'Preparar uma prova — estrada ou trail, com data marcada.' }],
      raceEvents: [{ id: 'r1', name: 'Meia de Lisboa', date: '2099-03-08', distance_km: 21.1, race_type: 'estrada' }],
    });
    renderOnboarding({ reentry: true });
    clicar('Vamos a isso');
    clicar('Continuar');
    const nota = screen.getByTestId('carol-note');
    expect(nota).toHaveTextContent('Com a prova marcada, cada semana tem uma função. Daqui a três passos confirmamos a data.');
    expect(nota).not.toHaveTextContent(/pergunto-te/);
  });
});
