import { format } from 'date-fns';

export function todayISO() {
  return format(new Date(), 'yyyy-MM-dd');
}
