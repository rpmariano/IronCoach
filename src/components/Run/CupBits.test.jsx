import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CupStatus, CupPrevisao, JornadaChip, CupNaoFuiDialog, provaDoAtleta } from './CupBits';
import { cupRoundStatus } from '../../utils/cupCalendar';

/* As peças pequenas do calendário do Troféu (specs/trofeu.md §4.3, Fase 3,
   2026-09-27): o estado vai sempre em texto com o ícone escondido do leitor
   de ecrã; a previsão diz que é calculada; o chip lê-se "Jornada 3". */

const ROUND = { id: 'r3', round_no: 3, name: 'Corrida CCD', date: '2027-01-24', date_status: 'confirmada', participation: { decision: 'vou' }, intent: 'controlar' };

describe('CupStatus', () => {
  it('ícone + texto + detalhe; o ícone é aria-hidden (o texto já diz o estado)', () => {
    const status = cupRoundStatus(ROUND, { today: '2027-01-20', nextRoundId: 'r3', roundLabel: 'Jornada' });
    const { container } = render(<CupStatus status={status} />);
    expect(container.textContent).toBe('▸Próxima · Vou · controlar · daqui a 4 dias');
    const icon = screen.getByText('▸');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('Próxima')).toBeTruthy();
    expect(screen.getByTestId('cup-status').getAttribute('data-status')).toBe('proxima');
  });

  it('sem detalhe quando se pede; nada sem estado', () => {
    const status = cupRoundStatus({ ...ROUND, id: 'r4' }, { today: '2027-01-20', nextRoundId: 'r3', roundLabel: 'Jornada' });
    const { container } = render(<CupStatus status={status} showDetail={false} />);
    expect(container.textContent).toBe('✓Vou');
    const empty = render(<CupStatus status={null} />);
    expect(empty.container.innerHTML).toBe('');
  });
});

describe('CupPrevisao', () => {
  it('o ícone de cálculo (escondido), "previsão calculada" para o leitor de ecrã, e o aviso de que não se grava', () => {
    render(<CupPrevisao label="36:40" />);
    const el = screen.getByTestId('cup-previsao');
    expect(el.textContent).toBe('previsão calculada: 36:40');
    expect(el.getAttribute('title')).toBe('Previsão calculada pelo teu treino — não fica gravada');
    expect(el.querySelector('.sr-only').textContent).toBe('previsão calculada: ');
    expect(el.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
  });

  it('sem previsão, nada', () => {
    const { container } = render(<CupPrevisao label={null} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('JornadaChip', () => {
  it('"J3" à vista (aria-hidden) e "Jornada 3" para o leitor de ecrã', () => {
    render(<JornadaChip chip="J3" roundNo={3} roundLabel="Jornada" />);
    const chip = screen.getByTestId('cup-jornada-chip');
    expect(screen.getByText('J3').getAttribute('aria-hidden')).toBe('true');
    expect(chip.querySelector('.sr-only').textContent).toBe('Jornada 3');
  });
});

describe('CupNaoFuiDialog', () => {
  it('título, o nome e a data, o que acontece, e dois botões: "Não fui" e "Cancelar"', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<CupNaoFuiDialog round={{ ...ROUND, round_no: 2, name: 'Corta-mato do NAZA', date: '2027-01-10' }} roundLabel="Jornada" onConfirm={onConfirm} onClose={onClose} />);
    const dialog = screen.getByTestId('cup-nao-fui-dialog');
    expect(dialog.getAttribute('aria-label')).toBe('Não foste à jornada 2?');
    expect(dialog.textContent).toContain('Corta-mato do NAZA · domingo, 10 de janeiro');
    expect(dialog.textContent).toContain('A prova sai das tuas provas e a jornada fica como «Não fui». Se afinal correste, usa «Registar».');
    const buttons = [...dialog.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean);
    expect(buttons).toEqual(['Não fui', 'Cancelar']);
    fireEvent.click(screen.getByTestId('cup-nao-fui-confirmar'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  /* Revisão da Fase 3: numa prova que o atleta já tinha e que a
     sincronização ligou à jornada (cup_link_origin), cup_release_race (M1)
     não a apaga — desliga-a e repõe-na como era. O diálogo prometia
     "A prova sai das tuas provas" e ela voltava a aparecer em "Por
     registar". */
  it('prova dele ligada pela sincronização: não promete apagá-la — diz que volta a ser uma prova normal', () => {
    const ligada = { ...ROUND, round_no: 2, name: 'Corta-mato do NAZA', date: '2027-01-10', race: { id: 'x2', cup_round_id: 'r2', cup_link_origin: { date: '2027-01-10', location: 'Oeiras', distance_km: 8 } } };
    render(<CupNaoFuiDialog round={ligada} roundLabel="Jornada" onConfirm={() => {}} onClose={() => {}} />);
    const texto = screen.getByTestId('cup-nao-fui-texto').textContent;
    expect(texto).toBe('A jornada fica como «Não fui». A prova já era tua antes da jornada: não se apaga, volta a ser uma prova normal (podes apagá-la no hub dela). Se afinal correste, usa «Registar».');
    expect(texto).not.toContain('sai das tuas provas');
  });

  it('provaDoAtleta: só com cup_link_origin preenchido (a criada pela sincronização tem-no a null)', () => {
    expect(provaDoAtleta({ race: { cup_link_origin: { date: '2027-01-10' } } })).toBe(true);
    expect(provaDoAtleta({ race: { cup_link_origin: null } })).toBe(false);
    expect(provaDoAtleta({ race: {} })).toBe(false);
    expect(provaDoAtleta({ race: null })).toBe(false);
    expect(provaDoAtleta(null)).toBe(false);
  });

  it('a gravar: "Não fui" ocupado e "Cancelar" desligado (não se grava duas vezes)', () => {
    render(<CupNaoFuiDialog round={ROUND} busy onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId('cup-nao-fui-confirmar').disabled).toBe(true);
    expect(screen.getByTestId('cup-nao-fui-cancelar').disabled).toBe(true);
  });
});
