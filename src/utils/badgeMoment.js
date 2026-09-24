/* O MOMENTO EM QUE SE GANHA UM BADGE — as regras (fase 4 da reforma da
   gamificação). O desenho está em shared/BadgeMoment.jsx; quando aparece,
   em utils/useBadgeMoment.js. Aqui só se decide, e por isso testa-se sem
   browser nenhum.

   ── AS TRÊS ESCALAS ─────────────────────────────────────────────────────
   Nem todos os badges merecem parar o ecrã, e a FAMÍLIA é quem decide:

     grande  (ecrã inteiro) — a primeira vez de um badge, o nível de ouro, ou
                              um badge que nasce do fecho de um macrociclo
                              (uma prova);
     medio   (cartão)       — um badge novo que não é nenhuma dessas coisas;
     pequeno (no lugar)     — o que a Vitrina apanha antes de a cerimónia
                              acontecer: o anel fecha na própria célula, com
                              um salto, e fica visto sem interromper nada.

   O `pequeno` não se decide aqui: é o que acontece a QUALQUER escala quando
   é a Vitrina a ver primeiro (Perfil/BadgesCard.jsx). Quem vê primeiro
   consome — repetir a cerimónia grande depois de o atleta já ter visto o
   anel fechar-se na grelha seria contar-lhe a mesma novidade duas vezes.

   ── OS AMULETOS NUNCA LEVAM A ESCALA GRANDE ─────────────────────────────
   Decorre da família, não é uma exceção: um amuleto não mede desempenho
   nenhum (correr no dia de anos não diz nada sobre como se corre), e parar o
   ecrã por ele contradiz exatamente o que ele é. A doutrina
   (coach-knowledge/06-head-coach-arbitragem.md #6) já diz que nem a Carol os
   sugere — seria estranho a app fazer uma cerimónia daquilo que a
   treinadora se recusa a propor. Médio no máximo.

   ── VÁRIOS AO MESMO TEMPO ───────────────────────────────────────────────
   Os grandes entram EM FILA (um de cada vez; o seguinte só depois de o
   anterior ser dispensado) e os médios COLAPSAM num cartão só ("2 badges
   novos") — decidido com o utilizador. A ordem é a de quando se ganhou, do
   mais antigo para o mais recente: a novidade mais fresca fica para o fim,
   que é a ordem em que aconteceram. */

/** Quantos nomes cabem na linha do cartão colapsado antes de virar "e mais
 *  N" — três é o que cabe em duas linhas num telemóvel estreito. */
const MAX_NOMES = 3;

/**
 * A escala de UM prémio. `primeiraVez` vem de fora porque só se sabe
 * olhando para a lista toda (ver `planBadgeMoments`).
 */
export function escalaDoAward(award, badge, { primeiraVez = false } = {}) {
  if (!award) return null;
  /* Um prémio de um badge que o cálculo já não conhece (uma regra afinada
     que deixou de o propor, uma linha gravada por uma versão mais nova):
     não desaparece — mas também não para o ecrã. Sem saber a família dele,
     não se pode garantir que não é um amuleto, e a dúvida resolve-se para o
     lado que não interrompe. */
  if (!badge) return 'medio';
  // A família é o que manda: um amuleto nunca para o ecrã.
  if (badge.familia === 'amuletos') return 'medio';
  // O ouro é o degrau mais alto — não há outro depois dele.
  if (award.tier === 'ouro') return 'grande';
  // Nascido de uma prova: a prova é o fecho de um macrociclo, e o que ela dá
  // fecha-o com ela.
  if (award.race_id) return 'grande';
  if (primeiraVez) return 'grande';
  return 'medio';
}

/**
 * O plano de todos os prémios por ver: cada um com o seu badge e a sua
 * escala, já pela ordem em que se ganharam.
 *
 * "Primeira vez" é o que o cálculo prova, não o que a tabela grava: se um
 * badge tem `count` ocorrências e TODAS estão por ver, então nunca nenhuma
 * foi vista — a mais antiga é a primeira vez. Com uma já vista, as novas são
 * repetições.
 *
 * @param {object[]} pending  linhas de user_badges por ver (utils/badgeAwards.js)
 * @param {object[]} badges   os badges calculados (utils/badges.js)
 * @returns {{ todos: object[], grandes: object[], medios: object[] }}
 */
export function planBadgeMoments(pending = [], badges = []) {
  const lista = Array.isArray(pending) ? pending.filter(Boolean) : [];
  const byKey = new Map((badges || []).filter(Boolean).map((b) => [b.key, b]));

  const porVerDe = new Map();
  lista.forEach((p) => porVerDe.set(p.badge_key, (porVerDe.get(p.badge_key) || 0) + 1));

  const estreias = new Set();
  porVerDe.forEach((porVer, key) => {
    const badge = byKey.get(key);
    // `count` é quantas vezes os dados provam o badge (as vezes de um badge
    // que se repete, os degraus de um com níveis). Se nenhuma foi vista, a
    // mais antiga destas é a estreia.
    if ((Number(badge?.count) || 0) - porVer <= 0) estreias.add(key);
  });

  const ordenados = [...lista].sort((a, b) => String(a.awarded_at || '').localeCompare(String(b.awarded_at || '')));
  const jaEstreou = new Set();
  const todos = ordenados.map((award) => {
    const badge = byKey.get(award.badge_key) || null;
    const primeiraVez = estreias.has(award.badge_key) && !jaEstreou.has(award.badge_key);
    if (primeiraVez) jaEstreou.add(award.badge_key);
    return { award, badge, escala: escalaDoAward(award, badge, { primeiraVez }) };
  });

  return {
    todos,
    grandes: todos.filter((e) => e.escala === 'grande'),
    medios: todos.filter((e) => e.escala === 'medio'),
  };
}

/**
 * Os médios colapsados num cartão só. Um badge mostra-se a si próprio; dois
 * ou mais mostram um anel só e dizem quantos são — o cartão nunca cresce
 * com a lista.
 *
 * @returns {{ badge, award, titulo, linha, n, ids }|null}
 */
export function colapsarMedios(medios = []) {
  const lista = (medios || []).filter(Boolean);
  if (lista.length === 0) return null;
  const ids = lista.map((e) => e.award?.id).filter(Boolean);
  const primeiro = lista[0];
  /* O anel do cartão é o do primeiro que o cálculo AINDA CONHECE: um prémio
     de um badge desaparecido (regra afinada, linha de uma versão mais nova)
     não pode ser o que tranca o cartão inteiro — ele conta na mesma, só não
     empresta o anel. */
  const comAnel = lista.find((e) => e.badge) || primeiro;
  if (lista.length === 1) {
    return {
      badge: comAnel.badge,
      award: primeiro.award,
      titulo: primeiro.award?.title || primeiro.badge?.name || 'Badge novo',
      linha: primeiro.award?.line || null,
      n: 1,
      ids,
    };
  }
  const nomes = lista.map((e) => e.award?.title || e.badge?.name).filter(Boolean);
  const mostrados = nomes.slice(0, MAX_NOMES);
  const restantes = nomes.length - mostrados.length;
  return {
    badge: comAnel.badge,
    award: primeiro.award,
    titulo: `${lista.length} badges novos`,
    linha: restantes > 0 ? `${mostrados.join(' · ')} · e mais ${restantes}` : mostrados.join(' · '),
    n: lista.length,
    ids,
  };
}

/* ── O número a contar ───────────────────────────────────────────────────
   O texto do centro do anel não é só um número: é "94", "12k", "9,8k",
   "+42s", "5/7". Conta-se a parte numérica e deixa-se o resto quieto — um
   "k" a aparecer letra a letra não diria nada a ninguém. Sem número nenhum
   ("—"), não há contagem: o texto aparece como está. */

/** { prefixo, valor, sufixo, decimais, virgula } ou null se não houver número. */
export function partesDoNumero(texto) {
  const m = /^([^\d-]*)(-?\d+(?:[.,]\d+)?)(.*)$/.exec(String(texto ?? ''));
  if (!m) return null;
  const [, prefixo, numero, sufixo] = m;
  return {
    prefixo,
    valor: Number(numero.replace(',', '.')),
    sufixo,
    decimais: (numero.split(/[.,]/)[1] || '').length,
    virgula: numero.includes(','),
  };
}

/** O texto no instante `t` (0 a 1) da contagem. */
export function textoContado(texto, t) {
  const p = partesDoNumero(texto);
  if (!p) return String(texto ?? '');
  const f = Math.min(1, Math.max(0, Number(t) || 0));
  const s = (p.valor * f).toFixed(p.decimais);
  return `${p.prefixo}${p.virgula ? s.replace('.', ',') : s}${p.sufixo}`;
}

/* A mesma curva que o CSS dá ao anel (--ease-back, cubic-bezier(.22,1,.36,1)
   em tokens/motion.css): sem isto o número e o anel partiam juntos e
   chegavam desencontrados, que é precisamente o que a folha de tempos não
   quer — "param no mesmo instante". */
const EASE_BACK = [0.22, 1, 0.36, 1];

const bezier = (a, b, u) => {
  const v = 1 - u;
  return 3 * v * v * u * a + 3 * v * u * u * b + u * u * u;
};

/** `t` (0..1) pela curva --ease-back. Bisseção: 24 passos chegam de sobra
 *  para um número que se lê, e nunca diverge. */
export function easeBack(t) {
  const x = Math.min(1, Math.max(0, Number(t) || 0));
  if (x === 0 || x === 1) return x;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (bezier(EASE_BACK[0], EASE_BACK[2], mid) < x) lo = mid; else hi = mid;
  }
  return bezier(EASE_BACK[1], EASE_BACK[3], (lo + hi) / 2);
}
