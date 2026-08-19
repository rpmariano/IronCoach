import React from 'react';
import { Clock, FileText, Shirt, Car, Route, AlertTriangle } from 'lucide-react';
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

// Rendering puro de um `web_info` (ver enrich-race-event) — partilhado entre
// RaceInfoPanel (prova já gravada, RaceCard) e RunAgenda (formulário de
// criação/edição, onde o resultado fica no rascunho até se gravar a prova).
export default function RaceWebInfoSections({ info }) {
  if (!info) return null;

  return (
    <div className="space-y-3 fade-in">
      {info.schedule && info.schedule.length > 0 && (
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Clock size={11} /> Horários
          </span>
          {info.schedule.map((s, i) => (
            <p key={i} className="text-[11px] text-slate-600">
              <span className="font-semibold text-slate-700">{s.label}:</span> {s.when}
              {s.where && <span className="text-slate-500"> — {s.where}</span>}
            </p>
          ))}
        </div>
      )}

      {info.required_documents && (
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <FileText size={11} /> Documentos necessários
          </span>
          <p className="text-[11px] text-slate-600">{info.required_documents}</p>
        </div>
      )}

      {info.category_info && (
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Para o teu escalão
          </span>
          <p className="text-[11px] text-slate-600">{info.category_info}</p>
        </div>
      )}

      {info.gear_recommendations && (
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Shirt size={11} /> Equipamento
          </span>
          <p className="text-[11px] text-slate-600">{info.gear_recommendations}</p>
        </div>
      )}

      {info.logistics && (
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Car size={11} /> Deslocação
          </span>
          <p className="text-[11px] text-slate-600">{info.logistics}</p>
        </div>
      )}

      {(info.route_summary || info.route_segments) && (
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Route size={11} /> Percurso
          </span>
          {info.route_summary && <p className="text-[11px] text-slate-600">{info.route_summary}</p>}
          <RaceRouteDiagram segments={info.route_segments} />
        </div>
      )}

      {info.caveats && (
        <p className="text-[10px] text-amber-600 flex items-start gap-1.5">
          <AlertTriangle size={11} className="shrink-0 mt-0.5" />
          {info.caveats}
        </p>
      )}

      <p className="text-[10px] text-slate-400">
        Obtido de {info.source_url} · {formatFetchedAt(info.fetched_at)}
      </p>
    </div>
  );
}
