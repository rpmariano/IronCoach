# Configuração Claude Code - IronCoach

## Deploy Trigger para o Quality Orchestrator

Este diretório contém a configuração que integra os agentes de qualidade com o fluxo de trabalho do IronCoach.

### 🚀 Como Funciona

Quando trabalhas com o projeto, o assistente Claude automaticamente:

1. **Invoca o `quality_orchestrator`** quando:
   - Fazes push da tua branch (`dev-antigravity`, `dev`, etc.)
   - Mencionas "deploy", "produção", "master", "push", "pronto", etc.
   - Estás prestes a fazer merge para `master`

2. **Executa uma review completa** que coordena:
   - 🧪 **test_engineer** — corre testes
   - 🔐 **supabase_guardian** — valida BD e Edge Functions
   - 📱 **pwa_auditor** — audita PWA (manifest, SW, performance)
   - ♿ **a11y_checker** — valida acessibilidade WCAG 2.1 AA
   - 📚 **docs_keeper** — verifica documentação
   - ✅ **pre_deploy_reviewer** — review estático final

3. **Gera um veredicto consolidado**:
   - 🟢 APROVADO
   - 🟡 APROVADO COM AVISOS
   - 🔴 BLOQUEADO (não deixa prosseguir)

### 📋 Ficheiros de Configuração

- **`settings.json`** — Define os hooks de invocação automática
- **`.agents/agents/quality-orchestrator.md`** — Especificação do agente orquestrador
- **`.agents/rules/auto-agents.md`** — Regras de invocação de todos os agentes

### 🔧 Fluxo de Trabalho

```
Desenvolvimento (branch dev-antigravity)
         ↓
    Código pronto?
         ↓
   git push (hook: post_git_push)
         ↓
Quality Orchestrator ← Invocado automaticamente
         ↓
   [Review Completa]
         ↓
Merge para dev (automático se aprovado)
         ↓
Merge para master (com autorização)
         ↓
Deploy em produção
```

### ⚙️ Configuração Personalizada

Podes adicionar mais triggers ou regras editando `settings.json` ou criando `.claude/settings.local.json` para overrides pessoais.

---

**Nota**: Este setup foi criado na branch `claude/orchestrator-agent-deploy-trigger-yh6n53` para integrar automaticamente a validação de qualidade no fluxo de deploy do IronCoach.
