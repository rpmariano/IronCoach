import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useAppStore } from '../../store';
import { Sheet } from '../shared/Sheet';
import { DateTile } from '../Run/RaceListCard';

/* A persiana dos registos de um encaixe — o que está por trás de um número
   do Palmarés (pedido 2026-09-15). Abre-se da legenda do medalhão herói e de
   cada cartão de encaixe na persiana do medalhão: "Mês · agosto de 2026", a
   soma numa linha, e a lista dos registos que a fazem.

   Os registos vêm prontos em `slot.contributions` (utils/medalhoes.js) — aqui
   não se calcula nada. Cada linha abre o que já existe:
   - prova (ou corrida ligada a uma prova) → o hub da prova (setEditingRaceId);
   - corrida → o registo da corrida no ecrã de topo, a mesma entrada que o hub
     usa para reabrir um registo gravado (editingRunId + openCreationMode
     'run', App.jsx);
   - sessão de ginásio do plano → não abre nada: o plano não guarda qual foi a
     sessão gravada, e o Calendário edita-as com estado próprio.

   Linhas neutras, no vocabulário de "As tuas provas" (Run/RaceListCard.jsx):
   o quadrado da data, o nome, a linha de números, a seta. O âmbar é da prova
   e fica no rótulo do topo, como nas outras persianas do Palmarés. */

function isOpenable(c) {
  return (c.kind === 'race' && c.raceId != null) || (c.kind === 'run' && c.runId != null);
}

function Row({ contribution: c, onOpen }) {
  const openable = isOpenable(c);
  const content = (
    <>
      <DateTile date={c.date} muted={c.kind !== 'race'} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-extrabold truncate" style={{ color: 'var(--text-1)' }}>{c.title}</span>
        {c.meta && <span className="block text-[11.5px] mt-[2px] truncate" style={{ color: 'var(--text-4)' }}>{c.meta}</span>}
      </span>
      {openable && <ChevronRight size={15} aria-hidden="true" style={{ color: 'var(--text-4)', flexShrink: 0 }} />}
    </>
  );
  const style = { minHeight: 56, borderRadius: 16, padding: '6px 8px 6px 6px', background: 'none', border: 'none' };
  const testId = `medalhao-contrib-${c.kind}-${c.id}`;
  if (!openable) {
    return <div data-testid={testId} className="flex items-center gap-3 w-full" style={style}>{content}</div>;
  }
  return (
    <button type="button" data-testid={testId} onClick={() => onOpen(c)} className="flex items-center gap-3 w-full text-left" style={{ ...style, cursor: 'pointer' }}>
      {content}
    </button>
  );
}

export default function MedalhaoContribSheet({ medalhaoName, slot, onClose, onNavigate }) {
  const { setEditingRaceId, setEditingRunId, setOpenCreationMode } = useAppStore();
  if (!slot) return null;
  const list = slot.contributions || [];
  const titulo = [slot.label, slot.contributionsPeriodLabel].filter(Boolean).join(' · ');

  const open = (c) => {
    // Quem abriu fecha as persianas já — o ecrã de topo toma o lugar do
    // separador e não há saída animada para esperar.
    onNavigate?.();
    if (c.kind === 'race') setEditingRaceId(c.raceId);
    else {
      setEditingRunId(c.runId);
      setOpenCreationMode('run');
    }
  };

  return (
    <Sheet
      eyebrow={medalhaoName ? `Palmarés · ${medalhaoName}` : 'Palmarés'}
      eyebrowTone="race"
      title={<h3 className="m-0 text-[20px] font-black" style={{ letterSpacing: '-.02em', color: 'var(--text-1)' }}>{titulo}</h3>}
      onClose={onClose}
      testId={`medalhao-contrib-sheet-${slot.key}`}
      maxHeight="88dvh"
    >
      {list.length === 0 ? (
        <p className="text-[12px] pt-3 pb-1 m-0" data-testid="medalhao-contrib-vazio" style={{ color: 'var(--text-3)' }}>
          Ainda não há registos para este encaixe.
        </p>
      ) : (
        <>
          {slot.contributionsSummary && (
            <p className="text-[12px] font-bold pt-2 m-0" data-testid="medalhao-contrib-resumo" style={{ color: 'var(--text-3)' }}>
              {slot.contributionsSummary}
            </p>
          )}
          <div className="flex flex-col mt-2 pb-1">
            {list.map((c, i) => <Row key={`${c.kind}-${c.id ?? i}`} contribution={c} onOpen={open} />)}
          </div>
        </>
      )}
    </Sheet>
  );
}
