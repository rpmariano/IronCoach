import React from 'react';
import { Send, Loader2, ImagePlus } from 'lucide-react';
import CoachText from '../shared/CoachText';
import { MAX_CHAT_PHOTOS } from '../../utils/chatPhotos';
import '../../styles/v2-chat.css';

/* As peças do chat da Carol no Design v2 (fase 2). Só apresentação: o comportamento (envio,
   «a escrever», intenções, fotos, propostas) continua todo no Coach.jsx, que escolhe estas
   peças quando useDesignV2() está ligado. Desligado, nada daqui é desenhado.

   - Sem a cara em cada bolha: o nome dela aparece uma vez, por cima da primeira bolha de cada
     grupo de mensagens seguidas dela.
   - Bolhas planas: a dela no painel, a do atleta em ciano com tinta escura.
   - Respostas rápidas e botões dentro da conversa: retângulos com filete, 44 px de altura. */

/** Uma mensagem (um registo em coach_messages), já partida em bolhas pelo Coach.jsx. */
export function V2Message({ isUser, chunks, shown, isWaiting, withName, timeStr }) {
  return (
    <div
      className={`v2-chat-turn ${isUser ? 'is-me' : 'is-her'}`}
      data-testid={isUser ? 'coach-message-user' : 'coach-message-carol'}
    >
      {chunks.slice(0, shown).map((chunk, cIdx) => (
        <div
          key={cIdx}
          data-testid={isWaiting ? 'coach-waiting-message' : undefined}
          className={`v2-chat-msg ${isUser ? 'is-me' : 'is-her'}`}
        >
          {!isUser && withName && cIdx === 0 && <span className="v2-chat-who">Carol</span>}
          {isUser ? chunk : <CoachText>{chunk}</CoachText>}
        </div>
      ))}
      {timeStr && shown === chunks.length && <span className="v2-chat-time">{timeStr}</span>}
    </div>
  );
}

/** «a escrever…» numa bolha dela, sem a cara. */
export function V2Typing({ withName }) {
  return (
    <div className="v2-chat-turn is-her" data-testid="coach-typing">
      <div className="v2-chat-msg is-her v2-chat-typing">
        {withName && <span className="v2-chat-who">Carol</span>}
        <span className="v2-chat-typing-row">
          <span>a escrever…</span>
          <span className="v2-chat-dots" aria-hidden="true">
            <span className="coach-typing-dot" />
            <span className="coach-typing-dot" style={{ animationDelay: '150ms' }} />
            <span className="coach-typing-dot" style={{ animationDelay: '300ms' }} />
          </span>
        </span>
      </div>
    </div>
  );
}

/** Um botão de resposta rápida (sugestão, reenviar, carregar anteriores). */
export function V2Chip({ children, className = '', ...props }) {
  return (
    <button type="button" className={`v2-chat-chip ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

/** O campo de escrita: as mesmas ações e os mesmos estados do de sempre, noutro desenho. */
export function V2ComposerRow({
  photosCount, coachLoading, photoBusy, onSelectPhotos,
  textareaRef, value, onChange, onSend,
}) {
  const empty = !value.trim() && !photosCount;
  return (
    <div className="v2-chat-composer">
      {photosCount < MAX_CHAT_PHOTOS && (
        <label className={`v2-chat-attach${coachLoading ? ' is-off' : ''}`}>
          <input type="file" accept="image/*" multiple aria-label="Anexar foto (embalagem ou comida)" disabled={coachLoading || photoBusy} className="sr-only" onChange={onSelectPhotos} data-testid="coach-photo-input" />
          <ImagePlus className="w-5 h-5" aria-hidden="true" />
        </label>
      )}
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={onChange}
        // Enter faz sempre quebra de linha, nunca envia (como no de sempre).
        aria-label="Mensagem para a Carol"
        placeholder="Escreve a tua pergunta..."
        className="v2-chat-field"
      />
      <button
        type="button"
        onClick={onSend}
        disabled={empty || coachLoading || photoBusy}
        aria-label="Enviar pergunta à Carol"
        className="v2-chat-send"
      >
        {coachLoading ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <Send className="w-5 h-5" aria-hidden="true" />}
      </button>
    </div>
  );
}
