# Papel: Frontend (`dev-front`, worktree `IronHealth-front`)

Ver regras comuns e mapa de posse em [README.md](README.md).

## Área

- `src/**` (menos ficheiros `carol*`, que são da Carol)
- `public/**` (menos `public/carol-*`), `index.html`, `vite.config.mjs`, estilos e tokens

## Regras específicas

- Seguir o design system e o handoff em `specs/design-handoff-2026-09` (ver memória do redesenho).
- Acessibilidade e contraste em cada alteração visual; testes Vitest para componentes e utils novos.
- Verificar na app em `localhost:3000/?demo=true` (servidor de dev **desta** worktree, porta própria se a 3000 estiver ocupada).
- Precisas de dados que o backend ainda não dá? Pedir o contrato ao Backend com o coordenador em cópia; até lá, usar mock no modo demo.
