import React, { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import useBadges from '../../utils/useBadges';
import { useRevealAnimation } from '../../utils/useRevealAnimation';
import GlassCard from '../shared/GlassCard';
import BadgesGrelha from './BadgesGrelha';
import BadgeDetailSheet from './BadgeDetailSheet';
import BadgesPorGanharSheet from './BadgesPorGanharSheet';

/* A Vitrina dos badges de treino (reforma da gamificação, fase 2).

   ── SÓ O QUE JÁ FOI GANHO ───────────────────────────────────────────────
   Decisão de 2026-09-22, olhando para uma conta de nove dias e duas
   corridas: "os badges só devem aparecer à medida que se vão ganhando e não
   aparecerem a zero". Dezasseis anéis cinzentos com traços e "0/2" não
   liam-se como um mostruário — liam-se como uma app avariada. Uma vitrina
   mostra o que lá está, não os lugares vazios.

   O que falta NÃO desapareceu: mudou de sítio. Vive atrás da entrada "O que
   há para ganhar", no fim do cartão (BadgesPorGanharSheet), com as regras à
   vista — um badge que ninguém sabe que existe não é uma meta. E o contador
   do cabeçalho continua a dizer a verdade sobre o total: quem quer só não
   VER os vazios continua a querer saber quantos são.

   O desenho da grelha vive em BadgesGrelha.jsx, partilhado com esse painel:
   a mesma coisa não pode desenhar-se de duas maneiras em dois ecrãs.

   "Na Vitrina os anéis desenham-se sempre que o ecrã aparece": quem decide
   QUANDO é o useRevealAnimation (IntersectionObserver, janela de 1600 ms, o
   mesmo padrão do Início e do Dashboard); o COMO é do BadgeRing (o toggle de
   requestAnimationFrame do shared/Orbit.jsx), com o desfasamento em
   --stagger-rings. O `key={playKey}` é o que faz a grelha remontar e voltar
   a desenhar a cada aparecimento.

   ── A ESCALA PEQUENA DO MOMENTO (fase 4) ────────────────────────────────
   Um badge ganho entretanto e ainda por ver (o `pending` de useBadges) não
   abre cerimónia nenhuma aqui: o anel fecha-se na PRÓPRIA célula, com um
   salto (.badge-salto em globals.css), e fica visto. É a terceira escala do
   momento — a que não interrompe. A Vitrina só mostrar os ganhos não lhe
   tira o palco: `due` só é preenchido no ramo `state: 'won'` de cada regra
   (utils/badges.js), logo um badge por ver é sempre um badge ganho e a
   célula onde ele salta está sempre à vista.

   E consome: quem vê primeiro marca `seen_at`. Se o atleta abriu a Vitrina e
   viu o anel fechar-se, a novidade já lhe foi dada — abrir-lhe um ecrã
   inteiro no Início a seguir era contar-lhe a mesma coisa duas vezes. O
   `novos` guarda as chaves NUMA lista própria, que nunca encolhe: marcar
   como visto esvazia o `pending`, e sem isto o salto desaparecia no mesmo
   instante em que devia começar. */

/* O molde das duas linhas de rodapé do cartão (o badge mais perto e a
   entrada do que falta): a mesma caixa, para se lerem como o mesmo tipo de
   coisa — um caminho para fora da Vitrina. */
const LINHA = {
  marginTop: 10,
  minHeight: 44,
  padding: '10px 12px',
  borderRadius: 14,
  background: 'rgba(255,255,255,.04)',
  border: '1px solid var(--border-glass)',
};

export default function BadgesCard() {
  const { badges, pending, marcarVistos } = useBadges();
  const [abertoKey, setAbertoKey] = useState(null);
  const [porGanharAberto, setPorGanharAberto] = useState(false);
  const [novos, setNovos] = useState(() => new Set());
  const { ref, style, animate, playKey } = useRevealAnimation();

  useEffect(() => {
    if (!pending?.length) return;
    setNovos((antes) => {
      const proximo = new Set(antes);
      pending.forEach((p) => proximo.add(p.badge_key));
      return proximo;
    });
    marcarVistos(pending.map((p) => p.id));
  }, [pending, marcarVistos]);

  const lista = badges || [];
  if (lista.length === 0) return null;

  const ganhos = lista.filter((b) => b.state === 'won');
  const porGanhar = lista.filter((b) => b.state !== 'won');
  const aberto = abertoKey ? lista.find((b) => b.key === abertoKey) : null;
  // A frase de progresso: o badge por ganhar que está mais perto. É o mesmo
  // recurso do Palmarés — uma linha só, a que vale a pena perseguir hoje.
  const maisPerto = porGanhar
    // Um amuleto nunca vai para esta linha: ela é um empurrão ("faltam 5 000 m
    // para bronze"), e empurrar para um amuleto estraga-o — é a mesma regra
    // que a Carol segue na doutrina 6 #6. A família é o que o identifica.
    .filter((b) => b.linha && b.familia !== 'amuletos')
    .reduce((m, b) => (!m || (b.ring || 0) > (m.ring || 0) ? b : m), null);

  return (
    <div className="flex flex-col gap-2" data-testid="badges-card">
      <GlassCard radius={22} padding={14}>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="m-0 text-[15px] font-black" style={{ letterSpacing: '-.02em', color: 'var(--text-1)' }}>Badges de treino</h3>
          <span className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--run)' }}>
            {ganhos.length} de {lista.length}
          </span>
        </div>

        {ganhos.length > 0 ? (
          <div className="mt-3">
            <BadgesGrelha
              lista={ganhos}
              innerRef={ref}
              style={style}
              animate={animate}
              playKey={playKey}
              novos={novos}
              onAbrir={setAbertoKey}
            />
          </div>
        ) : (
          /* Nada ganho ainda: nem grelha nem parede. Uma linha que diz o que
             se passa e porque é que o espaço está vazio — uma conta nova tem
             de perceber que está tudo bem, não que falhou. Nada de promessas
             sobre o que ela vai ganhar: a app não sabe. */
          <p className="m-0 mt-2 text-[12.5px] leading-relaxed" data-testid="badges-vazio" style={{ color: 'var(--text-3)' }}>
            Ainda não há badges ganhos. Aparecem aqui à medida que os ganhares.
          </p>
        )}

        {maisPerto && (
          <button
            type="button"
            data-testid="badges-progresso"
            onClick={() => setAbertoKey(maisPerto.key)}
            className="w-full flex items-center gap-2.5 text-left"
            style={LINHA}
          >
            <span className="flex-1 text-[12px] leading-[1.45]" style={{ color: 'var(--text-3)' }}>
              <span className="font-extrabold" style={{ color: 'var(--text-2)' }}>{maisPerto.name}</span>
              {` — ${maisPerto.linha}`}
            </span>
            <ChevronRight size={15} className="shrink-0" style={{ color: 'var(--text-4)' }} />
          </button>
        )}

        {porGanhar.length > 0 && (
          <button
            type="button"
            data-testid="badges-por-ganhar"
            onClick={() => setPorGanharAberto(true)}
            className="w-full flex items-center gap-2.5 text-left"
            style={LINHA}
          >
            <span className="flex-1 text-[12px] leading-[1.45]" style={{ color: 'var(--text-3)' }}>
              <span className="font-extrabold" style={{ color: 'var(--text-2)' }}>O que há para ganhar</span>
              {` — ${porGanhar.length} por ganhar`}
            </span>
            <ChevronRight size={15} className="shrink-0" style={{ color: 'var(--text-4)' }} />
          </button>
        )}
      </GlassCard>

      {aberto && (
        <BadgeDetailSheet
          badge={aberto}
          onClose={() => setAbertoKey(null)}
          onNavigate={() => setAbertoKey(null)}
        />
      )}

      {porGanharAberto && (
        <BadgesPorGanharSheet lista={porGanhar} onClose={() => setPorGanharAberto(false)} />
      )}
    </div>
  );
}
