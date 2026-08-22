import React from 'react';
import { Clock, FileText, Shirt, Car, Route, AlertTriangle, MapPin, Calendar, Award } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import RaceRouteDiagram from './RaceRouteDiagram';

function formatFetchedAt(iso) {
  if (!iso) return '';
  try {
    return format(parseISO(iso), "d MMM yyyy 'às' HH:mm", { locale: pt });
  } catch {
    return '';
  }
}

// Rendering estruturado e elegante de `web_info` (extraído do site oficial).
// Suporta variant="dark" (modo AAA para o Hub) e variant="light" (para cartões claros).
export default function RaceWebInfoSections({ info, variant = 'dark' }) {
  if (!info) return null;

  const isDark = variant === 'dark';

  const cardClass = isDark
    ? 'p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] space-y-2'
    : 'p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2';

  const titleClass = isDark
    ? 'text-[11px] font-extrabold text-amber-400 uppercase tracking-wider flex items-center gap-1.5'
    : 'text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5';

  const textClass = isDark
    ? 'text-xs text-slate-200 leading-relaxed'
    : 'text-[11px] text-slate-600 leading-relaxed';

  const subItemClass = isDark
    ? 'p-2.5 rounded-xl bg-black/25 border border-white/5 space-y-1'
    : 'p-2 rounded-lg bg-white border border-slate-200/60 space-y-0.5';

  return (
    <div className="space-y-3.5 fade-in">
      {/* ─── 1. Horários ─────────────────────────────────────────────────── */}
      {info.schedule && info.schedule.length > 0 && (
        <div className={cardClass}>
          <span className={titleClass}>
            <Clock size={13} className="text-amber-400" /> Horários & Partidas
          </span>
          <div className="space-y-2 pt-1">
            {info.schedule.map((s, i) => (
              <div key={i} className={subItemClass}>
                <p className="text-xs font-bold text-slate-100">
                  {s.label}
                </p>
                {s.when && (
                  <p className="text-[11px] text-amber-300 font-semibold flex items-center gap-1.5">
                    <Calendar size={11} className="shrink-0 text-amber-400" />
                    {s.when}
                  </p>
                )}
                {s.where && (
                  <p className="text-[11px] text-slate-300 flex items-center gap-1.5">
                    <MapPin size={11} className="shrink-0 text-slate-400" />
                    {s.where}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── 2. Documentos Necessários ───────────────────────────────────── */}
      {info.required_documents && (
        <div className={cardClass}>
          <span className={titleClass}>
            <FileText size={13} className="text-amber-400" /> Documentos Necessários
          </span>
          <div className={subItemClass}>
            <p className={textClass}>{info.required_documents}</p>
          </div>
        </div>
      )}

      {/* ─── 3. Informação por Escalão ───────────────────────────────────── */}
      {info.category_info && (
        <div className={cardClass}>
          <span className={titleClass}>
            <Award size={13} className="text-amber-400" /> Para o Teu Escalão
          </span>
          <div className={subItemClass}>
            <p className={textClass}>{info.category_info}</p>
          </div>
        </div>
      )}

      {/* ─── 4. Equipamento Recomendado / Obrigatório ─────────────────────── */}
      {info.gear_recommendations && (
        <div className={cardClass}>
          <span className={titleClass}>
            <Shirt size={13} className="text-amber-400" /> Equipamento
          </span>
          <div className={subItemClass}>
            <p className={textClass}>{info.gear_recommendations}</p>
          </div>
        </div>
      )}

      {/* ─── 5. Deslocação & Logística ───────────────────────────────────── */}
      {info.logistics && (
        <div className={cardClass}>
          <span className={titleClass}>
            <Car size={13} className="text-amber-400" /> Deslocação & Acessos
          </span>
          <div className={subItemClass}>
            <p className={textClass}>{info.logistics}</p>
          </div>
        </div>
      )}

      {/* ─── 6. Percurso & Altimetria ────────────────────────────────────── */}
      {(info.route_summary || info.route_segments) && (
        <div className={cardClass}>
          <span className={titleClass}>
            <Route size={13} className="text-amber-400" /> Percurso & Altimetria
          </span>
          {info.route_summary && (
            <div className={subItemClass}>
              <p className={textClass}>{info.route_summary}</p>
            </div>
          )}
          <RaceRouteDiagram segments={info.route_segments} />
        </div>
      )}

      {/* ─── 7. Avisos / Regulamento ─────────────────────────────────────── */}
      {info.caveats && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
          <AlertTriangle size={13} className="shrink-0 mt-0.5 text-amber-400" />
          <p className="text-xs text-amber-200 font-medium leading-relaxed">
            {info.caveats}
          </p>
        </div>
      )}

      <p className="text-[10px] text-slate-400 pt-1">
        Obtido de <span className="text-slate-300 font-medium">{info.source_url}</span> · {formatFetchedAt(info.fetched_at)}
      </p>
    </div>
  );
}
