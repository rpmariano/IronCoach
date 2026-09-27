/* O filtro da agenda (Calendário) — pedido 2026-09-27: ver só um tipo de
   registo e, nas provas, só as por realizar ou só as concluídas.

   Puro, para a grelha do mês e a lista do dia filtrarem pela mesma régua:
   um dia só se acende (a cor da prova, os tracinhos dos registos) com o que
   o filtro deixa ver, e a lista do dia mostra exatamente isso.

   "Por realizar" é o estado da prova, não a data: tudo o que ainda não está
   concluído (status 'agendada'), incluindo uma prova que já passou e ficou
   por registar — é o que o atleta ainda tem de fechar.

   Na "Prova" há só os dois estados, sem "Todas" (pedido 2026-09-27), e a
   agenda deixa de mostrar o dia escolhido: lista todas as provas desse
   estado, 5 de cada vez (listRacesByStatus, pageOf). */

export const CALENDAR_ALL = 'todos';

/* A ordem é a da legenda, que o filtro substitui: cada botão é também a
   legenda da cor dos tracinhos na grelha. */
export const CALENDAR_RECORD_TYPES = [
  { key: 'prova', label: 'Prova', tone: 'race', color: 'var(--mod-prova)' },
  { key: 'corrida', label: 'Corrida', tone: 'run', color: 'var(--mod-corrida)' },
  { key: 'ginasio', label: 'Ginásio', tone: 'gym', color: 'var(--mod-ginasio)' },
  { key: 'nutricao', label: 'Nutrição', tone: 'nutrition', color: 'var(--mod-nutricao)' },
  { key: 'corpo', label: 'Corpo', tone: 'body', color: 'var(--mod-corpo)' },
];

// Só fora da "Prova": o estado não se aplica e todas as provas passam.
export const RACE_STATUS_ALL = 'todas';

export const RACE_STATUS_FILTERS = [
  { key: 'por_realizar', label: 'Por realizar' },
  { key: 'concluida', label: 'Concluídas' },
];

// Escolher "Prova" abre nas por realizar — é o que está pela frente.
export const RACE_STATUS_DEFAULT = 'por_realizar';

export const RACE_LIST_PAGE_SIZE = 5;

export const CALENDAR_FILTER_ALL = Object.freeze({ type: CALENDAR_ALL, raceStatus: RACE_STATUS_ALL });

const TYPE_KEYS = new Set(CALENDAR_RECORD_TYPES.map((t) => t.key));
const STATUS_KEYS = new Set(RACE_STATUS_FILTERS.map((s) => s.key));

/* O estado das provas só vale com o tipo "Prova" — e aí é sempre um dos
   dois; fora dele fica em "todas", para nunca esconder provas às
   escondidas numa vista "Tudo". */
export function normalizeCalendarFilter(filter) {
  const type = TYPE_KEYS.has(filter?.type) ? filter.type : CALENDAR_ALL;
  if (type !== 'prova') return { type, raceStatus: RACE_STATUS_ALL };
  const raceStatus = STATUS_KEYS.has(filter?.raceStatus) ? filter.raceStatus : RACE_STATUS_DEFAULT;
  return { type, raceStatus };
}

export function isCalendarFilterActive(filter) {
  return normalizeCalendarFilter(filter).type !== CALENDAR_ALL;
}

export function raceMatchesStatus(race, raceStatus) {
  if (raceStatus === 'concluida') return race?.status === 'concluida';
  if (raceStatus === 'por_realizar') return race?.status !== 'concluida';
  return true;
}

export function filterCalendarRecords(
  { runs = [], raceEvents = [], gymSessions = [], meals = [], bodyAssessments = [] } = {},
  filter,
) {
  const { type, raceStatus } = normalizeCalendarFilter(filter);
  const shows = (key) => type === CALENDAR_ALL || type === key;
  return {
    runs: shows('corrida') ? (runs || []) : [],
    raceEvents: shows('prova') ? (raceEvents || []).filter((race) => raceMatchesStatus(race, raceStatus)) : [],
    gymSessions: shows('ginasio') ? (gymSessions || []) : [],
    meals: shows('nutricao') ? (meals || []) : [],
    bodyAssessments: shows('corpo') ? (bodyAssessments || []) : [],
  };
}

function dayOf(race) {
  const d = typeof race?.date === 'string' ? race.date.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

/* Todas as provas de um estado, pela ordem em que interessam: as por
   realizar da mais próxima para a mais distante (uma que já passou e ficou
   por registar vem primeiro, é a mais atrasada), as concluídas da mais
   recente para a mais antiga. Sem data válida não entram — não há onde as
   pôr na lista nem na grelha. */
export function listRacesByStatus(raceEvents = [], raceStatus = RACE_STATUS_DEFAULT) {
  const asc = raceStatus !== 'concluida';
  return (raceEvents || [])
    .filter((race) => dayOf(race) && raceMatchesStatus(race, raceStatus))
    .sort((a, b) => (asc ? dayOf(a).localeCompare(dayOf(b)) : dayOf(b).localeCompare(dayOf(a))));
}

/** Uma página da lista: `page` começa em 0 e fica sempre dentro dos
 *  limites (uma prova apagada na última página não a deixa vazia). */
export function pageOf(items = [], page = 0, size = RACE_LIST_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil((items || []).length / size));
  const current = Math.min(Math.max(0, Number.isInteger(page) ? page : 0), pages - 1);
  return { items: (items || []).slice(current * size, current * size + size), page: current, pages, total: (items || []).length };
}

const ACTIVE_LABELS = {
  corrida: 'Corridas',
  ginasio: 'Ginásio',
  nutricao: 'Nutrição',
  corpo: 'Corpo',
};

const RACE_LABELS = {
  por_realizar: 'Provas por realizar',
  concluida: 'Provas concluídas',
};

/** O nome do filtro ativo ("Provas por realizar"), ou null sem filtro. */
export function calendarFilterLabel(filter) {
  const { type, raceStatus } = normalizeCalendarFilter(filter);
  if (type === CALENDAR_ALL) return null;
  if (type === 'prova') return RACE_LABELS[raceStatus];
  return ACTIVE_LABELS[type];
}

const EMPTY_BY_TYPE = {
  corrida: 'Sem corridas neste dia',
  ginasio: 'Sem treinos de ginásio neste dia',
  nutricao: 'Sem refeições neste dia',
  corpo: 'Sem avaliações neste dia',
};

const EMPTY_RACES = {
  por_realizar: 'Sem provas por realizar',
  concluida: 'Ainda sem provas concluídas',
};

/** O vazio diz o que falta à luz do filtro — "Sem registos" com um filtro
 *  ligado fazia crer que o dia estava mesmo vazio. Na "Prova" a lista é de
 *  todas as provas desse estado, não de um dia. */
export function emptyDayMessage(filter) {
  const { type, raceStatus } = normalizeCalendarFilter(filter);
  if (type === CALENDAR_ALL) return 'Sem registos neste dia';
  if (type === 'prova') return EMPTY_RACES[raceStatus];
  return EMPTY_BY_TYPE[type];
}
