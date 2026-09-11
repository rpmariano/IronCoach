A órbita do Início — três anéis de nutrição do dia, com legenda ao lado. Leitura pura; sem botões dentro.

```jsx
const rings = [
  { label:'Calorias', value:1980, target:2400, color:'var(--nutrition)' },
  { label:'Proteína', value:112, target:160, unit:'g', color:'var(--body)' },
  { label:'Água', value:1.6, target:2.5, unit:'L', display:'1,6', targetDisplay:'2,5', color:'var(--run)' },
];
<GlassCard style={{display:'flex',alignItems:'center',gap:16}}><Orbit rings={rings}/><OrbitLegend rings={rings}/></GlassCard>
```
