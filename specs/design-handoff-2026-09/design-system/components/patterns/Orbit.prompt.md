Os três anéis concêntricos do Início: calorias (violeta), proteína (rosa), água (ciano). Só leitura.

> Implementado em `src/components/shared/Orbit.jsx`, que exporta também `OrbitLegend`.

```jsx
const rings = [
  { label: 'Calorias', value: 1840, target: 2450, color: 'var(--mod-nutricao-to)', unit: 'kcal' },
  { label: 'Proteína', value: 96, target: 150, color: 'var(--mod-corpo-to)', unit: 'g' },
  { label: 'Água', value: 1.5, target: 2.5, color: 'var(--mod-corrida-to)', unit: 'L', display: '1,5', targetDisplay: '2,5' },
];

<div className="flex items-center gap-4">
  <Orbit rings={rings} animate={reveal} />
  <OrbitLegend rings={rings} animate={reveal} />
</div>

<Orbit empty />   {/* primeiro dia: anéis tracejados */}
```

- Nada de registar aqui dentro: o registo vive no FAB. O "+250" dentro dos anéis era o
  alvo mais pequeno da app (auditoria 2026-09-09, achado 7).
- `animate` desenha os três de fora para dentro, 80ms de desfasamento, 1100ms. Quem
  decide quando é quem monta — no Início, o `useRevealAnimation` do StatusCard.
- `display`/`targetDisplay` são o valor já formatado; é deles que a legenda tira as
  casas decimais para os números que contam.
