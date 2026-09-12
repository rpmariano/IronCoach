import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RaceCard from './RaceCard';
import { todayISO } from '../../lib/utils';

/* "Para onde vou" no Início. Até specs/prova-concluida.md, este cartão só
   olhava para a frente: a prova desaparecia no dia seguinte ao da corrida,
   registada ou não. A partir do dia da prova passa a ser o sítio onde se
   regista — e fica lá até 7 dias depois, enquanto não houver corrida
   ligada. */

// Datas em hora LOCAL, como o todayISO da app: passar por toISOString num
// fuso a leste de Greenwich devolve o dia anterior.
const emDias = (n) => {
  const d = new Date(`${todayISO()}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const PROVA = {
  id: 'race-1',
  name: 'Meia de Lisboa',
  location: 'Lisboa',
  distance_km: 21.0975,
  race_type: 'estrada',
  race_priority: 'a',
  target_time: '1:52:00',
  status: 'agendada',
};

const PROFILE = { experience_level: 'medio' };

describe('Home/RaceCard — o CTA do dia da prova', () => {
  it('no dia da prova mostra "Registar a prova" e leva o id da prova', () => {
    const onRegisterRace = vi.fn();
    render(
      <RaceCard
        raceEvents={[{ ...PROVA, date: todayISO() }]}
        runs={[]}
        profile={PROFILE}
        onRegisterRace={onRegisterRace}
      />
    );

    const cta = screen.getByTestId('race-card-register');
    expect(cta).toHaveTextContent('Registar a prova');
    expect(cta).toHaveStyle({ minHeight: '44px' });

    fireEvent.click(cta);
    expect(onRegisterRace).toHaveBeenCalledWith('race-1');
  });

  it('dois dias depois, a prova por registar continua no cartão', () => {
    render(
      <RaceCard
        raceEvents={[{ ...PROVA, date: emDias(-2) }]}
        runs={[]}
        profile={PROFILE}
        onRegisterRace={() => {}}
      />
    );

    expect(screen.getByText('Prova por registar')).toBeInTheDocument();
    expect(screen.getByText('correste há 2 dias')).toBeInTheDocument();
    expect(screen.getByTestId('race-card-register')).toBeInTheDocument();
  });

  it('passados mais de 7 dias sem registo, o Início desiste — o sítio dela é o hub', () => {
    render(
      <RaceCard
        raceEvents={[{ ...PROVA, date: emDias(-10) }]}
        runs={[]}
        profile={PROFILE}
        onRegisterRace={() => {}}
      />
    );

    expect(screen.getByTestId('race-card-empty')).toBeInTheDocument();
  });

  it('uma prova ainda por correr não pede registo nenhum', () => {
    render(
      <RaceCard
        raceEvents={[{ ...PROVA, date: emDias(21) }]}
        runs={[]}
        profile={PROFILE}
        onRegisterRace={() => {}}
      />
    );

    expect(screen.getByTestId('race-card')).toBeInTheDocument();
    expect(screen.queryByTestId('race-card-register')).not.toBeInTheDocument();
  });
});

/* O dia a seguir à prova (specs/gamificacao-provas.md §3). Com a corrida
   ligada já não há nada a registar: o cartão olha para trás — tempo, ordem
   no palmarés, conquistas — até se marcar a próxima prova ou passarem 7
   dias. */
const CONCLUIDA = {
  ...PROVA,
  status: 'concluida',
  target_time_seconds: 6720,
};

const CORRIDA = (date) => ({
  id: 'run-1',
  kind: 'competicao',
  race_id: 'race-1',
  date,
  distance_km: 21.0975,
  duration_seconds: 6642,
  details: { official_time_seconds: 6642 },
});

describe('Home/RaceCard — o dia a seguir à prova', () => {
  const renderDiaASeguir = (props = {}) => render(
    <RaceCard
      raceEvents={[{ ...CONCLUIDA, date: emDias(-1) }]}
      runs={[CORRIDA(emDias(-1))]}
      profile={PROFILE}
      {...props}
    />
  );

  it('mostra a prova concluída com o dia, o tempo e o objetivo', () => {
    renderDiaASeguir();

    const cartao = screen.getByTestId('race-card-completed');
    expect(cartao).toHaveTextContent('Prova concluída · ontem');
    expect(cartao).toHaveTextContent('Meia de Lisboa');
    expect(cartao).toHaveTextContent('1:50:42');
    expect(cartao).toHaveTextContent('objetivo 1:52:00');
    // O ciclo fechou — o trilho do macrociclo não tem o que dizer aqui.
    expect(screen.queryByTestId('race-card')).not.toBeInTheDocument();
  });

  it('mostra a ordem da prova no palmarés', () => {
    renderDiaASeguir();
    expect(screen.getByTestId('race-card-completed')).toHaveTextContent('1.ª');
  });

  it('mostra as conquistas desta prova em chips', () => {
    renderDiaASeguir();
    expect(screen.getByTestId('race-card-chip-prova_concluida')).toBeInTheDocument();
    expect(screen.getByTestId('race-card-chip-objetivo_batido')).toHaveTextContent('Objetivo batido');
    // Sem histórico de treino não há previsão — e sem previsão não há chip.
    expect(screen.queryByTestId('race-card-chip-previsao_batida')).not.toBeInTheDocument();
  });

  it('com o treino a apontar para bem mais, acrescenta "Previsão batida"', () => {
    render(
      <RaceCard
        raceEvents={[{ ...CONCLUIDA, date: emDias(-1) }]}
        runs={[
          { id: 'treino-1', date: emDias(-40), distance_km: 10, duration_seconds: 3600, kind: 'treino' },
          { id: 'treino-2', date: emDias(-20), distance_km: 14, duration_seconds: 5200, kind: 'treino' },
          CORRIDA(emDias(-1)),
        ]}
        profile={PROFILE}
      />
    );
    expect(screen.getByTestId('race-card-chip-previsao_batida')).toHaveTextContent('Previsão batida');
  });

  it('"Ver memórias" abre o hub e "Próxima prova" marca a seguinte', () => {
    const onOpenRace = vi.fn();
    const onCreateRace = vi.fn();
    renderDiaASeguir({ onOpenRace, onCreateRace });

    const memorias = screen.getByTestId('race-card-memories');
    expect(memorias).toHaveStyle({ minHeight: '44px' });
    fireEvent.click(memorias);
    expect(onOpenRace).toHaveBeenCalledWith('race-1');

    fireEvent.click(screen.getByTestId('race-card-next'));
    expect(onCreateRace).toHaveBeenCalled();
  });

  it('marcada a próxima prova, o Início volta a olhar para a frente', () => {
    render(
      <RaceCard
        raceEvents={[
          { ...CONCLUIDA, date: emDias(-1) },
          { ...PROVA, id: 'race-2', name: 'Maratona do Porto', date: emDias(30) },
        ]}
        runs={[CORRIDA(emDias(-1))]}
        profile={PROFILE}
      />
    );

    expect(screen.queryByTestId('race-card-completed')).not.toBeInTheDocument();
    expect(screen.getByTestId('race-card')).toBeInTheDocument();
  });

  it('passados mais de 7 dias, sai — o sítio dela é o hub', () => {
    render(
      <RaceCard
        raceEvents={[{ ...CONCLUIDA, date: emDias(-9) }]}
        runs={[CORRIDA(emDias(-9))]}
        profile={PROFILE}
      />
    );

    expect(screen.queryByTestId('race-card-completed')).not.toBeInTheDocument();
    expect(screen.getByTestId('race-card-empty')).toBeInTheDocument();
  });
});
