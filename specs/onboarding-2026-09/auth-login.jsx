/*
 * Login: o que falta para quem ainda não conhece a app.
 * Integrar em src/components/Auth/Auth.jsx (e o bloco 4 em App.jsx).
 *
 * Auditoria 2026-09-27 (specs/onboarding-2026-09/audit.md):
 *   - o ecrã não diz o que a app é nem para quem;
 *   - não há "Esqueci-me da palavra-passe" (resetPasswordForEmail não é
 *     usado em lado nenhum) e a app também não trata o evento
 *     PASSWORD_RECOVERY, por isso o link do email não levaria a sítio nenhum;
 *   - criar conta não diz as regras da palavra-passe.
 */

// ─── 1. A frase por baixo do logótipo ─────────────────────────────────────
// Substitui o <p> "Entra na tua conta" / "Cria a tua conta" (Auth.jsx:70-72).
// A pergunta do visitante é "o que é isto?", não "que formulário é este?".
const TAGLINE = {
  signin: 'Entra na tua conta',
  signup: 'A Carol junta a corrida, o ginásio e o que comes, e faz-te um plano até à tua próxima prova.',
};

/*
  <p className="text-xs text-[var(--text-3)] text-center leading-relaxed">
    {TAGLINE[authMode]}
  </p>
*/
// Nota: em 'signin' fica igual de propósito: quem já tem conta não precisa
// do discurso. Se quiseres a frase também no login, usa a de signup nos dois.


// ─── 2. Modo 'reset' ("Esqueci-me da palavra-passe") ──────────────────────
// authMode passa a 'signin' | 'signup' | 'reset'. No handleSubmit, antes do
// if (authMode === 'signin'):

async function handleReset({ supabase, email, setInfoMsg, setAuthMode }) {
  const redirectTo = window.location.origin + (import.meta.env.BASE_URL || '/');
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  if (error) throw error;
  // A mesma frase exista ou não a conta: não se confirma a um estranho que
  // um email está registado.
  setInfoMsg('Se houver uma conta com este email, enviámos-te um link para escolheres uma palavra-passe nova.');
  setAuthMode('signin');
}

// Em modo 'reset' o campo da palavra-passe esconde-se e a validação do
// topo do handleSubmit passa a exigir só o email:
//   if (!email.trim() || (authMode !== 'reset' && !password)) { ... }
// Botão principal: authMode === 'reset' ? 'Enviar link' : ...

// Link por baixo do campo da palavra-passe, só em 'signin':
/*
  {authMode === 'signin' && (
    <button
      type="button"
      onClick={() => { setAuthMode('reset'); setErrorMsg(null); setInfoMsg(null); }}
      className="min-h-[44px] text-[11px] text-[var(--text-3)] hover:text-[var(--text-2)] transition outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded-lg"
    >
      Esqueci-me da palavra-passe
    </button>
  )}
*/
// E o toggle do fundo, em 'reset': 'Afinal lembro-me. Entrar'.


// ─── 3. Regra da palavra-passe ao criar conta ─────────────────────────────
// Por baixo do input, só em 'signup'. Confirmar o mínimo real no painel do
// Supabase (Auth › Providers › Email › Minimum password length); o Supabase
// usa 6 por omissão.
/*
  {authMode === 'signup' && (
    <p className="text-[11px] text-[var(--text-3)] mt-1">Pelo menos 6 caracteres.</p>
  )}
*/


// ─── 4. O regresso do link do email (App.jsx) ─────────────────────────────
// Sem isto, o link abre a app já com sessão iniciada e a pessoa nunca chega
// a escolher a palavra-passe nova. No onAuthStateChange que já existe:
//
//   if (event === 'PASSWORD_RECOVERY') setRecoveringPassword(true);
//
// e, enquanto recoveringPassword, mostrar um ecrã mínimo com um campo e
// "Guardar palavra-passe", que faz:
//
//   const { error } = await supabase.auth.updateUser({ password });
//   if (!error) setRecoveringPassword(false);
//
// Mesmo cartão e mesmo AppBackground do Auth.jsx, com o título
// "Escolhe uma palavra-passe nova".
//
// Depende de 'redirectTo' estar na lista de URLs autorizados do Supabase
// (Auth › URL Configuration): o domínio do GitHub Pages e localhost:3000.


// ─── 5. "Explorar sem conta" (NÃO integrar ainda) ─────────────────────────
// O modo ?demo=true seria a melhor porta de entrada para quem ainda não
// decidiu, MAS o DEMO_PROFILE tem is_admin: true (App.jsx:249): o toque
// duplo no logótipo abriria o Admin a qualquer visitante. Primeiro:
//   - is_admin: false no DEMO_PROFILE (ou um perfil de demo separado para
//     visitantes, se o admin precisar do atual para testes);
//   - dados de demo coerentes (ver help-content.md › "Notas para o demo").
// Só depois:
/*
  <button type="button" onClick={() => { window.location.search = '?demo=true'; }} ...>
    Explorar a app sem conta
  </button>
*/

export { TAGLINE, handleReset };
