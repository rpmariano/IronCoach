import React from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import Warning, { WarningAction } from './Warning';

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
 *   note  string — a linha por baixo ("Podes continuar a usar a app…")
 *   label string — rótulo acessível da região em espera
 */
export function AnalysisSkeleton({
  note = 'Podes continuar a usar a app — aviso-te quando estiver pronto.',
  label = 'A analisar',
}) {
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
  title = 'Não consegui analisar',
  children,
  detail,
  onRetry,
  onManual,
  manualLabel = 'Escrever',
  retrying = false,
  ...rest
}) {
  return (
    <Warning
      tone="warn"
      title={title}
      icon={<CloudOff size={14} />}
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
