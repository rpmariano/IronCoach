Persiana que sobe do fundo (6 refeições, análise cruzada) e Dialog centrado (dispensar aviso, insights). Ambos exportados deste ficheiro. Montar dentro da moldura do ecrã (position:relative).

```jsx
<Sheet eyebrow="Sugestão alimentar · domingo" title="~2150 kcal" onClose={close}>…lista…</Sheet>
<Dialog title="Dispensar o aviso da Carol?" actions={<><Button tone="coach" variant="tinted" style={{flex:1}}>Dispensar</Button><Button variant="secondary" style={{flex:1}}>Cancelar</Button></>}>O aviso deixa de aparecer no Início.</Dialog>
```

- Abre em 340ms, fecha em 240ms. A persiana é arrastável; o Dialog não.
