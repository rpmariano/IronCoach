import React, { useState } from 'react';
import { Bug, Send } from 'lucide-react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { currentPageLabel } from '../../lib/utils';
import { useToast } from './ToastProvider';
import PremiumModal from './PremiumModal';
import { Button } from './Button';

const SCREENSHOT_BUCKET = 'bug-report-photos';

// Captura só o que está atualmente visível no ecrã (viewport), não a página
// inteira — é o que corresponde a "um print" para quem está a reportar um
// problema pontual. html2canvas é importado dinamicamente: é uma lib usada
// só neste botão, não faz sentido no bundle inicial de todos os ecrãs.
async function captureViewportScreenshot() {
  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(document.body, {
    backgroundColor: '#0f172a',
    useCORS: true,
    scale: Math.min(window.devicePixelRatio || 1, 2),
    x: window.scrollX,
    y: window.scrollY,
    width: window.innerWidth,
    height: window.innerHeight,
  });
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png', 0.85));
}

/**
 * Botão discreto (presente em todos os ecrãs via Layout) que permite ao
 * atleta reportar um problema. Ao clicar, captura um screenshot do ecrã
 * atual em segundo plano enquanto a caixa de descrição já está aberta —
 * o atleta nunca espera pela captura para começar a escrever.
 */
export default function ReportIssueButton() {
  const { session, profile, activeTab, openCreationMode, editingRaceId } = useAppStore();
  const { showToast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [screenshotBlob, setScreenshotBlob] = useState(null);
  const [screenshotPreviewUrl, setScreenshotPreviewUrl] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const resetState = () => {
    setDescription('');
    setScreenshotBlob(null);
    if (screenshotPreviewUrl) URL.revokeObjectURL(screenshotPreviewUrl);
    setScreenshotPreviewUrl(null);
  };

  const handleOpen = () => {
    setIsOpen(true);
    setCapturing(true);
    // Fire-and-forget: se a captura falhar (ex.: navegador sem suporte,
    // conteúdo cross-origin), o report ainda segue sem screenshot — nunca
    // bloqueia o atleta de reportar o problema.
    captureViewportScreenshot()
      .then((blob) => {
        if (!blob) return;
        setScreenshotBlob(blob);
        setScreenshotPreviewUrl(URL.createObjectURL(blob));
      })
      .catch((err) => console.warn('[ReportIssueButton] Falha ao capturar screenshot:', err))
      .finally(() => setCapturing(false));
  };

  const handleClose = () => {
    if (submitting) return;
    setIsOpen(false);
    resetState();
  };

  const handleSubmit = async () => {
    const trimmed = description.trim();
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
      let screenshotPath = null;
      if (screenshotBlob) {
        const path = `${userId}/${Date.now()}-${crypto.randomUUID()}.png`;
        const { error: uploadError } = await supabase.storage
          .from(SCREENSHOT_BUCKET)
          .upload(path, screenshotBlob, { contentType: 'image/png' });
        if (uploadError) {
          // Falha no upload não deve impedir o report em si — segue sem
          // screenshot, o admin ainda recebe a descrição/página/data.
          console.warn('[ReportIssueButton] Falha ao enviar screenshot:', uploadError);
        } else {
          screenshotPath = path;
        }
      }

      const { error } = await supabase.from('bug_reports').insert({
        user_id: userId,
        user_email: session?.user?.email || null,
        user_name: profile?.full_name || null,
        description: trimmed,
        page: currentPageLabel({ activeTab, openCreationMode, editingRaceId }),
        screenshot_path: screenshotPath,
        user_agent: navigator.userAgent,
      });
      if (error) throw error;

      showToast('Obrigado! O teu report foi enviado à equipa.', 'success');
      setIsOpen(false);
      resetState();
    } catch (err) {
      console.error('[ReportIssueButton] Falha ao submeter report:', err);
      showToast('Não foi possível enviar o report. Tenta novamente.', 'error');
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
        className="tap-44 fixed bottom-24 right-3 z-30 w-9 h-9 rounded-full flex items-center justify-center bg-white/10 backdrop-blur-xl border border-white/10 text-slate-400 hover:text-slate-100 hover:bg-white/20 active:scale-95 transition shadow-[0_2px_10px_rgba(0,0,0,0.25)]"
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
            <label className="text-xs font-semibold text-slate-300">O que aconteceu?</label>
            <textarea
              rows={4}
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreve o problema — o que fizeste e o que esperavas que acontecesse..."
              className="w-full bg-neutral-950 border border-neutral-700 rounded-xl py-2.5 px-3 text-xs text-slate-200 outline-none resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              Screenshot do ecrã
            </label>
            <div className="bg-neutral-950 rounded-2xl border border-neutral-800 p-2 flex items-center justify-center min-h-[80px]">
              {capturing ? (
                <div className="flex items-center gap-2 text-[11px] text-slate-500 py-4">
                  <div className="w-3.5 h-3.5 border-2 border-slate-700 border-t-slate-400 rounded-full animate-spin" />
                  A capturar o ecrã...
                </div>
              ) : screenshotPreviewUrl ? (
                <img
                  src={screenshotPreviewUrl}
                  alt="Pré-visualização do screenshot anexado"
                  className="max-h-40 object-contain rounded-xl"
                />
              ) : (
                <p className="text-[11px] text-slate-500 py-4">
                  Não foi possível capturar o ecrã — o report segue à mesma.
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="light" onClick={handleClose} disabled={submitting} className="flex-1">
              Cancelar
            </Button>
            <Button
              variant="module"
              moduleColor="var(--mod-coach-to)"
              onClick={handleSubmit}
              disabled={submitting || capturing}
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
