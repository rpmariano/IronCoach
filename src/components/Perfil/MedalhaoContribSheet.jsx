import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { useAppStore } from '../../store';
import { DateTile } from '../Run/RaceListCard';

/* O ecrã dos registos de um encaixe — o que está por trás de um número
   do Palmarés (pedido 2026-09-15, promovido de persiana a ecrã inteiro no
   mesmo dia: empilhava por cima da persiana do medalhão, que foi a origem
   do achado do Escape a fechar as duas de uma vez — closeStack em
   Sheet.jsx corrige isso, mas só entra em jogo quando há pilha; sem pilha
   aqui, não há nada a corrigir). Abre-se da legenda do medalhão herói e de
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

  // Esc fecha, como fechava a persiana (mesmo padrão do Mural/Memórias).
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!slot) return null;
  const list = slot.contributions || [];
  const titulo = [slot.label, slot.contributionsPeriodLabel].filter(Boolean).join(' · ');
  const eyebrow = medalhaoName ? `Palmarés · ${medalhaoName}` : 'Palmarés';

  const open = (c) => {
    // Quem abriu fecha o ecrã já — o de topo toma o lugar do separador e
    // não há saída animada para esperar.
    onNavigate?.();
    if (c.kind === 'race') setEditingRaceId(c.raceId);
    else {
      setEditingRunId(c.runId);
      setOpenCreationMode('run');
    }
  };

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${eyebrow} — ${titulo}`}
      data-testid={`medalhao-contrib-sheet-${slot.key}`}
      className="fixed inset-0 z-[80] flex flex-col fade-in"
      style={{ background: 'var(--bg-app)' }}
    >
      <div className="flex items-center gap-2.5 shrink-0" style={{ minHeight: 52, padding: '8px 14px', borderBottom: '1px solid var(--border-glass)' }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 44, height: 44, background: 'none', border: 'none', color: 'var(--text-3)' }}
        >
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--race)' }}>{eyebrow}</div>
          <div className="text-[14.5px] font-extrabold truncate" style={{ color: 'var(--text-1)' }}>{titulo}</div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar" style={{ padding: '0 18px calc(26px + env(safe-area-inset-bottom, 0px))' }}>
        {list.length === 0 ? (
          <p className="text-[12px] pt-3 pb-1 m-0" data-testid="medalhao-contrib-vazio" style={{ color: 'var(--text-3)' }}>
            Ainda não há registos para este encaixe.
          </p>
        ) : (
          <>
            {slot.contributionsSummary && (
              <p className="text-[12px] font-bold pt-3 m-0" data-testid="medalhao-contrib-resumo" style={{ color: 'var(--text-3)' }}>
                {slot.contributionsSummary}
              </p>
            )}
            <div className="flex flex-col mt-2 pb-1">
              {list.map((c, i) => <Row key={`${c.kind}-${c.id ?? i}`} contribution={c} onOpen={open} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
