import { describe, it, expect, vi } from 'vitest';

const from = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { from: (...a) => from(...a) } }));

const { saveCourseProfile, readCourseProfile, isMissingColumnError, courseProfileFromFile, COURSE_BUILD_ERRORS, COURSE_COLUMN_MISSING_TEXT } = await import('./courseProfileUpload');

const gpx = (pts) => new File([`<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${pts}</trkseg></trk></gpx>`], 'p.gpx');
const line = (n, ele = true) => Array.from({ length: n }, (_, i) => `<trkpt lat="${(38.7 + i * 0.0009).toFixed(5)}" lon="-9.1">${ele ? `<ele>${10 + i}</ele>` : ''}</trkpt>`).join('');

describe('courseProfileUpload', () => {
  it('do ficheiro ao perfil, pela fórmula partilhada; os motivos viram frases', async () => {
    const p = await courseProfileFromFile(gpx(line(30)));
    expect(p).toMatchObject({ v: 1, source: 'gpx' });
    expect(p.distance_km).toBeGreaterThan(2.5);
    await expect(courseProfileFromFile(gpx(line(3)))).rejects.toThrow(COURSE_BUILD_ERRORS.demasiado_curto);
    await expect(courseProfileFromFile(gpx(line(30, false)))).rejects.toThrow('O GPX não tem altitude.');
  });

  it('ao ler, o perfil passa pelo sanitizeCourseProfile (lixo → null)', async () => {
    const p = await courseProfileFromFile(gpx(line(30)));
    expect(readCourseProfile({ course_profile: p })).toEqual(p);
    expect(readCourseProfile({ course_profile: { v: 9 } })).toBeNull();
    expect(readCourseProfile({})).toBeNull();
  });

  it('grava só o perfil e a hora; o modo demo não vai à rede; sem a coluna, a frase clara', async () => {
    const calls = [];
    from.mockImplementation((table) => ({
      update: (patch) => { calls.push({ table, patch }); const q = { eq: () => q, select: () => q, maybeSingle: () => Promise.resolve({ data: { id: 'r1' }, error: null }) }; return q; },
    }));
    const ok = await saveCourseProfile({ raceId: 'r1', userId: 'u1', profile: { v: 1 } });
    expect(ok.ok).toBe(true);
    expect(Object.keys(calls[0].patch).sort()).toEqual(['course_profile', 'course_profile_at']);

    calls.length = 0;
    expect((await saveCourseProfile({ raceId: 'r1', userId: 'demo-user', profile: { v: 1 } })).ok).toBe(true);
    expect(calls).toHaveLength(0);

    from.mockImplementation(() => ({ update: () => { const q = { eq: () => q, select: () => q, maybeSingle: () => Promise.resolve({ data: null, error: { code: 'PGRST204', message: 'x' } }) }; return q; } }));
    expect(await saveCourseProfile({ raceId: 'r1', userId: 'u1', profile: null })).toEqual({ ok: false, message: COURSE_COLUMN_MISSING_TEXT });
    expect(isMissingColumnError({ code: '42703' })).toBe(true);
    expect(isMissingColumnError({ code: '23505', message: 'dup' })).toBe(false);
    expect(isMissingColumnError({ code: '23514', message: 'violates check constraint "race_events_course_profile_shape"' })).toBe(false);
  });
});
