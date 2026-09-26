import { AlertTriangle, AlertCircle, Lightbulb } from 'lucide-react';

/* O código dos avisos da Carol — um só, em todo o lado (pedido 2026-09-27):
   no botão flutuante, nos cartões dos insights e nos avisos em que ela pede
   para falar. Cada gravidade tem uma cor e um símbolo:

   - crítico: vermelho, com o triângulo;
   - atenção: coral, com o "!" num círculo;
   - informação: ciano, a cor dela, com a lâmpada.

   Antes eram três códigos: o botão usava o círculo para a atenção e os
   cartões o triângulo; a informação era ciana no botão e verde no cartão; e
   os avisos em que ela pede para falar eram sempre cianos, com um balão —
   mesmo quando o botão os pintava de coral.

   `btnColor` é a tinta CLARA do tom, não a cor cheia: o "Percebi" está em
   cima da tinta a 18% POR CIMA da tinta do cartão, e nessa dupla camada a
   cor cheia dava 4,06:1 (crítico) e 4,37:1 (atenção). Com a tinta clara — a
   mesma que o corpo do aviso usa — são 7,8 e 8,5:1. */
export const NOTICE_TONES = {
  critical: {
    Icon: AlertTriangle,
    color: 'var(--danger)',
    ink: 'var(--danger-ink)',
    ring: 'rgba(248,113,113,.5)',
    bg: 'var(--tint-danger-bg)',
    bd: 'var(--tint-danger-bd)',
    text: 'var(--danger-soft)',
    btnBg: 'rgba(248,113,113,.18)',
    btnColor: 'var(--danger-soft)',
  },
  warning: {
    Icon: AlertCircle,
    color: 'var(--warn)',
    ink: 'var(--warn-ink)',
    ring: 'rgba(251,124,77,.5)',
    bg: 'var(--tint-warn-bg)',
    bd: 'var(--tint-warn-bd)',
    text: 'var(--warn-soft)',
    btnBg: 'rgba(251,124,77,.18)',
    btnColor: 'var(--warn-soft)',
  },
  info: {
    Icon: Lightbulb,
    color: 'var(--coach)',
    ink: 'var(--coach-ink)',
    ring: 'rgba(34,211,238,.4)',
    bg: 'var(--tint-coach-bg)',
    bd: 'var(--tint-coach-bd)',
    text: 'var(--coach-soft)',
    btnBg: 'rgba(34,211,238,.18)',
    btnColor: 'var(--coach-soft)',
  },
};

const RANK = { critical: 2, warning: 1, info: 0 };

/** A gravidade conhecida, ou 'info' — um aviso sem gravidade é informação. */
export function noticeSeverity(severity) {
  return severity in RANK ? severity : 'info';
}

export function noticeTone(severity) {
  return NOTICE_TONES[noticeSeverity(severity)];
}

/** A gravidade mais alta de uma lista — é a que pinta o botão flutuante. */
export function topSeverity(items = []) {
  return (items || []).reduce((top, item) => {
    const s = noticeSeverity(item?.severity);
    return RANK[s] > RANK[top] ? s : top;
  }, 'info');
}
