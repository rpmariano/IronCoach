import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAppStore } from '../../store';
import { ToastProvider } from '../shared/ToastProvider';
import CupMatchPrompt, { CupStandingPrompt, MATCH_ISSUE_TEXT, perguntaDe, perguntaGeralDe } from './CupMatchPrompt';

/* "És tu?" — a 1.ª correspondência de cada edição com a classificação
   oficial (specs/trofeu.md §7, Fase 4, 2026-09-27). O texto é só a linha
   DELE (lugar no escalão e tempo); "Não sou eu" pede confirmação antes de
   apagar; e nunca aparece um nome, um dorsal ou um clube — nem se, por
   engano, a linha os trouxesse. Os nomes, dorsais e clubes daqui são
   inventados. */

const REAL = useAppStore.getState();

const ROUND = {
  id: 'r-c1', round_no: 1, name: 'Padroeira', chip: 'J1', date: '2026-12-06',
  proposal: {
    round_id: 'r-c1', position: 120, category_code: 'M40', category_position: 41, points: 5,
    official_time_s: 2172, match_status: 'proposta', points_source: 'calculado',
    // Campos espúrios que a leitura nunca pede — se aparecerem no ecrã, é fuga.
    name: 'Terceiro Sintético Inventado', bib: '9042', club: 'Clube Inventado de Fora 07', bib_key: 'abc123', match_hash: 'def456',
  },
};

const montar = (props = {}) => render(<ToastProvider><CupMatchPrompt round={ROUND} {...props} /></ToastProvider>);

describe('CupMatchPrompt', () => {
  let confirmCupResult;
  let rejectCupResult;

  beforeEach(() => {
    confirmCupResult = vi.fn().mockResolvedValue({ ok: true, data: { round_id: 'r-c1', match_status: 'confirmada' } });
    rejectCupResult = vi.fn().mockResolvedValue({ ok: true, data: { round_id: 'r-c1', rejected: true } });
    useAppStore.setState({ confirmCupResult, rejectCupResult });
  });

  afterEach(() => {
    useAppStore.setState({ confirmCupResult: REAL.confirmCupResult, rejectCupResult: REAL.rejectCupResult });
  });

  it('proposta: "És tu?", a linha dele (lugar no escalão e tempo, sem pontos) e o porquê', () => {
    montar();
    const sec = screen.getByRole('region', { name: 'És tu?' });
    expect(sec).toBe(screen.getByTestId('cup-match'));
    expect(screen.getByTestId('cup-match-linha')).toHaveTextContent('J1 · Padroeira: 41.º no escalão M40, 36:12.');
    expect(sec).toHaveTextContent('Encontrámos esta linha pelo teu dorsal na classificação oficial. Confirma só se fores tu — as seguintes ligam-se sozinhas enquanto o escalão e o clube baterem.');
    expect(sec).not.toHaveTextContent(/ponto/);
    expect(screen.queryByTestId('cup-match-mais')).not.toBeInTheDocument();
  });

  it('perdida com dados: "A tua linha mudou" e "Continua a ser tu?"', () => {
    const perdida = { ...ROUND, id: 'r-c3', chip: 'J3', name: 'CCD', proposal: { ...ROUND.proposal, match_status: 'perdida', category_position: 40, official_time_s: 2170 } };
    render(<ToastProvider><CupMatchPrompt round={perdida} /></ToastProvider>);
    expect(screen.getByRole('region', { name: 'A tua linha mudou' })).toBeInTheDocument();
    expect(screen.getByTestId('cup-match-linha')).toHaveTextContent('J3 · CCD: agora 40.º no escalão M40, 36:10. Continua a ser tu?');
    expect(perguntaDe(perdida)).toMatchObject({ titulo: 'A tua linha mudou', perdida: true });
  });

  it('sem proposta, nada', () => {
    const { container } = render(<ToastProvider><CupMatchPrompt round={{ ...ROUND, proposal: null }} /></ToastProvider>);
    expect(container.querySelector('[data-testid="cup-match"]')).toBeNull();
    expect(perguntaDe(null)).toBeNull();
  });

  it('"e mais N por confirmar"', () => {
    montar({ more: 2 });
    expect(screen.getByTestId('cup-match-mais')).toHaveTextContent('E mais 2 por confirmar.');
  });

  it('a11y: a secção tem o título; os dois botões descrevem-se pela linha e têm 44 px', () => {
    montar({ idPrefix: 'cup-match-x' });
    const sec = screen.getByTestId('cup-match');
    expect(sec.getAttribute('aria-labelledby')).toBe('cup-match-x-titulo');
    expect(document.getElementById('cup-match-x-titulo').tagName).toBe('H2');
    for (const id of ['cup-match-sim', 'cup-match-nao']) {
      const b = screen.getByTestId(id);
      expect(b.getAttribute('aria-describedby')).toBe('cup-match-x-linha');
      expect(b).toHaveAccessibleDescription('J1 · Padroeira: 41.º no escalão M40, 36:12.');
      expect(parseInt(b.style.minHeight, 10)).toBe(44);
    }
  });

  it('"Sim, sou eu" confirma esta jornada e chama onConfirmed', async () => {
    const onConfirmed = vi.fn();
    montar({ onConfirmed });
    fireEvent.click(screen.getByTestId('cup-match-sim'));
    // Ocupado: a secção diz-o e os botões desativam-se.
    expect(screen.getByTestId('cup-match').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByTestId('cup-match-nao')).toBeDisabled();
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
    expect(confirmCupResult).toHaveBeenCalledWith('r-c1');
    expect(rejectCupResult).not.toHaveBeenCalled();
    expect(await screen.findByText('Resultado confirmado.')).toBeInTheDocument();
  });

  it('"Não sou eu" abre o diálogo; só o botão do diálogo recusa, e chama onRejected', async () => {
    const onRejected = vi.fn();
    montar({ onRejected });
    fireEvent.click(screen.getByTestId('cup-match-nao'));
    const dialog = screen.getByTestId('cup-match-nao-dialog');
    expect(dialog).toHaveTextContent('Não és tu?');
    expect(rejectCupResult).not.toHaveBeenCalled();
    // Cancelar não apaga nada.
    fireEvent.click(screen.getByText('Cancelar'));
    await waitFor(() => expect(screen.queryByTestId('cup-match-nao-dialog')).not.toBeInTheDocument());
    expect(rejectCupResult).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('cup-match-nao'));
    fireEvent.click(screen.getByTestId('cup-match-nao-confirmar'));
    await waitFor(() => expect(onRejected).toHaveBeenCalled());
    expect(rejectCupResult).toHaveBeenCalledWith('r-c1');
    expect(confirmCupResult).not.toHaveBeenCalled();
    expect(await screen.findByText('Apagado. Revê o dorsal em «Gerir inscrição».')).toBeInTheDocument();
  });

  it('um erro do servidor: a frase dele num aviso, e nada mais acontece', async () => {
    confirmCupResult.mockResolvedValue({ ok: false, error: { code: 'P0002', message: 'Não há nada para confirmar nesta jornada' }, unavailable: false });
    const onConfirmed = vi.fn();
    montar({ onConfirmed });
    fireEvent.click(screen.getByTestId('cup-match-sim'));
    expect(await screen.findByText('Não há nada para confirmar nesta jornada')).toBeInTheDocument();
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(screen.getByTestId('cup-match-sim')).not.toBeDisabled();
  });

  it('privacidade: nunca um nome, um dorsal, um clube ou uma chave — nem os que viessem por engano na linha', () => {
    montar({ more: 1 });
    fireEvent.click(screen.getByTestId('cup-match-nao'));
    const text = document.body.textContent;
    for (const t of ['Terceiro', 'Sintético', 'Inventado', '9042', 'Clube', 'abc123', 'def456']) expect(text).not.toContain(t);
    expect(document.body.innerHTML).not.toMatch(/9042|abc123|def456|Terceiro/);
  });

  it('as frases de falha: uma só para todas as falhas, outra para a falta de dorsal', () => {
    expect(MATCH_ISSUE_TEXT).toEqual({
      rever_dorsal: 'Não consegui confirmar. Revê o dorsal ou fala com o suporte.',
      sem_dorsal: 'Sem dorsal não consigo ler o teu resultado oficial. Junta-o em «Gerir inscrição».',
    });
  });
});

/* A geral pela chave alternativa (tarefa 9, 2026-09-27): quando o nome
   inteiro não acha a linha dele na geral, o job tenta o 1.º e o último nome
   e deixa-a por confirmar. Pergunta-se só com o lugar no escalão e o total
   ("És tu? 12.º M40 na geral · 43 pontos."), com a mesma acessibilidade da
   pergunta das jornadas. Nomes e chaves daqui são inventados. */
describe('CupStandingPrompt — "És tu?" da classificação geral', () => {
  const STANDING = {
    category_code: 'M40', category_rank: 12, total_points: 43, rounds_scored: 4, match_status: 'proposta',
    source_checked_at: '2027-01-12T10:00:00Z',
    // Espúrios que a leitura nunca pede — se aparecerem, é fuga.
    name: 'Terceiro Sintético Inventado', key_hash: 'abc123', team: 'Clube Inventado de Fora 07',
  };
  let confirmCupStanding;
  let rejectCupStanding;
  const montarGeral = (props = {}) =>
    render(<ToastProvider><CupStandingPrompt standing={STANDING} enrollmentId="enr1" idPrefix="cup-geral-x" {...props} /></ToastProvider>);

  beforeEach(() => {
    confirmCupStanding = vi.fn().mockResolvedValue({ ok: true, data: { enrollment_id: 'enr1', match_status: 'confirmada' } });
    rejectCupStanding = vi.fn().mockResolvedValue({ ok: true, data: { enrollment_id: 'enr1', rejected: true } });
    useAppStore.setState({ confirmCupStanding, rejectCupStanding });
  });

  afterEach(() => {
    useAppStore.setState({ confirmCupStanding: REAL.confirmCupStanding, rejectCupStanding: REAL.rejectCupStanding });
  });

  it('a pergunta: "És tu?" com o lugar no escalão e o total da geral — e o porquê', () => {
    montarGeral();
    const sec = screen.getByRole('region', { name: 'És tu?' });
    expect(sec).toBe(screen.getByTestId('cup-match-geral'));
    expect(screen.getByTestId('cup-match-geral-linha')).toHaveTextContent('12.º M40 na geral · 43 pontos.');
    expect(sec).toHaveTextContent('com o nome escrito de outra forma');
    expect(sec).toHaveTextContent('até lá, os pontos das jornadas ficam provisórios');
    expect(perguntaGeralDe(STANDING)).toEqual({ titulo: 'És tu?', linha: '12.º M40 na geral · 43 pontos.' });
  });

  it('só uma proposta pergunta: confirmada, sem lugar ou sem inscrição, nada', () => {
    expect(perguntaGeralDe({ ...STANDING, match_status: 'confirmada' })).toBeNull();
    expect(perguntaGeralDe({ ...STANDING, category_rank: null })).toBeNull();
    expect(perguntaGeralDe(null)).toBeNull();
    const { container } = render(<ToastProvider><CupStandingPrompt standing={STANDING} enrollmentId={null} /></ToastProvider>);
    expect(container.querySelector('[data-testid="cup-match-geral"]')).toBeNull();
  });

  it('a11y como a das jornadas: título h2, os dois botões descrevem-se pela linha e têm 44 px', () => {
    montarGeral();
    const sec = screen.getByTestId('cup-match-geral');
    expect(sec.getAttribute('aria-labelledby')).toBe('cup-geral-x-titulo');
    expect(document.getElementById('cup-geral-x-titulo').tagName).toBe('H2');
    for (const id of ['cup-match-geral-sim', 'cup-match-geral-nao']) {
      const b = screen.getByTestId(id);
      expect(b).toHaveAccessibleDescription('12.º M40 na geral · 43 pontos.');
      expect(parseInt(b.style.minHeight, 10)).toBe(44);
    }
  });

  it('"Sim, sou eu" confirma a geral desta inscrição e chama onConfirmed', async () => {
    const onConfirmed = vi.fn();
    montarGeral({ onConfirmed });
    fireEvent.click(screen.getByTestId('cup-match-geral-sim'));
    expect(screen.getByTestId('cup-match-geral').getAttribute('aria-busy')).toBe('true');
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
    expect(confirmCupStanding).toHaveBeenCalledWith('enr1');
    expect(rejectCupStanding).not.toHaveBeenCalled();
    expect(await screen.findByText('Classificação geral confirmada.')).toBeInTheDocument();
  });

  it('"Não sou eu" pede confirmação; só o botão do diálogo recusa (e não volta a ser proposta)', async () => {
    const onRejected = vi.fn();
    montarGeral({ onRejected });
    fireEvent.click(screen.getByTestId('cup-match-geral-nao'));
    const dialog = screen.getByTestId('cup-match-geral-nao-dialog');
    expect(dialog).toHaveTextContent('Apagamos esta linha da classificação geral e não a voltamos a propor.');
    expect(rejectCupStanding).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('cup-match-geral-nao-confirmar'));
    await waitFor(() => expect(onRejected).toHaveBeenCalled());
    expect(rejectCupStanding).toHaveBeenCalledWith('enr1');
    expect(confirmCupStanding).not.toHaveBeenCalled();
  });

  it('privacidade: nunca um nome, um clube ou uma chave — nem os que viessem por engano', () => {
    montarGeral();
    fireEvent.click(screen.getByTestId('cup-match-geral-nao'));
    const text = document.body.textContent;
    for (const t of ['Terceiro', 'Sintético', 'Inventado', 'abc123', 'Clube']) expect(text).not.toContain(t);
  });
});
