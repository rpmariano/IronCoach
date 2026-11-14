import { courseRouteSegments, sanitizeCourseProfile } from '@formulas/courseProfile.ts';

/**
 * Os troços do plano de ritmos de uma prova: os do GPX quando o atleta o carregou, senão os do
 * site. É a regra do racePacingRoute do coach-chat — o Hub, o cartão da Carol no Início e a
 * Carol no chat falam do mesmo percurso (bug 2026-11-14). O course_profile é dado do cliente:
 * passa sempre pelo sanitize, venha do rascunho (já limpo) ou cru do store.
 */
export function pacingRouteInput(race) {
  const course = sanitizeCourseProfile(race?.course_profile ?? null);
  return course
    ? { routeSegments: courseRouteSegments(course), routeSummary: null, routeSource: 'gpx', hasCourse: true }
    : { routeSegments: race?.web_info?.route_segments || null, routeSummary: race?.web_info?.route_summary || null, routeSource: 'site', hasCourse: false };
}
