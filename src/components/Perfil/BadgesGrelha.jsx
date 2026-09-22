import React from 'react';
import { FAMILIAS } from '../../utils/badges';
import BadgeRing, { corDoBadge } from '../shared/BadgeRing';

/* A grelha de badges agrupada por família — o desenho, sem opinião nenhuma
   sobre QUE badges mostrar.

   Saiu do BadgesCard quando a Vitrina passou a mostrar só o que já está
   ganho: a mesma grelha passou a servir dois sítios com listas opostas — a
   Vitrina (os ganhos) e o painel "O que há para ganhar" (os que faltam). Os
   dois têm de desenhar-se exatamente da mesma maneira, senão o atleta vê
   duas grelhas diferentes da mesma coisa; por isso a lista chega já
   filtrada por quem monta, e aqui só se agrupa e se desenha.

   AGRUPADA POR FAMÍLIA (utils/badges.js, FAMILIAS): desempenho, disciplina,
   acumulação e amuletos, cada uma com o seu cabeçalho. Numa grelha só, um
   amuleto ficava lado a lado com o Mestre da Z2 a fingir que valia o mesmo —
   e a família existe precisamente para dizer que não vale. A ordem é a do
   peso que cada família tem, com os amuletos no fim.

   Quatro colunas: o número dentro do anel dispensa metade do rótulo, por
   isso cabem quatro onde os medalhões só levavam dois.

   "Os anéis desenham-se sempre que o ecrã aparece": quem decide QUANDO é o
   useRevealAnimation de quem monta (daí o `innerRef`, o `style` e o
   `animate` chegarem por prop); o COMO é do BadgeRing. O `key={playKey}` é
   o que faz a grelha remontar e voltar a desenhar a cada aparecimento — e
   vale nos dois sítios, incluindo dentro do painel. */

const TILE = {
  minHeight: 44,
  borderRadius: 16,
  padding: '10px 2px 8px',
  background: 'none',
  border: 'none',
};

/** O que se lê por baixo do nome: o nível ganho, ou o que falta. */
export function legendaDe(badge) {
  if (badge.tier) {
    const nivel = (badge.niveis || []).filter((n) => n.ganho).slice(-1)[0];
    return nivel ? nivel.label : null;
  }
  if (badge.state === 'won') return badge.count > 1 ? `${badge.count}×` : 'Ganho';
  if (badge.state === 'progress') return 'A caminho';
  return null;
}

/** Os grupos, pela ordem de FAMILIAS. Um badge com uma família que esta
 *  lista não conheça não desaparece do ecrã — cai num grupo "Outros", à
 *  vista. Nada some em silêncio nesta vitrina. */
export function agrupaPorFamilia(lista) {
  return [
    ...FAMILIAS
      .map((f) => ({ ...f, lista: lista.filter((b) => b.familia === f.key) }))
      .filter((g) => g.lista.length > 0),
    ...(() => {
      const orfaos = lista.filter((b) => !FAMILIAS.some((f) => f.key === b.familia));
      return orfaos.length ? [{ key: 'outros', label: 'Outros', descricao: null, lista: orfaos }] : [];
    })(),
  ];
}

export default function BadgesGrelha({
  lista,
  animate = false,
  playKey = 0,
  novos,
  onAbrir,
  innerRef,
  style,
  testId = 'badges-grelha',
  /* O que vai por baixo da grelha de CADA família — o painel põe aqui as
     regras, que é para o que ele existe; a Vitrina não passa nada e fica
     exatamente como estava. */
  rodapeDoGrupo,
}) {
  const grupos = agrupaPorFamilia(lista || []);

  return (
    <div ref={innerRef} style={style} className="flex flex-col gap-2" data-testid={testId}>
      {grupos.map((grupo) => (
        <div key={grupo.key} data-testid={`badges-familia-${grupo.key}`}>
          <div
            className="text-[10px] font-extrabold uppercase"
            style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--text-4)', padding: '2px 2px 4px' }}
          >
            {grupo.label}
          </div>
          <div className="grid grid-cols-4 gap-1">
            {grupo.lista.map((badge, i) => {
              const legenda = legendaDe(badge);
              const novo = novos?.has(badge.key) || false;
              return (
                <button
                  key={badge.key}
                  type="button"
                  data-testid={`badge-tile-${badge.key}`}
                  data-state={badge.state}
                  data-novo={novo ? 'true' : undefined}
                  aria-label={badge.centroAria || badge.name}
                  onClick={() => onAbrir?.(badge.key)}
                  className={`flex flex-col items-center gap-1.5 text-center min-w-0${novo ? ' badge-salto' : ''}`}
                  style={TILE}
                >
                  {/* `key` com o playKey: o anel só desenha ao montar, por
                      isso tem de remontar a cada aparecimento — é o padrão
                      do StatusCard com a órbita do Início. */}
                  <BadgeRing key={`${badge.key}-${playKey}`} badge={badge} size={56} index={i} animate={animate} />
                  {/* Spans: isto é um <button>, cujo conteúdo só admite
                      phrasing content (o mesmo achado de 2026-09-15 no
                      PalmaresCard). */}
                  <span className="block w-full text-[10.5px] font-extrabold leading-[1.2]" style={{ color: badge.state === 'empty' ? 'var(--text-4)' : 'var(--text-2)' }}>
                    {badge.name}
                  </span>
                  {legenda && (
                    <span className="block w-full text-[9.5px] font-extrabold uppercase leading-none" style={{ letterSpacing: '.04em', color: badge.state === 'won' ? corDoBadge(badge) : 'var(--text-4)' }}>
                      {legenda}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {rodapeDoGrupo?.(grupo)}
        </div>
      ))}
    </div>
  );
}
