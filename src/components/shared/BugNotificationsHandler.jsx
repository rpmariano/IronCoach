import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';
import { AlertCircle, X, ThumbsUp, ThumbsDown } from 'lucide-react';
import PremiumModal from './PremiumModal';
import Button from './Button';

/**
 * Gerencia notificações de bugs para utilizadores.
 * Mostra badge na homepage e modal com opção de responder (OK/Not OK).
 */
export default function BugNotificationsHandler() {
  const { session } = useAppStore();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);
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
        .select('*')
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

  const handleOpenNotification = (notification) => {
    setSelectedNotification(notification);
    setResponseStatus(null);
    setResponseMessage('');
  };

  const handleCloseNotification = () => {
    setSelectedNotification(null);
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

      // Remover da lista local
      setNotifications(prev => prev.filter(n => n.id !== selectedNotification.id));
      handleCloseNotification();
    } catch (err) {
      console.error('[BugNotifications] Erro ao responder:', err);
      alert('Falha ao responder à notificação.');
    } finally {
      setSubmitting(false);
    }
  };

  // Não renderizar se não há notificações
  if (notifications.length === 0) return null;

  return (
    <>
      {/* Badge na Homepage */}
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => handleOpenNotification(notifications[0])}
          className="flex items-center gap-2 bg-red-500/20 border border-red-500/40 rounded-full px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/30 active:scale-95 transition animate-pulse"
        >
          <AlertCircle size={16} />
          <span>{notifications.length} {notifications.length === 1 ? 'Notificação' : 'Notificações'}</span>
        </button>
      </div>

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
