O cartão de vidro que segura todo o conteúdo. Sem moldura branca — o que separa cartões é o espaço.

```jsx
<GlassCard tone="race" glow>…prova…</GlassCard>
<GlassCard tone="coach" radius="xl" padding="14px 15px">…a Carol…</GlassCard>
<GlassCard>…conteúdo neutro…</GlassCard>
```

- `glow` só em cartões principais (prova, plano do dia). Nunca em listas.
- Dentro de um cartão, os cartões secundários usam `radius="lg"` e sem sombra própria.
