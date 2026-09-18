O trilho do macrociclo: as semanas até à prova, com as fases por cima e o marcador na semana atual.

> Implementado em `src/components/shared/RaceTrail.jsx`.

```jsx
<RaceTrail
  raceId={prova.id}
  weeks={18}
  current={6}
  phases={[
    { label: 'Base', to: 6 },
    { label: 'Construção', to: 13 },
    { label: 'Pico', to: 16 },
    { label: 'Afinamento', to: 18 },
  ]}
  startLabel="Hoje"
  endLabel="Maratona do Porto"
/>
```

- **Passar sempre `raceId`.** É a chave do "já mostrei este avanço": sem ele o trilho é
  estático. Com ele, na primeira vez que se abre o ecrã numa semana nova, o marcador
  parte da semana anterior e percorre até à atual.
- A animação repete quando a SEMANA muda, não quando se volta ao ecrã.
- `phases[].to` é a semana onde a fase acaba (1-based); a primeira começa em 0.
- Respeita `prefers-reduced-motion`: salta direto para a semana atual.
