import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store';
import CarolActions from './CarolActions';
import { interventionNotes, recordInterventionIntent, showRecordIntervention } from '../../utils/recordIntervention';
import {
  dismissProfileIntervention, isProfileInterventionPending, openInterventionIsFromRecord, readOpenIntervention, recordsOfType, resolvedProfile,
} from '../../utils/profileIntervention';
import { useToast } from './ToastProvider';

/* A intervenção da Carol num registo, igual no cartão, no formulário de
   edição e no "Registo Guardado" (2026-10-05, convenção única dos botões da
   Carol):

   - "Falar com a Carol" abre o chat sobre ESTE registo e NÃO dispensa: o
     aviso só sai quando o assunto se resolve (antes, falar gravava logo a
     dispensa e, se a conversa não chegasse a acontecer, o convite perdia-se).
   - "Dispensar" tira-o para sempre, com a chave única do tipo
     (utils/recordIntervention.js), neste dispositivo (localStorage). Se a
     intervenção do perfil por resolver foi aberta por ESTE registo, fecha-a
     também no servidor (bug #111, utils/profileIntervention.js): é o mesmo
     assunto, e o botão flutuante deixava de chamar só por ela. Sem
     confirmação: foi o atleta que carregou em "Dispensar" neste assunto.

   As dispensas leem-se pelo hook do store (reativo): antes era
   useAppStore.getState(), e o botão só desaparecia no render seguinte, por
   acaso. `onTalked` corre depois de o separador mudar de facto (fechar o
   formulário ou o modal); se um ecrã com alterações por gravar travar a
   saída (setActiveTab devolve false), não corre e o pedido desfaz-se.
   `reason` substitui o motivo do pedido ao chat (o "Registo Guardado" usa o
   do perfil quando foi a análise deste registo a marcá-lo). */
export default function CarolInterventionActions({ record, type, onTalked, reason = null, className = '' }) {
  const { dismissedInterventions, dismissIntervention, setCoachIntent, setActiveTab } = useAppStore(useShallow((s) => ({
    dismissedInterventions: s.dismissedInterventions,
    dismissIntervention: s.dismissIntervention,
    setCoachIntent: s.setCoachIntent,
    setActiveTab: s.setActiveTab,
  })));
  const toast = useToast();

  if (!showRecordIntervention(record, type, dismissedInterventions)) return null;

  const talk = (e) => {
    e?.stopPropagation?.();
    setCoachIntent(recordInterventionIntent(record, type, reason));
    if (setActiveTab('coach') !== false) onTalked?.();
    // Travada a saída, o pedido desfaz-se em vez de ficar à espera do
    // próximo chat (como no BadgeDetailSheet).
    else setCoachIntent(null);
  };

  const dismiss = async (e) => {
    e?.stopPropagation?.();
    dismissIntervention(record.id, interventionNotes(record, type));
    // #111: a intervenção do perfil que este registo abriu sai também — senão o botão flutuante
    // continuava a chamar, e voltava no reload. De quem é lê-se no clique, da linha aberta de
    // coach_interventions (utils/profileIntervention.js), nunca de marcas em memória.
    const state = useAppStore.getState();
    const profile = state.profile;
    if (!isProfileInterventionPending(profile)) return;
    let open;
    try {
      open = await readOpenIntervention(profile.id);
    } catch (err) {
      // Sem saber de quem é, não se fecha nada: o registo fica dispensado, o assunto fica.
      console.warn('Não consegui ler a intervenção aberta:', err);
      return;
    }
    const records = [...recordsOfType(useAppStore.getState(), type), record];
    if (!openInterventionIsFromRecord(open, record, type, records)) return;
    // O motivo da linha aberta tem de ser o do perfil (truncado a 500 na linha): senão o perfil
    // que temos já não é o do servidor.
    if (String(open.reason ?? '') !== String(profile.coach_intervention_reason ?? '').slice(0, 500)) return;
    const { setProfile, logImpressionDismissed } = useAppStore.getState();
    const restore = () => {
      const now = useAppStore.getState().profile;
      if (now?.id === profile.id && now.coach_intervention_status === 'resolved') {
        setProfile({ ...now, coach_intervention_status: profile.coach_intervention_status, coach_intervention_reason: profile.coach_intervention_reason });
      }
    };
    setProfile(resolvedProfile(profile));
    try {
      const closed = await dismissProfileIntervention(profile);
      if (closed) {
        logImpressionDismissed?.({ kind: 'alert', key: 'assuntos', title: 'A Carol precisa de falar contigo' });
        return;
      }
      // O motivo mudou no servidor entretanto: é outro assunto, que fica. O perfil relê-se.
      restore();
      useAppStore.getState().refreshProfile?.();
    } catch (err) {
      console.error('Erro ao dispensar intervenção:', err);
      restore();
      useAppStore.getState().clearDismissedIntervention?.(record.id);
      toast?.showToast?.('Não foi possível dispensar o assunto. Tenta outra vez.', 'error');
    }
  };

  return (
    // O clique não sobe ao cartão (que abre/fecha ao toque).
    <div onClick={(e) => e.stopPropagation()} className={className} data-testid={`carol-intervention-${type}`}>
      <CarolActions
        className=""
        talk={{ onClick: talk, testId: `carol-intervention-talk-${record.id}` }}
        dismiss={{ onClick: dismiss, testId: `carol-intervention-dismiss-${record.id}` }}
      />
    </div>
  );
}
