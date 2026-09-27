import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useAppStore } from '../../store';
import GlassCard from '../shared/GlassCard';
import SectionLabel from '../shared/SectionLabel';
import Warning from '../shared/Warning';
import Button from '../shared/Button';
import { Input } from '../shared/Input';
import { Sheet, Dialog, useEscapeClose } from '../shared/Sheet';
import { useToast } from '../shared/ToastProvider';
import { CUP_CLASSIFICACAO_PRIVACIDADE, CUP_DORSAL_AJUDA, SEASON_GOALS } from './CupEnrollmentScreen';
import { distanciaLabel, editionTitle } from './CupDoorCard';
import { CupNaoFuiDialog, CupStatus, JornadaChip } from './CupBits';
import CupClassificacao, { CUP_CLASSIFICACAO_TITULO_ID, CupLink, clubeLabel } from './CupClassificacao';
import CupJornadaSheet from './CupJornadaSheet';
import CupMatchPrompt, { CupStandingPrompt, MATCH_ISSUE_TEXT } from './CupMatchPrompt';
import { roundDateText } from '../../utils/cupCalendar';
import { enrollmentChoiceError } from '@formulas/cup.ts';

/* O ecrã do Troféu (specs/trofeu.md §4.3). Fase 1 (2026-09-26): cabeçalho,
   a lista de jornadas pré-marcada onde só "Confirmar" grava, o contador dos
   70% e "Gerir inscrição". Fase 3 (2026-09-27): o calendário e a
   classificação.

   DOIS MODOS.
   - 'decidir' — a lista pré-marcada da Fase 1, tal como estava (três
     opções por jornada, só "Confirmar" grava). Abre-se aqui logo a seguir à
     inscrição e sempre que há jornadas pré-marcadas por confirmar (§4.3:
     "logo a seguir à inscrição e sempre que sai o calendário"). "Decidir
     depois", ou um "Confirmar" que não deixa nada pendente, passam ao
     calendário.
   - 'calendario' — uma linha por jornada, com o estado SEMPRE em texto e
     num de quatro ícones (✓ ▸ ✕ ⋯, nunca só cor), uma frase por linha para
     o leitor de ecrã e alvos de 56/44 px (§4.3). A régua do estado é a de
     utils/cupCalendar.js, a mesma da lista de Provas, do hub e do Início.
     Tocar numa linha abre a folha da jornada (CupJornadaSheet); nas que já
     passaram, "Registar" e "Não fui" ficam à mão, fora do botão da linha.
     Por baixo, a classificação — só a linha dele e o total do clube dele.

   `initialMode` e `focusRoundId` chegam de Provas (o "+N no calendário", a
   migalha do hub, a linha do Início): o modo com que abre e a jornada cuja
   folha abre logo. `initialMode` 'gerir' (Fase 4: o "Rever o dorsal" do
   hub) abre o calendário com o "Gerir inscrição" aberto.

   FASE 4 (2026-09-27). A 1.ª correspondência de cada edição com a
   classificação oficial pergunta-se logo a seguir ao cabeçalho ("És tu?",
   CupMatchPrompt — a mais antiga por confirmar, e quantas mais há); a linha
   da jornada diz "Resultado por confirmar — és tu?" ou a frase de falha.
   Ao abrir, o foco vai para o título (e volta, ao fechar, para onde
   estava); a mudança de data de cada linha entra na descrição do botão
   (aria-describedby), porque o aria-label da linha a tapava. A linha dele
   na classificação GERAL achada pela chave alternativa (o nome do meio)
   também se pergunta aqui ("És tu? 12.º M40 na geral · 43 pontos",
   CupStandingPrompt). */

const CARD = { background: 'var(--surface-glass)', border: '1px solid var(--border-glass)', borderRadius: 18 };

const diaLabel = (iso) => {
  try { return format(parseISO(iso), 'dd MMM', { locale: pt }).replace('.', ''); } catch { return ''; }
};

const DECISOES = [
  { value: 'vou', label: 'Vou', icon: '✓', color: 'var(--ok)' },
  { value: 'nao_vou', label: 'Não vou', icon: '✕', color: 'var(--danger)' },
  { value: 'nao_sei', label: 'Ainda não sei', icon: '?', color: 'var(--text-3)' },
];

const baseDecision = (round) => round.participation?.decision ?? round.suggestion?.decision ?? null;
// Só se decide "Vou" numa jornada com data, não cancelada e que não passou
// (depois do dia criava uma prova agendada no passado — revisão pré-deploy
// da Fase 1; o "Registar" das passadas é outra coisa, ver CalendarioRow).
const aplicavel = (round) => !!round.date && round.date_status !== 'cancelada' && round.suggestion?.reason !== 'passada';

/** As jornadas com uma escolha por gravar (rascunho ou pré-marcação). */
function pendentesDe(rounds, draft) {
  const efetiva = (r) => (r.id in draft ? draft[r.id] : baseDecision(r));
  return (rounds || []).filter((r) => aplicavel(r) && efetiva(r) !== (r.participation?.decision ?? null));
}

/* Uma jornada da lista pré-marcada. `decision` é o valor EFETIVO (rascunho
   local ou o que já está gravado) — nada aqui grava; só o "Confirmar" do
   ecrã pai o faz. */
function JornadaRow({ round, decision, onChange, roundLabel }) {
  const semData = !round.date;
  const cancelada = round.date_status === 'cancelada';
  // Já passou: não se decide "Vou" depois do dia — criava uma prova agendada
  // no passado. O "Não fui"/"Registar" chega na Fase 3 (revisão pré-deploy
  // da Fase 1, 2026-09-26).
  const passada = !cancelada && round.suggestion?.reason === 'passada';
  const distancia = distanciaLabel(round.course?.distance_m);
  const groupName = `jornada-${round.id}`;

  return (
    <div style={{ ...CARD, padding: '12px 14px' }} data-testid={`cup-jornada-${round.id}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-extrabold truncate" style={{ color: cancelada ? 'var(--text-4)' : 'var(--text-1)' }}>
            {roundLabel} {round.round_no ?? ''} · {round.name || 'Jornada'}
          </span>
          <span className="block text-[11px] mt-[2px]" style={{ color: 'var(--text-4)' }}>
            {cancelada ? 'Cancelada' : semData ? 'Data a anunciar' : `${diaLabel(round.date)}${passada ? ' (já passou)' : round.date_status === 'provavel' ? ' (provável)' : ''}`}
            {distancia ? ` · ${distancia}` : ''}
          </span>
        </span>
      </div>

      {round.suggestion?.reason === 'principal' && (
        <p className="m-0 mt-1.5 text-[11px] font-bold" style={{ color: 'var(--warn)' }}>
          ⚠ dia da tua {round.suggestion.principal?.name || 'prova principal'} (principal)
        </p>
      )}

      {!cancelada && !semData && !passada && (
        <div role="radiogroup" aria-label={`Decisão para ${round.name || 'a jornada'} de ${diaLabel(round.date)}`} className="flex gap-1.5 mt-2.5">
          {DECISOES.map((d) => {
            const id = `${groupName}-${d.value}`;
            const checked = decision === d.value;
            return (
              <label
                key={d.value}
                htmlFor={id}
                data-testid={`cup-jornada-${round.id}-${d.value}`}
                className="flex-1 flex items-center justify-center gap-1 cursor-pointer"
                style={{
                  minHeight: 44, borderRadius: 12, padding: '0 6px',
                  background: checked ? 'var(--tint-race-bg)' : 'rgba(255,255,255,.04)',
                  border: `1px solid ${checked ? 'var(--tint-race-bd)' : 'var(--border-glass)'}`,
                }}
              >
                <input
                  id={id}
                  type="radio"
                  name={groupName}
                  checked={checked}
                  onChange={() => onChange(round.id, d.value)}
                  style={{ width: 16, height: 16, accentColor: d.color, flexShrink: 0 }}
                />
                <span aria-hidden="true" style={{ color: d.color, fontWeight: 900 }}>{d.icon}</span>
                <span className="text-[11.5px] font-extrabold" style={{ color: checked ? 'var(--text-1)' : 'var(--text-3)' }}>{d.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* Uma linha do calendário (§4.3): um botão só (56 px) que abre a folha da
   jornada, com a frase inteira para o leitor de ecrã; o estado vai em texto
   e num dos quatro ícones — o círculo à volta é decoração. "Registar" e
   "Não fui" (só nas que já passaram) ficam numa fila à parte: nunca um
   botão dentro de outro. */
function CalendarioRow({ round, today, roundLabel, onOpen, onRegistar, onNaoFui, registando }) {
  const s = round.status;
  if (!s) return null;
  const acoes = s.actions || [];
  // "a jornada 2, Corta-mato do NAZA" — o botão fora da linha diz de qual é.
  const qual = [`${String(roundLabel || 'Jornada').toLowerCase()} ${round.round_no ?? ''}`.trim(), round.name].filter(Boolean).join(', ');
  // O que o aria-label da linha não diz: a mudança de data e a
  // correspondência com a classificação oficial (Fase 4).
  const mudancaId = round.dateChange ? `cup-cal-${round.id}-mudanca` : null;
  const correspondencia = round.proposal
    ? 'Resultado por confirmar — és tu?'
    : round.matchIssue ? MATCH_ISSUE_TEXT[round.matchIssue] || null : null;
  const correspondenciaId = correspondencia ? `cup-cal-${round.id}-correspondencia` : null;
  const describedBy = [mudancaId, correspondenciaId].filter(Boolean).join(' ') || undefined;
  return (
    <div style={{ ...CARD }} data-testid={`cup-cal-${round.id}`} data-status={s.key}>
      <button
        type="button"
        onClick={() => onOpen(round.id)}
        aria-label={s.ariaLabel}
        aria-describedby={describedBy}
        data-testid={`cup-cal-${round.id}-abrir`}
        className="w-full text-left flex items-start gap-2.5"
        style={{ minHeight: 56, padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
      >
        <span
          aria-hidden="true"
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 28, height: 28, border: `1.5px solid ${s.color}`, color: s.color, fontWeight: 900, fontSize: 13, marginTop: 1 }}
        >
          {s.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 min-w-0">
            <JornadaChip chip={round.chip} roundNo={round.round_no} />
            <span className="shrink-0 text-[12px] font-bold" style={{ color: 'var(--text-3)' }}>{roundDateText(round, today)}</span>
            <span className="min-w-0 truncate text-[12.5px] font-extrabold" style={{ color: s.key === 'cancelada' ? 'var(--text-4)' : 'var(--text-1)' }}>
              {round.name || ''}
            </span>
          </span>
          <span className="block text-[11.5px] mt-1">
            <CupStatus status={s} />
          </span>
          {round.dateChange && (
            <span id={mudancaId} className="block text-[11px] font-bold mt-0.5" style={{ color: 'var(--warn)' }}>{round.dateChange.label}</span>
          )}
          {correspondencia && (
            <span
              id={correspondenciaId}
              data-testid={`cup-cal-${round.id}-correspondencia`}
              className="block text-[11px] font-bold mt-0.5"
              style={{ color: round.proposal ? 'var(--race)' : 'var(--warn)' }}
            >
              {correspondencia}
            </span>
          )}
        </span>
        <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--text-4)', flexShrink: 0, marginTop: 6 }} />
      </button>
      {acoes.length > 0 && (
        <div className="flex gap-2" style={{ padding: '0 12px 12px 50px' }}>
          {acoes.includes('registar') && (
            <Button
              variant="module"
              moduleColor="var(--race)"
              size="sm"
              style={{ minHeight: 44 }}
              data-testid={`cup-cal-${round.id}-registar`}
              aria-label={`Registar a ${qual}`}
              isLoading={registando}
              onClick={() => onRegistar(round)}
            >
              Registar
            </Button>
          )}
          {acoes.includes('nao_fui') && (
            <Button
              variant="light"
              size="sm"
              style={{ minHeight: 44 }}
              data-testid={`cup-cal-${round.id}-nao-fui`}
              aria-label={`Não fui à ${qual}`}
              onClick={() => onNaoFui(round)}
            >
              Não fui
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/* O calendário ainda não saiu: diz-se, e "Avisa-me quando sair" liga só
   esse aviso (§4.2). */
function SemCalendario({ enrollment, onToggle }) {
  return (
    <GlassCard radius={20} padding={14} data-testid="cup-trofeu-sem-calendario">
      <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-3)', lineHeight: 'var(--leading-normal)' }}>
        Ainda não saiu o calendário desta edição.
      </p>
      <label htmlFor="cup-notify-calendar" className="flex items-center gap-2.5 mt-3" style={{ ...CARD, padding: 12, minHeight: 44 }}>
        <input
          id="cup-notify-calendar"
          type="checkbox"
          checked={!!enrollment.notify_calendar}
          onChange={(e) => onToggle(e.target.checked)}
          style={{ width: 20, height: 20, accentColor: 'var(--race)' }}
        />
        <span className="text-[12.5px] font-bold" style={{ color: 'var(--text-2)' }}>Avisa-me quando sair</span>
      </label>
    </GlassCard>
  );
}

/* "Gerir inscrição" — mudar clube/dorsal, sair com confirmação (§4.3). */
function GerirInscricaoSheet({ view, onClose, onLeft }) {
  const { updateEnrollment, leaveCup } = useAppStore();
  const { showToast } = useToast();
  const enrollment = view.enrollment;
  const teams = view.teams || [];
  const [teamId, setTeamId] = useState(enrollment.team_id || null);
  const [outroClube, setOutroClube] = useState(!!enrollment.team_other && !enrollment.team_id);
  const [teamOther, setTeamOther] = useState(enrollment.team_other || '');
  const [bib, setBib] = useState(enrollment.bib || '');
  const [aGravar, setAGravar] = useState(false);
  const [aSair, setASair] = useState(false);
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const [erro, setErro] = useState(null);

  const choice = { team_id: outroClube ? null : teamId, team_other: outroClube ? teamOther : null, is_federated: enrollment.is_federated };
  const choiceError = enrollmentChoiceError(choice, teams, view.edition?.id);

  const gravar = async () => {
    setErro(null);
    if (choiceError) return;
    setAGravar(true);
    const res = await updateEnrollment(enrollment.id, {
      ...(outroClube ? { team_other: teamOther.trim(), team_id: null } : { team_id: teamId, team_other: null }),
      bib: bib.trim() || null,
    });
    setAGravar(false);
    if (!res.ok) { setErro(res.error?.message || 'Não foi possível gravar.'); return; }
    showToast('Inscrição atualizada.', 'success');
    onClose();
  };

  const sair = async () => {
    setASair(true);
    const res = await leaveCup(enrollment.id);
    setASair(false);
    if (!res.ok) { setErro(res.error?.message || 'Não foi possível sair.'); return; }
    showToast('Saíste do Troféu.', 'success');
    onLeft();
  };

  return (
    <Sheet eyebrow="Troféu" eyebrowTone="race" title={<span className="text-[14.5px] font-extrabold" style={{ color: 'var(--text-1)' }}>Gerir inscrição</span>} onClose={onClose} testId="cup-gerir-sheet" maxHeight="88dvh">
      <div className="flex flex-col gap-2 pt-2 pb-1">
        <SectionLabel style={{ margin: '0 2px' }}>Clube</SectionLabel>
        <div className="flex flex-col gap-2">
          {teams.filter((t) => !(enrollment.is_federated && t.kind === 'individual')).map((t) => (
            <label key={t.id} htmlFor={`gerir-clube-${t.id}`} className="flex items-center gap-2.5" style={{ ...CARD, padding: 12, minHeight: 44 }}>
              <input id={`gerir-clube-${t.id}`} type="radio" name="gerir-clube" checked={!outroClube && teamId === t.id}
                onChange={() => { setTeamId(t.id); setOutroClube(false); }} style={{ width: 20, height: 20, accentColor: 'var(--race)' }} />
              <span className="text-[12.5px] font-bold" style={{ color: 'var(--text-1)' }}>{t.short_name || t.name}</span>
            </label>
          ))}
          {/* Também para federados — só o Individual lhes fica escondido
              (§4.2.2; o trigger cup_enrollments_validate aceita federado com
              um clube fora da lista). Revisão da Fase 1, 2026-09-26. */}
          <label htmlFor="gerir-clube-outro" data-testid="cup-gerir-clube-outro" className="flex items-center gap-2.5" style={{ ...CARD, padding: 12, minHeight: 44 }}>
            <input id="gerir-clube-outro" type="radio" name="gerir-clube" checked={outroClube}
              onChange={() => setOutroClube(true)} style={{ width: 20, height: 20, accentColor: 'var(--race)' }} />
            <span className="text-[12.5px] font-bold" style={{ color: 'var(--text-1)' }}>Não está na lista</span>
          </label>
        </div>
        {outroClube && <Input aria-label="Nome do clube" placeholder="Nome do teu clube" maxLength={120} value={teamOther} onChange={(e) => setTeamOther(e.target.value)} />}

        <SectionLabel style={{ margin: '10px 2px 0' }}>Dorsal</SectionLabel>
        <p id="cup-gerir-dorsal-ajuda" data-testid="cup-gerir-dorsal-ajuda" className="m-0 text-[11.5px]" style={{ color: 'var(--text-4)', lineHeight: 'var(--leading-normal)' }}>
          {CUP_DORSAL_AJUDA} {CUP_CLASSIFICACAO_PRIVACIDADE}
        </p>
        <Input data-testid="cup-gerir-dorsal" aria-label="Dorsal" aria-describedby="cup-gerir-dorsal-ajuda" placeholder="Número do dorsal" inputMode="numeric" maxLength={20} value={bib} onChange={(e) => setBib(e.target.value)} />

        {erro && <Warning tone="danger" title="Não foi possível">{erro}</Warning>}

        <Button variant="module" moduleColor="var(--race)" className="w-full mt-2" data-testid="cup-gerir-guardar" isLoading={aGravar} disabled={!!choiceError} onClick={gravar}>
          Guardar
        </Button>

        <Button variant="danger-outline" className="w-full mt-3" data-testid="cup-gerir-sair" onClick={() => setConfirmarSaida(true)}>
          Sair do Troféu
        </Button>
      </div>

      {confirmarSaida && (
        <Dialog title="Sair do Troféu?" tone="danger" onClose={() => setConfirmarSaida(false)} testId="cup-gerir-sair-dialog" actions={(
          <>
            <Button variant="danger" className="flex-1" isLoading={aSair} onClick={sair}>Sair</Button>
            <Button variant="ghost" className="flex-1" onClick={() => setConfirmarSaida(false)}>Cancelar</Button>
          </>
        )}>
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-3)', lineHeight: 'var(--leading-normal)' }}>
            As jornadas futuras por correr saem do calendário. As que já correste ficam como provas normais — não se
            perdem. Podes voltar a inscrever-te nesta época enquanto as inscrições estiverem abertas.
          </p>
        </Dialog>
      )}
    </Sheet>
  );
}

export default function CupTrofeuScreen({ view, onClose, initialMode = null, focusRoundId = null }) {
  const { updateEnrollment, setCupParticipations, registerCupRound, markCupRoundNotAttended } = useAppStore();
  const { showToast } = useToast();
  useEscapeClose(onClose);
  // 'gerir' (o "Rever o dorsal" do hub, Fase 4): o calendário, com o "Gerir
  // inscrição" já aberto.
  const [gerirAberto, setGerirAberto] = useState(initialMode === 'gerir');
  const tituloRef = useRef(null);
  const gerirRef = useRef(null);
  const [draft, setDraft] = useState({});
  const [aConfirmar, setAConfirmar] = useState(false);
  const [confirmou, setConfirmou] = useState(false);
  // O modo com que abre: o pedido de quem abriu; senão "decidir" se há
  // jornadas pré-marcadas por confirmar. Com o catálogo ainda a chegar, fica
  // por escolher (null, mostra o calendário) até ele chegar.
  const [modo, setModo] = useState(() => (
    initialMode === 'decidir' || initialMode === 'calendario'
      ? initialMode
      : initialMode === 'gerir'
        ? 'calendario'
        : view?.catalogReady ? (pendentesDe(view.rounds, {}).length > 0 ? 'decidir' : 'calendario') : null
  ));
  const [folha, setFolha] = useState(focusRoundId || null);
  const [naoFui, setNaoFui] = useState(null); // a jornada do diálogo "Não fui"
  const [aMarcarNaoFui, setAMarcarNaoFui] = useState(false);
  const [registando, setRegistando] = useState(null); // roundId

  const rounds = view?.rounds || [];
  const pendentes = pendentesDe(rounds, draft);

  useEffect(() => {
    if (modo == null && view?.catalogReady) setModo(pendentes.length > 0 ? 'decidir' : 'calendario');
  }, [modo, view?.catalogReady, pendentes.length]);

  // Um "Confirmar" que não deixou nada pendente passa ao calendário.
  useEffect(() => {
    if (!confirmou) return;
    setConfirmou(false);
    if (pendentes.length === 0) setModo('calendario');
  }, [confirmou, pendentes.length]);

  // Um pedido novo com o ecrã já aberto: o modo e a folha que ele pede.
  useEffect(() => {
    if (initialMode === 'decidir' || initialMode === 'calendario') setModo(initialMode);
    if (initialMode === 'gerir') { setModo('calendario'); setGerirAberto(true); }
  }, [initialMode]);

  // O foco (revisão da Fase 3, aviso [e]): ao abrir, no título do ecrã — o
  // leitor de ecrã começa aqui e não no botão que ficou por baixo; ao
  // fechar, volta para onde estava, se ainda existir. Com uma folha aberta
  // logo de início (o "Gerir inscrição", ou a folha de uma jornada), o título
  // fica por baixo dela: não se lhe dá o foco.
  useEffect(() => {
    const antes = typeof document !== 'undefined' ? document.activeElement : null;
    if (initialMode !== 'gerir' && !focusRoundId) tituloRef.current?.focus();
    return () => {
      if (antes && antes !== document.body && typeof antes.focus === 'function' && document.contains(antes)) antes.focus();
    };
    // Só ao montar e desmontar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (focusRoundId) setFolha(focusRoundId);
  }, [focusRoundId]);

  if (!view?.enrollment) return null;
  const { enrollment, edition, teams, category, attendance, showCounter, catalogReady } = view;
  const nome = view.shortName || view.competition?.short_name || view.competition?.name || 'Troféu';
  const titulo = view.title || editionTitle(edition, view.competition);
  const roundLabel = view.roundLabel || view.competition?.round_label || 'Jornada';
  const rotulo = roundLabel.toLowerCase();
  const objetivo = SEASON_GOALS.find((g) => g.value === enrollment.season_goal)?.label || 'Só participar';
  const modoAtual = modo ?? 'calendario';
  const percurso = view.nextRound?.course ? (view.nextRound.course.name || view.nextRound.course.code || null) : null;

  const efetiva = (round) => (round.id in draft ? draft[round.id] : baseDecision(round));
  const contarVou = pendentes.filter((r) => efetiva(r) === 'vou').length;
  const contarNaoVou = pendentes.filter((r) => efetiva(r) === 'nao_vou').length;

  const mudarDecisao = (roundId, valor) => {
    setDraft((d) => ({ ...d, [roundId]: valor }));
  };

  /* Revisão da Fase 1 (2026-09-26): o resultado de cada jornada conta.
     - Um "Vou" que volta null/'colisao' (há uma principal nesse dia — o
       servidor manda, §2.5) não é uma jornada confirmada: diz-se quantas
       ficaram por decidir e porquê, em vez de "Jornadas confirmadas." com a
       barra a reaparecer sem explicação.
     - Num erro, só saem do rascunho as que gravaram: as escolhas das que
       falharam ficam, para o "Confirmar" as voltar a tentar. */
  const confirmar = async () => {
    setAConfirmar(true);
    const items = pendentes.map((r) => ({ roundId: r.id, patch: { decision: efetiva(r), decision_source: 'atleta' } }));
    const res = await setCupParticipations(items);
    setAConfirmar(false);
    const results = res?.results || [];
    const falhadas = new Set(items.map((i) => i.roundId));
    for (const r of results) if (r?.ok) falhadas.delete(r.roundId);
    const colisoes = results.filter((r) => r?.ok && r.collided).length;
    setDraft((d) => {
      const next = {};
      for (const id of falhadas) if (id in d) next[id] = d[id];
      return next;
    });
    if (!res?.ok) {
      showToast(falhadas.size === 1
        ? 'Uma jornada não gravou — a tua escolha ficou; tenta outra vez.'
        : `${falhadas.size} jornadas não gravaram — as tuas escolhas ficaram; tenta outra vez.`, 'error');
      return;
    }
    setConfirmou(true);
    if (colisoes > 0) {
      showToast(colisoes === 1
        ? '1 jornada ficou por decidir: é o dia de uma prova principal.'
        : `${colisoes} jornadas ficaram por decidir: é o dia de uma prova principal.`, 'info');
      return;
    }
    showToast('Jornadas confirmadas.', 'success');
  };

  const avisarCalendario = async (on) => {
    await updateEnrollment(enrollment.id, { notify_calendar: on });
  };

  /* "Registar" uma jornada que já passou (§4.5): com a prova no calendário
     abre o registo nela; sem ela, grava "Vou" e a sincronização cria-a (ou
     liga a que ele já lá tinha). O registo abre-se noutro separador, por
     isso o ecrã fecha primeiro.

     Revisão da Fase 3, aviso [b]: com a prova já feita (a "Prova fora da
     agenda" que a sincronização acabou de ligar, ou uma concluída), abre-se
     o hub dela — nunca outra vez o registo de uma prova com corrida. Sem
     prova, a frase diz a causa certa: só culpa a distância quando falta
     mesmo a distância do percurso dele nesta jornada. */
  const registar = async (round) => {
    setRegistando(round.id);
    const res = await registerCupRound(round.id);
    setRegistando(null);
    if (!res?.ok || !res.data?.raceId) {
      let msg = res?.error?.message || 'Não foi possível abrir o registo desta jornada.';
      if (res?.error?.code === 'sem_prova') {
        msg = Number(round.course?.distance_m) > 0
          ? 'Não consegui criar a prova desta jornada. Tenta outra vez daqui a pouco.'
          : 'Falta a distância do teu percurso nesta jornada. Regista a corrida como «Prova fora da agenda» e volta a carregar em «Registar» para a ligar.';
      }
      showToast(msg, 'error');
      return;
    }
    setFolha(null);
    onClose();
    if (res.data.done) {
      useAppStore.getState().setEditingRaceId(res.data.raceId);
      showToast('Ligada à jornada.', 'success');
      return;
    }
    useAppStore.getState().openRaceRun(res.data.raceId);
  };

  // Depois de "Sim, sou eu", o resultado confirmado está na Classificação;
  // depois de "Não sou eu", o sítio para rever o dorsal é o "Gerir
  // inscrição". A pergunta desaparece: o foco vai para lá (a seguir ao
  // render que a tira).
  const focarDepois = (alvo) => setTimeout(() => {
    const el = alvo === 'gerir' ? gerirRef.current : document.getElementById(CUP_CLASSIFICACAO_TITULO_ID);
    (el || tituloRef.current)?.focus?.();
  }, 0);

  const confirmarNaoFui = async () => {
    if (!naoFui) return;
    setAMarcarNaoFui(true);
    const res = await markCupRoundNotAttended(naoFui.id);
    setAMarcarNaoFui(false);
    setNaoFui(null);
    if (!res?.ok) { showToast(res?.error?.message || 'Não foi possível gravar.', 'error'); return; }
    showToast('Ficou como «Não fui».', 'success');
  };

  const abrirProva = (raceId) => {
    setFolha(null);
    onClose();
    useAppStore.getState().setEditingRaceId(raceId);
  };

  const folhaRound = folha ? rounds.find((r) => r.id === folha) || null : null;
  const porDecidir = view.undecidedCount || 0;
  const pendentesResultado = view.results?.pending || [];

  const conteudo = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`O teu ${nome}`}
      data-testid="cup-trofeu-screen"
      data-modo={modoAtual}
      // z-55: acima da nav (40) e do FAB (50), ABAIXO das persianas e popups
      // (Sheet/Dialog, z-60/70, também em portal no body) que este ecrã abre —
      // a z-80 abriam por baixo dele (revisão pré-deploy da Fase 1, 2026-09-26).
      className="fixed inset-0 z-[55] flex flex-col fade-in"
      style={{ background: 'var(--bg-app)' }}
    >
      <div className="flex items-center gap-2.5 shrink-0" style={{ minHeight: 52, padding: '8px 14px', borderBottom: '1px solid var(--border-glass)' }}>
        <button type="button" onClick={onClose} aria-label="Voltar a Provas" className="shrink-0 flex items-center justify-center rounded-full" style={{ width: 44, height: 44, background: 'none', border: 'none', color: 'var(--text-3)' }}>
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--race)' }}>Troféu</div>
          <h1 ref={tituloRef} tabIndex={-1} data-testid="cup-trofeu-titulo" className="m-0 text-[14.5px] font-extrabold truncate" style={{ color: 'var(--text-1)' }}>{titulo}</h1>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-2 [&>*]:shrink-0" style={{ padding: '12px 18px calc(96px + env(safe-area-inset-bottom, 0px))' }}>
        <GlassCard tone="race" radius={24} padding={16} data-testid="cup-trofeu-cabecalho">
          <p className="m-0 text-[12.5px] font-extrabold" style={{ color: 'var(--text-1)' }}>{clubeLabel(enrollment, teams)}</p>
          <p className="m-0 text-[11.5px] mt-1" data-testid="cup-trofeu-escalao" style={{ color: 'var(--text-3)' }}>
            Escalão {category?.code || 'por confirmar'}{percurso ? ` · ${percurso}` : ''}
          </p>
          <p className="m-0 text-[11.5px] mt-0.5" style={{ color: 'var(--text-4)' }}>Objetivo: {objetivo}</p>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-1.5">
            {edition?.regulation_url
              ? <CupLink href={edition.regulation_url} label="Regulamento" testId="cup-trofeu-regulamento" />
              : <span />}
            <button
              ref={gerirRef}
              type="button"
              data-testid="cup-abrir-gerir"
              onClick={() => setGerirAberto(true)}
              className="inline-flex items-center text-[12px] font-extrabold"
              style={{ minHeight: 44, padding: '0 4px', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer' }}
            >
              Gerir inscrição
            </button>
          </div>
        </GlassCard>

        {pendentesResultado.length > 0 && (
          <CupMatchPrompt
            key={pendentesResultado[0].id}
            round={pendentesResultado[0]}
            more={pendentesResultado.length - 1}
            idPrefix="cup-match-topo"
            onConfirmed={() => focarDepois('classificacao')}
            onRejected={() => focarDepois('gerir')}
          />
        )}

        {/* A geral pela chave alternativa, por confirmar (tarefa 9). Depois de
            responder, o foco vai para a Classificação (ali está o resultado). */}
        {view.results?.standingProposal && (
          <CupStandingPrompt
            standing={view.results.standingProposal}
            enrollmentId={view.enrollment?.id}
            idPrefix="cup-match-geral-topo"
            onConfirmed={() => focarDepois('classificacao')}
            onRejected={() => focarDepois('classificacao')}
          />
        )}

        {showCounter && attendance && (
          <GlassCard radius={20} padding={14} data-testid="cup-trofeu-contador">
            <div className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--text-4)' }}>
              {attendance.rule === 'pct_minima' ? `${edition.counting_value}%` : 'Presenças'}
              {attendance.rounding === 'a_confirmar' ? ' (a confirmar)' : ''}
            </div>
            <div className="text-[22px] font-black mt-1" style={{ color: 'var(--text-1)' }}>
              {attendance.required} de {attendance.total}
            </div>
            <p className="m-0 text-[12px] mt-1" style={{ color: 'var(--text-3)' }}>
              feitas {attendance.done} · ainda podes faltar a {attendance.canMiss}
            </p>
            {attendance.reachable === false && (
              <p className="m-0 text-[12px] font-bold mt-1" data-testid="cup-trofeu-inalcancavel" style={{ color: 'var(--warn)' }}>
                Já não dá para chegar ao mínimo.
              </p>
            )}
          </GlassCard>
        )}

        {modoAtual === 'decidir' ? (
          <>
            <div className="flex items-center justify-between gap-2" style={{ margin: '4px 2px 0' }}>
              <SectionLabel style={{ margin: 0 }}>As tuas jornadas</SectionLabel>
              <button
                type="button"
                data-testid="cup-ver-calendario"
                onClick={() => setModo('calendario')}
                className="inline-flex items-center gap-0.5 text-[12px] font-extrabold"
                style={{ minHeight: 44, padding: '0 4px', background: 'none', border: 'none', color: 'var(--race)', cursor: 'pointer' }}
              >
                Ver o calendário <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>

            {!catalogReady ? (
              <p className="text-[12px] m-0 pt-1" style={{ color: 'var(--text-4)' }} role="status">A ler o calendário…</p>
            ) : rounds.length === 0 ? (
              <SemCalendario enrollment={enrollment} onToggle={avisarCalendario} />
            ) : (
              <div className="flex flex-col gap-2">
                {rounds.map((r) => (
                  <JornadaRow key={r.id} round={r} decision={efetiva(r)} onChange={mudarDecisao} roundLabel={roundLabel} />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {porDecidir > 0 && (
              <GlassCard radius={20} padding={14} data-testid="cup-trofeu-por-decidir">
                <div className="flex items-center justify-between gap-2.5">
                  <p className="m-0 text-[12.5px] font-bold" style={{ color: 'var(--text-2)' }}>
                    Tens {porDecidir} {porDecidir === 1 ? rotulo : `${rotulo}s`} por decidir.
                  </p>
                  <Button variant="module" moduleColor="var(--race)" size="sm" style={{ minHeight: 44 }} data-testid="cup-decidir-agora" onClick={() => setModo('decidir')}>
                    Decidir agora
                  </Button>
                </div>
              </GlassCard>
            )}

            <SectionLabel style={{ margin: '4px 2px 0' }}>Calendário</SectionLabel>

            {!catalogReady ? (
              <p className="text-[12px] m-0 pt-1" style={{ color: 'var(--text-4)' }} role="status">A ler o calendário…</p>
            ) : rounds.length === 0 ? (
              <SemCalendario enrollment={enrollment} onToggle={avisarCalendario} />
            ) : (
              <div className="flex flex-col gap-2" data-testid="cup-calendario">
                {rounds.map((r) => (
                  <CalendarioRow
                    key={r.id}
                    round={r}
                    today={view.today}
                    roundLabel={roundLabel}
                    onOpen={setFolha}
                    onRegistar={registar}
                    onNaoFui={setNaoFui}
                    registando={registando === r.id}
                  />
                ))}
              </div>
            )}

            <CupClassificacao view={view} />
          </>
        )}
      </div>

      {modoAtual === 'decidir' && pendentes.length > 0 && (
        <div className="shrink-0 flex items-center gap-2" style={{ padding: '10px 18px calc(14px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--border-glass)', background: 'var(--bg-app)' }}>
          <Button variant="module" moduleColor="var(--race)" className="flex-1" data-testid="cup-confirmar" isLoading={aConfirmar} onClick={confirmar}>
            Confirmar: {contarVou} vou, {contarNaoVou} não vou
          </Button>
          <Button variant="ghost" data-testid="cup-decidir-depois" onClick={() => setModo('calendario')}>
            Decidir depois
          </Button>
        </div>
      )}

      {folhaRound && (
        <CupJornadaSheet
          view={view}
          round={folhaRound}
          onClose={() => setFolha(null)}
          onRegistar={registar}
          onNaoFui={setNaoFui}
          onOpenRace={abrirProva}
          registando={registando === folhaRound.id}
          onMatchRejected={() => { setFolha(null); focarDepois('gerir'); }}
        />
      )}

      {naoFui && (
        <CupNaoFuiDialog
          round={naoFui}
          roundLabel={roundLabel}
          busy={aMarcarNaoFui}
          onConfirm={confirmarNaoFui}
          onClose={() => setNaoFui(null)}
        />
      )}

      {gerirAberto && (
        <GerirInscricaoSheet view={view} onClose={() => setGerirAberto(false)} onLeft={() => { setGerirAberto(false); onClose(); }} />
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(conteudo, document.body) : conteudo;
}
