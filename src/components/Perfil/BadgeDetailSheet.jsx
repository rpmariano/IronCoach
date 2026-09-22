import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Info, MessageSquare } from 'lucide-react';
import { useAppStore } from '../../store';
import { useEscapeClose } from '../shared/Sheet';
import BadgeRing, { corDoBadge } from '../shared/BadgeRing';
import SectionLabel from '../shared/SectionLabel';
import { DateTile } from '../Run/RaceListCard';
import Button from '../shared/Button';

/* O ecrã de detalhe de um badge (reforma da gamificação, fase 2).

   "A regra de cada badge aparece ao atleta numa frase": este ecrã abre com a
   REGRA, depois o PROGRESSO, e só depois as SESSÕES que contaram e porquê. O
   atleta nunca tem de adivinhar como se ganha — nem porque é que um treino
   que lhe pareceu perfeito não contou.

   O bloco do dado em falta é a razão de metade disto existir: uma sessão sem
   `hr_zones`, sem `splits` ou sem D+ não conta nem a favor nem contra, e sem
   o dizer aqui o badge ficava por ganhar em silêncio. Por isso o bloco diz
   quantas são, porquê, e o caminho para as resolver.

   Ecrã inteiro por cima da Vitrina, com `useEscapeClose` (a pilha partilhada
   da Sheet, não um listener próprio — ver o comentário em shared/Sheet.jsx).
   Cada linha abre o que já existe: prova → o hub, corrida → o registo; uma
   semana não abre nada, porque uma semana não é um registo. */

const ESTADO = {
  won: 'Ganho',
  progress: 'A caminho',
  empty: 'Por ganhar',
};

const GRUPOS = [
  { status: 'conta', label: 'Contaram' },
  { status: 'falhou', label: 'Não chegaram lá' },
  { status: 'indeterminada', label: 'Por decidir — falta o dado' },
];

/* As duas famílias que a Carol PODE trazer à conversa por iniciativa dela
   (doutrina 6 #6, R1 e R3). O botão de lhe perguntar existe em todos os
   badges — quem pergunta é o atleta, e a doutrina prevê essa porta à letra
   ("perguntado diretamente pelo atleta, responde com o número") — mas a
   pergunta que ele envia não é a mesma: nas outras duas famílias
   (`acumulacao`, `amuletos`) pede o que o badge É e COMO SE GANHA, e nunca
   "como melhoro". Melhorar um amuleto não quer dizer nada: não se treina
   para fazer anos, e "corre de madrugada para ganhares a Coruja" destrói
   exatamente aquilo que torna o amuleto agradável. */
const FAMILIAS_SUGERIVEIS = new Set(['desempenho', 'disciplina']);

/** A mensagem que o atleta envia ao carregar no botão. Sai no chat tal e
 *  qual, por isso tem de soar a pessoa e não a formulário — o estado do
 *  badge viaja à parte, no `badgeContext` do pedido (Coach.jsx). */
export function perguntaDoBadge(badge) {
  const nome = badge?.name || 'este';
  if (!FAMILIAS_SUGERIVEIS.has(badge?.familia)) {
    return `Explica-me o badge ${nome} — o que é que ele quer dizer e como é que se ganha?`;
  }
  return badge?.state === 'won'
    ? `Explica-me o badge ${nome} — o que é que ele quer dizer, e o que posso fazer para ir mais longe nele?`
    : `Explica-me o badge ${nome} — o que é que ele quer dizer, e o que posso fazer para o ganhar?`;
}

/** A legenda por baixo do botão: o atleta sai deste ecrã para outro
 *  separador, e tem direito a saber o que lhe vai ser dito lá. */
function legendaDoBotao(badge) {
  if (!FAMILIAS_SUGERIVEIS.has(badge?.familia)) {
    return 'Pergunta-lhe o que este badge significa e como se ganha.';
  }
  return badge?.state === 'won'
    ? 'Pergunta-lhe o que este badge significa e como podes ir mais longe nele.'
    : 'Pergunta-lhe o que este badge significa e o que podes fazer para o ganhar.';
}

const CARD = {
  background: 'var(--surface-glass)',
  border: '1px solid var(--border-glass)',
  borderRadius: 18,
  padding: '12px 14px',
};

const abrivel = (s) => (s.kind === 'race' && s.raceId != null) || (s.kind === 'run' && s.runId != null);

function Linha({ sessao, onOpen }) {
  const podeAbrir = abrivel(sessao);
  const conteudo = (
    <>
      <DateTile date={sessao.date} muted={sessao.status !== 'conta'} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-extrabold truncate" style={{ color: 'var(--text-1)' }}>{sessao.title}</span>
        {sessao.meta && <span className="block text-[11.5px] mt-[2px] truncate" style={{ color: 'var(--text-3)' }}>{sessao.meta}</span>}
        {sessao.porque && <span className="block text-[11px] mt-[1px] truncate" style={{ color: 'var(--text-4)' }}>{sessao.porque}</span>}
      </span>
      {podeAbrir && <ChevronRight size={15} aria-hidden="true" style={{ color: 'var(--text-4)', flexShrink: 0 }} />}
    </>
  );
  const estilo = { minHeight: 56, borderRadius: 16, padding: '6px 8px 6px 6px', background: 'none', border: 'none' };
  const testId = `badge-sessao-${sessao.kind}-${sessao.id}`;
  if (!podeAbrir) {
    return <div data-testid={testId} className="flex items-center gap-3 w-full" style={estilo}>{conteudo}</div>;
  }
  return (
    <button type="button" data-testid={testId} onClick={() => onOpen(sessao)} className="flex items-center gap-3 w-full text-left" style={{ ...estilo, cursor: 'pointer' }}>
      {conteudo}
    </button>
  );
}

export default function BadgeDetailSheet({ badge, onClose, onNavigate }) {
  const { setEditingRaceId, setEditingRunId, setOpenCreationMode, setCoachIntent, setActiveTab } = useAppStore();
  useEscapeClose(onClose);

  if (!badge) return null;
  const cor = corDoBadge(badge);
  const sessoes = badge.sessoes || [];
  const nivelGanho = badge.niveis ? (badge.niveis.filter((n) => n.ganho).slice(-1)[0] || null) : null;

  const abrir = (s) => {
    // Quem abre fecha o ecrã já — o hub ou o registo tomam o lugar do
    // separador e não há saída animada para esperar.
    onNavigate?.();
    if (s.kind === 'race') setEditingRaceId(s.raceId);
    else {
      setEditingRunId(s.runId);
      setOpenCreationMode('run');
    }
  };

  /* O botão que leva à Carol. Escreve a intenção, salta para o separador do
     Coach e só então fecha — o `onNavigate` é o mesmo que uma prova ou uma
     corrida já usam, e é ele que fecha TODAS as camadas: aberto a partir da
     Vitrina fecha este ecrã, aberto a partir do "o que há para ganhar" fecha
     este e o painel por baixo. Sem isso o atleta voltava do chat e
     encontrava dois ecrãs empilhados que já ninguém tinha pedido. */
  const falarComACarol = () => {
    setCoachIntent({
      kind: 'badge',
      badgeKey: badge.key,
      badgeName: badge.name,
      familia: badge.familia || null,
      pergunta: perguntaDoBadge(badge),
      estado: badge.state,
    });
    // `setActiveTab` devolve false quando um guard de navegação recusa o
    // salto (store/index.js). Nesse caso não se fecha nada e a intenção
    // desfaz-se: ficava escrita à espera de um chat que não chegou a abrir,
    // e disparava sozinha da próxima vez que ele lá fosse.
    if (setActiveTab('coach') === false) {
      setCoachIntent(null);
      return;
    }
    onNavigate?.();
  };

  const conteudo = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Badge — ${badge.name}`}
      data-testid={`badge-detalhe-${badge.key}`}
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
          <div className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)', color: cor }}>Vitrina · Badges</div>
          <div className="text-[14.5px] font-extrabold truncate" style={{ color: 'var(--text-1)' }}>{badge.name}</div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-3" style={{ padding: '14px 18px calc(26px + env(safe-area-inset-bottom, 0px))' }}>
        {/* O anel em grande — aqui o glifo já cabe ao lado do número. */}
        <div className="flex flex-col items-center gap-2">
          <BadgeRing badge={badge} size={132} />
          <div className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)', color: badge.state === 'empty' ? 'var(--text-4)' : cor }}>
            {ESTADO[badge.state] || ESTADO.empty}{nivelGanho ? ` · ${nivelGanho.label}` : ''}
            {badge.count > 1 ? ` · ${badge.count}×` : ''}
          </div>
          {badge.linha && (
            <p className="m-0 text-[12px] text-center leading-relaxed" data-testid="badge-detalhe-linha" style={{ color: 'var(--text-3)' }}>
              {badge.linha}
            </p>
          )}
        </div>

        {/* A regra, numa frase. */}
        <div style={CARD} data-testid="badge-detalhe-regra">
          <SectionLabel style={{ margin: 0 }}>A regra</SectionLabel>
          <p className="m-0 mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--text-2)' }}>{badge.rule}</p>
          {/* De que dado é que a regra vive — em palavras, não no nome da
              coluna. É o que explica, antes de haver queixa nenhuma, porque
              é que uma corrida pode não ter contado. */}
          {badge.dependeDe && (
            <p className="m-0 mt-1.5 text-[11.5px] leading-relaxed" data-testid="badge-detalhe-campo" style={{ color: 'var(--text-4)' }}>
              {badge.dependeDe}
            </p>
          )}
        </div>

        {/* A conversa com a Carol. Faz sentido nos dois estados: num badge
            por ganhar interessa o que falta, num ganho interessa o que
            significa ter chegado lá. Mesma cor e mesmo gesto do "Falar com
            a Carol" do RunCard — não há um terceiro aspeto para a mesma
            coisa. */}
        <div className="flex flex-col gap-1.5">
          <Button
            variant="module"
            moduleColor="var(--grad-coach-legible)"
            onClick={falarComACarol}
            data-testid="badge-detalhe-carol"
            className="w-full shadow-md border-transparent font-semibold text-xs py-3"
          >
            <div className="flex items-center justify-center gap-2 w-full">
              <MessageSquare size={16} />
              <span>Falar com a Carol</span>
            </div>
          </Button>
          <p className="m-0 text-[11.5px] text-center leading-relaxed" data-testid="badge-detalhe-carol-legenda" style={{ color: 'var(--text-4)' }}>
            {legendaDoBotao(badge)}
          </p>
        </div>

        {/* Os degraus, nos badges com níveis. */}
        {badge.niveis && (
          <div style={CARD} data-testid="badge-detalhe-niveis">
            <SectionLabel style={{ margin: 0 }}>Os níveis</SectionLabel>
            <div className="flex flex-col gap-1.5 mt-2">
              {badge.niveis.map((n) => (
                <div key={n.key} className="flex items-baseline justify-between gap-2 text-[12px]" data-testid={`badge-nivel-${n.key}`} data-ganho={n.ganho ? '1' : '0'}>
                  <span className="font-extrabold" style={{ color: n.ganho ? cor : 'var(--text-4)' }}>{n.label}</span>
                  <span style={{ color: n.ganho ? 'var(--text-3)' : 'var(--text-4)', fontVariantNumeric: 'tabular-nums' }}>
                    {n.limiar >= 1000 ? String(n.limiar).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : n.limiar}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* O dado em falta — a razão por que um badge pode parecer parado. */}
        {badge.indeterminadas && (
          <div
            data-testid="badge-detalhe-indeterminadas"
            style={{ ...CARD, background: 'var(--tint-warn-bg)', border: '1px solid var(--tint-warn-bd)' }}
          >
            <div className="flex items-center gap-2">
              <Info size={15} aria-hidden="true" style={{ color: 'var(--warn)' }} />
              <SectionLabel style={{ margin: 0, color: 'var(--warn)' }}>Sem dados para decidir</SectionLabel>
            </div>
            <p className="m-0 mt-1.5 text-[12.5px] leading-relaxed" style={{ color: 'var(--text-2)' }}>{badge.indeterminadas.frase}</p>
            {badge.indeterminadas.comoResolver && (
              <p className="m-0 mt-1.5 text-[11.5px] leading-relaxed" style={{ color: 'var(--text-3)' }}>{badge.indeterminadas.comoResolver}</p>
            )}
          </div>
        )}

        {/* As sessões, em três grupos: as que contaram, as que não chegaram
            lá, e as que ficaram por decidir. Um grupo vazio não aparece. */}
        {GRUPOS.map(({ status, label }) => {
          const lista = sessoes.filter((s) => s.status === status);
          if (!lista.length) return null;
          return (
            <div key={status}>
              <SectionLabel>{label}</SectionLabel>
              <div className="flex flex-col mt-1">
                {lista.map((s, i) => <Linha key={`${s.kind}-${s.id ?? i}`} sessao={s} onOpen={abrir} />)}
              </div>
            </div>
          );
        })}

        {sessoes.length === 0 && (
          <p className="text-[12px] m-0" data-testid="badge-detalhe-vazio" style={{ color: 'var(--text-3)' }}>
            Ainda não há sessões que este badge possa contar.
          </p>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(conteudo, document.body) : conteudo;
}
