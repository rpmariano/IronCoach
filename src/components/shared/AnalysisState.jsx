import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw } from 'lucide-react';
import Warning, { WarningAction } from './Warning';
import CoachAvatar from '../Coach/CoachAvatar';
import LogoLoader from './LogoLoader';
import CarolCena, { cenaAreaOf } from './CarolCena';
import { prefersReducedMotion } from '../../utils/coachBubbles';
import { useAppStore } from '../../store';
import { todayISO } from '../../lib/utils';

/* A espera com a Carol a dizer o que está a ler (2026-09-19). Cada registo
   por foto são 5 a 15 s de espera; um esqueleto mudo não diz se está a
   andar. Estas frases descrevem o trabalho que a análise faz de facto
   (analyze-meal/run/gym/body) — não são progresso inventado: sucedem-se a
   um ritmo fixo e param na última até a resposta chegar, sem voltar ao
   início (um ciclo lê-se como "está preso"). Passados 12 s, ela diz que
   está a demorar — que é verdade. */
const PASSOS = {
  meal: ['A olhar para o prato…', 'A separar os alimentos…', 'A estimar as quantidades…', 'A fazer as contas às calorias e às macros…'],
  run: ['A ler o print…', 'A tirar a distância, o tempo e o ritmo…', 'A ver os parciais e a frequência cardíaca…', 'A comparar com o que o plano pedia…'],
  gym: ['A ler o treino…', 'A contar séries, repetições e cargas…', 'A juntar ao teu histórico…'],
  body: ['A ler a avaliação…', 'A tirar o peso e a composição…', 'A comparar com a última avaliação…'],
};
/* Sem plano aceite não há o que o plano pedia, e na primeira avaliação não há
   avaliação anterior: a última frase dizia uma comparação que não acontece
   (revisão de 2026-09-26). Listas fixas, não montadas a cada render — o
   useSteps recomeça os passos sempre que a lista muda. */
const PASSOS_SEM_REFERENCIA = {
  run: [...PASSOS.run.slice(0, -1), 'A ver onde encaixa na tua semana…'],
  body: [...PASSOS.body.slice(0, -1), 'A guardar como ponto de partida…'],
};
/* Escrito à mão, ou a editar um registo (bug #49): não há print nem prato
   para ler — "A ler o print…" seria trabalho que não acontece. */
const PASSOS_MANUAL = {
  meal: ['A ler os alimentos…', 'A estimar as quantidades…', 'A fazer as contas às calorias e às macros…'],
  run: ['A ler os teus números…', 'A ver os parciais e a frequência cardíaca…', 'A comparar com o que o plano pedia…'],
  gym: ['A ler o treino…', 'A juntar ao teu histórico…'],
  body: ['A ler a avaliação…', 'A comparar com a última avaliação…'],
};
const PASSOS_MANUAL_SEM_REFERENCIA = {
  run: [...PASSOS_MANUAL.run.slice(0, -1), 'A ver onde encaixa na tua semana…'],
  body: [...PASSOS_MANUAL.body.slice(0, -1), 'A guardar como ponto de partida…'],
};
const PASSO_MS = 2400;
const DEMORA_MS = 12000;

export function analysisSteps(kind, semReferencia = false, manual = false) {
  const [base, semRef] = manual ? [PASSOS_MANUAL, PASSOS_MANUAL_SEM_REFERENCIA] : [PASSOS, PASSOS_SEM_REFERENCIA];
  return (semReferencia && semRef[kind]) || base[kind] || null;
}

/** Se a análise deste tipo não tem com que comparar: corrida sem plano aceite
 *  em curso com corridas, ou a primeira avaliação corporal. */
export function analysisLacksReference(kind, { coachPlans, coachPlanItems, bodyAssessments, today = todayISO() } = {}) {
  if (kind === 'run') {
    // Um plano acabado continua 'aceite', e o analyze-run só compara com o
    // que cobre a data (period_start <= data <= period_end).
    const dia = (v) => String(v || '').slice(0, 10);
    const aceites = new Set((coachPlans || [])
      .filter((p) => p?.status === 'aceite' && dia(p.period_start) <= today && today <= dia(p.period_end))
      .map((p) => p.id));
    return !(coachPlanItems || []).some((i) => i && aceites.has(i.plan_id) && i.kind === 'corrida' && i.status !== 'cancelado');
  }
  if (kind === 'body') return !(bodyAssessments || []).length;
  return false;
}

/** A causa de uma falha, a partir da mensagem técnica — para a Carol dizer o
 *  que aconteceu em vez de um "não consegui" genérico. */
export function classifyAnalysisFailure(detail, online = typeof navigator === 'undefined' ? true : navigator.onLine !== false) {
  const d = String(detail || '');
  if (!online || /failed to fetch|networkerror|network request failed|load failed|offline|sem rede/i.test(d)) return 'offline';
  if (/timeout|timed out|demorou|aborted|tempo esgotado/i.test(d)) return 'timeout';
  // Só o que é mesmo autenticação: "sessão" também é a do ginásio ("Máximo
  // de N imagens por sessão"), e isso não é uma sessão expirada.
  if (/\b401\b|jwt|unauthori[sz]ed|not authenticated|n[aã]o autenticad|session (?:has )?expired|sess[aã]o expirad/i.test(d)) return 'session';
  return 'other';
}

const CAUSA = {
  offline: { title: 'Estás sem rede', lead: 'Sem rede, a foto não chega a sair do telemóvel.' },
  timeout: { title: 'A análise demorou demais', lead: 'A rede está lenta, ou o servidor está ocupado.' },
  session: { title: 'A tua sessão expirou', lead: 'Volta a entrar na app; o que tens aqui não se perde.' },
  other: { title: 'Não consegui analisar', lead: null },
};

function useSteps(steps) {
  const reduced = prefersReducedMotion();
  const [i, setI] = useState(0);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!steps) return undefined;
    const timers = [];
    if (!reduced) {
      for (let k = 1; k < steps.length; k++) timers.push(setTimeout(() => setI(k), k * PASSO_MS));
    }
    timers.push(setTimeout(() => setSlow(true), DEMORA_MS));
    return () => timers.forEach(clearTimeout);
  }, [steps, reduced]);
  return { text: steps ? steps[reduced ? steps.length - 1 : i] : null, slow };
}

/* Os dois estados que faltavam aos registos que dependem da IA (ponto 7 do
   redesenho 6c; auditoria, achado 10: "nenhum estado de espera ou de erro").
   Vivem juntos porque são o mesmo momento visto de dois lados: a espera e a
   espera que falhou. Usados por MealRegistration, RunRegistration,
   GymRegistration e BodyRegistration, sempre com useAnalysis (ver
   src/utils/useAnalysis.js). */

/**
 * AnalysisSkeleton — o esqueleto do mock "Refeição · a analisar": linhas
 * cinzentas a `rgba(255,255,255,.08)` onde os resultados vão aparecer, como
 * o `carol-skeleton` do CarolCard. Nunca substitui o formulário: aparece ao
 * lado dele, que fica bloqueado mas visível, para o atleta continuar a ver o
 * que escreveu.
 *
 * Props:
 *   note  string — a linha por baixo ("Isto leva uns segundos…")
 *   label string — rótulo acessível da região em espera
 */
export function AnalysisSkeleton({
  // Não há aviso nenhum no fim da análise: prometê-lo deixava o atleta à
  // espera de uma coisa que não vem (revisão de 2026-09-26).
  note = 'Isto leva uns segundos. O que escreveste não se perde.',
  label = 'A analisar',
  kind = null,
  manual = false,
}) {
  const coachPlans = useAppStore((s) => s.coachPlans);
  const coachPlanItems = useAppStore((s) => s.coachPlanItems);
  const bodyAssessments = useAppStore((s) => s.bodyAssessments);
  const steps = analysisSteps(kind, analysisLacksReference(kind, { coachPlans, coachPlanItems, bodyAssessments }), manual);
  const step = useSteps(steps);
  const [semCena, setSemCena] = useState(false);
  /* A espera é uma CAMADA FIXA centrada no ecrã visível (pedido do Rui, 2026-10-26): inline,
     no topo do formulário, o atleta no telemóvel tinha de subir para a ver — e o bug #49
     ("não aparece o logotipo", 2026-10-06) tinha-se resolvido fazendo o ecrã subir até ela
     quando a análise começava. Fixa e centrada, fica à vista seja qual for o scroll, e esse
     scroll deixou de ser preciso (sai). Vai para o document.body (um portal): um antepassado com
     transform (as animações de entrada dos ecrãs) prendia o position:fixed ao antepassado.
     Não prende o foco nem o toque (pointer-events: none, sem aria-modal): o formulário já está
     bloqueado por quem a usa, e o atleta continua a poder sair do ecrã. Fica abaixo dos
     modais (z 100) — o «Registo Guardado» do fim nunca fica tapado — e sai quando a análise
     acaba; o erro de análise (AnalysisFailure) continua inline, como sempre. */
  const alturaCena = typeof window === 'undefined' ? 200 : Math.max(96, Math.min(200, Math.round(window.innerHeight * 0.3)));
  const camada = (
    <div
      data-testid="analysis-skeleton"
      role="status"
      aria-live="polite"
      aria-label={label}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))',
        background: 'rgba(7,12,20,.74)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, maxWidth: 320, textAlign: 'center' }}>
        {/* O logotipo durante a análise (bug #49): desenha-se uma vez e fica a respirar até a
            resposta chegar — não recomeça, que um desenho em loop lê-se como "está preso" (ver
            LogoLoader). Decorativo: quem anuncia a espera é o role="status" desta camada. */}
        <div data-testid="analysis-logo" className="flex flex-col items-center" style={{ gap: 10, paddingTop: 4 }}>
          {/* A cena tem a altura reservada enquanto pode vir (sem salto de layout). */}
          <div className="flex items-center justify-center" style={{ minHeight: cenaAreaOf(kind) && !semCena ? alturaCena : undefined }}>
            <CarolCena kind={kind} size={alturaCena} fallback={<LogoLoader size={64} label={null} />} onFalhou={() => setSemCena(true)} />
          </div>
          {/* A Carol a trabalhar: a linha fixa por cima das frases (que descrevem o que a análise faz). */}
          <span data-testid="analysis-carol-line" style={{ fontSize: 11, fontWeight: 800, letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-4)' }}>
            A Carol está a analisar
          </span>
          {steps && (
            <div data-testid="analysis-step" className="flex items-center justify-center" style={{ gap: 10 }}>
              <span className="min-w-0 text-center" style={{ fontSize: 13, fontWeight: 700, color: 'var(--coach-soft)' }}>
                <span key={step.text} className="fade-in" style={{ display: 'inline-block' }}>{step.slow ? 'Está a demorar mais do que o costume. Continuo.' : step.text}</span>
              </span>
              <span className="inline-flex items-center" style={{ gap: 4 }} aria-hidden="true">
                <span className="coach-typing-dot" />
                <span className="coach-typing-dot" style={{ animationDelay: '150ms' }} />
                <span className="coach-typing-dot" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          )}
        </div>
        {note && (
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', lineHeight: 1.55, color: 'var(--text-muted)' }}>
            {note}
          </p>
        )}
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(camada, document.body) : camada;
}

/**
 * AnalysisFailure — o aviso coral do mock "Refeição · análise falhou". O
 * texto é o do mock e segue a regra da Carol (CAROL.md, "O que evitar"):
 * nunca "Desculpa, não consegui analisar" — diz o que aconteceu, garante que
 * nada se perdeu e oferece as duas saídas, ambas com 44px.
 *
 * `detail` é a mensagem técnica da Edge Function (timeout, 401, resposta
 * inválida). Não está no mock — o mock não pode saber o que o servidor
 * respondeu — mas fica, a 11px e apagada, porque é ela que torna um relatório
 * de bug utilizável e é ela que distingue "tenta outra vez" de "isto não vai
 * resolver-se sozinho".
 *
 * Props:
 *   children     o corpo do aviso (o que aconteceu e o que fazer)
 *   detail       string — a mensagem técnica, opcional
 *   onRetry      repete a análise com os mesmos dados
 *   onManual     alternativa manual; sem ela, só aparece "Tentar de novo"
 *   manualLabel  rótulo da alternativa (mock: "Escrever")
 *   retrying     bool — desativa as ações enquanto a repetição corre
 */
export function AnalysisFailure({
  title,
  children,
  detail,
  onRetry,
  onManual,
  manualLabel = 'Escrever',
  retrying = false,
  ...rest
}) {
  // A causa diz-se primeiro (sem rede, rede lenta, sessão); o que fazer vem
  // de quem monta (`children`), porque depende do registo.
  const causa = CAUSA[classifyAnalysisFailure(detail)];
  /* O aviso vive no topo do formulário, e o botão que lançou a análise está
     na barra de baixo: com o formulário descido (a juntar prints), a falha
     aparecia fora do ecrã e a app parecia ter parado sem dizer nada
     (relatado 2026-09-24). Ao aparecer, traz-se o aviso à vista. */
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  }, []);
  return (
    <Warning
      ref={ref}
      tone="warn"
      title={title || causa.title}
      icon={<CoachAvatar size={20} mood="worried" />}
      data-cause={classifyAnalysisFailure(detail)}
      data-testid="analysis-failure"
      style={{ marginBottom: 16 }}
      actions={
        <>
          {onRetry && (
            <WarningAction
              tone="warn"
              onClick={onRetry}
              disabled={retrying}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
            >
              <RefreshCw size={14} /> Tentar de novo
            </WarningAction>
          )}
          {onManual && (
            <button
              type="button"
              onClick={onManual}
              disabled={retrying}
              style={{
                minHeight: 'var(--tap)',
                padding: '0 15px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(255,255,255,.14)',
                background: 'rgba(255,255,255,.05)',
                color: 'var(--text-3)',
                fontSize: 'var(--text-sm)',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {manualLabel}
            </button>
          )}
        </>
      }
      {...rest}
    >
      {causa.lead && <>{causa.lead} </>}
      {children}
      {detail && (
        <span
          data-testid="analysis-failure-detail"
          style={{ display: 'block', marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}
        >
          {detail}
        </span>
      )}
    </Warning>
  );
}

export default AnalysisFailure;
