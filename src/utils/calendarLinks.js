import { format } from 'date-fns';
import { basicDate, basicDateTimeRange } from '@formulas/raceCalendar.ts';

/* Links "adicionar evento" do Google Calendar e do Outlook para o evento da
   prova (raceCalendarEvent em @formulas/raceCalendar.ts). O .ics para o
   Apple Calendar e o resto vem da Edge Function race-calendar — ver o
   cabeçalho dela para o porquê de não ser gerado aqui.

   A hora de partida é hora de relógio. O Google aceita-a sem fuso mais o
   fuso à parte (ctz); o Outlook quer um instante, por isso leva o desvio
   do fuso deste dispositivo (+01:00). */

function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

export function googleCalendarUrl(ev) {
  const params = new URLSearchParams({ action: 'TEMPLATE', text: ev.title });
  const range = basicDateTimeRange(ev);
  params.set('dates', range ? `${range.start}/${range.end}` : `${basicDate(ev.date)}/${basicDate(ev.date, 1)}`);
  if (range) {
    const tz = deviceTimeZone();
    if (tz) params.set('ctz', tz);
  }
  params.set('details', ev.description);
  if (ev.location) params.set('location', ev.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function localIsoWithOffset(date, time, plusMinutes = 0) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return format(new Date(y, m - 1, d, hh, mm + plusMinutes), "yyyy-MM-dd'T'HH:mm:ssxxx");
}

function isoDate(basic) {
  return `${basic.slice(0, 4)}-${basic.slice(4, 6)}-${basic.slice(6, 8)}`;
}

/** account: 'personal' (outlook.live.com — Hotmail/Outlook.com) ou 'work'
 *  (outlook.office.com — Microsoft 365 de trabalho ou escola). */
export function outlookCalendarUrl(ev, account = 'personal') {
  const host = account === 'work' ? 'outlook.office.com' : 'outlook.live.com';
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: ev.title,
  });
  if (ev.startTime) {
    params.set('startdt', localIsoWithOffset(ev.date, ev.startTime));
    params.set('enddt', localIsoWithOffset(ev.date, ev.startTime, ev.durationMinutes));
    params.set('allday', 'false');
  } else {
    params.set('startdt', ev.date);
    params.set('enddt', isoDate(basicDate(ev.date, 1)));
    params.set('allday', 'true');
  }
  params.set('body', ev.description);
  if (ev.location) params.set('location', ev.location);
  return `https://${host}/calendar/0/deeplink/compose?${params.toString()}`;
}
