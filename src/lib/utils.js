import { format } from 'date-fns';

export function todayISO() {
  return format(new Date(), 'yyyy-MM-dd');
}

// Ponto de "sem registo" nos calendários históricos — tom único partilhado
// pelos 4 módulos (Nutrição, Ginásio, Corrida, Corpo), sem legenda própria.
export const CALENDAR_NO_DATA_DOT = 'bg-slate-300';
