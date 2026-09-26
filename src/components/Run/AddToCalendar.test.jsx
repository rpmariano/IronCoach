import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import AddToCalendar from './AddToCalendar';
import { googleCalendarUrl, outlookCalendarUrl } from '../../utils/calendarLinks';
import { raceCalendarEvent } from '@formulas/raceCalendar.ts';

const mocks = vi.hoisted(() => ({ calls: [], result: null }));
vi.mock('../../lib/supabase', () => ({
  supabase: {},
  invokeEdgeFunctionWithTimeout: (fn, opts) => {
    mocks.calls.push({ fn, body: opts?.body });
    return Promise.resolve(mocks.result);
  },
}));

const RACE = {
  id: 'r1',
  name: 'Meia Maratona de Lisboa',
  date: '2026-10-11',
  start_time: '09:00:00',
  location: 'Ponte 25 de Abril',
  race_type: 'estrada',
  distance_km: 21.0975,
  target_time_seconds: 6300,
};

describe('calendarLinks', () => {
  it('Google: hora de relógio sem fuso nas datas, fuso à parte, e os campos do evento', () => {
    const url = new URL(googleCalendarUrl(raceCalendarEvent(RACE)));
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('Meia Maratona de Lisboa');
    expect(url.searchParams.get('dates')).toBe('20261011T090000/20261011T104500');
    expect(url.searchParams.get('location')).toBe('Ponte 25 de Abril');
    expect(url.searchParams.get('ctz')).toBeTruthy();
  });

  it('Google: prova sem hora é dia inteiro, sem ctz', () => {
    const url = new URL(googleCalendarUrl(raceCalendarEvent({ ...RACE, start_time: null })));
    expect(url.searchParams.get('dates')).toBe('20261011/20261012');
    expect(url.searchParams.get('ctz')).toBeNull();
  });

  it('Outlook: pessoal e trabalho mudam só o domínio; início e fim com o desvio do fuso', () => {
    const ev = raceCalendarEvent(RACE);
    const personal = new URL(outlookCalendarUrl(ev));
    const work = new URL(outlookCalendarUrl(ev, 'work'));
    expect(personal.host).toBe('outlook.live.com');
    expect(work.host).toBe('outlook.office.com');
    expect(personal.searchParams.get('subject')).toBe('Meia Maratona de Lisboa');
    expect(personal.searchParams.get('startdt')).toMatch(/^2026-10-11T09:00:00[+-]\d{2}:\d{2}$/);
    expect(personal.searchParams.get('enddt')).toMatch(/^2026-10-11T10:45:00[+-]\d{2}:\d{2}$/);
    expect(personal.searchParams.get('allday')).toBe('false');
  });

  it('Outlook: dia inteiro vai de um dia ao seguinte', () => {
    const url = new URL(outlookCalendarUrl(raceCalendarEvent({ ...RACE, start_time: '' })));
    expect(url.searchParams.get('startdt')).toBe('2026-10-11');
    expect(url.searchParams.get('enddt')).toBe('2026-10-12');
    expect(url.searchParams.get('allday')).toBe('true');
  });
});

describe('AddToCalendar', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    mocks.calls = [];
    mocks.result = { data: { url: 'https://x.supabase.co/functions/v1/race-calendar?id=r1&exp=1&sig=ab' }, error: null };
    delete window.location;
    window.location = { href: 'http://localhost/' };
  });
  afterEach(() => {
    window.location = originalLocation;
  });

  it('sem id de prova gravada não aparece', () => {
    render(<AddToCalendar race={RACE} />);
    expect(screen.queryByTestId('race-hub-add-calendar')).toBeNull();
  });

  it('abre a persiana com os quatro destinos; Google e Outlook são links para fora', () => {
    render(<AddToCalendar race={RACE} raceEventId="r1" />);
    fireEvent.click(screen.getByTestId('race-hub-add-calendar'));
    const google = screen.getByTestId('race-calendar-google');
    expect(google.getAttribute('href')).toContain('calendar.google.com');
    expect(google.getAttribute('target')).toBe('_blank');
    expect(screen.getByTestId('race-calendar-outlook').getAttribute('href')).toContain('outlook.live.com');
    expect(screen.getByTestId('race-calendar-outlook-work').getAttribute('href')).toContain('outlook.office.com');
    expect(screen.getByTestId('race-calendar-ics')).toBeTruthy();
  });

  it('.ics: pede o link assinado à função e navega para ele', async () => {
    render(<AddToCalendar race={RACE} raceEventId="r1" />);
    fireEvent.click(screen.getByTestId('race-hub-add-calendar'));
    fireEvent.click(screen.getByTestId('race-calendar-ics'));
    await waitFor(() => expect(window.location.href).toContain('race-calendar?id=r1'));
    expect(mocks.calls).toEqual([{ fn: 'race-calendar', body: { race_event_id: 'r1' } }]);
  });

  it('.ics: se a função falhar, fica onde está', async () => {
    mocks.result = { data: null, error: 'falhou' };
    render(<AddToCalendar race={RACE} raceEventId="r1" />);
    fireEvent.click(screen.getByTestId('race-hub-add-calendar'));
    fireEvent.click(screen.getByTestId('race-calendar-ics'));
    await waitFor(() => expect(mocks.calls.length).toBe(1));
    await waitFor(() => expect(screen.getByTestId('race-calendar-ics').getAttribute('aria-busy')).toBe('false'));
    expect(window.location.href).toBe('http://localhost/');
  });
});
