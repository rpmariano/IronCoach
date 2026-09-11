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

  it('com a corrida já ligada, a prova sai do cartão', () => {
    render(
      <RaceCard
        raceEvents={[{ ...PROVA, date: emDias(-2), status: 'concluida' }]}
        runs={[{ id: 'run-1', kind: 'competicao', race_id: 'race-1', date: emDias(-2) }]}
        profile={PROFILE}
        onRegisterRace={() => {}}
      />
    );

    expect(screen.getByTestId('race-card-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('race-card-register')).not.toBeInTheDocument();
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
