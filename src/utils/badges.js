/* Os badges — a Vitrina (reforma da gamificação, fase 2).

   Nasceram como a segunda vitrina, ao lado d'O Palmarés: este ficheiro
   contava a vida dos dias ENTRE as provas — o que se faz de segunda a
   domingo e que não dava prémio nenhum: a semana cumprida, o descanso
   respeitado, o treino inteiro em Z2, a subida que se acumula. Na fase A os
   seis medalhões foram portados para cá e na fase C o Palmarés saiu: hoje
   isto conta as duas vidas, a de treino e a de prova, e é a única coleção
   da app.

   É uma VISTA do motor dos prémios (utils/premios.js), ao lado das
   conquistas de cada prova. As regras da casa são as mesmas e não se
   reabrem aqui:

   1. **O relógio entra sempre** — `today` (ISO `YYYY-MM-DD`) é obrigatório
      (`requireToday`); nada aqui chama `new Date()`.
   2. **Uma prova com data no futuro não conta** — quem precisa de provas
      pergunta a `completedRaces`, que já filtra.

   ── A LEI DA COR ────────────────────────────────────────────────────────
   Uma cor, um significado, como no resto da app:
     `run`  (ciano --run)  o treino de corrida em si;
     `ok`   (verde --ok)   a disciplina: fazer o que estava combinado;
     `race` (âmbar --race) SÓ o que nasce de uma prova.
   Nenhum badge de treino é âmbar, e nenhum badge de prova é ciano. Os âmbar
   são cinco, e são-no todos pela mesma razão — só uma prova os dá: o
   `recorde_pessoal`, `distancias`, `niveis`, `superacao` e `terreno` (estes
   quatro vieram d'O Palmarés na fase A, quando os badges passaram a
   substituir os medalhões).

   E UM BADGE DE PROVA QUE NÃO É ÂMBAR: a `sequencia` é verde. Não é exceção
   nenhuma à lei — é a lei a funcionar. O que ela mede não é a prova, é
   APARECER a ela com a corrida registada, e isso é disciplina como a Semana
   100%. Uma série de provas não se corre melhor: cumpre-se. A pergunta que
   decide a cor é sempre "o que é que isto mede", nunca "de que tabela saiu o
   dado".

   E UM BADGE QUE CONTA PROVAS E MESMO ASSIM É CIANO: `melhor_passo` (O
   Passo) mede o passo mais rápido de sempre, e esse tanto pode nascer numa
   prova como numa série de terça-feira. Conta as duas, logo não NASCE de uma
   prova — e o âmbar é só para o que nasce. A mesma pergunta de sempre, a
   mesma resposta: a cor vem do que se mede.

   NÃO HÁ COR DO TERRENO, e é de propósito. A subida é corrida — trail é
   corrida — por isso a Cabra-montesa e A Escalada são `run` como as outras.
   Houve uma versão desta lista que lhes deu `--gym` "a cor do terreno":
   estava errada. O --gym é o módulo ginásio e mais nada, e a primeira linha
   de tokens/colors.css é justamente "nunca reutilizar uma cor para outro
   fim". Inventar um significado novo para uma cor que já tem dono é como se
   desfaz uma linguagem visual.

   E HÁ UMA AUSÊNCIA DE COR: `neutro` (prata, à volta do --text-3), que é o
   que os AMULETOS levam. Não é uma quarta cor a somar à lei — é a lei levada
   até ao fim. Uma cor de significado diz "isto mede alguma coisa do teu
   treino"; um amuleto não mede nada (correr no dia do teu aniversário não
   diz nada sobre como corres), logo não tem significado nenhum a reclamar, e
   pintá-lo de ciano era mentir-lhe sobre o que ele é. A Coruja era `run` até
   aqui — foi o primeiro caso a mudar, e é o que torna a regra visível: a
   hora a que se corre não é melhor nem pior, é só uma curiosidade.

   ── AS FAMÍLIAS ─────────────────────────────────────────────────────────
   Cada badge declara uma `familia` (ver FAMILIAS, logo abaixo), e a Vitrina
   agrupa-os por ela em vez de os despejar numa grelha só.

   Isto NÃO é arrumação cosmética: a família é o que diz à Carol quais os
   badges que ela nunca pode sugerir — a doutrina 6 #6
   (src/coach-knowledge/06-head-coach-arbitragem.md) nomeia `acumulacao` e
   `amuletos` à letra. Até aqui a única etiqueta que um badge tinha era a
   cor, e a cor não chega para isso: A Escalada e o Mestre da Z2 são os dois
   ciano e são coisas opostas — uma soma metros (e empurrar alguém a somá-los
   mais depressa é exatamente o comportamento que não se quer induzir), a
   outra mede como se correu um treino.

   ── O DADO QUE FALTA ────────────────────────────────────────────────────
   Metade destas regras vive de campos OPCIONAIS de `runs.details`
   (`hr_zones`, `splits`, `elevation_gain_m`, `cadence_spm`) — campos que
   muita gente nunca preenche (é por isso que existe o
   `detectMissingRunMetrics` do registo de corrida, que os pede). Uma sessão
   sem o campo que a regra exige **não conta nem a favor nem contra**: fica
   INDETERMINADA, é contada à parte, e o ecrã de detalhe diz quantas são,
   porquê, e o que fazer para as resolver.
   Sem isto, um badge ficaria por ganhar em silêncio e o atleta nunca saberia
   se lhe faltava correr ou preencher.

   Cada badge diz, no seu bloco: a chave, a frase da regra, o campo de que
   depende, o que acontece quando esse campo falta, a cor e se tem níveis.

   ── O QUE SE PERSISTE, E O QUE NÃO ──────────────────────────────────────
   Tudo o que está aqui se RECALCULA dos dados. A tabela `user_badges`
   (migração 20260922120000_user_badges.sql, escrita e por aplicar) guarda só
   o que não se recalcula: QUANDO se ganhou, as REPETIÇÕES (uma linha por
   `period_key`, contadas com `count(*)` — nunca um contador mutável) e se o
   atleta já VIU. O estado "a caminho" não se persiste: é cálculo do dia.
   A lista `due` que `computeBadges` devolve é o que `utils/badgeAwards.js`
   sincroniza, como o `due` dos medalhões. */

import {
  DISTANCIAS_DE_PROVA,
  TERRENOS,
  addDays,
  bateuObjetivo,
  bateuRecordePessoal,
  completedRaces,
  dayOf,
  distanciaDeProva,
  fmtKmLinha,
  kmDeProva,
  newestFirst,
  plural,
  provasDoTerreno,
  requireToday,
  runKindLabel,
  varrerSequencia,
} from './premios';
import { formatDuration, formatPace, raceDistanceLabel } from './run';
import { formatDatePTShort } from './racePlanEngine';
import { calculateVDOT } from '@formulas/racePrediction.ts';
import { computeBestPace } from '@formulas/bestPace.ts';
import { evaluatePrescriptions, executionBase } from '@formulas/prescriptionAdherence.ts';

/** As quatro famílias, pela ordem em que a Vitrina as mostra: primeiro o que
 *  mede a corrida, depois o que mede o cumprimento, depois o que só soma, e
 *  no fim o que não mede nada.
 *
 *  A ordem é a da importância para o atleta, e o fim da lista é deliberado:
 *  os amuletos ficam por último porque é esse o peso que têm. */
export const FAMILIAS = [
  { key: 'desempenho', label: 'Desempenho', descricao: 'O que mede como corres.' },
  { key: 'disciplina', label: 'Disciplina', descricao: 'O que mede se fizeste o combinado.' },
  { key: 'acumulacao', label: 'Acumulação', descricao: 'O que soma quantidade ao longo do tempo.' },
  { key: 'amuletos', label: 'Amuletos', descricao: 'O que não mede desenvolvimento nenhum.' },
];

export const FAMILIA_KEYS = FAMILIAS.map((f) => f.key);

/** A ordem da grelha da Vitrina, agora DENTRO de cada família (a grelha
 *  agrupa por FAMILIAS, e esta lista é a ordem dentro de cada grupo).
 *
 *  A lógica de sempre, que a fase A não mudou: dentro de cada família, o que
 *  nasce de um dia de treino vem primeiro e o que nasce de uma prova vem no
 *  fim. O Passo conta as duas, e fica do lado do treino porque não precisa
 *  de prova nenhuma para se ganhar. Os badges de prova são os âmbar, e
 *  ficarem juntos no fim de cada família é o que faz a cor ler-se como um
 *  bloco em vez de salpicos.
 *
 *  Desempenho: primeiro como se corre (Z2, negative split, cadência, O
 *  Passo), depois o terreno de treino (Cabra-montesa, À medida da prova, que
 *  partilham o D+), e as cinco de prova a fechar — a primeira vez em cada
 *  distância e em cada terreno, a escala, o objetivo batido, e o recorde
 *  pessoal no fim, que é o mais difícil dos cinco.
 *  Disciplina: as duas semanas da Carol primeiro (Semana 100%, Descanso
 *  cumprido) e A Sequência a seguir — é disciplina também, mas conta-se em
 *  provas, não em semanas.
 *  Acumulação: os quilómetros antes dos metros de subida. É a medida base da
 *  corrida, e toda a gente a tem (a distância vem em qualquer registo; o D+
 *  falta em metade deles).
 *  Amuletos: a Coruja abre, porque é a mais antiga; os outros seis vêm a
 *  seguir, do relógio para o calendário e daí para a fita métrica. */
export const BADGE_KEYS = [
  // desempenho
  'z2_mestre',
  'negative_split',
  'cadencia_corrigida',
  'melhor_passo',
  'cabra_montesa',
  'medida_da_prova',
  'distancias',
  'terreno',
  'niveis',
  'superacao',
  'recorde_pessoal',
  // disciplina
  'semana_100',
  'descanso_cumprido',
  'sequencia',
  // acumulação
  'quilometros',
  'escalada',
  // amuletos
  'coruja',
  'volta_ao_relogio',
  'relogio_suico',
  'quatro_estacoes',
  'solsticio',
  'anos',
  'numero_certo',
];

/** Os três degraus dos badges com níveis. A chave vai para a COLUNA `tier` de
 *  `user_badges` — não enfiada no `period_key`, que foi a dívida que o
 *  Palmarés contraiu para evitar uma migração (ver a migração). */
export const NIVEIS = [
  { key: 'bronze', label: 'Bronze' },
  { key: 'prata', label: 'Prata' },
  { key: 'ouro', label: 'Ouro' },
];

// ── Números e texto ──────────────────────────────────────────────────────

function num(v) {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "1 240": espaço de milhar, como o resto da app. */
const milhares = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const round1 = (v) => Math.round(v * 10) / 10;

/** Metros para o NÚMERO DENTRO DO ANEL, onde só cabem 3 ou 4 caracteres:
 *  "12k" a partir dos 10 000, "9,8k" a partir dos 1 000, "800" abaixo disso.
 *  A frase do detalhe diz o número inteiro — aqui é a leitura de relance. */
function fmtMetrosCurto(m) {
  const v = Math.max(0, Math.round(m || 0));
  if (v >= 10000) return `${Math.round(v / 1000)}k`;
  if (v >= 1000) return `${String(round1(v / 1000)).replace('.', ',')}k`;
  return milhares(v);
}

const fmtMetros = (m) => `${milhares(Math.round(Math.max(0, m || 0)))} m`;

/** "+42s" / "+1:12" — o que falta, para o número cinzento de um badge por
 *  ganhar que já teve tentativas em tempo. */
function fmtFaltaSegundos(seconds) {
  const s = Math.max(1, Math.round(seconds || 0));
  return s < 60 ? `+${s}s` : `+${formatDuration(s)}`;
}

// ── Semanas ──────────────────────────────────────────────────────────────

/* A semana da app é de segunda a domingo (é a do Calendário e a do plano da
   Carol). Como em `utils/premios.js`, a aritmética faz-se em UTC sobre a
   string `YYYY-MM-DD`: `new Date(iso)` sem hora fixa, à meia-noite em Lisboa,
   ainda é o dia anterior em UTC. */
export function segundaDe(iso) {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(iso, -((dow + 6) % 7));
}

/** "semana de 7 set 2026" — o nome de um período semanal numa frase. */
const labelSemana = (segunda) => `semana de ${formatDatePTShort(segunda)}`;

// ── A forma de um badge ──────────────────────────────────────────────────

/* Três estados, não dois (desenho decidido com o utilizador):

   - `won`      — anel cheio na cor do significado; o número diz o feito;
   - `progress` — arco parcial na proporção de `ring`; o número é o corrente
                  sobre o alvo ("5/7");
   - `empty`    — anel pontilhado; o número, a cinzento, é a MELHOR TENTATIVA
                  ("+14" = faltaram 14), não um vazio.

   `centro` é o texto dentro do anel; `centroAria` é a frase que o leitor de
   ecrã diz por ele (um "5/7" lido em voz alta não quer dizer nada). */
function badge(fields) {
  return {
    key: '',
    name: '',
    rule: '',
    // Sem valor por omissão de propósito: um badge sem família é um badge
    // que a Carol não sabe classificar, e isso tem de rebentar no teste, não
    // cair silenciosamente em 'desempenho'.
    familia: null,
    cor: 'run',
    glifo: null,
    campo: null,
    campoLabel: null,
    dependeDe: null,
    comoResolver: null,
    niveis: null,
    tier: null,
    state: 'empty',
    ring: 0,
    centro: '—',
    centroAria: '',
    linha: null,
    detalhe: null,
    value: null,
    unidade: null,
    count: 0,
    awardedOn: null,
    sessoes: [],
    indeterminadas: null,
    ...fields,
  };
}

/* Uma sessão na lista do detalhe. `status` é o que o ecrã explica:
     'conta'          — cumpriu a regra (é uma das que deram o badge);
     'falhou'         — tinha o dado e não chegou lá;
     'indeterminada'  — faltava o dado, e por isso não pesou para nenhum lado.
   `kind` decide o que se abre ao tocar:
   'race' abre o hub da prova, 'run' abre o registo da corrida, e o resto
   ('semana') não abre nada — uma semana não é um registo. */
function sessaoDaCorrida(run, { status, porque, meta }) {
  return {
    kind: 'run',
    id: run?.id ?? null,
    runId: run?.id ?? null,
    raceId: null,
    date: dayOf(run?.date),
    title: run?.name || runKindLabel(run),
    meta,
    status,
    porque,
  };
}

/* Uma PROVA na lista do detalhe — o par de `sessaoDaCorrida` para os badges
   que nascem de provas. `kind: 'race'` é o que manda o toque abrir o hub da
   prova e não o registo solto da corrida.

   Viveu dentro do `recorde_pessoal` enquanto ele foi o único badge de prova.
   Deixou de o ser na fase A (As Distâncias, Os Níveis, A Superação, O
   Terreno e A Sequência vieram d'O Palmarés), e uma segunda cópia era a
   forma garantida de duas listas chamarem nomes diferentes à mesma prova. */
const linhaDaProva = ({ race, outcome }) => [
  raceDistanceLabel(Number(race?.distance_km) || null),
  outcome?.officialSeconds ? formatDuration(outcome.officialSeconds) : null,
].filter(Boolean).join(' · ');

function sessaoDaProva(entry, { status, porque, meta }) {
  const { race, outcome } = entry;
  return {
    kind: 'race',
    id: race?.id ?? null,
    raceId: race?.id ?? null,
    runId: outcome?.runId ?? null,
    date: dayOf(race?.date),
    title: race?.name || 'Prova sem nome',
    // Sem `meta` própria, a linha de sempre: a distância e o tempo oficial.
    meta: meta ?? linhaDaProva(entry),
    status,
    porque,
  };
}

/** O bloco do "dado em falta" que o ecrã de detalhe mostra. Null quando não
 *  ficou nenhuma sessão por decidir. */
function blocoIndeterminadas(lista, { campoLabel, comoResolver }) {
  if (!lista.length) return null;
  return {
    n: lista.length,
    campoLabel,
    comoResolver,
    frase: `${lista.length} ${plural(lista.length, 'sessão ficou', 'sessões ficaram')} por decidir: ${plural(lista.length, 'não tem', 'não têm')} ${campoLabel}. ${plural(lista.length, 'Não conta', 'Não contam')} nem a favor nem contra.`,
  };
}

// ── Os badges de MEDIDA ──────────────────────────────────────────────────

/* Três badges partilham a mesma mecânica: cada sessão candidata tem uma
   MEDIDA (uma percentagem, um rácio) e cumpre a regra quando chega ao alvo.
   O que muda de um para o outro é o que se mede, o alvo e as palavras — por
   isso a varredura vive aqui uma vez.

   `medir(run)` devolve o número, ou `null` quando falta o campo — e é esse
   `null` que cria a sessão indeterminada. Nunca devolver 0 por falta de
   dado: 0 é uma medida real e conta como tentativa falhada. */
function badgeDeMedida({
  key, name, rule, familia, cor, glifo, campo, campoLabel, dependeDe, comoResolver,
  alvo, unidade, candidatas, medir, descreveMedida, fmtCentro, fmtFalta,
  semCandidatas, linhaDue,
}) {
  const contam = [];
  const falharam = [];
  const indeterminadas = [];
  for (const run of candidatas) {
    const medida = medir(run);
    if (medida == null) { indeterminadas.push(run); continue; }
    (medida >= alvo ? contam : falharam).push({ run, medida });
  }

  const ganhas = [...contam].sort((a, b) => (dayOf(b.run.date) || '').localeCompare(dayOf(a.run.date) || ''));
  const melhorGanha = contam.reduce((m, c) => (!m || c.medida > m.medida ? c : m), null);
  const melhorFalhada = falharam.reduce((m, c) => (!m || c.medida > m.medida ? c : m), null);

  const sessoes = newestFirst([
    ...contam.map(({ run, medida }) => sessaoDaCorrida(run, { status: 'conta', meta: descreveMedida(medida, run), porque: 'Cumpriu a regra.' })),
    // O "+" é do número dentro do anel ("+14" = faltaram 14); numa frase
    // inteira só estorva.
    ...falharam.map(({ run, medida }) => sessaoDaCorrida(run, { status: 'falhou', meta: descreveMedida(medida, run), porque: `Ficou a ${fmtFalta(alvo - medida).replace('+', '')} do alvo.` })),
    ...indeterminadas.map((run) => sessaoDaCorrida(run, { status: 'indeterminada', meta: run?.distance_km ? fmtKmLinha(num(run.distance_km)) : null, porque: `Sem ${campoLabel} no registo.` })),
  ]);

  const due = ganhas.map(({ run, medida }) => ({
    badgeKey: key,
    tier: '',
    // Uma linha por corrida: as repetições contam-se com count(*) sobre as
    // linhas, e assim cada uma guarda a SUA data.
    periodKey: String(run.id ?? dayOf(run.date) ?? ''),
    value: round1(medida),
    valueUnit: unidade,
    raceId: null,
    awardedOn: dayOf(run.date),
    title: name,
    line: linhaDue({ run, medida }),
  }));

  const comum = {
    key, name, rule, familia, cor, glifo, campo, campoLabel, dependeDe, comoResolver,
    unidade,
    sessoes,
    indeterminadas: blocoIndeterminadas(indeterminadas, { campoLabel, comoResolver }),
  };

  if (melhorGanha) {
    const ultima = ganhas[0];
    return {
      badge: badge({
        ...comum,
        state: 'won',
        ring: 1,
        centro: fmtCentro(melhorGanha.medida),
        centroAria: `${name}: ganho, ${descreveMedida(melhorGanha.medida, melhorGanha.run)}`,
        value: round1(melhorGanha.medida),
        count: contam.length,
        awardedOn: dayOf(ultima.run.date),
        linha: contam.length > 1
          ? `${contam.length} vezes · a última a ${formatDatePTShort(dayOf(ultima.run.date))}`
          : `ganho a ${formatDatePTShort(dayOf(ultima.run.date))}`,
        detalhe: descreveMedida(melhorGanha.medida, melhorGanha.run),
      }),
      due,
    };
  }

  if (melhorFalhada) {
    return {
      badge: badge({
        ...comum,
        state: 'empty',
        // O anel pontilhado não mede nada — a proporção da melhor tentativa
        // vive no número, que é onde se lê "quanto faltou".
        ring: 0,
        centro: fmtFalta(alvo - melhorFalhada.medida),
        centroAria: `${name}: por ganhar. A melhor tentativa ficou a ${fmtFalta(alvo - melhorFalhada.medida)} do alvo`,
        linha: `a melhor tentativa: ${descreveMedida(melhorFalhada.medida, melhorFalhada.run)}, a ${formatDatePTShort(dayOf(melhorFalhada.run.date))}`,
      }),
      due: [],
    };
  }

  return {
    badge: badge({
      ...comum,
      state: 'empty',
      ring: 0,
      centro: fmtCentro(alvo),
      centroAria: `${name}: por ganhar. ${rule}`,
      linha: indeterminadas.length ? `${indeterminadas.length} ${plural(indeterminadas.length, 'sessão sem', 'sessões sem')} ${campoLabel}` : semCandidatas,
    }),
    due: [],
  };
}

// ── 1. Mestre da Z2 ──────────────────────────────────────────────────────

/* chave     z2_mestre
   regra     "Um treino de 45 minutos ou mais com 90% do tempo em Z1 ou Z2."
   campo     runs.details.hr_zones — [{ zone, minutes }]
   em falta  o treino fica INDETERMINADO: sem zonas não há forma de saber se
             foi fácil ou não, e inventar um valor era pior do que não contar.
   cor       --run (é treino de corrida)
   família   desempenho — e é um dos casos duvidosos. Podia argumentar-se
             `disciplina`: fazer o treino fácil fácil é obedecer, e é das
             coisas que mais custa obedecer. Fica em desempenho porque o que
             o badge LÊ é a fisiologia da sessão (a distribuição do tempo por
             zona), não o que estava combinado — ganha-se sem plano nenhum, e
             um badge de disciplina sem plano não faz sentido.
   níveis    não — repete-se, uma linha por treino.

   Porquê 45 minutos: abaixo disso a percentagem em Z2 diz mais sobre o
   aquecimento do que sobre o treino. A duração sai de `duration_seconds` e,
   sem ela, da soma dos minutos das próprias zonas — um relógio que dá zonas
   dá sempre o total. */
const Z2_MINUTOS = 45;
const Z2_ALVO_PCT = 90;

function minutosDasZonas(run) {
  const zonas = run?.details?.hr_zones;
  if (!Array.isArray(zonas) || zonas.length === 0) return null;
  let total = 0;
  let faceis = 0;
  for (const z of zonas) {
    const m = num(z?.minutes);
    const zona = Number(z?.zone);
    if (!m || !Number.isFinite(zona)) continue;
    total += m;
    if (zona <= 2) faceis += m;
  }
  return total > 0 ? { total, faceis } : null;
}

function duracaoMinutos(run) {
  const segundos = num(run?.duration_seconds);
  if (segundos) return segundos / 60;
  const zonas = minutosDasZonas(run);
  return zonas ? zonas.total : null;
}

function z2Mestre({ treinos }) {
  const candidatas = treinos.filter((r) => (duracaoMinutos(r) || 0) >= Z2_MINUTOS);
  return badgeDeMedida({
    key: 'z2_mestre',
    name: 'Mestre da Z2',
    rule: `Um treino de ${Z2_MINUTOS} minutos ou mais com ${Z2_ALVO_PCT}% do tempo em Z1 ou Z2.`,
    familia: 'desempenho',
    cor: 'run',
    glifo: 'heart',
    campo: 'details.hr_zones',
    campoLabel: 'as zonas de frequência cardíaca',
    dependeDe: 'Precisa das zonas de frequência cardíaca no registo da corrida.',
    comoResolver: 'Abre o registo da corrida e preenche os minutos por zona — o relógio dá-os no resumo do treino.',
    alvo: Z2_ALVO_PCT,
    unidade: 'pct',
    candidatas,
    medir: (run) => {
      const z = minutosDasZonas(run);
      return z ? (z.faceis / z.total) * 100 : null;
    },
    descreveMedida: (pct) => `${Math.round(pct)}% do tempo em Z1-Z2`,
    fmtCentro: (pct) => String(Math.round(pct)),
    fmtFalta: (delta) => `+${Math.max(1, Math.round(delta))}`,
    semCandidatas: `ainda sem treinos de ${Z2_MINUTOS} minutos com zonas registadas`,
    linhaDue: ({ medida }) => `${Math.round(medida)}% do treino em Z1-Z2 — o esforço fácil feito a sério.`,
  });
}

// ── 2. Negative split ────────────────────────────────────────────────────

/* chave     negative_split
   regra     "Uma corrida de 8 km ou mais com a segunda metade pelo menos 1%
             mais rápida do que a primeira."
   campo     runs.details.splits — [{ distance_km, time_seconds }]
   em falta  INDETERMINADA: sem parciais não há duas metades para comparar.
   cor       --run
   família   desempenho — gestão de esforço é como se corre.
   níveis    não — repete-se.

   O 1% é a folga do relógio: uma segunda metade "mais rápida" por meio
   segundo em 40 minutos é ruído de GPS, não gestão de esforço. O parcial que
   cai em cima do meio reparte-se pela fração exata — cortar no parcial
   inteiro dava metades de tamanhos diferentes e ritmos que não eram os
   ritmos. */
const NEG_SPLIT_KM = 8;
const NEG_SPLIT_ALVO_PCT = 1;

function metadesDosSplits(run) {
  const lista = (Array.isArray(run?.details?.splits) ? run.details.splits : [])
    .map((s) => ({ km: num(s?.distance_km), secs: num(s?.time_seconds) }))
    .filter((s) => s.km && s.secs);
  if (lista.length < 2) return null;
  const total = lista.reduce((s, x) => s + x.km, 0);
  const meio = total / 2;
  let acumulado = 0;
  let secs1 = 0;
  let secs2 = 0;
  for (const s of lista) {
    const antes = acumulado;
    const depois = acumulado + s.km;
    if (depois <= meio) secs1 += s.secs;
    else if (antes >= meio) secs2 += s.secs;
    else {
      const fracao = (meio - antes) / s.km;
      secs1 += s.secs * fracao;
      secs2 += s.secs * (1 - fracao);
    }
    acumulado = depois;
  }
  if (secs1 <= 0 || secs2 <= 0) return null;
  return { ritmo1: secs1 / meio, ritmo2: secs2 / (total - meio) };
}

function negativeSplit({ treinos }) {
  const candidatas = treinos.filter((r) => (num(r?.distance_km) || 0) >= NEG_SPLIT_KM);
  return badgeDeMedida({
    key: 'negative_split',
    name: 'Negative split',
    rule: `Uma corrida de ${NEG_SPLIT_KM} km ou mais com a segunda metade pelo menos ${NEG_SPLIT_ALVO_PCT}% mais rápida do que a primeira.`,
    familia: 'desempenho',
    cor: 'run',
    glifo: 'trending',
    campo: 'details.splits',
    campoLabel: 'os parciais por quilómetro',
    dependeDe: 'Precisa dos parciais por quilómetro no registo da corrida.',
    comoResolver: 'Abre o registo da corrida e acrescenta os parciais (distância e tempo de cada troço) — é o que o relógio chama voltas.',
    alvo: NEG_SPLIT_ALVO_PCT,
    unidade: 'pct',
    candidatas,
    medir: (run) => {
      const m = metadesDosSplits(run);
      return m ? ((m.ritmo1 - m.ritmo2) / m.ritmo1) * 100 : null;
    },
    descreveMedida: (pct) => (pct >= 0
      ? `segunda metade ${round1(pct).toString().replace('.', ',')}% mais rápida`
      : `segunda metade ${round1(-pct).toString().replace('.', ',')}% mais lenta`),
    fmtCentro: (pct) => `${Math.max(1, Math.round(pct))}%`,
    fmtFalta: (delta) => `+${Math.max(1, Math.round(delta))}%`,
    semCandidatas: `ainda sem corridas de ${NEG_SPLIT_KM} km com parciais registados`,
    linhaDue: ({ medida }) => `Segunda metade ${round1(medida).toString().replace('.', ',')}% mais rápida do que a primeira — esforço bem gerido.`,
  });
}

// ── 3. Cabra-montesa ─────────────────────────────────────────────────────

/* chave     cabra_montesa
   regra     "Um treino de 8 km ou mais com 50 metros de subida por km."
   campo     runs.details.elevation_gain_m (com runs.distance_km)
   em falta  INDETERMINADA: sem D+ não se sabe se foi montanha ou passeio.
   cor       --run (a subida é corrida, não ginásio)
   família   desempenho, e foi decisão de quem escreveu isto — a alternativa
             era `acumulacao`, por ser o badge do D+ ao lado d'A Escalada. É
             desempenho porque o que mede é UMA SESSÃO, não um total: 50 m de
             subida por quilómetro durante 8 km é uma coisa que o atleta ou
             consegue ou não consegue naquele dia, e nenhum quilómetro a mais
             acumulado a torna mais fácil. A Escalada é que soma. Isto é a
             diferença entre "levantei 100 kg" e "levantei 40 toneladas ao
             longo do ano": só a segunda é uma acumulação.
             A consequência prática é a que interessa: a Carol PODE falar
             disto antes de acontecer ("este fim de semana dava uma saída de
             montanha"), e NÃO pode falar d'A Escalada.
   níveis    não — repete-se.

   Os 50 m/km são a banda "montanha" de ELEVATION_RATIO_BANDS (utils/run.js),
   a mesma régua que o coach usa para classificar o terreno de uma prova de
   trail — não um número novo. O valor gravado na linha é o D+ TOTAL em
   metros (a coluna `value_unit` fala em 'metros'); o rácio recalcula-se. */
const CABRA_KM = 8;
const CABRA_ALVO_RACIO = 50;

function cabraMontesa({ treinos }) {
  const candidatas = treinos.filter((r) => (num(r?.distance_km) || 0) >= CABRA_KM);
  return badgeDeMedida({
    key: 'cabra_montesa',
    name: 'Cabra-montesa',
    rule: `Um treino de ${CABRA_KM} km ou mais com ${CABRA_ALVO_RACIO} metros de subida por quilómetro.`,
    familia: 'desempenho',
    cor: 'run',
    glifo: 'mountain',
    campo: 'details.elevation_gain_m',
    campoLabel: 'o desnível positivo',
    dependeDe: 'Precisa do D+ (ganho de altimetria) no registo da corrida.',
    comoResolver: 'Abre o registo da corrida e preenche o D+ (ganho de altimetria) — vem no resumo do relógio.',
    alvo: CABRA_ALVO_RACIO,
    unidade: 'metros',
    candidatas,
    medir: (run) => {
      const dmais = num(run?.details?.elevation_gain_m);
      const km = num(run?.distance_km);
      return dmais && km ? dmais / km : null;
    },
    descreveMedida: (racio, run) => `${Math.round(racio)} m/km · ${fmtMetros(num(run?.details?.elevation_gain_m) || 0)} em ${fmtKmLinha(num(run?.distance_km) || 0)}`,
    fmtCentro: (racio) => String(Math.round(racio)),
    fmtFalta: (delta) => `+${Math.max(1, Math.round(delta))}`,
    semCandidatas: `ainda sem treinos de ${CABRA_KM} km com D+ registado`,
    linhaDue: ({ medida }) => `${Math.round(medida)} metros de subida por quilómetro — terreno de montanha.`,
  });
}

// ── 4. À medida da prova ─────────────────────────────────────────────────

/* chave     medida_da_prova
   regra     "Uma saída de 8 km ou mais com o desnível por quilómetro que a
             tua prova principal exige."
   campo     runs.details.elevation_gain_m (com runs.distance_km), e do outro
             lado race_events.elevation_gain_m / distance_km da prova com
             `race_priority = 'a'` agendada (RACE_PRIORITIES, utils/run.js)
   em falta  duas faltas diferentes, e dizem-se as duas:
             · sem prova principal marcada, ou com ela sem D+ preenchido, NÃO
               HÁ ALVO — e o badge diz isso em vez de ficar um anel vazio sem
               explicação. Não é "por ganhar", é "não há a que apontar";
             · uma corrida sem D+ no registo fica INDETERMINADA, como na
               Cabra-montesa e n'A Escalada.
   cor       --run (a subida é corrida)
   família   desempenho — mede preparação para o objetivo, que é o
             desempenho visto do lado do que ainda falta.
   níveis    não — repete-se, uma linha por saída.

   ── PORQUE É QUE ISTO NÃO É OUTRA CABRA-MONTESA ─────────────────────────
   A Cabra-montesa tem uma régua fixa (50 m/km, a banda "montanha") e é a
   mesma para toda a gente. Esta é a régua DA PROVA DO ATLETA: quem tem uma
   maratona de estrada à frente não ganha nada em acumular montanha, e quem
   tem um trail de 70 m/km não fica preparado com saídas de 30. O mesmo
   treino é específico para um e irrelevante para o outro — e é essa
   diferença que este badge existe para mostrar. É também por isso que o alvo
   MUDA quando o atleta muda a prova principal: o badge não guarda um número,
   guarda uma pergunta.

   A medida é uma RAZÃO ENTRE RAZÕES — o D+/km da saída a dividir pelo D+/km
   que a prova exige, em percentagem, alvo 100. Assim a mesma régua serve
   todas as provas sem inventar limiares novos, e o número que o atleta lê
   ("118%") responde diretamente à pergunta "isto chega?".

   ── O QUE NÃO SE PENEIRA, e porquê ──────────────────────────────────────
   NÃO se filtra por `training_type = 'trail'`. Uma saída com o D+/km de uma
   prova de montanha é uma saída de trail, tenha o atleta escrito o que
   tiver no tipo de treino — o terreno prova-se pelo desnível, não pela
   etiqueta. Filtrar pelo tipo só acrescentaria uma forma de o badge não
   contar uma saída que contou mesmo.

   Uma prova principal PLANA (ou quase) dá um alvo baixo e um badge fácil, e
   está certo assim: se o objetivo não exige subida, estar preparado para ele
   não exige subida nenhuma. O badge mede especificidade, não sofrimento. */
const MEDIDA_KM = CABRA_KM; // a mesma distância mínima da Cabra-montesa

/** A prova-alvo: a principal (`race_priority = 'a'`) agendada mais próxima.
 *  `|| 'a'` porque o default da coluna é 'a' (migração
 *  20260809120000_resting_hr_race_priority.sql) — uma prova antiga sem o
 *  campo preenchido é principal, como em utils/planDivergence.js.
 *  Uma prova já concluída não é alvo de nada: o que ela exigia, exigiu. */
function provaAlvo({ raceEvents, today }) {
  return (raceEvents || [])
    .filter((r) => r && dayOf(r.date) && dayOf(r.date) >= today
      && r.status !== 'concluida' && (r.race_priority || 'a') === 'a')
    .sort((a, b) => dayOf(a.date).localeCompare(dayOf(b.date)))[0] || null;
}

/** O D+ por quilómetro que uma prova exige, ou null quando não se sabe. Em
 *  `num`, um D+ de 0 é null — e é o que se quer: uma prova de estrada com o
 *  campo a zeros não tem exigência de desnível para preparar. */
function racioDaProva(race) {
  const dmais = num(race?.elevation_gain_m);
  const km = num(race?.distance_km);
  return dmais && km ? dmais / km : null;
}

const racioDaCorrida = (run) => {
  const dmais = num(run?.details?.elevation_gain_m);
  const km = num(run?.distance_km);
  return dmais && km ? dmais / km : null;
};

const DEPENDE_MEDIDA = 'Precisa do D+ (ganho de altimetria) no registo da corrida e do D+ da tua prova principal.';
const RESOLVER_MEDIDA = 'Preenche o D+ (ganho de altimetria) no registo da corrida, e o desnível da prova principal no hub da prova.';

function medidaDaProva({ treinos, raceEvents, today }) {
  const alvoRace = provaAlvo({ raceEvents, today });
  const racioAlvo = racioDaProva(alvoRace);
  const nomeProva = alvoRace?.name || 'a tua prova principal';

  const comum = {
    key: 'medida_da_prova',
    name: 'À medida da prova',
    familia: 'desempenho',
    cor: 'run',
    glifo: 'target',
    campo: 'details.elevation_gain_m',
    campoLabel: 'o desnível positivo',
    dependeDe: DEPENDE_MEDIDA,
    comoResolver: RESOLVER_MEDIDA,
    unidade: 'pct',
  };

  /* Sem alvo o badge NÃO finge ser um badge por ganhar: um anel pontilhado
     com um número cinzento diria ao atleta que lhe falta correr, quando o
     que lhe falta é marcar a prova (ou preencher-lhe o desnível). É o mesmo
     princípio da sessão indeterminada — nada fica por explicar. */
  if (!racioAlvo) {
    const semDmais = !!alvoRace && !racioDaProva(alvoRace);
    return {
      badge: badge({
        ...comum,
        rule: `Uma saída de ${MEDIDA_KM} km ou mais com o desnível por quilómetro que a tua prova principal exige.`,
        state: 'empty',
        ring: 0,
        centro: '—',
        centroAria: semDmais
          ? `À medida da prova: sem alvo. ${nomeProva} não tem o desnível preenchido.`
          : 'À medida da prova: sem alvo. Ainda não há prova principal marcada.',
        linha: semDmais
          ? `${nomeProva} ainda não tem o desnível preenchido — sem ele não há alvo a que apontar`
          : 'sem prova principal marcada não há alvo: marca a prova do teu objetivo na Agenda',
        sessoes: [],
        indeterminadas: null,
      }),
      due: [],
    };
  }

  const exigido = `${Math.round(racioAlvo)} m/km`;
  const candidatas = treinos.filter((r) => (num(r?.distance_km) || 0) >= MEDIDA_KM);

  return badgeDeMedida({
    ...comum,
    rule: `Uma saída de ${MEDIDA_KM} km ou mais com o desnível por quilómetro que a tua prova principal exige — ${exigido} em ${nomeProva}.`,
    alvo: 100,
    candidatas,
    medir: (run) => {
      const racio = racioDaCorrida(run);
      return racio == null ? null : (racio / racioAlvo) * 100;
    },
    descreveMedida: (pct, run) => `${Math.round(racioDaCorrida(run) || 0)} m/km · ${Math.round(pct)}% do que ${nomeProva} exige`,
    fmtCentro: (pct) => `${Math.round(pct)}%`,
    fmtFalta: (delta) => `+${Math.max(1, Math.round(delta))}%`,
    semCandidatas: `ainda sem saídas de ${MEDIDA_KM} km com D+ registado`,
    linhaDue: ({ run }) => `${Math.round(racioDaCorrida(run) || 0)} metros de subida por quilómetro — o terreno que ${nomeProva} exige (${exigido}).`,
  });
}

// ── Os badges de CONTAGEM COM NÍVEIS ─────────────────────────────────────

/* Dois badges acumulam: somam sessões (a Coruja) ou metros (A Escalada) e
   sobem de bronze a ouro. O nível vai para a coluna `tier`; o `period_key`
   fica vazio, porque um nível ganha-se uma vez.

   O `awardedOn` de cada nível é o dia da sessão em que o acumulado passou o
   limiar — é o primeiro dia em que os dados o provam, a mesma régua d'O Ano
   em Km. Por isso o varrimento é do mais antigo para o mais recente.

   O anel: com nível ganho, cheio na cor (é um badge ganho, e um badge ganho
   tem o anel cheio); é a frase por baixo que diz quanto falta para o degrau
   seguinte. Sem nível nenhum, o anel mostra a proporção do caminho até ao
   bronze e o número é "corrente/alvo". */
function badgeDeNiveis({
  key, name, rule, familia, cor, glifo, campo, campoLabel, dependeDe, comoResolver, unidade,
  limiares, passos, fmtValor, fmtCentroValor, sessoes, indeterminadas, semNada, tituloDe, linhaDue,
  /* O número que vai para a coluna `value`. Inteiro por omissão — metros,
     treinos, provas — mas o VDOT d'Os Níveis tem uma casa decimal e 44,5
     arredondado a 44 é o mesmo número a dizer outra coisa noutro ecrã. */
  arredondaValor = Math.round,
  // "3/5" só cabe no anel quando os dois números são curtos: numa contagem
  // de treinos cabe, em metros acumulados ("9,8k/10k") não. Aí mostra-se só
  // o corrente, e é o arco que diz quanto falta.
  centroCompara = true,
  /* A ESCALA QUE DESCE. Todos os outros badges de níveis sobem — mais
     metros, mais quilómetros, mais VDOT — e o degrau ganha-se com `>=`. O
     Passo é o único que desce: 4.15/km é melhor do que 6.00/km, e o degrau
     ganha-se com `<=`. Em vez de um segundo motor, é este parâmetro que
     vira as três comparações que dependem do sentido (o degrau atingido, o
     que falta para o seguinte, e a proporção do anel). Com `false` — o
     omisso — nada muda para os outros, e os testes deles provam-no. */
  menorEMelhor = false,
  /* Como se escreve a DISTÂNCIA até ao degrau seguinte, quando ela não se
     escreve como um valor. Num acumulado a diferença é da mesma espécie que
     o total (faltam "300 m"), mas num passo não é: a diferença entre 6.00 e
     5.00 são 60 segundos por km, não um ritmo de "1.00/km". Por omissão usa
     o mesmo `fmtValor` de sempre. */
  fmtDiferenca = null,
}) {
  const escreveFalta = fmtDiferenca || fmtValor;
  // `passos`: [{ valor, date, ... }] do mais antigo para o mais recente, já
  // com o acumulado em `valor`.
  const totalAtual = passos.length ? passos[passos.length - 1].valor : 0;
  const ganhos = [];
  for (let i = 0; i < NIVEIS.length; i += 1) {
    const passo = passos.find((p) => (menorEMelhor ? p.valor <= limiares[i] : p.valor >= limiares[i]));
    // `raceId` só vem nos badges que nascem de provas (Os Níveis, A
    // Sequência): é a prova que confirmou o degrau, e é ela que o põe no
    // mural dessa prova (`badgesForRace`).
    if (passo) ganhos.push({ nivel: NIVEIS[i], awardedOn: passo.date, valor: passo.valor, raceId: passo.raceId ?? null });
  }
  const atingido = ganhos.length ? ganhos[ganhos.length - 1] : null;
  const seguinteIdx = ganhos.length;
  const seguinte = seguinteIdx < NIVEIS.length
    ? { nivel: NIVEIS[seguinteIdx], limiar: limiares[seguinteIdx] }
    : null;
  /* O que falta para um limiar — sempre um número positivo, seja a escala a
     subir (faltam metros para lá chegar) ou a descer (há segundos por km a
     cortar). */
  const falta = (limiar) => (menorEMelhor ? totalAtual - limiar : limiar - totalAtual);

  const due = ganhos.map((g) => ({
    badgeKey: key,
    tier: g.nivel.key,
    periodKey: '',
    value: arredondaValor(g.valor),
    valueUnit: unidade,
    raceId: g.raceId ?? null,
    awardedOn: g.awardedOn,
    title: `${name} · ${g.nivel.label}`,
    line: linhaDue(g),
  }));

  const comum = {
    key, name, rule, familia, cor, glifo, campo, campoLabel, dependeDe, comoResolver, unidade,
    niveis: NIVEIS.map((n, i) => ({ ...n, limiar: limiares[i], ganho: i < ganhos.length })),
    sessoes,
    indeterminadas: blocoIndeterminadas(indeterminadas, { campoLabel, comoResolver }),
    value: arredondaValor(totalAtual),
    count: ganhos.length,
  };

  if (atingido) {
    return {
      badge: badge({
        ...comum,
        state: 'won',
        tier: atingido.nivel.key,
        ring: 1,
        centro: fmtCentroValor(totalAtual),
        centroAria: `${name}: ${atingido.nivel.label}, ${fmtValor(totalAtual)}`,
        awardedOn: atingido.awardedOn,
        linha: seguinte
          ? `${atingido.nivel.label} · faltam ${escreveFalta(falta(seguinte.limiar))} para ${seguinte.nivel.label.toLowerCase()}`
          : `${atingido.nivel.label} — o degrau mais alto`,
        detalhe: `${fmtValor(totalAtual)} ${tituloDe}`,
      }),
      due,
    };
  }

  const alvo = limiares[0];
  /* Numa escala que desce, "ainda a zero" não é o valor zero — zero seria o
     passo infinitamente rápido. É não haver medida nenhuma. */
  const emCurso = menorEMelhor ? passos.length > 0 : totalAtual > 0;
  return {
    badge: badge({
      ...comum,
      state: emCurso ? 'progress' : 'empty',
      // A proporção do caminho até ao bronze, pelo lado certo da divisão: a
      // subir é quanto já se tem do alvo, a descer é quanto o alvo já é do
      // que se tem (6.30/km com o bronze em 6.00 lê-se 95% do caminho).
      ring: emCurso ? Math.min(menorEMelhor ? alvo / totalAtual : totalAtual / alvo, 0.99) : 0,
      centro: emCurso && centroCompara
        ? `${fmtCentroValor(totalAtual)}/${fmtCentroValor(alvo)}`
        : fmtCentroValor(emCurso ? totalAtual : alvo),
      centroAria: emCurso
        ? `${name}: a caminho, ${fmtValor(totalAtual)} de ${fmtValor(alvo)} para bronze`
        : `${name}: por ganhar. ${rule}`,
      linha: emCurso ? `faltam ${escreveFalta(falta(alvo))} para bronze` : semNada,
      detalhe: emCurso ? `${fmtValor(totalAtual)} ${tituloDe}` : null,
    }),
    due: [],
  };
}

// ── Os badges de ENCAIXES ────────────────────────────────────────────────

/** "madrugada, manhã e noite" — a enumeração portuguesa, com o "e" no fim. */
function juntar(partes) {
  if (partes.length <= 1) return partes[0] || '';
  return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}

/* Cinco badges são o mesmo jogo: um conjunto FIXO de encaixes e um badge que
   se ganha quando todos ficam preenchidos. Três são amuletos (as quatro
   faixas do dia, as quatro estações, os dois solstícios) e dois vieram d'O
   Palmarés na fase A (As Distâncias — 5, 10, 21,1 e 42,2 km — e O Terreno —
   a 1.ª e a 5.ª prova em estrada e em trail). O que muda é o que define o
   encaixe, de que lista saem os candidatos e as palavras — por isso a
   varredura vive aqui uma vez, como a dos badges de medida.

   `encaixeDe(item)` responde uma de TRÊS coisas, e a terceira nasceu com os
   badges de prova:

     · a CHAVE do encaixe que o item preenche;
     · `null` — falta o dado, e o item fica INDETERMINADO (a regra de sempre);
     · `NENHUM_ENCAIXE` — o item tem o dado e simplesmente não preenche
       encaixe nenhum.

   Sem a terceira, a 2.ª prova de estrada — que não é nem a 1.ª nem a 5.ª, e
   sobre a qual não há dúvida nenhuma — aparecia no ecrã como "por decidir".
   Uma prova de 15 km, que não cai em nenhuma das quatro distâncias, o mesmo.

   `candidatas` também já não são obrigatoriamente corridas: os badges de
   prova passam as entradas de `completedRaces` e, com elas, o seu `fazSessao`
   e o seu `dataDe`. Uma prova não é um registo de corrida — o que se abre ao
   tocar é o hub da prova, não o registo.

   A lista de sessões mostra só a PRIMEIRA corrida de cada encaixe. As outras
   não falharam nada, apenas repetiram um encaixe já preenchido, e listá-las
   todas enchia o ecrã sem responder à única pergunta que ele tem de
   responder: quais os encaixes que faltam. */
export const NENHUM_ENCAIXE = Symbol('sem encaixe');

function badgeDeEncaixes({
  key, name, rule, familia, cor, glifo, campo, campoLabel, dependeDe, comoResolver,
  encaixes, encaixeDe, candidatas, descreveEncaixe, porqueConta, semNada, linhaDue,
  // Por omissão os candidatos são CORRIDAS, que é o caso dos amuletos. Os
  // badges de prova trocam estes três, e mais nada.
  fazSessao = sessaoDaCorrida,
  dataDe = (run) => dayOf(run?.date),
  metaSimples = (run) => (run?.distance_km ? fmtKmLinha(num(run.distance_km)) : null),
  /* Quando existe, cunha-se um prémio POR ENCAIXE CHEIO em vez de um só no
     fim. É o que O Palmarés fazia, e a razão é a mesma: "a primeira meia
     maratona" é um feito seu e não pode ficar à espera de uma maratona para
     existir. Os amuletos não o usam — metade das estações não é feito
     nenhum, e repetir as quatro também não. */
  duePorEncaixe = null,
}) {
  const porEncaixe = new Map();
  const indeterminadas = [];
  const ordenadas = [...candidatas].sort((a, b) => (dataDe(a) || '').localeCompare(dataDe(b) || ''));
  for (const item of ordenadas) {
    const encaixe = encaixeDe(item);
    if (encaixe === NENHUM_ENCAIXE) continue;
    if (encaixe == null) { indeterminadas.push(item); continue; }
    if (!porEncaixe.has(encaixe)) porEncaixe.set(encaixe, item);
  }

  const cheios = encaixes.filter((e) => porEncaixe.has(e.key));
  const vazios = encaixes.filter((e) => !porEncaixe.has(e.key));
  const completo = vazios.length === 0 && encaixes.length > 0;
  // O dia em que o último encaixe se preencheu — o primeiro dia em que os
  // dados o provam, a mesma régua do resto do ficheiro.
  const ultimoDia = cheios
    .map((e) => dataDe(porEncaixe.get(e.key)))
    .sort()
    .slice(-1)[0] || null;

  const sessoes = newestFirst([
    ...cheios.map((e) => {
      const item = porEncaixe.get(e.key);
      return fazSessao(item, {
        status: 'conta',
        meta: descreveEncaixe(e, item),
        porque: porqueConta(e),
      });
    }),
    ...indeterminadas.map((item) => fazSessao(item, {
      status: 'indeterminada',
      meta: metaSimples(item),
      porque: `Sem ${campoLabel} no registo.`,
    })),
  ]);

  const comum = {
    key, name, rule, familia, cor, glifo, campo, campoLabel, dependeDe, comoResolver,
    unidade: 'count',
    value: cheios.length,
    sessoes,
    indeterminadas: blocoIndeterminadas(indeterminadas, { campoLabel, comoResolver }),
  };

  // Um prémio por encaixe cheio, quando o badge os cunha assim: a chave do
  // encaixe é o `period_key`, e é ela que os distingue em `user_badges`.
  const duePorCheio = duePorEncaixe
    ? cheios.map((e) => {
      const item = porEncaixe.get(e.key);
      const extra = duePorEncaixe(e, item) || {};
      return {
        badgeKey: key,
        tier: '',
        periodKey: e.key,
        value: extra.value ?? null,
        valueUnit: extra.valueUnit ?? 'count',
        raceId: extra.raceId ?? null,
        awardedOn: dataDe(item),
        title: extra.title || name,
        line: extra.line || '',
      };
    })
    : null;

  const faltam = juntar(vazios.map((e) => e.label));

  if (completo) {
    return {
      badge: badge({
        ...comum,
        state: 'won',
        ring: 1,
        centro: String(encaixes.length),
        centroAria: `${name}: ganho, ${juntar(encaixes.map((e) => e.label))}`,
        count: 1,
        awardedOn: ultimoDia,
        linha: `${juntar(encaixes.map((e) => e.label))} — completo a ${formatDatePTShort(ultimoDia)}`,
        detalhe: juntar(encaixes.map((e) => e.label)),
      }),
      due: duePorCheio || [{
        badgeKey: key,
        tier: '',
        // Ganha-se uma vez: não há período que distinga uma repetição, e
        // repetir "as quatro estações" não é feito nenhum novo.
        periodKey: '',
        value: encaixes.length,
        valueUnit: 'count',
        raceId: null,
        awardedOn: ultimoDia,
        title: name,
        line: linhaDue({ ultimoDia }),
      }],
    };
  }

  const comecou = cheios.length > 0;
  return {
    badge: badge({
      ...comum,
      state: comecou ? 'progress' : 'empty',
      ring: comecou ? Math.min(cheios.length / encaixes.length, 0.99) : 0,
      centro: `${cheios.length}/${encaixes.length}`,
      centroAria: comecou
        ? `${name}: a caminho, ${cheios.length} de ${encaixes.length}. ${plural(vazios.length, 'Falta', 'Faltam')} ${faltam}`
        : `${name}: por ganhar. ${rule}`,
      linha: comecou ? `${plural(vazios.length, 'falta', 'faltam')} ${faltam}` : semNada,
    }),
    due: duePorCheio || [],
  };
}

// ── 5. Coruja ────────────────────────────────────────────────────────────

/* chave     coruja
   regra     "Treinos começados às 21:00 ou mais tarde, ou antes das 6:00:
             5 (bronze), 15 (prata), 30 (ouro)."
   campo     runs.start_time (a hora de início, opcional desde a migração
             20260912212930_start_times.sql)
   em falta  INDETERMINADO: um treino sem hora pode ter sido às 7 da manhã ou
             às 11 da noite. Não conta — e a contagem das que ficaram assim
             aparece no detalhe, porque é aí que está o badge que falta.
   cor       NEUTRO (prata) — e mudou: era --run. A hora a que se corre não
             diz nada sobre como se corre, e uma cor de significado a dizer
             que sim era o que estava errado. Ver "A LEI DA COR" no topo.
   família   amuletos — o utilizador foi explícito: "nada contribui para o
             desenvolvimento do atleta, é mera curiosidade". Tem níveis, o
             que a faria parecer de `acumulacao`; não é — o que ela acumula
             não é volume de treino nenhum, é a repetição de uma
             circunstância. Somar treinos noturnos não deixa ninguém melhor.
   níveis    sim: bronze 5, prata 15, ouro 30. */
const CORUJA_NOITE = 21;
const CORUJA_MADRUGADA = 6;
const CORUJA_LIMIARES = [5, 15, 30];

/** A hora (0-23) de `HH:MM[:SS]`, ou null. */
function horaDe(startTime) {
  if (typeof startTime !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(startTime.trim());
  if (!m) return null;
  const h = Number(m[1]);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : null;
}

const ehNoturno = (h) => h >= CORUJA_NOITE || h < CORUJA_MADRUGADA;

function coruja({ treinos }) {
  const comHora = [];
  const indeterminadas = [];
  for (const run of treinos) {
    const h = horaDe(run?.start_time);
    if (h == null) indeterminadas.push(run);
    else comHora.push({ run, hora: h, noturno: ehNoturno(h) });
  }
  const noturnos = comHora
    .filter((x) => x.noturno)
    .sort((a, b) => (dayOf(a.run.date) || '').localeCompare(dayOf(b.run.date) || ''));

  const passos = noturnos.map((x, i) => ({ valor: i + 1, date: dayOf(x.run.date) }));
  const horaTexto = (h) => `${String(h).padStart(2, '0')}h`;

  const sessoes = newestFirst([
    ...noturnos.map(({ run, hora }) => sessaoDaCorrida(run, { status: 'conta', meta: `começou às ${horaTexto(hora)}`, porque: 'Treino noturno.' })),
    ...comHora.filter((x) => !x.noturno).map(({ run, hora }) => sessaoDaCorrida(run, { status: 'falhou', meta: `começou às ${horaTexto(hora)}`, porque: 'Fora da janela da noite.' })),
    ...indeterminadas.map((run) => sessaoDaCorrida(run, { status: 'indeterminada', meta: null, porque: 'Sem hora de início no registo.' })),
  ]);

  return badgeDeNiveis({
    key: 'coruja',
    name: 'Coruja',
    rule: `Treinos começados às ${CORUJA_NOITE}:00 ou mais tarde, ou antes das 0${CORUJA_MADRUGADA}:00 — 5 para bronze, 15 para prata, 30 para ouro.`,
    familia: 'amuletos',
    cor: 'neutro',
    glifo: 'moon',
    campo: 'start_time',
    campoLabel: 'a hora de início',
    dependeDe: 'Precisa da hora de início no registo da corrida.',
    comoResolver: 'Abre o registo da corrida e preenche a hora a que começaste — é o campo ao lado da data.',
    unidade: 'count',
    limiares: CORUJA_LIMIARES,
    passos,
    fmtValor: (n) => `${Math.max(0, Math.round(n))} ${plural(Math.round(n), 'treino', 'treinos')}`,
    fmtCentroValor: (n) => String(Math.max(0, Math.round(n))),
    sessoes,
    indeterminadas,
    semNada: 'ainda sem treinos noturnos registados',
    tituloDe: 'à noite',
    linhaDue: (g) => `${g.valor} ${plural(g.valor, 'treino noturno', 'treinos noturnos')} — ${g.nivel.label.toLowerCase()} da Coruja.`,
  });
}

// ── 6. A Escalada ────────────────────────────────────────────────────────

/* chave     escalada
   regra     "Metros de subida acumulados em treino: 10 000 (bronze),
             25 000 (prata), 50 000 (ouro)."
   campo     runs.details.elevation_gain_m
   em falta  a corrida NÃO SOMA — não conta a favor (não se inventa D+) nem
             contra (não apaga nada). O detalhe diz quantas ficaram de fora,
             porque um total que parece baixo é quase sempre isso.
   cor       --run (a subida é corrida, não ginásio)
   família   acumulacao — soma metros ao longo do tempo, e é o exemplo
             canónico do que a doutrina 6 #6 manda a Carol NUNCA sugerir:
             "estás a 300 m do próximo degrau" é a frase que põe alguém a
             procurar uma rampa com o joelho a queixar-se.
   níveis    sim: bronze 10 000 m, prata 25 000 m, ouro 50 000 m.

   Acumulado de SEMPRE, não do ano: um badge de ano precisava de period_key
   por ano e de uma decisão sobre o que acontece a 1 de janeiro — e essa
   pergunta ("o ano recomeça?") não é para responder sozinho. Fica de sempre,
   que é o que um alpinista conta. */
const ESCALADA_LIMIARES = [10000, 25000, 50000];

function escalada({ treinos }) {
  const comDmais = [];
  const indeterminadas = [];
  for (const run of treinos) {
    const dmais = num(run?.details?.elevation_gain_m);
    if (dmais == null) indeterminadas.push(run);
    else comDmais.push({ run, dmais });
  }
  const porData = [...comDmais].sort((a, b) => (dayOf(a.run.date) || '').localeCompare(dayOf(b.run.date) || ''));
  let acumulado = 0;
  const passos = porData.map(({ run, dmais }) => {
    acumulado += dmais;
    return { valor: acumulado, date: dayOf(run.date) };
  });

  const sessoes = newestFirst([
    ...comDmais.map(({ run, dmais }) => sessaoDaCorrida(run, { status: 'conta', meta: `${fmtMetros(dmais)} de D+`, porque: 'Somou ao acumulado.' })),
    ...indeterminadas.map((run) => sessaoDaCorrida(run, { status: 'indeterminada', meta: run?.distance_km ? fmtKmLinha(num(run.distance_km)) : null, porque: 'Sem D+ no registo — não somou.' })),
  ]);

  return badgeDeNiveis({
    key: 'escalada',
    name: 'A Escalada',
    rule: 'Metros de subida acumulados em treino — 10 000 para bronze, 25 000 para prata, 50 000 para ouro.',
    familia: 'acumulacao',
    cor: 'run',
    glifo: 'peak',
    campo: 'details.elevation_gain_m',
    campoLabel: 'o desnível positivo',
    dependeDe: 'Precisa do D+ (ganho de altimetria) no registo da corrida.',
    comoResolver: 'Abre o registo da corrida e preenche o D+ (ganho de altimetria) — vem no resumo do relógio.',
    unidade: 'metros',
    limiares: ESCALADA_LIMIARES,
    passos,
    fmtValor: fmtMetros,
    fmtCentroValor: fmtMetrosCurto,
    sessoes,
    indeterminadas,
    semNada: 'ainda sem corridas com D+ registado',
    tituloDe: 'de subida acumulada',
    centroCompara: false,
    linhaDue: (g) => `${fmtMetros(g.valor)} de subida acumulada — ${g.nivel.label.toLowerCase()} d'A Escalada.`,
  });
}

// ── Os badges SEMANAIS (o plano da Carol) ────────────────────────────────

/* Dois badges leem a mesma coisa: o que a Carol prescreveu para uma semana e
   o que ficou registado. A régua é a de sempre — `evaluatePrescriptions` /
   `executionScore` de @formulas/prescriptionAdherence.ts, o MESMO ficheiro
   que a Carol e os percentis usam. Não se escreve aqui uma segunda forma de
   dizer "cumprido".

   Uma semana só se julga depois de fechada: no próprio domingo ainda se pode
   correr (e ainda se pode estragar um descanso). Por isso o `awardedOn` é a
   segunda-feira seguinte — o primeiro dia em que os dados o provam, como n'O
   Ano em Km.

   Semana sem plano nenhum NÃO é uma semana indeterminada: não havia nada a
   cumprir, e um badge de disciplina não se ganha nem se perde onde não houve
   combinação. Fica simplesmente fora da conta, e a frase do detalhe diz
   quantas semanas tiveram plano. */
function semanasAvaliadas({ planItems, runs, gym, today }) {
  const porSemana = new Map();
  for (const item of planItems || []) {
    const d = dayOf(item?.planned_date);
    if (!d || item?.status === 'cancelado') continue;
    const segunda = segundaDe(d);
    if (!porSemana.has(segunda)) porSemana.set(segunda, segunda);
  }
  const semanas = [...porSemana.keys()].sort();
  const entrada = { items: planItems || [], runs: runs || [], gym: gym || [], mealsByDate: {} };
  return semanas
    .map((segunda) => {
      const domingo = addDays(segunda, 6);
      const fechada = domingo < today;
      const fim = fechada ? addDays(domingo, 1) : today;
      // `evaluatePrescriptions` conta de `fim - dias` (inclusive) até `fim`
      // (exclusive): com fim = segunda seguinte e 7 dias, é exatamente a
      // semana. Na semana em curso, `fim` é hoje e os dias são os já vividos.
      const dias = Math.max(0, Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${segunda}T00:00:00Z`)) / 86400000));
      if (dias === 0) return null;
      const resumo = evaluatePrescriptions(entrada, fim, dias);
      const base = executionBase(resumo.counts);
      if (base <= 0) return null;
      return { segunda, domingo, fechada, resumo, counts: resumo.counts, score: resumo.executionScore };
    })
    .filter(Boolean);
}

function sessaoDaSemana(semana, { status, meta, porque }) {
  return {
    kind: 'semana',
    id: semana.segunda,
    runId: null,
    raceId: null,
    date: semana.segunda,
    title: `Semana de ${formatDatePTShort(semana.segunda)}`,
    meta,
    status,
    porque,
  };
}

/* chave     semana_100
   regra     "Uma semana fechada com pelo menos um treino e tudo o que o
             plano pedia cumprido — índice de execução 100."
   campo     coach_plan_items (a prescrição) + runs/workout_sessions (o que
             foi feito). Não depende de nenhum campo opcional de details.
   em falta  sem plano na semana, a semana não entra na conta (não há nada a
             cumprir); é o único "em falta" possível aqui, e é dito na frase.
   cor       --ok (a disciplina, o mesmo verde do objetivo batido)
   família   disciplina — mede exatamente "fizeste o combinado", e é o único
             badge cuja régua é o plano da Carol.
   níveis    não — repete-se, uma linha por semana (period_key = a segunda). */
function semana100({ semanas }) {
  const fechadas = semanas.filter((s) => s.fechada);
  const ganhas = fechadas.filter((s) => s.score === 100 && (s.counts.cumprido || 0) >= 1);
  const emCurso = semanas.find((s) => !s.fechada) || null;

  const sessoes = newestFirst([
    ...fechadas.map((s) => {
      const conta = ganhas.includes(s);
      return sessaoDaSemana(s, {
        status: conta ? 'conta' : 'falhou',
        meta: `índice ${String(round1(s.score)).replace('.', ',')} · ${s.counts.cumprido || 0} ${plural(s.counts.cumprido || 0, 'treino cumprido', 'treinos cumpridos')}`,
        porque: conta ? 'Tudo o que o plano pedia foi cumprido.' : `Ficou a ${String(round1(100 - s.score)).replace('.', ',')} pontos do 100.`,
      });
    }),
  ]);

  const due = ganhas.map((s) => ({
    badgeKey: 'semana_100',
    tier: '',
    periodKey: s.segunda,
    value: 100,
    valueUnit: 'pct',
    raceId: null,
    awardedOn: addDays(s.domingo, 1),
    title: 'Semana 100%',
    line: `A ${labelSemana(s.segunda)} inteira como estava combinada — índice de execução 100.`,
  }));

  const comum = {
    key: 'semana_100',
    name: 'Semana 100%',
    rule: 'Uma semana fechada com pelo menos um treino e tudo o que o plano pedia cumprido — índice de execução 100.',
    familia: 'disciplina',
    cor: 'ok',
    glifo: 'check',
    campo: 'coach_plan_items',
    campoLabel: 'um plano para a semana',
    dependeDe: 'Precisa de um plano de treino da Carol para a semana.',
    comoResolver: 'Pede um plano à Carol no Chat — sem plano não há o que cumprir, e este badge não tem como se ganhar.',
    unidade: 'pct',
    sessoes,
    // Não há indeterminadas aqui: ou houve plano, ou não houve.
    indeterminadas: null,
  };

  if (ganhas.length) {
    const ultima = ganhas[ganhas.length - 1];
    return {
      badge: badge({
        ...comum,
        state: 'won',
        ring: 1,
        centro: String(ganhas.length),
        centroAria: `Semana 100%: ganho ${ganhas.length} ${plural(ganhas.length, 'vez', 'vezes')}`,
        value: 100,
        count: ganhas.length,
        awardedOn: addDays(ultima.domingo, 1),
        linha: `${ganhas.length} ${plural(ganhas.length, 'semana inteira', 'semanas inteiras')} · a última foi a ${labelSemana(ultima.segunda)}`,
        detalhe: `${ganhas.length} de ${fechadas.length} ${plural(fechadas.length, 'semana com plano', 'semanas com plano')}`,
      }),
      due,
    };
  }

  if (emCurso) {
    const score = round1(emCurso.score || 0);
    return {
      badge: badge({
        ...comum,
        state: 'progress',
        ring: Math.min(Math.max(score / 100, 0), 0.99),
        centro: `${Math.round(score)}/100`,
        centroAria: `Semana 100%: a caminho, índice ${String(score).replace('.', ',')} de 100 na semana em curso`,
        linha: `a semana em curso vai em ${String(score).replace('.', ',')} de 100`,
      }),
      due: [],
    };
  }

  const melhor = fechadas.reduce((m, s) => (!m || s.score > m.score ? s : m), null);
  return {
    badge: badge({
      ...comum,
      state: 'empty',
      ring: 0,
      centro: melhor ? `+${Math.max(1, Math.round(100 - melhor.score))}` : '100',
      centroAria: melhor
        ? `Semana 100%: por ganhar. A melhor semana ficou a ${Math.round(100 - melhor.score)} pontos do 100`
        : 'Semana 100%: por ganhar. Ainda não houve nenhuma semana com plano.',
      linha: melhor
        ? `a melhor: ${labelSemana(melhor.segunda)}, índice ${String(round1(melhor.score)).replace('.', ',')}`
        : 'ainda sem nenhuma semana com plano fechada',
    }),
    due: [],
  };
}

/* chave     descanso_cumprido
   regra     "Uma semana fechada com pelo menos um dia de descanso prescrito
             e nenhum deles trocado por treino."
   campo     coach_plan_items (kind = 'descanso') + runs/workout_sessions
   em falta  sem dias de descanso prescritos, a semana não entra na conta.
   cor       --ok (a disciplina)
   família   disciplina — o combinado também é não correr.
   níveis    não — repete-se, uma linha por semana.

   Existe porque o descanso é a parte do plano que ninguém festeja e que é
   das que mais custa: o atleta que corre no dia de folga não está a ganhar
   nada, e não havia nenhum prémio a dizê-lo. */
function descansoCumprido({ semanas }) {
  const comDescanso = semanas.filter((s) => s.fechada
    && ((s.counts.descanso_respeitado || 0) + (s.counts.descanso_nao_respeitado || 0)) > 0);
  const ganhas = comDescanso.filter((s) => (s.counts.descanso_nao_respeitado || 0) === 0);
  const emCurso = semanas.find((s) => !s.fechada
    && ((s.counts.descanso_respeitado || 0) + (s.counts.descanso_nao_respeitado || 0)) > 0) || null;

  const diasDe = (s) => (s.counts.descanso_respeitado || 0) + (s.counts.descanso_nao_respeitado || 0);
  const sessoes = newestFirst(comDescanso.map((s) => {
    const conta = ganhas.includes(s);
    const total = diasDe(s);
    return sessaoDaSemana(s, {
      status: conta ? 'conta' : 'falhou',
      meta: `${s.counts.descanso_respeitado || 0} de ${total} ${plural(total, 'dia de descanso', 'dias de descanso')}`,
      porque: conta
        ? 'Todos os dias de descanso foram respeitados.'
        : `${s.counts.descanso_nao_respeitado} ${plural(s.counts.descanso_nao_respeitado, 'dia de descanso trocado', 'dias de descanso trocados')} por treino.`,
    });
  }));

  const due = ganhas.map((s) => ({
    badgeKey: 'descanso_cumprido',
    tier: '',
    periodKey: s.segunda,
    value: s.counts.descanso_respeitado || 0,
    valueUnit: 'count',
    raceId: null,
    awardedOn: addDays(s.domingo, 1),
    title: 'Descanso cumprido',
    line: `${s.counts.descanso_respeitado} ${plural(s.counts.descanso_respeitado, 'dia de descanso respeitado', 'dias de descanso respeitados')} na ${labelSemana(s.segunda)} — descansar também é treinar.`,
  }));

  const comum = {
    key: 'descanso_cumprido',
    name: 'Descanso cumprido',
    rule: 'Uma semana fechada com pelo menos um dia de descanso prescrito e nenhum deles trocado por treino.',
    familia: 'disciplina',
    cor: 'ok',
    glifo: 'moonrest',
    campo: 'coach_plan_items',
    campoLabel: 'dias de descanso no plano',
    dependeDe: 'Precisa de dias de descanso prescritos no plano da semana.',
    comoResolver: 'Pede um plano à Carol no Chat — os dias de descanso vêm nele, e é sobre eles que este badge se ganha.',
    unidade: 'count',
    sessoes,
    indeterminadas: null,
  };

  if (ganhas.length) {
    const ultima = ganhas[ganhas.length - 1];
    return {
      badge: badge({
        ...comum,
        state: 'won',
        ring: 1,
        centro: String(ganhas.length),
        centroAria: `Descanso cumprido: ganho ${ganhas.length} ${plural(ganhas.length, 'vez', 'vezes')}`,
        value: ultima.counts.descanso_respeitado || 0,
        count: ganhas.length,
        awardedOn: addDays(ultima.domingo, 1),
        linha: `${ganhas.length} ${plural(ganhas.length, 'semana', 'semanas')} · a última foi a ${labelSemana(ultima.segunda)}`,
        detalhe: `${ganhas.length} de ${comDescanso.length} ${plural(comDescanso.length, 'semana com descanso prescrito', 'semanas com descanso prescrito')}`,
      }),
      due,
    };
  }

  if (emCurso) {
    const respeitados = emCurso.counts.descanso_respeitado || 0;
    const total = diasDe(emCurso);
    const quebrada = (emCurso.counts.descanso_nao_respeitado || 0) > 0;
    return {
      badge: badge({
        ...comum,
        state: quebrada ? 'empty' : 'progress',
        ring: quebrada ? 0 : Math.min(respeitados / Math.max(total, 1), 0.99),
        centro: `${respeitados}/${total}`,
        centroAria: `Descanso cumprido: ${respeitados} de ${total} dias de descanso respeitados na semana em curso`,
        linha: quebrada
          ? 'esta semana já houve um dia de descanso trocado por treino'
          : `${respeitados} de ${total} ${plural(total, 'dia de descanso respeitado', 'dias de descanso respeitados')} esta semana`,
      }),
      due: [],
    };
  }

  const melhor = comDescanso.reduce((m, s) => (!m || (s.counts.descanso_respeitado || 0) > (m.counts.descanso_respeitado || 0) ? s : m), null);
  return {
    badge: badge({
      ...comum,
      state: 'empty',
      ring: 0,
      centro: melhor ? `+${melhor.counts.descanso_nao_respeitado}` : '1',
      centroAria: melhor
        ? `Descanso cumprido: por ganhar. Na melhor semana ficaram ${melhor.counts.descanso_nao_respeitado} dias de descanso por respeitar`
        : 'Descanso cumprido: por ganhar. Ainda não houve descanso prescrito.',
      linha: melhor
        ? `a melhor: ${labelSemana(melhor.segunda)}, com ${melhor.counts.descanso_nao_respeitado} ${plural(melhor.counts.descanso_nao_respeitado, 'dia trocado', 'dias trocados')} por treino`
        : 'ainda sem dias de descanso prescritos numa semana fechada',
    }),
    due: [],
  };
}

// ── 7. Cadência corrigida ────────────────────────────────────────────────

/* chave     cadencia_corrigida
   regra     "Depois de um período com a cadência abaixo do esperado para o
             teu ritmo, três semanas seguidas com ela de volta ao esperado —
             em corridas contínuas em plano."
   campo     runs.details.cadence_spm (com distance_km e duration_seconds
             para a velocidade média, e profiles.height_cm para afinar a
             régua)
   em falta  sem `cadence_spm`, a corrida fica INDETERMINADA: não há cadência
             para medir e inventar uma era pior do que não contar. Sem
             `height_cm`, a régua usa-se SEM o termo de estatura e sobe-se a
             fasquia de entrada (ver abaixo).
   cor       --run (é treino de corrida)
   família   desempenho — mede uma mudança na mecânica da passada. Três
             semanas seguidas podiam fazê-lo parecer disciplina; não é: o que
             se julga não é ter cumprido nada, é a cadência ter voltado ao
             esperado para o ritmo.
   níveis    não — repete-se: quem recair e voltar a corrigir ganha outra vez.

   ── A RÉGUA, e porque é que ela NÃO diz 180 ─────────────────────────────
   Doutrina 2.4 #3 (src/coach-knowledge/02-corrida-tecnica-sinais.md), que
   não se reabre aqui:

     esperado = 150 + 6,0 × v_média(m/s) − 0,7 × (altura_cm − 175)
     desvio   = cadence_spm − esperado

   O 150 + 6,0×v é van Oeveren (2017), confirmado por Malisoux (2023) e de
   Ruiter (2019); o −0,7 spm/cm é o mais conservador de duas fontes em
   conflito (#3, "Conflito de fontes na correção de estatura"). Os "180 spm"
   são Jack Daniels a contar passos na bancada de Los Angeles em 1984 — 46
   fundistas de elite, EM PROVA — e estão PROIBIDOS pelo #1 e pelo #3.1: é
   um mínimo observado numa população extrema, não um alvo de ninguém. Não
   há termo de género nem de idade, e é deliberado (#3.2 e #3.3): as
   diferenças entre sexos explicam-se por comprimento de perna e desaparecem
   ao normalizar pela estatura, e a idade já entra pela velocidade — corrigi-
   la outra vez era contá-la duas vezes.

   ── PORQUE É QUE O BADGE NÃO É "TENS BOA CADÊNCIA" ──────────────────────
   Um badge de cadência alta premiava ser baixo e rápido, que não é mérito
   nenhum — é estatura e ritmo, e o `desvio` já os desconta. Este badge mede
   uma MUDANÇA que o atleta fez, contra ele próprio: sai de um período com a
   cadência abaixo da régua e mantém-na de volta durante três semanas
   seguidas. O que a evidência sustenta com confiança ALTA é a carga
   articular (Heiderscheit, MSSE 2011: +5% de cadência → ~20% menos energia
   absorvida no joelho; +10% → ~34%). A PREVENÇÃO DE LESÃO em quem não tem
   sintomas NÃO está provada (#3.4, confiança MÉDIA) — por isso nenhuma das
   frases que o atleta lê aqui promete que isto evita lesões.

   ── A FRAQUEZA CONHECIDA: o despiste de intervalados e de trail ─────────
   A régua vale para CORRIDA CONTÍNUA EM PLANO (#3, "Condições"). Num
   intervalado a velocidade média mistura esforço e recuperação e não
   representa nada; a subir, a cadência sobe sem que a mecânica seja pior.
   Com os dados de hoje só há duas peneiras, e ambas são GROSSEIRAS:

     1. `training_type` — entram 'continuo', 'longo' e 'recuperacao'. Ficam
        de fora 'intervalos' e 'fartlek' (ritmo variável), 'tempo' (é
        contínuo, mas é Z4 e quase sempre leva aquecimento e retorno à calma
        no mesmo registo, o que estraga a velocidade média), e 'subidas',
        'trail' e 'tecnico' (terreno).
     2. `elevation_gain_m` TOTAL — acima de 25 m de D+ por km a sessão sai.
        Os 25 m/km são o topo da banda "rolante" de ELEVATION_RATIO_BANDS
        (utils/run.js), a régua que a casa já usa para "transição fácil
        vindo da estrada"; não é um número novo.

   O QUE FICA POR FORA, assumido e não resolvido:
     · um `continuo` que na verdade foi uma progressão ou uns strides no fim
       — o tipo diz contínuo e nós acreditamos;
     · uma corrida ondulada SEM D+ preenchido: só o `training_type` a
       peneira, e um 'continuo' de 24 m/km de média pode ter 300 m de
       subida em três rampas. A subida INFLA a cadência, e uma cadência
       inflada é o que faz um FALSO POSITIVO aqui — o pior erro possível
       neste badge;
     · o D+ é um total: 25 m/km podem ser um sobe-e-desce constante ou uma
       única rampa. Sem declive por troço (`splits` só guarda distância e
       tempo) não há forma de distinguir, e a doutrina assume-o como a
       fraqueza real desta regra;
     · uma corrida sem distância ou sem duração não é candidata de todo —
       sem velocidade média não há régua, e não é "falta de cadência";
     · `details.max_cadence_spm` existe e NÃO se usa, por ordem expressa da
       doutrina (#3, fim): é um pico instantâneo, tipicamente de um sprint ou
       de uma descida, e não tem norma publicada com que o comparar.
   Na dúvida exclui-se: um falso positivo manda o atleta mudar a técnica sem
   razão, e é isso que se está a evitar. */
const CAD_BASE_SPM = 150;
const CAD_POR_MS = 6.0;
const CAD_POR_CM = 0.7;
const CAD_ALTURA_REF = 175;
/** Abaixo disto, o desvio deixa de ser ruído (doutrina #3: `desvio ≥ −8` é
 *  normal e NÃO se comenta). É a porta de entrada do badge, não um alvo. */
const CAD_DESVIO_BAIXO = -8;
/** E a partir daqui considera-se de volta ao esperado. */
const CAD_DESVIO_CORRIGIDO = -4;
/** O sinal vermelho do #1, que se mantém intacto — e a única fasquia que
 *  vale quando não há altura no perfil. */
const CAD_PISO_SPM = 155;
/** "3 a 4 semanas consecutivas": fica-se pelo limite de baixo, e quatro
 *  semanas seguidas contêm três. */
const CAD_SEMANAS = 3;
/** Topo da banda "rolante" (25 m/km) — ver a fraqueza conhecida acima. */
const CAD_PLANO_MAX_DMAIS_KM = 25;
/** Os tipos de treino que a régua aceita. */
const CAD_TIPOS_CONTINUOS = ['continuo', 'longo', 'recuperacao'];

/** A velocidade média em m/s, ou null sem distância ou sem duração. */
function velocidadeMediaMs(run) {
  const km = num(run?.distance_km);
  const segundos = num(run?.duration_seconds);
  return km && segundos ? (km * 1000) / segundos : null;
}

/** A altura do perfil, em cm, quando é um número de gente. Fora do intervalo
 *  (dedo escorregado no teclado, metros em vez de centímetros) trata-se como
 *  ausente: uma régua afinada por um disparate é pior do que uma régua sem
 *  termo de estatura. */
function alturaDoPerfil(profile) {
  const h = num(profile?.height_cm);
  return h && h >= 120 && h <= 230 ? h : null;
}

/** A régua: cadência esperada (spm) para esta velocidade e esta estatura.
 *  Sem altura, fica só o termo da velocidade. */
function cadenciaEsperada(v, alturaCm) {
  const base = CAD_BASE_SPM + CAD_POR_MS * v;
  return alturaCm ? base - CAD_POR_CM * (alturaCm - CAD_ALTURA_REF) : base;
}

/** Corrida contínua em plano — as duas peneiras grosseiras descritas acima. */
function corridaContinuaEmPlano(run) {
  if (!CAD_TIPOS_CONTINUOS.includes(run?.training_type)) return false;
  if (velocidadeMediaMs(run) == null) return false;
  const dmais = num(run?.details?.elevation_gain_m);
  const km = num(run?.distance_km);
  // Sem D+ no registo não há como peneirar pelo terreno: sobra o tipo de
  // treino, e é esse o buraco assumido lá em cima.
  if (dmais && km && dmais / km > CAD_PLANO_MAX_DMAIS_KM) return false;
  return true;
}

/** "+3,2 spm" / "−9,1 spm" — o desvio face à régua, sempre com sinal. */
function fmtDesvio(d) {
  const v = round1(Math.abs(d));
  return `${d >= 0 ? '+' : '−'}${String(v).replace('.', ',')} spm`;
}

const fmtSpm = (spm) => `${Math.round(spm)} spm`;

/** As semanas com cadência medida: média de spm e média de desvio das
 *  corridas contínuas em plano dessa semana, mais as corridas que ficaram
 *  por decidir (candidatas sem `cadence_spm`). */
function semanasDeCadencia({ treinos, alturaCm, today }) {
  const indeterminadas = [];
  const porSemana = new Map();
  for (const run of treinos) {
    if (!corridaContinuaEmPlano(run)) continue;
    const spm = num(run?.details?.cadence_spm);
    if (spm == null) { indeterminadas.push(run); continue; }
    const desvio = spm - cadenciaEsperada(velocidadeMediaMs(run), alturaCm);
    const segunda = segundaDe(dayOf(run.date));
    if (!porSemana.has(segunda)) porSemana.set(segunda, []);
    porSemana.get(segunda).push({ run, spm, desvio });
  }

  const semanas = [...porSemana.keys()].sort().map((segunda) => {
    const corridas = porSemana.get(segunda);
    const spm = corridas.reduce((s, c) => s + c.spm, 0) / corridas.length;
    const desvio = corridas.reduce((s, c) => s + c.desvio, 0) / corridas.length;
    const domingo = addDays(segunda, 6);
    return {
      segunda,
      domingo,
      // Como nos badges semanais: uma semana só se julga depois de fechada
      // — no próprio domingo ainda se pode correr.
      fechada: domingo < today,
      corridas,
      spm,
      desvio,
      // Sem altura no perfil, a régua perde o termo de estatura e podia
      // acusar de baixa a cadência de alguém alto que a tem certa. Por isso
      // a doutrina manda DESCER A EXIGÊNCIA: sem altura, só se dá uma
      // semana por baixa abaixo dos 155 spm, o sinal vermelho do #1.
      baixa: desvio < CAD_DESVIO_BAIXO && (alturaCm ? true : spm < CAD_PISO_SPM),
      corrigida: desvio >= CAD_DESVIO_CORRIGIDO,
    };
  });

  return { semanas, indeterminadas };
}

/* A varredura: da semana mais antiga para a mais recente, à procura de
   CAD_SEMANAS semanas seguidas (de calendário) com a cadência de volta ao
   esperado, precedidas de pelo menos uma semana baixa.

   Uma semana pelo meio (desvio entre −8 e −4) não é baixa nem corrigida:
   parte a sequência, mas não apaga a memória da semana baixa — uma subida
   gradual (−10, −6, depois três semanas a −3) é exatamente a correção que
   este badge existe para reconhecer.

   Depois de uma conquista a memória da semana baixa limpa-se: a repetição
   exige uma recaída nova, senão um atleta que corrigiu uma vez ganhava o
   badge outra vez a cada três semanas boas. */
function correcoesDeCadencia(semanas) {
  const conquistas = [];
  let baixa = null;
  let sequencia = [];
  for (const s of semanas.filter((x) => x.fechada)) {
    if (s.corrigida) {
      const anterior = sequencia[sequencia.length - 1];
      if (anterior && s.segunda !== addDays(anterior.segunda, 7)) sequencia = [];
      sequencia.push(s);
      if (baixa && sequencia.length >= CAD_SEMANAS) {
        const corrigidas = sequencia.slice(0, CAD_SEMANAS);
        conquistas.push({ baixa, semanas: corrigidas, fim: corrigidas[corrigidas.length - 1] });
        baixa = null;
        sequencia = [];
      }
    } else {
      sequencia = [];
      if (s.baixa) baixa = s;
    }
  }
  return { conquistas, baixa, sequencia };
}

function cadenciaCorrigida({ treinos, profile, today }) {
  const alturaCm = alturaDoPerfil(profile);
  const { semanas, indeterminadas } = semanasDeCadencia({ treinos, alturaCm, today });
  const { conquistas, baixa, sequencia } = correcoesDeCadencia(semanas);

  const ganhoDe = (c) => (c.semanas.reduce((s, x) => s + x.desvio, 0) / c.semanas.length) - c.baixa.desvio;
  const contadas = new Set(conquistas.flatMap((c) => c.semanas.map((s) => s.segunda)));
  const fechadas = semanas.filter((s) => s.fechada);

  const metaDaSemana = (s) => `${fmtSpm(s.spm)} de média · ${fmtDesvio(s.desvio)} face ao esperado · ${s.corridas.length} ${plural(s.corridas.length, 'corrida', 'corridas')}`;

  const sessoes = newestFirst([
    ...fechadas.map((s) => {
      const conta = contadas.has(s.segunda);
      return sessaoDaSemana(s, {
        status: conta ? 'conta' : 'falhou',
        meta: metaDaSemana(s),
        porque: conta
          ? 'Cadência de volta ao esperado para o ritmo desta semana.'
          : (s.baixa
            ? 'Cadência abaixo do esperado — é o ponto de partida deste badge.'
            : 'Não fez parte de uma sequência de três semanas corrigidas.'),
      });
    }),
    ...indeterminadas.map((run) => sessaoDaCorrida(run, {
      status: 'indeterminada',
      meta: run?.distance_km ? fmtKmLinha(num(run.distance_km)) : null,
      porque: 'Sem cadência média no registo.',
    })),
  ]);

  const due = conquistas.map((c) => {
    const ganho = ganhoDe(c);
    return {
      badgeKey: 'cadencia_corrigida',
      tier: '',
      // Uma linha por correção, com a segunda-feira em que a sequência
      // começou: as repetições contam-se com count(*), como no resto.
      periodKey: c.semanas[0].segunda,
      value: round1(ganho),
      valueUnit: 'spm',
      raceId: null,
      // Como nos badges semanais: o prémio é da segunda seguinte ao fecho —
      // o primeiro dia em que os dados o provam.
      awardedOn: addDays(c.fim.domingo, 1),
      title: 'Cadência corrigida',
      // O que o atleta lê. Fala de carga articular (confiança ALTA) e NUNCA
      // de prevenção de lesão (confiança MÉDIA, doutrina #3.4).
      line: `De ${fmtSpm(c.baixa.spm)} na ${labelSemana(c.baixa.segunda)} para ${fmtSpm(c.semanas[c.semanas.length - 1].spm)}: ${CAD_SEMANAS} semanas seguidas com a cadência de volta ao esperado para o teu ritmo — mais ${round1(ganho).toString().replace('.', ',')} spm face à régua, e menos carga absorvida no joelho a cada apoio.`,
    };
  });

  const comum = {
    key: 'cadencia_corrigida',
    name: 'Cadência corrigida',
    rule: `Depois de um período com a cadência abaixo do esperado para o teu ritmo, ${CAD_SEMANAS} semanas seguidas com ela de volta ao esperado — em corridas contínuas em plano.`,
    familia: 'desempenho',
    cor: 'run',
    glifo: 'steps',
    campo: 'details.cadence_spm',
    campoLabel: 'a cadência média',
    dependeDe: 'Precisa da cadência média (spm) no registo da corrida — e da tua altura no Perfil, que é o que afina a régua à tua passada.',
    comoResolver: 'Abre o registo da corrida e preenche a cadência média (spm) — vem no resumo do relógio. A altura preenche-se uma vez, no Perfil.',
    unidade: 'spm',
    sessoes,
    indeterminadas: blocoIndeterminadas(indeterminadas, {
      campoLabel: 'a cadência média',
      comoResolver: 'Abre o registo da corrida e preenche a cadência média (spm) — vem no resumo do relógio.',
    }),
  };

  if (conquistas.length) {
    const ultima = conquistas[conquistas.length - 1];
    const ganho = ganhoDe(ultima);
    return {
      badge: badge({
        ...comum,
        state: 'won',
        ring: 1,
        centro: `+${Math.max(1, Math.round(ganho))}`,
        centroAria: `Cadência corrigida: ganho, mais ${Math.round(ganho)} spm face ao esperado para o teu ritmo`,
        value: round1(ganho),
        count: conquistas.length,
        awardedOn: addDays(ultima.fim.domingo, 1),
        linha: conquistas.length > 1
          ? `${conquistas.length} vezes · a última na ${labelSemana(ultima.fim.segunda)}`
          : `ganho na ${labelSemana(ultima.fim.segunda)}`,
        detalhe: `de ${fmtSpm(ultima.baixa.spm)} para ${fmtSpm(ultima.semanas[ultima.semanas.length - 1].spm)} de média`,
      }),
      due,
    };
  }

  // A caminho: houve uma fase baixa e já há semanas corrigidas seguidas.
  if (baixa && sequencia.length) {
    return {
      badge: badge({
        ...comum,
        state: 'progress',
        ring: Math.min(sequencia.length / CAD_SEMANAS, 0.99),
        centro: `${sequencia.length}/${CAD_SEMANAS}`,
        centroAria: `Cadência corrigida: a caminho, ${sequencia.length} de ${CAD_SEMANAS} semanas seguidas com a cadência de volta ao esperado`,
        linha: `${sequencia.length} de ${CAD_SEMANAS} ${plural(CAD_SEMANAS, 'semana seguida', 'semanas seguidas')} com a cadência de volta ao esperado`,
      }),
      due: [],
    };
  }

  /* Por ganhar. A frase muda com a razão — e nenhuma delas manda o atleta
     perseguir um número: a correção, quando é caso disso, é sempre +5-10%
     SOBRE A CADÊNCIA DO PRÓPRIO (doutrina #1), nunca um valor absoluto. Uma
     cadência dentro do esperado não se comenta (`desvio ≥ −8` é ruído): diz-
     se que não há nada a corrigir, e fica-se por aí. */
  let linha = 'ainda sem corridas contínuas em plano com a cadência registada';
  if (baixa) {
    linha = `a cadência anda abaixo do esperado para o teu ritmo — este badge ganha-se a recuperá-la, subindo 5-10% sobre a TUA cadência, ${CAD_SEMANAS} semanas seguidas`;
  } else if (fechadas.length) {
    linha = 'sem nenhuma fase de cadência baixa para o teu ritmo — não há nada a corrigir';
  }

  return {
    badge: badge({
      ...comum,
      state: 'empty',
      ring: 0,
      centro: String(CAD_SEMANAS),
      centroAria: `Cadência corrigida: por ganhar. ${comum.rule}`,
      linha,
    }),
    due: [],
  };
}

// ── 8. Recorde pessoal ───────────────────────────────────────────────────

/* chave     recorde_pessoal
   regra     "Uma prova cujo tempo oficial é o teu melhor de sempre naquela
             distância."
   campo     race_events + a corrida ligada (findRaceRun) + o tempo oficial;
             o veredicto é o de utils/raceOutcome.js, pelo predicado
             `bateuRecordePessoal` do motor — não se compara tempos aqui.
   em falta  prova concluída sem tempo oficial: INDETERMINADA. É o caso mais
             comum de todos (a prova fechou-se à mão e o diploma nunca foi
             lido), e é exatamente o que o detalhe tem de dizer.
   família   desempenho — é o atleta contra ele próprio à mesma distância, e
             não há medida de desempenho mais direta do que essa. A família
             não segue a cor: a cor diz DE ONDE vem (uma prova), a família diz
             O QUE MEDE. São perguntas diferentes, e é por isso que a família
             teve de existir.
   cor       --race (âmbar) — É O ÚNICO âmbar desta vitrina, e é-o porque
             nasce de uma prova. Nenhum badge de treino leva esta cor.
   níveis    não — repete-se, uma linha por prova (period_key = o id da prova).

   Não é "Os Níveis" do Palmarés: aquilo é uma escala de aptidão (VDOT) que
   se sobe sem bater tempo nenhum próprio; isto é o atleta contra ele mesmo,
   na mesma distância. Ver o comentário de `bateuRecordePessoal` em
   utils/premios.js. */
function recordePessoal({ completed }) {
  const comTempo = completed.filter(({ outcome }) => outcome?.officialSeconds);
  const semTempo = completed.filter(({ outcome }) => !outcome?.officialSeconds);
  const recordes = comTempo.filter(({ outcome }) => bateuRecordePessoal(outcome));

  const sessoes = newestFirst([
    ...recordes.map((e) => sessaoDaProva(e, { status: 'conta', porque: 'O melhor tempo de sempre nesta distância.' })),
    ...comTempo.filter((e) => !bateuRecordePessoal(e.outcome)).map((e) => sessaoDaProva(e, {
      status: 'falhou',
      porque: e.outcome?.previousBestSeconds
        ? `Ficou a ${formatDuration(Math.abs(Math.round(e.outcome.deltaBestSeconds || 0)))} do teu melhor.`
        : 'Não bateu o melhor de sempre nesta distância.',
    })),
    ...semTempo.map((e) => sessaoDaProva(e, { status: 'indeterminada', porque: 'Sem tempo oficial no registo.' })),
  ]);

  const due = recordes.map(({ race, outcome }) => ({
    badgeKey: 'recorde_pessoal',
    tier: '',
    periodKey: String(race.id ?? dayOf(race.date) ?? ''),
    value: Math.round(outcome.officialSeconds),
    valueUnit: 'seconds',
    raceId: race.id ?? null,
    awardedOn: dayOf(race.date),
    title: 'Recorde pessoal',
    line: `${formatDuration(outcome.officialSeconds)} em ${race.name || 'prova'} — o teu melhor tempo de sempre nesta distância.`,
  }));

  const comum = {
    key: 'recorde_pessoal',
    name: 'Recorde pessoal',
    rule: 'Uma prova cujo tempo oficial é o teu melhor de sempre naquela distância.',
    familia: 'desempenho',
    cor: 'race',
    glifo: 'trophy',
    campo: 'details.official_time_seconds',
    campoLabel: 'o tempo oficial da prova',
    dependeDe: 'Precisa do tempo oficial da prova.',
    comoResolver: 'Abre o hub da prova e regista o tempo oficial (ou lê o diploma) — sem tempo não há recorde para comparar.',
    unidade: 'seconds',
    sessoes,
    indeterminadas: blocoIndeterminadas(semTempo, {
      campoLabel: 'o tempo oficial da prova',
      comoResolver: 'Abre o hub da prova e regista o tempo oficial (ou lê o diploma) — sem tempo não há recorde para comparar.',
    }),
  };

  if (recordes.length) {
    // `completed` chega da mais antiga para a mais recente (computeBadges
    // inverte-a, como o Palmarés): a última da lista é a mais recente.
    const ultimo = recordes[recordes.length - 1];
    return {
      badge: badge({
        ...comum,
        state: 'won',
        ring: 1,
        centro: String(recordes.length),
        centroAria: `Recorde pessoal: ${recordes.length} ${plural(recordes.length, 'vez', 'vezes')}`,
        value: Math.round(ultimo.outcome.officialSeconds),
        count: recordes.length,
        awardedOn: dayOf(ultimo.race.date),
        linha: `${recordes.length} ${plural(recordes.length, 'recorde', 'recordes')} · o último em ${ultimo.race.name || 'prova'}, a ${formatDatePTShort(dayOf(ultimo.race.date))}`,
        detalhe: linhaDaProva(ultimo),
      }),
      due,
    };
  }

  const maisPerto = comTempo
    .filter(({ outcome }) => Number.isFinite(outcome?.deltaBestSeconds))
    .reduce((m, e) => (!m || e.outcome.deltaBestSeconds < m.outcome.deltaBestSeconds ? e : m), null);

  return {
    badge: badge({
      ...comum,
      state: 'empty',
      ring: 0,
      centro: maisPerto ? fmtFaltaSegundos(maisPerto.outcome.deltaBestSeconds) : '1',
      centroAria: maisPerto
        ? `Recorde pessoal: por ganhar. A prova mais perto ficou a ${formatDuration(Math.round(maisPerto.outcome.deltaBestSeconds))} do teu melhor`
        : 'Recorde pessoal: por ganhar. Ainda sem provas com tempo oficial para comparar.',
      linha: maisPerto
        ? `a mais perto: ${maisPerto.race.name || 'prova'}, a ${fmtFaltaSegundos(maisPerto.outcome.deltaBestSeconds).replace('+', '')} do teu melhor`
        : 'a primeira prova com tempo oficial numa distância nova é logo recorde',
    }),
    due: [],
  };
}

// ── 9. Os Quilómetros ────────────────────────────────────────────────────

/* chave     quilometros
   regra     "Quilómetros acumulados em treino: 500 (bronze), 1 250 (prata),
             2 500 (ouro)."
   campo     runs.distance_km
   em falta  a corrida NÃO SOMA — não conta a favor (não se inventam
             quilómetros) nem contra. Fica indeterminada, como n'A Escalada.
   cor       --run — é treino de corrida, e é a mesma cor d'A Escalada por
             ser exatamente a mesma espécie de coisa.
   família   acumulacao — soma, e é o que a doutrina 6 #6 manda a Carol nunca
             sugerir: "faltam-te 40 km para o próximo degrau" é a frase que
             põe alguém a correr um longo a mais numa semana de descarga.
   níveis    sim: 500, 1 250 e 2 500 km.

   ── PORQUÊ SÓ TREINO ────────────────────────────────────────────────────
   O medalhão "O Ano em Km" somava TUDO, provas incluídas. Este não: é ciano,
   e a lei da cor não deixa um badge de treino contar provas (ver o cabeçalho
   e `treinosDe`). Os quilómetros de prova têm os seus quatro badges — As
   Distâncias, Os Níveis, A Superação, O Terreno — e não precisam de ser
   contados duas vezes.

   ── PORQUÊ DE SEMPRE, E NÃO DO ANO ──────────────────────────────────────
   O medalhão comparava PERÍODOS (o melhor mês, trimestre, semestre e ano de
   sempre). Isso não se porta para um badge de três níveis sem inventar uma
   pergunta que ninguém respondeu — "o que acontece a 1 de janeiro?" — e é a
   mesma decisão que A Escalada já tinha tomado: acumulado de sempre, que é o
   que um corredor conta quando diz quantos quilómetros leva na vida.

   ── PORQUÊ 500 / 1 250 / 2 500 ──────────────────────────────────────────
   A PROPORÇÃO não se escolheu: é a d'A Escalada — 1 : 2,5 : 5, como
   10 000 / 25 000 / 50 000 m. Os dois badges de acumulação são o par que o
   utilizador pediu para existir, e subirem com a mesma forma é o que impede
   um deles de ser sempre o fácil. Isso deixa UM número por decidir, o
   bronze; os outros dois saem dele.

   E o bronze não se calibra a um utilizador — calibra-se ao que significa
   alguma coisa para quem corre. A app vai ter milhares de contas; a régua
   tem de aguentar a primeira semana de todas elas e o quinto ano de algumas.
   Os dois erros, os dois fáceis de cometer:

     · um limiar que se ganha na primeira semana não diz nada. Um badge que
       toda a gente tem no dia em que instala a app não é um feito, é um
       cumprimento — e gasta a vitrina inteira, porque ensina que os anéis
       cheios não querem dizer nada;
     · um limiar a três anos de distância também não. Um badge que ninguém
       alcança é um badge que não existe, e para o atleta é pior do que não
       o haver: é um lugar vazio na grelha a dizer-lhe que não chega.

   Entre os dois, o que faz sentido para um badge de ACUMULAÇÃO é a ordem de
   grandeza dos MESES. Não semanas — em semanas não se acumula nada — e não
   anos, que é onde vive o ouro.

   A conta, com um utilizador ativo real como referência de ritmo (não como
   alvo a satisfazer): ~64 km de treino por mês, que é o que a produção
   mostra numa conta com 7 meses de uso regular. A esse ritmo:

     bronze    500 km  ≈ 8 meses — e ≈ 3 meses a 170 km/mês, que é o que faz
                         quem treina a sério. Meses nos dois casos;
     prata   1 250 km  ≈ 20 meses;
     ouro    2 500 km  ≈ 3 anos e meio — o degrau que se conta em anos, que
                         é o que um degrau mais alto deve ser.

   ── E A COMPARAÇÃO COM A ESCALADA ───────────────────────────────────────
   À mesma referência, o bronze d'A Escalada (10 000 m de D+) fica bastante
   mais longe do que este. É justo que fique: o D+ é um campo OPCIONAL do
   registo, e quanto dele se acumula depende sobretudo de onde se vive. A
   distância vem preenchida em qualquer registo e não depende de nada — é a
   medida que a app consegue mesmo dar a toda a gente, e por isso é a que
   pode ter o degrau mais baixo dos dois sem se desvalorizar. */
const QUILOMETROS_LIMIARES = [500, 1250, 2500];

/** Km para o NÚMERO DENTRO DO ANEL, onde só cabem 3 ou 4 caracteres: "2,5k"
 *  a partir dos 1 000, "850" abaixo disso. É o par de `fmtMetrosCurto`. */
function fmtKmCurto(km) {
  const v = Math.max(0, Math.round(km || 0));
  if (v >= 1000) return `${String(round1(v / 1000)).replace('.', ',')}k`;
  return milhares(v);
}

const fmtKmTotal = (km) => `${milhares(Math.round(Math.max(0, km || 0)))} km`;

function quilometros({ treinos }) {
  const comKm = [];
  const indeterminadas = [];
  for (const run of treinos) {
    const km = num(run?.distance_km);
    if (km == null) indeterminadas.push(run);
    else comKm.push({ run, km });
  }
  const porData = [...comKm].sort((a, b) => (dayOf(a.run.date) || '').localeCompare(dayOf(b.run.date) || ''));
  let acumulado = 0;
  const passos = porData.map(({ run, km }) => {
    acumulado += km;
    return { valor: acumulado, date: dayOf(run.date) };
  });

  const sessoes = newestFirst([
    ...comKm.map(({ run, km }) => sessaoDaCorrida(run, { status: 'conta', meta: fmtKmLinha(km), porque: 'Somou ao acumulado.' })),
    ...indeterminadas.map((run) => sessaoDaCorrida(run, { status: 'indeterminada', meta: null, porque: 'Sem distância no registo — não somou.' })),
  ]);

  return badgeDeNiveis({
    key: 'quilometros',
    name: 'Os Quilómetros',
    rule: 'Quilómetros acumulados em treino — 500 para bronze, 1 250 para prata, 2 500 para ouro.',
    familia: 'acumulacao',
    cor: 'run',
    glifo: 'route',
    campo: 'distance_km',
    campoLabel: 'a distância',
    dependeDe: 'Precisa da distância no registo da corrida.',
    comoResolver: 'Abre o registo da corrida e preenche a distância — sem ela a corrida não soma para o acumulado.',
    unidade: 'km',
    limiares: QUILOMETROS_LIMIARES,
    passos,
    fmtValor: fmtKmTotal,
    fmtCentroValor: fmtKmCurto,
    sessoes,
    indeterminadas,
    semNada: 'ainda sem treinos com distância registada',
    tituloDe: 'de treino acumulado',
    // "850/1k" não cabe no anel; é o arco que diz quanto falta.
    centroCompara: false,
    linhaDue: (g) => `${fmtKmTotal(g.valor)} de treino acumulado — ${g.nivel.label.toLowerCase()} d'Os Quilómetros.`,
  });
}

// ── 10. As Distâncias ────────────────────────────────────────────────────

/* chave     distancias
   regra     "A primeira prova concluída em cada distância: 5, 10, 21,1 e
             42,2 km."
   campo     race_events.distance_km (a distância OFICIAL da prova)
   em falta  uma prova concluída sem distância fica INDETERMINADA: não se
             adivinha em que encaixe cai. Uma prova de 15 km não fica — tem o
             dado, e a resposta é que não cai em nenhum (NENHUM_ENCAIXE).
   cor       --race (âmbar) — nasce de uma prova.
   família   desempenho — a família diz O QUE MEDE, a cor diz DE ONDE VEM.
             Podia argumentar-se `acumulacao`, por contar ocorrências; não é:
             quatro encaixes fixos que se enchem uma vez não são um total que
             cresce, e o que separa a maratona dos 5 km é aptidão, não volume.
   níveis    não — quatro encaixes.

   As bandas de cada distância são as de `utils/premios.js`
   (DISTANCIAS_DE_PROVA), partilhadas com O Palmarés: a distância oficial com
   a folga do GPS, e não a categoria de treino de `categorizeDistance`.

   Um prémio POR ENCAIXE, e não um só no fim (ver `duePorEncaixe`): a
   primeira meia maratona é um feito no dia em que acontece e não pode ficar
   à espera de uma maratona — que muita gente nunca vai correr — para
   aparecer na história do atleta. O ANEL, esse, só fecha com os quatro. */
/* Os encaixes são as próprias entradas de DISTANCIAS_DE_PROVA: já trazem o
   `key` e o `label` que a varredura precisa, mais o `primeira` que dá o
   título do prémio. */
function distancias({ completed }) {
  return badgeDeEncaixes({
    key: 'distancias',
    name: 'As Distâncias',
    rule: 'A primeira prova concluída em cada uma das quatro distâncias: 5, 10, 21,1 e 42,2 km.',
    familia: 'desempenho',
    cor: 'race',
    glifo: 'milestone',
    campo: 'race_events.distance_km',
    campoLabel: 'a distância da prova',
    dependeDe: 'Precisa da distância da prova concluída.',
    comoResolver: 'Abre o hub da prova e preenche a distância — sem ela não se sabe que encaixe a prova enche.',
    encaixes: DISTANCIAS_DE_PROVA,
    candidatas: completed,
    fazSessao: sessaoDaProva,
    dataDe: (entry) => dayOf(entry?.race?.date),
    metaSimples: () => null,
    encaixeDe: ({ race, outcome }) => {
      if (kmDeProva(race, outcome) == null) return null;
      const dist = distanciaDeProva(race, outcome);
      return dist ? dist.key : NENHUM_ENCAIXE;
    },
    descreveEncaixe: (encaixe, entry) => linhaDaProva(entry),
    porqueConta: (encaixe) => `A tua primeira prova de ${encaixe.label}.`,
    semNada: 'ainda sem provas concluídas nestas distâncias',
    duePorEncaixe: (encaixe, { race, outcome }) => ({
      value: round1(kmDeProva(race, outcome) || 0),
      valueUnit: 'km',
      raceId: race?.id ?? null,
      title: encaixe.primeira,
      line: `${encaixe.label} — ${race?.name || 'a prova'}, a tua primeira prova nesta distância.`,
    }),
    linhaDue: () => '5, 10, 21,1 e 42,2 km: uma primeira vez em cada distância.',
  });
}

// ── 11. Os Níveis ────────────────────────────────────────────────────────

/* chave     niveis
   regra     "A escala VDOT no teu melhor esforço de prova: 35 (bronze), 45
             (prata), 55 (ouro)."
   campo     o tempo oficial da prova (com a distância) — o VDOT calcula-se
             com `calculateVDOT` (@formulas/racePrediction.ts), a mesma
             fórmula que a tendência do dashboard de corrida usa.
   em falta  prova concluída sem tempo oficial: INDETERMINADA. É o caso mais
             comum de todos, o mesmo do `recorde_pessoal`.
   cor       --race (âmbar) — nasce de provas.
   família   desempenho — não há medida de desempenho mais direta.
   níveis    sim: VDOT 35, 45 e 55.

   ── PORQUÊ VDOT, E NÃO TEMPOS POR DISTÂNCIA ─────────────────────────────
   É a única régua que compara distâncias diferentes: um 10 km de ouro e uma
   maratona de ouro exigem a mesma aptidão aeróbica. Os limiares são os do
   medalhão, sem mudar nada:

     VDOT 35 (bronze) = 5 km 27:01 · 10 km 56:06 · meia 2:04:22 · maratona 4:16:24
     VDOT 45 (prata)  = 5 km 21:50 · 10 km 45:16 · meia 1:40:20 · maratona 3:28:27
     VDOT 55 (ouro)   = 5 km 18:23 · 10 km 38:07 · meia 1:24:20 · maratona 2:56:03

   ── O QUE NÃO VEIO ──────────────────────────────────────────────────────
   O medalhão tinha seis encaixes: as quatro distâncias, o passo mais rápido
   de sempre e o melhor VO2 do relógio. Um badge tem TRÊS degraus e uma
   escala só, por isso o que veio foi a escala — o melhor VDOT de prova de
   sempre. O passo mais rápido não se perde: é o mesmo esforço visto pelo
   tempo, e quem sobe de nível sobe-o com ele. O VO2 do relógio ficou de
   fora de propósito — é um número que o relógio ESTIMA, não um que o atleta
   correu, e a escala é de provas.

   ── E NÃO É O RECORDE PESSOAL ───────────────────────────────────────────
   Sobe-se de bronze para prata sem bater tempo próprio nenhum (basta uma
   primeira prova numa distância nova), e o recorde pessoal é o atleta contra
   ele mesmo na mesma distância. Ver `bateuRecordePessoal` em
   utils/premios.js. São duas perguntas, e são dois badges. */
const NIVEIS_VDOT = [35, 45, 55];

/* Acima disto não é um atleta: é um tempo mal escrito (minutos onde deviam
   estar horas), uma distância errada, ou um registo de bicicleta. O recorde
   mundial dos 10 000 m anda em VDOT ~85. Importa porque `user_badges` é
   append-only: um ouro cunhado por um registo errado fica lá para sempre,
   mesmo depois de o atleta corrigir a prova. É o mesmo teto que O Palmarés
   usa — e, quando o Palmarés sair, esta é a cópia que fica. */
const VDOT_MAXIMO_PLAUSIVEL = 85;

function niveis({ completed }) {
  const comVdot = [];
  const indeterminadas = [];
  for (const entry of completed) {
    const km = kmDeProva(entry.race, entry.outcome);
    const segundos = entry.outcome?.officialSeconds;
    const vdot = km && segundos ? calculateVDOT(km, segundos) : 0;
    if (!vdot) { indeterminadas.push({ entry, porque: 'Sem tempo oficial no registo.' }); continue; }
    if (vdot > VDOT_MAXIMO_PLAUSIVEL) {
      indeterminadas.push({ entry, porque: `VDOT ${String(vdot).replace('.', ',')} — fora do plausível, não decide nada.` });
      continue;
    }
    comVdot.push({ entry, vdot });
  }

  /* `completed` chega da mais antiga para a mais recente: o melhor VDOT só
     sobe, e cada subida é um passo com o dia em que os dados a provam — a
     mesma régua do acumulado d'A Escalada, com um máximo em vez de uma soma. */
  let melhor = 0;
  const passos = [];
  const subiram = new Set();
  for (const { entry, vdot } of comVdot) {
    if (vdot <= melhor) continue;
    melhor = vdot;
    subiram.add(entry);
    passos.push({ valor: melhor, date: dayOf(entry.race.date), raceId: entry.race.id ?? null });
  }

  const vdotTexto = (v) => `VDOT ${String(round1(v)).replace('.', ',')}`;
  const sessoes = newestFirst([
    ...comVdot.map(({ entry, vdot }) => sessaoDaProva(entry, {
      status: subiram.has(entry) ? 'conta' : 'falhou',
      meta: `${linhaDaProva(entry)} · ${vdotTexto(vdot)}`,
      porque: subiram.has(entry) ? 'Subiu o teu melhor VDOT.' : 'Não subiu o teu melhor VDOT.',
    })),
    ...indeterminadas.map(({ entry, porque }) => sessaoDaProva(entry, { status: 'indeterminada', porque })),
  ]);

  return badgeDeNiveis({
    key: 'niveis',
    name: 'Os Níveis',
    rule: 'A escala VDOT no teu melhor esforço de prova — 35 para bronze, 45 para prata, 55 para ouro.',
    familia: 'desempenho',
    cor: 'race',
    glifo: 'gauge',
    campo: 'details.official_time_seconds',
    campoLabel: 'o tempo oficial da prova',
    dependeDe: 'Precisa do tempo oficial da prova (e da distância) para calcular o VDOT.',
    comoResolver: 'Abre o hub da prova e regista o tempo oficial (ou lê o diploma) — sem tempo não há VDOT.',
    unidade: 'vdot',
    limiares: NIVEIS_VDOT,
    passos,
    // Uma casa decimal, que é a do VDOT que a app já mostra noutros ecrãs.
    arredondaValor: round1,
    fmtValor: (v) => `${String(round1(v)).replace('.', ',')} de VDOT`,
    fmtCentroValor: (v) => String(Math.round(v)),
    sessoes,
    indeterminadas: indeterminadas.map(({ entry }) => entry),
    semNada: 'ainda sem provas com tempo oficial para calcular o VDOT',
    tituloDe: 'no teu melhor esforço de prova',
    linhaDue: (g) => `${String(round1(g.valor)).replace('.', ',')} de VDOT — ${g.nivel.label.toLowerCase()} d'Os Níveis.`,
  });
}

// ── 12. A Superação ──────────────────────────────────────────────────────

/* chave     superacao
   regra     "Uma prova concluída no objetivo de tempo que marcaste, ou
             abaixo dele."
   campo     race_events.target_time_seconds + o tempo oficial; o veredicto é
             o de utils/raceOutcome.js, pelo predicado `bateuObjetivo` do
             motor — não se comparam tempos aqui.
   em falta  duas faltas e as duas se dizem, porque a resposta ao atleta é
             diferente: sem OBJETIVO marcado não há nada contra que medir (e
             o `basis` do veredicto cai em 'previsao'); sem TEMPO OFICIAL não
             há o que medir. Nos dois casos a prova fica INDETERMINADA — dizer
             que "falhou" quem nunca marcou objetivo era mentir-lhe.
   cor       --race (âmbar) — nasce de uma prova.
   família   desempenho.
   níveis    não — repete-se, uma linha por prova (period_key = o id da prova).

   O medalhão contava 1, 3, 5 e 10 objetivos em quatro encaixes. O badge é
   repetível, que é a forma da vitrina para a mesma coisa: cada objetivo
   batido é uma linha em `user_badges` com a SUA data e a SUA prova, e o
   número dentro do anel é quantos são. Um contador de encaixes daria menos
   história, não mais. */
function superacao({ completed }) {
  const julgaveis = completed.filter(({ outcome }) => outcome?.officialSeconds && outcome?.basis === 'objetivo');
  const porJulgar = completed.filter(({ outcome }) => !(outcome?.officialSeconds && outcome?.basis === 'objetivo'));
  const batidos = julgaveis.filter(({ outcome }) => bateuObjetivo(outcome));
  const falhados = julgaveis.filter(({ outcome }) => !bateuObjetivo(outcome));

  const sessoes = newestFirst([
    ...batidos.map((entry) => sessaoDaProva(entry, {
      status: 'conta',
      porque: entry.outcome.deltaTargetSeconds === 0
        ? 'Objetivo cumprido em cima da hora.'
        : `Objetivo batido por ${formatDuration(Math.abs(Math.round(entry.outcome.deltaTargetSeconds)))}.`,
    })),
    ...falhados.map((entry) => sessaoDaProva(entry, {
      status: 'falhou',
      porque: `Ficou a ${formatDuration(Math.round(entry.outcome.deltaTargetSeconds))} do objetivo.`,
    })),
    ...porJulgar.map((entry) => sessaoDaProva(entry, {
      status: 'indeterminada',
      porque: entry.outcome?.officialSeconds ? 'Sem objetivo de tempo marcado na prova.' : 'Sem tempo oficial no registo.',
    })),
  ]);

  const due = batidos.map(({ race, outcome }) => ({
    badgeKey: 'superacao',
    tier: '',
    periodKey: String(race.id ?? dayOf(race.date) ?? ''),
    // O tempo oficial, como no `recorde_pessoal`: é o número da prova. A
    // margem — por quanto bateu — vai na frase, que é onde se lê.
    value: Math.round(outcome.officialSeconds),
    valueUnit: 'seconds',
    raceId: race.id ?? null,
    awardedOn: dayOf(race.date),
    title: 'Objetivo batido',
    line: `${formatDuration(outcome.officialSeconds)} para um objetivo de ${formatDuration(outcome.targetSeconds)} — ${race.name || 'a prova'}.`,
  }));

  const comum = {
    key: 'superacao',
    name: 'A Superação',
    rule: 'Uma prova concluída no objetivo de tempo que marcaste, ou abaixo dele.',
    familia: 'desempenho',
    cor: 'race',
    glifo: 'crosshair',
    campo: 'target_time_seconds',
    campoLabel: 'o objetivo de tempo da prova',
    dependeDe: 'Precisa do objetivo de tempo marcado na prova e do tempo oficial dela.',
    comoResolver: 'Abre o hub da prova, marca o objetivo de tempo antes de correres e regista o tempo oficial depois — sem os dois não há objetivo para bater.',
    unidade: 'seconds',
    sessoes,
    indeterminadas: blocoIndeterminadas(porJulgar, {
      campoLabel: 'o objetivo de tempo da prova',
      comoResolver: 'Abre o hub da prova, marca o objetivo de tempo antes de correres e regista o tempo oficial depois — sem os dois não há objetivo para bater.',
    }),
  };

  if (batidos.length) {
    // `completed` chega da mais antiga para a mais recente: a última é a
    // mais recente.
    const ultimo = batidos[batidos.length - 1];
    return {
      badge: badge({
        ...comum,
        state: 'won',
        ring: 1,
        centro: String(batidos.length),
        centroAria: `A Superação: ${batidos.length} ${plural(batidos.length, 'objetivo batido', 'objetivos batidos')}`,
        value: Math.round(ultimo.outcome.officialSeconds),
        count: batidos.length,
        awardedOn: dayOf(ultimo.race.date),
        linha: `${batidos.length} ${plural(batidos.length, 'objetivo batido', 'objetivos batidos')} · o último em ${ultimo.race.name || 'prova'}, a ${formatDatePTShort(dayOf(ultimo.race.date))}`,
        detalhe: linhaDaProva(ultimo),
      }),
      due,
    };
  }

  const maisPerto = falhados.reduce((m, e) => (!m || e.outcome.deltaTargetSeconds < m.outcome.deltaTargetSeconds ? e : m), null);
  return {
    badge: badge({
      ...comum,
      state: 'empty',
      ring: 0,
      centro: maisPerto ? fmtFaltaSegundos(maisPerto.outcome.deltaTargetSeconds) : '1',
      centroAria: maisPerto
        ? `A Superação: por ganhar. A prova mais perto ficou a ${formatDuration(Math.round(maisPerto.outcome.deltaTargetSeconds))} do objetivo`
        : 'A Superação: por ganhar. Ainda sem provas com objetivo marcado e tempo oficial.',
      linha: maisPerto
        ? `a mais perto: ${maisPerto.race.name || 'prova'}, a ${fmtFaltaSegundos(maisPerto.outcome.deltaTargetSeconds).replace('+', '')} do objetivo`
        : 'marca o objetivo de tempo antes da próxima prova e este badge passa a ter resposta',
    }),
    due: [],
  };
}

// ── 13. O Terreno ────────────────────────────────────────────────────────

/* chave     terreno
   regra     "A 1.ª e a 5.ª prova em estrada e em trail — quatro encaixes."
   campo     race_events.race_type
   em falta  NENHUMA falta é possível: a coluna só admite os dois valores e
             uma prova antiga sem terreno conta como estrada, que é o que era
             (`terrenoDe`, em utils/premios.js). É o único badge de prova sem
             sessões indeterminadas — e a 2.ª, a 3.ª e a 4.ª prova de um
             terreno também não ficam por decidir: têm o dado e simplesmente
             não enchem encaixe nenhum (NENHUM_ENCAIXE).
   cor       --race (âmbar) — nasce de provas.
   família   desempenho — 21 km em trail não é a mesma prova que 21 km em
             estrada, e é essa diferença que o badge mede. O medalhão ficava
             "sem esmalte" porque contava ocorrências; a vitrina não tem essa
             saída, e não precisa dela: a prata aqui é dos amuletos.
   níveis    não — quatro encaixes.

   Um prémio por encaixe, pela mesma razão d'As Distâncias: a primeira prova
   de trail é um feito seu, e não fica à espera da quinta de estrada. */
const TERRENO_MARCOS = [1, 5];

function terreno({ completed }) {
  /* Que prova enche que encaixe, decidido UMA vez com `provasDoTerreno` (da
     mais antiga para a mais recente, que é a ordem em que se ganha a
     primeira e a quinta). O `encaixeDe` abaixo só consulta o resultado — uma
     prova não sabe sozinha que é a quinta. */
  const doEncaixe = new Map();
  const encaixes = [];
  for (const n of TERRENO_MARCOS) {
    for (const t of TERRENOS) {
      const provas = provasDoTerreno(completed, t.key);
      const nth = provas[n - 1] || null;
      const key = `${t.key}${n}`;
      encaixes.push({
        key,
        label: n === 1 ? `1.ª ${t.em}` : `${n} ${t.em}`,
        marco: n,
        terreno: t,
      });
      if (nth?.race?.id != null) doEncaixe.set(nth.race.id, key);
    }
  }

  return badgeDeEncaixes({
    key: 'terreno',
    name: 'O Terreno',
    rule: 'A primeira prova de cada terreno e a quinta: estrada e trail contam em separado.',
    familia: 'desempenho',
    cor: 'race',
    glifo: 'map',
    campo: 'race_type',
    campoLabel: 'o terreno da prova',
    dependeDe: 'Precisa do terreno da prova — que qualquer prova já tem: trail, ou estrada em tudo o resto.',
    comoResolver: 'Nada a resolver: uma prova sem terreno marcado conta como estrada, que é o que era.',
    encaixes,
    candidatas: completed,
    fazSessao: sessaoDaProva,
    dataDe: (entry) => dayOf(entry?.race?.date),
    metaSimples: () => null,
    encaixeDe: (entry) => doEncaixe.get(entry?.race?.id) ?? NENHUM_ENCAIXE,
    descreveEncaixe: (encaixe, entry) => linhaDaProva(entry),
    porqueConta: (encaixe) => (encaixe.marco === 1
      ? `A tua primeira prova ${encaixe.terreno.em}.`
      : `A tua ${encaixe.marco}.ª prova ${encaixe.terreno.em}.`),
    semNada: 'ainda sem provas concluídas',
    duePorEncaixe: (encaixe, { race }) => ({
      value: encaixe.marco,
      valueUnit: 'count',
      raceId: race?.id ?? null,
      title: encaixe.marco === 1 ? `Primeira ${encaixe.terreno.em}` : `${encaixe.marco} provas ${encaixe.terreno.em}`,
      line: encaixe.marco === 1
        ? `${race?.name || 'A prova'} — a tua primeira prova ${encaixe.terreno.em}.`
        : `${race?.name || 'A prova'} — a tua ${encaixe.marco}.ª prova ${encaixe.terreno.em}.`,
    }),
    linhaDue: () => 'A primeira e a quinta, em estrada e em trail.',
  });
}

// ── 14. A Sequência ──────────────────────────────────────────────────────

/* chave     sequencia
   regra     "A maior série de provas seguidas com a corrida registada: 3
             (bronze), 5 (prata), 8 (ouro)."
   campo     race_events.status + a corrida ligada (findRaceRun)
   em falta  NÃO HÁ indeterminadas, e é o único badge de que isso se diz
             assim: aqui a ausência do dado É a resposta. Uma prova que
             passou sem a corrida registada não fica por decidir — QUEBRA a
             sequência, que é a regra inteira deste badge.
   cor       --ok (verde) — disciplina, e não âmbar apesar de contar provas.
             A cor diz de onde vem o feito e a família diz o que ele mede;
             aqui as duas apontam para o mesmo sítio e o que se mede não é a
             prova, é APARECER: uma sequência não se corre melhor, cumpre-se.
             É o mesmo verde da Semana 100% e do Descanso cumprido.
   família   disciplina.
   níveis    sim: 3, 5 e 8 provas seguidas.

   ── PORQUÊ 3 / 5 / 8, SE O MEDALHÃO TINHA 2, 3, 5 E 8 ───────────────────
   Quatro encaixes não cabem em três degraus, e o que saiu foi o 2: duas
   provas seguidas não são uma série, são uma coincidência — e o estado "a
   caminho" já mostra "2/3" no anel, que diz a mesma coisa sem a cunhar.
   ⚠️ Quem já tinha a medalha das 2 no Palmarés NÃO ganhou bronze por ela: a
   migração de dados (fase B) não converteu esse encaixe.

   O varrimento é um só e vive em `utils/premios.js` (`varrerSequencia`), que
   devolve os RECORDES: cada vez que a maior série de sempre cresce. Como ela
   cresce de um em um, cada recorde é um passo novo — e um badge ganho não
   se perde no dia em que a série seguinte quebra, que é a razão de o
   varrimento guardar máximos em vez de olhar só para a série em curso. */
const SEQUENCIA_LIMIARES = [3, 5, 8];

function sequencia({ completed, raceEvents, runs, today }) {
  const { recordes } = varrerSequencia({ raceEvents, runs, today });
  const passos = recordes.map((r) => ({ valor: r.n, date: r.awardedOn, raceId: r.race?.id ?? null }));

  /* A lista do detalhe é a história toda, prova a prova: as que contaram e
     as que quebraram. É a única forma de o atleta ver ONDE a série partiu —
     um número sozinho não o diz. */
  const entryDaProva = new Map(completed.map((entry) => [entry.race.id, entry]));
  const passadas = (raceEvents || [])
    .filter((race) => race && dayOf(race.date) && dayOf(race.date) <= today);
  const sessoes = newestFirst(passadas.map((race) => {
    const entry = entryDaProva.get(race.id);
    return entry
      ? sessaoDaProva(entry, { status: 'conta', porque: 'Corrida registada — a série continuou.' })
      : sessaoDaProva({ race, outcome: null }, { status: 'falhou', porque: 'Passou sem a corrida registada — quebrou a série.' });
  }));

  return badgeDeNiveis({
    key: 'sequencia',
    name: 'A Sequência',
    rule: 'A maior série de provas seguidas com a corrida registada — 3 para bronze, 5 para prata, 8 para ouro.',
    familia: 'disciplina',
    cor: 'ok',
    glifo: 'link',
    campo: 'race_events.status',
    campoLabel: 'a corrida ligada à prova',
    dependeDe: 'Precisa da prova marcada como concluída e da corrida registada nela.',
    comoResolver: 'Abre o hub da prova e regista a corrida — uma prova que passa sem registo quebra a série.',
    unidade: 'count',
    limiares: SEQUENCIA_LIMIARES,
    passos,
    fmtValor: (n) => `${Math.max(0, Math.round(n))} ${plural(Math.round(n), 'prova', 'provas')}`,
    fmtCentroValor: (n) => String(Math.max(0, Math.round(n))),
    sessoes,
    // Ver o bloco acima: aqui a falta do registo é a resposta, não uma dúvida.
    indeterminadas: [],
    semNada: 'ainda sem provas seguidas com a corrida registada',
    tituloDe: 'seguidas com a corrida registada',
    linhaDue: (g) => `${g.valor} provas seguidas com a corrida registada — ${g.nivel.label.toLowerCase()} d'A Sequência.`,
  });
}

// ── 15. O Passo ──────────────────────────────────────────────────────────

/* chave     melhor_passo
   regra     "O teu passo mais rápido de sempre, de prova ou de treino:
             6.00/km (bronze), 5.00/km (prata), 4.15/km (ouro)."
   campo     runs.distance_km + runs.duration_seconds (e, quando existirem,
             os parciais de runs.details.splits) — a medida é a do
             `computeBestPace` (@formulas/bestPace.ts), a mesma que o
             dashboard de corrida mostra nos recordes de ritmo.
   em falta  corrida sem distância ou sem tempo, ou cuja distância não cai em
             nenhum dos três escalões: INDETERMINADA. Não conta nem a favor
             nem contra — um sprint de 2 km não é uma tentativa falhada a
             este badge, é uma corrida que ele não sabe ler.
   cor       --run (ciano) — ver abaixo.
   família   desempenho — é velocidade pura, a medida mais direta que há.
   níveis    sim: bronze 6.00/km, prata 5.00/km, ouro 4.15/km.

   ── DE ONDE VEM ─────────────────────────────────────────────────────────
   Era um dos seis encaixes do medalhão "Os Níveis" (o antigo
   utils/medalhoes.js), e não veio na fase A porque um badge tem três
   degraus e uma escala só — o que coube foi o VDOT de prova. Isso foi uma
   limitação da FORMA do badge, não um juízo sobre o que ele mede, e a
   resposta é esta: escala própria, badge próprio. (O outro encaixe que
   ficou de fora, o VO2 do relógio, continua de fora e de propósito: é uma
   estimativa do aparelho, não uma coisa corrida.)

   ── PORQUÊ CIANO, E NÃO ÂMBAR ───────────────────────────────────────────
   Porque conta TREINO TAMBÉM: o passo mais rápido de sempre tanto pode
   nascer de uma prova como de uma série de terça-feira, e a lei da cor diz
   que o âmbar é só o que NASCE de uma prova. É o mesmo raciocínio d'A
   Escalada. A pergunta é o que o badge mede, não de que tabela veio o dado.

   ── PORQUÊ ESCALA PRÓPRIA, E NÃO VDOT ───────────────────────────────────
   Os limiares são os do encaixe, sem mudar nada — 360, 300 e 255 s/km. O
   VDOT compara distâncias diferentes pela aptidão que exigem, que é o que
   Os Níveis precisam; aqui não se compara nada com nada, mede-se velocidade
   crua em s/km. Os três escalões (5, 10 e 21 km) são os do
   `computeBestPace`, e um passo de 5 km vale o mesmo que um de 21 km — o
   que é generoso para o de 5 km e é assim desde o medalhão.

   ── A ESCALA QUE DESCE ──────────────────────────────────────────────────
   É o único badge em que MAIS BAIXO É MELHOR. O `badgeDeNiveis` aceita-o
   pelo `menorEMelhor`, que vira as comparações do sentido do degrau — não
   há motor novo aqui. */
const PASSO_BUCKETS = [5, 10, 21];
const PASSO_LIMIARES = [360, 300, 255];

/* Abaixo disto não é um atleta a correr: é o GPS a delirar, uma saída de
   bicicleta mal classificada, ou um tempo escrito em minutos onde deviam
   estar horas. O recorde mundial dos 10 000 m anda nos ~157 s/km (2.37/km),
   e 150 fica um pouco abaixo disso — o suficiente para nunca cortar um
   registo humano, que é o erro que não se pode cometer, e para apanhar o
   lixo que é ordens de grandeza mais rápido.

   Importa pela mesma razão que o teto de VDOT d'Os Níveis: `user_badges` é
   append-only e não tem política de delete, por isso um ouro cunhado por um
   registo errado fica lá para sempre, mesmo depois de o atleta corrigir a
   corrida. Entre deixar passar um ciclista lento (que este teto não apanha —
   nenhum número o apanharia) e roubar um ouro a quem o correu, a escolha é
   fácil: o teto é largo de propósito. */
const PASSO_MINIMO_PLAUSIVEL = 150;

/* O melhor passo de UMA corrida, pelos três escalões. Cada corrida passa
   sozinha pelo MESMO `computeBestPace` que o total usaria — é a régua do
   badge aplicada uma vez, em vez de uma conta paralela para a lista do
   detalhe que podia discordar dela (foi o bug do encaixe do medalhão).
   Devolve `medidas` (o que se conseguiu ler) e `melhor` (a mais rápida das
   plausíveis), que são coisas diferentes quando o registo é lixo. */
function passoDaCorrida(run) {
  const maisRapida = (lista) => lista.reduce((a, m) => (!a || m.pace < a.pace ? m : a), null);
  const medidas = PASSO_BUCKETS.map((km) => computeBestPace([run], km)).filter(Boolean);
  return {
    medidas,
    // A mais rápida DE TODAS (mesmo implausível): é o número que a sessão
    // indeterminada mostra, para o atleta ver o que o registo diz.
    bruta: maisRapida(medidas),
    melhor: maisRapida(medidas.filter((m) => m.pace >= PASSO_MINIMO_PLAUSIVEL)),
  };
}

function melhorPasso({ runs, today }) {
  /* Prova OU treino: é a única coisa que este badge tem de diferente dos
     outros de corrida, e é o que o torna ciano. Por isso lê `runs` e não
     `treinos` — mas com o mesmo filtro do relógio que o `computeBadges`
     aplica aos treinos: uma corrida com data no futuro não conta. */
  const corridas = (runs || []).filter((r) => r && dayOf(r.date) && dayOf(r.date) <= today);
  const medidas = [];
  const indeterminadas = [];
  for (const run of corridas) {
    const { medidas: lidas, bruta, melhor } = passoDaCorrida(run);
    if (!lidas.length) {
      indeterminadas.push({ run, porque: 'Sem distância de 5, 10 ou 21 km (inteira ou em parcial) para medir o passo.' });
      continue;
    }
    if (!melhor) {
      indeterminadas.push({ run, porque: `${formatPace(bruta.pace)}/km — fora do plausível, não decide nada.` });
      continue;
    }
    medidas.push({ run, pace: melhor.pace, source: melhor.source });
  }

  /* O recorde só DESCE, e cada descida é um passo com o dia em que os dados
     a provam — a mesma régua do acumulado d'A Escalada e do máximo d'Os
     Níveis, com um mínimo em vez de uma soma. Daí a ordem cronológica. */
  const porData = [...medidas].sort((a, b) => (dayOf(a.run.date) || '').localeCompare(dayOf(b.run.date) || ''));
  let recorde = Infinity;
  const passos = [];
  const baixaram = new Set();
  for (const m of porData) {
    if (m.pace >= recorde) continue;
    recorde = m.pace;
    baixaram.add(m.run);
    passos.push({ valor: recorde, date: dayOf(m.run.date) });
  }

  const sessoes = newestFirst([
    ...medidas.map(({ run, pace, source }) => sessaoDaCorrida(run, {
      status: baixaram.has(run) ? 'conta' : 'falhou',
      meta: `${formatPace(pace)}/km${source === 'split' ? ' (num parcial)' : ''}`,
      porque: baixaram.has(run) ? 'Baixou o teu passo mais rápido.' : 'Não baixou o teu passo mais rápido.',
    })),
    ...indeterminadas.map(({ run, porque }) => sessaoDaCorrida(run, {
      status: 'indeterminada',
      meta: run?.distance_km ? fmtKmLinha(num(run.distance_km)) : null,
      porque,
    })),
  ]);

  return badgeDeNiveis({
    key: 'melhor_passo',
    name: 'O Passo',
    rule: 'O teu passo mais rápido de sempre, de prova ou de treino — 6.00/km para bronze, 5.00/km para prata, 4.15/km para ouro.',
    familia: 'desempenho',
    cor: 'run',
    glifo: 'zap',
    campo: 'distance_km + duration_seconds',
    campoLabel: 'a distância e o tempo',
    dependeDe: 'Precisa de corridas (ou parciais) de 5, 10 ou 21 km com distância e tempo registados.',
    comoResolver: 'Abre o registo da corrida e confirma a distância e a duração — sem as duas não há passo para medir.',
    unidade: 'seconds',
    limiares: PASSO_LIMIARES,
    passos,
    menorEMelhor: true,
    fmtValor: (v) => `${formatPace(v)}/km`,
    // A diferença entre dois passos são segundos por km, não um passo: "60 s
    // por km" e nunca "1.00/km", que era o mesmo número a dizer outra coisa.
    fmtDiferenca: (d) => `${Math.max(1, Math.round(d))} s por km`,
    fmtCentroValor: (v) => formatPace(v),
    // "6.30/6.00" não cabe no anel; mostra-se só o corrente, e é o arco que
    // diz quanto falta (o mesmo que A Escalada faz com os metros).
    centroCompara: false,
    sessoes,
    indeterminadas: indeterminadas.map(({ run }) => run),
    semNada: 'ainda sem corridas de 5, 10 ou 21 km com distância e tempo',
    tituloDe: 'no teu esforço mais rápido de sempre',
    linhaDue: (g) => `${formatPace(g.valor)}/km — ${g.nivel.label.toLowerCase()} d'O Passo.`,
  });
}

// ── OS AMULETOS ──────────────────────────────────────────────────────────

/* Seis badges que não medem desenvolvimento nenhum (família `amuletos`, ao
   lado da Coruja, que já cá estava). Correr às quatro horas do dia, nas
   quatro estações, no dia de anos, nos dois solstícios, dez vezes à mesma
   meia-hora, ou uma vez os 10,00 km certos: nada disto diz se o atleta está
   melhor ou pior. São coisas que se encontram, não que se perseguem.

   ── O TOM ───────────────────────────────────────────────────────────────
   Estes badges NÃO SÃO A SÉRIO, e o que o atleta lê tem de o deixar claro —
   sem piada nenhuma, que a app é sóbria. A saída é a mesma de sempre: dizer
   a verdade e parar. "Dez corridas começadas na mesma meia-hora. Isto não é
   treino nenhum, é hábito" diz as duas coisas (o que aconteceu e o peso que
   tem) sem uma única piscadela de olho.

   ── E A CAROL NÃO OS SUGERE ─────────────────────────────────────────────
   Doutrina 6 #6 (src/coach-knowledge/06-head-coach-arbitragem.md), terceira
   regra: dizer "corre no dia do teu aniversário para ganhares o badge"
   destrói exatamente aquilo que o torna agradável. É a família que a
   identifica — e é meia razão para a família existir.

   ── O QUE ENTRA ─────────────────────────────────────────────────────────
   Os amuletos leem `treinos`, como todos os badges de treino desta vitrina:
   uma prova não é treino (ver `treinosDe`, no fim do ficheiro), e não se abre
   aqui uma exceção só porque o badge é leve. Os badges de prova — que desde
   a fase A são cinco — leem `completedRaces`, e nunca as duas listas. */

/* ── O CALENDÁRIO DO SOL ─────────────────────────────────────────────────
   Duas estações do ano e dois solstícios são perguntas de astronomia, não de
   calendário — e por isso não se resolvem com um dia fixo.

   ⚠️ HEMISFÉRIO NORTE, ASSUMIDO. A app é portuguesa e todo o resto dela o é
   (a semana de segunda a domingo, o fuso de Lisboa em `segundaDe`). Abaixo
   do equador as estações são as opostas e o "dia mais longo" é o solstício
   de dezembro: um atleta no Brasil ou em Moçambique veria estes dois
   amuletos ao contrário. Fica escrito porque é uma limitação real, não um
   esquecimento — e porque o dia em que a app tiver utilizadores a sul do
   equador é este comentário que diz onde mexer.

   AS DATAS VARIAM entre 20 e 22 de junho/dezembro (e entre 19 e 21 de março),
   por causa dos anos bissextos e da precessão — em 2026 o solstício de junho
   é a 21, em 2028 é a 20. Um dia fixo estaria errado com regularidade, e
   estas regras são perguntas de SIM OU NÃO sobre um único dia: errar o dia é
   errar tudo.

   Por isso calcula-se: a longitude aparente do Sol (Meeus, *Astronomical
   Algorithms*, cap. 25, a versão de baixa precisão — erro ~0,01°, que em
   tempo dá ~15 minutos) e uma bissecção à procura do instante em que ela
   passa os 0° (equinócio de março), 90° (solstício de junho), 180°
   (equinócio de setembro) e 270° (solstício de dezembro).

   Duas aproximações assumidas, ambas irrelevantes para o que aqui se
   pergunta (o DIA, não a hora):
     · ΔT (a diferença entre o Tempo Dinâmico e o UTC, ~70 s neste século)
       não se aplica;
     · os ~15 minutos de erro do método só mudariam o dia se o evento caísse
       a menos de 15 minutos da meia-noite de Lisboa. */

/** Dia juliano ↔ milissegundos de época (JD 2440587,5 = 1970-01-01T00:00Z). */
const JD_EPOCA = 2440587.5;
const msDeJD = (jd) => (jd - JD_EPOCA) * 86400000;
const jdDeISO = (iso) => Date.parse(`${iso}T00:00:00Z`) / 86400000 + JD_EPOCA;

const GRAUS = Math.PI / 180;
const norm360 = (x) => ((x % 360) + 360) % 360;

/** A longitude aparente do Sol, em graus, para um dia juliano. */
function longitudeSolar(jd) {
  const T = (jd - 2451545.0) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * GRAUS;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M)
    + (0.019993 - 0.000101 * T) * Math.sin(2 * M)
    + 0.000289 * Math.sin(3 * M);
  const omega = (125.04 - 1934.136 * T) * GRAUS;
  return norm360(L0 + C - 0.00569 - 0.00478 * Math.sin(omega));
}

/* Os quatro eventos, com o dia aproximado à volta do qual se procura e o
   fuso de Lisboa nesse dia. A hora legal portuguesa é UTC+1 do último
   domingo de março ao último domingo de outubro (25-31 de março e 25-31 de
   outubro): o equinócio de março (19-21) cai SEMPRE antes de a hora de verão
   começar, e o de setembro e o solstício de junho caem SEMPRE dentro dela.
   Por isso o desvio é constante por evento e não precisa de regra de fuso. */
const EVENTOS_SOLARES = [
  { key: 'equinocio_marco', graus: 0, mes: 3, dia: 20, horasLisboa: 0 },
  { key: 'solsticio_junho', graus: 90, mes: 6, dia: 21, horasLisboa: 1 },
  { key: 'equinocio_setembro', graus: 180, mes: 9, dia: 22, horasLisboa: 1 },
  { key: 'solsticio_dezembro', graus: 270, mes: 12, dia: 21, horasLisboa: 0 },
];

/** A diferença angular até ao alvo, dobrada para [−180, 180) — é o que faz a
 *  bissecção funcionar na passagem dos 360° para os 0° (equinócio de março). */
const distanciaAngular = (longitude, alvo) => norm360(longitude - alvo + 180) - 180;

/** O dia, em Lisboa, do evento solar deste ano. */
function diaDoEvento(ano, evento) {
  const centro = jdDeISO(`${ano}-${String(evento.mes).padStart(2, '0')}-${String(evento.dia).padStart(2, '0')}`);
  let lo = centro - 3;
  let hi = centro + 3;
  // 50 bissecções sobre uma janela de 6 dias: a precisão do intervalo passa
  // a ser microssegundos, muito abaixo do erro do próprio método.
  for (let i = 0; i < 50; i += 1) {
    const meio = (lo + hi) / 2;
    if (distanciaAngular(longitudeSolar(meio), evento.graus) < 0) lo = meio;
    else hi = meio;
  }
  const d = new Date(msDeJD((lo + hi) / 2) + evento.horasLisboa * 3600000);
  return d.toISOString().slice(0, 10);
}

/* Os quatro dias de um ano, calculados uma vez. O cache é de módulo e nunca
   se invalida de propósito: a resposta para um ano não muda. */
const cacheSolar = new Map();
function diasSolaresDe(ano) {
  if (!cacheSolar.has(ano)) {
    const dias = {};
    for (const evento of EVENTOS_SOLARES) dias[evento.key] = diaDoEvento(ano, evento);
    cacheSolar.set(ano, dias);
  }
  return cacheSolar.get(ano);
}

/** A estação do ano (hemisfério norte) de uma data ISO. O DIA DA VIRAGEM
 *  conta para a estação NOVA: a mudança dá-se a uma hora concreta e nós só
 *  temos o dia, por isso escolhe-se uma regra e diz-se qual — o dia do
 *  equinócio de março é primavera, o do solstício de junho é verão. */
function estacaoDe(iso) {
  const dias = diasSolaresDe(Number(iso.slice(0, 4)));
  if (iso < dias.equinocio_marco) return 'inverno';
  if (iso < dias.solsticio_junho) return 'primavera';
  if (iso < dias.equinocio_setembro) return 'verao';
  if (iso < dias.solsticio_dezembro) return 'outono';
  return 'inverno';
}

// ── Amuleto 1. Volta ao relógio ──────────────────────────────────────────

/* chave     volta_ao_relogio
   regra     "Correr nas quatro faixas do dia: madrugada, manhã, tarde e
             noite."
   campo     runs.start_time
   em falta  INDETERMINADA, como na Coruja: sem hora não há faixa.
   cor       neutro (amuleto)
   família   amuletos
   níveis    não — quatro encaixes, ganha-se uma vez.

   Este badge ABSORVE o "Madrugador" que foi rejeitado por ser o espelho da
   Coruja: dois badges iguais ao contrário (um por correr cedo, outro por
   correr tarde) não são dois badges, são um a fingir. Em vez disso, um só
   com quatro encaixes — e a Coruja mantém-se por si, porque conta uma coisa
   diferente (a REPETIÇÃO do treino noturno, com níveis, não o encaixe).

   As faixas daqui NÃO são a janela da Coruja, e é de propósito: a Coruja
   começa às 21:00 (é um treino noturno a sério), a "noite" daqui começa às
   18:00 (é uma faixa do dia, como as outras três). São perguntas diferentes
   sobre o mesmo campo; alinhá-las deixaria a tarde com doze horas e a noite
   com três. */
const FAIXAS_DO_DIA = [
  { key: 'madrugada', label: 'madrugada', desde: 0, ate: 6 },
  { key: 'manha', label: 'manhã', desde: 6, ate: 12 },
  { key: 'tarde', label: 'tarde', desde: 12, ate: 18 },
  { key: 'noite', label: 'noite', desde: 18, ate: 24 },
];

const RESOLVER_HORA = 'Abre o registo da corrida e preenche a hora a que começaste — é o campo ao lado da data.';

function voltaAoRelogio({ treinos }) {
  return badgeDeEncaixes({
    key: 'volta_ao_relogio',
    name: 'Volta ao relógio',
    rule: 'Correr nas quatro faixas do dia: madrugada, manhã, tarde e noite.',
    familia: 'amuletos',
    cor: 'neutro',
    glifo: 'clock',
    campo: 'start_time',
    campoLabel: 'a hora de início',
    dependeDe: 'Precisa da hora de início no registo da corrida.',
    comoResolver: RESOLVER_HORA,
    encaixes: FAIXAS_DO_DIA,
    candidatas: treinos,
    encaixeDe: (run) => {
      const h = horaDe(run?.start_time);
      if (h == null) return null;
      return (FAIXAS_DO_DIA.find((f) => h >= f.desde && h < f.ate) || {}).key || null;
    },
    descreveEncaixe: (encaixe, run) => `${encaixe.label} · começou às ${horaMinutoDe(run.start_time)}`,
    porqueConta: (encaixe) => `A primeira corrida de ${encaixe.label}.`,
    semNada: 'ainda sem corridas com hora de início registada',
    linhaDue: () => 'Madrugada, manhã, tarde e noite: o dia inteiro corrido, a horas diferentes. Não diz nada sobre como corres — diz que correste a todas as horas.',
  });
}

// ── Amuleto 2. Quatro estações ───────────────────────────────────────────

/* chave     quatro_estacoes
   regra     "Correr em cada uma das quatro estações do ano."
   campo     runs.date
   em falta  não há falta possível: a data é obrigatória em qualquer registo.
             Por isso este badge nunca tem sessões indeterminadas — e é o
             único (com o Solstício) de que isso se pode dizer.
   cor       neutro (amuleto)
   família   amuletos
   níveis    não — quatro encaixes.

   As estações são as astronómicas, do equinócio ao solstício, calculadas no
   "CALENDÁRIO DO SOL" acima — não as do calendário comercial (1 de março,
   1 de junho). Hemisfério norte, assumido; ver o aviso lá em cima.

   Não se exige o MESMO ano: quem começou a registar em julho levaria um ano
   e meio a fechar o conjunto, e não há nada nisso que valha a pena castigar.
   O badge pergunta "já correste em cada estação?", não "já fizeste um ano
   inteiro?". */
const ESTACOES = [
  { key: 'primavera', label: 'primavera' },
  { key: 'verao', label: 'verão' },
  { key: 'outono', label: 'outono' },
  { key: 'inverno', label: 'inverno' },
];

const SEM_FALTA_DE_DATA = 'Nada a resolver: a data vem preenchida em todos os registos de corrida.';

function quatroEstacoes({ treinos }) {
  return badgeDeEncaixes({
    key: 'quatro_estacoes',
    name: 'Quatro estações',
    rule: 'Correr em cada uma das quatro estações do ano.',
    familia: 'amuletos',
    cor: 'neutro',
    glifo: 'leaf',
    campo: 'date',
    campoLabel: 'a data da corrida',
    dependeDe: 'Precisa da data da corrida — que qualquer registo já tem.',
    comoResolver: SEM_FALTA_DE_DATA,
    encaixes: ESTACOES,
    candidatas: treinos,
    encaixeDe: (run) => estacaoDe(dayOf(run.date)),
    descreveEncaixe: (encaixe) => encaixe.label,
    porqueConta: (encaixe) => `A primeira corrida da ${encaixe.label}.`,
    semNada: 'ainda sem corridas registadas',
    linhaDue: () => 'Primavera, verão, outono e inverno: uma corrida em cada estação. O ano inteiro, visto de fora.',
  });
}

// ── Amuleto 3. Solstício ─────────────────────────────────────────────────

/* chave     solsticio
   regra     "Correr no dia mais longo e no dia mais curto do ano."
   campo     runs.date
   em falta  nenhuma, como nas Quatro estações.
   cor       neutro (amuleto)
   família   amuletos
   níveis    não — dois encaixes.

   Os dois dias calculam-se (ver o "CALENDÁRIO DO SOL"): variam entre 20 e 22
   de junho e de dezembro, e um dia fixo estaria errado com regularidade.

   Hemisfério norte, assumido: a sul do equador o dia mais longo é o
   solstício de dezembro, e este badge estaria trocado.

   Também aqui não se exige o mesmo ano: os dois dias estão a seis meses um
   do outro de qualquer maneira, e exigi-lo só acrescentaria a hipótese de
   alguém falhar por meio ano. */
const SOLSTICIOS = [
  { key: 'maior', label: 'o dia mais longo' },
  { key: 'menor', label: 'o dia mais curto' },
];

/** 'maior', 'menor', ou null — para uma data ISO. */
function encaixeDoSolsticio(iso) {
  const dias = diasSolaresDe(Number(iso.slice(0, 4)));
  if (iso === dias.solsticio_junho) return 'maior';
  if (iso === dias.solsticio_dezembro) return 'menor';
  return null;
}

function solsticio({ treinos }) {
  return badgeDeEncaixes({
    key: 'solsticio',
    name: 'Solstício',
    rule: 'Correr no dia mais longo e no dia mais curto do ano.',
    familia: 'amuletos',
    cor: 'neutro',
    glifo: 'sun',
    campo: 'date',
    campoLabel: 'a data da corrida',
    dependeDe: 'Precisa da data da corrida — que qualquer registo já tem.',
    comoResolver: SEM_FALTA_DE_DATA,
    encaixes: SOLSTICIOS,
    /* As candidatas filtram-se ANTES, e é preciso que assim seja: em
       `badgeDeEncaixes` um `null` quer dizer "falta o dado" e cria uma sessão
       indeterminada. Uma corrida a 3 de maio não tem dado nenhum em falta —
       está só fora dos dois dias. Sem este filtro, o histórico inteiro
       aparecia no ecrã de detalhe como "por decidir". */
    candidatas: treinos.filter((r) => encaixeDoSolsticio(dayOf(r.date)) != null),
    encaixeDe: (run) => encaixeDoSolsticio(dayOf(run.date)),
    descreveEncaixe: (encaixe) => encaixe.label,
    porqueConta: (encaixe) => `Correste n${encaixe.key === 'maior' ? 'o dia mais longo' : 'o dia mais curto'} do ano.`,
    semNada: 'ainda sem corridas num solstício',
    linhaDue: () => 'O dia mais longo e o dia mais curto do ano, os dois corridos. Duas voltas ao Sol apanhadas nos extremos.',
  });
}

// ── Amuleto 4. Relógio suíço ─────────────────────────────────────────────

/* chave     relogio_suico
   regra     "Dez corridas começadas na mesma meia-hora."
   campo     runs.start_time
   em falta  INDETERMINADA: sem hora não há meia-hora a que pertencer.
   cor       neutro (amuleto)
   família   amuletos
   níveis    não — ganha-se uma vez.

   A meia-hora é a do relógio, não uma janela deslizante: 07:00-07:29 e
   07:30-07:59 são duas gavetas diferentes. Uma janela deslizante seria mais
   "justa" e daria muito mais badges — e é precisamente por isso que não se
   usa: o que o badge repara é numa ROTINA, e uma rotina é sair sempre à
   mesma hora, não sair sempre a menos de trinta minutos de distância.

   Dez, e não cinco: cinco acontece por acaso a quem treina de manhã antes do
   trabalho. Dez já é sinal de um hábito que se aguenta. */
const SUICO_ALVO = 10;

/** `{ h, min }` de "HH:MM[:SS]", ou null. É a leitura do `horaDe` da Coruja
 *  com os minutos que ela deita fora — aqui eles são metade da pergunta. */
function horaEMinutoDe(startTime) {
  if (typeof startTime !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(startTime.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || h < 0 || h > 23 || !Number.isFinite(min) || min > 59) return null;
  return { h, min };
}

const doisDigitos = (n) => String(n).padStart(2, '0');

/** "07:34" — a hora de início normalizada, ou null. */
function horaMinutoDe(startTime) {
  const t = horaEMinutoDe(startTime);
  return t ? `${doisDigitos(t.h)}:${doisDigitos(t.min)}` : null;
}

/** "07:30" — a meia-hora do relógio a que uma hora de início pertence. */
function meiaHoraDe(startTime) {
  const t = horaEMinutoDe(startTime);
  return t ? `${doisDigitos(t.h)}:${t.min < 30 ? '00' : '30'}` : null;
}

/** "07:00-07:29" — a gaveta, dita por extenso. */
function labelMeiaHora(chave) {
  const [h, m] = chave.split(':').map(Number);
  return `${chave}-${String(h).padStart(2, '0')}:${m === 0 ? '29' : '59'}`;
}

function relogioSuico({ treinos }) {
  const porMeiaHora = new Map();
  const indeterminadas = [];
  const comHora = [];
  for (const run of [...treinos].sort((a, b) => (dayOf(a.date) || '').localeCompare(dayOf(b.date) || ''))) {
    const chave = meiaHoraDe(run?.start_time);
    if (chave == null) { indeterminadas.push(run); continue; }
    if (!porMeiaHora.has(chave)) porMeiaHora.set(chave, []);
    porMeiaHora.get(chave).push(run);
    comHora.push({ run, chave });
  }

  /* A gaveta que lidera. Em empate fica a que chegou lá primeiro: é a que
     ganhou o badge, e a data do prémio tem de ser a mais antiga que os dados
     provam. */
  let melhor = null;
  for (const [chave, lista] of porMeiaHora) {
    const marco = lista.length >= SUICO_ALVO ? dayOf(lista[SUICO_ALVO - 1].date) : null;
    const candidato = { chave, lista, marco };
    if (!melhor) { melhor = candidato; continue; }
    if (marco && melhor.marco) { if (marco < melhor.marco) melhor = candidato; continue; }
    if (marco && !melhor.marco) { melhor = candidato; continue; }
    if (!marco && !melhor.marco && lista.length > melhor.lista.length) melhor = candidato;
  }

  const contagem = melhor ? melhor.lista.length : 0;
  const ganho = !!melhor && !!melhor.marco;
  const label = melhor ? labelMeiaHora(melhor.chave) : null;

  const sessoes = newestFirst([
    ...comHora.map(({ run, chave }) => sessaoDaCorrida(run, {
      status: chave === melhor?.chave ? 'conta' : 'falhou',
      meta: `começou às ${horaMinutoDe(run.start_time)}`,
      porque: chave === melhor?.chave
        ? `Na meia-hora das ${label}.`
        : `Noutra meia-hora — a mais repetida é a das ${label}.`,
    })),
    ...indeterminadas.map((run) => sessaoDaCorrida(run, {
      status: 'indeterminada',
      meta: run?.distance_km ? fmtKmLinha(num(run.distance_km)) : null,
      porque: 'Sem hora de início no registo.',
    })),
  ]);

  const comum = {
    key: 'relogio_suico',
    name: 'Relógio suíço',
    rule: `${SUICO_ALVO} corridas começadas na mesma meia-hora do relógio.`,
    familia: 'amuletos',
    cor: 'neutro',
    glifo: 'watch',
    campo: 'start_time',
    campoLabel: 'a hora de início',
    dependeDe: 'Precisa da hora de início no registo da corrida.',
    comoResolver: RESOLVER_HORA,
    unidade: 'count',
    value: contagem,
    sessoes,
    indeterminadas: blocoIndeterminadas(indeterminadas, { campoLabel: 'a hora de início', comoResolver: RESOLVER_HORA }),
  };

  if (ganho) {
    return {
      badge: badge({
        ...comum,
        state: 'won',
        ring: 1,
        centro: String(SUICO_ALVO),
        centroAria: `Relógio suíço: ganho, ${SUICO_ALVO} corridas começadas entre as ${label}`,
        count: 1,
        awardedOn: melhor.marco,
        linha: `${contagem} corridas começadas entre as ${label}`,
        detalhe: `a meia-hora das ${label}`,
      }),
      due: [{
        badgeKey: 'relogio_suico',
        tier: '',
        periodKey: '',
        value: SUICO_ALVO,
        valueUnit: 'count',
        raceId: null,
        awardedOn: melhor.marco,
        title: 'Relógio suíço',
        line: `${SUICO_ALVO} corridas começadas entre as ${label}. Isto não é treino nenhum — é hábito.`,
      }],
    };
  }

  return {
    badge: badge({
      ...comum,
      state: contagem > 0 ? 'progress' : 'empty',
      ring: contagem > 0 ? Math.min(contagem / SUICO_ALVO, 0.99) : 0,
      centro: contagem > 0 ? `${contagem}/${SUICO_ALVO}` : String(SUICO_ALVO),
      centroAria: contagem > 0
        ? `Relógio suíço: a caminho, ${contagem} de ${SUICO_ALVO} corridas na meia-hora das ${label}`
        : `Relógio suíço: por ganhar. ${SUICO_ALVO} corridas começadas na mesma meia-hora do relógio.`,
      linha: contagem > 0
        ? `${contagem} de ${SUICO_ALVO} na meia-hora das ${label}`
        : 'ainda sem corridas com hora de início registada',
    }),
    due: [],
  };
}

// ── Amuleto 5. Anos ──────────────────────────────────────────────────────

/* chave     anos
   regra     "Correr no dia do teu aniversário."
   campo     profiles.birth_date (com runs.date)
   em falta  SEM DATA DE NASCIMENTO NÃO HÁ CANDIDATO NENHUM — e o badge diz
             isso, em vez de ficar por ganhar sem explicação. Não é uma
             sessão indeterminada (nenhuma corrida está por decidir): é a
             pergunta que não se pode fazer. A data de nascimento já é pedida
             pelo Perfil, para as zonas de FC.
   cor       neutro (amuleto)
   família   amuletos
   níveis    não — repete-se, uma linha por ano (period_key = o ano).

   Quem nasceu a 29 de fevereiro só o encontra em ano bissexto, e não se
   inventa aqui um 28 nem um 1 de março: a data é a que é, e o dia de anos de
   quem nasceu a 29 de fevereiro é um assunto mais velho do que esta app. */
function anos({ treinos, profile }) {
  const nascimento = dayOf(profile?.birth_date);
  const comum = {
    key: 'anos',
    name: 'Anos',
    rule: 'Correr no dia do teu aniversário.',
    familia: 'amuletos',
    cor: 'neutro',
    glifo: 'cake',
    campo: 'birth_date',
    campoLabel: 'a data de nascimento',
    dependeDe: 'Precisa da tua data de nascimento no Perfil.',
    comoResolver: 'Preenche a data de nascimento no Perfil — é a mesma que dá as zonas de frequência cardíaca.',
    unidade: 'anos',
    sessoes: [],
    indeterminadas: null,
  };

  if (!nascimento) {
    return {
      badge: badge({
        ...comum,
        state: 'empty',
        ring: 0,
        centro: '—',
        centroAria: 'Anos: sem data de nascimento no Perfil não há dia a assinalar.',
        linha: 'sem data de nascimento no Perfil não há dia a assinalar — preenche-a e este passa a contar',
      }),
      due: [],
    };
  }

  const diaEMes = nascimento.slice(5);
  const anoDeNascimento = Number(nascimento.slice(0, 4));
  const ganhas = treinos
    .filter((r) => dayOf(r.date).slice(5) === diaEMes)
    .sort((a, b) => dayOf(a.date).localeCompare(dayOf(b.date)));
  const idadeEm = (iso) => Number(iso.slice(0, 4)) - anoDeNascimento;

  // Uma linha por ANO: dois treinos no mesmo aniversário são o mesmo feito.
  const porAno = new Map();
  for (const run of ganhas) porAno.set(dayOf(run.date).slice(0, 4), run);

  const sessoes = newestFirst([...porAno.values()].map((run) => sessaoDaCorrida(run, {
    status: 'conta',
    meta: `${idadeEm(dayOf(run.date))} anos`,
    porque: 'Correste no dia do teu aniversário.',
  })));

  const due = [...porAno.entries()].map(([ano, run]) => ({
    badgeKey: 'anos',
    tier: '',
    periodKey: ano,
    value: idadeEm(dayOf(run.date)),
    valueUnit: 'anos',
    raceId: null,
    awardedOn: dayOf(run.date),
    title: 'Anos',
    line: `Correste no dia em que fizeste ${idadeEm(dayOf(run.date))} anos. Não conta para nada — conta para si mesmo.`,
  }));

  if (porAno.size) {
    const ultima = [...porAno.values()].slice(-1)[0];
    const dia = dayOf(ultima.date);
    return {
      badge: badge({
        ...comum,
        state: 'won',
        ring: 1,
        centro: String(idadeEm(dia)),
        centroAria: `Anos: ganho. Correste no dia em que fizeste ${idadeEm(dia)} anos`,
        value: idadeEm(dia),
        count: porAno.size,
        awardedOn: dia,
        sessoes,
        linha: porAno.size > 1
          ? `${porAno.size} aniversários corridos · o último a ${formatDatePTShort(dia)}`
          : `corrido a ${formatDatePTShort(dia)}, no dia em que fizeste ${idadeEm(dia)} anos`,
        detalhe: `${idadeEm(dia)} anos`,
      }),
      due,
    };
  }

  return {
    badge: badge({
      ...comum,
      state: 'empty',
      ring: 0,
      centro: '—',
      centroAria: 'Anos: por ganhar. Correr no dia do teu aniversário.',
      linha: `ainda sem nenhuma corrida a ${formatDatePTShort(nascimento)} — o teu dia de anos`,
    }),
    due: [],
  };
}

// ── Amuleto 6. Número certo ──────────────────────────────────────────────

/* chave     numero_certo
   regra     "Uma corrida entre 9,99 e 10,01 km."
   campo     runs.distance_km
   em falta  INDETERMINADA: uma corrida sem distância não se pode medir.
   cor       neutro (amuleto)
   família   amuletos
   níveis    não — repete-se, uma linha por corrida.

   A janela é de vinte metros — dez para cada lado — e é estreita de
   propósito: aos 10,05 km já é uma corrida de dez quilómetros como as
   outras. O que o badge repara é no acaso do número redondo, e um acaso com
   margem larga deixa de ser acaso.

   Vinte metros também é, por acidente feliz, mais ou menos o erro de um GPS
   em dez quilómetros — o que quer dizer que este badge é, com toda a
   honestidade, metade mérito e metade satélite. */
const CERTO_ALVO_KM = 10;
const CERTO_MARGEM_KM = 0.01;

function numeroCerto({ treinos }) {
  const comDistancia = [];
  const indeterminadas = [];
  for (const run of treinos) {
    const km = num(run?.distance_km);
    if (km == null) indeterminadas.push(run);
    else comDistancia.push({ run, km, erro: Math.abs(km - CERTO_ALVO_KM) });
  }
  const certas = comDistancia
    .filter((c) => c.erro <= CERTO_MARGEM_KM)
    .sort((a, b) => dayOf(a.run.date).localeCompare(dayOf(b.run.date)));
  const maisPerto = comDistancia
    .filter((c) => c.erro > CERTO_MARGEM_KM)
    .reduce((m, c) => (!m || c.erro < m.erro ? c : m), null);

  const fmtKm3 = (km) => `${km.toFixed(2).replace('.', ',')} km`;

  const sessoes = newestFirst([
    ...certas.map(({ run, km }) => sessaoDaCorrida(run, { status: 'conta', meta: fmtKm3(km), porque: 'O número certo.' })),
    ...comDistancia.filter((c) => c.erro > CERTO_MARGEM_KM).map(({ run, km, erro }) => sessaoDaCorrida(run, {
      status: 'falhou',
      meta: fmtKm3(km),
      porque: `${fmtMetros(erro * 1000)} ao lado dos ${CERTO_ALVO_KM} km.`,
    })),
    ...indeterminadas.map((run) => sessaoDaCorrida(run, {
      status: 'indeterminada', meta: null, porque: 'Sem distância no registo.',
    })),
  ]);

  const comum = {
    key: 'numero_certo',
    name: 'Número certo',
    rule: `Uma corrida entre ${(CERTO_ALVO_KM - CERTO_MARGEM_KM).toFixed(2).replace('.', ',')} e ${(CERTO_ALVO_KM + CERTO_MARGEM_KM).toFixed(2).replace('.', ',')} km.`,
    familia: 'amuletos',
    cor: 'neutro',
    glifo: 'ruler',
    campo: 'distance_km',
    campoLabel: 'a distância',
    dependeDe: 'Precisa da distância no registo da corrida.',
    comoResolver: 'Abre o registo da corrida e preenche a distância percorrida.',
    unidade: 'km',
    sessoes,
    indeterminadas: blocoIndeterminadas(indeterminadas, {
      campoLabel: 'a distância',
      comoResolver: 'Abre o registo da corrida e preenche a distância percorrida.',
    }),
  };

  const due = certas.map(({ run, km }) => ({
    badgeKey: 'numero_certo',
    tier: '',
    periodKey: String(run.id ?? dayOf(run.date) ?? ''),
    value: round1(km * 100) / 100,
    valueUnit: 'km',
    raceId: null,
    awardedOn: dayOf(run.date),
    title: 'Número certo',
    line: `${fmtKm3(km)}. Nem mais nem menos — coisa que não se consegue de propósito.`,
  }));

  if (certas.length) {
    const ultima = certas[certas.length - 1];
    return {
      badge: badge({
        ...comum,
        state: 'won',
        ring: 1,
        centro: String(CERTO_ALVO_KM),
        centroAria: `Número certo: ganho, ${fmtKm3(ultima.km)}`,
        value: round1(ultima.km * 100) / 100,
        count: certas.length,
        awardedOn: dayOf(ultima.run.date),
        linha: certas.length > 1
          ? `${certas.length} vezes · a última a ${formatDatePTShort(dayOf(ultima.run.date))}`
          : `${fmtKm3(ultima.km)} a ${formatDatePTShort(dayOf(ultima.run.date))}`,
        detalhe: fmtKm3(ultima.km),
      }),
      due,
    };
  }

  return {
    badge: badge({
      ...comum,
      state: 'empty',
      ring: 0,
      centro: maisPerto ? `+${fmtMetrosCurto(maisPerto.erro * 1000)}` : String(CERTO_ALVO_KM),
      centroAria: maisPerto
        ? `Número certo: por ganhar. A corrida mais perto ficou a ${fmtMetros(maisPerto.erro * 1000)} dos ${CERTO_ALVO_KM} km`
        : `Número certo: por ganhar. ${comum.rule}`,
      linha: maisPerto
        ? `a mais perto: ${fmtKm3(maisPerto.km)}, a ${fmtMetros(maisPerto.erro * 1000)} do número certo`
        : 'ainda sem corridas com distância registada',
    }),
    due: [],
  };
}

// ── Tudo junto ───────────────────────────────────────────────────────────

/* As corridas que os badges de treino olham: as que não são prova. Uma
   competição não é treino — e um badge de treino âmbar seria a lei da cor a
   partir-se por dentro. (A prova tem os seus prémios: o Palmarés inteiro e o
   `recorde_pessoal` aqui ao lado.) */
function treinosDe(runs) {
  return (runs || []).filter((r) => r && dayOf(r.date) && r.kind !== 'competicao' && !r.race_id);
}

/**
 * Todos os badges, sempre pela mesma ordem, mais a lista `due` do que os
 * dados provam estar ganho (para utils/badgeAwards.js gravar).
 *
 * @param {object} p
 * @param {Array}  p.runs            corridas do atleta
 * @param {Array}  p.raceEvents      provas da agenda
 * @param {object} p.profile         perfil (a régua do resultado da prova)
 * @param {Array}  p.planItems       coach_plan_items (o plano da Carol)
 * @param {Array}  p.gymSessions     workout_sessions
 * @param {string} p.today           ISO YYYY-MM-DD, obrigatório
 * @returns {{ badges: object[], due: object[] }}
 */
export function computeBadges({
  runs = [], raceEvents = [], profile = {}, planItems = [], gymSessions = [], today,
} = {}) {
  const hoje = requireToday(today, 'computeBadges');
  const treinos = treinosDe(runs).filter((r) => dayOf(r.date) <= hoje);
  const completed = completedRaces({ raceEvents, runs, profile: profile || {}, today: hoje }).reverse();
  const semanas = semanasAvaliadas({ planItems, runs, gym: gymSessions, today: hoje });

  const ctx = { runs, treinos, raceEvents, completed, semanas, profile: profile || {}, today: hoje };
  const partes = {
    z2_mestre: z2Mestre(ctx),
    negative_split: negativeSplit(ctx),
    cadencia_corrigida: cadenciaCorrigida(ctx),
    melhor_passo: melhorPasso(ctx),
    cabra_montesa: cabraMontesa(ctx),
    medida_da_prova: medidaDaProva(ctx),
    distancias: distancias(ctx),
    terreno: terreno(ctx),
    niveis: niveis(ctx),
    superacao: superacao(ctx),
    recorde_pessoal: recordePessoal(ctx),
    semana_100: semana100(ctx),
    descanso_cumprido: descansoCumprido(ctx),
    sequencia: sequencia(ctx),
    quilometros: quilometros(ctx),
    escalada: escalada(ctx),
    coruja: coruja(ctx),
    volta_ao_relogio: voltaAoRelogio(ctx),
    relogio_suico: relogioSuico(ctx),
    quatro_estacoes: quatroEstacoes(ctx),
    solsticio: solsticio(ctx),
    anos: anos(ctx),
    numero_certo: numeroCerto(ctx),
  };

  const badges = BADGE_KEYS.map((key) => partes[key].badge);
  const vistos = new Set();
  const due = [];
  for (const key of BADGE_KEYS) {
    for (const entrada of partes[key].due) {
      const id = `${entrada.badgeKey}|${entrada.tier}|${entrada.periodKey}`;
      if (vistos.has(id)) continue;
      vistos.add(id);
      due.push(entrada);
    }
  }

  return { badges, due };
}

/**
 * Os badges que ESTA prova deu — o que o estúdio do mural pode mostrar
 * (fase 4 da reforma da gamificação).
 *
 * A pergunta é a mesma que `achievementsForRace` faz às conquistas, feita à
 * lista `due`: quais os prémios cujo `raceId` é o desta prova. Não há régua
 * nova nenhuma aqui — o motor é o de sempre, e um badge só entra no mural
 * de uma prova se foi ESSA prova a dá-lo.
 *
 * Desde a fase A são cinco: o `recorde_pessoal` e os quatro que vieram d'O
 * Palmarés — `distancias` (a primeira vez naquela distância), `terreno` (a
 * 1.ª ou a 5.ª naquele terreno), `niveis` (a prova que subiu o VDOT) e
 * `superacao` (o objetivo batido). Todos trazem o `raceId` da prova que os
 * deu, que é o que este filtro pergunta. A `sequencia` também o traz, na
 * prova que confirmou o recorde da série.
 *
 * O "À medida da prova" NÃO entra, apesar de ter uma prova no nome: mede
 * saídas de TREINO contra a prova principal que ainda está por correr
 * (`provaAlvo` exclui as concluídas), e os seus prémios trazem
 * `raceId: null`. Pô-lo no mural de uma prova concluída era mostrar, no
 * mural da prova A, um badge ganho a preparar a prova B.
 *
 * Devolve o badge calculado, mais o título e a frase DAQUELE prémio — o
 * badge diz "3 recordes", o prémio diz qual foi o desta prova.
 *
 * @returns {object[]}
 */
export function badgesForRace(params, raceId) {
  if (!raceId) return [];
  const { badges, due } = computeBadges(params);
  const byKey = new Map(badges.map((b) => [b.key, b]));
  const vistos = new Set();
  const lista = [];
  for (const entrada of due) {
    if (!entrada.raceId || entrada.raceId !== raceId) continue;
    if (vistos.has(entrada.badgeKey)) continue;
    vistos.add(entrada.badgeKey);
    const badge = byKey.get(entrada.badgeKey);
    if (badge) lista.push({ ...badge, awardTitle: entrada.title, awardLine: entrada.line });
  }
  return lista;
}
