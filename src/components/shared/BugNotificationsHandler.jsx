import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';
import { AlertCircle, Mail, ThumbsUp, ThumbsDown, ChevronLeft, ChevronRight } from 'lucide-react';
import PremiumModal from './PremiumModal';
import Button from './Button';

/**
 * Gerencia notificações de bugs para utilizadores.
 * Mostra badge na homepage e modal com opção de responder (OK/Not OK).
 *
 * Cada notificação está sempre acompanhada do título + id do bug a que
 * pertence (join com bug_reports) — com várias mensagens por ler, o
 * utilizador precisa de saber de que bug se está a falar em cada uma.
 * Quando há mais do que uma notificação por ler, o modal ganha setas para
 * navegar entre elas sem ter de responder de imediato.
 */
export default function BugNotificationsHandler() {
  const { session } = useAppStore();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [responseStatus, setResponseStatus] = useState(null);
  const [responseMessage, setResponseMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) return;
    loadNotifications();
  }, [session?.user?.id]);

  const loadNotifications = async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bug_notifications')
        .select('*, bug_reports(id, title, bug_number)')
        .eq('user_id', session.user.id)
        .is('response_status', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications(data || []);
    } catch (err) {
      console.error('[BugNotifications] Erro ao carregar:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectedNotification = selectedIndex !== null ? notifications[selectedIndex] : null;
  const hasPrev = selectedIndex !== null && selectedIndex > 0;
  const hasNext = selectedIndex !== null && selectedIndex < notifications.length - 1;

  const goToIndex = (index) => {
    setSelectedIndex(index);
    setResponseStatus(null);
    setResponseMessage('');
  };

  const handleOpen = () => goToIndex(0);
  const handlePrev = () => hasPrev && goToIndex(selectedIndex - 1);
  const handleNext = () => hasNext && goToIndex(selectedIndex + 1);

  const handleCloseNotification = () => {
    setSelectedIndex(null);
    setResponseStatus(null);
    setResponseMessage('');
  };

  const handleSubmitResponse = async () => {
    if (!responseStatus) {
      alert('Seleciona uma opção antes de responder.');
      return;
    }
    if (responseStatus === 'not_ok' && !responseMessage.trim()) {
      alert('Descreve o problema quando selecionas "Não Funciona".');
      return;
    }

    if (!selectedNotification) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('bug_notifications')
        .update({
          response_status: responseStatus,
          response_message: responseMessage.trim() || null,
          responded_at: new Date().toISOString(),
          read_at: new Date().toISOString(),
        })
        .eq('id', selectedNotification.id);

      if (error) throw error;

      // Remover da lista local e ajustar a posição — se ainda houver
      // notificações, fica a apontar para a que ocupou o lugar desta;
      // se não houver mais nenhuma, fecha o modal.
      const remaining = notifications.filter(n => n.id !== selectedNotification.id);
      setNotifications(remaining);
      if (remaining.length === 0) {
        handleCloseNotification();
      } else {
        goToIndex(Math.min(selectedIndex, remaining.length - 1));
      }
    } catch (err) {
      console.error('[BugNotifications] Erro ao responder:', err);
      alert('Falha ao responder à notificação.');
    } finally {
      setSubmitting(false);
    }
  };

  // Não renderizar se não há notificações
  if (notifications.length === 0) return null;

  const bugTitle = selectedNotification?.bug_reports?.title;
  const bugNumber = selectedNotification?.bug_reports?.bug_number;

  return (
    <>
      {/* Botão de carta com badge — cabeçalho, junto ao "Perfil" */}
      <button
        onClick={handleOpen}
        aria-label={`${notifications.length} ${notifications.length === 1 ? 'notificação' : 'notificações'} por ler`}
        title="Notificações"
        className="relative w-11 h-11 rounded-full flex items-center justify-center active:scale-95 transition shadow-[0_2px_10px_rgba(220,38,38,0.4)]"
        style={{ background: 'linear-gradient(135deg, #dc2626, #f97316)' }}
      >
        <Mail size={17} className="text-white" strokeWidth={2.25} />
        {/* Contador ancorado DENTRO da caixa do botão (top-0/right-0, não
            deslocamentos negativos): fora dela era cortado e via-se só a
            borda. Sem animate-pulse, que o desvanecia para 50% de opacidade
            e tornava o número ilegível. */}
        <span className="absolute top-0 right-0 min-w-[20px] h-[20px] px-1 rounded-full bg-white text-red-600 text-[11px] font-extrabold leading-none flex items-center justify-center shadow-sm ring-2 ring-[#0f172a]">
          {notifications.length}
        </span>
      </button>

      {/* Modal de Notificação */}
      {selectedNotification && (
        <PremiumModal
          isOpen={!!selectedNotification}
          onClose={handleCloseNotification}
          title="Notificação de Bug Report"
          subtitle="A equipa enviou-te uma mensagem"
          icon={AlertCircle}
          theme="warning"
          variant="dialog"
          maxWidth="max-w-lg"
        >
          <div className="p-6 space-y-5 bg-neutral-900 text-slate-200">
            {/* Navegação entre notificações — só aparece com mais do que uma */}
            {notifications.length > 1 && (
              <div className="flex items-center justify-between bg-neutral-950 border border-neutral-800 rounded-xl px-2 py-1.5">
                <button
                  onClick={handlePrev}
                  disabled={!hasPrev || submitting}
                  aria-label="Notificação anterior"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-[11px] font-semibold text-slate-400">
                  {selectedIndex + 1} de {notifications.length}
                </span>
                <button
                  onClick={handleNext}
                  disabled={!hasNext || submitting}
                  aria-label="Notificação seguinte"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}

            {/* Bug a que a notificação se refere — título + id acompanham
                sempre a mensagem, para não haver dúvida de qual bug se trata */}
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-sm font-bold text-slate-100 truncate">{bugTitle || 'Bug sem título'}</p>
              {bugNumber != null && (
                <span className="shrink-0 text-[10px] font-mono text-slate-500">
                  Bug-{String(bugNumber).padStart(3, '0')}
                </span>
              )}
            </div>

            {/* Mensagem da Equipa */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Mensagem</label>
              <div className="bg-neutral-950 rounded-2xl p-3 border border-neutral-800 text-sm text-slate-200 whitespace-pre-wrap break-words">
                {selectedNotification.message}
              </div>
            </div>

            {/* Data da Notificação */}
            <p className="text-[10px] text-slate-500">
              Recebido a {new Date(selectedNotification.created_at).toLocaleString('pt-PT')}
            </p>

            {/* Opções de Resposta */}
            <div className="space-y-3 border-t border-neutral-800 pt-4">
              <label className="text-xs font-semibold text-slate-300">A tua resposta:</label>

              <div className="space-y-2">
                <button
                  onClick={() => setResponseStatus('ok')}
                  className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 transition ${
                    responseStatus === 'ok'
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-neutral-950 border-neutral-700 text-slate-400 hover:border-emerald-500/30'
                  }`}
                  disabled={submitting}
                >
                  <ThumbsUp size={16} />
                  <span className="font-semibold">OK - Funciona</span>
                </button>

                <button
                  onClick={() => setResponseStatus('not_ok')}
                  className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 transition ${
                    responseStatus === 'not_ok'
                      ? 'bg-red-500/20 border-red-500/50 text-red-300'
                      : 'bg-neutral-950 border-neutral-700 text-slate-400 hover:border-red-500/30'
                  }`}
                  disabled={submitting}
                >
                  <ThumbsDown size={16} />
                  <span className="font-semibold">Não Funciona</span>
                </button>
              </div>

              {/* Campo de Mensagem para Not OK */}
              {responseStatus === 'not_ok' && (
                <div className="space-y-1 pt-2">
                  <label className="text-xs font-semibold text-red-300">Descreve o problema (obrigatório):</label>
                  <textarea
                    rows={2}
                    value={responseMessage}
                    onChange={(e) => setResponseMessage(e.target.value)}
                    placeholder="O que continua a não funcionar..."
                    className="w-full bg-neutral-950 border border-red-500/30 rounded-xl py-2 px-3 text-xs text-slate-200 outline-none resize-none"
                    disabled={submitting}
                  />
                </div>
              )}

              {/* Campo de Mensagem Opcional para OK */}
              {responseStatus === 'ok' && (
                <div className="space-y-1 pt-2">
                  <label className="text-xs font-semibold text-emerald-300">Mensagem (opcional):</label>
                  <textarea
                    rows={2}
                    value={responseMessage}
                    onChange={(e) => setResponseMessage(e.target.value)}
                    placeholder="Deixa um comentário se quiser..."
                    className="w-full bg-neutral-950 border border-emerald-500/30 rounded-xl py-2 px-3 text-xs text-slate-200 outline-none resize-none"
                    disabled={submitting}
                  />
                </div>
              )}
            </div>

            {/* Botões de Ação */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={handleCloseNotification}
                disabled={submitting}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                variant={responseStatus === 'not_ok' ? 'outline' : 'module'}
                moduleColor={responseStatus === 'ok' ? 'var(--green)' : undefined}
                onClick={handleSubmitResponse}
                disabled={submitting || !responseStatus}
                className="flex-1"
                icon={submitting ? <div className="w-4 h-4 border-2 border-slate-700 border-t-white rounded-full animate-spin" /> : undefined}
              >
                {submitting ? 'A responder...' : 'Responder'}
              </Button>
            </div>
          </div>
        </PremiumModal>
      )}
    </>
  );
}
