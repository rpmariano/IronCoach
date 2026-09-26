import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';

/* A Vitrina dos badges, o painel do que falta e o ecrã de detalhe. As regras
   são de utils/badges.js (testadas lá); aqui só a UI: a Vitrina a mostrar SÓ
   o que já foi ganho, o painel "O que há para ganhar" com o resto e as
   regras à vista, o anel com o número ao centro, a regra numa frase, o bloco
   do dado em falta e as sessões agrupadas pelo que aconteceu a cada uma.

   Mais a entrada do "Onde estás", que a Vitrina herdou do Palmarés quando
   ele saiu (fase C): é o único caminho que resta para o percentil por
   escalão, e por isso o que este ficheiro guarda é que ele existe mesmo
   quando não há nada por ganhar — o ecrã em si é de OndeEstasScreen.test.jsx. */

// O "Onde estás" lê percentile_snapshots ao montar. Sem linha nenhuma o
// ecrã mostra o estado certo na mesma; o que não pode é ir à rede.
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    }),
  },
}));

const badge = (over) => ({
  key: 'x', name: 'X', rule: 'A regra do badge X, numa frase inteira.', familia: 'desempenho', cor: 'run', glifo: 'heart',
  state: 'empty', tier: null, ring: 0, centro: '—', centroAria: 'X: por ganhar', linha: null,
  count: 0, niveis: null, sessoes: [], indeterminadas: null, ...over,
});

const BADGES = [
  badge({
    key: 'z2_mestre', name: 'Mestre da Z2', cor: 'run', state: 'won', ring: 1, centro: '94', count: 2,
    linha: '2 vezes · a última a 10 set 2026',
    sessoes: [
      { kind: 'run', id: 'r1', runId: 'r1', raceId: null, date: '2026-09-10', title: 'Longo matinal', meta: '94% do tempo em Z1-Z2', status: 'conta', porque: 'Cumpriu a regra.' },
      { kind: 'run', id: 'r2', runId: 'r2', raceId: null, date: '2026-09-03', title: 'Contínuo', meta: '61% do tempo em Z1-Z2', status: 'falhou', porque: 'Ficou a +29 do alvo.' },
    ],
    indeterminadas: { n: 3, campoLabel: 'as zonas de frequência cardíaca', comoResolver: 'Abre o registo e preenche os minutos por zona.', frase: '3 sessões ficaram por decidir: não têm as zonas de frequência cardíaca. Não contam nem a favor nem contra.' },
  }),
  badge({
    key: 'escalada', name: 'A Escalada', rule: 'Somar metros de subida ao longo do tempo.', familia: 'acumulacao', cor: 'run', glifo: 'peak', state: 'progress', ring: 0.5, centro: '5k',
    linha: 'faltam 5 000 m para bronze',
    niveis: [
      { key: 'bronze', label: 'Bronze', limiar: 10000, ganho: false },
      { key: 'prata', label: 'Prata', limiar: 25000, ganho: false },
      { key: 'ouro', label: 'Ouro', limiar: 50000, ganho: false },
    ],
  }),
  badge({ key: 'semana_100', name: 'Semana 100%', familia: 'disciplina', cor: 'ok', glifo: 'check', state: 'empty', centro: '+50', linha: 'a melhor: semana de 7 set 2026, índice 50' }),
  /* Um amuleto: prata, na sua própria família, e — o ponto — com um `ring`
     alto de propósito, para provar que mesmo assim não é ele que vai parar à
     frase de progresso. */
  badge({
    key: 'solsticio', name: 'Solstício', familia: 'amuletos', cor: 'neutro', glifo: 'sun',
    state: 'progress', ring: 0.9, centro: '1/2', linha: 'falta o dia mais curto',
  }),
  badge({
    key: 'recorde_pessoal', name: 'Recorde pessoal', cor: 'race', glifo: 'trophy', state: 'won', ring: 1, centro: '1', count: 1,
    sessoes: [{ kind: 'race', id: 'p2', raceId: 'p2', runId: 'run-p2', date: '2026-06-01', title: 'Prova p2', meta: '10 km · 48:20', status: 'conta', porque: 'O melhor tempo de sempre nesta distância.' }],
  }),
];

const marcarVistos = vi.fn();
let pending = [];
let badges = BADGES;

vi.mock('../../utils/useBadges', () => ({
  default: vi.fn(() => ({ badges, due: [], pending, marcarVistos })),
}));

import BadgesCard from './BadgesCard';

/** Abre o painel "O que há para ganhar" e devolve-o. */
const abrirPorGanhar = () => {
  fireEvent.click(screen.getByTestId('badges-por-ganhar'));
  return screen.getByTestId('badges-por-ganhar-sheet');
};

describe('BadgesCard — a Vitrina só mostra o que já foi ganho', () => {
  beforeEach(() => {
    pending = [];
    badges = BADGES;
    marcarVistos.mockReset();
    useAppStore.setState({
      profile: { id: 'user-1' }, runs: [], raceEvents: [],
      editingRaceId: null, editingRunId: null, openCreationMode: null,
      coachIntent: null, activeTab: 'perfil', navGuard: null,
    });
  });

  /* A decisão de 2026-09-22: "os badges só devem aparecer à medida que se vão
     ganhando e não aparecerem a zero". Os anéis por ganhar saem da Vitrina —
     mas o contador do cabeçalho continua a dizer o total, que é outra coisa:
     não ver os vazios não é deixar de saber quantos são. */
  it('mostra só os ganhos, com o número dentro do anel, e conta o total no cabeçalho', () => {
    render(<BadgesCard />);
    const grelha = screen.getByTestId('badges-grelha');
    expect(grelha.querySelectorAll('button')).toHaveLength(2);
    expect(screen.getByTestId('badges-card')).toHaveTextContent('2 de 5');

    const ganho = screen.getByTestId('badge-tile-z2_mestre');
    expect(ganho).toHaveAttribute('data-state', 'won');
    expect(within(ganho).getByTestId('badge-ring-z2_mestre')).toHaveTextContent('94');
    expect(ganho).toHaveTextContent('2×');
    expect(screen.getByTestId('badge-tile-recorde_pessoal')).toBeInTheDocument();

    // Os por ganhar não estão na Vitrina — estão atrás da entrada do fim.
    expect(screen.queryByTestId('badge-tile-escalada')).not.toBeInTheDocument();
    expect(screen.queryByTestId('badge-tile-semana_100')).not.toBeInTheDocument();
    expect(screen.queryByTestId('badge-tile-solsticio')).not.toBeInTheDocument();
  });

  /* Uma conta nova: nem grelha nem parede de anéis cinzentos. Uma linha que
     explica o vazio — está tudo bem, não falhou nada. */
  it('sem nenhum ganho não há grelha nenhuma, só uma linha a dizer porquê', () => {
    badges = BADGES.map((b) => (b.state === 'won' ? { ...b, state: 'empty', ring: 0, count: 0 } : b));
    render(<BadgesCard />);
    expect(screen.queryByTestId('badges-grelha')).not.toBeInTheDocument();
    expect(screen.getByTestId('badges-vazio')).toHaveTextContent('Ainda não há badges ganhos.');
    expect(screen.getByTestId('badges-card')).toHaveTextContent('0 de 5');
    // E o caminho para o que existe continua lá.
    expect(screen.getByTestId('badges-por-ganhar')).toHaveTextContent('5 por ganhar');
  });

  it('com tudo ganho não há entrada para o que falta', () => {
    badges = BADGES.map((b) => ({ ...b, state: 'won', ring: 1, count: 1 }));
    render(<BadgesCard />);
    expect(screen.queryByTestId('badges-por-ganhar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('badges-progresso')).not.toBeInTheDocument();
  });

  /* O "Onde estás" não é um badge e não se gere como um: não depende de
     haver ganhos nem de faltar alguma coisa. Desde 2026-09-25 depende de
     outra coisa — de haver números para mostrar a ESTE atleta (o escalão
     dele ou um grupo ao lado, na última quinzena publicada). Antes estava
     sempre lá e levava a um ecrã vazio: nenhum grupo tinha 20 atletas. */
  const DAQUI_A_60_DIAS = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const comSegmento = (snapshots) => useAppStore.setState({
    profile: { id: 'u1', gender: 'M', birth_date: '1984-05-10' },
    raceEvents: [{ id: 'r1', date: DAQUI_A_60_DIAS, race_type: 'estrada' }],
    percentileSnapshots: snapshots,
  });

  it('sem números publicados para ele, o "Onde estás" não aparece — com ou sem badges', () => {
    badges = BADGES.map((b) => ({ ...b, state: 'won', ring: 1, count: 1 }));
    comSegmento([]);
    render(<BadgesCard />);
    expect(screen.queryByTestId('badges-onde-estas')).not.toBeInTheDocument();
  });

  it('com números do escalão dele (ou de um grupo ao lado), aparece e abre o ecrã do percentil', () => {
    badges = BADGES.map((b) => ({ ...b, state: 'won', ring: 1, count: 1 }));
    comSegmento([{ age_band: 'M45', gender: 'M', terrain: 'estrada', window_start: '2026-08-31', window_end: '2026-09-14' }]);
    render(<BadgesCard />);

    const linha = screen.getByTestId('badges-onde-estas');
    expect(linha).toHaveTextContent('Onde estás — o teu percentil no escalão');

    fireEvent.click(linha);
    expect(screen.getByTestId('onde-estas-screen')).toBeInTheDocument();
  });

  it('a frase de progresso é a do badge mais perto, e abre o detalhe dele', () => {
    render(<BadgesCard />);
    const progresso = screen.getByTestId('badges-progresso');
    // O Solstício está mais perto (ring 0,9 contra 0,5) e mesmo assim não é
    // ele: um amuleto nunca vai para esta linha, porque esta linha é um
    // empurrão e empurrar para um amuleto estraga-o (doutrina 6 #6).
    expect(progresso).toHaveTextContent('A Escalada — faltam 5 000 m para bronze');
    fireEvent.click(progresso);
    expect(screen.getByTestId('badge-detalhe-escalada')).toBeInTheDocument();
  });

  it('o detalhe abre com a regra, o progresso e as sessões agrupadas', () => {
    render(<BadgesCard />);
    fireEvent.click(screen.getByTestId('badge-tile-z2_mestre'));
    const ecra = screen.getByTestId('badge-detalhe-z2_mestre');
    expect(ecra).toHaveTextContent('Vitrina · Badges');
    expect(within(ecra).getByTestId('badge-detalhe-regra')).toHaveTextContent('A regra do badge X, numa frase inteira.');
    expect(ecra).toHaveTextContent('Ganho · 2×');
    expect(ecra).toHaveTextContent('Contaram');
    expect(ecra).toHaveTextContent('Não chegaram lá');
    expect(within(ecra).getByTestId('badge-sessao-run-r1')).toHaveTextContent('Longo matinal');
  });

  /* O ponto crítico da fase: uma sessão sem o dado não conta para lado
     nenhum, e o ecrã tem de o dizer com o caminho para resolver. */
  it('o detalhe diz quantas sessões ficaram por decidir e o que fazer', () => {
    render(<BadgesCard />);
    fireEvent.click(screen.getByTestId('badge-tile-z2_mestre'));
    const bloco = screen.getByTestId('badge-detalhe-indeterminadas');
    expect(bloco).toHaveTextContent('3 sessões ficaram por decidir');
    expect(bloco).toHaveTextContent('Abre o registo e preenche os minutos por zona.');
  });

  /* A ESCALA PEQUENA do momento do badge (fase 4): um badge ganho e ainda
     por ver fecha o anel na própria célula, com um salto, e fica visto — sem
     interromper nada. Quem vê primeiro consome. A Vitrina só mostrar os
     ganhos não lhe tira o palco: um badge por ver é, por construção, um
     badge ganho (só o ramo `won` de cada regra preenche o `due`). */
  it('um badge por ver dá o salto na própria célula e fica visto', () => {
    pending = [{ id: 'a1', badge_key: 'z2_mestre' }];
    render(<BadgesCard />);
    const celula = screen.getByTestId('badge-tile-z2_mestre');
    expect(celula).toHaveAttribute('data-novo', 'true');
    expect(celula.className).toContain('badge-salto');
    expect(marcarVistos).toHaveBeenCalledWith(['a1']);
    // As outras células não saltam: não há novidade nenhuma nelas.
    expect(screen.getByTestId('badge-tile-recorde_pessoal')).not.toHaveAttribute('data-novo');
  });

  it('sem nada por ver (a migração por aplicar), nenhuma célula salta', () => {
    render(<BadgesCard />);
    expect(screen.getByTestId('badge-tile-z2_mestre')).not.toHaveAttribute('data-novo');
    expect(marcarVistos).not.toHaveBeenCalled();
  });

  /* O botão que leva à Carol (doutrina 6 #6, a porta da pergunta direta).
     Num badge JÁ GANHO a pergunta é sobre o que ele significa e até onde
     ainda dá para ir — o badge é de desempenho, família que ela pode
     sugerir à vontade. */
  it('o detalhe de um badge ganho traz o botão da Carol, e o clique salta para o chat', () => {
    render(<BadgesCard />);
    fireEvent.click(screen.getByTestId('badge-tile-z2_mestre'));
    const botao = screen.getByTestId('badge-detalhe-carol');
    expect(botao).toHaveTextContent('Falar com a Carol');
    expect(screen.getByTestId('badge-detalhe-carol-legenda')).toHaveTextContent('como podes ir mais longe nele');

    fireEvent.click(botao);
    const intent = useAppStore.getState().coachIntent;
    expect(intent).toMatchObject({
      kind: 'badge', badgeKey: 'z2_mestre', badgeName: 'Mestre da Z2',
      familia: 'desempenho', estado: 'won',
    });
    // A mensagem é do atleta e tem de soar a pessoa — não a formulário.
    expect(intent.pergunta).toBe('Explica-me o badge Mestre da Z2 — o que é que ele quer dizer, e o que posso fazer para ir mais longe nele?');
    expect(useAppStore.getState().activeTab).toBe('coach');
    // E o ecrã fecha-se: o chat toma o lugar do separador.
    expect(screen.queryByTestId('badge-detalhe-z2_mestre')).not.toBeInTheDocument();
  });

  it('uma corrida da lista abre o registo; uma prova abre o hub', () => {
    render(<BadgesCard />);
    fireEvent.click(screen.getByTestId('badge-tile-z2_mestre'));
    fireEvent.click(screen.getByTestId('badge-sessao-run-r1'));
    expect(useAppStore.getState().editingRunId).toBe('r1');
    expect(useAppStore.getState().openCreationMode).toBe('run');
    expect(screen.queryByTestId('badge-detalhe-z2_mestre')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('badge-tile-recorde_pessoal'));
    fireEvent.click(screen.getByTestId('badge-sessao-race-p2'));
    expect(useAppStore.getState().editingRaceId).toBe('p2');
  });
});

describe('BadgesPorGanharSheet — o que falta, com as regras à vista', () => {
  beforeEach(() => {
    pending = [];
    badges = BADGES;
    marcarVistos.mockReset();
    useAppStore.setState({
      profile: { id: 'user-1' }, runs: [], raceEvents: [],
      editingRaceId: null, editingRunId: null, openCreationMode: null,
      coachIntent: null, activeTab: 'perfil', navGuard: null,
    });
  });

  it('a entrada do fim abre o painel com os que faltam, e só esses', () => {
    render(<BadgesCard />);
    expect(screen.getByTestId('badges-por-ganhar')).toHaveTextContent('O que há para ganhar');
    expect(screen.getByTestId('badges-por-ganhar')).toHaveTextContent('3 por ganhar');

    const painel = abrirPorGanhar();
    const grelha = within(painel).getByTestId('badges-por-ganhar-grelha');
    expect(grelha.querySelectorAll('button')).toHaveLength(3);
    expect(within(grelha).getByTestId('badge-tile-escalada')).toBeInTheDocument();
    expect(within(grelha).getByTestId('badge-tile-semana_100')).toBeInTheDocument();
    expect(within(grelha).getByTestId('badge-tile-solsticio')).toBeInTheDocument();
    expect(within(grelha).queryByTestId('badge-tile-z2_mestre')).not.toBeInTheDocument();
  });

  /* A grelha agrupa por família, pela ordem de FAMILIAS, e cada grupo leva o
     seu cabeçalho: um amuleto lado a lado com o Mestre da Z2 fingia valer o
     mesmo. (A Vitrina usa a MESMA grelha — é por isso que ela saiu para
     BadgesGrelha.jsx.) */
  it('agrupa por família, pela ordem certa', () => {
    render(<BadgesCard />);
    const grelha = within(abrirPorGanhar()).getByTestId('badges-por-ganhar-grelha');
    const grupos = [...grelha.children].map((g) => g.getAttribute('data-testid'));
    expect(grupos).toEqual([
      'badges-familia-disciplina', 'badges-familia-acumulacao', 'badges-familia-amuletos',
    ]);
    const amuletos = within(grelha).getByTestId('badges-familia-amuletos');
    expect(amuletos).toHaveTextContent('Amuletos');
    expect(within(amuletos).getByTestId('badge-tile-solsticio')).toBeInTheDocument();
  });

  /* Quem vem a este painel vem perguntar COMO se ganha — esconder a resposta
     atrás de um toque era esconder a resposta atrás da pergunta. */
  it('as regras estão à vista, sem ser preciso abrir nada', () => {
    render(<BadgesCard />);
    const painel = abrirPorGanhar();
    expect(within(painel).getByTestId('badge-regra-escalada')).toHaveTextContent('Somar metros de subida ao longo do tempo.');
    expect(within(painel).getByTestId('badge-regra-escalada')).toHaveTextContent('faltam 5 000 m para bronze');
    expect(within(painel).getByTestId('badges-regras-amuletos')).toHaveTextContent('Solstício');
  });

  it('uma célula do painel abre o detalhe do badge, com os níveis', () => {
    render(<BadgesCard />);
    const painel = abrirPorGanhar();
    fireEvent.click(within(painel).getByTestId('badge-tile-escalada'));
    const niveis = screen.getByTestId('badge-detalhe-niveis');
    expect(niveis).toHaveTextContent('Bronze');
    expect(niveis).toHaveTextContent('10 000');
    expect(screen.getByTestId('badge-nivel-ouro')).toHaveAttribute('data-ganho', '0');
  });

  /* O botão da Carol no OUTRO caminho: aberto daqui, o salto para o chat tem
     de fechar as DUAS camadas — o detalhe e este painel — senão o atleta
     voltava da conversa e encontrava dois ecrãs empilhados. */
  it('o botão da Carol num badge por ganhar fecha o detalhe E o painel', () => {
    render(<BadgesCard />);
    const painel = abrirPorGanhar();
    fireEvent.click(within(painel).getByTestId('badge-tile-semana_100'));
    expect(screen.getByTestId('badge-detalhe-carol-legenda')).toHaveTextContent('o que podes fazer para o ganhar');

    fireEvent.click(screen.getByTestId('badge-detalhe-carol'));
    const intent = useAppStore.getState().coachIntent;
    expect(intent).toMatchObject({ kind: 'badge', badgeKey: 'semana_100', familia: 'disciplina', estado: 'empty' });
    expect(intent.pergunta).toBe('Explica-me o badge Semana 100% — o que é que ele quer dizer, e o que posso fazer para o ganhar?');
    expect(useAppStore.getState().activeTab).toBe('coach');
    expect(screen.queryByTestId('badge-detalhe-semana_100')).not.toBeInTheDocument();
    expect(screen.queryByTestId('badges-por-ganhar-sheet')).not.toBeInTheDocument();
  });

  /* O coração da doutrina 6 #6 no lado do cliente: num amuleto ou num
     contador, a pergunta que sai daqui NUNCA pede como melhorar. Perguntar
     "o que faço para ganhar a Coruja" é pedir-lhe que sugira um amuleto — e
     um amuleto sugerido deixa de ser um amuleto. Só o que é e como se ganha. */
  it('num amuleto e num badge de acumulação a pergunta só pede o que é e como se ganha', () => {
    render(<BadgesCard />);
    for (const [key, nome, familia] of [['solsticio', 'Solstício', 'amuletos'], ['escalada', 'A Escalada', 'acumulacao']]) {
      const painel = abrirPorGanhar();
      fireEvent.click(within(painel).getByTestId(`badge-tile-${key}`));
      expect(screen.getByTestId('badge-detalhe-carol-legenda')).toHaveTextContent('o que este badge significa e como se ganha');

      fireEvent.click(screen.getByTestId('badge-detalhe-carol'));
      const intent = useAppStore.getState().coachIntent;
      expect(intent, key).toMatchObject({ kind: 'badge', badgeKey: key, familia });
      expect(intent.pergunta).toBe(`Explica-me o badge ${nome} — o que é que ele quer dizer e como é que se ganha?`);
      // Nem uma palavra que peça um empurrão.
      expect(intent.pergunta, key).not.toMatch(/melhorar|mais longe|o que posso fazer/);
      useAppStore.setState({ coachIntent: null, activeTab: 'perfil' });
    }
  });

  it('fecha-se e a Vitrina fica como estava', () => {
    render(<BadgesCard />);
    const painel = abrirPorGanhar();
    fireEvent.click(within(painel).getByLabelText('Fechar'));
    expect(screen.queryByTestId('badges-por-ganhar-sheet')).not.toBeInTheDocument();
    expect(screen.getByTestId('badge-tile-z2_mestre')).toBeInTheDocument();
  });
});
