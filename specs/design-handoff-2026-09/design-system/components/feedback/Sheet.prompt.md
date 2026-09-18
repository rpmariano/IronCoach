Persiana do fundo (`Sheet`) e popup centrado (`Dialog`). Montam-se em `document.body` por portal.

> Implementados em `src/components/shared/Sheet.jsx`. **Não há prop `open`** — quem monta
> controla a existência, e fecha-se sempre por `onClose` para a saída animar.

```jsx
{aberto && (
  <Sheet eyebrow="Ginásio" eyebrowTone="gym" title="Supino" onClose={() => setAberto(false)}>
    <ListaDeSeries />
  </Sheet>
)}

{confirmar && (
  <Dialog
    title="Apagar este registo?"
    onClose={() => setConfirmar(false)}
    actions={<><Button variant="secondary" onClick={...}>Manter</Button><Button variant="danger" onClick={...}>Apagar</Button></>}
  >
    Não dá para voltar atrás.
  </Dialog>
)}
```

- `Sheet` sobe em 340ms e fecha em 240ms; `Dialog` faz scale .96→1 em 220ms.
- `Dialog` é para confirmações e insights — **nunca** formulários.
- A persiana arrasta para baixo para fechar, mas só quando o corpo está no topo.
- **Escape:** há uma pilha global partilhada. Um ecrã inteiro que feche com Escape usa
  `useEscapeClose(onClose)`; nunca um `addEventListener('keydown')` próprio — duas
  persianas empilhadas fechavam as duas de uma vez (2026-09-15, e outra vez no mesmo
  dia depois de promover uma delas a ecrã inteiro com listener à parte).

```jsx
import { useEscapeClose } from '../shared/Sheet';
function MuralEcraInteiro({ onClose }) {
  useEscapeClose(onClose);
  return <div>…</div>;
}
```
