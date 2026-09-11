Botão de ação da IronCoach — nunca abaixo de 44px, com a cor a dizer o significado (coach, prova, ok, módulo, aviso).

```jsx
<Button tone="ok" variant="tinted" icon={<Check size={15} />}>Registar sessão</Button>
<Button tone="coach" size="lg">Vamos a isso</Button>
<Button variant="secondary">Cancelar</Button>
```

- `primary` é o único com gradiente; um por ecrã.
- `tinted` para ações secundárias com significado (Aceitar, Registar, Guardar de módulo).
- `tone="race"` só quando a ação é sobre a prova (marcar, FAB).
