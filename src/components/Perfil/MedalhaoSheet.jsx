import React from 'react';
import { Sheet } from '../shared/Sheet';
import { MedalSlotIcon, slotValueText } from '../shared/Medalhao';

/* A persiana de um medalhão (specs/palmares-medalhoes.md §"Persiana do
   medalhão", mock MedalhaoDetalhe). A regra do jogo fica à vista — a
   primeira medalha ganha-se com pouco, as seguintes só a bater o melhor — e
   cada encaixe diz exatamente o que tem ou o que falta.

   O "Histórico do medalhão" só aparece quando há re-cunhagens (um encaixe
   ganho mais de uma vez); ainda não navega para lado nenhum — a lista das
   re-cunhagens e dos anos arquivados vem com a tabela medal_awards. */

function SlotCard({ medalhaoKey, slot, first }) {
  const won = slot.state === 'won';
  const hasProgress = !won && slot.progress != null && Number.isFinite(Number(slot.progress));
  const pct = hasProgress ? Math.max(0, Math.min(1, Number(slot.progress))) * 100 : 0;
  const emptyLine = [slot.detail, slot.remainingLabel].filter(Boolean).join(' · ');

  return (
    <div
      data-testid={`medalhao-slot-${slot.key}`}
      data-state={won ? 'won' : 'empty'}
      className="flex items-center gap-3"
      style={{
        marginTop: first ? 14 : 8,
        padding: 12,
        borderRadius: 16,
        background: won ? 'rgba(251,191,36,.07)' : 'var(--surface-glass)',
        border: `1px solid ${won ? 'rgba(251,191,36,.22)' : 'var(--border-glass)'}`,
      }}
    >
      <MedalSlotIcon state={slot.state} enamel={slot.enamel} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-extrabold" style={{ color: won ? 'var(--text-1)' : 'var(--text-3)' }}>{slot.label}</span>
          {won ? (
            <span className="text-[15px] font-black" style={{ color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{slotValueText(medalhaoKey, slot) ?? ''}</span>
          ) : (
            slot.valueLabel && <span className="text-[12px] font-extrabold" style={{ color: 'var(--text-4)', fontVariantNumeric: 'tabular-nums' }}>{slot.valueLabel}</span>
          )}
        </div>
        {hasProgress && (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            aria-label={`${slot.label}: ${Math.round(pct)}%`}
            style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,.08)', marginTop: 7, overflow: 'hidden' }}
          >
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, #d97706, #fbbf24)' }} />
          </div>
        )}
        {won
          ? slot.detail && <div className="text-[11px] mt-[2px]" style={{ color: 'var(--text-4)' }}>{slot.detail}</div>
          : emptyLine && <div className="text-[11px]" style={{ marginTop: hasProgress ? 5 : 2, color: 'var(--text-4)' }}>{emptyLine}</div>}
      </div>
    </div>
  );
}

export default function MedalhaoSheet({ medalhao, onClose }) {
  if (!medalhao) return null;
  const slots = medalhao.slots || [];
  const recunhados = slots.filter((s) => Number(s.wins) > 1);
  const titulo = [medalhao.name, medalhao.year].filter((v) => v != null && v !== '').join(' · ');

  return (
    <Sheet
      eyebrow="Palmarés · medalhão"
      eyebrowTone="race"
      title={<h3 className="m-0 text-[20px] font-black" style={{ letterSpacing: '-.02em', color: 'var(--text-1)' }}>{titulo}</h3>}
      onClose={onClose}
      testId={`medalhao-sheet-${medalhao.key}`}
      maxHeight="88dvh"
    >
      {medalhao.rule && (
        <p className="text-[12px] leading-[1.5] pt-2 m-0" style={{ color: 'var(--text-3)' }}>{medalhao.rule}</p>
      )}

      <div className="pb-1">
        {slots.map((slot, i) => <SlotCard key={slot.key || i} medalhaoKey={medalhao.key} slot={slot} first={i === 0} />)}
      </div>

      {recunhados.length > 0 && (
        <div
          data-testid="medalhao-historico"
          className="flex items-center gap-2 text-[12px] font-bold"
          style={{ minHeight: 44, marginTop: 8, borderTop: '1px solid rgba(255,255,255,.08)', color: 'var(--text-3)' }}
        >
          Histórico do medalhão · {recunhados.map((s) => `${s.label} ganho ${s.wins}×`).join(' · ')}
        </div>
      )}
    </Sheet>
  );
}
