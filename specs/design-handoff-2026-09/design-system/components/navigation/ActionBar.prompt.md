Barra fixa com a ação que confirma o ecrã (Guardar, Continuar). Irmã da nav, nunca dentro do scroll — resolve o botão abaixo da dobra.

> Implementada em `src/components/shared/ActionBar.jsx`, que exporta também
> `ACTION_BAR_SCROLL_PAD`.

```jsx
<main style={{ paddingBottom: ACTION_BAR_SCROLL_PAD }}>…</main>
<ActionBar><Button style={{ flex: 1 }}>Guardar alterações</Button></ActionBar>

<ActionBar aboveNav={false}>
  <Button size="lg" style={{ flex: 1 }}>Continuar</Button>
  <Button variant="ghost">Saltar</Button>
</ActionBar>
```

- Quem usa a barra **tem de** dar ao scroll `paddingBottom: ACTION_BAR_SCROLL_PAD`,
  senão o fim do formulário fica escondido por baixo dela.
- Esse valor é só a diferença (168 − 112): o `<main>` do Layout já dá 112px a todos os
  ecrãs, e somar os 168 inteiros dava 280px de vazio.
- `aboveNav={false}` para ecrãs sem nav (onboarding): cola ao fundo e ganha o safe-area.
- O z-index fica abaixo da nav e muito abaixo das persianas — a barra nunca tapa nenhuma.
