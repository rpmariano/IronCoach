import React, { useState } from 'react';
import { Flag, Users, Lock, Megaphone, ExternalLink, EyeOff, ListOrdered } from 'lucide-react';
import PremiumModal from '../../shared/PremiumModal';
import Button from '../../shared/Button';
import { setEditionStatus, closeEdition, closeEditionBlocker, editionTodayISO } from '../../../utils/cupAdmin';
import { StatusBadge } from './index';
import RoundsPanel from './RoundsPanel';
import TeamsPanel from './TeamsPanel';
import ClassificationPanel from './ClassificationPanel';

const SUB_TABS = [
  { key: 'jornadas', label: 'Jornadas', icon: Flag },
  { key: 'clubes', label: 'Clubes', icon: Users },
  { key: 'classificacao', label: 'Classificação', icon: ListOrdered },
];

/* Cabeçalho da edição (competição, edição, época, estado) + as ações de
   estado (§6.1: "Publicar edição", "Voltar a 'por anunciar'" e "Fechar
   edição", as duas últimas com confirmação) + os separadores internos
   Jornadas/Clubes/Classificação. Aberta ↔ Por anunciar alterna-se quantas
   vezes for preciso (pedido do dono, 2026-09-27); Encerrada não tem volta.

   A GUARDA DO FECHO (decisão do dono, 2026-09-27; Fase 4): "Fechar edição"
   fica desativado — com o porquê à vista e ligado ao botão — enquanto a
   edição não tiver jornadas, a última não tiver data ou ainda não tiver
   passado (closeEditionBlocker, a mesma regra do close_edition da M2; o
   servidor recusa na mesma, e o erro dele aparece no diálogo). As jornadas
   chegam do separador Jornadas (o que abre primeiro), a cada leitura dele.
   Classificação (§6.4, §7): o link da geral, a leitura automática, o estado
   do job, os clubes por ligar e o ensaio (ClassificationPanel). */
export default function EditionDetail({ edition, competition, onEditionChanged }) {
  const [subTab, setSubTab] = useState('jornadas');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState(null);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [unpublishError, setUnpublishError] = useState(null);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  // As jornadas, para a guarda do fecho (null = ainda por ler). Chegam do
  // separador Jornadas (o de abertura), a cada leitura dele — sem uma
  // leitura a mais só para isto.
  const [rounds, setRounds] = useState(null);

  const handlePublish = async () => {
    setPublishing(true);
    setPublishError(null);
    const res = await setEditionStatus(edition.id, 'aberta');
    setPublishing(false);
    if (!res.ok) { setPublishError(res.error?.message || 'Falha ao publicar a edição.'); return; }
    onEditionChanged?.(res.data);
  };

  // Voltar a esconder: as inscrições novas fecham (enroll_cup só aceita
  // 'aberta') e o convite some a quem não está inscrito; quem já está
  // inscrito continua com o Troféu (shouldShowCupDoor dá 'inscrito' fora de
  // 'encerrada'). Nada se apaga.
  const handleUnpublish = async () => {
    setUnpublishing(true);
    setUnpublishError(null);
    const res = await setEditionStatus(edition.id, 'por_anunciar');
    setUnpublishing(false);
    if (!res.ok) { setUnpublishError(res.error?.message || 'Falha ao voltar a "por anunciar".'); return; }
    setConfirmUnpublish(false);
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
  const roundLabel = competition?.round_label || 'Jornada';
  // Sem as jornadas lidas (a ler, ou a leitura falhou), o botão fica ativo:
  // o servidor tem a mesma guarda e diz o porquê no diálogo.
  const closeBlocker = rounds ? closeEditionBlocker(rounds, editionTodayISO(edition.time_zone), roundLabel) : null;

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
          <div className="flex flex-wrap gap-2">
            <Button variant="light" size="sm" onClick={() => { setUnpublishError(null); setConfirmUnpublish(true); }} icon={<EyeOff size={14} />}>
              Voltar a "por anunciar"
            </Button>
            <Button
              variant="danger-outline"
              size="sm"
              onClick={() => { setCloseError(null); setConfirmClose(true); }}
              icon={<Lock size={14} />}
              disabled={!!closeBlocker}
              aria-describedby={closeBlocker ? 'edition-close-blocker' : undefined}
              data-testid="edition-close"
            >
              Fechar edição
            </Button>
          </div>
        )}
        {edition.status === 'aberta' && closeBlocker && (
          <p id="edition-close-blocker" data-testid="edition-close-blocker" className="text-[11px] text-[var(--text-3)]">
            Ainda não dá para fechar: {closeBlocker}.
          </p>
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
        <RoundsPanel
          edition={edition}
          competition={competition}
          readOnly={isClosed}
          adapter={edition.results_source === 'adaptador' ? edition.results_adapter || null : null}
          onRoundsChanged={setRounds}
        />
      )}
      {subTab === 'clubes' && (
        <TeamsPanel edition={edition} readOnly={isClosed} />
      )}
      {subTab === 'classificacao' && (
        <ClassificationPanel edition={edition} readOnly={isClosed} onEditionChanged={onEditionChanged} />
      )}

      {confirmUnpublish && (
        <PremiumModal
          isOpen={confirmUnpublish}
          onClose={() => !unpublishing && setConfirmUnpublish(false)}
          title={'Voltar a "por anunciar"'}
          subtitle={`${competition?.short_name} · ${edition.edition_no}.ª edição`}
          icon={EyeOff}
          variant="dialog"
          maxWidth="max-w-sm"
        >
          <div className="p-6 space-y-4 bg-[var(--bg-sheet)] text-[var(--text-2)]">
            <p className="text-xs leading-relaxed">
              O convite deixa de aparecer a quem ainda não se inscreveu e as inscrições novas
              ficam fechadas. Quem já está inscrito continua a ver o Troféu, as jornadas e a
              Carol — nada se apaga. Quem sair entretanto só se volta a inscrever quando
              publicares de novo.
            </p>
            {unpublishError && <p className="text-[11px] text-[var(--danger)]">{unpublishError}</p>}
            <div className="flex gap-2 pt-1">
              <Button variant="light" className="flex-1" onClick={() => setConfirmUnpublish(false)} disabled={unpublishing}>
                Cancelar
              </Button>
              <Button variant="module" moduleColor="var(--grad-race)" className="flex-1" onClick={handleUnpublish} disabled={unpublishing}
                icon={unpublishing ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <EyeOff size={16} />}>
                {unpublishing ? 'A esconder…' : 'Voltar a "por anunciar"'}
              </Button>
            </div>
          </div>
        </PremiumModal>
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
            <p className="text-xs leading-relaxed">
              A classificação geral fica como estiver agora: fecha depois de a da última jornada estar estável (vê
              em Classificação).
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
