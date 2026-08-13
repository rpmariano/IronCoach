import { format } from 'date-fns';

export function todayISO() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* Data do calendário em Portugal, não em UTC. A Edge Function dos lembretes
   decide a janela horária pela hora de Lisboa, por isso o dia a que um
   "silenciar hoje" se refere tem de ser o mesmo dia de Lisboa — em horário de
   verão, entre 00:00 e 01:00, a data UTC ainda é a de ontem, e um
   silenciamento pedido às 23:00 caducava à 01:00 em vez de ao fim da janela. */
export function lisbonTodayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
}

// Ponto de "sem registo" nos calendários históricos — tom único partilhado
// pelos 4 módulos (Nutrição, Ginásio, Corrida, Corpo), sem legenda própria.
export const CALENDAR_NO_DATA_DOT = 'bg-slate-300';

/* URL de um ficheiro da pasta public/. O Vite prefixa o base nos caminhos
   absolutos do index.html, mas não nos que estão dentro do JSX — por isso
   "/logo.png" dá 404 quando a app vive num subcaminho, como no GitHub Pages
   (/ironhealth/). Usar sempre isto para assets de public/. */
export function publicUrl(file) {
  return `${import.meta.env.BASE_URL}${String(file).replace(/^\//, '')}`;
}
