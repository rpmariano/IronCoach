A moldura de qualquer ecrã — fundo, curvas de nível, gradiente ambiente, header, scroll com paddings certos, nav e overlays. Exporta também AppHeader e ContextHeader.

```jsx
<ScreenFrame header={<AppHeader/>} footer={<BottomNav …/>}>
  <SectionLabel>O que faço hoje</SectionLabel>
  <GlassCard tone="gym" glow>…</GlassCard>
</ScreenFrame>

<ScreenFrame header={<ContextHeader eyebrow="Registo" title="Corrida" tone="run" close action={<Button tone="run" variant="tinted" size="sm">Guardar</Button>}/>} footer={<BottomNav …/>}>…</ScreenFrame>
```

- O fundo vive aqui, uma vez. Nenhum ecrã nasce sem ele.
- O gap entre filhos é 12px; o Início usa 8px (passa `style` nos filhos).
