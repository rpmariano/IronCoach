import { formatPace, formatDuration } from './run';
import { normalizeStartTime } from './startTime';
import { canvasToFile, loadLogo, muralDateLabel, muralFileName } from './raceMural';

/* O plano de ritmos como imagem (ação P.13, specs/carol-omnisciencia-omnipresenca.md).
   O botão "Guardar como imagem" do cartão "Plano para o dia" (RacePacingPlanCard)
   faz uma imagem vertical com as passagens por troço e o abastecimento, para
   a manhã da prova sem rede: guarda-se na galeria e abre-se sem a app.

   Como o cartão, isto não decide nada: as linhas são as de
   buildRacePacingPlan (@formulas/racePacing.ts), já agrupadas por troço, e o
   texto é o mesmo do cartão — os helpers de texto vivem aqui e o cartão
   usa-os, para os dois nunca discordarem. Sem modo "em prova", sem cache no
   service worker: é uma fotografia do plano no momento em que se guarda.

   A regra do que se diz (racePlanImageModel) é pura e testada; o desenho
   (drawRacePlanImage) só pinta, como o mural (muralStudio/muralStudioDraw). */

/** "km 0 a 1", "km 20 a 21,1" — a vírgula decimal é a convenção da app. */
export function kmLabel(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');
}

export const FUEL_LABEL = { agua: 'água', hidratos: 'hidratos' };

/** Sobre o que o plano se monta: o objetivo, ou a previsão do treino. */
export function basisLabel(plan) {
  return plan.basis === 'objetivo'
    ? (plan.targetSeconds ? `sobre o objetivo ${formatDuration(Math.round(plan.targetSeconds))}` : 'sobre o objetivo')
    : (plan.predictedSeconds ? `sobre a previsão do treino ${formatDuration(Math.round(plan.predictedSeconds))}` : 'sobre a previsão do treino');
}

/* A cor diz o significado, como no cartão: o âmbar da prova só no ponto de
   decisão, o verde no que é para ganhar tempo, o coral no relevo. */
const LABEL_TONE = {
  controlar: 'muted', ritmo: 'muted', aguentar: 'muted', decidir: 'race', acelerar: 'ok', subida: 'warn', descida: 'warn',
};

/**
 * O que a imagem diz, já em texto. null sem plano.
 * { name, when, finish, basis, ambitious, effort, rows: [{ km, pace, passage, label, tone, instruction }], fuel: [texto] }
 */
export function racePlanImageModel(plan, race) {
  if (!plan || !Array.isArray(plan.rows) || !plan.rows.length) return null;
  const startTime = normalizeStartTime(race?.start_time);
  const date = muralDateLabel(race?.date);
  return {
    name: String(race?.name || '').trim() || 'A minha prova',
    when: [date, startTime ? `partida às ${startTime}` : null].filter(Boolean).join(' · '),
    finish: formatDuration(Math.round(plan.plannedFinishSeconds)),
    basis: plan.effortMode ? `${basisLabel(plan)} · por esforço` : basisLabel(plan),
    // A nota do objetivo ambicioso é a primeira que o motor escreve.
    ambitious: plan.ambitious ? (plan.notes?.[0] || null) : null,
    effort: !!plan.effortMode,
    rows: plan.rows.map((row) => ({
      km: `km ${kmLabel(row.fromKm)} a ${kmLabel(row.toKm)}`,
      pace: `${formatPace(row.paceSecPerKm)}/km`,
      passage: formatDuration(row.cumulativeSeconds),
      label: row.label,
      tone: LABEL_TONE[row.label] || 'muted',
      instruction: row.instruction,
    })),
    fuel: (plan.fuel || []).map((f) => `km ${kmLabel(f.km)} · ${FUEL_LABEL[f.what] || f.what}`),
  };
}

export function racePlanFileName(race) {
  return muralFileName(race, 'plano');
}

/* ── o desenho ──────────────────────────────────────────────────────────── */

export const PLAN_IMAGE_WIDTH = 1080;
// No mínimo 4:5; um plano comprido cresce para baixo em vez de encolher a letra.
export const PLAN_IMAGE_MIN_HEIGHT = 1350;

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
// O tema escuro da app (styles/tokens/colors.css) e o fundo do mural "dourado".
const C = {
  bg: '#0b1120', text: '#f8fafc', muted: '#cbd5e1', faint: '#9aa5b4', line: 'rgba(255,255,255,0.10)',
  race: '#fbbf24', ok: '#34d399', warn: '#fb7c4d', raceBand: 'rgba(251,191,36,0.10)',
};
const PAD = 72;

/** Parte o texto em linhas que caibam na largura; a primeira pode ter menos
 *  espaço (quando começa depois do rótulo). A última leva "…" se sobrar. */
function wrap(ctx, text, width, { firstWidth = width, maxLines = 2 } = {}) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (let i = 0; i < words.length; i += 1) {
    const room = lines.length === 0 ? firstWidth : width;
    const next = current ? `${current} ${words[i]}` : words[i];
    if (!current || ctx.measureText(next).width <= room) {
      current = next;
      continue;
    }
    lines.push(current);
    current = words[i];
    if (lines.length === maxLines) {
      // Não cabe tudo: a última linha acaba com reticências.
      let last = lines[maxLines - 1];
      while (last && ctx.measureText(`${last}…`).width > (maxLines === 1 ? firstWidth : width)) last = last.slice(0, -1).trimEnd();
      lines[maxLines - 1] = `${last}…`;
      return lines;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* Uma passagem só serve para medir (draw: false) e para pintar (draw: true):
   as duas percorrem o mesmo caminho, por isso a altura medida é a pintada. */
function paint(ctx, model, { logo, draw, height }) {
  const W = PLAN_IMAGE_WIDTH;
  const inner = W - PAD * 2;
  const text = (s, x, y, { font, color, align = 'left' }) => {
    if (!draw) return;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(s, x, y);
  };

  if (draw) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, height);
    // A luz âmbar da prova, no topo, como no cartão (GlassCard tone="race").
    const glow = ctx.createRadialGradient(W * 0.2, 0, 0, W * 0.2, 0, W * 0.9);
    glow.addColorStop(0, 'rgba(251,191,36,0.16)');
    glow.addColorStop(1, 'rgba(251,191,36,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, Math.min(height, W));
  }

  ctx.textBaseline = 'alphabetic';
  let y = PAD;

  // Marca e título da secção.
  const brand = 64;
  if (logo && draw) ctx.drawImage(logo, PAD, y, brand, brand);
  text('PLANO PARA O DIA', logo ? PAD + brand + 22 : PAD, y + brand / 2 + 11, { font: `800 30px ${FONT}`, color: C.race });
  y += brand + 44;

  // A prova e quando é.
  ctx.font = `900 64px ${FONT}`;
  for (const line of wrap(ctx, model.name, inner, { maxLines: 2 })) {
    y += 64;
    text(line, PAD, y, { font: `900 64px ${FONT}`, color: C.text });
    y += 10;
  }
  if (model.when) {
    y += 44;
    text(model.when, PAD, y, { font: `700 32px ${FONT}`, color: C.muted });
  }

  // A chegada planeada: a soma dos troços, não o objetivo.
  y += 76;
  text('CHEGADA PLANEADA', PAD, y, { font: `800 28px ${FONT}`, color: C.race });
  y += 118;
  text(model.finish, PAD, y, { font: `900 120px ${FONT}`, color: C.text });
  y += 50;
  text(model.basis, PAD, y, { font: `600 30px ${FONT}`, color: C.muted });
  if (model.ambitious) {
    ctx.font = `600 28px ${FONT}`;
    for (const line of wrap(ctx, model.ambitious, inner, { maxLines: 3 })) {
      y += 40;
      text(line, PAD, y, { font: `600 28px ${FONT}`, color: C.warn });
    }
  }

  // A tabela: um troço por linha — km à esquerda, ritmo e passagem à direita;
  // por baixo o rótulo (com a cor do significado) e a instrução.
  y += 40;
  // A coluna do ritmo alinha pela passagem mais larga ("55:18" e "1:10:15"
  // na mesma tabela), senão os ritmos ficavam aos saltos de linha para linha.
  ctx.font = `600 34px ${FONT}`;
  const passageCol = Math.max(0, ...model.rows.map((r) => ctx.measureText(r.passage).width));
  for (const row of model.rows) {
    const top = y;
    // Medir primeiro: a faixa do ponto de decisão pinta-se antes do texto.
    const label = row.label.toUpperCase();
    ctx.font = `800 26px ${FONT}`;
    const labelW = ctx.measureText(`${label} · `).width;
    ctx.font = `500 28px ${FONT}`;
    const lines = wrap(ctx, row.instruction, inner, { firstWidth: inner - labelW, maxLines: 2 });
    const rowH = 136 + (lines.length - 1) * 38;

    if (draw) {
      // O ponto de decisão destaca-se: é o único troço que pede uma escolha.
      if (row.tone === 'race') {
        ctx.fillStyle = C.raceBand;
        roundedRect(ctx, PAD - 20, top + 8, inner + 40, rowH - 8, 18);
        ctx.fill();
      }
      ctx.fillStyle = C.line;
      ctx.fillRect(PAD, top, inner, 2);
    }

    const lineY = top + 66;
    text(row.km, PAD, lineY, { font: `800 36px ${FONT}`, color: C.text });
    text(row.passage, W - PAD, lineY, { font: `600 34px ${FONT}`, color: C.muted, align: 'right' });
    // Em trail o ritmo é só referência: fica apagado, como no cartão.
    text(row.pace, W - PAD - passageCol - 28, lineY, { font: `900 38px ${FONT}`, color: model.effort ? C.faint : C.text, align: 'right' });

    let ly = lineY + 44;
    text(`${label} · `, PAD, ly, { font: `800 26px ${FONT}`, color: C[row.tone] || C.muted });
    lines.forEach((line, i) => {
      if (i > 0) ly += 38;
      text(line, i === 0 ? PAD + labelW : PAD, ly, { font: `500 28px ${FONT}`, color: C.muted });
    });
    y = top + rowH;
  }

  // O abastecimento: marcos em pastilhas, que passam à linha seguinte.
  if (model.fuel.length) {
    y += 56;
    text('ABASTECIMENTO', PAD, y, { font: `800 26px ${FONT}`, color: C.faint });
    y += 24;
    ctx.font = `700 28px ${FONT}`;
    let x = PAD;
    const chipH = 56;
    let rowTop = y;
    for (const chip of model.fuel) {
      const w = ctx.measureText(chip).width + 44;
      if (x + w > W - PAD && x > PAD) { x = PAD; rowTop += chipH + 14; }
      if (draw) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        roundedRect(ctx, x, rowTop, w, chipH, chipH / 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      text(chip, x + 22, rowTop + 38, { font: `700 28px ${FONT}`, color: C.muted });
      x += w + 14;
    }
    y = rowTop + chipH;
  }

  // O rodapé: de quem é o plano.
  y += 72;
  text('O plano da Carol · IronCoach', PAD, y, { font: `600 26px ${FONT}`, color: C.faint });
  return y + PAD;
}

/** Pinta o plano no canvas dado e devolve-o. A altura acompanha o plano. */
export function drawRacePlanImage(canvas, model, { logo = null } = {}) {
  const ctx = canvas.getContext('2d');
  const needed = paint(ctx, model, { logo, draw: false, height: 0 });
  canvas.width = PLAN_IMAGE_WIDTH;
  canvas.height = Math.max(PLAN_IMAGE_MIN_HEIGHT, Math.ceil(needed));
  // Mudar o tamanho limpa o estado do contexto: a passagem que pinta volta a
  // pôr a letra e a cor antes de cada texto.
  paint(ctx, model, { logo, draw: true, height: canvas.height });
  return canvas;
}

/** O ficheiro pronto a guardar ou partilhar. O logótipo é opcional: sem ele
 *  (offline, ou a falhar) a imagem sai na mesma. */
export async function renderRacePlanFile(plan, race) {
  const model = racePlanImageModel(plan, race);
  if (!model) throw new Error('Sem plano para guardar.');
  const logo = await loadLogo().catch(() => null);
  const canvas = drawRacePlanImage(document.createElement('canvas'), model, { logo });
  return canvasToFile(canvas, racePlanFileName(race));
}

/* ── guardar e partilhar ── (em utils/shareFile.js, partilhado com o mural) */
export { downloadFile, canShareFiles, shareOrDownload } from './shareFile';
