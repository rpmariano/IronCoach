/* Os badges de TREINO — a segunda vitrina, ao lado d'O Palmarés
   (reforma da gamificação, fase 2).

   O Palmarés (utils/medalhoes.js) conta a vida de PROVA: distâncias, níveis,
   terreno, sequência, objetivos batidos. Isto conta a vida dos dias entre as
   provas — o que se faz de segunda a domingo e que, até aqui, não dava
   prémio nenhum: a semana cumprida, o descanso respeitado, o treino inteiro
   em Z2, a subida que se acumula.

   Este ficheiro é uma TERCEIRA VISTA do motor dos prémios (utils/premios.js),
   ao lado do Palmarés e das conquistas de cada prova. As regras da casa são
   as mesmas e não se reabrem aqui:

   1. **O relógio entra sempre** — `today` (ISO `YYYY-MM-DD`) é obrigatório
      (`requireToday`); nada aqui chama `new Date()`.
   2. **Uma prova com data no futuro não conta** — quem precisa de provas
      pergunta a `completedRaces`, que já filtra.

   ── A LEI DA COR ────────────────────────────────────────────────────────
   Uma cor, um significado, como no resto da app:
     `run`  (ciano --run)  o treino de corrida em si;
     `ok`   (verde --ok)   a disciplina: fazer o que estava combinado;
     `race` (âmbar --race) SÓ o que nasce de uma prova.
   Nenhum badge de treino é âmbar. O único âmbar desta lista é o
   `recorde_pessoal`, e é âmbar precisamente porque só uma prova o dá.

   NÃO HÁ COR DO TERRENO, e é de propósito. A subida é corrida — trail é
   corrida — por isso a Cabra-montesa e A Escalada são `run` como as outras.
   Houve uma versão desta lista que lhes deu `--gym` "a cor do terreno":
   estava errada. O --gym é o módulo ginásio e mais nada, e a primeira linha
   de tokens/colors.css é justamente "nunca reutilizar uma cor para outro
   fim". Inventar um significado novo para uma cor que já tem dono é como se
   desfaz uma linguagem visual.

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
  addDays,
  bateuRecordePessoal,
  completedRaces,
  dayOf,
  fmtKmLinha,
  newestFirst,
  plural,
  requireToday,
  runKindLabel,
} from './premios';
import { formatDuration, raceDistanceLabel } from './run';
import { formatDatePTShort } from './racePlanEngine';
import { evaluatePrescriptions, executionBase } from '@formulas/prescriptionAdherence.ts';

/** A ordem da grelha da Vitrina: o treino, o terreno, a disciplina, a prova.
 *  Quatro colunas — duas linhas cheias e a prova sozinha na terceira, que é
 *  o lugar que lhe assenta: o `recorde_pessoal` é o único que não nasce de
 *  um dia de treino, e é o único âmbar. A Cadência corrigida entra ao lado
 *  do Negative split, com quem partilha o assunto — como se corre, não
 *  quanto se corre. */
export const BADGE_KEYS = [
  'z2_mestre',
  'negative_split',
  'cadencia_corrigida',
  'coruja',
  'cabra_montesa',
  'escalada',
  'semana_100',
  'descanso_cumprido',
  'recorde_pessoal',
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
   `kind` decide o que se abre ao tocar (igual ao MedalhaoContribSheet):
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
  key, name, rule, cor, glifo, campo, campoLabel, dependeDe, comoResolver,
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
    key, name, rule, cor, glifo, campo, campoLabel, dependeDe, comoResolver,
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
  key, name, rule, cor, glifo, campo, campoLabel, dependeDe, comoResolver, unidade,
  limiares, passos, fmtValor, fmtCentroValor, sessoes, indeterminadas, semNada, tituloDe, linhaDue,
  // "3/5" só cabe no anel quando os dois números são curtos: numa contagem
  // de treinos cabe, em metros acumulados ("9,8k/10k") não. Aí mostra-se só
  // o corrente, e é o arco que diz quanto falta.
  centroCompara = true,
}) {
  // `passos`: [{ valor, date, ... }] do mais antigo para o mais recente, já
  // com o acumulado em `valor`.
  const totalAtual = passos.length ? passos[passos.length - 1].valor : 0;
  const ganhos = [];
  for (let i = 0; i < NIVEIS.length; i += 1) {
    const passo = passos.find((p) => p.valor >= limiares[i]);
    if (passo) ganhos.push({ nivel: NIVEIS[i], awardedOn: passo.date, valor: passo.valor });
  }
  const atingido = ganhos.length ? ganhos[ganhos.length - 1] : null;
  const seguinteIdx = ganhos.length;
  const seguinte = seguinteIdx < NIVEIS.length
    ? { nivel: NIVEIS[seguinteIdx], limiar: limiares[seguinteIdx] }
    : null;

  const due = ganhos.map((g) => ({
    badgeKey: key,
    tier: g.nivel.key,
    periodKey: '',
    value: Math.round(g.valor),
    valueUnit: unidade,
    raceId: null,
    awardedOn: g.awardedOn,
    title: `${name} · ${g.nivel.label}`,
    line: linhaDue(g),
  }));

  const comum = {
    key, name, rule, cor, glifo, campo, campoLabel, dependeDe, comoResolver, unidade,
    niveis: NIVEIS.map((n, i) => ({ ...n, limiar: limiares[i], ganho: i < ganhos.length })),
    sessoes,
    indeterminadas: blocoIndeterminadas(indeterminadas, { campoLabel, comoResolver }),
    value: Math.round(totalAtual),
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
          ? `${atingido.nivel.label} · faltam ${fmtValor(seguinte.limiar - totalAtual)} para ${seguinte.nivel.label.toLowerCase()}`
          : `${atingido.nivel.label} — o degrau mais alto`,
        detalhe: `${fmtValor(totalAtual)} ${tituloDe}`,
      }),
      due,
    };
  }

  const alvo = limiares[0];
  const emCurso = totalAtual > 0;
  return {
    badge: badge({
      ...comum,
      state: emCurso ? 'progress' : 'empty',
      ring: emCurso ? Math.min(totalAtual / alvo, 0.99) : 0,
      centro: emCurso && centroCompara
        ? `${fmtCentroValor(totalAtual)}/${fmtCentroValor(alvo)}`
        : fmtCentroValor(emCurso ? totalAtual : alvo),
      centroAria: emCurso
        ? `${name}: a caminho, ${fmtValor(totalAtual)} de ${fmtValor(alvo)} para bronze`
        : `${name}: por ganhar. ${rule}`,
      linha: emCurso ? `faltam ${fmtValor(alvo - totalAtual)} para bronze` : semNada,
      detalhe: emCurso ? `${fmtValor(totalAtual)} ${tituloDe}` : null,
    }),
    due: [],
  };
}

// ── 4. Coruja ────────────────────────────────────────────────────────────

/* chave     coruja
   regra     "Treinos começados às 21:00 ou mais tarde, ou antes das 6:00:
             5 (bronze), 15 (prata), 30 (ouro)."
   campo     runs.start_time (a hora de início, opcional desde a migração
             20260912212930_start_times.sql)
   em falta  INDETERMINADO: um treino sem hora pode ter sido às 7 da manhã ou
             às 11 da noite. Não conta — e a contagem das que ficaram assim
             aparece no detalhe, porque é aí que está o badge que falta.
   cor       --run
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
    cor: 'run',
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

// ── 5. A Escalada ────────────────────────────────────────────────────────

/* chave     escalada
   regra     "Metros de subida acumulados em treino: 10 000 (bronze),
             25 000 (prata), 50 000 (ouro)."
   campo     runs.details.elevation_gain_m
   em falta  a corrida NÃO SOMA — não conta a favor (não se inventa D+) nem
             contra (não apaga nada). O detalhe diz quantas ficaram de fora,
             porque um total que parece baixo é quase sempre isso.
   cor       --run (a subida é corrida, não ginásio)
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

// ── 8. Cadência corrigida ────────────────────────────────────────────────

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

// ── 9. Recorde pessoal ───────────────────────────────────────────────────

/* chave     recorde_pessoal
   regra     "Uma prova cujo tempo oficial é o teu melhor de sempre naquela
             distância."
   campo     race_events + a corrida ligada (findRaceRun) + o tempo oficial;
             o veredicto é o de utils/raceOutcome.js, pelo predicado
             `bateuRecordePessoal` do motor — não se compara tempos aqui.
   em falta  prova concluída sem tempo oficial: INDETERMINADA. É o caso mais
             comum de todos (a prova fechou-se à mão e o diploma nunca foi
             lido), e é exatamente o que o detalhe tem de dizer.
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

  const linhaDaProva = ({ race, outcome }) => [
    raceDistanceLabel(Number(race.distance_km) || null),
    outcome?.officialSeconds ? formatDuration(outcome.officialSeconds) : null,
  ].filter(Boolean).join(' · ');

  const sessaoDaProva = ({ race, outcome }, { status, porque }) => ({
    kind: 'race',
    id: race.id ?? null,
    raceId: race.id ?? null,
    runId: outcome?.runId ?? null,
    date: dayOf(race.date),
    title: race.name || 'Prova sem nome',
    meta: linhaDaProva({ race, outcome }),
    status,
    porque,
  });

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
    coruja: coruja(ctx),
    cabra_montesa: cabraMontesa(ctx),
    escalada: escalada(ctx),
    semana_100: semana100(ctx),
    descanso_cumprido: descansoCumprido(ctx),
    recorde_pessoal: recordePessoal(ctx),
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
