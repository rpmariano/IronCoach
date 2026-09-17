O bloco de aviso. Nunca âmbar — o âmbar é da prova e só da prova. Nunca anima nem pulsa: a cor já faz o trabalho parada.

> Implementado em `src/components/shared/Warning.jsx`, que exporta também `WarningAction`.

```jsx
<Warning title="Energia disponível">
  Comeste 1 400 kcal e gastaste 2 900. Hoje não treinas forte.
</Warning>

<Warning tone="ok" title="Dentro do alvo">Proteína cumprida cinco dias seguidos.</Warning>

<Warning tone="coach" title="A Carol repara">
  As tuas três últimas corridas foram todas ao mesmo ritmo.
</Warning>

<Warning
  tone="danger"
  title="Análise falhada"
  actions={<WarningAction tone="danger" onClick={retry}>Tentar de novo</WarningAction>}
>
  Não consegui ler a foto.
</Warning>
```

- `warn` coral (atenção), `ok` verde, `danger` vermelho (erro e admin), `coach` ciano.
- Só `danger` é `role="alert"`; os outros são `status`.
- Os botões de `actions` são `WarningAction` — trazem os 44px consigo. O `style` que se
  lhes passa é fundido com o base, nunca o substitui.
