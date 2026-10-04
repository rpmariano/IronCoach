import React from 'react';
import { fmtNumber } from '../../../utils/verdicts/shared';

/**
 * DeltaVsPrevious — o ▲/▼ face ao período ANTERIOR equivalente e fechado
 * (R5, 2026-10-04). Antes o ▲/▼ da Nutrição era a distância ao objetivo
 * (erro N6) e o do Ginásio comparava uma semana parcial com a última semana
 * com dados (G4). Aqui só há seta quando existe anterior — sem ele não se
 * desenha nada (quem chama mostra firstPeriodNote(kind) se quiser).
 *
 * Duas formas, como no mock-up:
 *   - com `previousText`: "▲ agosto: 11 de 29 (38%)"   (o anterior por extenso)
 *   - sem ele:            "▼ 4 g face a 21 – 26 set"     (a diferença)
 *   - igual:              "= igual a agosto" / "= agosto: 11 de 29"
 *
 * A cor diz se a mudança é boa: `better='up'` (mais é melhor) pinta ▲ a verde
 * e ▼ a coral; `better='down'` ao contrário; `better='none'` fica cinzento
 * (ex.: calorias, onde subir não é bom nem mau por si). Igual é sempre cinzento.
 * Para o leitor de ecrã o triângulo fica escondido e há uma frase por extenso.
 *
 * Props:
 *   current, previous   números comparados (ex.: % de dias no objetivo).
 *                       previous null/undefined (ou hasPrevious=false) → nada.
 *   previousLabel       nome do anterior ("agosto", "21 – 26 set", "semana passada")
 *   previousText        opcional — o anterior por extenso ("11 de 29 (38%)")
 *   better              'up' | 'down' | 'none'   (default 'up')
 *   decimals            casas da diferença (default 0); abaixo de meia unidade = igual
 *   unit                unidade da diferença ("g", "kcal") — só na forma da diferença
 *   direction           'up' | 'down' | 'flat' — força a seta (quando a comparação
 *                       não é current − previous)
 *   hasPrevious         false esconde mesmo com números (anterior sem dados)
 */
const ARROW = { up: '▲', down: '▼', flat: '=' };
const SR_VERB = { up: 'Subiu', down: 'Desceu', flat: 'Igual' };

export function deltaDirection(current, previous, decimals = 0) {
  const a = Number(current);
  const b = Number(previous);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const diff = a - b;
  const eps = 0.5 * 10 ** -decimals;
  if (Math.abs(diff) < eps) return 'flat';
  return diff > 0 ? 'up' : 'down';
}

export function deltaColor(direction, better = 'up') {
  if (direction === 'flat' || better === 'none' || !direction) return 'var(--text-4)';
  const good = better === 'down' ? direction === 'down' : direction === 'up';
  return good ? 'var(--ok)' : 'var(--warn)';
}

/** Há seta para desenhar? (o PeriodSummary usa isto para não deixar um
 * " · " pendurado quando o anterior não existe). */
export function hasDelta({ current, previous, previousLabel, direction, hasPrevious = true, decimals = 0 } = {}) {
  if (!hasPrevious || previous == null || !previousLabel) return false;
  return !!(direction || deltaDirection(current, previous, decimals));
}

export default function DeltaVsPrevious({
  current,
  previous,
  previousLabel,
  previousText,
  better = 'up',
  decimals = 0,
  unit = '',
  direction: forced,
  hasPrevious = true,
  className = '',
  style,
}) {
  if (!hasDelta({ current, previous, previousLabel, direction: forced, hasPrevious, decimals })) return null;
  const dir = forced || deltaDirection(current, previous, decimals);

  const diff = Math.abs(Number(current) - Number(previous));
  const diffTxt = Number.isFinite(diff) ? `${fmtNumber(diff, decimals)}${unit ? ` ${unit}` : ''}` : '';

  let visible;
  let spoken;
  if (previousText) {
    visible = `${previousLabel}: ${previousText}`;
    spoken = `${SR_VERB[dir]} face a ${previousLabel}, que teve ${previousText}`;
  } else if (dir === 'flat') {
    visible = `igual a ${previousLabel}`;
    spoken = `Igual a ${previousLabel}`;
  } else {
    visible = `${diffTxt} face a ${previousLabel}`;
    spoken = `${SR_VERB[dir]} ${diffTxt} face a ${previousLabel}`;
  }

  return (
    <span
      data-testid="delta-vs-previous"
      data-direction={dir}
      className={className}
      style={{ color: deltaColor(dir, better), fontWeight: 700, whiteSpace: 'nowrap', ...style }}
    >
      <span aria-hidden="true">{`${ARROW[dir]} ${visible}`}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}
