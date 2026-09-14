import {
  STUDIO_THEMES, DEFAULT_STUDIO_THEME, studioLayout, coverCrop, planBlocks, pacePoints, graphicUnavailableReason,
} from './muralStudio';
import { loadImage, loadLogo } from './raceMural';

/* O desenho do estúdio do mural em Canvas (pedido 2026-09-14). A regra do
   que vai onde está em muralStudio.js; aqui só se pinta. Serve a
   pré-visualização (escala pequena, com os espaços vazios assinalados) e a
   imagem final (1080 px de largura, sem marcas de edição). */

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

/** Carrega as imagens das memórias (uma que falhe fica de fora) e o logótipo. */
export async function loadStudioAssets(urls) {
  const unique = [...new Set((urls || []).filter(Boolean))];
  const [settled, logo] = await Promise.all([
    Promise.allSettled(unique.map((u) => loadImage(u))),
    loadLogo().catch(() => null),
  ]);
  const images = {};
  settled.forEach((r, i) => { if (r.status === 'fulfilled') images[unique[i]] = r.value; });
  return { images, logo };
}

function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function shapePath(ctx, slot) {
  if (slot.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(slot.x + slot.w / 2, slot.y + slot.h / 2, slot.w / 2, 0, Math.PI * 2);
    ctx.closePath();
  } else {
    roundedRect(ctx, slot.x, slot.y, slot.w, slot.h, slot.radius || 0);
  }
}

function drawPhoto(ctx, img, box, fx, fy, zoom) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const { sx, sy, sw, sh } = coverCrop(iw, ih, box.w, box.h, fx, fy, zoom);
  ctx.drawImage(img, sx, sy, sw, sh, box.x, box.y, box.w, box.h);
}

function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  let i = 0;
  for (; i < words.length; i += 1) {
    const next = current ? `${current} ${words[i]}` : words[i];
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next;
    } else {
      lines.push(current);
      current = words[i];
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && current) { lines.push(current); i = words.length; }
  if (i < words.length) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

function rgba(rgb, a) {
  return `rgba(${rgb},${a})`;
}

/**
 * Pinta a composição num canvas. Devolve os grafismos que não couberam
 * (`dropped`), para o estúdio o dizer.
 */
export function drawMuralStudio(canvas, { composition, data, candidates = [], images = {}, logo = null, scale = 1, placeholders = false }) {
  const layout = studioLayout(composition.template, composition.format, composition.brandCorner);
  const { width: W, height: H, pad, text: zone, brand } = layout;
  const theme = STUDIO_THEMES[composition.theme] || STUDIO_THEMES[DEFAULT_STUDIO_THEME];
  const light = composition.theme === 'claro';
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (!ctx) return { dropped: [], layout };
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const imageFor = (candidateId) => images[byId.get(candidateId)?.url] || null;
  const available = (key) => !graphicUnavailableReason(key, { data, candidates, template: composition.template });
  const wants = (key) => !!composition.graphics?.[key] && available(key);

  // ── fundo ──
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  if (composition.template !== 'capa') {
    const cx = composition.template === 'trofeu' ? W / 2 : W * 0.85;
    const cy = composition.template === 'trofeu' ? layout.slots[0].y + layout.slots[0].h / 2 : H * 0.1;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.75);
    glow.addColorStop(0, rgba(theme.glow, light ? 0.16 : 0.26));
    glow.addColorStop(1, rgba(theme.glow, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }

  // ── espaços das fotos ──
  layout.slots.forEach((slot, i) => {
    const assigned = composition.slots?.[slot.id];
    const img = assigned ? imageFor(assigned.id) : null;
    ctx.save();
    shapePath(ctx, slot);
    ctx.clip();
    if (img) {
      drawPhoto(ctx, img, slot, assigned.fx, assigned.fy, assigned.zoom);
    } else {
      ctx.fillStyle = theme.surface;
      ctx.fillRect(slot.x, slot.y, slot.w, slot.h);
      if (placeholders) {
        // Na Capa o espaço é a imagem inteira e o texto ocupa o fundo: o
        // marcador vai para a zona da foto, acima do texto, para não ficar
        // atrás do tempo.
        const s = composition.template === 'capa' ? Math.min(slot.w, slot.h) * 0.7 : Math.min(slot.w, slot.h);
        const px = slot.x + slot.w / 2;
        const py = composition.template === 'capa' ? H * 0.24 : slot.y + slot.h / 2;
        ctx.fillStyle = theme.faint;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `300 ${Math.round(s * 0.22)}px ${FONT}`;
        ctx.fillText('+', px, py - s * 0.06);
        ctx.font = `700 ${Math.round(Math.max(22, s * 0.075))}px ${FONT}`;
        ctx.fillText(`Espaço ${i + 1}`, px, py + s * 0.12);
      }
    }
    ctx.restore();
    if (slot.shape === 'circle') {
      ctx.save();
      ctx.shadowColor = rgba(theme.glow, 0.55);
      ctx.shadowBlur = W * 0.05;
      ctx.lineWidth = W * 0.012;
      ctx.strokeStyle = theme.accent;
      shapePath(ctx, slot);
      ctx.stroke();
      ctx.restore();
    }
  });

  if (layout.scrim) {
    const g = ctx.createLinearGradient(0, layout.scrim.from, 0, layout.scrim.to);
    g.addColorStop(0, rgba(theme.scrim, 0));
    g.addColorStop(0.55, rgba(theme.scrim, 0.86));
    g.addColorStop(1, rgba(theme.scrim, 1));
    ctx.fillStyle = g;
    ctx.fillRect(0, layout.scrim.from, W, layout.scrim.to - layout.scrim.from);
    if (brand.top) {
      const t = ctx.createLinearGradient(0, 0, 0, H * 0.16);
      t.addColorStop(0, 'rgba(0,0,0,.38)');
      t.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = t;
      ctx.fillRect(0, 0, W, H * 0.16);
    }
  }

  // ── texto e grafismos ──
  const big = composition.template === 'capa' || composition.template === 'numeros';
  const center = zone.align === 'center';
  const tx = center ? zone.x + zone.w / 2 : zone.x;
  const gapOf = (s) => W * 0.022 * s;
  const eyebrowSize = (s) => Math.round(W * 0.024 * s);
  const nameSize = (s) => Math.round(W * (big ? 0.085 : 0.07) * s);
  const nameLines = (s) => { ctx.font = `900 ${nameSize(s)}px ${FONT}`; return wrapLines(ctx, data.name, zone.w, 2); };
  const timeSize = (s) => Math.round(W * (composition.template === 'numeros' ? 0.26 : big ? 0.2 : 0.15) * s);
  const statValue = (s) => Math.round(W * 0.042 * s);
  const statLabel = (s) => Math.round(W * 0.02 * s);
  const classSize = (s) => Math.round(W * 0.03 * s);
  const chartH = (s) => W * (big ? 0.12 : 0.09) * s;
  const chipH = (s) => W * 0.05 * s;
  const chipFont = (s) => Math.round(W * 0.021 * s);
  const cellH = (s) => W * 0.088 * s;
  const cardPad = (s) => W * 0.024 * s;

  const chipRows = (s) => {
    ctx.font = `800 ${chipFont(s)}px ${FONT}`;
    const rows = [[]];
    let rowW = 0;
    data.achievements.forEach((name) => {
      const w = ctx.measureText(name.toUpperCase()).width + chipH(s) * 0.9;
      if (rowW && rowW + w > zone.w) { rows.push([]); rowW = 0; }
      rows[rows.length - 1].push({ name, w });
      rowW += w + 10 * s;
    });
    return rows.filter((r) => r.length);
  };

  const blocks = [];
  if (wants('titulo')) blocks.push({ key: 'titulo', height: (s) => eyebrowSize(s) * 1.25 + 10 * s + nameLines(s).length * nameSize(s) * 1.06 + gapOf(s) });
  if (wants('tempo')) blocks.push({ key: 'tempo', height: (s) => timeSize(s) * 0.9 + gapOf(s) });
  if (wants('numeros')) blocks.push({ key: 'numeros', height: (s) => statLabel(s) * 1.4 + statValue(s) * 1.15 + gapOf(s) });
  if (wants('classificacao')) blocks.push({ key: 'classificacao', height: (s) => classSize(s) * 1.45 + gapOf(s) * 0.6 });
  if (wants('ritmo')) blocks.push({ key: 'ritmo', height: (s) => chartH(s) + statLabel(s) * 1.9 + gapOf(s) });
  if (wants('conquistas')) blocks.push({ key: 'conquistas', height: (s) => { const r = chipRows(s).length; return r * chipH(s) + (r - 1) * 10 * s + gapOf(s); } });
  if (wants('diploma')) blocks.push({ key: 'diploma', height: (s) => Math.ceil(data.diplomaCells.length / 3) * cellH(s) + 2 * cardPad(s) + gapOf(s) });

  const availableH = zone.bottom - zone.top;
  const plan = planBlocks(blocks, availableH);
  const s = plan.scale;
  const kept = blocks.filter((b) => plan.kept.includes(b.key));
  const totalH = kept.reduce((sum, b) => sum + b.height(s), 0) - (kept.length ? gapOf(s) : 0);
  let y = zone.anchor === 'bottom' ? zone.bottom - totalH
    : zone.anchor === 'center' ? zone.top + Math.max(0, (availableH - totalH) / 2)
      : zone.top;
  const blockTop = y;
  const darkOverPhoto = !light;

  ctx.textAlign = center ? 'center' : 'left';
  ctx.textBaseline = 'alphabetic';

  kept.forEach((b) => {
    if (b.key === 'titulo') {
      const es = eyebrowSize(s);
      ctx.font = `800 ${es}px ${FONT}`;
      ctx.fillStyle = theme.accent;
      if (!center) {
        ctx.fillRect(zone.x, y + es * 0.12, 6, es * 1.02);
        ctx.fillText(data.eyebrow, zone.x + 18, y + es);
      } else {
        ctx.fillText(data.eyebrow, tx, y + es);
      }
      y += es * 1.25 + 10 * s;
      const ns = nameSize(s);
      ctx.fillStyle = theme.text;
      nameLines(s).forEach((line) => {
        ctx.font = `900 ${ns}px ${FONT}`;
        y += ns * 1.06;
        ctx.fillText(line, tx, y - ns * 0.12);
      });
      y += gapOf(s);
    } else if (b.key === 'tempo') {
      const ts = timeSize(s);
      ctx.save();
      ctx.font = `900 ${ts}px ${FONT}`;
      ctx.fillStyle = theme.accent;
      if (darkOverPhoto) { ctx.shadowColor = rgba(theme.glow, 0.45); ctx.shadowBlur = W * 0.03; }
      ctx.fillText(data.time, tx, y + ts * 0.82);
      ctx.restore();
      y += ts * 0.9 + gapOf(s);
    } else if (b.key === 'numeros') {
      const items = [['Distância', data.distance], ['Ritmo', data.pace]].filter(([, v]) => v);
      const vs = statValue(s);
      const ls = statLabel(s);
      ctx.font = `800 ${vs}px ${FONT}`;
      const widths = items.map(([label, v]) => { ctx.font = `800 ${vs}px ${FONT}`; const a = ctx.measureText(v).width; ctx.font = `800 ${ls}px ${FONT}`; return Math.max(a, ctx.measureText(label.toUpperCase()).width); });
      const colGap = W * 0.05 * s;
      const groupW = widths.reduce((sum, w) => sum + w, 0) + colGap * (items.length - 1);
      let x = center ? zone.x + (zone.w - groupW) / 2 : zone.x;
      ctx.textAlign = 'left';
      items.forEach(([label, v], i) => {
        ctx.font = `800 ${ls}px ${FONT}`;
        ctx.fillStyle = theme.faint;
        ctx.fillText(label.toUpperCase(), x, y + ls);
        ctx.font = `800 ${vs}px ${FONT}`;
        ctx.fillStyle = theme.text;
        ctx.fillText(v, x, y + ls * 1.4 + vs * 0.95);
        x += widths[i] + colGap;
      });
      ctx.textAlign = center ? 'center' : 'left';
      y += ls * 1.4 + vs * 1.15 + gapOf(s);
    } else if (b.key === 'classificacao') {
      const cs = classSize(s);
      ctx.font = `700 ${cs}px ${FONT}`;
      ctx.fillStyle = theme.muted;
      ctx.fillText(data.classification, tx, y + cs);
      y += cs * 1.45 + gapOf(s) * 0.6;
    } else if (b.key === 'ritmo') {
      const ch = chartH(s);
      const pts = pacePoints(data.paces, zone.w - 12, ch - 12);
      ctx.save();
      ctx.translate(zone.x + 6, y + 6);
      ctx.lineWidth = W * 0.008 * s;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = theme.accent;
      if (!light) { ctx.shadowColor = rgba(theme.glow, 0.7); ctx.shadowBlur = W * 0.02; }
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      const last = pts[pts.length - 1];
      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(last.x, last.y, W * 0.009 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      const ls = statLabel(s);
      ctx.font = `800 ${ls}px ${FONT}`;
      ctx.fillStyle = theme.faint;
      ctx.fillText(`RITMO POR KM · MAIS RÁPIDO ${data.fastestPace}`, tx, y + ch + ls * 1.5);
      y += ch + ls * 1.9 + gapOf(s);
    } else if (b.key === 'conquistas') {
      const rows = chipRows(s);
      const h = chipH(s);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      rows.forEach((row) => {
        const rowW = row.reduce((sum, c) => sum + c.w, 0) + 10 * s * (row.length - 1);
        let x = center ? zone.x + (zone.w - rowW) / 2 : zone.x;
        row.forEach((chip) => {
          roundedRect(ctx, x, y, chip.w, h, h / 2);
          ctx.lineWidth = Math.max(2, W * 0.003);
          ctx.strokeStyle = theme.accent;
          ctx.stroke();
          ctx.font = `800 ${chipFont(s)}px ${FONT}`;
          ctx.fillStyle = theme.accent;
          ctx.fillText(chip.name.toUpperCase(), x + chip.w / 2, y + h / 2 + 1);
          x += chip.w + 10 * s;
        });
        y += h + 10 * s;
      });
      ctx.restore();
      y += gapOf(s) - 10 * s;
    } else if (b.key === 'diploma') {
      const cells = data.diplomaCells;
      const rows = Math.ceil(cells.length / 3);
      const cp = cardPad(s);
      const hh = rows * cellH(s) + 2 * cp;
      ctx.save();
      roundedRect(ctx, zone.x, y, zone.w, hh, W * 0.025);
      ctx.fillStyle = light ? 'rgba(17,24,39,.05)' : 'rgba(255,255,255,.07)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(theme.glow, 0.35);
      ctx.stroke();
      ctx.textAlign = 'left';
      const colW = (zone.w - 2 * cp) / 3;
      cells.forEach((cell, i) => {
        const cx = zone.x + cp + (i % 3) * colW;
        const cy = y + cp + Math.floor(i / 3) * cellH(s);
        ctx.font = `800 ${statLabel(s)}px ${FONT}`;
        ctx.fillStyle = theme.faint;
        ctx.fillText(cell.label.toUpperCase(), cx, cy + statLabel(s));
        ctx.font = `800 ${Math.round(W * 0.036 * s)}px ${FONT}`;
        ctx.fillStyle = theme.text;
        ctx.fillText(cell.value, cx, cy + statLabel(s) * 1.35 + W * 0.034 * s);
      });
      ctx.restore();
      y += hh + gapOf(s);
    }
  });

  // ── medalhão ──
  const medal = imageFor('medal');
  if (wants('medalhao') && medal) {
    const size = W * 0.19;
    const box = {
      x: center ? W / 2 - size / 2 : W - pad - size,
      y: Math.max(pad + (brand.top ? brand.h + 20 : 0), blockTop - size - W * 0.025),
      w: size, h: size, shape: 'circle',
    };
    ctx.save();
    shapePath(ctx, box);
    ctx.clip();
    drawPhoto(ctx, medal, box, 0.5, 0.5);
    ctx.restore();
    ctx.save();
    ctx.shadowColor = rgba(theme.glow, 0.5);
    ctx.shadowBlur = W * 0.03;
    ctx.lineWidth = W * 0.009;
    ctx.strokeStyle = theme.accent;
    shapePath(ctx, box);
    ctx.stroke();
    ctx.restore();
  }

  // ── marca, sempre ──
  const overPhoto = brand.top && (composition.template === 'capa' || composition.template.startsWith('mosaico'));
  const size = brand.size;
  const label = 'IronCoach';
  ctx.save();
  ctx.font = `800 ${Math.round(size * 0.56)}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = overPhoto ? '#ffffff' : theme.text;
  ctx.globalAlpha = 0.94;
  if (overPhoto) { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = size * 0.4; }
  const cy = brand.y + size / 2;
  if (brand.left) {
    if (logo) ctx.drawImage(logo, brand.x, brand.y, size, size);
    ctx.textAlign = 'left';
    ctx.fillText(label, brand.x + (logo ? size * 1.25 : 0), cy);
  } else {
    const logoX = W - pad - size;
    if (logo) ctx.drawImage(logo, logoX, brand.y, size, size);
    ctx.textAlign = 'right';
    ctx.fillText(label, logo ? logoX - size * 0.25 : W - pad, cy);
  }
  ctx.restore();

  return { dropped: plan.dropped, layout };
}

/** A imagem final (ou a pré-visualização, com `scale` < 1). */
export function renderMuralStudio(options) {
  const canvas = document.createElement('canvas');
  const { dropped } = drawMuralStudio(canvas, options);
  return { canvas, dropped };
}
