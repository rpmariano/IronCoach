import React, { useState } from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PeriodSummary, { ROW_BAR_MIN_WIDTH } from './PeriodSummary';
import { TabPageContext, TabReadyContext, setSettledIndex, resetSettledTab } from '../../../utils/settledTab';
import DeltaVsPrevious from './DeltaVsPrevious';
import { avgHeader, countOf, APPROX_GOALS_NOTE, firstPeriodNote } from './periodText';

// Dados do ecrã "Mês · setembro 2026, fechado" do mock-up aprovado.
const ROWS = [
  { key: 'kcal', label: 'Calorias', value: '2 290', goal: '2 400 kcal', status: 'ok', pct: 95, count: countOf(19, 28), color: 'var(--neon-kcal)' },
  { key: 'prot', label: 'Proteína', value: '138', goal: '150 g', status: 'below', pct: 92, count: countOf(12, 28), color: 'var(--neon-proteina)' },
  { key: 'fat', label: 'Gordura', value: '96', goal: '80 g', status: 'above', pct: 120, count: countOf(4, 28), color: 'var(--neon-gordura)' },
  { key: 'water', label: 'Água', value: null, goal: '2 500 ml', missingText: '2 dias, poucos para média', color: 'var(--neon-agua)' },
];

function Controlled(props) {
  const [sel, setSel] = useState('kcal');
  return <PeriodSummary rows={ROWS} days={28} selectedKey={sel} onSelect={setSel} {...props} />;
}

describe('PeriodSummary', () => {
  it('é uma região "Resumo do período" com o cabeçalho das colunas (R3)', () => {
    render(<Controlled />);
    expect(screen.getByRole('region', { name: 'Resumo do período' })).toBeInTheDocument();
    expect(screen.getByText('Média por dia registado (28 dias)')).toBeInTheDocument();
    expect(screen.getByText('Dias no objetivo')).toBeInTheDocument();
  });

  it('plural do cabeçalho com 1 dia e rótulos próprios', () => {
    expect(avgHeader(1)).toBe('Média por dia registado (1 dia)');
    render(<PeriodSummary rows={ROWS} averageLabel="Por sessão de força (3)" countLabel="Semanas no objetivo" />);
    expect(screen.getByText('Por sessão de força (3)')).toBeInTheDocument();
    expect(screen.getByText('Semanas no objetivo')).toBeInTheDocument();
  });

  it('linhas: valor / objetivo, estado com % e "X de N"', () => {
    render(<Controlled />);
    const kcal = screen.getByRole('radio', { name: /^Calorias/ });
    expect(within(kcal).getByText('2 290')).toBeInTheDocument();
    expect(within(kcal).getByText('/ 2 400 kcal')).toBeInTheDocument();
    expect(within(kcal).getByText('Dentro · 95%')).toBeInTheDocument();
    expect(within(kcal).getByText('19 de 28')).toBeInTheDocument();
    expect(within(kcal).getByTestId('row-status')).toHaveAttribute('data-status', 'ok');
    expect(within(kcal).getByTestId('row-status').style.color).toBe('var(--ok)');

    const prot = screen.getByRole('radio', { name: /^Proteína/ });
    expect(within(prot).getByText('Abaixo · 92%')).toBeInTheDocument();
    expect(within(prot).getByTestId('row-status').style.color).toBe('var(--warn)');

    const fat = screen.getByRole('radio', { name: /^Gordura/ });
    expect(within(fat).getByText('Acima · 120%')).toBeInTheDocument();
    // barra limitada a 100% (scaleX, não width: AnimatedBar)
    expect(within(fat).getByTestId('row-bar').style.transform).toBe('scaleX(1)');
    expect(within(kcal).getByTestId('row-bar').style.transform).toBe('scaleX(0.95)');
  });

  it('sem média: "—", texto da falta, sem barra nem estado', () => {
    render(<Controlled />);
    const water = screen.getByRole('radio', { name: /^Água/ });
    expect(within(water).getByTestId('row-value')).toHaveTextContent('—');
    expect(within(water).getByText('2 dias, poucos para média')).toBeInTheDocument();
    expect(within(water).queryByTestId('row-bar')).toBeNull();
    expect(within(water).queryByTestId('row-status')).toBeNull();
    expect(water).toHaveAccessibleName('Água: 2 dias, poucos para média: objetivo 2 500 ml');
  });

  /* 2026-10-05 (A4): só há calha quando a linha TEM barra. Na Corrida e no Corpo
     as linhas nunca levam pct/barPct, e uma calha cinzenta que nunca enche lia-se
     como uma barra que não carregou. */
  it('sem barra, sem calha: linhas sem pct/barPct e linhas sem média não desenham a pista cinzenta', () => {
    const rows = [
      { key: 'km', label: 'Distância', value: '25,0 km' },
      { key: 'pace', label: 'Pace médio', value: '5:00/km', status: 'ok', statusText: 'Dentro' },
      { key: 'water', label: 'Água', value: null, goal: '2 500 ml', missingText: '2 dias com água — poucos para média' },
      { key: 'kcal', label: 'Calorias', value: '2 290', goal: '2 400 kcal', status: 'ok', pct: 95 },
    ];
    const { container } = render(<PeriodSummary rows={rows} days={3} />);
    const tracks = Array.from(container.querySelectorAll('span')).filter((n) => n.style.background === 'var(--border-hairline)');
    // Só a das Calorias.
    expect(tracks).toHaveLength(1);
    expect(screen.getAllByTestId('row-bar')).toHaveLength(1);
    const water = screen.getByRole('listitem', { name: /^Água/ });
    expect(within(water).queryByTestId('row-bar')).toBeNull();
    expect(within(water).getByText('2 dias com água — poucos para média')).toBeInTheDocument();
    // O estado e a contagem continuam lá, sem barra.
    expect(within(screen.getByRole('listitem', { name: /^Pace/ })).getByTestId('row-status')).toHaveAttribute('data-status', 'ok');
  });

  it('nome acessível por extenso da linha', () => {
    render(<Controlled />);
    expect(screen.getByRole('radio', { name: 'Calorias: 2 290 de 2 400 kcal, Dentro · 95%, dias no objetivo: 19 de 28' })).toBeInTheDocument();
  });

  it('radiogroup: uma escolhida, ≥48 px, clique e teclado (setas, Home, End)', () => {
    render(<Controlled />);
    const group = screen.getByRole('radiogroup', { name: 'Escolher o que os gráficos mostram' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(4);
    radios.forEach((r) => expect(r.style.minHeight).toBe('48px'));
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios[0]).toHaveAttribute('tabindex', '0');
    expect(radios[1]).toHaveAttribute('tabindex', '-1');

    fireEvent.click(radios[1]);
    expect(screen.getByRole('radio', { name: /^Proteína/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /^Calorias/ })).toHaveAttribute('aria-checked', 'false');

    fireEvent.keyDown(screen.getByRole('radio', { name: /^Proteína/ }), { key: 'ArrowDown' });
    expect(screen.getByRole('radio', { name: /^Gordura/ })).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: /^Gordura/ }));
    fireEvent.keyDown(document.activeElement, { key: 'End' });
    expect(screen.getByRole('radio', { name: /^Água/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' }); // dá a volta
    expect(screen.getByRole('radio', { name: /^Calorias/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(document.activeElement, { key: 'ArrowUp' });
    expect(screen.getByRole('radio', { name: /^Água/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(document.activeElement, { key: 'Home' });
    expect(screen.getByRole('radio', { name: /^Calorias/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('sem onSelect é uma lista, não um radiogroup', () => {
    render(<PeriodSummary rows={ROWS} days={28} />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('veredicto, linha de contagem com ▲ do anterior e nota (mock-up setembro)', () => {
    render(
      <Controlled
        verdict={{ text: 'Em setembro a média esteve no sítio.', tone: 'warn' }}
        summaryLine="Calorias e proteína no objetivo em 14 de 28 dias (50%)"
        delta={<DeltaVsPrevious current={50} previous={38} previousLabel="agosto" previousText="11 de 29 (38%)" />}
        notes={[APPROX_GOALS_NOTE]}
      />,
    );
    expect(screen.getByTestId('verdict-line')).toHaveAttribute('data-tone', 'warn');
    const footer = screen.getByTestId('summary-footer');
    expect(footer).toHaveTextContent('Calorias e proteína no objetivo em 14 de 28 dias (50%) · ▲ agosto: 11 de 29 (38%)');
    expect(footer).toHaveTextContent(APPROX_GOALS_NOTE);
  });

  it('sem anterior: a nota "Primeiro trimestre…" e nenhum ▲/▼', () => {
    render(
      <Controlled
        summaryLine="Calorias e proteína no objetivo em 27 de 72 dias"
        delta={<DeltaVsPrevious current={37} previous={null} previousLabel="abr – jun" />}
        notes={[firstPeriodNote('trimestre')]}
      />,
    );
    expect(screen.queryByTestId('delta-vs-previous')).toBeNull();
    expect(screen.getByText('Calorias e proteína no objetivo em 27 de 72 dias')).toBeInTheDocument();
    expect(screen.getByText('Primeiro trimestre com registos — ainda não há outro para comparar.')).toBeInTheDocument();
  });

  it('delta como objeto de props: desenha a seta; sem anterior não deixa " · "', () => {
    const { rerender } = render(
      <Controlled summaryLine="Calorias e proteína no objetivo em 2 de 6 dias" delta={{ current: 2, previous: 3, previousLabel: '21 – 26 set' }} />,
    );
    expect(screen.getByTestId('summary-footer')).toHaveTextContent('Calorias e proteína no objetivo em 2 de 6 dias · ▼ 1 face a 21 – 26 set');
    rerender(<Controlled summaryLine="Calorias e proteína no objetivo em 2 de 6 dias" delta={{ current: 2, previous: null, previousLabel: '21 – 26 set' }} />);
    expect(screen.getByTestId('summary-footer').textContent).toBe('Calorias e proteína no objetivo em 2 de 6 dias');
  });

  it('linha do anterior com botão "Ver setembro" de 44 px (mock-up outubro em curso)', () => {
    const onAction = vi.fn();
    render(
      <Controlled
        previous={{ text: 'setembro: 19 de 28 dias no objetivo · 2 290 kcal/dia', actionLabel: 'Ver setembro', onAction }}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Ver setembro' });
    expect(btn.style.minHeight).toBe('var(--tap)');
    fireEvent.click(btn);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('summary-footer')).toHaveTextContent('setembro: 19 de 28 dias no objetivo · 2 290 kcal/dia · Ver setembro');
  });

  it('sem nada no rodapé não desenha a linha divisória', () => {
    render(<Controlled />);
    expect(screen.queryByTestId('summary-footer')).toBeNull();
  });

  it('semana a começar: todas as linhas com "ainda sem dias fechados" e 0 dias (mock-up SemanaInicio)', () => {
    const rows = ROWS.map((r) => ({ ...r, value: null, missingText: 'ainda sem dias fechados' }));
    render(<PeriodSummary rows={rows} days={0} selectedKey="kcal" onSelect={() => {}} />);
    expect(screen.getByText('Média por dia registado (0 dias)')).toBeInTheDocument();
    expect(screen.getAllByText('ainda sem dias fechados')).toHaveLength(4);
    expect(screen.getAllByTestId('row-value').every((n) => n.textContent === '—')).toBe(true);
  });
});

/* Verificação no browser (2026-10-05): duas barras que existiam mas não se viam. */
describe('PeriodSummary — barras que se veem', () => {
  it('estado longo (Ginásio): a calha nunca fica a 0 px — tem largura mínima e o estado parte em duas linhas', () => {
    render(
      <PeriodSummary
        countLabel="Semanas com 2+ treinos"
        rows={[{ key: 'forca', label: 'Treinos de força', value: '8 · 1,2/semana', statusText: '6 treinos de força em 5 semanas fechadas', status: 'ok', barPct: 60, count: countOf(2, 5) }]}
      />,
    );
    const track = screen.getByTestId('row-bar').parentElement;
    // O jsdom não mede: verifica-se o estilo que garante a largura.
    expect(track.style.minWidth).toBe(`${ROW_BAR_MIN_WIDTH}px`);
    expect(ROW_BAR_MIN_WIDTH).toBeGreaterThanOrEqual(80);
    const st = screen.getByTestId('row-status');
    expect(st.style.whiteSpace).toBe('normal');
    expect(st.style.flexShrink).toBe('1');
  });

  describe('no carrossel: o que se observa é a linha da 1.ª barra, não a lista toda', () => {
    let observers = [];
    class FakeObserver {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(el) { this.el = el; }
      disconnect() { this.disconnected = true; }
    }
    beforeEach(() => {
      vi.useFakeTimers();
      observers = [];
      resetSettledTab();
      vi.stubGlobal('IntersectionObserver', FakeObserver);
      vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    });
    afterEach(() => {
      resetSettledTab();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    // O Corpo: 13 linhas, só o Peso (a 1.ª) e a Gordura (a 3.ª) com objetivo e barra.
    const CORPO = Array.from({ length: 13 }, (_, i) => ({
      key: `m${i}`,
      label: `Medida ${i}`,
      value: '1,0',
      ...(i === 0 || i === 2 ? { goal: '72,0 kg', barPct: 48, statusText: 'falta 1,2 kg' } : { statusText: '3 leituras' }),
    }));

    it('à entrada num 390×844 (376 px da lista à vista): a barra do Peso cresce sem precisar de scroll', () => {
      render(
        <TabPageContext.Provider value={3}>
          <TabReadyContext.Provider value>
            <PeriodSummary rows={CORPO} module="corpo" countLabel={null} />
          </TabReadyContext.Provider>
        </TabPageContext.Provider>,
      );
      const [peso] = screen.getAllByTestId('row-bar');
      expect(peso.style.transform).toBe('scaleX(0)');
      const watched = observers.filter((o) => o.el && !o.disconnected).map((o) => o.el);
      expect(watched).toHaveLength(1);
      // Não é a lista (887 px — com 376 px à vista nunca chegava aos 55 %)…
      expect(watched[0].getAttribute('role')).not.toBe('list');
      // …é a linha da barra do Peso.
      expect(watched[0].contains(peso)).toBe(true);
      expect(screen.getAllByRole('listitem')[0].contains(watched[0])).toBe(true);

      act(() => { setSettledIndex(3); });
      // A linha da barra (20 px) inteira à vista, em top 512 de um ecrã de 844.
      act(() => {
        observers.forEach((o) => o.el && !o.disconnected && o.callback([{
          isIntersecting: true,
          intersectionRect: { height: 20, width: 323 },
          boundingClientRect: { height: 20, width: 323, top: 512, bottom: 532 },
          rootBounds: { height: 844 },
        }]));
      });
      act(() => { vi.advanceTimersByTime(32); });
      expect(peso.style.transform).toBe('scaleX(0.48)');
      expect(screen.getAllByTestId('row-bar')[1].style.transform).toBe('scaleX(0.48)');
    });
  });
});
