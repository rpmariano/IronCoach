import React, { useState } from 'react';
import { Bug, Send, Upload, X } from 'lucide-react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { currentPageLabel } from '../../lib/utils';
import { useToast } from './ToastProvider';
import PremiumModal from './PremiumModal';
import { Button } from './Button';

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

  const handleOpen = () => setIsOpen(true);

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
        aria-label="Reportar um problema"
        title="Reportar um problema"
        className="tap-44 fixed bottom-24 left-3 z-30 w-9 h-9 rounded-full flex items-center justify-center bg-white/10 backdrop-blur-xl border border-white/10 text-slate-400 hover:text-slate-100 hover:bg-white/20 active:scale-95 transition shadow-[0_2px_10px_rgba(0,0,0,0.25)]"
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
        <div className="p-6 space-y-4 bg-neutral-900 text-slate-200">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Título <span className="text-red-400">*</span></label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Resume o problema numa frase curta..."
              maxLength={80}
              className="w-full bg-neutral-950 border border-neutral-700 rounded-xl py-2.5 px-3 text-xs text-slate-200 outline-none"
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">O que aconteceu?</label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreve o problema — o que fizeste e o que esperavas que acontecesse..."
              className="w-full bg-neutral-950 border border-neutral-700 rounded-xl py-2.5 px-3 text-xs text-slate-200 outline-none resize-none"
              disabled={submitting}
            />
          </div>

          {/* File Upload Section */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">
              Adicionar imagens ou vídeos (opcional)
            </label>
            <label className="flex flex-col items-center justify-center gap-2 w-full bg-neutral-950 border-2 border-dashed border-neutral-700 rounded-xl py-6 px-3 cursor-pointer hover:border-slate-500 transition">
              <Upload size={18} className="text-slate-400" />
              <span className="text-xs text-slate-400">Clica para selecionar ficheiros</span>
              <span className="text-[10px] text-slate-500">PNG, JPG, GIF, MP4, WebM (máx. 50MB cada)</span>
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
                <div className="text-xs text-slate-400">{files.length} ficheiro(s) selecionado(s)</div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between bg-neutral-950 border border-neutral-700 rounded-lg p-2.5 text-xs"
                    >
                      <span className="truncate text-slate-300">{file.name}</span>
                      <button
                        onClick={() => handleRemoveFile(index)}
                        disabled={submitting}
                        className="shrink-0 p-1 text-slate-400 hover:text-red-400 disabled:opacity-50"
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
              <div className="w-full bg-neutral-950 rounded-lg overflow-hidden border border-neutral-700">
                <div
                  className="h-1.5 bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300"
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
              icon={submitting ? <div className="w-4 h-4 border-2 border-slate-700 border-t-white rounded-full animate-spin" /> : <Send size={15} />}
            >
              {submitting ? 'A enviar...' : 'Enviar report'}
            </Button>
          </div>
        </div>
      </PremiumModal>
    </>
  );
}
