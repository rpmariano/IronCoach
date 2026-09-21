import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Gauge, Lock } from 'lucide-react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import GlassCard from '../shared/GlassCard';
import SubNav from '../shared/SubNav';
import SectionLabel from '../shared/SectionLabel';
import Warning from '../shared/Warning';
import Button from '../shared/Button';
import { Sheet, useEscapeClose } from '../shared/Sheet';
import { ageFromBirthDate } from '../../utils/body';
import { todayISO } from '../../lib/utils';
import {
  AGE_BANDS_BY_GENDER,
  N_BAND_LABELS,
  TERRAIN_LABELS,
  ageBandLabel,
  densityCurve,
  isTruncated,
  percentileFrom,
  percentileSentence,
  segmentMedian,
  segmentTopDecile,
  widerSegments,
} from '../../utils/percentile';
import { evaluatePrescriptions } from '@formulas/prescriptionAdherence.ts';
import { ageBandFor, terrainForAthlete, WINDOW_DAYS } from '@formulas/percentileSegments.ts';

/* "Onde estás" — o percentil dentro do escalão (gamificação, Fase 5).
   Abre-se do Palmarés, no separador Provas, e é um ecrã inteiro como os
   registos de um medalhão (MedalhaoContribSheet): portal em document.body,
   cabeçalho com o recuo, e o Escape pela pilha partilhada da Sheet.

   Duas regras que mandam em tudo o que está aqui:

   1. NÃO HÁ NOMES NESTE ECRÃ, nem sequer por baixo. O que se lê do servidor
      são linhas de percentile_snapshots — agregados de pelo menos 20 atletas,
      sem user_id nenhum. O índice do PRÓPRIO atleta é calculado aqui, no
      telemóvel dele, com a mesma fórmula que a tarefa de agregação usa
      (@formulas/prescriptionAdherence.ts): nunca sai daqui para lado nenhum.

   2. O DENOMINADOR DIZ-SE SEMPRE. O segmento aparece escrito na frase e na
      linha do tamanho, e alargá-lo é uma escolha explícita — a app nunca
      troca o grupo de comparação em silêncio para ter um número mais
      simpático para mostrar. */

/* O seletor de métrica. Uma só, por agora — é a única que a base aceita
   (check `metric in ('plan_execution')`). Fica como seletor, e não como
   título, porque é o sítio onde as próximas entram. */
const METRICAS = [
  { key: 'plan_execution', label: 'Plano', srLabel: 'Execução do plano', icon: <Gauge size={14} />, tone: 'ok' },
];

/* As colunas que o cliente pode pedir. `n` e `stale_at` NÃO estão aqui, e não
   é por educação: os GRANTs por coluna da migração recusam-nas, e um
   `select('*')` sobre esta tabela falha de propósito. O que se lê é a banda
   do tamanho, nunca o tamanho. */
const COLUNAS = 'metric, age_band, gender, terrain, window_start, window_end, n_band, boundaries, computed_at';

const CARD_SECUNDARIO = { background: 'var(--surface-glass)', border: '1px solid var(--border-glass)', borderRadius: 18 };

function formatarJanela(inicio, fim) {
  const dia = (iso) => {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' }).replace('.', '');
  };
  // window_end é exclusivo: o último dia da janela é o anterior.
  const ultimo = new Date(Date.parse(`${fim}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  return `${dia(inicio)} a ${dia(ultimo)}`;
}

/* A curva da distribuição, com a marca do atleta. Desenhada só com as 19
   fronteiras publicadas — entre duas há sempre 5% das pessoas, por isso onde
   elas estão mais juntas está mais gente. Não é um histograma: um histograma
   tinha contagens por caixa, e contagens por caixa voltavam a ser pessoas. */
function CurvaDistribuicao({ boundaries, valor, percentil }) {
  const pontos = useMemo(() => densityCurve(boundaries), [boundaries]);
  if (!pontos.length) return null;

  const L = 10; const R = 290; const TOPO = 10; const BASE = 74;
  const min = Math.min(pontos[0].x, valor ?? pontos[0].x);
  const max = Math.max(pontos[pontos.length - 1].x, valor ?? pontos[pontos.length - 1].x);
  const span = Math.max(max - min, 1);
  const px = (v) => L + ((v - min) / span) * (R - L);
  const py = (y) => BASE - y * (BASE - TOPO);

  const linha = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join(' ');
  const area = `${linha} L ${px(pontos[pontos.length - 1].x).toFixed(1)} ${BASE} L ${px(pontos[0].x).toFixed(1)} ${BASE} Z`;
  const marca = valor != null ? px(valor) : null;

  return (
    <svg
      viewBox="0 0 300 88"
      width="100%"
      height="88"
      role="img"
      aria-label={percentil != null
        ? `Curva da distribuição do segmento, com a tua marca no percentil ${percentil}.`
        : 'Curva da distribuição do segmento.'}
      style={{ display: 'block', marginTop: 12 }}
    >
      <path d={area} fill="rgba(52,211,153,.10)" />
      <path d={linha} fill="none" stroke="rgba(52,211,153,.45)" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1={L} y1={BASE} x2={R} y2={BASE} stroke="var(--border-glass)" strokeWidth="1" />
      {marca != null && (
        <>
          <line x1={marca} y1={TOPO - 4} x2={marca} y2={BASE} stroke="var(--ok)" strokeWidth="2" />
          <circle cx={marca} cy={TOPO - 4} r="4" fill="var(--ok)" />
          <text x={Math.min(Math.max(marca, 22), R - 22)} y={85} textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--ok)">tu</text>
        </>
      )}
    </svg>
  );
}

/* "Como se lê": três barras na mesma escala — a do atleta, a mediana do
   escalão e o patamar dos 10% do topo. É o cartão que impede a leitura
   errada do número grande ("70% é pouco?"). */
function ComoSeLe({ valor, mediana, topo }) {
  if (mediana == null || topo == null) return null;
  const max = Math.max(valor ?? 0, mediana, topo, 1);
  const barras = [
    { label: 'Tu', v: valor, cor: 'var(--ok)' },
    { label: 'Mediana do escalão', v: mediana, cor: 'var(--text-4)' },
    { label: 'Os 10% do topo', v: topo, cor: 'var(--coach)' },
  ];
  return (
    <div style={{ ...CARD_SECUNDARIO, padding: 14 }} data-testid="onde-estas-como-se-le">
      <h3 className="m-0 text-[13.5px] font-extrabold" style={{ color: 'var(--text-1)' }}>Como se lê</h3>
      <p className="m-0 text-[11.5px] mt-1" style={{ color: 'var(--text-4)', lineHeight: 'var(--leading-normal)' }}>
        O índice é a parte do plano que cumpriste nestes {WINDOW_DAYS} dias. Estas são as três referências do teu segmento.
      </p>
      <div className="flex flex-col gap-2 mt-3">
        {barras.map((b) => (
          <div key={b.label}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--text-4)' }}>{b.label}</span>
              <span className="text-[12.5px] font-extrabold" style={{ color: b.cor, fontVariantNumeric: 'tabular-nums' }}>
                {b.v == null ? '—' : String(Math.round(b.v * 10) / 10).replace('.', ',')}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,.06)', marginTop: 4, overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(((b.v ?? 0) / max) * 100, 2)}%`, height: '100%', background: b.cor, opacity: b.v == null ? 0.25 : 0.85 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OndeEstasScreen({ onClose, onOpenTabelas }) {
  const { profile, runs, gymSessions, coachPlanItems, raceEvents } = useAppStore();
  useEscapeClose(onClose);

  const [metric, setMetric] = useState('plan_execution');
  const [snapshots, setSnapshots] = useState(null);   // null = ainda a carregar
  const [erro, setErro] = useState(false);
  const [seletor, setSeletor] = useState(null);       // 'escalao' | 'modalidade' | 'janela'

  const consentiu = !!profile?.stats_pool_consent_at;

  // O segmento do próprio atleta, derivado do perfil. Continua a ser derivado
  // mesmo sem consentimento: é o que permite dizer-lhe, no ecrã de entrada, em
  // que segmento é que ele entraria.
  const segmentoProprio = useMemo(() => {
    const ageBand = ageBandFor(ageFromBirthDate(profile?.birth_date), profile?.gender);
    const terrain = terrainForAthlete(raceEvents, todayISO());
    return ageBand && terrain ? { ageBand, gender: profile.gender, terrain } : null;
  }, [profile, raceEvents]);

  const [segmento, setSegmento] = useState(null);
  const [janelaEscolhida, setJanelaEscolhida] = useState(null);
  useEffect(() => { if (segmentoProprio && !segmento) setSegmento(segmentoProprio); }, [segmentoProprio, segmento]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data, error } = await supabase
        .from('percentile_snapshots')
        .select(COLUNAS)
        .eq('metric', metric)
        .order('window_start', { ascending: false })
        .limit(400);
      if (!vivo) return;
      if (error) { setErro(true); setSnapshots([]); return; }
      setSnapshots(data || []);
    })();
    return () => { vivo = false; };
  }, [metric]);

  // As janelas publicadas, da mais recente para trás.
  const janelas = useMemo(() => {
    const vistas = new Map();
    for (const s of snapshots || []) if (!vistas.has(s.window_start)) vistas.set(s.window_start, s);
    return [...vistas.values()].sort((a, b) => b.window_start.localeCompare(a.window_start));
  }, [snapshots]);
  const janela = janelas.find((j) => j.window_start === janelaEscolhida) || janelas[0] || null;

  const snapshot = useMemo(() => {
    if (!segmento || !janela) return null;
    return (snapshots || []).find((s) => s.age_band === segmento.ageBand && s.gender === segmento.gender
      && s.terrain === segmento.terrain && s.window_start === janela.window_start) || null;
  }, [snapshots, segmento, janela]);

  /* O índice do atleta, calculado AQUI com a mesma fórmula do servidor
     (@formulas/prescriptionAdherence.ts, o mesmo ficheiro — não uma cópia).
     Nunca é enviado para lado nenhum: o que o servidor sabe dele é que é mais
     um no `n` de um segmento. */
  const meuIndice = useMemo(() => {
    if (!janela) return null;
    return evaluatePrescriptions({
      items: coachPlanItems, runs, gym: gymSessions, mealsByDate: {},
    }, janela.window_end, WINDOW_DAYS).executionScore;
  }, [coachPlanItems, runs, gymSessions, janela]);

  const percentil = snapshot ? percentileFrom(meuIndice, snapshot.boundaries) : null;
  const frase = percentileSentence(percentil, segmento || {});
  const alargamentos = segmento ? widerSegments(segmento) : [];

  const conteudo = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Onde estás — o teu percentil"
      data-testid="onde-estas-screen"
      className="fixed inset-0 z-[80] flex flex-col fade-in"
      style={{ background: 'var(--bg-app)' }}
    >
      <div className="flex items-center gap-2.5 shrink-0" style={{ minHeight: 52, padding: '8px 14px', borderBottom: '1px solid var(--border-glass)' }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Voltar ao Palmarés"
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 44, height: 44, background: 'none', border: 'none', color: 'var(--text-3)' }}
        >
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--race)' }}>Palmarés</div>
          <div className="text-[14.5px] font-extrabold truncate" style={{ color: 'var(--text-1)' }}>Onde estás</div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-2" style={{ padding: '12px 18px calc(26px + env(safe-area-inset-bottom, 0px))' }}>
        <SubNav
          items={METRICAS}
          activeIndex={Math.max(0, METRICAS.findIndex((m) => m.key === metric))}
          onChange={(_, item) => setMetric(item.key)}
        />

        {!consentiu ? (
          /* Sem consentimento não se mostra percentil nenhum. Dava para
             mostrar — o índice é dele e a distribuição é pública — mas isso
             era servir-se do denominador sem entrar nele, e a entrada é
             precisamente a decisão que este ecrã existe para respeitar. */
          <GlassCard radius={24} padding={16} data-testid="onde-estas-sem-consentimento">
            <Lock size={18} aria-hidden="true" style={{ color: 'var(--text-4)' }} />
            <h3 className="m-0 text-[16px] font-black mt-2" style={{ letterSpacing: 'var(--tracking-tight)', color: 'var(--text-1)' }}>
              Ainda não entraste na média
            </h3>
            <p className="m-0 text-[12.5px] mt-1.5" style={{ color: 'var(--text-3)', lineHeight: 'var(--leading-normal)' }}>
              Para veres onde estás, o teu índice tem de contar para a média do teu escalão — e isso é uma decisão tua.
              Não passa a haver nome nenhum: entras num denominador, não numa lista.
            </p>
            <Button variant="module" moduleColor="var(--ok)" className="w-full mt-3" onClick={onOpenTabelas}>Ver o que isso implica</Button>
          </GlassCard>
        ) : !segmentoProprio ? (
          <Warning tone="warn" title="Falta saber o teu segmento">
            Para te comparar é preciso a data de nascimento e o género (no Perfil) e uma prova marcada ou corrida
            nos últimos 90 dias — é a prova que diz se preparas estrada ou trail.
          </Warning>
        ) : snapshots === null ? (
          <p className="text-[12px] m-0 pt-2" style={{ color: 'var(--text-4)' }} role="status">A ler as distribuições…</p>
        ) : erro ? (
          <Warning tone="danger" title="Não foi possível ler as distribuições">Tenta outra vez daqui a pouco.</Warning>
        ) : !snapshot ? (
          /* SEGMENTO PEQUENO — dito, nunca escondido. Não se cola o atleta a
             outro grupo por conta própria para ter um número para mostrar. */
          <GlassCard radius={24} padding={16} data-testid="onde-estas-segmento-pequeno">
            <h3 className="m-0 text-[16px] font-black" style={{ letterSpacing: 'var(--tracking-tight)', color: 'var(--text-1)' }}>
              O teu segmento ainda é pequeno
            </h3>
            <p className="m-0 text-[12.5px] mt-1.5" style={{ color: 'var(--text-3)', lineHeight: 'var(--leading-normal)' }}>
              Não há distribuição publicada para {ageBandLabel(segmento?.ageBand)} em {TERRAIN_LABELS[segmento?.terrain]}.
              Só se publica um segmento com 20 atletas ou mais — abaixo disso, uma média já falava de pessoas em concreto.
            </p>
            <SectionLabel style={{ margin: '14px 2px 0' }}>Comparar com outro grupo</SectionLabel>
            <div className="flex flex-col gap-2 mt-2">
              {alargamentos.map((passo) => (
                <button
                  key={`${passo.step}-${passo.segment.ageBand}-${passo.segment.terrain}-${passo.segment.gender}`}
                  type="button"
                  data-testid={`onde-estas-alargar-${passo.step}`}
                  onClick={() => setSegmento(passo.segment)}
                  className="w-full flex items-center gap-2.5 text-left"
                  style={{ ...CARD_SECUNDARIO, minHeight: 44, padding: '10px 12px' }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-extrabold" style={{ color: 'var(--text-1)' }}>{passo.label}</span>
                    <span className="block text-[11px] mt-[2px]" style={{ color: 'var(--text-4)' }}>{passo.detail}</span>
                  </span>
                  <ChevronRight size={15} className="shrink-0" aria-hidden="true" style={{ color: 'var(--text-4)' }} />
                </button>
              ))}
            </div>
            {segmentoProprio && segmento && (segmento.ageBand !== segmentoProprio.ageBand
              || segmento.gender !== segmentoProprio.gender || segmento.terrain !== segmentoProprio.terrain) && (
              <button
                type="button"
                onClick={() => setSegmento(segmentoProprio)}
                className="w-full text-[12px] font-bold mt-2"
                style={{ minHeight: 44, background: 'none', border: 'none', color: 'var(--text-4)' }}
              >
                Voltar ao meu escalão
              </button>
            )}
          </GlassCard>
        ) : (
          <>
            <GlassCard radius={24} padding={16} data-testid="onde-estas-percentil">
              <div className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--text-4)' }}>
                O teu percentil
              </div>
              <div
                className="mt-1"
                style={{ fontSize: 44, fontWeight: 900, lineHeight: 'var(--leading-tight)', letterSpacing: 'var(--tracking-title)', color: 'var(--ok)', fontVariantNumeric: 'tabular-nums' }}
                data-testid="onde-estas-numero"
              >
                {percentil ?? '—'}
              </div>
              {isTruncated(percentil) && (
                <div className="text-[11px] font-extrabold uppercase mt-1" style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--text-4)' }}>
                  {percentil === 95 ? 'ou mais' : 'ou menos'} — os extremos não se dizem ao certo
                </div>
              )}
              <p className="m-0 text-[12.5px] mt-1.5" style={{ color: 'var(--text-3)', lineHeight: 'var(--leading-normal)' }}>
                {frase || 'Ainda não há índice para esta janela: não houve plano nenhum nestes dias.'}
              </p>
              <CurvaDistribuicao boundaries={snapshot.boundaries} valor={meuIndice} percentil={percentil} />
            </GlassCard>

            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'escalao', label: 'Escalão', valor: ageBandLabel(segmento.ageBand) },
                { key: 'modalidade', label: 'Modalidade', valor: TERRAIN_LABELS[segmento.terrain] },
                { key: 'janela', label: 'Janela', valor: formatarJanela(janela.window_start, janela.window_end) },
              ].map((b) => (
                <button
                  key={b.key}
                  type="button"
                  data-testid={`onde-estas-seletor-${b.key}`}
                  onClick={() => setSeletor(b.key)}
                  className="text-left min-w-0"
                  style={{ ...CARD_SECUNDARIO, minHeight: 56, padding: '9px 10px' }}
                >
                  <span className="block text-[11px] font-extrabold uppercase truncate" style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--text-4)' }}>{b.label}</span>
                  <span className="block text-[12px] font-extrabold mt-[2px] truncate" style={{ color: 'var(--text-1)' }}>{b.valor}</span>
                </button>
              ))}
            </div>

            <ComoSeLe valor={meuIndice} mediana={segmentMedian(snapshot.boundaries)} topo={segmentTopDecile(snapshot.boundaries)} />

            <Warning tone="ok" title="Privacidade">
              Aqui não há nomes nem lugares. Entras na média do teu escalão e mais nada.
            </Warning>

            <p className="m-0 text-[11px] text-center" data-testid="onde-estas-n-band" style={{ color: 'var(--text-4)' }}>
              {N_BAND_LABELS[snapshot.n_band] || snapshot.n_band} · {formatarJanela(snapshot.window_start, snapshot.window_end)}
            </p>

            <button
              type="button"
              data-testid="onde-estas-ver-tabelas"
              onClick={onOpenTabelas}
              className="w-full flex items-center justify-between text-left text-[12.5px] font-bold"
              style={{ ...CARD_SECUNDARIO, minHeight: 52, padding: '4px 16px', color: 'var(--text-3)', marginTop: 4 }}
            >
              As tabelas com nomes
              <ChevronRight size={15} className="shrink-0" aria-hidden="true" style={{ color: 'var(--text-4)' }} />
            </button>
          </>
        )}
      </div>

      {seletor === 'escalao' && (
        <Sheet eyebrow="Onde estás" eyebrowTone="race" onClose={() => setSeletor(null)} testId="onde-estas-sheet-escalao">
          <SectionLabel style={{ margin: '12px 2px 0' }}>Escalão</SectionLabel>
          <p className="text-[11.5px] mt-1 mb-2" style={{ color: 'var(--text-4)' }}>
            Mudar o escalão muda o grupo com quem te comparas — fica sempre escrito no cartão.
          </p>
          <div className="flex flex-col gap-2 pb-1">
            {(AGE_BANDS_BY_GENDER[segmento?.gender] || []).map((band) => (
              <button
                key={band}
                type="button"
                onClick={() => { setSegmento((s) => ({ ...s, ageBand: band })); setSeletor(null); }}
                className="w-full text-left text-[12.5px] font-extrabold"
                style={{ ...CARD_SECUNDARIO, minHeight: 44, padding: '10px 12px', color: band === segmento?.ageBand ? 'var(--ok)' : 'var(--text-1)' }}
              >
                {ageBandLabel(band)}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {seletor === 'modalidade' && (
        <Sheet eyebrow="Onde estás" eyebrowTone="race" onClose={() => setSeletor(null)} testId="onde-estas-sheet-modalidade">
          <SectionLabel style={{ margin: '12px 2px 0' }}>Modalidade</SectionLabel>
          <div className="flex flex-col gap-2 mt-2 pb-1">
            {['estrada', 'trail'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setSegmento((s) => ({ ...s, terrain: t })); setSeletor(null); }}
                className="w-full text-left text-[12.5px] font-extrabold"
                style={{ ...CARD_SECUNDARIO, minHeight: 44, padding: '10px 12px', color: t === segmento?.terrain ? 'var(--ok)' : 'var(--text-1)' }}
              >
                {TERRAIN_LABELS[t]}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {seletor === 'janela' && (
        <Sheet eyebrow="Onde estás" eyebrowTone="race" onClose={() => setSeletor(null)} testId="onde-estas-sheet-janela">
          <SectionLabel style={{ margin: '12px 2px 0' }}>Janela</SectionLabel>
          <p className="text-[11.5px] mt-1 mb-2" style={{ color: 'var(--text-4)' }}>
            São {WINDOW_DAYS} dias de cada vez, iguais para toda a gente, e não se sobrepõem.
          </p>
          <div className="flex flex-col gap-2 pb-1">
            {janelas.map((j) => (
              <button
                key={j.window_start}
                type="button"
                onClick={() => { setJanelaEscolhida(j.window_start); setSeletor(null); }}
                className="w-full text-left text-[12.5px] font-extrabold"
                style={{ ...CARD_SECUNDARIO, minHeight: 44, padding: '10px 12px', color: j.window_start === janela?.window_start ? 'var(--ok)' : 'var(--text-1)' }}
              >
                {formatarJanela(j.window_start, j.window_end)}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(conteudo, document.body) : conteudo;
}
