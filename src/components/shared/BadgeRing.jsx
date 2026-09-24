import React, { useEffect, useState } from 'react';
import { BedDouble, Cake, CheckCheck, Clock, Crosshair, Footprints, Gauge, Heart, Leaf, Link, Map, Milestone, Moon, Mountain, MountainSnow, Route, Ruler, Sun, Target, TrendingDown, Trophy, Watch, Zap } from 'lucide-react';

/* O badge de treino: um ANEL DE PROGRESSO COM UM NÚMERO AO CENTRO
   (utils/badges.js; desenho decidido com o utilizador, fase 2 da reforma da
   gamificação).

   O anel diz QUANTO FALTA, o número diz PORQUÊ FOI GANHO, e o glifo é
   secundário — desaparece no tamanho da grelha, porque o número aguenta-se a
   52 px e um traço fino não. Só a partir de GLIFO_MIN_SIZE (o ecrã de
   detalhe) é que ele aparece, por cima do número.

   Três estados, não dois:
     won      — anel cheio, na cor do significado;
     progress — arco parcial na proporção do progresso, com o número a mostrar
                o corrente sobre o alvo ("5/7");
     empty    — anel pontilhado a 7% de branco, e o número em cinzento a
                mostrar a melhor tentativa ("+14"), não um vazio.

   A cor é a da lei da app, e vem do badge (utils/badges.js, "A LEI DA COR"):
   ciano o treino, verde a disciplina, âmbar SÓ o que nasce de uma prova. Não
   há cor do terreno — a subida é corrida, e o --gym é o módulo ginásio.
   A pergunta que decide a cor é o que o badge MEDE: A Sequência conta provas
   e é verde, porque o que ela mede é aparecer, não correr.

   E há uma AUSÊNCIA de cor: os amuletos (a Coruja, o Solstício, os Anos…)
   são `neutro`, prata à volta do --text-3. Não é uma quarta cor de
   significado — é o contrário: um amuleto não mede desempenho nenhum, logo
   não tem significado que reclame uma cor. Um anel prateado ganho continua
   a ler-se como ganho (cheio, com o mesmo halo discreto), mas nunca se
   confunde com um badge que diz alguma coisa sobre a corrida.

   A animação é a mesma dos anéis do Início (shared/Orbit.jsx): o primeiro
   render desenha a zero e só no frame seguinte se põe o valor real — é a
   mudança de stroke-dashoffset que a transição desenha. O desfasamento entre
   vizinhos é `--stagger-rings` (tokens/motion.css), agora lido do token nos
   dois sítios em vez de 80 escrito à mão. Quem decide QUANDO é quem monta —
   na Vitrina é o useRevealAnimation da grelha. */

const VIEW = 80;
const RAIO = 33;
const TRACO = 6;
const CIRC = 2 * Math.PI * RAIO;

/** A partir daqui o glifo cabe sem disputar o espaço ao número. */
export const GLIFO_MIN_SIZE = 96;

const CORES = {
  run: 'var(--run)',
  ok: 'var(--ok)',
  race: 'var(--race)',
  neutro: 'var(--text-3)',
};

/* O tom cheio de cada significado, para a sombra do anel ganho — o
   color-mix não serve num filter: drop-shadow com variáveis encadeadas, por
   isso o valor vai literal (são os mesmos de tokens/colors.css). */
const BRILHO = {
  run: 'rgba(46,224,255,.45)',
  ok: 'rgba(52,211,153,.45)',
  race: 'rgba(251,191,36,.45)',
  // O --text-3 (#cbd5e1), e mais fraco do que os outros de propósito: um
  // amuleto ganho não se anuncia com a mesma força de um badge de treino.
  neutro: 'rgba(203,213,225,.28)',
};

const GLIFOS = {
  heart: Heart,
  trending: TrendingDown,
  steps: Footprints,
  moon: Moon,
  mountain: Mountain,
  peak: MountainSnow,
  target: Target,
  check: CheckCheck,
  moonrest: BedDouble,
  trophy: Trophy,
  // O Passo: o relâmpago da velocidade pura. Os pés (`steps`) já são da
  // cadência, e o mostrador (`gauge`) já é da escala VDOT d'Os Níveis.
  zap: Zap,
  // Os seis que vieram d'O Palmarés (fase A): os quilómetros de treino que se
  // acumulam, os marcos das distâncias de prova, o mostrador da escala VDOT,
  // a mira do objetivo batido, o mapa dos dois terrenos e o elo da série de
  // provas.
  route: Route,
  milestone: Milestone,
  gauge: Gauge,
  crosshair: Crosshair,
  map: Map,
  link: Link,
  // Os amuletos: o relógio, a estação, a rotina, o Sol, o dia de anos e a
  // fita métrica.
  clock: Clock,
  leaf: Leaf,
  watch: Watch,
  sun: Sun,
  cake: Cake,
  ruler: Ruler,
};

export const corDoBadge = (badge) => CORES[badge?.cor] || CORES.run;

/** O número encolhe com o que tem de dizer: "94" cabe folgado a 52 px,
 *  "12k/25k" não. A escala é sobre o lado do anel, não fixa em px. */
function tamanhoDoNumero(size, texto) {
  const n = (texto || '').length;
  const fator = n <= 2 ? 0.34 : n <= 3 ? 0.3 : n <= 4 ? 0.25 : n <= 5 ? 0.21 : 0.17;
  return Math.max(10, Math.round(size * fator));
}

export default function BadgeRing({ badge, size = 64, index = 0, animate = false, delay = 0 }) {
  // Igual ao Orbit: com `animate`, o primeiro pintado é a zero.
  const [drawn, setDrawn] = useState(!animate);

  useEffect(() => {
    if (!animate) { setDrawn(true); return undefined; }
    if (typeof requestAnimationFrame !== 'function') { setDrawn(true); return undefined; }
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, [animate]);

  if (!badge) return null;
  const cor = corDoBadge(badge);
  const ganho = badge.state === 'won';
  const vazio = badge.state === 'empty';
  const fracao = ganho ? 1 : Math.max(0, Math.min(1, badge.ring || 0));
  const Glifo = GLIFOS[badge.glifo] || null;
  const mostraGlifo = !!Glifo && size >= GLIFO_MIN_SIZE;
  /* `delay` (ms) é para quem não é uma grelha: no momento do badge
     (shared/BadgeMoment.jsx) o anel só parte aos 360 ms, depois de o disco
     assentar, e a folha de tempos da cerimónia é que manda. Na Vitrina fica
     a zero e o desfasamento é só o dos vizinhos. */
  const transicao = animate
    ? `stroke-dashoffset var(--dur-rings) var(--ease-out) calc(var(--stagger-rings) * ${index} + ${Math.max(0, Number(delay) || 0)}ms)`
    : 'none';

  return (
    <span
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      data-testid={`badge-ring-${badge.key}`}
      data-state={badge.state}
      data-tier={badge.tier || ''}
    >
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        {vazio ? (
          // Por ganhar: o anel pontilhado a 7% de branco. O objetivo fica à
          // vista — é o encaixe vazio dos medalhões, noutra forma.
          <circle cx={VIEW / 2} cy={VIEW / 2} r={RAIO} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={TRACO} strokeDasharray="2 6" strokeLinecap="round" />
        ) : (
          <>
            <circle cx={VIEW / 2} cy={VIEW / 2} r={RAIO} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={TRACO} />
            <circle
              cx={VIEW / 2}
              cy={VIEW / 2}
              r={RAIO}
              fill="none"
              stroke={cor}
              strokeWidth={TRACO}
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={drawn ? CIRC * (1 - fracao) : CIRC}
              style={{ filter: ganho ? `drop-shadow(0 0 5px ${BRILHO[badge.cor] || BRILHO.run})` : 'none', transition: transicao }}
            />
          </>
        )}
      </svg>

      <span className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ gap: mostraGlifo ? 2 : 0 }}>
        {mostraGlifo && (
          <Glifo size={Math.round(size * 0.16)} aria-hidden="true" style={{ color: vazio ? 'var(--text-4)' : cor, opacity: vazio ? 0.6 : 0.75 }} />
        )}
        <span
          className="font-black leading-none"
          style={{
            fontSize: tamanhoDoNumero(size, badge.centro),
            color: vazio ? 'var(--text-4)' : cor,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-.03em',
          }}
        >
          {badge.centro}
        </span>
      </span>
    </span>
  );
}
