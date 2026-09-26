import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import GlassCard from '../shared/GlassCard';
import Warning from '../shared/Warning';
import { useEscapeClose } from '../shared/Sheet';
import { formatPublicationDate, segmentPhrase } from '../../utils/percentile';
import { nextPublicationDate, publicationDayOf } from '@formulas/percentileSegments.ts';
import { todayISO } from '../../lib/utils';

/* As tabelas com nomes — o top 10 de um escalão numa quinzena (2026-09-25).

   Só chega aqui quem aceitou aparecer nelas (reciprocidade: ver os nomes dos
   outros sem pôr o seu era servir-se sem entrar). A leitura é pela função
   leaderboard_top, que devolve o nome abreviado, o nível, o índice e um
   `is_me` — nunca o user_id de ninguém. A posição é recontada entre quem
   ainda consente: quem sai, sai na hora, e os de baixo sobem. */

const CARD_SECUNDARIO = { background: 'var(--surface-glass)', border: '1px solid var(--border-glass)', borderRadius: 18 };
const NIVEL = { iniciante: 'iniciante', basico: 'básico', medio: 'médio', avancado: 'avançado' };

function formatarJanela(inicio, fim) {
  const dia = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' }).replace('.', '');
  if (!fim) return `desde ${dia(inicio)}`;
  const ultimo = new Date(Date.parse(`${fim}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  return `${dia(inicio)} a ${dia(ultimo)}`;
}

export default function TabelasScreen({ segment, windowStart, windowEnd, onClose, onManageConsent }) {
  useEscapeClose(onClose);
  const [linhas, setLinhas] = useState(null); // null = a carregar
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!segment || !windowStart) { setLinhas([]); return; }
      const { data, error } = await supabase.rpc('leaderboard_top', {
        p_window_start: windowStart,
        p_age_band: segment.ageBand,
        p_gender: segment.gender,
        p_terrain: segment.terrain,
      });
      if (!vivo) return;
      if (error) { setErro(true); setLinhas([]); return; }
      setLinhas(data || []);
    })();
    return () => { vivo = false; };
  }, [segment, windowStart]);

  const conteudo = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="As tabelas com nomes"
      data-testid="tabelas-screen"
      // A mesma camada do "Onde estás" e do consentimento (z-80): quem monta
      // depois fica por cima — o consentimento aberto daqui tapa as tabelas.
      className="fixed inset-0 z-[80] flex flex-col fade-in"
      style={{ background: 'var(--bg-app)' }}
    >
      <div className="flex items-center gap-2.5 shrink-0" style={{ minHeight: 52, padding: '8px 14px', borderBottom: '1px solid var(--border-glass)' }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Voltar"
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 44, height: 44, background: 'none', border: 'none', color: 'var(--text-3)' }}
        >
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--race)' }}>Vitrina</div>
          <div className="text-[14.5px] font-extrabold truncate" style={{ color: 'var(--text-1)' }}>As tabelas com nomes</div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-2 [&>*]:shrink-0" style={{ padding: '12px 18px calc(26px + env(safe-area-inset-bottom, 0px))' }}>
        <GlassCard radius={24} padding={16}>
          <h3 className="m-0 text-[16px] font-black" style={{ letterSpacing: 'var(--tracking-tight)', color: 'var(--text-1)' }}>
            Os 10 que mais cumpriram o plano
          </h3>
          <p className="m-0 text-[12.5px] mt-1.5" style={{ color: 'var(--text-3)', lineHeight: 'var(--leading-normal)' }}>
            {segment ? `No ${segmentPhrase(segment).replace(/^o /, '')}` : 'No teu escalão'}
            {windowStart ? `, de ${formatarJanela(windowStart, windowEnd)}` : ''}. Só aparece quem aceitou aparecer, com o nome abreviado.
          </p>

          {linhas === null ? (
            <p className="text-[12px] m-0 pt-3" style={{ color: 'var(--text-4)' }} role="status">A ler a tabela…</p>
          ) : erro ? (
            <p className="text-[12px] m-0 pt-3" style={{ color: 'var(--text-4)' }}>Não foi possível ler a tabela. Tenta outra vez daqui a pouco.</p>
          ) : linhas.length === 0 ? (
            <p className="text-[12px] m-0 pt-3" data-testid="tabelas-vazia" style={{ color: 'var(--text-4)', lineHeight: 'var(--leading-normal)' }}>
              Esta quinzena ainda não tem ninguém na tabela deste escalão: ou o grupo não chegou aos 20 atletas, ou ainda ninguém aceitou aparecer.
            </p>
          ) : (
            <ol className="m-0 p-0 mt-3 flex flex-col gap-1.5" style={{ listStyle: 'none' }} data-testid="tabelas-lista">
              {linhas.map((l) => (
                <li
                  key={l.position}
                  className="flex items-center gap-2.5"
                  data-testid={l.is_me ? 'tabelas-eu' : undefined}
                  style={{
                    ...CARD_SECUNDARIO,
                    minHeight: 44,
                    padding: '8px 12px',
                    borderColor: l.is_me ? 'var(--ok)' : 'var(--border-glass)',
                  }}
                >
                  <span className="shrink-0 text-[13px] font-black text-center" style={{ width: 22, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{l.position}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-extrabold truncate" style={{ color: 'var(--text-1)' }}>
                      {l.display_name}{l.is_me ? ' · tu' : ''}
                    </span>
                    {l.experience_level && NIVEL[l.experience_level] && (
                      <span className="block text-[11px]" style={{ color: 'var(--text-4)' }}>nível {NIVEL[l.experience_level]}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[12.5px] font-extrabold" style={{ color: l.is_me ? 'var(--ok)' : 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                    {String(Math.round(Number(l.score) * 10) / 10).replace('.', ',')}%
                  </span>
                </li>
              ))}
            </ol>
          )}
        </GlassCard>

        <Warning tone="ok" title="Como se lê">
          A percentagem é a parte do plano que cada um cumpriu nesta quinzena — não quanto treinou. A tabela é
          fechada no fim de cada quinzena e não se refaz; quem deixa de aceitar sai dela na hora. A próxima sai{' '}
          <span data-testid="tabelas-proxima">{formatPublicationDate(nextPublicationDate(publicationDayOf(Date.now())), todayISO())}</span>.
        </Warning>

        <button
          type="button"
          data-testid="tabelas-gerir"
          onClick={onManageConsent}
          className="w-full flex items-center justify-between text-left text-[12.5px] font-bold"
          style={{ ...CARD_SECUNDARIO, minHeight: 52, padding: '4px 16px', color: 'var(--text-3)', marginTop: 4 }}
        >
          Gerir a minha presença nas tabelas
          <ChevronRight size={15} className="shrink-0" aria-hidden="true" style={{ color: 'var(--text-4)' }} />
        </button>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(conteudo, document.body) : conteudo;
}
