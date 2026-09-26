import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Sparkles } from 'lucide-react';
import { useAppStore } from '../../store';
import AppBackground from '../Layout/AppBackground';
import ActionBar from '../shared/ActionBar';
import { todayISO } from '../../lib/utils';
import {
  usePersistedFormDraft,
  restorePersistedFormDraft,
  clearPersistedFormDraft,
} from '../../utils/formDraftPersistence';
import {
  StepCarol, StepQuemEs, StepObjetivo, StepComoCorres, StepComoComes, StepProva, StepFecho,
  OBJETIVOS, TEMPO_A_CORRER,
} from './OnboardingSteps';
import { dietaryRestrictionLabel } from '../../utils/diet';
import { supabase } from '../../lib/supabase';
import { parseDurationToSeconds } from '../../utils/run';
import { firstName, reactToRace } from './carolReactions';

/* ════════════════════════════════════════════════════════════════════════
   Onboarding — o arranque (ponto 8 do handoff 2026-09, direção 6c)

   Seis passos conduzidos pela Carol no primeiro acesso, e reentráveis a
   partir de Perfil · Coach ("Rever o arranque com a Carol"). Os ecrãs são os
   da secção "Onboarding · o arranque" do mock; o passo 3 está em "Estados em
   falta" como "Onboarding 3".

   ── Onde vive cada resposta ────────────────────────────────────────────
   passo 2  nome, nascimento, altura, peso, sexo      → profiles
   passo 3  objetivo                                  → coach_notes (objetivo_pessoal)
   passo 4  nível                                     → profiles.experience_level
            km/semana + dias/semana                   → coach_notes (disponibilidade)
   passo 5  restrições + notas                        → profiles
   passo 6  nome/data/distância/terreno da prova      → formulário de Prova pré-preenchido

   O passo 6 NÃO insere em `race_events` diretamente: a tabela exige local,
   objetivo de tempo e ritmo-alvo (todos NOT NULL — ver supabase_schema.sql), e
   o mock do arranque não os pergunta. Inventá-los seria pior do que pedi-los:
   ao sair do Fecho, quem declarou uma prova cai no formulário que já existe
   (RunAgenda) com os quatro campos preenchidos, e completa ali o que falta.

   ── Fora do Layout ─────────────────────────────────────────────────────
   O arranque não tem navegação inferior (é o arranque; o mock não a mostra) —
   por isso é renderizado por App.jsx FORA do <Layout>, ocupa o ecrã todo e traz
   o seu próprio fundo. A ActionBar leva `aboveNav={false}`: cola ao fundo em
   vez de assentar sobre uma nav que aqui não existe.

   ── Um refresh a meio não perde nada ───────────────────────────────────
   Todas as respostas vivem num rascunho único persistido em localStorage
   (utils/formDraftPersistence.js, o mesmo mecanismo dos registos) e vão para a
   base de dados num só UPDATE no fim. Escrever passo a passo deixaria perfis
   meio preenchidos por quem desiste ao terceiro ecrã; o rascunho dá a mesma
   garantia sem esse custo. O rascunho só é limpo ao terminar.
   ════════════════════════════════════════════════════════════════════════ */

const STEP_KEYS = ['carol', 'quem-es', 'objetivo', 'como-corres', 'como-comes', 'prova', 'fecho'];
const TOTAL_PASSOS = 6;
const LAST_STEP = STEP_KEYS.length - 1;

const EMPTY_DRAFT = {
  display_name: '',
  birth_date: '',
  height_cm: '',
  weight_kg: '',
  gender: '',
  goal: '',
  experience_level: '',
  weekly_km: '',
  days_per_week: '',
  dietary_restrictions: [],
  dietary_notes: '',
  race_name: '',
  race_date: '',
  race_distance_km: '',
  race_type: 'estrada',
  /* Os três que faltavam para a prova poder NASCER GRAVADA em vez de ir
     abrir o formulário de criar prova por cima do fim do arranque
     (relatado pelo utilizador). São os obrigatórios da validação de
     Run/RunAgenda.jsx: local, objetivo de tempo e, só no trail, o D+. */
  race_location: '',
  race_target_time: '',
  race_elevation_gain_m: '',
};

const numText = (v) => (v === null || v === undefined || v === '' ? '' : String(v));
const parseNum = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/* Semanas inteiras entre hoje e a data da prova (mínimo 0). */
export function weeksUntil(dateISO, from = todayISO()) {
  if (!dateISO) return null;
  const alvo = new Date(`${dateISO}T00:00:00`);
  const base = new Date(`${from}T00:00:00`);
  if (Number.isNaN(alvo.getTime()) || Number.isNaN(base.getTime())) return null;
  const dias = Math.round((alvo - base) / 86400000);
  if (dias < 0) return 0;
  return Math.floor(dias / 7);
}

/* Semeia o rascunho a partir do que já existe — é isto que faz a reentrada
   pelo Perfil abrir com as respostas já dadas (perfil, memória do Coach e a
   próxima prova marcada) em vez de um formulário vazio. */
export function seedDraftFrom({ profile, coachNotes, raceEvents } = {}) {
  const p = profile || {};
  const notas = Array.isArray(coachNotes) ? coachNotes : [];
  const objetivoNota = notas.find((n) => n.category === 'objetivo_pessoal');
  const objetivo = OBJETIVOS.find((o) => objetivoNota?.note?.startsWith(o.title));

  const dispNota = notas.find((n) => n.category === 'disponibilidade' && /km por semana/.test(n.note || ''));
  const km = dispNota?.note?.match(/(\d+(?:[.,]\d+)?)\s*km por semana/);
  const dias = dispNota?.note?.match(/(\d+)\s*dias? por semana/);

  const hoje = todayISO();
  const proxima = (Array.isArray(raceEvents) ? raceEvents : [])
    .filter((r) => r.date >= hoje)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];

  return {
    ...EMPTY_DRAFT,
    display_name: p.display_name || p.full_name || '',
    birth_date: p.birth_date || '',
    height_cm: numText(p.height_cm),
    weight_kg: numText(p.weight_kg),
    gender: p.gender || '',
    goal: objetivo?.key || '',
    experience_level: TEMPO_A_CORRER.some((t) => t.key === p.experience_level) ? p.experience_level : '',
    weekly_km: km ? km[1].replace(',', '.') : '',
    days_per_week: dias ? dias[1] : '',
    dietary_restrictions: p.dietary_restrictions || [],
    dietary_notes: p.dietary_notes || '',
    race_name: proxima?.name || '',
    race_date: proxima?.date || '',
    race_distance_km: numText(proxima?.distance_km),
    race_type: proxima?.race_type || 'estrada',
  };
}

/* ── botões da barra de ação ─────────────────────────────────────────────── */

function PrimaryButton({ children, tone = 'coach', hero = false, ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      className="w-full inline-flex items-center justify-center gap-2 transition active:scale-[.98] disabled:opacity-60"
      style={{
        minHeight: hero ? 'var(--tap-hero)' : 50,
        borderRadius: 'var(--radius-md)',
        border: 'none',
        // --grad-coach desce ate --coach-deep, onde a tinta da 3,00:1 (medido no
        // primeiro ecra do arranque). O -legible e o mesmo gradiente travado
        // no degrau anterior: 5,6:1.
        background: tone === 'race' ? 'var(--grad-race)' : 'var(--grad-coach-legible)',
        color: tone === 'race' ? 'var(--race-ink)' : 'var(--coach-ink)',
        fontSize: hero ? 15 : 14.5,
        fontWeight: 800,
      }}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, style, ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      className="inline-flex items-center justify-center transition active:scale-[.98]"
      style={{
        minHeight: 'var(--tap)',
        padding: '0 16px',
        borderRadius: 'var(--radius-md)',
        border: 'none',
        background: 'transparent',
        color: 'var(--text-muted)',
        fontSize: 13,
        fontWeight: 700,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */

export default function Onboarding({ reentry = false, onDone }) {
  const profile = useAppStore((s) => s.profile);
  const coachNotes = useAppStore((s) => s.coachNotes);
  const raceEvents = useAppStore((s) => s.raceEvents);
  const addCoachNote = useAppStore((s) => s.addCoachNote);
  const markOnboardingDone = useAppStore((s) => s.markOnboardingDone);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setOpenCreationMode = useAppStore((s) => s.setOpenCreationMode);
  const setRacePrefill = useAppStore((s) => s.setRacePrefill);
  const setCoachIntent = useAppStore((s) => s.setCoachIntent);

  const userId = profile?.id || 'anon';
  const draftKey = `ironcoach_onboarding_draft_${userId}`;

  const [step, setStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState(() => {
    const semeado = seedDraftFrom({ profile, coachNotes, raceEvents });
    const guardado = restorePersistedFormDraft(draftKey);
    return guardado ? { ...semeado, ...guardado } : semeado;
  });
  const [isDirty, setIsDirty] = useState(false);
  const scrollRef = useRef(null);

  usePersistedFormDraft(draftKey, draft, { isDirty });

  const set = useCallback((campo, valor) => {
    setIsDirty(true);
    setDraft((d) => ({ ...d, [campo]: valor }));
  }, []);

  // Cada passo começa no topo — sem isto, vir de um passo longo deixa o
  // seguinte a meio.
  useEffect(() => {
    // jsdom não implementa Element.scrollTo — daí o teste à função, e não só
    // à referência (o mesmo cuidado que Layout.jsx tem com o scroll do main).
    if (typeof scrollRef.current?.scrollTo === 'function') {
      scrollRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [step]);

  const semanas = weeksUntil(draft.race_date);
  const temProva = !!(draft.race_name.trim() && draft.race_date && parseNum(draft.race_distance_km));
  /* Tem tudo o que a BD exige? Então grava-se aqui e o atleta nunca vê o
     formulário. Faltando alguma coisa, cai-se no comportamento antigo:
     pré-preenche e abre o formulário para ele completar. */
  const provaCompleta = !!(
    temProva
    && draft.race_location.trim()
    && parseDurationToSeconds(draft.race_target_time)
    && (draft.race_type !== 'trail' || Number.isFinite(parseNum(draft.race_elevation_gain_m)))
  );

  /* A nota da Carol do passo 6 é a única que depende das respostas — o mock
     mostra-a com os números do exemplo ("Com 38 km por semana e 25 semanas
     até lá…"). O veredicto de viabilidade que o mock dá a seguir NÃO se
     reproduz aqui: quem o calcula é a doutrina (utils/raceViability.js) e só
     com a prova gravada. Afirmá-lo às cegas seria pôr na boca da Carol uma
     garantia que ela ainda não tem — o oposto de CAROL.md §2. */
  const notaProva = useMemo(() => {
    // Com menos de uma semana, "0 semanas até lá" não é conta que ela diga.
    if (semanas === 0) {
      return 'É já esta semana. Não há plano que caiba; preparo-te a véspera e o dia.';
    }
    const km = parseNum(draft.weekly_km);
    if (km && semanas != null) {
      return `Com ${km} km por semana e ${semanas} ${semanas === 1 ? 'semana' : 'semanas'} até lá, já sei por onde começar o plano. Vou dizer-te se algo mudar.`;
    }
    return 'A data e a distância são o que me deixa contar as semanas para trás. Vou dizer-te se algo mudar.';
  }, [draft.weekly_km, semanas]);

  const resumo = useMemo(() => {
    const linhas = [];
    if (draft.display_name.trim()) linhas.push({ label: 'Nome', value: draft.display_name.trim() });
    const objetivo = OBJETIVOS.find((o) => o.key === draft.goal);
    if (objetivo) linhas.push({ label: 'Objetivo', value: objetivo.title });
    const nivel = TEMPO_A_CORRER.find((t) => t.key === draft.experience_level);
    if (nivel) linhas.push({ label: 'A correr há', value: nivel.title });
    const km = parseNum(draft.weekly_km);
    const dias = parseNum(draft.days_per_week);
    if (km || dias) {
      linhas.push({
        label: 'Semana típica',
        value: [km ? `${km} km` : null, dias ? `${dias} dias` : null].filter(Boolean).join(' · '),
      });
    }
    const restricoes = draft.dietary_restrictions || [];
    linhas.push({
      label: 'À mesa',
      value: restricoes.length ? restricoes.map(dietaryRestrictionLabel).join(', ') : 'Como de tudo',
    });
    if (temProva) {
      linhas.push({ label: 'A tua prova', value: `${draft.race_name.trim()} · ${parseNum(draft.race_distance_km)} km` });
    }
    return linhas;
  }, [draft, temProva]);

  const nome = firstName(draft.display_name);
  const feito = nome ? `Está feito, ${nome}.` : 'Está feito.';
  const tituloFecho = temProva && semanas != null
    ? <>{feito}<br />{semanas} {semanas === 1 ? 'semana' : 'semanas'} até {draft.race_name.trim()}.</>
    : <>{feito}<br />Vamos começar.</>;

  /* ── gravação ─────────────────────────────────────────────────────────
     Um só UPDATE no perfil, no fim. Tolera a coluna `onboarding_done` ainda
     não existir na base de dados (a migração e o frontend chegam por vias
     diferentes): `markOnboardingDone` do store repete o UPDATE sem ela, deixa
     o erro na consola e grava a marca em localStorage por utilizador — a
     rede que impede o arranque de reaparecer neste dispositivo.
     As duas notas da Carol (objetivo e disponibilidade) vão à parte: falham
     em silêncio no seu próprio store se o utilizador não tiver sessão
     (modo demo), sem travar o fim do arranque. */
  const gravar = useCallback(async () => {
    const perfil = {};
    if (draft.display_name.trim()) perfil.display_name = draft.display_name.trim();
    if (draft.birth_date) perfil.birth_date = draft.birth_date;
    const altura = parseNum(draft.height_cm);
    if (altura) perfil.height_cm = altura;
    const peso = parseNum(draft.weight_kg);
    if (peso) perfil.weight_kg = peso;
    if (draft.gender) perfil.gender = draft.gender;
    if (draft.experience_level) perfil.experience_level = draft.experience_level;
    perfil.dietary_restrictions = (draft.dietary_restrictions || []).length ? draft.dietary_restrictions : null;
    perfil.dietary_notes = draft.dietary_notes.trim() || null;

    await markOnboardingDone(perfil);

    const objetivo = OBJETIVOS.find((o) => o.key === draft.goal);
    if (objetivo) {
      await addCoachNote({ category: 'objetivo_pessoal', note: `${objetivo.title} — ${objetivo.description.toLowerCase()}.` });
    }
    const km = parseNum(draft.weekly_km);
    const dias = parseNum(draft.days_per_week);
    if (km || dias) {
      const partes = [km ? `${km} km por semana` : null, dias ? `${dias} dias por semana` : null].filter(Boolean);
      await addCoachNote({ category: 'disponibilidade', note: `No arranque declarou ${partes.join(', ')}.` });
    }

    clearPersistedFormDraft(draftKey);
    setIsDirty(false);
  }, [draft, addCoachNote, markOnboardingDone, draftKey]);

  /* Grava a prova do passo 6 diretamente em race_events. Espelha o payload
     de Run/RunAgenda.jsx (handleSaveForm) nos campos que a BD tem como NOT
     NULL — incluindo o ritmo-alvo, que lá é calculado a partir do tempo e
     não é pedido duas vezes. O nível é o do perfil como ponto de partida: o
     nível POR PROVA existe para poder ser diferente, e o atleta pode mudá-lo
     depois no hub, mas obrigá-lo a declará-lo duas vezes no arranque era
     ruído. Devolve true se ficou gravada — é isso que decide se o formulário
     de criar prova ainda precisa de abrir. */
  const gravarProva = useCallback(async () => {
    const userId = profile?.id;
    const distancia = parseNum(draft.race_distance_km);
    const tempoSegundos = parseDurationToSeconds(draft.race_target_time);
    if (!userId || !distancia || !tempoSegundos) return false;
    /* Reabrir o arranque pelo Perfil (reentry) restaura o rascunho com os
       campos da prova ainda preenchidos — sem esta verificação, terminá-lo
       outra vez inseria uma segunda prova igual, e o atleta nem via o
       formulário para dar por isso. O par nome+data chega: é o que ele
       reconheceria como "a mesma prova". */
    const nome = draft.race_name.trim();
    const jaExiste = (raceEvents || []).some((e) => (
      String(e?.name || '').trim().toLowerCase() === nome.toLowerCase()
      && String(e?.date || '').slice(0, 10) === draft.race_date
    ));
    if (jaExiste) return true;
    try {
      const payload = {
        user_id: userId,
        name: nome,
        date: draft.race_date,
        location: draft.race_location.trim(),
        race_type: draft.race_type,
        distance_km: distancia,
        target_time: draft.race_target_time.trim(),
        target_time_seconds: tempoSegundos,
        target_pace_seconds_per_km: Math.round(tempoSegundos / distancia),
        // Sem nível declarado fica null: 'iniciante' aqui tornava impossível
        // distinguir quem saltou a pergunta (phaseGuidance), e os números já
        // caem nele sozinhos (resolveExperienceLevel).
        experience_level: draft.experience_level || null,
        race_priority: 'a',
        elevation_gain_m: draft.race_type === 'trail' ? parseNum(draft.race_elevation_gain_m) : null,
        /* Sem `status`: deixa o default da coluna ('agendada'). Marcá-la
           'concluida' por a data ser passada criava uma prova concluída SEM
           corrida ligada, e essas são filtradas por completedRaces — o que
           cortava já a sequência no medalhão "A Sequência" a quem
           declarasse no arranque uma prova que já correu.

           NOTA: isto DIVERGE de propósito do formulário da prova, que ainda
           põe `status: date < hoje ? 'concluida' : 'agendada'` no insert
           (Run/RunAgenda.jsx). O mesmo defeito continua lá; não se corrigiu
           aqui por estar fora do âmbito. Quem for alinhar os dois, alinhe o
           formulário por este, não o contrário. */
      };
      const { data, error } = await supabase.from('race_events').insert(payload).select().single();
      if (error || !data) {
        console.warn('Não foi possível gravar a prova do arranque:', error);
        return false;
      }
      useAppStore.getState().setRaceEvents([...(raceEvents || []), data]);
      return true;
    } catch (err) {
      console.warn('Não foi possível gravar a prova do arranque:', err);
      return false;
    }
  }, [profile, draft, raceEvents]);

  /* Termina o arranque. `destino`:
     - 'home'  → Início. A prova do passo 6 já foi gravada aqui quando tinha
                 tudo (gravarProva); só se faltar um obrigatório é que o
                 formulário de Prova abre, pré-preenchido.
     - 'coach' → separador Coach, e é a Carol que abre a conversa sobre o
                 plano que prometeu no arranque (intent onboarding_start).
     - 'skip'  → saída pelo "Já uso a app noutro dispositivo" do passo 1: marca
                 o arranque como feito sem levar ninguém a lado nenhum. */
  const terminar = useCallback(async (destino) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await gravar();
    } finally {
      setIsSaving(false);
    }

    /* A prova declarada no passo 6 grava-se AQUI quando tem tudo o que a BD
       exige. Antes ia sempre abrir o formulário de criar prova por cima do
       fim do arranque — seis ecrãs de perguntas para acabar num sétimo
       formulário, com metade dos campos já respondidos (relatado pelo
       utilizador). Faltando algum obrigatório, o formulário continua a
       abrir, pré-preenchido, que é melhor do que perder a resposta. */
    let provaGravada = false;
    if (provaCompleta) {
      provaGravada = await gravarProva();
    }

    if (destino === 'coach') {
      setActiveTab('coach');
      /* O arranque prometeu um plano e acabava sem nenhum: é ela que abre a
         conversa, já com tudo o que ele acabou de contar (ver
         Coach/Coach.jsx, onboarding_start). */
      setCoachIntent('onboarding_start');
    } else if (destino === 'home') {
      if (!reentry) setActiveTab('home');
      if (temProva && !provaGravada) {
        setRacePrefill({
          name: draft.race_name.trim(),
          date: draft.race_date,
          distance_km: String(parseNum(draft.race_distance_km)),
          race_type: draft.race_type,
          location: draft.race_location.trim(),
          target_time: draft.race_target_time.trim(),
          ...(draft.race_type === 'trail' && draft.race_elevation_gain_m !== ''
            ? { elevation_gain_m: String(draft.race_elevation_gain_m) }
            : {}),
        });
        setOpenCreationMode('race');
      }
    }
    onDone?.();
  }, [isSaving, gravar, gravarProva, reentry, temProva, provaCompleta, draft, setActiveTab, setCoachIntent, setOpenCreationMode, setRacePrefill, onDone]);

  /* O passo seguinte entra do lado de onde se vem — da direita a avançar,
     da esquerda a recuar — com a mesma entrada dos separadores (tabEnter,
     --dur-tab-content). */
  const [sentido, setSentido] = useState(1);
  const avancar = () => { setSentido(1); setStep((s) => Math.min(LAST_STEP, s + 1)); };
  const recuar = () => {
    if (step === 0) { onDone?.(); return; }
    setSentido(-1);
    setStep((s) => Math.max(0, s - 1));
  };

  /* ── cabeçalho contextual ─────────────────────────────────────────────
     "Voltar" + barra de progresso de 6 segmentos + "n/6", como o mock. O
     primeiro passo e o fecho não o mostram (também não o mostram no mock);
     na reentrada pelo Perfil, o primeiro passo ganha o "Voltar" à mesma,
     porque aí há mesmo para onde voltar. */
  const mostraProgresso = step > 0 && step < LAST_STEP;
  const mostraVoltar = mostraProgresso || (step === 0 && reentry);

  const corpo = (() => {
    switch (STEP_KEYS[step]) {
      case 'carol': return <StepCarol />;
      case 'quem-es': return <StepQuemEs draft={draft} set={set} />;
      case 'objetivo': return <StepObjetivo draft={draft} set={set} />;
      case 'como-corres': return <StepComoCorres draft={draft} set={set} />;
      case 'como-comes': return <StepComoComes draft={draft} set={set} />;
      case 'prova': return <StepProva draft={draft} set={set} carolNote={notaProva} reaction={reactToRace(draft, semanas)} />;
      default: return <StepFecho titulo={tituloFecho} resumo={resumo} semanas={temProva ? semanas : null} raceName={temProva ? draft.race_name.trim() : ''} />;
    }
  })();

  const barra = (() => {
    switch (STEP_KEYS[step]) {
      case 'carol':
        return (
          <ActionBar aboveNav={false} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 9 }}>
            <PrimaryButton hero onClick={avancar}>Vamos a isso</PrimaryButton>
            <GhostButton disabled={isSaving} onClick={() => terminar('skip')} style={{ minHeight: 'var(--tap)' }}>
              Já uso a app noutro dispositivo
            </GhostButton>
          </ActionBar>
        );
      case 'objetivo':
        return (
          <ActionBar aboveNav={false}>
            <div className="flex-1 min-w-0"><PrimaryButton onClick={avancar}>Continuar</PrimaryButton></div>
            <GhostButton onClick={() => { set('goal', ''); avancar(); }}>Saltar</GhostButton>
          </ActionBar>
        );
      case 'como-comes':
        return (
          <ActionBar aboveNav={false}>
            <div className="flex-1 min-w-0"><PrimaryButton onClick={avancar}>Continuar</PrimaryButton></div>
            <GhostButton onClick={() => { set('dietary_restrictions', []); set('dietary_notes', ''); avancar(); }}>
              Como tudo
            </GhostButton>
          </ActionBar>
        );
      case 'prova':
        return (
          <ActionBar aboveNav={false} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 9 }}>
            <PrimaryButton hero onClick={avancar}>
              <Sparkles size={17} /> Criar o meu plano
            </PrimaryButton>
            <GhostButton onClick={() => {
              set('race_name', '');
              set('race_date', '');
              set('race_distance_km', '');
              set('race_location', '');
              set('race_target_time', '');
              set('race_elevation_gain_m', '');
              avancar();
            }}>
              Ainda não tenho prova marcada
            </GhostButton>
          </ActionBar>
        );
      case 'fecho':
        return (
          <ActionBar aboveNav={false} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 9 }}>
            {/* O destino principal é o chat, não a Home: o arranque promete
                um plano ("escrevo o plano, tu decides") e acabava sem plano
                nenhum e sem conversa — o atleta ficava à espera de algo que
                não vinha (relatado pelo utilizador). Quem quiser ver a app
                primeiro continua a poder ir para o Início. */}
            <PrimaryButton hero tone="race" disabled={isSaving} onClick={() => terminar('coach')}>
              <Sparkles size={17} /> Combinar o meu plano
            </PrimaryButton>
            <GhostButton disabled={isSaving} onClick={() => terminar('home')} style={{ minHeight: 'var(--tap)' }}>
              Ver o Início primeiro
            </GhostButton>
          </ActionBar>
        );
      default:
        return (
          <ActionBar aboveNav={false}>
            <div className="flex-1 min-w-0"><PrimaryButton onClick={avancar}>Continuar</PrimaryButton></div>
          </ActionBar>
        );
    }
  })();

  return (
    <div
      data-testid="onboarding"
      data-step={STEP_KEYS[step]}
      className="fixed inset-0 flex flex-col"
      // O anel de foco de todo o arranque é o ciano da Carol (ponto 5 da
      // tarefa; a regra global *:focus-visible já o lê de --focus-ring).
      style={{ background: 'var(--bg-app)', color: 'var(--text-1)', '--focus-ring': 'var(--coach)' }}
    >
      <AppBackground />

      {(mostraVoltar || mostraProgresso) && (
        <div
          className="absolute left-1/2 -translate-x-1/2 w-full max-w-md flex items-center gap-3"
          style={{ top: 0, zIndex: 'var(--z-header)', padding: '22px 20px 0' }}
        >
          <button
            type="button"
            aria-label="Voltar"
            onClick={recuar}
            className="shrink-0 flex items-center justify-center transition active:scale-95"
            style={{ width: 'var(--tap)', height: 'var(--tap)', marginLeft: -10, borderRadius: 'var(--radius-md)', border: 'none', background: 'transparent', color: 'var(--text-4)' }}
          >
            <ChevronLeft size={20} />
          </button>
          {mostraProgresso && (
            <>
              <div
                className="flex-1 flex"
                role="progressbar"
                aria-valuemin={1}
                aria-valuemax={TOTAL_PASSOS}
                aria-valuenow={step + 1}
                aria-label="Progresso do arranque"
                aria-valuetext={`Passo ${step + 1} de ${TOTAL_PASSOS}`}
                style={{ gap: 5 }}
              >
                {Array.from({ length: TOTAL_PASSOS }, (_, i) => (
                  <span
                    key={i}
                    aria-hidden="true"
                    style={{ flex: 1, height: 4, borderRadius: 99, background: i <= step ? 'var(--coach)' : 'rgba(255,255,255,.14)', transition: 'background-color var(--dur-tab-content) var(--ease-out)' }}
                  />
                ))}
              </div>
              <span className="shrink-0" style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                {step + 1}/{TOTAL_PASSOS}
              </span>
            </>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto flex flex-col mx-auto w-full max-w-md"
        style={{
          padding: mostraProgresso ? '88px 20px 130px' : '74px 24px 140px',
          boxSizing: 'border-box',
        }}
      >
        <div
          key={step}
          className="tab-enter flex-1 flex flex-col"
          style={{ '--tab-enter-from': `${sentido * 14}px` }}
        >
          {corpo}
        </div>
      </div>

      {barra}
    </div>
  );
}
