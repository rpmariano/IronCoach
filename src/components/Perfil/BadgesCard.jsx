import React, { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import useBadges from '../../utils/useBadges';
import { FAMILIAS } from '../../utils/badges';
import { useRevealAnimation } from '../../utils/useRevealAnimation';
import BadgeRing, { corDoBadge } from '../shared/BadgeRing';
import GlassCard from '../shared/GlassCard';
import BadgeDetailSheet from './BadgeDetailSheet';

/* A grelha dos badges de treino, na Vitrina (reforma da gamificação, fase 2).

   AGRUPADA POR FAMÍLIA (utils/badges.js, FAMILIAS): desempenho, disciplina,
   acumulação e amuletos, cada uma com o seu cabeçalho. Numa grelha só, um
   amuleto ficava lado a lado com o Mestre da Z2 a fingir que valia o mesmo —
   e a família existe precisamente para dizer que não vale. A ordem é a do
   peso que cada família tem, com os amuletos no fim.

   Quatro colunas: o número dentro do anel dispensa metade do rótulo, por isso
   cabem quatro onde os medalhões só levavam dois. Cada badge abre o seu ecrã
   de detalhe — a regra, o progresso, e as sessões que contaram e porquê.

   "Na Vitrina os anéis desenham-se sempre que o ecrã aparece": quem decide
   QUANDO é o useRevealAnimation (IntersectionObserver, janela de 1600 ms, o
   mesmo padrão do Início e do Dashboard); o COMO é do BadgeRing (o toggle de
   requestAnimationFrame do shared/Orbit.jsx), com o desfasamento em
   --stagger-rings. O `key={playKey}` é o que faz a grelha remontar e voltar
   a desenhar a cada aparecimento.

   Isto SOMA-SE ao Palmarés, não o substitui: os medalhões continuam logo
   abaixo, no mesmo separador.

   ── A ESCALA PEQUENA DO MOMENTO (fase 4) ────────────────────────────────
   Um badge ganho entretanto e ainda por ver (o `pending` de useBadges) não
   abre cerimónia nenhuma aqui: o anel fecha-se na PRÓPRIA célula, com um
   salto (.badge-salto em globals.css), e fica visto. É a terceira escala do
   momento — a que não interrompe.

   E consome: quem vê primeiro marca `seen_at`. Se o atleta abriu a Vitrina e
   viu o anel fechar-se, a novidade já lhe foi dada — abrir-lhe um ecrã
   inteiro no Início a seguir era contar-lhe a mesma coisa duas vezes. O
   `novos` guarda as chaves NUMA lista própria, que nunca encolhe: marcar
   como visto esvazia o `pending`, e sem isto o salto desaparecia no mesmo
   instante em que devia começar. */

const TILE = {
  minHeight: 44,
  borderRadius: 16,
  padding: '10px 2px 8px',
  background: 'none',
  border: 'none',
};

/** O que se lê por baixo do nome: o nível ganho, ou o que falta. */
function legendaDe(badge) {
  if (badge.tier) {
    const nivel = (badge.niveis || []).filter((n) => n.ganho).slice(-1)[0];
    return nivel ? nivel.label : null;
  }
  if (badge.state === 'won') return badge.count > 1 ? `${badge.count}×` : 'Ganho';
  if (badge.state === 'progress') return 'A caminho';
  return null;
}

export default function BadgesCard() {
  const { badges, pending, marcarVistos } = useBadges();
  const [abertoKey, setAbertoKey] = useState(null);
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

  const ganhos = lista.filter((b) => b.state === 'won').length;
  const aberto = abertoKey ? lista.find((b) => b.key === abertoKey) : null;
  // A frase de progresso: o badge por ganhar que está mais perto. É o mesmo
  // recurso do Palmarés — uma linha só, a que vale a pena perseguir hoje.
  const maisPerto = lista
    // Um amuleto nunca vai para esta linha: ela é um empurrão ("faltam 5 000 m
    // para bronze"), e empurrar para um amuleto estraga-o — é a mesma regra
    // que a Carol segue na doutrina 6 #6. A família é o que o identifica.
    .filter((b) => b.state !== 'won' && b.linha && b.familia !== 'amuletos')
    .reduce((m, b) => (!m || (b.ring || 0) > (m.ring || 0) ? b : m), null);

  /* Os grupos, pela ordem de FAMILIAS. Um badge com uma família que esta
     lista não conheça não desaparece do ecrã — cai num grupo "Outros", à
     vista. Nada some em silêncio nesta vitrina. */
  const grupos = [
    ...FAMILIAS
      .map((f) => ({ ...f, lista: lista.filter((b) => b.familia === f.key) }))
      .filter((g) => g.lista.length > 0),
    ...(() => {
      const orfaos = lista.filter((b) => !FAMILIAS.some((f) => f.key === b.familia));
      return orfaos.length ? [{ key: 'outros', label: 'Outros', lista: orfaos }] : [];
    })(),
  ];

  return (
    <div className="flex flex-col gap-2" data-testid="badges-card">
      <GlassCard radius={22} padding={14}>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="m-0 text-[15px] font-black" style={{ letterSpacing: '-.02em', color: 'var(--text-1)' }}>Badges de treino</h3>
          <span className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--run)' }}>
            {ganhos} de {lista.length}
          </span>
        </div>

        <div ref={ref} style={style} className="flex flex-col gap-2 mt-3" data-testid="badges-grelha">
          {grupos.map((grupo) => (
            <div key={grupo.key} data-testid={`badges-familia-${grupo.key}`}>
              <div
                className="text-[10px] font-extrabold uppercase"
                style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--text-4)', padding: '2px 2px 4px' }}
              >
                {grupo.label}
              </div>
              <div className="grid grid-cols-4 gap-1">
                {grupo.lista.map((badge, i) => {
                  const legenda = legendaDe(badge);
                  const novo = novos.has(badge.key);
                  return (
                    <button
                      key={badge.key}
                      type="button"
                      data-testid={`badge-tile-${badge.key}`}
                      data-state={badge.state}
                      data-novo={novo ? 'true' : undefined}
                      aria-label={badge.centroAria || badge.name}
                      onClick={() => setAbertoKey(badge.key)}
                      className={`flex flex-col items-center gap-1.5 text-center min-w-0${novo ? ' badge-salto' : ''}`}
                      style={TILE}
                    >
                      {/* `key` com o playKey: o anel só desenha ao montar, por
                          isso tem de remontar a cada aparecimento — é o padrão
                          do StatusCard com a órbita do Início. */}
                      <BadgeRing key={`${badge.key}-${playKey}`} badge={badge} size={56} index={i} animate={animate} />
                      {/* Spans: isto é um <button>, cujo conteúdo só admite
                          phrasing content (o mesmo achado de 2026-09-15 no
                          PalmaresCard). */}
                      <span className="block w-full text-[10.5px] font-extrabold leading-[1.2]" style={{ color: badge.state === 'empty' ? 'var(--text-4)' : 'var(--text-2)' }}>
                        {badge.name}
                      </span>
                      {legenda && (
                        <span className="block w-full text-[9.5px] font-extrabold uppercase leading-none" style={{ letterSpacing: '.04em', color: badge.state === 'won' ? corDoBadge(badge) : 'var(--text-4)' }}>
                          {legenda}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {maisPerto && (
          <button
            type="button"
            data-testid="badges-progresso"
            onClick={() => setAbertoKey(maisPerto.key)}
            className="w-full flex items-center gap-2.5 text-left"
            style={{ marginTop: 10, minHeight: 44, padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,.04)', border: '1px solid var(--border-glass)' }}
          >
            <span className="flex-1 text-[12px] leading-[1.45]" style={{ color: 'var(--text-3)' }}>
              <span className="font-extrabold" style={{ color: 'var(--text-2)' }}>{maisPerto.name}</span>
              {` — ${maisPerto.linha}`}
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
    </div>
  );
}
