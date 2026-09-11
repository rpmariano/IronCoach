import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ChartFrame from './ChartFrame';

/* Ponto 6 do redesenho / auditoria, achado 1. O que este teste trava é a
   regra estrutural: o número atual, a unidade, os extremos do eixo e a
   legenda vivem em HTML, FORA do <svg>/<canvas> do gráfico. Se alguém voltar
   a empurrar texto para dentro da tela, o gráfico deixa de precisar destes
   nós e o teste cai. */

describe('ChartFrame', () => {
  it('põe o valor atual e a unidade em HTML, acima do gráfico', () => {
    render(
      <ChartFrame label="Volume semanal" value="42,6" unit="km">
        <svg data-testid="plot" />
      </ChartFrame>
    );
    expect(screen.getByText('Volume semanal')).toBeInTheDocument();
    expect(screen.getByTestId('chart-frame-value')).toHaveTextContent('42,6');
    expect(screen.getByTestId('chart-frame-unit')).toHaveTextContent('km');
  });

  it('o número grande traz data-count-to, pronto para a animação do ponto 9', () => {
    render(<ChartFrame value="1 980" unit="kcal"><svg /></ChartFrame>);
    expect(screen.getByTestId('chart-frame-value')).toHaveAttribute('data-count-to', '1980');
  });

  it('um valor não numérico não inventa data-count-to', () => {
    render(<ChartFrame value="5:41" unit="/km"><svg /></ChartFrame>);
    expect(screen.getByTestId('chart-frame-value')).not.toHaveAttribute('data-count-to');
  });

  it('desenha a legenda em HTML, uma entrada por série', () => {
    render(
      <ChartFrame
        value={12}
        legend={[
          { label: 'Carga aguda', color: 'var(--run)' },
          { label: 'Rácio ACWR', color: 'white', shape: 'line' },
        ]}
      >
        <svg />
      </ChartFrame>
    );
    const legend = screen.getByTestId('chart-frame-legend');
    expect(legend).toHaveTextContent('Carga aguda');
    expect(legend).toHaveTextContent('Rácio ACWR');
  });

  it('os extremos do eixo ficam nos cantos, em HTML', () => {
    render(<ChartFrame value={1} axis={{ min: '0 km', max: '48 km' }}><svg /></ChartFrame>);
    const axis = screen.getByTestId('chart-frame-axis');
    expect(axis).toHaveTextContent('0 km');
    expect(axis).toHaveTextContent('48 km');
  });

  it('sem legenda nem eixo, não deixa nós vazios', () => {
    render(<ChartFrame value={1}><svg /></ChartFrame>);
    expect(screen.queryByTestId('chart-frame-legend')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chart-frame-axis')).not.toBeInTheDocument();
  });

  it('monta o gráfico dentro da área de desenho', () => {
    render(<ChartFrame value={1}><svg data-testid="plot" /></ChartFrame>);
    expect(screen.getByTestId('chart-frame-plot')).toContainElement(screen.getByTestId('plot'));
  });

  it('sem valor, não mostra a linha do número', () => {
    render(<ChartFrame label="Só o gráfico"><svg /></ChartFrame>);
    expect(screen.queryByTestId('chart-frame-value')).not.toBeInTheDocument();
  });
});
