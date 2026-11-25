import { describe, it, expect } from 'vitest';
import { buildCourseProfile } from '@formulas/courseProfile.ts';
import { pacingRouteInput } from './coursePacing';

// 10 km para norte, plano, com uma subida de 60 m no km 4.
function profile() {
  const pts = [];
  for (let i = 0; i <= 200; i += 1) {
    const km = i * 0.05;
    const ele = km <= 3 ? 50 : km <= 4 ? 50 + (km - 3) * 60 : 110;
    pts.push({ lat: 38.7 + km / 111.195, lon: -9.14, ele });
  }
  const r = buildCourseProfile(pts);
  if (!r.ok) throw new Error(r.error);
  return r.profile;
}

describe('pacingRouteInput — GPX primeiro, site depois (bug 2026-11-14)', () => {
  const site = { route_summary: 'Plano', route_segments: [{ km_marker: 2, description: 'ponte', elevation: 'sobe' }] };

  it('com GPX, os troços são os do GPX, mesmo havendo troços no site', () => {
    const r = pacingRouteInput({ web_info: site, course_profile: profile() });
    expect(r.routeSource).toBe('gpx');
    expect(r.hasCourse).toBe(true);
    expect(r.routeSummary).toBeNull();
    expect(r.routeSegments.some((s) => /GPX: sobe/.test(s.description))).toBe(true);
  });

  it('sem GPX, os do site; sem nada, nulos', () => {
    expect(pacingRouteInput({ web_info: site })).toEqual({ routeSegments: site.route_segments, routeSummary: 'Plano', routeSource: 'site', hasCourse: false });
    expect(pacingRouteInput(null)).toEqual({ routeSegments: null, routeSummary: null, routeSource: 'site', hasCourse: false });
  });

  it('um course_profile inválido (dado do cliente) conta como sem GPX', () => {
    for (const bad of [{}, 'texto', { v: 1, source: 'gpx' }, []]) {
      expect(pacingRouteInput({ web_info: site, course_profile: bad }).hasCourse).toBe(false);
    }
  });
});
