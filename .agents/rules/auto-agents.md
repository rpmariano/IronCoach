---
description: Regras de invocação automática dos agentes de qualidade do IronHealth. O assistente deve seguir estas regras sem que o utilizador precise de pedir explicitamente.
---

# Invocação Automática de Agentes

Os agentes definidos em `.agents/agents/` devem ser invocados **automaticamente** pelo assistente nos momentos certos, sem que o utilizador precise de pedir.

## Regras de Invocação

### 🧪 `test_engineer`
Invocar automaticamente quando:
- Se cria ou modifica significativamente um componente em `src/components/`
- Se cria ou modifica um store em `src/store/`
- Se cria ou modifica utils em `src/utils/` ou `src/lib/`
- O utilizador pede para "criar", "implementar" ou "adicionar" uma feature

O agente deve gerar testes para o código novo/alterado e correr `npx vitest run`.

### 🔐 `supabase_guardian`
Invocar automaticamente quando:
- Se cria ou modifica ficheiros em `supabase/` (migrations, functions, config)
- Se cria ou modifica ficheiros `.sql`
- Se altera o cliente Supabase em `src/lib/supabase*`
- Se modificam queries no store (`src/store/`)

**Não invocar** se as alterações não tocarem nenhum destes caminhos.

### 📱 `pwa_auditor`
Invocar automaticamente quando:
- Se modifica `public/manifest.json`, `public/sw.js` ou `vite.config.mjs`
- Se adicionam novos assets a `public/`
- Se alteram estratégias de caching ou registo do service worker
- Antes de um deploy para produção (merge para `master`)

### ♿ `a11y_checker`
Invocar automaticamente quando:
- Se cria um novo componente de UI em `src/components/`
- Se modificam estilos em `src/styles/globals.css` (tokens de cor, contraste)
- Se adicionam botões, links ou elementos interativos
- O utilizador pede alterações visuais ou de layout

### 📚 `docs_keeper`
Invocar automaticamente quando:
- Se cria ou remove um componente/módulo em `src/components/`
- Se adiciona ou remove uma Edge Function em `supabase/functions/`
- Se altera a estrutura de navegação ou os módulos da app
- Se modifica o store (`src/store/`) com novas entidades ou queries
- Se altera `src/styles/globals.css` com novos tokens de design
- Se altera a stack ou dependências significativas em `package.json`

O agente compara as alterações com PRODUCT.md, PRD, SDD e Manual do Utilizador e propõe atualizações concretas. **Nunca modifica documentação sem aprovação.**

### ✅ `pre_deploy_reviewer`
Invocar automaticamente quando:
- O utilizador diz "review", "revê o código", "faz review"
- O utilizador diz "prepara para deploy", "merge para master", "push para produção"
- Antes de qualquer merge para `master`

### 📝 `spec_writer`
Invocar automaticamente quando:
- O utilizador descreve uma nova feature ou funcionalidade significativa
- O utilizador diz "quero adicionar", "seria bom ter", "preciso de"
- Não existe spec em `specs/` para a feature em questão

### 🎯 `quality_orchestrator`
Invocar automaticamente quando:
- O utilizador menciona "deploy", "produção", "master", "push"
- Uma feature ou alteração está concluída e pronta para integração
- O utilizador diz "está pronto", "acabei", "podes rever"

## Modo de Execução

- **Dia-a-dia (commits normais)**: Invocar agentes individuais conforme as regras acima
- **Pré-deploy (push/merge para master)**: Invocar o `quality_orchestrator` em modo completo

## Comportamento Esperado

1. O assistente **não precisa de pedir permissão** para invocar um agente — deve fazê-lo proativamente
2. O assistente deve **informar o utilizador** de que está a correr um agente (ex: "Vou correr o test_engineer para gerar testes para este componente novo")
3. Se um agente reportar problemas, o assistente deve **corrigir os problemas antes de prosseguir**, não apenas reportá-los
4. Os relatórios dos agentes devem ser **apresentados de forma sucinta** ao utilizador, não em formato bruto
5. **NUNCA realizar commits ou pushes (`git commit`, `git push`) diretamente na branch `master` sem autorização explícita e inequívoca do utilizador.**
6. Trabalhar exclusivamente na branch `dev-antigravity`. Nunca fazer git checkout para outra branch na pasta do projeto.
7. O fluxo de deploy (ao concluir uma alteração) é **SEMPRE**:
   - `git add <ficheiros-alterados>` (Nunca usar `git add -A` ou `git commit -a`)
   - `git commit` e `git push` para `dev-antigravity`.
   - `git fetch`
   - Merge para `dev` (sem pedir autorização) e `git push origin dev`, verificando possíveis conflitos com o trabalho de `dev-claude`. Em caso de conflito, resolver ou avisar em vez de forçar.
   - Merge para `master` APENAS com autorização expressa.
