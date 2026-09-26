import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import GlassCard from '../shared/GlassCard';
import SectionLabel from '../shared/SectionLabel';
import Warning from '../shared/Warning';
import Button from '../shared/Button';
import { Input } from '../shared/Input';
import { useEscapeClose } from '../shared/Sheet';
import { todayISO } from '../../lib/utils';
import { classifyEnrollment, enrollmentChoiceError } from '@formulas/cup.ts';

/* Inscrição no Troféu (specs/trofeu.md §4.2, Fase 1). Ecrã inteiro, fora do
   rascunho do Perfil — a inscrição não é um dado do perfil, é uma decisão
   por edição (decisão 4 de §2: o clube fica na inscrição, não no perfil).
   2026-09-26.

   Passos, pela ordem da spec — alguns só aparecem quando fazem falta
   (federado nunca é perguntado duas vezes, o género/nascimento só falta a
   quem não os tem no Perfil, "quem te inscreve" só existe com
   `entry_mode = 'por_jornada'`). Nada se grava a meio: só o botão final
   ("Inscrever-me" ou, sem calendário ainda, "Avisa-me quando sair") chama
   `enrollCup` — a única exceção é o género/nascimento em falta, que tem de
   ficar no Perfil ANTES da RPC (o servidor recusa a inscrição sem eles,
   22023) e por isso se grava aí mesmo, no passo em que se pede. */

const CARD = { background: 'var(--surface-glass)', border: '1px solid var(--border-glass)', borderRadius: 18 };

export const SEASON_GOALS = [
  { value: 'participar', label: 'Só participar', desc: 'Correr as jornadas, sem objetivo de prémio nem de pontos.' },
  { value: 'premio', label: 'Ir a prémio', desc: 'A app conta as presenças que faltam para o mínimo do regulamento.' },
  { value: 'pontos_clube', label: 'Pontos para o clube', desc: 'Contas para a pontuação coletiva do teu clube.' },
  { value: 'marcas', label: 'Melhorar marcas', desc: 'Usas as jornadas para testar forma, sem contar presenças.' },
];

const KIND_TEXT = {
  clube_elegivel: { tone: 'ok', text: 'O teu clube conta, por agora, para o prémio coletivo.' },
  individual_elegivel: { tone: 'ok', text: 'Como individual, contas para o prémio individual.' },
  individual_aberto: { tone: 'warn', text: 'Como individual entras só para participar — sem prémio coletivo, por agora.' },
  clube_aberto: { tone: 'warn', text: 'Este clube não conta, por agora, para o prémio coletivo.' },
  clube_por_confirmar: { tone: 'warn', text: 'Ainda não se sabe se este clube conta para o prémio — fica por confirmar até ao regulamento.' },
};

const CHOICE_ERROR_TEXT = {
  falta_clube: 'Escolhe um clube da lista, ou diz que o teu não está lá.',
  dois_clubes: 'Escolhe só uma opção: um clube da lista, ou "não está na lista".',
  federado_individual: 'Federado não pode escolher Individual — escolhe o teu clube.',
  clube_de_outra_edicao: 'Esse clube não pertence a esta edição.',
};

function Opcao({ id, name, checked, onChange, titulo, descricao, testId }) {
  return (
    <label
      htmlFor={id}
      data-testid={testId}
      className="flex items-start gap-3 w-full cursor-pointer"
      style={{ ...CARD, padding: 14, minHeight: 44 }}
    >
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        style={{ width: 22, height: 22, marginTop: 2, accentColor: 'var(--race)', flexShrink: 0 }}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-extrabold" style={{ color: 'var(--text-1)' }}>{titulo}</span>
        {descricao && <span className="block text-[11.5px] mt-1" style={{ color: 'var(--text-3)', lineHeight: 'var(--leading-normal)' }}>{descricao}</span>}
      </span>
    </label>
  );
}

export default function CupEnrollmentScreen({ view, onClose, onEnrolled }) {
  const { profile, setProfile, enrollCup } = useAppStore();
  useEscapeClose(onClose);

  const edition = view?.edition;
  const teams = view?.teams || [];
  const semCalendario = !!view?.catalogReady && (view?.rounds?.length ?? 0) === 0;
  // Congelados ao montar (revisão da Fase 1, 2026-09-26). `view` é vivo — vem
  // do useCup() de Provas — e gravar o género/nascimento no passo 'perfil'
  // põe profileMissing a false no render seguinte. Com os passos a sair do
  // valor vivo, o passo 'perfil' desaparecia da lista a meio e o índice
  // saltava um: "Quem te inscreve" nunca aparecia (entry_by ficava null em
  // silêncio) ou, sem por_jornada, o índice ficava fora da lista e o ecrã
  // vazio, sem nunca chegar a "Inscrever-me".
  const [precisaGenero] = useState(() => !!view?.profileMissing?.gender);
  const [precisaNascimento] = useState(() => !!view?.profileMissing?.birthDate);
  const [entryMode] = useState(() => edition?.entry_mode ?? null);

  const [draft, setDraft] = useState({
    federado: null,
    teamId: null,
    outroClube: false,
    teamOther: '',
    seasonGoal: 'participar',
    bib: '',
    bibDesconhecido: false,
    gender: profile?.gender || '',
    birthDate: profile?.birth_date || '',
    entryBy: null,
  });
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  // Os passos que fazem falta a ESTA edição e a ESTE perfil (§4.2.6: sem
  // género/nascimento a BD recusa; "quem te inscreve" só com por_jornada).
  // Só dependem dos valores congelados acima: a lista não muda a meio.
  const steps = useMemo(() => {
    const s = ['edicao', 'federado', 'clube', 'objetivo', 'dorsal'];
    if (precisaGenero || precisaNascimento) s.push('perfil');
    if (entryMode === 'por_jornada') s.push('quem_inscreve');
    s.push('privacidade');
    return s;
  }, [precisaGenero, precisaNascimento, entryMode]);

  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  const [erro, setErro] = useState(null);
  const [aSubmeter, setASubmeter] = useState(false);

  const choice = { team_id: draft.outroClube ? null : draft.teamId, team_other: draft.outroClube ? draft.teamOther : null, is_federated: draft.federado === true };
  const choiceError = step === 'clube' ? enrollmentChoiceError(choice, teams, edition?.id) : null;
  const kind = step === 'clube' && !choiceError ? classifyEnrollment(choice, teams) : null;

  const canContinue = (() => {
    if (step === 'federado') return draft.federado === true || draft.federado === false;
    if (step === 'clube') return !choiceError;
    if (step === 'perfil') {
      if (precisaGenero && draft.gender !== 'F' && draft.gender !== 'M') return false;
      if (precisaNascimento && !draft.birthDate) return false;
      return true;
    }
    return true;
  })();

  const voltar = () => { setErro(null); if (stepIndex === 0) onClose?.(); else setStepIndex((i) => i - 1); };
  const avancar = async () => {
    setErro(null);
    if (!canContinue) return;
    if (step === 'perfil') {
      const patch = {};
      if (precisaGenero) patch.gender = draft.gender;
      if (precisaNascimento) patch.birth_date = draft.birthDate;
      const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id);
      if (error) { setErro('Não foi possível gravar o género/nascimento. Tenta outra vez.'); return; }
      setProfile({ ...profile, ...patch });
    }
    setStepIndex((i) => i + 1);
  };

  const submeter = async () => {
    setErro(null);
    setASubmeter(true);
    const data = {
      season_goal: draft.seasonGoal,
      is_federated: draft.federado === true,
      bib: draft.bibDesconhecido ? null : (draft.bib.trim() || null),
      ...(draft.outroClube ? { team_other: draft.teamOther.trim() } : { team_id: draft.teamId }),
      ...(entryMode === 'por_jornada' ? { entry_by: draft.entryBy } : null),
      ...(semCalendario ? { notify_calendar: true } : null),
    };
    const res = await enrollCup(edition.id, data);
    setASubmeter(false);
    if (!res.ok) { setErro(res.error?.message || 'Não foi possível inscrever-te. Tenta outra vez.'); return; }
    onEnrolled?.(res.data);
  };

  if (!edition) return null;

  const kindInfo = kind ? KIND_TEXT[kind] : null;
  const nome = edition.competition?.short_name || edition.competition?.name || 'o Troféu';

  const conteudo = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Inscrição em ${nome}`}
      data-testid="cup-enrollment-screen"
      className="fixed inset-0 z-[80] flex flex-col fade-in"
      style={{ background: 'var(--bg-app)' }}
    >
      <div className="flex items-center gap-2.5 shrink-0" style={{ minHeight: 52, padding: '8px 14px', borderBottom: '1px solid var(--border-glass)' }}>
        <button
          type="button"
          onClick={voltar}
          aria-label="Voltar"
          data-testid="cup-enrollment-voltar"
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 44, height: 44, background: 'none', border: 'none', color: 'var(--text-3)' }}
        >
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--race)' }}>
            Passo {stepIndex + 1} de {steps.length}
          </div>
          <div className="text-[14.5px] font-extrabold truncate" style={{ color: 'var(--text-1)' }}>Inscrição em {nome}</div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-2 [&>*]:shrink-0" style={{ padding: '12px 18px calc(96px + env(safe-area-inset-bottom, 0px))' }}>
        {step === 'edicao' && (
          <GlassCard tone="race" radius={24} padding={16} data-testid="cup-enrollment-edicao">
            <h2 className="m-0 text-[16px] font-black" style={{ color: 'var(--text-1)' }}>{nome}</h2>
            <p className="m-0 text-[12.5px] mt-1.5" style={{ color: 'var(--text-3)', lineHeight: 'var(--leading-normal)' }}>
              Inscreves-te uma vez por época. O que a inscrição dá depende do clube que escolheres a seguir — clubes e
              atletas individuais elegíveis contam para o prémio; o resto entra só para participar.
            </p>
            {semCalendario && (
              <p className="m-0 text-[11.5px] mt-2" style={{ color: 'var(--text-4)' }}>
                O calendário ainda não saiu. Podes inscrever-te já e avisamos-te quando sair.
              </p>
            )}
          </GlassCard>
        )}

        {step === 'federado' && (
          <>
            <SectionLabel style={{ margin: '2px 2px 0' }}>És federado?</SectionLabel>
            <div className="flex flex-col gap-2 mt-1">
              <Opcao id="cup-federado-sim" name="federado" testId="cup-federado-sim" titulo="Sim" checked={draft.federado === true} onChange={() => set('federado', true)} />
              <Opcao id="cup-federado-nao" name="federado" testId="cup-federado-nao" titulo="Não" checked={draft.federado === false} onChange={() => set('federado', false)} />
            </div>
          </>
        )}

        {step === 'clube' && (
          <>
            <SectionLabel style={{ margin: '2px 2px 0' }}>O teu clube</SectionLabel>
            <div className="flex flex-col gap-2 mt-1">
              {teams
                .filter((t) => !(draft.federado === true && t.kind === 'individual'))
                .map((t) => (
                  <Opcao
                    key={t.id}
                    id={`cup-clube-${t.id}`}
                    name="clube"
                    testId={`cup-clube-${t.id}`}
                    titulo={t.short_name || t.name}
                    checked={!draft.outroClube && draft.teamId === t.id}
                    onChange={() => setDraft((d) => ({ ...d, teamId: t.id, outroClube: false }))}
                  />
                ))}
              {/* Também para federados (§4.2.2: "clube da lista ou 'não está
                  na lista', nunca Individual"). A lista do seed tem só os
                  clubes conhecidos; escondê-la a um federado de outro clube
                  empurrava-o para um clube errado — que estragava o tipo de
                  inscrição e, na Fase 4, a correspondência por clube. */}
              <Opcao
                id="cup-clube-outro"
                name="clube"
                testId="cup-clube-outro"
                titulo="O meu clube não está na lista"
                checked={draft.outroClube}
                onChange={() => setDraft((d) => ({ ...d, teamId: null, outroClube: true }))}
              />
            </div>
            {draft.outroClube && (
              <Input
                data-testid="cup-clube-outro-nome"
                aria-label="Nome do teu clube"
                placeholder="Nome do teu clube"
                className="mt-2"
                value={draft.teamOther}
                onChange={(e) => set('teamOther', e.target.value)}
              />
            )}
            {choiceError && (
              <Warning tone="warn" title="Falta escolher" className="mt-2">{CHOICE_ERROR_TEXT[choiceError]}</Warning>
            )}
            {!choiceError && kindInfo && (
              <Warning tone={kindInfo.tone} title="O que isto dá" className="mt-2" data-testid="cup-clube-kind">{kindInfo.text}</Warning>
            )}
          </>
        )}

        {step === 'objetivo' && (
          <>
            <SectionLabel style={{ margin: '2px 2px 0' }}>O teu objetivo na época</SectionLabel>
            <div className="flex flex-col gap-2 mt-1">
              {SEASON_GOALS.map((g) => (
                <Opcao
                  key={g.value}
                  id={`cup-objetivo-${g.value}`}
                  name="objetivo"
                  testId={`cup-objetivo-${g.value}`}
                  titulo={g.label}
                  descricao={g.desc}
                  checked={draft.seasonGoal === g.value}
                  onChange={() => set('seasonGoal', g.value)}
                />
              ))}
            </div>
          </>
        )}

        {step === 'dorsal' && (
          <>
            <SectionLabel style={{ margin: '2px 2px 0' }}>O teu dorsal</SectionLabel>
            <p className="text-[11.5px] mt-1 mb-2" style={{ color: 'var(--text-4)' }}>Opcional — dá para dizer mais tarde.</p>
            <Input
              data-testid="cup-dorsal-input"
              aria-label="Número de dorsal"
              placeholder="Número do dorsal"
              inputMode="numeric"
              disabled={draft.bibDesconhecido}
              value={draft.bib}
              onChange={(e) => set('bib', e.target.value)}
            />
            <label htmlFor="cup-dorsal-desconhecido" data-testid="cup-dorsal-desconhecido" className="flex items-center gap-2.5 mt-2" style={{ ...CARD, padding: 12, minHeight: 44 }}>
              <input
                id="cup-dorsal-desconhecido"
                type="checkbox"
                checked={draft.bibDesconhecido}
                onChange={(e) => setDraft((d) => ({ ...d, bibDesconhecido: e.target.checked, bib: e.target.checked ? '' : d.bib }))}
                style={{ width: 20, height: 20, accentColor: 'var(--race)' }}
              />
              <span className="text-[12.5px] font-bold" style={{ color: 'var(--text-2)' }}>Ainda não sei</span>
            </label>
          </>
        )}

        {step === 'perfil' && (
          <>
            <SectionLabel style={{ margin: '2px 2px 0' }}>Género e nascimento</SectionLabel>
            <p className="text-[11.5px] mt-1 mb-2" style={{ color: 'var(--text-4)', lineHeight: 'var(--leading-normal)' }}>
              Sem isto não é possível inscrever-te — é o que dá o teu escalão em cada jornada. Nunca se assume o
              género (fica gravado no Perfil, não só aqui).
            </p>
            {precisaGenero && (
              <div className="flex flex-col gap-2">
                <Opcao id="cup-genero-f" name="genero" testId="cup-genero-f" titulo="Feminino" checked={draft.gender === 'F'} onChange={() => set('gender', 'F')} />
                <Opcao id="cup-genero-m" name="genero" testId="cup-genero-m" titulo="Masculino" checked={draft.gender === 'M'} onChange={() => set('gender', 'M')} />
              </div>
            )}
            {precisaNascimento && (
              <div className="mt-2">
                <label htmlFor="cup-nascimento" className="text-[11px] font-bold block mb-1" style={{ color: 'var(--text-3)' }}>Data de nascimento</label>
                <Input id="cup-nascimento" data-testid="cup-nascimento" type="date" max={todayISO()} value={draft.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
              </div>
            )}
          </>
        )}

        {step === 'quem_inscreve' && (
          <>
            <SectionLabel style={{ margin: '2px 2px 0' }}>Quem te inscreve em cada prova?</SectionLabel>
            <div className="flex flex-col gap-2 mt-1">
              <Opcao id="cup-entrada-eu" name="entrada" testId="cup-entrada-eu" titulo="Eu próprio" checked={draft.entryBy === 'atleta'} onChange={() => set('entryBy', 'atleta')} />
              <Opcao id="cup-entrada-clube" name="entrada" testId="cup-entrada-clube" titulo="O meu clube" checked={draft.entryBy === 'clube'} onChange={() => set('entryBy', 'clube')} />
              <Opcao id="cup-entrada-nao-sei" name="entrada" testId="cup-entrada-nao-sei" titulo="Não sei" checked={draft.entryBy == null} onChange={() => set('entryBy', null)} />
            </div>
          </>
        )}

        {step === 'privacidade' && (
          <>
            <GlassCard tone="race" radius={24} padding={16}>
              <h2 className="m-0 text-[15px] font-black" style={{ color: 'var(--text-1)' }}>Quase pronto</h2>
              <p className="m-0 text-[12.5px] mt-1.5" style={{ color: 'var(--text-3)', lineHeight: 'var(--leading-normal)' }}>
                Confirma que está tudo certo e {semCalendario ? 'pede para te avisarmos quando o calendário sair' : 'inscreve-te'}.
              </p>
            </GlassCard>
            {/* §4.2.8: dizer também o que o administrador consegue INFERIR.
                race_events tem "admin read all" e cada "Vou" confirmado passa
                a ser uma prova — por aí vê-se quem corre o Troféu e em que
                jornadas (revisão da Fase 1, 2026-09-26: o texto anterior
                dizia que nada mudava, e não era verdade). */}
            <Warning tone="warn" title="O que a app guarda e quem vê" data-testid="cup-privacidade">
              Nenhum ecrã novo mostra a tua inscrição — clube, dorsal, decisões — a outros atletas nem ao
              organizador. Mas cada jornada em que dizes «Vou» passa a ser uma prova no teu calendário, e o
              administrador da app, que já vê as provas de todos, consegue por aí saber que corres o Troféu e em
              que jornadas vais. Se escreveres um clube que não está na lista, vê esse nome, sem saber quem o
              escreveu. O teu perfil, os registos da app e os teus consentimentos de privacidade já eram visíveis
              para ele antes — isso não muda.
            </Warning>
          </>
        )}

        {erro && <Warning tone="danger" title="Não foi possível continuar">{erro}</Warning>}
      </div>

      <div className="shrink-0 flex gap-2" style={{ padding: '10px 18px calc(14px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--border-glass)', background: 'var(--bg-app)' }}>
        {isLast ? (
          <Button
            variant="module"
            moduleColor="var(--race)"
            className="w-full"
            data-testid="cup-enrollment-submeter"
            isLoading={aSubmeter}
            onClick={submeter}
          >
            {semCalendario ? 'Avisa-me quando sair' : 'Inscrever-me'}
          </Button>
        ) : (
          <Button
            variant="module"
            moduleColor="var(--race)"
            className="w-full"
            data-testid="cup-enrollment-continuar"
            disabled={!canContinue}
            onClick={avancar}
          >
            Continuar
          </Button>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(conteudo, document.body) : conteudo;
}
