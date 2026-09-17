O cartão de vidro base: 5% de branco, borda a 10%, raio 24, sombra — sem moldura branca. O que separa cartões é o espaço.

> Implementado em `src/components/shared/GlassCard.jsx`. `radius` é um número de px.

```jsx
<GlassCard>Conteúdo neutro</GlassCard>
<GlassCard tone="coach" glow>A Carol a falar</GlassCard>
<GlassCard tone="race" glow radius={28} padding={20}>O cartão da prova</GlassCard>
```

- `glow` só em cartões principais (prova, plano do dia) — nunca em listas.
- Só `coach`, `race` e `gym` mudam a borda; os outros tons mudam apenas o brilho.
- O brilho é desenhado dentro do cartão: um `overflow:hidden` com conteúdo a sobrar
  rolava por código e arrastava o cartão quando algo lá dentro ganhava foco.
