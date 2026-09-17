Pílula de filtro ou seleção tipo rádio. Ativa é vidro na cor (fundo /15, borda /40, texto na cor), nunca preenchimento sólido.

> Implementado em `src/components/shared/Chip.jsx`. O estado é `active` (não `selected`),
> a cor é `variant` (não `tone`), e não há `badge`.

```jsx
<Chip active={tipo === 'longo'} variant="run" onClick={() => setTipo('longo')}>Longo</Chip>
<Chip variant="gym">Força</Chip>
<Chip active variant="accent" rounded="xl">A Carol sugere</Chip>
```

- `variant="accent"` é o nome histórico da cor da Carol (= `coach`).
- O piso de toque está na classe base (`tap-44`); não o retirar por `className`.
- Sem `active`, todos os chips ficam no mesmo cinzento de vidro — o estado é a cor.
