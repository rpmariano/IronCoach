---
description: Garantir que o servidor de desenvolvimento (dev server) está sempre ativo ao trabalhar no projeto IronHealth.
---

# Servidor de Desenvolvimento (Dev Server)

Ao iniciar qualquer tarefa ou efetuar alterações de código no projeto IronHealth:
1. Verificar sempre se o servidor de desenvolvimento (`npm run dev`) está a correr em background.
2. Se não estiver ativo, iniciar imediatamente o servidor de desenvolvimento em modo daemon (`npm run dev`).
3. Manter o servidor de dev ativo para que as alterações fiquem disponíveis de imediato em `http://localhost:3002/` (ou na porta atribuída).
