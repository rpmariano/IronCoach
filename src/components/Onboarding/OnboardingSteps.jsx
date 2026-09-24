import React, { useEffect, useRef, useState } from 'react';
import { Eye, PenLine, Clock, Trophy, TrendingUp, Heart, RotateCcw, Check, House, Lightbulb } from 'lucide-react';
import CarolIcon from '../Coach/CarolIcon';
import CoachAvatar from '../Coach/CoachAvatar';
import { DIETARY_RESTRICTIONS, toggleRestriction, normalizeRestrictions } from '../../utils/diet';
import { prefersReducedMotion, typingDelayFor } from '../../utils/coachBubbles';
import { firstName, reactToGoal, reactToRunning, reactToFood } from './carolReactions';
import { todayISO } from '../../lib/utils';

/* Os sete ecrãs do arranque (6 passos + fecho), recriados a partir da secção
   "Onboarding · o arranque" de specs/design-handoff-2026-09/design/
   "IronCoach - App.dc.html" (e do passo 3, que vive em "Estados em falta"
   como "Onboarding 3"). Os textos são os do mock, tal e qual.

   Aqui só vive o CORPO de cada passo — o cabeçalho (Voltar + barra de
   progresso), a barra de ação e toda a persistência estão em Onboarding.jsx.
   Estes componentes não sabem gravar nada: recebem `draft` e `set`. */

/* ── primitivas ──────────────────────────────────────────────────────────── */

/* Cabeçalho da Carol de cada passo: o rosto + "CAROL" (CAROL.md §4 — ela
   aparece no cabeçalho de cada passo do onboarding), o título e a explicação
   do porquê da pergunta. */
export function CarolHead({ title, children, mood = 'neutral' }) {
  return (
    <>
      <div className="shrink-0 flex items-center gap-2.5">
        <CoachAvatar size={30} mood={mood} />
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--coach-soft)' }}>
          Carol
        </span>
      </div>
      <h2 className="shrink-0" style={{ margin: '16px 0 0', fontSize: 25, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-.025em', lineHeight: 1.18 }}>
        {title}
      </h2>
      <p className="shrink-0" style={{ margin: '11px 0 0', fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-3)' }}>
        {children}
      </p>
    </>
  );
}

/* A nota da Carol no fim do passo — barra ciano à esquerda, texto em
   --coach-soft. Um por passo, como o mock. */
export function CarolNote({ children, style, reacting = false }) {
  return (
    <div
      data-testid="carol-note"
      data-reacting={reacting ? 'true' : undefined}
      className="shrink-0"
      style={{ marginTop: 20, borderLeft: '3px solid var(--coach)', padding: '2px 0 2px 14px', ...style }}
    >
      {/* Quando responde ao atleta, a nota ganha o texto mais claro: deixou
          de ser a explicação do passo e passou a ser ela a falar com ele. */}
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: reacting ? 'var(--text-2)' : 'var(--coach-soft)' }}>{children}</p>
    </div>
  );
}

function FieldLabel({ children }) {
  return <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-4)', marginBottom: 7 }}>{children}</div>;
}

/* Campo real — <input>/<select>/<textarea>, nunca uma <div> a fazer de campo
   (auditoria UX/UI, achado 11). 48px de caixa, foco no anel global
   (--focus-ring, posto a ciano na raiz do onboarding). */
export function Field({ label, as = 'input', suffix, style, ...rest }) {
  const El = as;
  const multiline = as === 'textarea';
  const preenchido = rest.value !== '' && rest.value != null;
  return (
    <label style={{ display: 'block', ...style }}>
      {label && <FieldLabel>{label}</FieldLabel>}
      <div className="relative">
        <El
          {...rest}
          rows={multiline ? 3 : undefined}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            minHeight: multiline ? 76 : 48,
            padding: multiline ? '13px 14px' : `0 ${suffix ? 42 : 14}px 0 14px`,
            borderRadius: 'var(--radius-md)',
            background: 'rgba(255,255,255,.05)',
            border: preenchido ? '1px solid rgba(255,255,255,.13)' : '1px dashed rgba(255,255,255,.16)',
            outline: 'none',
            fontFamily: 'inherit',
            fontSize: 14,
            fontWeight: preenchido ? 700 : 500,
            color: 'var(--text-1)',
            lineHeight: multiline ? 1.5 : undefined,
            resize: 'none',
            colorScheme: 'dark',
          }}
        />
        {suffix && (
          <span aria-hidden="true" className="absolute pointer-events-none" style={{ right: 14, top: 0, height: 48, display: 'flex', alignItems: 'center', fontSize: 13, color: 'var(--text-4)' }}>
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

/* Cartão-opção de escolha única (passos 3 e 4). É um <button> com
   aria-pressed — não uma <div> — para o teclado e o leitor de ecrã o
   tratarem como o controlo que é. 44px de toque garantidos pelo padding. */
export function OptionCard({ icon, title, description, selected, tone = 'coach', onClick }) {
  const cor = `var(--${tone})`;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 transition active:scale-[.98]"
      style={{
        minHeight: 'var(--tap)',
        borderRadius: 'var(--radius-lg)',
        background: selected ? `color-mix(in srgb, ${cor} 10%, transparent)` : 'rgba(255,255,255,.04)',
        border: selected ? `1.5px solid ${cor}` : '1px solid var(--border-glass-strong)',
        padding: icon ? 16 : '13px 15px',
      }}
    >
      {icon && (
        <span
          className="shrink-0 flex items-center justify-center"
          style={{ width: 42, height: 42, borderRadius: 13, background: selected ? `color-mix(in srgb, ${cor} 18%, transparent)` : 'rgba(255,255,255,.06)', color: selected ? cor : 'var(--gym)' }}
        >
          {icon}
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className="block" style={{ fontSize: icon ? 14.5 : 13.5, fontWeight: 800, color: selected ? 'var(--text-1)' : 'var(--text-2)' }}>{title}</span>
        <span className="block" style={{ fontSize: 12, color: selected ? 'var(--text-3)' : 'var(--text-4)', marginTop: icon ? 3 : 2 }}>{description}</span>
      </span>
      {selected && (
        <span className="shrink-0 flex items-center justify-center" style={{ width: 22, height: 22, borderRadius: '50%', background: cor, color: `var(--${tone}-ink)` }}>
          <Check size={13} />
        </span>
      )}
    </button>
  );
}

/* A nota que responde. Enquanto não há resposta, mostra a nota do passo
   (`children`); quando o atleta escolhe ou escreve, a Carol "lê" — os três
   pontos do "a escrever…" do chat, 600 a 900 ms (CAROL.md §5) — e responde
   com o que acha dessa resposta (carolReactions.js). O compasso também serve
   de travão: a escrever um número, ela só fala quando o atleta pára.
   prefers-reduced-motion: responde de imediato, sem os pontos.
   Quem usa leitor de ecrã ouve-a responder: a região só é aria-live quando
   o que lá está é a resposta dela — o "a escrever…" e a nota do passo (que
   no passo 6 muda a cada tecla) não são anunciados. */
export function CarolReply({ reaction, children, style }) {
  const text = reaction?.text || null;
  const [shown, setShown] = useState(text);
  const [typing, setTyping] = useState(false);
  const primeira = useRef(true);

  useEffect(() => {
    // Ao montar (reentrada com respostas já dadas) responde logo — ela não
    // está a ler nada de novo.
    if (primeira.current) { primeira.current = false; return undefined; }
    if (!text || prefersReducedMotion()) { setTyping(false); setShown(text); return undefined; }
    setTyping(true);
    const t = setTimeout(() => { setTyping(false); setShown(text); }, typingDelayFor(text));
    return () => clearTimeout(t);
  }, [text]);

  let corpo = null;
  if (typing) {
    corpo = (
      <span aria-hidden="true" className="inline-flex items-center gap-2" style={{ minHeight: 19 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--coach-soft)' }}>a escrever…</span>
        <span className="inline-flex items-center gap-1" aria-hidden="true">
          <span className="coach-typing-dot" />
          <span className="coach-typing-dot" style={{ animationDelay: '150ms' }} />
          <span className="coach-typing-dot" style={{ animationDelay: '300ms' }} />
        </span>
      </span>
    );
  } else if (shown) {
    corpo = <span key={shown} className="fade-in" style={{ display: 'block' }}>{shown}</span>;
  } else if (children) {
    corpo = children;
  }

  return (
    <div aria-live={shown && !typing ? 'polite' : 'off'} className="shrink-0">
      {corpo && <CarolNote style={style} reacting={!!shown && !typing}>{corpo}</CarolNote>}
    </div>
  );
}

/* ── 1 · Quem é a Carol ──────────────────────────────────────────────────── */

const PROMESSAS = [
  { icon: <Eye size={17} />, title: 'Vejo tudo o que registas', text: 'Corridas, ginásio, refeições, peso. É com isso que percebo se estás no caminho certo.' },
  { icon: <PenLine size={17} />, title: 'Escrevo o plano, tu decides', text: 'Proponho a semana de treino e as refeições. Aceitas, recusas ou pedes outra coisa.' },
  { icon: <Clock size={17} />, title: 'Estou sempre a um toque', text: 'No separador Coach, a qualquer hora. Pergunta o que quiseres, mesmo a meio de uma corrida.' },
];

export function StepCarol() {
  return (
    <>
      <div className="shrink-0 flex justify-center">
        <CoachAvatar size={76} style={{ boxShadow: '0 0 0 10px rgba(34,211,238,.09), 0 12px 34px rgba(34,211,238,.28)' }} />
      </div>
      <h2 className="shrink-0" style={{ margin: '24px 0 0', fontSize: 28, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-.028em', lineHeight: 1.15, textAlign: 'center' }}>
        Olá. Sou a Carol,<br />a tua treinadora.
      </h2>
      <p className="shrink-0" style={{ margin: '14px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--text-3)', textAlign: 'center' }}>
        Acompanho-te do primeiro treino até à linha de meta. Escrevo o plano, ajusto-o quando a semana corre mal, e digo-te o que comer para o aguentar.
      </p>

      <div className="shrink-0 flex flex-col gap-3" style={{ marginTop: 26 }}>
        {PROMESSAS.map((p) => (
          <div key={p.title} className="flex items-start gap-3">
            <span className="shrink-0 flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 11, background: 'rgba(34,211,238,.14)', border: '1px solid var(--tint-coach-bd)', color: 'var(--coach)' }}>
              {p.icon}
            </span>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-1)' }}>{p.title}</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-4)', marginTop: 3 }}>{p.text}</div>
            </div>
          </div>
        ))}
      </div>

      <CarolNote style={{ marginTop: 24 }}>
        Para começar preciso de te conhecer. São seis perguntas, dois minutos. Explico sempre porque pergunto.
      </CarolNote>
    </>
  );
}

/* ── 2 · Quem és ─────────────────────────────────────────────────────────── */

export function StepQuemEs({ draft, set }) {
  return (
    <>
      <CarolHead title="Diz-me quem és.">
        A idade e a altura entram no cálculo das calorias e das zonas de treino. Sem isto, qualquer plano meu seria um palpite.
      </CarolHead>

      <div className="shrink-0 flex flex-col" style={{ gap: 14, marginTop: 24 }}>
        <Field
          label="Como te chamo?"
          type="text"
          autoComplete="given-name"
          value={draft.display_name}
          onChange={(e) => set('display_name', e.target.value)}
        />
        <div className="flex" style={{ gap: 10 }}>
          <Field
            label="Nascimento"
            type="date"
            style={{ flex: 1, minWidth: 0 }}
            value={draft.birth_date}
            onChange={(e) => set('birth_date', e.target.value)}
          />
          <Field
            label="Altura"
            type="number"
            inputMode="numeric"
            suffix="cm"
            style={{ width: 112, flexShrink: 0 }}
            value={draft.height_cm}
            onChange={(e) => set('height_cm', e.target.value)}
          />
        </div>
        <div className="flex" style={{ gap: 10 }}>
          <Field
            label="Peso atual"
            type="number"
            inputMode="decimal"
            step="0.1"
            suffix="kg"
            style={{ flex: 1, minWidth: 0 }}
            value={draft.weight_kg}
            onChange={(e) => set('weight_kg', e.target.value)}
          />
          {/* Sexo não está no mock do passo 2, mas as calorias que a nota da
              Carol aqui em cima promete (BMR/TDEE) não se calculam sem ele —
              e é o único campo do Perfil · Pessoal que faltaria a quem só
              passa pelo arranque. Fica no mesmo formato dos outros. */}
          <Field
            label="Sexo"
            as="select"
            style={{ flex: 1, minWidth: 0 }}
            value={draft.gender}
            onChange={(e) => set('gender', e.target.value)}
          >
            <option value="">—</option>
            <option value="F">Feminino</option>
            <option value="M">Masculino</option>
          </Field>
        </div>
      </div>

      <CarolNote>
        O peso volta a aparecer nas avaliações. Aqui é só o ponto de partida — não te preocupes em ser exato ao grama.
      </CarolNote>
    </>
  );
}

/* ── 3 · O objetivo ──────────────────────────────────────────────────────── */

/* O texto de cada opção é o que vai para a Memória do Coach (categoria
   objetivo_pessoal) — é literalmente o critério contra o qual a Carol
   avalia tudo o resto. */
export const OBJETIVOS = [
  { key: 'prova', tone: 'race', icon: <Trophy size={21} />, title: 'Preparar uma prova', description: 'Estrada ou trail, com data marcada' },
  { key: 'ritmo', tone: 'coach', icon: <TrendingUp size={21} />, title: 'Correr mais rápido', description: 'Sem prova, foco em ritmo' },
  { key: 'saude', tone: 'coach', icon: <Heart size={21} />, title: 'Manter-me saudável', description: 'Correr com regularidade, comer melhor' },
  { key: 'regresso', tone: 'coach', icon: <RotateCcw size={21} />, title: 'Voltar depois de uma pausa', description: 'Retomar sem me lesionar' },
];

export function StepObjetivo({ draft, set }) {
  const nome = firstName(draft.display_name);
  const reacao = reactToGoal(draft);
  return (
    <>
      <CarolHead title={nome ? `O que te traz aqui, ${nome}?` : 'O que te traz aqui?'} mood={reacao?.mood}>
        Escolhe um. É isto que define as fases do plano — podes mudar mais tarde.
      </CarolHead>

      <div className="shrink-0 flex flex-col" style={{ gap: 10, marginTop: 22 }}>
        {OBJETIVOS.map((o) => (
          <OptionCard
            key={o.key}
            icon={o.icon}
            tone={o.tone}
            title={o.title}
            description={o.description}
            selected={draft.goal === o.key}
            onClick={() => set('goal', draft.goal === o.key ? '' : o.key)}
          />
        ))}
      </div>

      {/* No mock este passo não tem nota: só aparece quando há uma escolha
          a que responder. */}
      <CarolReply reaction={reacao} />
    </>
  );
}

/* ── 4 · Como corres hoje ────────────────────────────────────────────────── */

/* As três opções do mock contra as quatro chaves de utils/experience.js. O
   "Básico" (6-18 meses) não é alcançável daqui de propósito: o mock oferece
   três degraus, não quatro, e a descrição de cada um bate certo com estes
   três níveis. Quem precisar do Básico afina-o em Perfil · Pessoal, onde a
   lista completa continua. */
export const TEMPO_A_CORRER = [
  { key: 'iniciante', title: 'Menos de um ano', description: 'Começo pela base, sem intensidade' },
  { key: 'medio', title: 'Um a três anos', description: 'Posso misturar séries e rodagens longas' },
  { key: 'avancado', title: 'Mais de três anos', description: 'Trabalho com blocos e cargas mais altas' },
];

export function StepComoCorres({ draft, set }) {
  const reacao = reactToRunning(draft);
  return (
    <>
      <CarolHead title="Onde estás agora?" mood={reacao?.mood}>
        Preciso do teu ponto de partida para não te dar volume a mais. É a causa número um de lesão em quem começa um plano.
      </CarolHead>

      <div className="shrink-0" style={{ marginTop: 22 }}>
        <FieldLabel>Há quanto tempo corres?</FieldLabel>
        <div className="flex flex-col" style={{ gap: 8 }}>
          {TEMPO_A_CORRER.map((n) => (
            <OptionCard
              key={n.key}
              tone="run"
              title={n.title}
              description={n.description}
              selected={draft.experience_level === n.key}
              onClick={() => set('experience_level', draft.experience_level === n.key ? '' : n.key)}
            />
          ))}
        </div>
      </div>

      <div className="shrink-0 flex" style={{ gap: 10, marginTop: 18 }}>
        <Field
          label="Km por semana"
          type="number"
          inputMode="numeric"
          style={{ flex: 1, minWidth: 0 }}
          value={draft.weekly_km}
          onChange={(e) => set('weekly_km', e.target.value)}
        />
        <Field
          label="Dias por semana"
          type="number"
          inputMode="numeric"
          min="0"
          max="7"
          style={{ flex: 1, minWidth: 0 }}
          value={draft.days_per_week}
          onChange={(e) => set('days_per_week', e.target.value)}
        />
      </div>

      <CarolReply reaction={reacao}>
        Não sabes ao certo? Diz por baixo. Corrijo assim que tiver três corridas registadas.
      </CarolReply>
    </>
  );
}

/* ── 5 · Como comes ──────────────────────────────────────────────────────── */

/* A ordem é a do mock (lactose, glúten, vegetariano, vegano) e não a de
   utils/diet.js. O quinto chip do mock — "Sem marisco" — não entra como
   chip: profiles.dietary_restrictions tem um check constraint fechado às
   quatro chaves acima (ver supabase_schema.sql), e uma alergia a marisco é
   exatamente o caso para que o campo de texto livre a seguir existe — o
   próprio placeholder do mock o diz. */
const CHIP_ORDER = ['sem_lactose', 'sem_gluten', 'vegetariano', 'vegano'];
const CHIPS = CHIP_ORDER.map((k) => DIETARY_RESTRICTIONS.find((r) => r.key === k)).filter(Boolean);

export function StepComoComes({ draft, set }) {
  const ativas = draft.dietary_restrictions || [];
  const reacao = reactToFood(draft);
  return (
    <>
      <CarolHead title={<>O que não posso<br />pôr no teu prato?</>} mood={reacao?.mood}>
        Trato isto como regra absoluta: nunca te vou sugerir nada que contrarie o que escreveres aqui.
      </CarolHead>

      <div className="shrink-0" style={{ marginTop: 22 }}>
        <FieldLabel>Toca no que se aplica</FieldLabel>
        <div className="flex flex-wrap" style={{ gap: 8 }}>
          {CHIPS.map((r) => {
            const on = ativas.includes(r.key);
            return (
              <button
                key={r.key}
                type="button"
                aria-pressed={on}
                onClick={() => set('dietary_restrictions', normalizeRestrictions(toggleRestriction(ativas, r.key)) || [])}
                className="inline-flex items-center transition active:scale-[.98]"
                style={{
                  minHeight: 'var(--tap)',
                  padding: '0 15px',
                  borderRadius: 'var(--radius-pill)',
                  fontSize: 13,
                  fontWeight: on ? 800 : 700,
                  color: on ? 'var(--nutrition)' : 'var(--text-3)',
                  background: on ? 'var(--tint-nutrition-bg)' : 'rgba(255,255,255,.05)',
                  border: on ? '1.5px solid var(--nutrition)' : '1px solid rgba(255,255,255,.13)',
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      <Field
        label="Mais alguma coisa? Alergias, o que detestas"
        as="textarea"
        placeholder="Ex.: frutos secos, não como peixe ao jantar"
        style={{ marginTop: 18, flexShrink: 0 }}
        value={draft.dietary_notes}
        onChange={(e) => set('dietary_notes', e.target.value)}
      />

      <CarolReply reaction={reacao}>
        Podes mudar isto a qualquer momento no Perfil. Da próxima refeição em diante, já conto com a alteração.
      </CarolReply>
    </>
  );
}

/* ── 6 · A tua prova ─────────────────────────────────────────────────────── */

export function StepProva({ draft, set, carolNote, reaction }) {
  return (
    <>
      <CarolHead title="Para que dia treinamos?" mood={reaction?.mood}>
        A data da prova define tudo: quantas semanas de base, quando entra a intensidade, quando alivio antes do dia.
      </CarolHead>

      <div className="shrink-0 flex flex-col" style={{ gap: 14, marginTop: 22 }}>
        <Field
          label="Nome da prova"
          type="text"
          value={draft.race_name}
          onChange={(e) => set('race_name', e.target.value)}
        />
        <div className="flex" style={{ gap: 10 }}>
          <Field
            label="Data"
            type="date"
            min={todayISO()}
            style={{ flex: 1, minWidth: 0 }}
            value={draft.race_date}
            onChange={(e) => set('race_date', e.target.value)}
          />
          <Field
            label="Distância"
            type="number"
            inputMode="decimal"
            step="0.1"
            suffix="km"
            style={{ flex: 1, minWidth: 0 }}
            value={draft.race_distance_km}
            onChange={(e) => set('race_distance_km', e.target.value)}
          />
        </div>
        {/* O local e o objetivo de tempo são obrigatórios para gravar uma
            prova (ver a validação em Run/RunAgenda.jsx). Sem eles, o arranque
            só conseguia entregar um rascunho e atirava o atleta para o ecrã
            de criar prova mal acabava de responder a seis ecrãs — foi o que
            o utilizador relatou. Perguntados aqui, a prova nasce gravada. */}
        <Field
          label="Local"
          type="text"
          placeholder="Ex.: Lisboa"
          value={draft.race_location}
          onChange={(e) => set('race_location', e.target.value)}
        />
        <Field
          label="Objetivo de tempo"
          type="text"
          inputMode="numeric"
          placeholder="Ex.: 1:45:00"
          value={draft.race_target_time}
          onChange={(e) => set('race_target_time', e.target.value)}
        />
        <div>
          <FieldLabel>Terreno</FieldLabel>
          <div className="flex" style={{ gap: 8 }}>
            {[{ key: 'estrada', label: 'Estrada' }, { key: 'trail', label: 'Trail' }].map((t) => {
              const on = draft.race_type === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set('race_type', t.key)}
                  className="inline-flex items-center transition active:scale-[.98]"
                  style={{
                    minHeight: 'var(--tap)',
                    padding: '0 18px',
                    borderRadius: 'var(--radius-pill)',
                    fontSize: 13,
                    fontWeight: on ? 800 : 700,
                    color: on ? 'var(--race-ink)' : 'var(--text-3)',
                    background: on ? 'var(--grad-race)' : 'rgba(255,255,255,.05)',
                    border: on ? 'none' : '1px solid rgba(255,255,255,.13)',
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* O D+ só é obrigatório no trail — e só aí é que aparece. */}
        {draft.race_type === 'trail' && (
          <Field
            label="Desnível acumulado (D+)"
            type="number"
            inputMode="numeric"
            step="1"
            suffix="m"
            value={draft.race_elevation_gain_m}
            onChange={(e) => set('race_elevation_gain_m', e.target.value)}
          />
        )}
      </div>

      <CarolReply reaction={reaction}>{carolNote}</CarolReply>
    </>
  );
}

/* ── Fecho ───────────────────────────────────────────────────────────────── */

const ONDE_ME_ENCONTRAS = [
  { icon: <CarolIcon size={18} />, title: 'Separador Carol', text: 'Para falar comigo sobre o que quiseres', destaque: true },
  { icon: <House size={18} />, title: 'No topo do Início', text: 'Deixo lá um recado sempre que há algo a corrigir' },
  { icon: <Lightbulb size={18} />, title: 'Dentro de cada registo', text: 'Comento o que registas, sem teres de perguntar' },
];

/* As semanas até à prova, uma a uma. O plano da Carol conta-se para trás a
   partir da data ("quantas semanas de base, quando entra a intensidade,
   quando alivio" — passo 6); aqui o atleta vê pela primeira vez esse
   horizonte inteiro. Cada traço é uma semana; o último, mais alto e na cor
   da prova, é a semana dela. Os traços nascem um a um, em menos de um
   segundo no total, e o da prova chega por último com o impulso da
   confirmação de registo. Acima de 60 semanas não se desenha — a prova está
   longe demais para o desenho dizer alguma coisa. */
const MAX_SEMANAS_DESENHADAS = 60;

export function RaceWeeks({ semanas, raceName }) {
  if (!Number.isFinite(semanas) || semanas < 1 || semanas > MAX_SEMANAS_DESENHADAS) return null;
  const calmo = prefersReducedMotion();
  const passo = calmo ? 0 : Math.min(26, 760 / semanas);
  return (
    <div
      data-testid="onboarding-semanas"
      role="img"
      aria-label={`${semanas} ${semanas === 1 ? 'semana' : 'semanas'} até ${raceName}`}
      className="shrink-0 flex flex-wrap justify-center items-end"
      style={{ gap: '10px 4px', marginTop: 22, padding: '0 6px' }}
    >
      {Array.from({ length: semanas }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="onb-week"
          style={{ width: 5, height: 20, borderRadius: 3, background: 'color-mix(in srgb, var(--coach) 55%, transparent)', animationDelay: `${Math.round(i * passo)}ms` }}
        />
      ))}
      <span
        aria-hidden="true"
        className="onb-week-race flex items-center justify-center"
        style={{ width: 26, height: 30, marginLeft: 3, borderRadius: 8, background: 'var(--grad-race)', color: 'var(--race-ink)', boxShadow: '0 6px 16px rgba(251,191,36,.28)', animationDelay: `${Math.round(semanas * passo)}ms` }}
      >
        <Trophy size={14} strokeWidth={2.4} />
      </span>
    </div>
  );
}

export function StepFecho({ titulo, resumo, semanas, raceName }) {
  return (
    <>
      {/* Quem fecha o arranque é ela, contente (CAROL.md §4), com o visto de
          "feito" ao canto — em vez de um visto sozinho, sem ninguém. */}
      <div className="shrink-0 flex justify-center">
        <span className="relative inline-flex">
          <CoachAvatar size={64} mood="happy" style={{ boxShadow: '0 0 0 9px rgba(34,211,238,.08), 0 12px 30px rgba(34,211,238,.24)' }} />
          <span
            aria-hidden="true"
            className="absolute flex items-center justify-center onb-done-badge"
            style={{ right: -4, bottom: -4, width: 24, height: 24, borderRadius: '50%', background: 'var(--ok)', color: 'var(--bg-app)', border: '2.5px solid var(--bg-app)' }}
          >
            <Check size={13} strokeWidth={3} />
          </span>
        </span>
      </div>
      <h2 className="shrink-0" style={{ margin: '20px 0 0', fontSize: 26, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-.025em', lineHeight: 1.16, textAlign: 'center', textWrap: 'balance' }}>
        {titulo}
      </h2>

      {raceName && <RaceWeeks semanas={semanas} raceName={raceName} />}

      {/* Resumo do que ficou respondido. O mock tem aqui uma frase sobre o
          plano da primeira semana; o plano é gerado pela Carol, não por este
          ecrã, por isso o que se mostra é o que o arranque de facto guardou —
          não uma promessa que ninguém cumpriu ainda. */}
      <div className="shrink-0" style={{ marginTop: 26, fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-4)' }}>
        O que ficou registado
      </div>
      <ul data-testid="onboarding-resumo" className="shrink-0" style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', borderRadius: 'var(--radius-xl)', background: 'var(--surface-glass)', border: '1px solid var(--border-glass)' }}>
        {resumo.map((linha, i) => (
          <li key={linha.label} className="flex items-center justify-between gap-3" style={{ padding: '12px 16px', borderBottom: i < resumo.length - 1 ? '1px solid var(--border-hairline)' : 'none' }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{linha.label}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', textAlign: 'right' }}>{linha.value}</span>
          </li>
        ))}
      </ul>

      <div className="shrink-0" style={{ marginTop: 22, fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-4)' }}>
        Onde me encontras
      </div>
      <div className="shrink-0 flex flex-col" style={{ gap: 10, marginTop: 12 }}>
        {ONDE_ME_ENCONTRAS.map((o) => (
          <div
            key={o.title}
            className="flex items-center gap-3"
            style={{
              padding: '14px 15px',
              borderRadius: 16,
              background: o.destaque ? 'var(--tint-coach-bg)' : 'rgba(255,255,255,.04)',
              border: o.destaque ? '1px solid var(--tint-coach-bd)' : '1px solid var(--border-glass)',
            }}
          >
            <span className="shrink-0 flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 11, background: o.destaque ? 'rgba(34,211,238,.16)' : 'rgba(255,255,255,.06)', color: o.destaque ? 'var(--coach)' : 'var(--gym)' }}>
              {o.icon}
            </span>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 13.5, fontWeight: 800, color: o.destaque ? 'var(--coach-soft)' : 'var(--text-2)' }}>{o.title}</div>
              <div style={{ fontSize: 12, color: o.destaque ? 'var(--text-3)' : 'var(--text-4)', marginTop: 2 }}>{o.text}</div>
            </div>
          </div>
        ))}
      </div>

      <CarolNote style={{ marginTop: 22 }}>
        Podes rever ou mudar tudo isto em Perfil · Coach, quando quiseres.
      </CarolNote>
    </>
  );
}
