import React from 'react';
import { X } from 'lucide-react';
import UnsavedChangesModal from '../UnsavedChangesModal';
import RecordConfirmation from '../RecordConfirmation';
import ActionBar, { ACTION_BAR_SCROLL_PAD } from '../ActionBar';

/* A moldura comum dos registos (registo unificado, specs/plano-registo-plano-coach.md
   §1, decisão 12 — feita com o Corpo, o registo mais pequeno, antes da
   Corrida). O que é igual em todos fica aqui; o que é de cada módulo
   (campos, leitura de prints, gravação) fica em quem a usa:

   · o cartão em vidro com a lavagem na cor do módulo (`accent`);
   · o cabeçalho — ícone, título, fechar (com o aviso se houver alterações);
   · `status`: a espera e a falha da análise, acima do formulário;
   · `busy`: o formulário bloqueado enquanto a Carol trabalha;
   · o aviso de saída, a confirmação do registo e a ActionBar fixa.

   O estado da saída vem de useRegistrationExit (passado em `exit`).
   `bare`: só a moldura, sem o cartão — o modo prova da Corrida tem o seu
   próprio desenho (cartões por secção) e traz cabeçalho e estado da análise.
   `overlays`: o que mais flutua por cima do registo (o aviso das métricas em
   falta da Corrida, o diálogo dos dados incompletos). */
export default function RegistrationShell({
  accent, icon: Icon, title, exit, status = null, busy = false,
  onSaveAndLeave, isSaving = false, confirmation = null, primaryAction, children,
  // A Refeição: o cartão recorta o que sobe com o teclado, a barra sai com ele,
  // e os testes procuram o bloco dos campos pelo id.
  cardClassName = '', actionBarClassName = '', bodyTestId = undefined,
  bare = false, overlays = null, containerClassName = 'space-y-4 fade-in',
}) {
  return (
    // --focus-ring: anel de teclado na cor do módulo (handoff, "Fidelity").
    // `.reg-form`: os campos viram poços e as etiquetas sobem (globals.css).
    <div className={`reg-form ${containerClassName}`.trim()} style={{ '--focus-ring': accent, paddingBottom: ACTION_BAR_SCROLL_PAD }}>
      {bare ? children : (
      // Sem cartão à volta (solução B): os blocos (RegistrationSection) são os
      // cartões, e um cartão dentro de outro voltava a fundir as zonas.
      <div className={cardClassName || undefined}>
        <div className="flex items-center justify-between gap-2 mb-3 px-1">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <span
                className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"
                style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)` }}
              >
                <Icon className="w-5 h-5" style={{ color: accent }} aria-hidden="true" />
              </span>
            )}
            <h2 className="text-lg font-bold text-[var(--text-1)] truncate">{title}</h2>
          </div>
          <button
            onClick={exit.requestClose}
            type="button"
            // O círculo desenha-se com 36px; a área tocável à volta tem 44 (--tap).
            className="tap-44 shrink-0"
            title="Fechar"
            aria-label="Fechar"
          >
            <span className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--surface-card)] border border-[var(--border-card)] text-[var(--text-2)] hover:bg-[var(--surface-chip)] transition-colors">
              <X size={16} />
            </span>
          </button>
        </div>

        {status}

        <div data-testid={bodyTestId} className="flex flex-col gap-3" aria-busy={busy || undefined} style={busy ? { opacity: 0.45, pointerEvents: 'none' } : undefined}>
          {children}
        </div>
      </div>
      )}

      <UnsavedChangesModal
        isOpen={exit.showUnsaved}
        isSaving={isSaving}
        onSaveAndLeave={onSaveAndLeave}
        onDiscardAndLeave={exit.close}
        onCancel={exit.cancelLeave}
      />

      {confirmation && <RecordConfirmation label={confirmation.label} tone={confirmation.tone} achievement={confirmation.achievement} first={confirmation.first} onDone={confirmation.done} />}

      <ActionBar className={actionBarClassName || undefined}>{primaryAction}</ActionBar>

      {overlays}
    </div>
  );
}
