import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, RefreshCw, History, AlertTriangle, Utensils, CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../store';
import './CoachDailySummaryCard.css';

/* Card-resumo do Coach no Início. Ver specs/plano-de-treino.md §11 e
   specs/coach-investigacao.md, Bloco 7 (forma de entrega 3).

   Mesma família visual do NextRaceCard (glass, glow radial, 28px de raio),
   mas o conteúdo é ROTATIVO em vez de fixo: até quatro mensagens
   independentes (recapitulação, avisos, sugestão de refeição, preparação
   para amanhã), cada uma podendo estar ausente. O atleta navega entre elas
   por toque — sem rotação automática por temporizador, que noutros sítios
   da app já se decidiu evitar em ecrãs que pedem leitura.

   Gerado 1x/dia no servidor (ver a Edge Function coach-daily-summary) — este
   componente só pede o carregamento ao montar; a decisão de servir cache ou
   regenerar é do servidor, não daqui. */

const MESSAGE_TYPES = [
  { key: 'recap', label: 'Recapitulação', Icon: History, color: '#0e7490' },
  { key: 'warnings', label: 'Aviso de hoje', Icon: AlertTriangle, color: '#b45309' },
  { key: 'meal_suggestion', label: 'Sugestão alimentar', Icon: Utensils, color: '#047857' },
  { key: 'tomorrow_prep', label: 'Preparar amanhã', Icon: CalendarClock, color: '#6d28d9' },
];

export default function CoachDailySummaryCard() {
  const { dailySummary, dailySummaryLoading, loadDailySummary } = useAppStore();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // reload:true — apanha um resumo já gerado hoje por outra sessão/
    // dispositivo, sem forçar uma nova chamada ao Gemini.
    loadDailySummary({ reload: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const messages = useMemo(() => {
    if (!dailySummary) return [];
    return MESSAGE_TYPES
      .map(t => ({ ...t, text: typeof dailySummary[t.key] === 'string' ? dailySummary[t.key].trim() : '' }))
      .filter(m => m.text);
  }, [dailySummary]);

  // O índice pode ficar fora de alcance depois de um refresh que muda quantas
  // mensagens existem — repõe-se em vez de mostrar um cartão vazio.
  const safeIndex = messages.length ? Math.min(index, messages.length - 1) : 0;
  const current = messages[safeIndex];

  const handleRefresh = () => {
    setIndex(0);
    loadDailySummary({ force: true });
  };

  return (
    <div className="cds-card">
      <div className="cds-glow" />

      <div className="cds-header">
        <span className="cds-lbl"><Sparkles size={12} /> Resumo do Coach</span>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={dailySummaryLoading}
          aria-label="Atualizar resumo"
          className="cds-refresh"
          data-spinning={dailySummaryLoading}
        >
          <RefreshCw size={13} />
        </button>
      </div>

      <div className="cds-body">
        {dailySummaryLoading && !dailySummary ? (
          <div className="cds-skeleton">
            <div className="cds-skeleton-line" />
            <div className="cds-skeleton-line" />
          </div>
        ) : !current ? (
          <p className="cds-empty">Sem nada a assinalar por agora — regista uma refeição ou um treino para o Coach ter o que comentar.</p>
        ) : (
          /* As mensagens ficam TODAS empilhadas na mesma célula da grelha
             (grid-area 1/1 em cada uma) em vez de só a atual ser montada. O
             CSS Grid dimensiona a linha pela mais alta de todas — por isso a
             altura do cartão passa a ser a da mensagem mais longa do
             conjunto atual, fixa enquanto não se muda de resumo. Sem isto, a
             troca de mensagem (recap curto → sugestão de refeição longa)
             fazia o cartão saltar de tamanho a cada toque. Nada de scroll
             nem de cortar texto — só reservar sempre o espaço necessário. */
          <div className="cds-stack">
            {messages.map((m, i) => (
              <div key={m.key} className="cds-msg" data-active={i === safeIndex} aria-hidden={i !== safeIndex}>
                <span className="cds-msg-icon" style={{ background: `${m.color}1a`, color: m.color }}>
                  <m.Icon size={15} />
                </span>
                <div className="min-w-0">
                  <p className="cds-msg-title" style={{ color: m.color }}>{m.label}</p>
                  <p className="cds-msg-text">{m.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {messages.length > 1 && (
        <div className="cds-footer">
          <div className="cds-dots">
            {messages.map((m, i) => (
              <span key={m.key} className="cds-dot" data-active={i === safeIndex} />
            ))}
          </div>
          <div className="cds-nav">
            <button
              type="button"
              onClick={() => setIndex(i => Math.max(0, i - 1))}
              disabled={safeIndex === 0}
              aria-label="Mensagem anterior"
              className="cds-nav-btn"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => setIndex(i => Math.min(messages.length - 1, i + 1))}
              disabled={safeIndex === messages.length - 1}
              aria-label="Próxima mensagem"
              className="cds-nav-btn"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
