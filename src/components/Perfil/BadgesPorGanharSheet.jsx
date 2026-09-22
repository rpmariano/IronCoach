import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import { useEscapeClose } from '../shared/Sheet';
import { useRevealAnimation } from '../../utils/useRevealAnimation';
import BadgesGrelha from './BadgesGrelha';
import BadgeDetailSheet from './BadgeDetailSheet';

/* "O que há para ganhar" — o mostruário do que ainda falta.

   A Vitrina passou a mostrar SÓ o que já está ganho: numa conta de nove
   dias, dezasseis anéis cinzentos a dizer "0/2" liam-se como uma app
   avariada, não como um mostruário. Mas o que falta não podia
   simplesmente desaparecer — um badge que ninguém sabe que existe não é
   uma meta, é uma surpresa. Por isso mudou de sítio, não de existência:
   sai da Vitrina e passa a viver aqui atrás, numa entrada discreta.

   E aqui as regras estão à VISTA, por baixo do anel de cada família. Na
   Vitrina a regra está a um toque de distância porque quem já ganhou o
   badge já sabe como se ganha; quem vem a este painel vem precisamente
   perguntar como — fazê-lo tocar em cada um para descobrir era esconder a
   resposta atrás da pergunta.

   Ecrã inteiro por cima da Vitrina, com `useEscapeClose` (a pilha
   partilhada da Sheet, não um listener próprio — ver o comentário em
   shared/Sheet.jsx), como o BadgeDetailSheet. Cada célula abre o detalhe
   do badge, tal e qual como na Vitrina; o detalhe monta-se por cima deste
   painel e a pilha do Escape trata da ordem. */

const CARD = {
  background: 'var(--surface-glass)',
  border: '1px solid var(--border-glass)',
  borderRadius: 18,
  padding: '10px 12px',
};

export default function BadgesPorGanharSheet({ lista, onClose }) {
  const [abertoKey, setAbertoKey] = useState(null);
  const { ref, style, animate, playKey } = useRevealAnimation();
  useEscapeClose(onClose);

  const porGanhar = lista || [];
  const aberto = abertoKey ? porGanhar.find((b) => b.key === abertoKey) : null;

  /* As regras da família, por baixo dos anéis dela. Só texto: o anel logo
     acima já é o alvo de toque, e dois sítios para tocar na mesma coisa
     não acrescentam nada. */
  const regrasDoGrupo = (grupo) => (
    <div className="flex flex-col gap-1.5 mt-2" style={CARD} data-testid={`badges-regras-${grupo.key}`}>
      {grupo.descricao && (
        <p className="m-0 text-[11px] leading-relaxed" style={{ color: 'var(--text-4)' }}>{grupo.descricao}</p>
      )}
      {grupo.lista.map((badge) => (
        <p key={badge.key} className="m-0 text-[12px] leading-relaxed" data-testid={`badge-regra-${badge.key}`} style={{ color: 'var(--text-3)' }}>
          <span className="font-extrabold" style={{ color: 'var(--text-2)' }}>{badge.name}</span>
          {` — ${badge.rule}`}
          {badge.linha && (
            <span className="block text-[11px] mt-[1px]" style={{ color: 'var(--text-4)' }}>{badge.linha}</span>
          )}
        </p>
      ))}
    </div>
  );

  const conteudo = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="O que há para ganhar"
      data-testid="badges-por-ganhar-sheet"
      className="fixed inset-0 z-[80] flex flex-col fade-in"
      style={{ background: 'var(--bg-app)' }}
    >
      <div className="flex items-center gap-2.5 shrink-0" style={{ minHeight: 52, padding: '8px 14px', borderBottom: '1px solid var(--border-glass)' }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 44, height: 44, background: 'none', border: 'none', color: 'var(--text-3)' }}
        >
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--run)' }}>Vitrina · Badges</div>
          <div className="text-[14.5px] font-extrabold truncate" style={{ color: 'var(--text-1)' }}>O que há para ganhar</div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-3" style={{ padding: '14px 18px calc(26px + env(safe-area-inset-bottom, 0px))' }}>
        {porGanhar.length === 0 ? (
          <p className="m-0 text-[12.5px] leading-relaxed" data-testid="badges-por-ganhar-vazio" style={{ color: 'var(--text-3)' }}>
            Já ganhaste todos os badges que existem.
          </p>
        ) : (
          <>
            <p className="m-0 text-[12.5px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
              {porGanhar.length === 1
                ? 'Falta um badge. A regra de cada um está por baixo do respetivo grupo.'
                : `Faltam ${porGanhar.length} badges. A regra de cada um está por baixo do respetivo grupo.`}
            </p>
            <BadgesGrelha
              lista={porGanhar}
              innerRef={ref}
              style={style}
              animate={animate}
              playKey={playKey}
              onAbrir={setAbertoKey}
              testId="badges-por-ganhar-grelha"
              rodapeDoGrupo={regrasDoGrupo}
            />
          </>
        )}
      </div>

      {aberto && (
        <BadgeDetailSheet
          badge={aberto}
          onClose={() => setAbertoKey(null)}
          /* Navegar para uma corrida ou prova fecha os DOIS ecrãs: o
             registo toma o lugar do separador e deixar este painel montado
             por baixo era guardar um ecrã que já ninguém pediu. */
          onNavigate={() => { setAbertoKey(null); onClose?.(); }}
        />
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(conteudo, document.body) : conteudo;
}
