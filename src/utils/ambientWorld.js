/* O MUNDO DA APP — a luz da hora e as curvas de nível.

   Nasceu dentro da sala da Carol (Welcome/CarolWelcome.jsx, canvas de
   design "Boas-vindas da Carol", 2026-09-19) e saiu para aqui quando o
   momento do badge (shared/BadgeMoment.jsx, fase 4 da reforma da
   gamificação) precisou do mesmo mundo.

   São duas coisas, e só duas:

   1. **A LUZ DA HORA** (`LOOK`) — âmbar ao amanhecer, ciano à tarde, índigo
      à noite, quase nada de madrugada, e o âmbar da prova. Não é decoração:
      abrir a app às 6h e às 23h tem de dar a sensação de horas diferentes, e
      a mesma hora tem de dar a mesma luz em toda a app. Por isso a paleta é
      UMA — duplicá-la era garantir que a sala e o momento acabavam a
      discordar sobre o que é "de noite".

   2. **AS CURVAS DE NÍVEL** (`contourRings`) — os anéis irregulares do fundo
      da app, centrados no assunto do ecrã e cada vez mais ténues. Na sala
      centram-se nela; no momento do badge centram-se no anel. O centro muda,
      o desenho não.

   O que NÃO vem para aqui: o rosto da Carol, o arco do dia e as bolhas. A
   sala é dela — partilha-se o mundo, não a protagonista. */

import { lisbonParts, slotForHour } from './carolWelcome';

/** A luz por faixa do dia, mais a da prova. `top` é o topo do gradiente de
 *  fundo; `disc` diz o que a sala desenha no arco (sol, lua ou estrelas) e
 *  não tem uso fora dela. */
export const LOOK = {
  manha: { glow1: 'radial-gradient(120% 60% at 12% 34%, rgba(251,191,36,.22), transparent 62%)', glow2: 'radial-gradient(90% 50% at 88% 10%, rgba(34,211,238,.20), transparent 60%)', top: '#0a1020', disc: 'sun' },
  tarde: { glow1: 'radial-gradient(120% 60% at 50% 6%, rgba(34,211,238,.26), transparent 62%)', glow2: 'radial-gradient(90% 50% at 90% 40%, rgba(56,189,248,.14), transparent 60%)', top: '#0b1224', disc: 'sun' },
  noite: { glow1: 'radial-gradient(120% 60% at 82% 16%, rgba(99,102,241,.26), transparent 62%)', glow2: 'radial-gradient(90% 50% at 10% 46%, rgba(34,211,238,.12), transparent 60%)', top: '#080c1a', disc: 'moon' },
  madrugada: { glow1: 'radial-gradient(120% 60% at 50% 18%, rgba(34,211,238,.08), transparent 62%)', glow2: 'radial-gradient(90% 50% at 15% 70%, rgba(79,70,229,.10), transparent 60%)', top: '#05070f', disc: 'none' },
  prova: { glow1: 'radial-gradient(120% 60% at 50% 30%, rgba(251,191,36,.30), transparent 62%)', glow2: 'radial-gradient(90% 50% at 10% 8%, rgba(217,119,6,.18), transparent 60%)', top: '#0c0f1a', disc: 'sun' },
};

/** A chave da luz para um instante (hora de Lisboa, como a sala). */
export function lookKeyForNow(now = new Date()) {
  return slotForHour(lisbonParts(now).hour);
}

/** O fundo inteiro de um ecrã com esta luz: os dois clarões por cima do
 *  gradiente que fecha em preto. É uma string de `background`. */
export function ambientBackground(look) {
  const l = look || LOOK.manha;
  return `${l.glow1}, ${l.glow2}, linear-gradient(180deg, ${l.top} 0%, #070a14 58%, #05070f 100%)`;
}

/**
 * As curvas de nível à volta de um ponto: anéis irregulares, cada vez mais
 * ténues. Não dependem de nada (mesma entrada, mesma saída) — quem as usa
 * calcula-as uma vez.
 *
 * @returns {{points: string, opacity: number}[]} pontos para um <polyline>.
 */
export function contourRings({ cx, cy, count = 7, base = 62, step = 30, rx = 1.08, ry = 0.92 } = {}) {
  return Array.from({ length: count }, (_, i) => {
    const r = base + i * step;
    const pts = [];
    for (let k = 0; k <= 48; k++) {
      const a = (2 * Math.PI * k) / 48;
      const wob = 1 + 0.045 * Math.sin(3 * a + i * 0.9) + 0.03 * Math.cos(5 * a - i * 1.3);
      pts.push(`${(cx + r * wob * Math.cos(a) * rx).toFixed(1)},${(cy + r * wob * Math.sin(a) * ry).toFixed(1)}`);
    }
    return { points: pts.join(' '), opacity: Math.max(0.035, 0.2 - i * 0.026) };
  });
}
