import React, { useMemo } from 'react';
import { courseMapPath } from '../../utils/courseMap';
import { fmtNumber } from '../../utils/verdicts/shared';

/* O traçado da prova, desenhado a partir do `track` do perfil do GPX (utils/courseMap.js): só a
   linha, a partida e a chegada — sem mapa por baixo (a CSP não deixa tiles de terceiros, e não
   queremos dependências). Sem track (um perfil antigo), não aparece. */
export default function CourseMap({ track, start = null, finish = null, distanceKm = null, className = '' }) {
  const shape = useMemo(() => courseMapPath(track, { start, finish }), [track, start, finish]);
  if (!shape) return null;
  const { d, width, height, start: s, finish: f, loop } = shape;
  const km = Number(distanceKm) > 0 ? `${fmtNumber(distanceKm, 1)} km` : null;
  const label = `Traçado do percurso${km ? `, ${km}` : ''}, ${loop ? 'partida e chegada no mesmo sítio' : 'da partida à chegada'}. O norte fica para cima.`;
  return (
    <figure className={`m-0 ${className}`.trim()} data-testid="course-map">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="img"
        aria-label={label}
        style={{ display: 'block', maxHeight: height, background: 'var(--surface-soft)', borderRadius: 14, border: '1px solid var(--border-faint)' }}
      >
        <path d={d} fill="none" stroke="var(--race)" strokeOpacity="0.28" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
        <path d={d} fill="none" stroke="var(--race)" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" data-testid="course-map-line" />
        {loop ? (
          <g data-testid="course-map-loop">
            <circle cx={s[0]} cy={s[1]} r="7" fill="var(--ok)" stroke="var(--bg-app)" strokeWidth="2.5" />
            <circle cx={s[0]} cy={s[1]} r="2.6" fill="var(--text-1)" />
          </g>
        ) : (
          <>
            <circle cx={s[0]} cy={s[1]} r="6.5" fill="var(--ok)" stroke="var(--bg-app)" strokeWidth="2.5" data-testid="course-map-start" />
            <g data-testid="course-map-finish">
              <circle cx={f[0]} cy={f[1]} r="6.5" fill="var(--text-1)" stroke="var(--bg-app)" strokeWidth="2.5" />
              <circle cx={f[0]} cy={f[1]} r="2.6" fill="var(--bg-app)" />
            </g>
          </>
        )}
      </svg>
      <figcaption className="mt-1.5 flex items-center gap-3 text-[11px] text-[var(--text-3)]" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'var(--ok)' }} />{loop ? 'Partida e chegada' : 'Partida'}</span>
        {!loop && <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'var(--text-1)' }} />Chegada</span>}
        <span className="ml-auto">Norte ↑</span>
      </figcaption>
    </figure>
  );
}
