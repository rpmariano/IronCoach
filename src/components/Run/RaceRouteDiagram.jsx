import React from 'react';
import { Info } from 'lucide-react';

// Esquema aproximado do percurso, construído a partir de indicações em texto
// encontradas no site da prova (nomes de troços, marcos de km, direções,
// subidas/descidas) — NÃO existem coordenadas GPS reais nesta app (sem GPX
// nem API de mapas), por isso isto nunca pretende ser um mapa geograficamente
// exato. Cada troço só desloca o traçado lateralmente (viragem) e muda de cor
// (perfil de altimetria) — a distância entre pontos no desenho não é à escala
// da distância real em km.

const STEP_Y = 34;
const OFFSET_X = 22;
const CENTER_X = 60;
const MARGIN_Y = 22;
const MIN_X = 22;
const MAX_X = 98;
const MAX_SEGMENTS = 30;
/* Largura da viewBox. O SVG desenha-se a 1:1 (width 100% mas altura fixa em
   px igual à da viewBox, com preserveAspectRatio meet → escala 1), por isso
   um user unit é um pixel e o tamanho da letra aqui é o tamanho real no
   ecrã. Os rótulos ("Partida", "Chegada", "12 km") estão a 11px — piso do
   ponto 2 do handoff — e o traçado continua entre MIN_X e MAX_X: o espaço
   extra até VIEW_W é margem para o texto, que é o que o handoff manda fazer
   quando um gráfico fica apertado (aumentar a margem, nunca encolher a
   letra). */
const VIEW_W = 180;
const LABEL_FONT = 11;

const ELEVATION_COLOR = {
  sobe: '#f97316',   // laranja — a subir
  desce: '#38bdf8',  // azul — a descer
  plano: 'var(--mod-prova)',
};

function buildPoints(segments) {
  let x = CENTER_X;
  const points = [{ x, y: MARGIN_Y }];
  segments.forEach((seg, i) => {
    if (seg.turn === 'esquerda') x -= OFFSET_X;
    else if (seg.turn === 'direita') x += OFFSET_X;
    x = Math.max(MIN_X, Math.min(MAX_X, x));
    points.push({ x, y: MARGIN_Y + (i + 1) * STEP_Y });
  });
  return points;
}

export default function RaceRouteDiagram({ segments }) {
  if (!segments || segments.length === 0) return null;
  const shown = segments.slice(0, MAX_SEGMENTS);
  const truncated = segments.length > MAX_SEGMENTS;
  const points = buildPoints(shown);
  const height = MARGIN_Y * 2 + shown.length * STEP_Y;

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
        <Info size={11} className="shrink-0" />
        Esquema aproximado reconstruído a partir da descrição do site — não é um mapa geograficamente exato.
      </p>

      <div className="rounded-xl border border-slate-200 bg-white/60 py-3 overflow-hidden">
        <svg viewBox={`0 0 ${VIEW_W} ${height}`} width="100%" height={height} preserveAspectRatio="xMidYMin meet" role="img" aria-label="Esquema do percurso da prova">
          {points.slice(0, -1).map((p, i) => {
            const next = points[i + 1];
            const color = ELEVATION_COLOR[shown[i]?.elevation] || ELEVATION_COLOR.plano;
            return (
              <line
                key={i}
                x1={p.x} y1={p.y} x2={next.x} y2={next.y}
                stroke={color} strokeWidth={3} strokeLinecap="round"
              />
            );
          })}
          {points.map((p, i) => {
            const isStart = i === 0;
            const isEnd = i === points.length - 1;
            const seg = shown[i - 1];
            return (
              <g key={i}>
                <circle
                  cx={p.x} cy={p.y}
                  r={isStart || isEnd ? 4 : 2.5}
                  fill={isStart ? '#22c55e' : isEnd ? 'var(--mod-prova)' : '#fff'}
                  stroke={isEnd ? 'var(--mod-prova)' : '#94a3b8'}
                  strokeWidth={1.5}
                />
                {isStart && <text x={p.x + 10} y={p.y + 4} fontSize={LABEL_FONT} fill="#64748b">Partida</text>}
                {isEnd && <text x={p.x + 10} y={p.y + 4} fontSize={LABEL_FONT} fill="#64748b">Chegada</text>}
                {!isStart && !isEnd && seg?.km_marker != null && (
                  <text x={p.x + 10} y={p.y + 4} fontSize={LABEL_FONT} fill="#94a3b8">{seg.km_marker} km</text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <ol className="space-y-1.5">
        {shown.map((seg, i) => (
          <li key={i} className="text-[11px] text-slate-600 flex gap-2">
            <span className="text-slate-400 shrink-0 tabular-nums w-10">
              {seg.km_marker != null ? `${seg.km_marker} km` : `#${i + 1}`}
            </span>
            <span>{seg.description}</span>
          </li>
        ))}
      </ol>
      {truncated && (
        <p className="text-[11px] text-slate-400">
          + {segments.length - MAX_SEGMENTS} troços não mostrados aqui.
        </p>
      )}
    </div>
  );
}
