import React, { useState } from 'react';
import { Flag, Users, Lock, Megaphone, ExternalLink } from 'lucide-react';
import PremiumModal from '../../shared/PremiumModal';
import Button from '../../shared/Button';
import { setEditionStatus, closeEdition } from '../../../utils/cupAdmin';
import { StatusBadge } from './index';
import RoundsPanel from './RoundsPanel';
import TeamsPanel from './TeamsPanel';

const SUB_TABS = [
  { key: 'jornadas', label: 'Jornadas', icon: Flag },
  { key: 'clubes', label: 'Clubes', icon: Users },
];

/* Cabeçalho da edição (competição, edição, época, estado) + as ações de
   estado (§6.1: "Publicar edição", "Fechar edição" com confirmação) + os
   separadores internos Jornadas/Clubes. */
export default function EditionDetail({ edition, competition, onEditionChanged }) {
  const [subTab, setSubTab] = useState('jornadas');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState(null);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const handlePublish = async () => {
    setPublishing(true);
    setPublishError(null);
    const res = await setEditionStatus(edition.id, 'aberta');
    setPublishing(false);
    if (!res.ok) { setPublishError(res.error?.message || 'Falha ao publicar a edição.'); return; }
    onEditionChanged?.(res.data);
  };

  const handleClose = async () => {
    setClosing(true);
    setCloseError(null);
    const res = await closeEdition(edition.id);
    setClosing(false);
    if (!res.ok) { setCloseError(res.error?.message || 'Falha ao fechar a edição.'); return; }
    setConfirmClose(false);
    onEditionChanged?.({ ...edition, status: 'encerrada', closed_at: res.data?.closed_at || new Date().toISOString() });
  };

  const isClosed = edition.status === 'encerrada';

  return (
    <div className="space-y-4">
      <div className="card rounded-2xl p-4 bg-[var(--surface-glass)] border border-[var(--border-glass)] space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{competition?.name}</p>
            <p className="text-[11px] text-[var(--text-3)]">{edition.edition_no}.ª edição · {edition.season_label}</p>
          </div>
          <StatusBadge status={edition.status} />
        </div>

        {(edition.regulation_url || edition.standings_url || edition.entry_url) && (
          <div className="flex flex-wrap gap-3 text-[11px]">
            {edition.regulation_url && (
              <a href={edition.regulation_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[var(--run)]">
                <ExternalLink size={11} /> Regulamento
              </a>
            )}
            {edition.standings_url && (
              <a href={edition.standings_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[var(--run)]">
                <ExternalLink size={11} /> Classificação
              </a>
            )}
            {edition.entry_url && (
              <a href={edition.entry_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[var(--run)]">
                <ExternalLink size={11} /> Inscrições
              </a>
            )}
          </div>
        )}

        {edition.status === 'por_anunciar' && (
          <div className="space-y-1.5">
            <Button variant="module" moduleColor="var(--grad-race)" size="sm" onClick={handlePublish} disabled={publishing}
              icon={publishing ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Megaphone size={14} />}>
              {publishing ? 'A publicar…' : 'Publicar edição'}
            </Button>
            {publishError && <p className="text-[11px] text-[var(--danger)]">{publishError}</p>}
          </div>
        )}

        {edition.status === 'aberta' && (
          <div className="space-y-1.5">
            <Button variant="danger-outline" size="sm" onClick={() => setConfirmClose(true)} icon={<Lock size={14} />}>
              Fechar edição
            </Button>
          </div>
        )}

        {isClosed && edition.closed_at && (
          <p className="text-[11px] text-[var(--text-3)]">Encerrada a {new Date(edition.closed_at).toLocaleDateString('pt-PT')}.</p>
        )}
      </div>

      <div className="flex gap-2">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 min-h-[44px] border border-[var(--border-glass-strong)] rounded-xl py-2 text-xs font-semibold transition ${
              subTab === t.key ? 'bg-[var(--surface-strong)] text-[var(--text-1)]' : 'text-[var(--text-3)]'
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {subTab === 'jornadas' && (
        <RoundsPanel edition={edition} competition={competition} readOnly={isClosed} />
      )}
      {subTab === 'clubes' && (
        <TeamsPanel edition={edition} readOnly={isClosed} />
      )}

      {confirmClose && (
        <PremiumModal
          isOpen={confirmClose}
          onClose={() => !closing && setConfirmClose(false)}
          title="Fechar edição"
          subtitle={`${competition?.short_name} · ${edition.edition_no}.ª edição`}
          icon={Lock}
          theme="danger"
          variant="dialog"
          maxWidth="max-w-sm"
        >
          <div className="p-6 space-y-4 bg-[var(--bg-sheet)] text-[var(--text-2)]">
            <p className="text-xs leading-relaxed">
              Isto marca a edição como <strong>encerrada</strong>, passa as inscrições ativas a
              concluídas, grava o resumo da época de cada uma e apaga os dorsais e os dados de
              correspondência com a classificação oficial. Não há volta atrás.
            </p>
            {closeError && <p className="text-[11px] text-[var(--danger)]">{closeError}</p>}
            <div className="flex gap-2 pt-1">
              <Button variant="light" className="flex-1" onClick={() => setConfirmClose(false)} disabled={closing}>
                Cancelar
              </Button>
              <Button variant="danger" className="flex-1" onClick={handleClose} disabled={closing}
                icon={closing ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Lock size={16} />}>
                {closing ? 'A fechar…' : 'Fechar edição'}
              </Button>
            </div>
          </div>
        </PremiumModal>
      )}
    </div>
  );
}
