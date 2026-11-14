import React, { Suspense, lazy, useRef } from 'react';
import { Route, Upload, RefreshCw, Trash2 } from 'lucide-react';
import CourseMap from './CourseMap';
import { GPX_ACCEPT } from '../../utils/gpxParse';
import { courseSuggestions } from '../../utils/courseSuggest';
import { fmtNumber } from '../../utils/verdicts/shared';

const CourseElevationChart = lazy(() => import('./CourseElevationChart'));

/* O percurso da prova a partir de um GPX (pedido do Rui, 2026-11-14) — no formulário da prova
   (RunAgenda) e no hub. Só apresenta: quem monta lê o ficheiro (utils/gpxParse.js), calcula o
   perfil (@formulas/courseProfile.ts) e grava-o.

   Sem percurso: «Carregar o percurso (GPX)». Com percurso: distância, D+, D−, altitude mín./máx.,
   o gráfico de altitude, o traçado (quando o perfil o traz), «Trocar» e «Remover» — e, se a
   distância ou o D+ do GPX não baterem com os da prova, a sugestão de os atualizar (o atleta
   confirma; nada muda sozinho). */

function Stat({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-3)]">{label}</dt>
      <dd className="m-0 text-[15px] font-extrabold text-[var(--text-1)] tabular-nums">{value}</dd>
    </div>
  );
}

export default function CourseProfilePanel({
  profile,
  race = null,
  onFile,
  onRemove,
  onApplySuggestion,
  busy = false,
  error = null,
  showMap = true,
  suggest = { distance: true, elevation: true },
  suggestionHint = null,
  className = '',
}) {
  const inputRef = useRef(null);
  const pick = () => inputRef.current?.click();
  const onChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onFile?.(file);
  };
  const suggestion = profile ? courseSuggestions(profile, race, suggest) : null;

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={GPX_ACCEPT}
      onChange={onChange}
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      data-testid="course-gpx-input"
    />
  );
  const errorLine = error ? <p role="alert" className="text-[12.5px] font-medium mt-2" style={{ color: 'var(--danger)' }}>{error}</p> : null;

  if (!profile) {
    return (
      <div className={className} data-testid="course-profile-empty">
        {input}
        <button
          type="button"
          onClick={pick}
          disabled={busy}
          className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl text-[13px] font-bold border border-dashed transition disabled:opacity-60"
          style={{ color: 'var(--race)', borderColor: 'var(--race)', background: 'transparent' }}
          data-testid="course-gpx-load"
        >
          {busy ? <RefreshCw size={15} className="animate-spin" aria-hidden="true" /> : <Upload size={15} aria-hidden="true" />}
          {busy ? 'A ler o percurso…' : 'Carregar o percurso (GPX)'}
        </button>
        <p className="text-[11.5px] text-[var(--text-3)] mt-1.5">
          A Carol passa a conhecer as subidas e descidas. O ficheiro não fica guardado — só o perfil do percurso.
        </p>
        {errorLine}
      </div>
    );
  }

  return (
    <section className={`space-y-3 ${className}`.trim()} data-testid="course-profile" aria-label="Percurso da prova">
      {input}
      <div className="flex items-center gap-2">
        <Route size={15} className="text-[var(--race)] shrink-0" aria-hidden="true" />
        <h4 className="m-0 text-[12px] font-extrabold uppercase tracking-wider text-[var(--text-2)]">Percurso (GPX)</h4>
      </div>
      <dl className="grid grid-cols-3 gap-x-3 gap-y-2 m-0" data-testid="course-profile-stats">
        <Stat label="Distância" value={`${fmtNumber(profile.distance_km, 1)} km`} />
        <Stat label="D+" value={`${fmtNumber(profile.gain_m, 0)} m`} />
        <Stat label="D−" value={`${fmtNumber(profile.loss_m, 0)} m`} />
        <Stat label="Alt. mín." value={`${fmtNumber(profile.min_alt_m, 0)} m`} />
        <Stat label="Alt. máx." value={`${fmtNumber(profile.max_alt_m, 0)} m`} />
      </dl>

      {suggestion && (
        <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-faint)' }} data-testid="course-suggestion">
          <p className="m-0 text-[12.5px] text-[var(--text-2)]">
            O GPX diz {[
              suggestion.distance_km != null ? `${fmtNumber(suggestion.distance_km, 1)} km` : null,
              suggestion.elevation_gain_m != null ? `${fmtNumber(suggestion.elevation_gain_m, 0)} m de D+` : null,
            ].filter(Boolean).join(' e ')}
            {' — '}a prova tem {[
              suggestion.distance_km != null ? (race?.distance_km ? `${fmtNumber(Number(race.distance_km), 1)} km` : 'a distância por preencher') : null,
              suggestion.elevation_gain_m != null ? (race?.elevation_gain_m ? `${fmtNumber(Number(race.elevation_gain_m), 0)} m` : 'o D+ por preencher') : null,
            ].filter(Boolean).join(' e ')}.
          </p>
          {onApplySuggestion && (
            <button
              type="button"
              onClick={() => onApplySuggestion(suggestion)}
              disabled={busy}
              className="mt-2 min-h-[44px] px-3 rounded-lg text-[12.5px] font-bold disabled:opacity-60"
              style={{ color: 'var(--bg-app)', background: 'var(--race)' }}
              data-testid="course-suggestion-apply"
            >
              Usar os valores do GPX
            </button>
          )}
          {!onApplySuggestion && suggestionHint && <p className="m-0 mt-1 text-[11.5px] text-[var(--text-3)]">{suggestionHint}</p>}
        </div>
      )}

      <Suspense fallback={<div className="h-[230px] rounded-2xl" style={{ background: 'var(--surface-soft)' }} aria-hidden="true" />}>
        <CourseElevationChart profile={profile} raceName={race?.name || null} />
      </Suspense>
      {showMap && <CourseMap track={profile.track} start={profile.start} finish={profile.finish} distanceKm={profile.distance_km} />}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={pick}
          disabled={busy}
          className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold border transition disabled:opacity-60"
          style={{ color: 'var(--text-2)', borderColor: 'var(--border-glass-strong)' }}
          data-testid="course-gpx-replace"
        >
          {busy ? <RefreshCw size={14} className="animate-spin" aria-hidden="true" /> : <Upload size={14} aria-hidden="true" />} {busy ? 'A ler…' : 'Trocar'}
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold border transition disabled:opacity-60"
          style={{ color: 'var(--danger)', borderColor: 'var(--tint-danger-bd)' }}
          data-testid="course-gpx-remove"
        >
          <Trash2 size={14} aria-hidden="true" /> Remover
        </button>
      </div>
      {errorLine}
    </section>
  );
}
