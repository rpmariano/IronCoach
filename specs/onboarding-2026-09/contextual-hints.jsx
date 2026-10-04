/*
 * Dicas contextuais: pequenas, uma vez, dispensáveis.
 *
 * NÃO há tour guiado (tour-steps) neste pacote, de propósito: o arranque de
 * 6 passos com a Carol + o FirstDayCard + a lista "O que falta para começar"
 * já fazem o papel de um tour, e um react-joyride por cima seria uma
 * dependência nova para repetir o que a Carol diz. As dicas abaixo cobrem
 * o que o arranque não cobre.
 */
import React, { useState } from 'react';
import { X } from 'lucide-react';

/** Mostrada uma vez por utilizador; "×" guarda a dispensa. */
export function ContextualHint({ id, userId, children }) {
  const key = `ironcoach_hint_${id}_${userId}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
  });
  if (dismissed) return null;
  const close = () => {
    try { localStorage.setItem(key, '1'); } catch { /* modo privado */ }
    setDismissed(true);
  };
  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-xl px-3 py-2 mb-3 text-[11.5px] leading-relaxed"
      style={{ background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)', color: 'var(--text-2)' }}
    >
      <span className="flex-1">{children}</span>
      <button type="button" onClick={close} aria-label="Fechar dica" className="tap-area-44 shrink-0 text-[var(--text-3)]">
        <X size={13} />
      </button>
    </div>
  );
}

// ─── 1. Legenda do RPE no registo de corrida ──────────────────────────────
// Run/RunRegistration.jsx:2054. O ginásio já tem legenda
// (GymRegistration.jsx:1010); a corrida não. Não é dica, é texto fixo,
// igual ao do ginásio:
/*
  <label className="text-[11px] text-[var(--text-3)] mb-1.5 flex items-center">
    Quão duro foi? (RPE, opcional)
    <MetricInfo text={GLOSSARY.rpe} />
  </label>
  …botões 1-10…
  <p className="text-[11px] text-[var(--text-3)] mt-1.5">1 = Muito leve · 10 = Máximo</p>
*/

// ─── 2. Onboarding › "como corres": ajuda do nível ────────────────────────
// Onboarding/OnboardingSteps.jsx:359-361. O shared/ExperienceLevelHelp.jsx
// já existe e é usado no Perfil e no RunAgenda; falta aqui, que é onde a
// pessoa escolhe o nível pela primeira vez. Pôr por baixo das opções:
/*
  <ExperienceLevelHelp />
*/

// ─── 3. Calculadora de ritmo ──────────────────────────────────────────────
// O ícone no cabeçalho não tem rótulo visível, e quem a usaria mais
// (quem acabou de marcar uma prova) não sabe que existe. Dica no hub da
// prova, a primeira vez que se abre uma prova com objetivo de tempo:
/*
  <ContextualHint id="calculadora-ritmo" userId={profile.id}>
    Queres saber a que ritmo tens de ir para fazer {objetivo}? A calculadora está no ícone da calculadora, lá em cima.
  </ContextualHint>
*/

// ─── 4. Registo por fotografia ────────────────────────────────────────────
// Na primeira vez que se abre "Registar refeição" (e "Nova avaliação"),
// se o formulário aceitar imagem:
/*
  <ContextualHint id="refeicao-foto" userId={profile.id}>
    Não precisas de escrever tudo: tira uma foto ao prato e eu estimo as calorias e as proteínas.
  </ContextualHint>
*/
// Confirmar no MealRegistration que a foto está disponível para todos
// antes de prometer isto na dica.

// ─── 5. Botões flutuantes ─────────────────────────────────────────────────
// No Início a 375px há três elementos flutuantes (reportar problema, avisos
// da Carol com contador, e o + central) por cima do conteúdo: o cartão de
// nutrição e o botão "Guardar alterações" do Perfil ficam tapados. Não é
// uma dica: é um ajuste de layout. Proposta: o botão de reportar problema
// passa para Perfil › (fundo) e para o menu do logótipo, e deixa de flutuar
// para quem não é admin.
