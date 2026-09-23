import React, { useState, useRef } from 'react';
import { Bug, Send, Upload, X } from 'lucide-react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { currentPageLabel } from '../../lib/utils';
import { useToast } from './ToastProvider';
import PremiumModal from './PremiumModal';
import { Button } from './Button';

/* O botão arrasta-se (pedido 2026-09-23: tapava a caixa de texto do Coach).
   Ao largar encosta à margem mais perto e a posição fica neste telemóvel
   (localStorage — é uma preferência do aparelho, não da conta). Um toque
   sem arrastar abre o report como sempre; o teclado e o leitor de ecrã não
   mudam nada (a posição é só onde está, não o que faz). */
const POS_KEY = 'ironcoach_bug_button_pos';
const DRAG_THRESHOLD_PX = 6;
const EDGE_GAP_PX = 12;
const SIZE_PX = 36;
export const DEFAULT_BUG_BUTTON_POS = { side: 'left', bottom: 96 };

function readPos() {
  try {
    const p = JSON.parse(window.localStorage.getItem(POS_KEY) || 'null');
    if (p && (p.side === 'left' || p.side === 'right') && Number.isFinite(p.bottom)) return p;
  } catch { /* sem armazenamento: posição de sempre */ }
  return DEFAULT_BUG_BUTTON_POS;
}

function savePos(p) {
  try { window.localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* fica só nesta visita */ }
}

// Entre o cabeçalho e a barra de baixo: nunca por cima de nenhum dos dois.
export function clampBottom(bottom, viewportH) {
  const min = 84; // acima da barra de baixo (76px) com folga
  const max = Math.max(min, viewportH - 85 - SIZE_PX - 8); // abaixo do cabeçalho (85px)
  return Math.min(max, Math.max(min, bottom));
}

/**
 * Botão discreto (presente em todos os ecrãs via Layout) que permite ao
 * atleta reportar um problema — descrição + ficheiros (imagens/vídeos) +
 * data/hora/utilizador/página são gravados automaticamente em bug_reports.
 */
export default function ReportIssueButton() {
  const { session, profile, activeTab, openCreationMode, editingRaceId } = useAppStore();
  const { showToast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [pos, setPos] = useState(readPos);
  const [dragXY, setDragXY] = useState(null); // {x, y} do canto sup. esq. a meio do arrasto
  const drag = useRef(null);
  const draggedAt = useRef(0);

  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { startX: e.clientX, startY: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    const vw = window.innerWidth, vh = window.innerHeight;
    setDragXY({
      x: Math.min(vw - SIZE_PX, Math.max(0, e.clientX - d.offX)),
      y: Math.min(vh - SIZE_PX, Math.max(0, e.clientY - d.offY)),
    });
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const x = e.clientX - d.offX, y = e.clientY - d.offY;
    // A coluna da app é max-w-md centrada: a margem é a do ecrã, que num
    // telemóvel é a mesma coisa.
    const next = {
      side: x + SIZE_PX / 2 < vw / 2 ? 'left' : 'right',
      bottom: Math.round(clampBottom(vh - y - SIZE_PX, vh)),
    };
    setDragXY(null);
    setPos(next);
    savePos(next);
    draggedAt.current = Date.now();
  };

  const handleOpen = () => {
    // O click que o browser dispara no fim de um arrasto não abre o report
    // (por tempo, não por bandeira: se o click não vier, o toque seguinte
    // não pode ficar engolido).
    if (Date.now() - draggedAt.current < 400) return;
    setIsOpen(true);
  };

  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const placement = dragXY
    ? { left: dragXY.x, top: dragXY.y }
    : { [pos.side]: EDGE_GAP_PX, bottom: clampBottom(pos.bottom, viewportH) };

  const handleClose = () => {
    if (submitting) return;
    setIsOpen(false);
    setTitle('');
    setDescription('');
    setFiles([]);
    setUploadProgress(0);
  };

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'video/mp4', 'video/webm'];

    const filtered = selectedFiles.filter(file => {
      if (!validTypes.includes(file.type)) {
        showToast(`Tipo de ficheiro não suportado: ${file.type}`, 'error');
        return false;
      }
      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        showToast(`Ficheiro demasiado grande: ${file.name} (máx. 50MB)`, 'error');
        return false;
      }
      return true;
    });

    if (files.length + filtered.length > 5) {
      showToast('Máximo 5 ficheiros por report', 'error');
      return;
    }

    setFiles([...files, ...filtered]);
  };

  const handleRemoveFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    const trimmed = description.trim();
    if (!trimmedTitle) {
      showToast('Dá um título ao problema antes de enviar.', 'error');
      return;
    }
    if (!trimmed) {
      showToast('Descreve o problema antes de enviar.', 'error');
      return;
    }
    const userId = session?.user?.id;
    if (!userId) {
      showToast('Sessão inválida — inicia sessão novamente para reportar.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      // Guarda os CAMINHOS no storage, não URLs públicos — o bucket
      // 'bug-report-photos' é privado de propósito (pode conter dados
      // pessoais do atleta), por isso um getPublicUrl nunca serviria o
      // ficheiro. Quem vai ver o anexo (Admin) gera uma signed URL a
      // partir deste caminho no momento em que abre o report.
      const attachmentPaths = [];
      let failedUploads = 0;

      // Upload ficheiros se existirem.
      //
      // Uma falha a anexar NÃO cancela o report: quem está a reportar já
      // tropeçou num problema e escreveu a descrição — perder tudo isso
      // porque o anexo não subiu é o pior desfecho possível. Guarda-se o
      // report na mesma e avisa-se que os anexos ficaram por enviar.
      if (files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${file.name}`;
          // A política de storage exige que a primeira pasta do caminho
          // seja o id do utilizador (ver migração 20260822180000_bug_reports.sql,
          // "authenticated insert own bug report photos") — um prefixo
          // extra antes do userId faz o upload falhar por RLS.
          const filePath = `${userId}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('bug-report-photos')
            .upload(filePath, file);

          if (uploadError) {
            console.error(`[ReportIssueButton] Falha ao anexar ${file.name}:`, uploadError);
            failedUploads++;
          } else {
            attachmentPaths.push(filePath);
          }

          setUploadProgress(Math.round(((i + 1) / files.length) * 100));
        }
      }

      const { error } = await supabase.from('bug_reports').insert({
        user_id: userId,
        user_email: session?.user?.email || null,
        user_name: profile?.full_name || null,
        title: trimmedTitle,
        description: trimmed,
        page: currentPageLabel({ activeTab, openCreationMode, editingRaceId }),
        user_agent: navigator.userAgent,
        attachment_urls: attachmentPaths.length > 0 ? attachmentPaths : null,
      });
      if (error) throw error;

      showToast(
        failedUploads > 0
          ? `Report enviado, mas ${failedUploads} ficheiro(s) não foram anexados.`
          : 'Obrigado! O teu report foi enviado à equipa.',
        failedUploads > 0 ? 'info' : 'success',
      );
      setIsOpen(false);
      setTitle('');
      setDescription('');
      setFiles([]);
      setUploadProgress(0);
    } catch (err) {
      // Mostrar o motivo real em vez de um "tenta novamente" genérico: sem
      // isto, uma falha de RLS/rede é indistinguível de qualquer outra e
      // não há como reportar o que correu mal.
      console.error('[ReportIssueButton] Falha ao submeter report:', err);
      const detail = err?.message || 'erro desconhecido';
      showToast(`Não foi possível enviar o report: ${detail}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={handleOpen}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; setDragXY(null); }}
        aria-label="Reportar um problema"
        title="Reportar um problema (arrasta para mudar de sítio)"
        data-testid="report-issue-button"
        // touch-action none: arrastar o botão não faz scroll ao ecrã.
        // Sem transition durante o arrasto, senão o botão ficava atrás do dedo.
        className={`hide-when-keyboard tap-44 fixed z-30 w-9 h-9 rounded-full flex items-center justify-center bg-[var(--surface-strong)] backdrop-blur-xl border border-[var(--border-glass)] text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-white/20 shadow-[0_2px_10px_rgba(0,0,0,0.25)] ${dragXY ? 'scale-110 cursor-grabbing' : 'active:scale-95 transition'}`}
        style={{ ...placement, touchAction: 'none' }}
      >
        <Bug size={15} />
      </button>

      <PremiumModal
        isOpen={isOpen}
        onClose={handleClose}
        title="Reportar um problema"
        subtitle={currentPageLabel({ activeTab, openCreationMode, editingRaceId })}
        icon={Bug}
        theme="warning"
        variant="dialog"
        maxWidth="max-w-lg"
      >
        <div className="p-6 space-y-4 bg-[var(--bg-sheet)] text-[var(--text-2)]">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text-3)]">Título <span className="text-[var(--danger)]">*</span></label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Resume o problema numa frase curta..."
              maxLength={80}
              className="w-full min-h-[44px] bg-[var(--bg-app)] border border-[var(--border-glass-strong)] rounded-xl py-2.5 px-3 text-xs text-[var(--text-2)] outline-none"
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text-3)]">O que aconteceu?</label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreve o problema — o que fizeste e o que esperavas que acontecesse..."
              className="w-full bg-[var(--bg-app)] border border-[var(--border-glass-strong)] rounded-xl py-2.5 px-3 text-xs text-[var(--text-2)] outline-none resize-none"
              disabled={submitting}
            />
          </div>

          {/* File Upload Section */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[var(--text-3)]">
              Adicionar imagens ou vídeos (opcional)
            </label>
            <label className="flex flex-col items-center justify-center gap-2 w-full bg-[var(--bg-app)] border-2 border-dashed border-[var(--border-glass-strong)] rounded-xl py-6 px-3 cursor-pointer hover:border-[var(--border-control)] transition">
              <Upload size={18} className="text-[var(--text-3)]" />
              <span className="text-xs text-[var(--text-3)]">Clica para selecionar ficheiros</span>
              <span className="text-[11px] text-[var(--text-3)]">PNG, JPG, GIF, MP4, WebM (máx. 50MB cada)</span>
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/gif,video/mp4,video/webm"
                onChange={handleFileSelect}
                disabled={submitting}
                className="hidden"
              />
            </label>

            {/* File Preview */}
            {files.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-[var(--text-3)]">{files.length} ficheiro(s) selecionado(s)</div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between bg-[var(--bg-app)] border border-[var(--border-glass-strong)] rounded-lg p-2.5 text-xs"
                    >
                      <span className="truncate text-[var(--text-3)]">{file.name}</span>
                      <button
                        onClick={() => handleRemoveFile(index)}
                        disabled={submitting}
                        aria-label={`Remover ${file.name}`}
                        className="tap-44 shrink-0 text-[var(--text-3)] hover:text-[var(--danger)] disabled:opacity-50"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload Progress */}
            {submitting && uploadProgress > 0 && uploadProgress < 100 && (
              <div className="w-full bg-[var(--bg-app)] rounded-lg overflow-hidden border border-[var(--border-glass-strong)]">
                <div
                  className="h-1.5 bg-[var(--run)] transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="light" onClick={handleClose} disabled={submitting} className="flex-1">
              Cancelar
            </Button>
            <Button
              variant="module"
              moduleColor="var(--mod-coach-to)"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1"
              icon={submitting ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Send size={15} />}
            >
              {submitting ? 'A enviar…' : 'Enviar report'}
            </Button>
          </div>
        </div>
      </PremiumModal>
    </>
  );
}
