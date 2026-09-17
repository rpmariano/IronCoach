Botão de ação da IronCoach — nunca abaixo de 44px, com a cor a dizer o significado.

> Implementado em `src/components/shared/Button.jsx`. **Não existe prop `tone`**: a cor
> fixa entra por `variant`, a cor do módulo/prova por `moduleColor` + `variant="module"`.

```jsx
<Button icon={<Check size={15} />}>Registar sessão</Button>
<Button variant="secondary">Cancelar</Button>
<Button variant="module" moduleColor="var(--mod-ginasio-to)">Guardar treino</Button>
<Button variant="danger-outline" size="sm">Apagar</Button>
<Button variant="icon" size="icon" icon={<X size={15} />} aria-label="Fechar" />
<Button isLoading disabled>A analisar</Button>
```

- `primary` é o único cheio em --accent; um por ecrã.
- `module` é o caminho para a cor de um módulo ou da prova — a tinta do texto é
  resolvida por `resolveModuleInk`, nunca escolhida à mão.
- `variant="icon"` pede `size="icon"` (44x44) e um `aria-label`.
- `isLoading` troca o ícone por um spinner e desativa o botão sozinho.
- O que não for prop conhecida vai para o `<button>` (onClick, type, data-testid).
