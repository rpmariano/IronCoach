import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Dumbbell } from 'lucide-react';
import EmptyModuleState, { EmptyChartFrame } from './EmptyModuleState';

/* Ponto 7 do redesenho 6c (auditoria, achado 9: "nenhum estado vazio").
   O cartão do mock "Dashboard · sem dados" e a moldura de gráfico vazia
   que o acompanha. */

describe('EmptyModuleState', () => {
  it('mostra o título do mock, o texto e a ação, e chama-a ao tocar', () => {
    const onAction = vi.fn();
    render(
      <EmptyModuleState
        tone="gym"
        icon={<Dumbbell size={22} />}
        actionLabel="Registar treino"
        onAction={onAction}
      >
        Ainda não há treinos neste período.
      </EmptyModuleState>
    );

    expect(screen.getByText('Ainda não há dados')).toBeInTheDocument();
    expect(screen.getByText('Ainda não há treinos neste período.')).toBeInTheDocument();

    const button = screen.getByRole('button', { name: 'Registar treino' });
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('a ação respeita o piso de toque de 44px (ponto 2 do handoff)', () => {
    render(<EmptyModuleState tone="run" actionLabel="Registar corrida" onAction={() => {}} />);
    expect(screen.getByRole('button', { name: 'Registar corrida' })).toHaveStyle({ minHeight: 'var(--tap)' });
  });

  it('sem ação, não desenha botão nenhum — o cartão é só a explicação', () => {
    render(<EmptyModuleState>Ainda não tenho dados.</EmptyModuleState>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByTestId('empty-module-state')).toHaveAttribute('data-tone', 'brand');
  });

  it('guarda o tom do módulo, que é o que dá a cor ao ícone e ao botão', () => {
    render(<EmptyModuleState tone="nutrition">sem dados</EmptyModuleState>);
    expect(screen.getByTestId('empty-module-state')).toHaveAttribute('data-tone', 'nutrition');
  });
});

describe('EmptyChartFrame', () => {
  it('mostra "—" em vez de um número e tracejado em vez de um gráfico a zero', () => {
    render(<EmptyChartFrame label="Distância por dia" unit="km no período" />);

    expect(screen.getByTestId('chart-frame-value')).toHaveTextContent('—');
    expect(screen.getByText('Distância por dia')).toBeInTheDocument();
    expect(screen.getByTestId('empty-plot')).toBeInTheDocument();
    // Uma barra a zero lê-se como "correste zero"; o "—" lê-se como "não sei".
    expect(screen.getByTestId('chart-frame-value')).not.toHaveTextContent('0');
  });
});
