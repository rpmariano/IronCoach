import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import OndeEstasScreen from './OndeEstasScreen';

/* "Onde estás": o percentil, o estado de segmento pequeno, e a regra que
   segura o ecrã todo — sem consentimento não há número nenhum, e o
   denominador diz-se sempre. */

const FRONTEIRAS = Array.from({ length: 19 }, (_, i) => (i + 1) * 5);

let linhas = [];

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: linhas, error: null }) }),
        }),
      }),
    }),
  },
}));

const SNAPSHOT = {
  metric: 'plan_execution', age_band: 'M40', gender: 'M', terrain: 'estrada',
  window_start: '2026-08-31', window_end: '2026-09-14',
  n_band: '50-199', boundaries: FRONTEIRAS, computed_at: '2026-09-14T03:00:00Z',
};

// A prova é sempre daqui a 60 dias: a modalidade do segmento sai da prova que
// o atleta tem à frente, e uma data fixa no ficheiro deixava de estar à frente.
const DAQUI_A_60_DIAS = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);

/* Um atleta M40 (nascido em 1984) que prepara uma prova de estrada, com um
   plano de 14 dias cumprido só a meio — o índice sai do mesmo cálculo que o
   servidor faz, por isso o teste dá-lhe dados reais e não um número à mão. */
const perfilBase = {
  id: 'u1', display_name: 'Rui M.', gender: 'M', birth_date: '1984-05-10',
  stats_pool_consent_at: '2026-09-01T10:00:00Z',
};

function semear(extra = {}) {
  useAppStore.setState({
    profile: { ...perfilBase, ...(extra.profile || {}) },
    raceEvents: extra.raceEvents ?? [{ id: 'r1', date: DAQUI_A_60_DIAS, race_type: 'estrada' }],
    coachPlanItems: [
      { planned_date: '2026-09-01', kind: 'corrida', target_distance_km: 10 },
      { planned_date: '2026-09-02', kind: 'corrida', target_distance_km: 10 },
    ],
    runs: [{ id: 'run1', date: '2026-09-01', distance_km: 10 }],
    gymSessions: [],
  });
}

describe('OndeEstasScreen', () => {
  beforeEach(() => {
    linhas = [SNAPSHOT];
    semear();
  });

  it('sem consentimento não mostra percentil nenhum — mostra a decisão', async () => {
    semear({ profile: { stats_pool_consent_at: null } });
    const onOpenTabelas = vi.fn();
    render(<OndeEstasScreen onClose={() => {}} onOpenTabelas={onOpenTabelas} />);
    expect(screen.getByTestId('onde-estas-sem-consentimento')).toHaveTextContent('Ainda não entraste na média');
    expect(screen.queryByTestId('onde-estas-numero')).toBeNull();
    fireEvent.click(screen.getByText('Ver o que isso implica'));
    expect(onOpenTabelas).toHaveBeenCalled();
  });

  it('mostra o percentil, a frase com o denominador por extenso e a banda do n — nunca o n', async () => {
    render(<OndeEstasScreen onClose={() => {}} onOpenTabelas={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('onde-estas-percentil')).toBeInTheDocument());
    // 1 cumprido + 1 falhado = índice 50 → passa 10 das 19 fronteiras.
    expect(screen.getByTestId('onde-estas-numero')).toHaveTextContent('50');
    expect(screen.getByTestId('onde-estas-percentil'))
      .toHaveTextContent('dos atletas M40 que preparam provas de estrada');
    expect(screen.getByTestId('onde-estas-n-band')).toHaveTextContent('entre 50 e 199 atletas neste segmento');
    expect(screen.getByTestId('onde-estas-n-band').textContent).not.toMatch(/\b(50|199) atletas exatos\b/);
    expect(screen.getByTestId('onde-estas-como-se-le')).toHaveTextContent('Os 10% do topo');
  });

  it('nada publicado: diz que ainda nenhum segmento chegou lá, sem oferecer grupos que também estão vazios', async () => {
    linhas = [];
    render(<OndeEstasScreen onClose={() => {}} onOpenTabelas={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('onde-estas-sem-publicacoes')).toBeInTheDocument());
    expect(screen.getByTestId('onde-estas-sem-publicacoes')).toHaveTextContent('Ainda não há distribuições publicadas');
    expect(screen.getByTestId('onde-estas-sem-publicacoes')).toHaveTextContent('o escalão M40, em estrada');
    expect(screen.queryByTestId('onde-estas-alargar-modalidade')).toBeNull();
  });

  /* Relatado a 2026-09-25: «quando seleciono um card, outro aparece no lugar
     dele». As opções recentravam-se no grupo que se estava a ver. */
  it('segmento pequeno: só oferece grupos com dados, diz os outros numa linha, e a lista não se mexe', async () => {
    const TRAIL = { ...SNAPSHOT, terrain: 'trail' };
    linhas = [TRAIL];
    render(<OndeEstasScreen onClose={() => {}} onOpenTabelas={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('onde-estas-segmento-pequeno')).toBeInTheDocument());
    const pequeno = screen.getByTestId('onde-estas-segmento-pequeno');
    expect(pequeno).toHaveTextContent('O teu segmento ainda é pequeno');
    expect(pequeno).toHaveTextContent('para o escalão M40, em estrada');
    expect(pequeno).toHaveTextContent('20 atletas ou mais');
    expect(screen.getByTestId('onde-estas-alargar-modalidade')).toHaveTextContent('Quem prepara provas de trail');
    // Os que não têm distribuição não são cartões — são ditos, e não levam a lado nenhum.
    expect(screen.queryByTestId('onde-estas-alargar-escalao')).toBeNull();
    expect(screen.queryByTestId('onde-estas-alargar-genero')).toBeNull();
    expect(screen.getByTestId('onde-estas-sem-dados')).toHaveTextContent('Ainda sem dados: o escalão M35, o escalão M45 e o escalão F40.');

    // Tocar mostra o percentil desse grupo, e diz que não é o dele.
    fireEvent.click(screen.getByTestId('onde-estas-alargar-modalidade'));
    await waitFor(() => expect(screen.getByTestId('onde-estas-percentil')).toBeInTheDocument());
    expect(screen.getByTestId('onde-estas-outro-grupo')).toHaveTextContent('o escalão M40, em trail — não é o teu escalão');

    // Voltar dá o mesmo ecrã de antes, com a mesma lista.
    fireEvent.click(screen.getByTestId('onde-estas-voltar-meu'));
    await waitFor(() => expect(screen.getByTestId('onde-estas-segmento-pequeno')).toBeInTheDocument());
    expect(screen.getByTestId('onde-estas-alargar-modalidade')).toHaveTextContent('Quem prepara provas de trail');
    expect(screen.queryByTestId('onde-estas-outro-grupo')).toBeNull();
  });

  it('noutro escalão sem dados, as opções continuam a partir do escalão do atleta, não do que está a ver', async () => {
    render(<OndeEstasScreen onClose={() => {}} onOpenTabelas={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('onde-estas-percentil')).toBeInTheDocument());
    expect(screen.queryByTestId('onde-estas-outro-grupo')).toBeNull();
    fireEvent.click(screen.getByTestId('onde-estas-seletor-escalao'));
    fireEvent.click(screen.getByText('M50+'));
    await waitFor(() => expect(screen.getByTestId('onde-estas-segmento-pequeno')).toBeInTheDocument());
    expect(screen.getByTestId('onde-estas-segmento-pequeno')).toHaveTextContent('Este segmento ainda é pequeno');
    // M35 é vizinho do M40 dele — do M50+ não era.
    expect(screen.getByTestId('onde-estas-sem-dados')).toHaveTextContent('o escalão M35');
    fireEvent.click(screen.getByTestId('onde-estas-voltar-meu'));
    await waitFor(() => expect(screen.getByTestId('onde-estas-percentil')).toBeInTheDocument());
  });

  it('o cabeçalho volta para a Vitrina, de onde o ecrã se abre', () => {
    render(<OndeEstasScreen onClose={() => {}} onOpenTabelas={() => {}} />);
    expect(screen.getByLabelText('Voltar à Vitrina')).toBeInTheDocument();
    expect(screen.getByTestId('onde-estas-screen')).not.toHaveTextContent('Palmarés');
  });

  it('com uma métrica só, não há seletor (parecia um botão sem função)', async () => {
    render(<OndeEstasScreen onClose={() => {}} onOpenTabelas={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('onde-estas-percentil')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Plano/ })).toBeNull();
  });

  it('"As tabelas com nomes" leva o segmento e a quinzena que se estão a ver', async () => {
    const onOpenTabelas = vi.fn();
    render(<OndeEstasScreen onClose={() => {}} onOpenTabelas={onOpenTabelas} />);
    await waitFor(() => expect(screen.getByTestId('onde-estas-percentil')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('onde-estas-ver-tabelas'));
    expect(onOpenTabelas).toHaveBeenCalledWith({ ageBand: 'M40', gender: 'M', terrain: 'estrada' }, '2026-08-31', '2026-09-14');
  });

  it('sem escalão possível não se compara nada, e diz-se o que falta', async () => {
    semear({ profile: { birth_date: null }, raceEvents: [] });
    render(<OndeEstasScreen onClose={() => {}} onOpenTabelas={() => {}} />);
    expect(screen.getByTestId('onde-estas-screen')).toHaveTextContent('Falta saber o teu segmento');
  });
});
