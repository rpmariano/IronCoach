import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import { ToastProvider } from '../shared/ToastProvider';
import RunAgenda from './RunAgenda';
import { todayISO, addDaysISO } from '../../lib/utils';
import { COURSE_BUILD_ERRORS, COURSE_COLUMN_MISSING_TEXT } from '../../utils/courseProfileUpload';

/* O percurso da prova a partir de um GPX (dev-back 1830a73c): carregar, gravar, remover e sugerir
   a distância — no Hub e nos Detalhes da prova. */

vi.mock('react-chartjs-2', () => ({ Line: () => <div data-testid="c-line" /> }));

const mocks = vi.hoisted(() => ({ updates: [], updateError: null }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => ({
      update: (patch) => {
        const q = {
          eq: () => q,
          select: () => q,
          maybeSingle: () => {
            mocks.updates.push({ table, patch });
            return Promise.resolve(mocks.updateError ? { data: null, error: mocks.updateError } : { data: { id: 'race-1' }, error: null });
          },
          then: (res, rej) => { mocks.updates.push({ table, patch }); return Promise.resolve({ error: null }).then(res, rej); },
        };
        return q;
      },
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
  },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const RACE = {
  id: 'race-1', date: addDaysISO(todayISO(), 30), location: 'Lisboa', name: 'Corrida do Tejo',
  race_type: 'estrada', distance_km: 10, elevation_gain_m: null, experience_level: 'medio', race_priority: 'a',
  target_time: '55:00', target_time_seconds: 3300, target_pace_seconds_per_km: 330,
  website: null, web_info: null, notes: null, course_profile: null,
};

// Um GPX sintético: `km` para norte, com uma subida e uma descida.
function gpxFile(km = 2.4, name = 'percurso.gpx') {
  const n = Math.round(km * 100);
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const lat = 38.7 + (i / 100) * 0.009;
    const ele = 20 + 40 * Math.sin((i / n) * Math.PI);
    return `<trkpt lat="${lat.toFixed(6)}" lon="-9.15"><ele>${ele.toFixed(1)}</ele></trkpt>`;
  }).join('');
  const text = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Privado</name><trkseg>${pts}</trkseg></trk></gpx>`;
  return new File([text], name, { type: '' });
}

function renderAgenda() {
  return render(<ToastProvider><RunAgenda onClose={() => {}} /></ToastProvider>);
}

const hubInput = () => screen.getByTestId('race-hub-course').querySelector('input[type="file"]');

describe('RunAgenda — percurso (GPX)', () => {
  beforeEach(() => {
    mocks.updates.length = 0;
    mocks.updateError = null;
    localStorage.clear();
    useAppStore.setState({
      raceEvents: [RACE], profile: { id: 'user-1' }, session: { user: { id: 'user-1' } }, runs: [],
      editingRaceId: 'race-1', activeTab: 'holistica', pendingCalendarDate: null,
      setRaceEvents: (events) => useAppStore.setState({ raceEvents: events }),
      setNavGuard: () => {},
      setEditingRaceId: (id) => useAppStore.setState({ editingRaceId: id }),
    });
  });

  it('numa prova gravada: carregar o GPX grava só o perfil (course_profile + course_profile_at) e mostra-o no Hub', async () => {
    renderAgenda();
    expect(screen.getByTestId('race-hub-course')).toHaveTextContent('Carregar o percurso (GPX)');
    fireEvent.change(hubInput(), { target: { files: [gpxFile()] } });

    await waitFor(() => expect(mocks.updates).toHaveLength(1));
    const { table, patch } = mocks.updates[0];
    expect(table).toBe('race_events');
    expect(Object.keys(patch).sort()).toEqual(['course_profile', 'course_profile_at']);
    expect(patch.course_profile).toMatchObject({ v: 1, source: 'gpx' });
    expect(patch.course_profile.distance_km).toBeCloseTo(2.4, 0);
    expect(Array.isArray(patch.course_profile.track)).toBe(true);
    // Nada do ficheiro além dos números: nem o nome do track.
    expect(JSON.stringify(patch)).not.toContain('Privado');
    expect(useAppStore.getState().raceEvents[0].course_profile).toEqual(patch.course_profile);

    const hub = screen.getByTestId('race-hub-course');
    await waitFor(() => expect(hub.querySelector('[data-testid="course-profile-stats"]')).not.toBeNull());
    expect(hub).toHaveTextContent('2,4 km');
    expect(hub.querySelector('[data-testid="course-map"]')).not.toBeNull();
    // No Hub a sugestão diz-se, mas os campos mudam-se nos Detalhes.
    expect(hub).toHaveTextContent('Para usar estes valores, abre «Detalhes da prova».');
  });

  it('um GPX curto demais: a frase do motivo, e nada se grava', async () => {
    renderAgenda();
    fireEvent.change(hubInput(), { target: { files: [gpxFile(0.3)] } });
    expect((await screen.findAllByText(COURSE_BUILD_ERRORS.demasiado_curto)).length).toBeGreaterThan(0);
    expect(mocks.updates).toHaveLength(0);
  });

  it('sem a coluna no servidor (migration por aplicar): uma frase clara', async () => {
    mocks.updateError = { code: 'PGRST204', message: "Could not find the 'course_profile' column of 'race_events' in the schema cache" };
    renderAgenda();
    fireEvent.change(hubInput(), { target: { files: [gpxFile()] } });
    expect((await screen.findAllByText(COURSE_COLUMN_MISSING_TEXT)).length).toBeGreaterThan(0);
    expect(useAppStore.getState().raceEvents[0].course_profile).toBeNull();
  });

  it('Remover apaga o perfil gravado', async () => {
    renderAgenda();
    fireEvent.change(hubInput(), { target: { files: [gpxFile()] } });
    await waitFor(() => expect(mocks.updates).toHaveLength(1));
    const hub = screen.getByTestId('race-hub-course');
    await waitFor(() => expect(hub.querySelector('[data-testid="course-gpx-remove"]')).not.toBeNull());
    fireEvent.click(hub.querySelector('[data-testid="course-gpx-remove"]'));
    await waitFor(() => expect(mocks.updates).toHaveLength(2));
    expect(mocks.updates[1].patch).toEqual({ course_profile: null, course_profile_at: null });
    await waitFor(() => expect(screen.getByTestId('race-hub-course')).toHaveTextContent('Carregar o percurso (GPX)'));
  });

  it('nos Detalhes: a distância do GPX sugere-se e só entra no campo quando o atleta aceita', async () => {
    renderAgenda();
    fireEvent.change(hubInput(), { target: { files: [gpxFile()] } });
    await waitFor(() => expect(mocks.updates).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: /^Detalhes da prova$/i }));
    const campo = screen.getByLabelText(/Distância/i, { selector: 'input' });
    expect(campo.value).toBe('10');
    const aplicar = await screen.findByRole('button', { name: 'Usar os valores do GPX' });
    fireEvent.click(aplicar);
    await waitFor(() => expect(campo.value).toBe('2.4'));
    // A distância não se grava sozinha: espera pelo «Guardar prova».
    expect(mocks.updates).toHaveLength(1);
  });
});
