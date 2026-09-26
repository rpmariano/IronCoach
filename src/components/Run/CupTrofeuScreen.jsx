import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ExternalLink, Settings } from 'lucide-react';
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
import { SEASON_GOALS } from './CupEnrollmentScreen';
import { distanciaLabel } from './CupDoorCard';
import { enrollmentChoiceError } from '@formulas/cup.ts';

/* O ecrã do Troféu — mínimo da Fase 1 (specs/trofeu.md §4.3 e TAREFA da
   Fase 1: cabeçalho, a lista de jornadas pré-marcada onde só "Confirmar"
   grava, o contador dos 70% e "Gerir inscrição"). O calendário completo com
   os ícones ✓ ▸ ✕ ⋯ e a classificação ficam para a Fase 3 (§10) — aqui cada
   jornada mostra a mesma informação, só que com três opções em vez de um
   histórico. 2026-09-26. */

const CARD = { background: 'var(--surface-glass)', border: '1px solid var(--border-glass)', borderRadius: 18 };

const diaLabel = (iso) => {
  try { return format(parseISO(iso), 'dd MMM', { locale: pt }).replace('.', ''); } catch { return ''; }
};

const DECISOES = [
  { value: 'vou', label: 'Vou', icon: '✓', color: 'var(--ok)' },
  { value: 'nao_vou', label: 'Não vou', icon: '✕', color: 'var(--danger)' },
  { value: 'nao_sei', label: 'Ainda não sei', icon: '?', color: 'var(--text-3)' },
];

function clubeLabel(enrollment, teams) {
  if (!enrollment) return '';
  if (enrollment.team_other) return enrollment.team_other;
  const team = (teams || []).find((t) => t.id === enrollment.team_id);
  return team?.short_name || team?.name || 'Clube por confirmar';
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
        <Input data-testid="cup-gerir-dorsal" aria-label="Dorsal" placeholder="Número do dorsal" inputMode="numeric" maxLength={20} value={bib} onChange={(e) => setBib(e.target.value)} />

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
            perdem. Podes voltar a inscrever-te nesta época quando quiseres.
          </p>
        </Dialog>
      )}
    </Sheet>
  );
}

export default function CupTrofeuScreen({ view, onClose }) {
  const { updateEnrollment, setCupParticipations } = useAppStore();
  const { showToast } = useToast();
  useEscapeClose(onClose);
  const [gerirAberto, setGerirAberto] = useState(false);
  const [draft, setDraft] = useState({});
  const [adiado, setAdiado] = useState(false);
  const [aConfirmar, setAConfirmar] = useState(false);

  if (!view?.enrollment) return null;
  const { enrollment, edition, rounds, teams, category, attendance, showCounter, catalogReady } = view;
  const nome = view.competition?.short_name || view.competition?.name || 'Troféu';
  const roundLabel = view.competition?.round_label || 'Jornada';
  const objetivo = SEASON_GOALS.find((g) => g.value === enrollment.season_goal)?.label || 'Só participar';

  const baseDecision = (round) => round.participation?.decision ?? round.suggestion?.decision ?? null;
  const efetiva = (round) => (round.id in draft ? draft[round.id] : baseDecision(round));
  const aplicavel = (round) => !!round.date && round.date_status !== 'cancelada' && round.suggestion?.reason !== 'passada';
  const pendente = (round) => aplicavel(round) && efetiva(round) !== (round.participation?.decision ?? null);

  const pendentes = (rounds || []).filter(pendente);
  const contarVou = pendentes.filter((r) => efetiva(r) === 'vou').length;
  const contarNaoVou = pendentes.filter((r) => efetiva(r) === 'nao_vou').length;

  const mudarDecisao = (roundId, valor) => {
    setDraft((d) => ({ ...d, [roundId]: valor }));
    setAdiado(false);
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

  const conteudo = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`O teu ${nome}`}
      data-testid="cup-trofeu-screen"
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
          <div className="text-[14.5px] font-extrabold truncate" style={{ color: 'var(--text-1)' }}>{nome}</div>
        </div>
        <button
          type="button"
          data-testid="cup-abrir-gerir"
          aria-label="Gerir inscrição"
          onClick={() => setGerirAberto(true)}
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 44, height: 44, background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-3)' }}
        >
          <Settings size={17} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-2 [&>*]:shrink-0" style={{ padding: '12px 18px calc(96px + env(safe-area-inset-bottom, 0px))' }}>
        <GlassCard tone="race" radius={24} padding={16} data-testid="cup-trofeu-cabecalho">
          <p className="m-0 text-[12.5px] font-extrabold" style={{ color: 'var(--text-1)' }}>{clubeLabel(enrollment, teams)}</p>
          <p className="m-0 text-[11.5px] mt-1" style={{ color: 'var(--text-3)' }}>
            Escalão {category?.code || 'por confirmar'} · {objetivo}
          </p>
          {edition?.regulation_url && (
            <a
              href={edition.regulation_url}
              target="_blank"
              rel="noreferrer"
              data-testid="cup-trofeu-regulamento"
              className="inline-flex items-center gap-1 text-[11.5px] font-extrabold mt-2"
              style={{ color: 'var(--race)', minHeight: 44 }}
            >
              Regulamento <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
        </GlassCard>

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
          </GlassCard>
        )}

        <SectionLabel style={{ margin: '4px 2px 0' }}>As tuas jornadas</SectionLabel>

        {!catalogReady ? (
          <p className="text-[12px] m-0 pt-1" style={{ color: 'var(--text-4)' }} role="status">A ler o calendário…</p>
        ) : (rounds || []).length === 0 ? (
          <GlassCard radius={20} padding={14} data-testid="cup-trofeu-sem-calendario">
            <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-3)', lineHeight: 'var(--leading-normal)' }}>
              Ainda não saiu o calendário desta edição.
            </p>
            <label htmlFor="cup-notify-calendar" className="flex items-center gap-2.5 mt-3" style={{ ...CARD, padding: 12, minHeight: 44 }}>
              <input
                id="cup-notify-calendar"
                type="checkbox"
                checked={!!enrollment.notify_calendar}
                onChange={(e) => avisarCalendario(e.target.checked)}
                style={{ width: 20, height: 20, accentColor: 'var(--race)' }}
              />
              <span className="text-[12.5px] font-bold" style={{ color: 'var(--text-2)' }}>Avisa-me quando sair</span>
            </label>
          </GlassCard>
        ) : (
          <div className="flex flex-col gap-2">
            {rounds.map((r) => (
              <JornadaRow key={r.id} round={r} decision={efetiva(r)} onChange={mudarDecisao} roundLabel={roundLabel} />
            ))}
          </div>
        )}
      </div>

      {pendentes.length > 0 && !adiado && (
        <div className="shrink-0 flex items-center gap-2" style={{ padding: '10px 18px calc(14px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--border-glass)', background: 'var(--bg-app)' }}>
          <Button variant="module" moduleColor="var(--race)" className="flex-1" data-testid="cup-confirmar" isLoading={aConfirmar} onClick={confirmar}>
            Confirmar: {contarVou} vou, {contarNaoVou} não vou
          </Button>
          <Button variant="ghost" data-testid="cup-decidir-depois" onClick={() => setAdiado(true)}>
            Decidir depois
          </Button>
        </div>
      )}

      {gerirAberto && (
        <GerirInscricaoSheet view={view} onClose={() => setGerirAberto(false)} onLeft={() => { setGerirAberto(false); onClose(); }} />
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(conteudo, document.body) : conteudo;
}
