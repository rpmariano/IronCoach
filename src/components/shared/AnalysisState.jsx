import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import Warning, { WarningAction } from './Warning';
import CoachAvatar from '../Coach/CoachAvatar';
import { prefersReducedMotion } from '../../utils/coachBubbles';
import { useAppStore } from '../../store';

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
const PASSO_MS = 2400;
const DEMORA_MS = 12000;

export function analysisSteps(kind, semReferencia = false) {
  return (semReferencia && PASSOS_SEM_REFERENCIA[kind]) || PASSOS[kind] || null;
}

/** Se a análise deste tipo não tem com que comparar: corrida sem plano aceite
 *  com corridas, ou a primeira avaliação corporal. */
export function analysisLacksReference(kind, { coachPlans, coachPlanItems, bodyAssessments } = {}) {
  if (kind === 'run') {
    const aceites = new Set((coachPlans || []).filter((p) => p?.status === 'aceite').map((p) => p.id));
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
}) {
  const coachPlans = useAppStore((s) => s.coachPlans);
  const coachPlanItems = useAppStore((s) => s.coachPlanItems);
  const bodyAssessments = useAppStore((s) => s.bodyAssessments);
  const steps = analysisSteps(kind, analysisLacksReference(kind, { coachPlans, coachPlanItems, bodyAssessments }));
  const step = useSteps(steps);
  const line = (width, height = 12) => (
    <span
      style={{
        display: 'block',
        height,
        width,
        borderRadius: 5,
        background: 'rgba(255,255,255,.07)',
      }}
    />
  );

  return (
    <div
      data-testid="analysis-skeleton"
      role="status"
      aria-live="polite"
      aria-label={label}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}
    >
      {steps && (
        <div data-testid="analysis-step" className="flex items-center" style={{ gap: 10 }}>
          <CoachAvatar size={28} mood="thinking" />
          <span className="flex-1 min-w-0" style={{ fontSize: 13, fontWeight: 700, color: 'var(--coach-soft)' }}>
            <span key={step.text} className="fade-in" style={{ display: 'inline-block' }}>{step.slow ? 'Está a demorar mais do que o costume. Continuo.' : step.text}</span>
          </span>
          <span className="inline-flex items-center" style={{ gap: 4 }} aria-hidden="true">
            <span className="coach-typing-dot" />
            <span className="coach-typing-dot" style={{ animationDelay: '150ms' }} />
            <span className="coach-typing-dot" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      )}
      <div
        style={{
          borderRadius: 'var(--radius-xl)',
          background: 'rgba(255,255,255,.04)',
          border: '1px solid rgba(255,255,255,.1)',
          padding: 16,
        }}
      >
        <span style={{ display: 'block', height: 14, width: '60%', borderRadius: 5, background: 'rgba(255,255,255,.09)' }} />
        <span style={{ display: 'block', height: 26, width: '38%', borderRadius: 6, background: 'rgba(255,255,255,.09)', marginTop: 12 }} />
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          {line('100%')}
          {line('100%')}
          {line('100%')}
        </div>
      </div>

      <div
        style={{
          borderRadius: 'var(--radius-xl)',
          background: 'rgba(255,255,255,.04)',
          border: '1px solid rgba(255,255,255,.1)',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 11,
        }}
      >
        {line('72%')}
        {line('54%')}
      </div>

      {note && (
        <p style={{ margin: '2px 2px 0', fontSize: 'var(--text-xs)', lineHeight: 1.55, color: 'var(--text-muted)' }}>
          {note}
        </p>
      )}
    </div>
  );
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
