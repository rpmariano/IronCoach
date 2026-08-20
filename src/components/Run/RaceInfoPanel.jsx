import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import { useToast } from '../shared/ToastProvider';
import Button from '../shared/Button';
import { Sparkles, RefreshCw } from 'lucide-react';
import RaceWebInfoSections from './RaceWebInfoSections';

// Secção "Informação da Prova" dentro do cartão expandido (RaceCard) — botão
// para pedir ao Gemini que leia o site oficial (ev.website) e extraia
// horários, documentos necessários, informação por escalão, equipamento e
// deslocação, e (quando o site descrever o trajeto com detalhe) um esquema
// aproximado do percurso. Pedido explícito do atleta (nunca automático) —
// ver enrich-race-event. Esta prova já está gravada, por isso o resultado
// persiste logo em race_events.web_info (modo race_event_id da função); o
// equivalente no formulário de criação/edição fica em RunAgenda.jsx, que usa
// o modo por website porque a prova pode ainda não ter id.
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
        // Pode ler várias páginas do site (principal + até 4 sub-páginas em
        // paralelo) antes de chamar o Gemini — folga generosa para o pior
        // caso sem deixar um pedido preso indefinidamente.
        90000,
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

      <RaceWebInfoSections info={info} />
    </div>
  );
}
