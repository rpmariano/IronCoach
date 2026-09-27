import React, { useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../store';
import Button from '../shared/Button';
import { Dialog } from '../shared/Sheet';
import { useToast } from '../shared/ToastProvider';
import { CupPrevisao, provaDoAtleta } from './CupBits';
import { CupLink } from './CupClassificacao';
import { intentLabel, roleReasonLabel } from '../../utils/cupCalendar';
import { cupRoundPrediction } from '../../utils/cupWeek';
import { entryDeadlineNotice } from '@formulas/cup.ts';

/* O papel numa jornada e o prazo de inscrição (specs/trofeu.md §4.4, Fase 3)
   — o mesmo bloco na folha da jornada (ecrã do Troféu) e no hub da prova.
   2026-09-27.

   - O papel proposto sai do mesmo cálculo da Carol (cupRoundRoles, na
     vista); o atleta aceita-o ou escolhe outro — a escolha dele manda
     (intent_source 'atleta'). "Saltar" é também "Não vou": a prova sai do
     calendário, por isso pede confirmação — também no "Aceitar: saltar".
     `onBeforeLeave` (o hub) corre antes de gravar o salto e pode recusar
     (devolve false): nada se grava.
   - ESCOLHER NÃO É GRAVAR (revisão da Fase 3). Nos rádios nativos as setas
     mudam a seleção e disparam `change`: gravar aí fazia de cada papel por
     onde o teclado ou o leitor de ecrã passava uma escrita com aviso, e ao
     chegar a "Saltar" abria o diálogo sem ele ter escolhido nada. Como na
     folha da jornada, o grupo só muda o rascunho e "Guardar" grava; depois
     de gravar, o foco volta ao "Mudar o papel" (o grupo fecha-se).
   - A PREVISÃO NÃO SE GRAVA (§2.6): calcula-se aqui a cada render
     (cupRoundPrediction) e mostra-se com o ícone de cálculo. Só ao lado de
     "atacar" e "controlar" — um tempo de prova ao lado de "em trote" ou
     "saltar" lia-se como um objetivo.
   - O prazo (§4.4) é a régua partilhada com o push da Fase 5
     (entryDeadlineNotice): "por jornada", "Vou", sem "Já me inscrevi", sem
     "o meu clube", data confirmada, nos próximos 7 dias.

   Os textos dizem "a jornada 3", nunca "a {nome}": o nome de uma prova não
   diz o género ("a Légua", "o Corta-mato"). */

const INTENTS = [
  { value: 'atacar', label: 'Atacar' },
  { value: 'controlar', label: 'Controlar' },
  { value: 'trote', label: 'Em trote' },
  { value: 'saltar', label: 'Saltar' },
];

const PREDICTION_INTENTS = new Set(['atacar', 'controlar']);

const BOTAO = { minHeight: 44 };

/** "jornada 3" — o rótulo da competição e o número. */
export function jornadaDe(view, round) {
  return `${String(view?.roundLabel || 'Jornada').toLowerCase()} ${round?.round_no ?? ''}`.trim();
}

export default function CupRoundPlanControls({ view, round, onBeforeLeave }) {
  const setCupRoundIntent = useAppStore((s) => s.setCupRoundIntent);
  const markCupEntryDone = useAppStore((s) => s.markCupEntryDone);
  const profile = useAppStore((s) => s.profile);
  const runs = useAppStore((s) => s.runs);
  const { showToast } = useToast();
  const [mudar, setMudar] = useState(false);
  // O papel escolhido no grupo e ainda por gravar (null: nada mexido).
  const [escolha, setEscolha] = useState(null);
  const [confirmarSaltar, setConfirmarSaltar] = useState(false);
  const [busy, setBusy] = useState(null); // 'papel' | 'saltar' | 'inscricao' | null
  const mudarRef = useRef(null);
  const grupoRef = useRef(null);

  const proposto = round?.role?.intent && intentLabel(round.role.intent) ? round.role.intent : null;
  const escolhido = round?.participation?.intent != null && round.participation.intent_source === 'atleta' && intentLabel(round.participation.intent)
    ? round.participation.intent
    : null;
  const efetivo = escolhido || proposto;
  const previsao = useMemo(
    () => (round && PREDICTION_INTENTS.has(efetivo) ? cupRoundPrediction(round, profile, runs) : null),
    [round, efetivo, profile, runs],
  );

  if (!view?.enrollment || !round) return null;

  const which = jornadaDe(view, round);
  const razao = roleReasonLabel(round.role, view);

  const gravarPapel = async (intent) => {
    setBusy('papel');
    const res = await setCupRoundIntent(round.id, intent);
    setBusy(null);
    if (!res?.ok) {
      showToast(res?.error?.message || 'Não foi possível gravar o papel.', 'error');
      // O "Guardar" estava a gravar (desativado): o foco volta ao grupo.
      grupoRef.current?.querySelector('input:checked')?.focus();
      return;
    }
    setMudar(false);
    setEscolha(null);
    showToast(`Papel na ${which}: ${intentLabel(intent)}.`, 'success');
    // O grupo e o botão que gravou desaparecem: o foco não cai no body.
    mudarRef.current?.focus();
  };

  const guardarEscolha = () => {
    if (!escolha || busy) return;
    if (escolha === 'saltar') setConfirmarSaltar(true);
    else gravarPapel(escolha);
  };

  const saltar = async () => {
    setBusy('saltar');
    // No hub, a prova vai sair do calendário: fecha-se antes de gravar. O hub
    // pode recusar (alterações por gravar: o navGuard pergunta "sair sem
    // gravar?" — revisão da Fase 3, aviso [c]); aí nada se grava.
    if (onBeforeLeave && onBeforeLeave() === false) {
      setBusy(null);
      setConfirmarSaltar(false);
      return;
    }
    const res = await setCupRoundIntent(round.id, 'saltar');
    if (!onBeforeLeave) { setBusy(null); setConfirmarSaltar(false); }
    if (!res?.ok) { showToast(res?.error?.message || 'Não foi possível gravar.', 'error'); return; }
    showToast(`A ${which} ficou como «Não vou».`, 'success');
  };

  const marcarInscricao = async (done) => {
    setBusy('inscricao');
    const res = await markCupEntryDone(round.id, done);
    setBusy(null);
    if (!res?.ok) showToast(res?.error?.message || 'Não foi possível gravar.', 'error');
  };

  // O prazo, calculado agora (o relógio real, não o dia da vista).
  const notice = entryDeadlineNotice({
    entryMode: view.edition?.entry_mode ?? null,
    entryBy: view.enrollment.entry_by ?? null,
    decision: round.participation?.decision ?? null,
    entryDoneAt: round.participation?.entry_done_at ?? null,
    dateStatus: round.date_status ?? null,
    deadlineAt: round.entry_deadline_at ?? null,
    now: new Date(),
    timeZone: view.edition?.time_zone ?? null,
  });
  const day = typeof round.date === 'string' ? round.date.slice(0, 10) : null;
  const jaInscrito = !!round.participation?.entry_done_at
    && view.edition?.entry_mode === 'por_jornada'
    && view.enrollment.entry_by !== 'clube'
    && round.participation?.decision === 'vou'
    && !!day && day >= (view.today || '');

  const numeroPrevisto = previsao ? <>{' · '}<CupPrevisao label={previsao.label} /></> : null;

  return (
    <div className="flex flex-col gap-2" data-testid="cup-plano">
      {escolhido ? (
        <>
          <p className="m-0 text-[13px]" data-testid="cup-plano-papel" style={{ color: 'var(--text-1)' }}>
            O teu papel: <span className="font-extrabold">{intentLabel(escolhido)}</span>{numeroPrevisto}
          </p>
          {proposto && proposto !== escolhido && (
            <p className="m-0 text-[12px]" style={{ color: 'var(--text-3)', lineHeight: 'var(--leading-normal)' }}>
              Pelas contas era {intentLabel(proposto)}{razao ? ` (${razao})` : ''}. A escolha é tua.
            </p>
          )}
        </>
      ) : proposto ? (
        <>
          <p className="m-0 text-[13px]" data-testid="cup-plano-papel" style={{ color: 'var(--text-1)' }}>
            Pelas contas: <span className="font-extrabold">{intentLabel(proposto)}</span>{numeroPrevisto}
          </p>
          {razao && (
            <p className="m-0 text-[12px]" style={{ color: 'var(--text-3)', lineHeight: 'var(--leading-normal)' }}>{razao}</p>
          )}
        </>
      ) : (
        <p className="m-0 text-[12.5px]" data-testid="cup-plano-papel" style={{ color: 'var(--text-3)' }}>
          Ainda sem papel proposto para esta {String(view.roundLabel || 'Jornada').toLowerCase()}.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!escolhido && proposto && (
          <Button
            variant="module"
            moduleColor="var(--race)"
            size="sm"
            style={BOTAO}
            data-testid="cup-aceitar-papel"
            isLoading={busy === 'papel' && !mudar}
            // "Saltar" é também "Não vou": aceitá-lo passa pela mesma
            // confirmação do "Mudar o papel" (revisão da Fase 3, aviso [a]).
            onClick={() => (proposto === 'saltar' ? setConfirmarSaltar(true) : gravarPapel(proposto))}
          >
            Aceitar: {intentLabel(proposto)}
          </Button>
        )}
        <Button
          ref={mudarRef}
          variant="light"
          size="sm"
          style={BOTAO}
          data-testid="cup-mudar-papel"
          aria-expanded={mudar}
          onClick={() => { setMudar((m) => !m); setEscolha(null); }}
        >
          {escolhido || proposto ? 'Mudar o papel' : 'Escolher o papel'}
        </Button>
      </div>

      {mudar && (
        <div className="flex flex-col gap-2">
          <div ref={grupoRef} role="radiogroup" aria-label={`Papel na ${which}`} className="grid grid-cols-2 gap-1.5" data-testid="cup-papeis">
            {INTENTS.map((opt) => {
              const id = `cup-papel-${round.id}-${opt.value}`;
              const checked = (escolha ?? efetivo) === opt.value;
              return (
                <label
                  key={opt.value}
                  htmlFor={id}
                  data-testid={`cup-papel-${opt.value}`}
                  className="flex items-center gap-1.5 cursor-pointer"
                  style={{
                    minHeight: 44, borderRadius: 12, padding: '0 10px',
                    background: checked ? 'var(--tint-race-bg)' : 'rgba(255,255,255,.04)',
                    border: `1px solid ${checked ? 'var(--tint-race-bd)' : 'var(--border-glass)'}`,
                  }}
                >
                  <input
                    id={id}
                    type="radio"
                    name={`cup-papel-${round.id}`}
                    checked={checked}
                    onChange={() => setEscolha(opt.value)}
                    style={{ width: 16, height: 16, accentColor: 'var(--race)', flexShrink: 0 }}
                  />
                  <span className="text-[12px] font-extrabold" style={{ color: checked ? 'var(--text-1)' : 'var(--text-3)' }}>
                    {opt.label}{opt.value === proposto ? ' (proposto)' : ''}
                  </span>
                </label>
              );
            })}
          </div>
          {/* Só com uma escolha diferente da que está gravada. */}
          {escolha != null && escolha !== escolhido && (
            <Button
              variant="module"
              moduleColor="var(--race)"
              size="sm"
              className="self-start"
              style={BOTAO}
              data-testid="cup-papel-guardar"
              isLoading={busy === 'papel'}
              onClick={guardarEscolha}
            >
              Guardar: {intentLabel(escolha)}
            </Button>
          )}
        </div>
      )}

      {notice && (
        <div className="flex flex-col gap-1.5" data-testid="cup-prazo" style={{ marginTop: 4 }}>
          <p className="m-0 text-[12.5px] font-bold" style={{ color: 'var(--warn)' }}>
            A inscrição fecha {notice.whenLabel}.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {view.edition?.entry_url && (
              <CupLink href={view.edition.entry_url} label="Inscrever-me" srLabel={`Inscrever-me na ${which}`} testId="cup-inscrever-link" />
            )}
            <Button
              variant="light"
              size="sm"
              style={BOTAO}
              data-testid="cup-ja-inscrevi"
              isLoading={busy === 'inscricao'}
              onClick={() => marcarInscricao(true)}
            >
              Já me inscrevi
            </Button>
          </div>
        </div>
      )}
      {!notice && jaInscrito && (
        <div className="flex flex-wrap items-center gap-2" data-testid="cup-inscrito" style={{ marginTop: 4 }}>
          <span className="text-[12.5px] font-bold" style={{ color: 'var(--ok)' }}>
            <span aria-hidden="true">✓ </span>Já te inscreveste.
          </span>
          <Button
            variant="ghost"
            size="sm"
            style={BOTAO}
            data-testid="cup-desfazer-inscricao"
            aria-label={`Desfazer: ainda não me inscrevi na ${which}`}
            isLoading={busy === 'inscricao'}
            onClick={() => marcarInscricao(false)}
          >
            Desfazer
          </Button>
        </div>
      )}

      {confirmarSaltar && (
        <Dialog
          title={`Saltar a ${which}?`}
          tone="warn"
          onClose={() => setConfirmarSaltar(false)}
          testId="cup-saltar-dialog"
          actions={(
            <>
              <Button variant="danger" className="flex-1" isLoading={busy === 'saltar'} onClick={saltar} data-testid="cup-saltar-confirmar">Saltar</Button>
              <Button variant="ghost" className="flex-1" disabled={busy === 'saltar'} onClick={() => setConfirmarSaltar(false)} data-testid="cup-saltar-cancelar">Cancelar</Button>
            </>
          )}
        >
          <p className="m-0 text-[13px]" style={{ color: 'var(--text-2)', lineHeight: 'var(--leading-normal)' }}>
            {provaDoAtleta(round)
              ? `Fica «Não vou». A prova já era tua antes da ${String(view.roundLabel || 'Jornada').toLowerCase()}: não sai do calendário, volta a ser uma prova normal. Podes voltar a dizer «Vou» enquanto não passar.`
              : 'Sai do calendário e fica «Não vou». Podes voltar a dizer «Vou» enquanto não passar.'}
          </p>
        </Dialog>
      )}
    </div>
  );
}
