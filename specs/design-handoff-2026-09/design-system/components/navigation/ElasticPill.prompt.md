A minhoca elástica — o indicador da nav inferior e dos subnavs. Estica a cobrir o trajeto e contrai no destino com overshoot.

```jsx
<div style={{position:'relative'}}>
  <ElasticPill target={{ left: i*78+26, width: 26 }} speed="nav" />
  …itens…
</div>
<ElasticPill target={{ left: 6 + i*69.2, width: 69.2 }} speed="sub" style={{ background:'var(--tint-run-bg)', border:'1px solid var(--tint-run-bd)' }} />
```

- Nunca duas no mesmo ecrã em movimento ao mesmo tempo.
- Em `speed="sub"` a cor vem por `style` — é a cor do módulo ativo.
