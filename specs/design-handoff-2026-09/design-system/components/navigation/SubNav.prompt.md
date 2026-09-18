Subnav em vidro com a minhoca rápida. Cinco separadores no Dashboard, quatro no Perfil.

> Implementado em `src/components/shared/SubNav.jsx`. A prop é `activeIndex` (não
> `active`); não há `tones` nem `width` — a cor vive em cada item.

```jsx
<SubNav
  items={[
    { label: 'Geral', srLabel: 'Visão Geral', icon: <LayoutGrid size={15} />, tone: 'run' },
    { label: 'Corrida', icon: <Footprints size={15} />, tone: 'run' },
    { label: 'Ginásio', icon: <Dumbbell size={15} />, tone: 'gym' },
    { label: 'Nutrição', icon: <Utensils size={15} />, tone: 'nutrition' },
    { label: 'Corpo', icon: <HeartPulse size={15} />, tone: 'body' },
  ]}
  activeIndex={i}
  onChange={(idx) => setI(idx)}
/>
```

- A pílula toma a cor do separador ativo — só a cor transita (200ms); a posição vem do
  rAF do hook, para a troca de módulo não piscar.
- 480ms fixos (`--dur-pill-sub`), bem abaixo da nav inferior: num subnav que se troca
  quatro vezes seguidas para comparar módulos, a duração de assinatura seria espera.
- Cinco separadores a 390px só cabem com o rótulo curto — é para isso que existe
  `srLabel`, que guarda o nome por extenso para quem usa leitor de ecrã.
- Não pôr `scale` no toque: o botão É a caixa que a minhoca mede.
