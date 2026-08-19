import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import { useToast } from '../shared/ToastProvider';
import Button from '../shared/Button';
import { Sparkles, Clock, Shirt, Car, Route, AlertTriangle, RefreshCw } from 'lucide-react';
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

// Secção "Informação da Prova" dentro do cartão expandido (RaceCard) — botão
// para pedir ao Gemini que leia o site oficial (ev.website) e extraia
// horários, informação por escalão, equipamento e deslocação, e (quando o
// site descrever o trajeto com detalhe) um esquema aproximado do percurso.
// Pedido explícito do atleta (nunca automático) — ver enrich-race-event.
export default function RaceInfoPanel({ ev }) {
  const { raceEvents, setRaceEvents } = useAppStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  if (!ev.website) return null;

  const info = ev.web_info || null;

  const handleFetch = async (e) => {
    e.stopPropagation();
    setLoading(true);
    try {
      const { data, error } = await invokeEdgeFunctionWithTimeout(
        'enrich-race-event',
        { body: { race_event_id: ev.id } },
        50000,
      );
      if (error) {
        showToast(typeof error === 'string' ? error : 'Não consegui obter informação deste site.', 'error');
        return;
      }
      if (data?.race_event) {
        setRaceEvents(raceEvents.map((r) => (r.id === ev.id ? data.race_event : r)));
        showToast('Informação da prova atualizada.', 'success');
      } else if (data?.message) {
        showToast(data.message, 'error');
      }
    } catch (err) {
      console.error('Erro a obter informação da prova:', err);
      showToast('Não consegui obter informação deste site.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2.5 pt-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          Informação da Prova
        </span>
        <Button
          variant="module"
          moduleColor="var(--mod-prova)"
          size="sm"
          isLoading={loading}
          onClick={handleFetch}
          icon={info ? <RefreshCw size={12} /> : <Sparkles size={12} />}
        >
          {info ? 'Atualizar' : 'Obter do site'}
        </Button>
      </div>

      {info && (
        <div className="space-y-3 fade-in">
          {info.schedule && info.schedule.length > 0 && (
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Clock size={11} /> Horários
              </span>
              {info.schedule.map((s, i) => (
                <p key={i} className="text-[11px] text-slate-600">
                  <span className="font-semibold text-slate-700">{s.label}:</span> {s.when}
                </p>
              ))}
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
      )}
    </div>
  );
}
