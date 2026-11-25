import React from 'react';
import { ImagePlus, X } from 'lucide-react';
import '../../styles/v2-components.css';
import '../../styles/v2-registo.css';
import { ReadPrintsButton } from '../shared/registration/PhotoReadSection';
import { formatDuration, formatPace } from '../../utils/run';
import { formatDatePTShort } from '../../utils/racePlanEngine';

/* O registo de corrida no Design v2 (direção C · Painel, 2026-11-25; utils/designV2.js). Só a
   forma: o RunRegistration continua a fazer tudo (as fotos, a leitura «preview», o rascunho, a
   gravação) e passa-lhe o que tem. Duas peças:
   · RunShotV2: o print do relógio primeiro, como o atalho principal (a área tracejada grande);
   · RunReadOutV2: o que a Carol leu do print, campo a campo, para confirmar.
   O tipo de treino, a data e a hora ficam por baixo, nos campos de sempre. */

const nf2 = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 });
const isNum = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** As linhas do painel a partir do que a leitura devolveu. Só o que veio; nada inventado. */
export function readOutRows(read, { trainingTypeLabel = null } = {}) {
  if (!read) return [];
  const rows = [];
  if (isNum(read.distance_km)) rows.push({ key: 'distance', label: 'Distância', value: `${nf2.format(read.distance_km)} km` });
  if (isNum(read.duration_seconds)) rows.push({ key: 'duration', label: 'Tempo', value: formatDuration(Math.round(read.duration_seconds)) });
  if (isNum(read.distance_km) && isNum(read.duration_seconds)) {
    rows.push({ key: 'pace', label: 'Ritmo médio', value: `${formatPace(read.duration_seconds / read.distance_km)}/km` });
  }
  if (isNum(read.avg_heart_rate_bpm)) rows.push({ key: 'hr', label: 'FC média', value: `${Math.round(read.avg_heart_rate_bpm)} bpm` });
  if (isNum(read.official_time_seconds)) rows.push({ key: 'official', label: 'Tempo oficial', value: formatDuration(Math.round(read.official_time_seconds)) });
  if (isNum(read.position)) rows.push({ key: 'position', label: 'Posição', value: `${read.position}.º` });
  if (Array.isArray(read.splits) && read.splits.length) {
    const n = read.splits.length;
    rows.push({ key: 'splits', label: 'Parciais', value: n === 1 ? '1 lido' : `${n} lidos`, ok: true });
  }
  if (trainingTypeLabel) rows.push({ key: 'type', label: 'Tipo de treino', value: trainingTypeLabel, text: true });
  if (read.date) rows.push({ key: 'date', label: 'Data', value: formatDatePTShort(read.date), text: true });
  if (read.start_time) rows.push({ key: 'time', label: 'Hora', value: read.start_time });
  return rows;
}

/** O print do relógio, primeiro e grande. Os mesmos handlers do PhotoReadSection de sempre. */
export function RunShotV2({ photos, maxPhotos, onSelect, onRemove, onRead, reading = false, note = null, inputRef, race = false }) {
  const accent = race ? 'var(--race)' : 'var(--v2-acc)';
  if (!photos.length) {
    return (
      <label className="v2-reg-shot" data-testid="v2-reg-shot">
        <input ref={inputRef} type="file" accept="image/*" multiple className="sr-only" onChange={onSelect} />
        <span className="v2-reg-shot-in">
          <ImagePlus size={26} aria-hidden="true" className="v2-reg-shot-ic" />
          <b>Carregar o print do relógio</b>
          <span>Garmin, Strava, Coros… Eu leio a distância, o tempo e os parciais, e tu confirmas.</span>
        </span>
      </label>
    );
  }
  return (
    <div className="v2-reg-shotset" data-testid="v2-reg-shot">
      <div className="v2-reg-thumbs">
        {photos.map((p, i) => (
          <div key={i} className="v2-reg-thumb">
            <img src={p.dataUrl} alt={`Print ${i + 1}`} />
            <button type="button" onClick={() => onRemove(i)} aria-label={`Remover print ${i + 1}`} className="v2-reg-thumb-x">
              <span><X size={14} aria-hidden="true" /></span>
            </button>
          </div>
        ))}
      </div>
      {photos.length < maxPhotos && (
        <label className="v2-reg-more">
          <input ref={inputRef} type="file" accept="image/*" multiple className="sr-only" onChange={onSelect} />
          <ImagePlus size={16} aria-hidden="true" />
          <span>Juntar outro print</span>
          <small className="v2-num">{photos.length}/{maxPhotos}</small>
        </label>
      )}
      {onRead && <ReadPrintsButton onRead={onRead} reading={reading} accent={accent} />}
      <p role="status" aria-live="polite" className={`v2-reg-note${note?.tone === 'warn' ? ' is-warn' : ''}`}>
        {note?.text || ''}
      </p>
    </div>
  );
}

/** O que a Carol leu do print, campo a campo. Os campos abaixo continuam editáveis. */
export function RunReadOutV2({ rows }) {
  if (!rows?.length) return null;
  return (
    <section aria-labelledby="v2-reg-read-t" data-testid="v2-reg-read">
      <h3 id="v2-reg-read-t" className="v2-label">A Carol leu isto do print</h3>
      <dl className="v2-reg-read">
        {rows.map((r) => (
          <div key={r.key} className="v2-reg-fld" data-testid={`v2-reg-fld-${r.key}`}>
            <dt>{r.label}</dt>
            <dd className={`${r.text ? 'v2-reg-txt' : 'v2-num'}${r.ok ? ' is-ok' : ''}`}>{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="v2-reg-hint">Se algum valor não bate certo, corrige-o nos campos abaixo.</p>
    </section>
  );
}
