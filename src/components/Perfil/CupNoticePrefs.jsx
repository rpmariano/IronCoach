import React, { useId, useState } from 'react';
import { Trophy } from 'lucide-react';
import { useAppStore } from '../../store';
import { useCupForHome } from '../../utils/useCup';
import { useToast } from '../shared/ToastProvider';

/* Os avisos do Troféu no Perfil › Carol (specs/trofeu.md §8, Fase 5).
   2026-09-27.

   Só para quem está INSCRITO: useCupForHome não lê nada sem indício de
   inscrição (a pista local ou uma prova de jornada por correr) e devolve null
   a quem não está — o Perfil fica exatamente como era, sem leitura nenhuma.
   (O limite é o do Início: inscrito noutro dispositivo e sem nenhuma prova de
   jornada, o bloco só aparece depois de abrir Provas uma vez.)

   As quatro preferências vivem na inscrição (cup_enrollments.notify_*, todas
   desligadas por omissão), não no perfil: por isso ficam FORA do rascunho do
   Perfil — cada interruptor grava ao tocar, pela RPC update_enrollment (a
   mesma do "Avisa-me quando sair" do ecrã do Troféu). Enquanto grava, o
   interruptor mostra o que se pediu e todos ficam parados (duas gravações ao
   mesmo tempo podiam devolver a inscrição pela ordem errada); num erro, volta
   ao que o store tem, que não mudou.

   Não são tipos de `carol_push_types` (a BD recusa cup_* nesse array, §8): a
   preferência de cada aviso é o interruptor dele. O interruptor geral das
   Notificações da Carol, a janela e o máximo por dia valem por cima — é o que
   diz a nota quando estão desligadas. */

const TEXTO = 'A Carol avisa-te por notificação do que muda nas tuas jornadas. Valem as Notificações da Carol, acima — a mesma janela e o mesmo máximo por dia — e nunca mais de 3 avisos por jornada, contando a manhã e o balanço da prova. Com um aviso de jornada ligado (mudanças de data, prazo ou classificação), a véspera de uma jornada fica no chat e no cartão do dia, sem notificação; as jornadas a saltar não têm notificações e as de trote só têm a do prazo de inscrição. Cada aviso grava-se ao tocar.';

export const CUP_NOTICE_SAVE_ERROR = 'Não consegui gravar o aviso. Tenta outra vez.';

const NOTA = 'text-[11px] leading-relaxed rounded-xl px-3 py-2 mt-2';

function Interruptor({ field, label, hint, checked, disabled, busy, onToggle }) {
  const base = useId();
  const labelId = `${base}-nome`;
  const hintId = `${base}-dica`;
  return (
    <label
      htmlFor={`${base}-input`}
      className="flex items-start gap-3"
      data-testid={`perfil-cup-aviso-${field}`}
      style={{
        minHeight: 44, padding: '10px 12px', borderRadius: 14,
        background: 'var(--surface-soft)', border: '1px solid var(--border-glass)',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled && !busy ? 0.6 : 1,
      }}
    >
      <span className="flex-1 min-w-0">
        <span id={labelId} className="block text-[12.5px] font-bold" style={{ color: 'var(--text-1)' }}>{label}</span>
        <span id={hintId} className="block text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>{hint}</span>
      </span>
      <input
        id={`${base}-input`}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={hintId}
        aria-busy={busy || undefined}
        onChange={(e) => { if (!disabled) onToggle(field, e.target.checked); }}
        style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0, accentColor: 'var(--race)' }}
      />
    </label>
  );
}

export default function CupNoticePrefs({ pushEnabled = false }) {
  const view = useCupForHome();
  const updateEnrollment = useAppStore((s) => s.updateEnrollment);
  const { showToast } = useToast();
  const titleId = useId();
  // { field, on } enquanto grava; null parado.
  const [pending, setPending] = useState(null);

  const enrollment = view?.enrollment?.status === 'ativa' ? view.enrollment : null;
  if (!enrollment) return null;
  const edition = view.edition || {};

  const toggle = async (field, on) => {
    if (pending) return;
    setPending({ field, on });
    let res = null;
    try {
      res = await updateEnrollment(enrollment.id, { [field]: on });
    } catch {
      res = null;
    }
    setPending(null);
    if (!res?.ok) showToast(CUP_NOTICE_SAVE_ERROR, 'error');
  };

  const valor = (field) => (pending?.field === field ? pending.on : enrollment[field] === true);
  // "Quando sair o calendário" enquanto não saiu (nenhuma jornada
  // confirmada; com o catálogo por ler, não se sabe) — e, depois de sair,
  // enquanto estiver ligado: a inscrição sem calendário liga-o sozinha
  // ("Avisa-me quando sair"), e tem de haver onde o desligar. Desligado
  // depois de sair, desaparece (já não há nada a ligar).
  const semCalendario = !!view.catalogReady && !(view.rounds || []).some((r) => r?.date_status === 'confirmada');
  const comCalendario = semCalendario || enrollment.notify_calendar === true || pending?.field === 'notify_calendar';
  const porJornada = edition.entry_mode === 'por_jornada';
  const peloClube = enrollment.entry_by === 'clube';
  const comClassificacao = edition.results_source !== 'nenhuma';

  const itens = [
    comCalendario && {
      field: 'notify_calendar',
      label: 'Quando sair o calendário',
      hint: semCalendario
        ? 'Uma notificação, quando as jornadas forem confirmadas.'
        : 'O calendário já saiu: é só essa notificação, se ainda não te chegou.',
    },
    {
      field: 'notify_date_changes',
      label: 'Mudanças de data',
      hint: 'Das jornadas em que disseste Vou.',
    },
    porJornada && {
      field: 'notify_entry_deadline',
      label: 'Prazo de inscrição',
      hint: peloClube
        ? 'Quem te inscreve é o clube: não há prazo a lembrar-te.'
        : '48 h antes de fechar, se ainda não te inscreveste.',
      // Inscrito pelo clube, o servidor nunca manda este aviso: o interruptor
      // mostra o que ele recebe (nada) e não se mexe.
      locked: peloClube,
    },
    comClassificacao && {
      field: 'notify_results',
      label: 'Classificação',
      hint: 'Das jornadas que correste, quando sair. O lugar e os pontos ficam para o chat.',
    },
  ].filter(Boolean);

  return (
    <div
      className="mt-5 pt-4 border-t border-[var(--border-glass)] dark:border-[var(--border-glass)]"
      data-testid="perfil-cup-avisos"
      role="group"
      aria-labelledby={titleId}
    >
      <p id={titleId} className="text-xs font-semibold flex items-center gap-1.5">
        <Trophy size={14} aria-hidden="true" style={{ color: 'var(--race)' }} /> Avisos · {view.shortName || 'Troféu'}
      </p>
      <p className="text-[11px] text-[var(--text-3)] mt-1 leading-relaxed">{TEXTO}</p>
      {!pushEnabled && (
        <p role="note" data-testid="perfil-cup-avisos-sem-push" className={NOTA} style={{ background: 'var(--surface-soft)', color: 'var(--text-2)' }}>
          As Notificações da Carol estão desligadas: estes avisos só chegam com elas ligadas.
        </p>
      )}
      {edition.notifications_enabled === false && (
        <p role="note" data-testid="perfil-cup-avisos-edicao-desligada" className={NOTA} style={{ background: 'var(--surface-soft)', color: 'var(--text-2)' }}>
          A app ainda não está a enviar os avisos desta edição. O que escolheres fica guardado.
        </p>
      )}
      <div className="mt-3 space-y-2">
        {itens.map(({ field, label, hint, locked }) => (
          <Interruptor
            key={field}
            field={field}
            label={label}
            hint={hint}
            checked={locked ? false : valor(field)}
            disabled={!!locked || !!pending}
            busy={pending?.field === field}
            onToggle={toggle}
          />
        ))}
      </div>
    </div>
  );
}
