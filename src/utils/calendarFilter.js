/* O filtro da agenda (Calendário) — pedido 2026-09-27: ver só um tipo de
   registo e, nas provas, só as por realizar ou só as concluídas.

   Puro, para a grelha do mês e a lista do dia filtrarem pela mesma régua:
   um dia só se acende (a cor da prova, os tracinhos dos registos) com o que
   o filtro deixa ver, e a lista do dia mostra exatamente isso.

   "Por realizar" é o estado da prova, não a data: tudo o que ainda não está
   concluído (status 'agendada'), incluindo uma prova que já passou e ficou
   por registar — é o que o atleta ainda tem de fechar. */

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

export const RACE_STATUS_ALL = 'todas';

export const RACE_STATUS_FILTERS = [
  { key: RACE_STATUS_ALL, label: 'Todas' },
  { key: 'por_realizar', label: 'Por realizar' },
  { key: 'concluida', label: 'Concluídas' },
];

export const CALENDAR_FILTER_ALL = Object.freeze({ type: CALENDAR_ALL, raceStatus: RACE_STATUS_ALL });

const TYPE_KEYS = new Set(CALENDAR_RECORD_TYPES.map((t) => t.key));
const STATUS_KEYS = new Set(RACE_STATUS_FILTERS.map((s) => s.key));

/* O estado das provas só vale com o tipo "Prova": fora dele fica em
   "Todas", para nunca esconder provas às escondidas numa vista "Tudo". */
export function normalizeCalendarFilter(filter) {
  const type = TYPE_KEYS.has(filter?.type) ? filter.type : CALENDAR_ALL;
  const raceStatus = type === 'prova' && STATUS_KEYS.has(filter?.raceStatus)
    ? filter.raceStatus
    : RACE_STATUS_ALL;
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

const ACTIVE_LABELS = {
  corrida: 'Corridas',
  ginasio: 'Ginásio',
  nutricao: 'Nutrição',
  corpo: 'Corpo',
};

const RACE_LABELS = {
  [RACE_STATUS_ALL]: 'Provas',
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
  [RACE_STATUS_ALL]: 'Sem provas neste dia',
  por_realizar: 'Sem provas por realizar neste dia',
  concluida: 'Sem provas concluídas neste dia',
};

/** O dia vazio diz o que falta à luz do filtro — "Sem registos" com um
 *  filtro ligado fazia crer que o dia estava mesmo vazio. */
export function emptyDayMessage(filter) {
  const { type, raceStatus } = normalizeCalendarFilter(filter);
  if (type === CALENDAR_ALL) return 'Sem registos neste dia';
  if (type === 'prova') return EMPTY_RACES[raceStatus];
  return EMPTY_BY_TYPE[type];
}
