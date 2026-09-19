# Implementação: card "Sugestão alimentar e nutricional" — opção 2a

Instruções para implementar no repo IronCoach (pasta local `IronHealth-claude`). Âmbito: só a caixa de sugestão alimentar do dia expandido (`PlanDayCard`, em `WeeklyPlanCard.jsx`) + correção do `.wpc-meal-indicator`. Referência visual: `Card Sugestao Alimentar.dc.html`, secção `id="t2"`, opção `id="2a"`. Ignorar `t1` e `2b`.

## Bloqueio de dados — resolver primeiro

`item.meal_suggestion` é hoje **texto livre** gerado pelo Coach e renderizado com `<CoachText>`. O layout 2a precisa de refeições separadas + totais de kcal/macros — não existe isso na string atual.

**Decisão para esta implementação: parser provisório no cliente**, sem migração de esquema. Formato esperado (uma linha por refeição, linha de totais, linha de racional opcional):

```
Pequeno-almoço: Omelete de 2 ovos com espinafres + 1 fatia de pão escuro + sumo de laranja natural.
Lanche da manhã: 1 iogurte líquido proteico + 15g de cajus.
Almoço: 160g de atum ao natural com 180g de grão-de-bico cozido, ovo cozido picado e legumes.
Lanche da tarde: 1 taça de fruta variada + 150g de iogurte natural.
Jantar: 150g de lombo de porco magro assado + 180g de arroz de legumes + salada verde.
Ceia: Chá de tília com 2 bolachas de aveia.
Total: ~2150 kcal | Proteína: 130g | Hidratos: 240g | Gordura: 65g
Racional: Recuperação muscular entre sessões de qualidade, mantendo micronutrientes e gorduras de qualidade.
```

Se o texto não bater com este formato (registos antigos, ou o Coach ainda não gera assim), `parseMealSuggestion` devolve `null` e o componente **cai no render atual em texto corrido** (`CoachText` + `pre-wrap`) — não pode haver crash nem bloco vazio.

**Dependência fora deste ficheiro:** o prompt/schema da function do Coach que gera `meal_suggestion` tem de passar a produzir este formato para os dias novos. Sinalizar isso separadamente; não bloqueia o merge do componente.

### `src/utils/parseMealSuggestion.js` (novo ficheiro)

```js
const MEAL_KEYS = [
  ['Pequeno-almoço', 'pequeno_almoco'],
  ['Lanche da manhã', 'lanche_manha'],
  ['Almoço', 'almoco'],
  ['Lanche da tarde', 'lanche_tarde'],
  ['Jantar', 'jantar'],
  ['Ceia', 'ceia'],
];
const MEAL_RE = new RegExp(`^(${MEAL_KEYS.map(([l]) => l).join('|')}):\\s*(.+)$`, 'i');
const TOTAL_RE = /^Total:\s*~?(\d+)\s*kcal\s*\|\s*Prote[ií]na:\s*(\d+)\s*g\s*\|\s*Hidratos:\s*(\d+)\s*g\s*\|\s*Gordura:\s*(\d+)\s*g/i;
const RACIONAL_RE = /^Racional:\s*(.+)$/i;

export function parseMealSuggestion(text) {
  if (!text) return null;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const refeicoes = [];
  let totais = null;
  let racional = null;

  for (const line of lines) {
    const mealMatch = line.match(MEAL_RE);
    if (mealMatch) {
      const key = MEAL_KEYS.find(([l]) => l.toLowerCase() === mealMatch[1].toLowerCase())[1];
      refeicoes.push({ tipo: key, label: mealMatch[1], texto: mealMatch[2] });
      continue;
    }
    const totalMatch = line.match(TOTAL_RE);
    if (totalMatch) {
      const [, kcal, proteina, hidratos, gordura] = totalMatch.map(Number);
      totais = { kcal, proteina_g: proteina, hidratos_g: hidratos, gordura_g: gordura };
      continue;
    }
    const racionalMatch = line.match(RACIONAL_RE);
    if (racionalMatch) racional = racionalMatch[1];
  }

  if (refeicoes.length < 2 || !totais) return null; // não confia em parse parcial
  return { refeicoes, totais, racional };
}

// share de energia (%) por macro — 4 kcal/g proteína e hidratos, 9 kcal/g gordura
export function macroShares(totais) {
  const p = totais.proteina_g * 4, h = totais.hidratos_g * 4, g = totais.gordura_g * 9;
  const sum = p + h + g || 1;
  return { proteina: p / sum, hidratos: h / sum, gordura: g / sum };
}

export const MEAL_ICON_BY_TIPO = {
  pequeno_almoco: 'Sunrise', lanche_manha: 'Apple', almoco: 'Salad',
  lanche_tarde: 'Cherry', jantar: 'UtensilsCrossed', ceia: 'Coffee',
};
```

## `src/components/Home/WeeklyPlanCard.jsx`

**Import** — trocar `Award` por `Salad`, e adicionar os ícones de refeição + o parser:
```diff
- Utensils, Coffee, Award, StickyNote, Clock, Flag, MessageCircle
+ Utensils, Coffee, Salad, Sunrise, Apple, Cherry, UtensilsCrossed, StickyNote, Clock, Flag, MessageCircle
```
```js
import { parseMealSuggestion, macroShares, MEAL_ICON_BY_TIPO } from '../../utils/parseMealSuggestion';
```
Mapa de ícones por nome (os componentes já importados acima):
```js
const MEAL_ICON_COMPONENT = { Sunrise, Apple, Salad, Cherry, UtensilsCrossed, Coffee };
```

**Substituir o bloco `item.meal_suggestion && (...)` (linhas ~251–289)** por:

```jsx
{item.meal_suggestion && (() => {
  const parsed = parseMealSuggestion(item.meal_suggestion);
  return (
    <div className="wpc-info-box" style={{ marginTop: '12px' }}>
      <details className="wpc-info-box-details">
        <summary className="wpc-info-box-header nutri" style={{ cursor: 'pointer', outline: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Salad size={14} /> Sugestão alimentar e nutricional
          </div>
          <ChevronDown size={14} className="details-chevron" />
        </summary>

        {parsed ? (
          <div className="wpc-nutri-body">
            <div className="wpc-nutri-total">
              <div className="wpc-nutri-total-value">
                <span>~{parsed.totais.kcal}</span><small>kcal</small>
              </div>
              <div className="wpc-nutri-total-label">Total estimado do dia</div>
            </div>

            <MacroRings totais={parsed.totais} />
            <div className="wpc-nutri-ring-legend">anel = % da energia total</div>

            <div className="wpc-nutri-meals">
              {parsed.refeicoes.map((r) => {
                const Icon = MEAL_ICON_COMPONENT[MEAL_ICON_BY_TIPO[r.tipo]];
                const principal = ['pequeno_almoco', 'almoco', 'jantar'].includes(r.tipo);
                return (
                  <div className="wpc-nutri-meal-row" key={r.tipo}>
                    <span className={`wpc-nutri-meal-icon ${principal ? 'is-main' : ''}`}>
                      {Icon && <Icon size={18} />}
                    </span>
                    <div>
                      <div className="wpc-nutri-meal-name">{r.label}</div>
                      <p className="wpc-nutri-meal-text">{r.texto}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {parsed.racional && (
              <div className="wpc-nutri-racional">
                <div className="wpc-nutri-racional-label">Racional</div>
                <p className="wpc-nutri-racional-text">{parsed.racional}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="wpc-info-box-text text-sm font-normal text-slate-700 mt-2" style={{ whiteSpace: 'pre-wrap' }}>
            <CoachText>{item.meal_suggestion}</CoachText>
          </div>
        )}

        <p className="wpc-info-box-disclaimer mt-2">
          Sugestão, não prescrição — ajusta ao que te cai bem. Em caso de
          dúvida clínica, fala com um nutricionista.
        </p>
      </details>

      {!readOnly && (!item.meal_status || item.meal_status === 'pendente') && (
        <div className="wpc-actions" style={{ marginTop: '12px' }}>
          <button onClick={() => onCompleteMeal(item)} className="wpc-btn wpc-btn-primary">
            <Check size={14} /> Segui
          </button>
          <button onClick={() => onCancelMeal(item)} className="wpc-btn wpc-btn-secondary">
            <XIcon size={14} /> Não segui
          </button>
        </div>
      )}
      {item.meal_status === 'seguida' && (
        <div className="wpc-pill-status success" style={{ marginTop: '12px' }}>
          <Check size={14} /> Seguida
        </div>
      )}
      {item.meal_status === 'nao_seguida' && (
        <div className="wpc-pill-status danger" style={{ marginTop: '12px' }}>
          <XIcon size={14} /> Não seguida
        </div>
      )}
    </div>
  );
})()}
```

Nada mudou nos botões `Segui`/`Não segui`/pills — só o conteúdo dentro do `<details>`.

**Novo componente `MacroRings`** (mesmo ficheiro, acima de `PlanDayCard`, ou em `src/components/shared/MacroRings.jsx` se preferirem isolar):

```jsx
function MacroRing({ grams, share, color, label }) {
  const R = 31, C = 2 * Math.PI * R; // 194.8
  return (
    <div className="wpc-macro-ring">
      <div className="wpc-macro-ring-svg-wrap">
        <svg width="68" height="68" viewBox="0 0 74 74">
          <circle cx="37" cy="37" r={R} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="5" />
          <circle cx="37" cy="37" r={R} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - share)} transform="rotate(-90 37 37)" />
        </svg>
        <div className="wpc-macro-ring-center">
          <span>{grams}</span><small>g</small>
        </div>
      </div>
      <div className="wpc-macro-ring-label">{label}</div>
    </div>
  );
}

function MacroRings({ totais }) {
  const shares = macroShares(totais);
  return (
    <div className="wpc-macro-rings">
      <MacroRing grams={totais.proteina_g} share={shares.proteina} color="var(--data-proteina-ink)" label="Proteína" />
      <MacroRing grams={totais.hidratos_g} share={shares.hidratos} color="var(--data-hidratos-ink)" label="Hidratos" />
      <MacroRing grams={totais.gordura_g} share={shares.gordura} color="var(--data-gordura-ink)" label="Gordura" />
    </div>
  );
}
```

Se quiserem animar a entrada do anel: `stroke-dashoffset` de `194.8` até ao valor final, 600ms `cubic-bezier(.4,0,.2,1)`, respeitando `prefers-reduced-motion` (já tratado globalmente em `globals.css` — herda).

## `src/components/Home/WeeklyPlanCard.css`

**Corrigir** (linha ~303-312):
```diff
 .wpc-meal-indicator {
   width: 24px;
   height: 24px;
   border-radius: 50%;
   display: flex;
   align-items: center;
   justify-content: center;
-  background: #d1fae5;
-  color: #34d399;
-  border: 1px solid rgba(52, 211, 153, 0.4);
+  background: rgba(52, 211, 153, 0.14);
+  color: #34d399;
+  border: 1px solid rgba(52, 211, 153, 0.38);
 }
```

**Adicionar** (novas classes, junto a `.wpc-info-box-disclaimer`):

```css
.wpc-nutri-body { margin-top: 2px; }

.wpc-nutri-total { text-align: center; margin: 14px 0 4px; }
.wpc-nutri-total-value {
  display: flex; align-items: baseline; justify-content: center; gap: 5px;
  font-size: 30px; font-weight: 800; letter-spacing: -0.03em; line-height: 1;
  font-variant-numeric: tabular-nums; color: #f8fafc;
}
.wpc-nutri-total-value small { font-size: 12px; font-weight: 700; color: rgba(203,213,225,.75); }
.wpc-nutri-total-label {
  font-size: 9.5px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase;
  color: rgba(203,213,225,.5); margin-top: 6px;
}

.wpc-macro-rings { display: flex; justify-content: space-between; gap: 6px; margin: 14px 0 4px; }
.wpc-macro-ring { text-align: center; }
.wpc-macro-ring-svg-wrap { position: relative; width: 68px; height: 68px; }
.wpc-macro-ring-center {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; font-variant-numeric: tabular-nums;
}
.wpc-macro-ring-center span { font-size: 14px; font-weight: 800; line-height: 1; color: #f8fafc; }
.wpc-macro-ring-center small { font-size: 9px; font-weight: 700; color: rgba(203,213,225,.6); margin-top: 2px; }
.wpc-macro-ring-label {
  font-size: 9.5px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase;
  color: rgba(203,213,225,.6); margin-top: 7px;
}
.wpc-nutri-ring-legend { font-size: 9.5px; color: rgba(203,213,225,.42); text-align: center; margin: 8px 0 14px; }

.wpc-nutri-meals { display: flex; flex-direction: column; }
.wpc-nutri-meal-row {
  display: flex; gap: 11px; padding: 12px 0; border-top: 1px solid rgba(255,255,255,.08);
}
.wpc-nutri-meal-row:last-child { border-bottom: 1px solid rgba(255,255,255,.08); }
.wpc-nutri-meal-icon {
  width: 20px; height: 20px; flex: none; margin-top: 1px; color: rgba(203,213,225,.6);
  display: flex; align-items: center; justify-content: center;
}
.wpc-nutri-meal-icon.is-main { color: #34d399; }
.wpc-nutri-meal-name { font-size: 12px; font-weight: 800; color: #f8fafc; }
.wpc-nutri-meal-text { font-size: 12.5px; line-height: 1.5; color: #cbd5e1; margin-top: 3px; text-wrap: pretty; }

.wpc-nutri-racional { margin-top: 14px; padding-left: 12px; border-left: 2px solid rgba(52,211,153,.35); }
.wpc-nutri-racional-label {
  font-size: 9.5px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; color: rgba(203,213,225,.5);
}
.wpc-nutri-racional-text { font-size: 12.5px; line-height: 1.5; color: #e2e8f0; margin-top: 5px; text-wrap: pretty; }
```

**Ajustar** `.wpc-info-box-disclaimer` (linha ~438) — o tamanho no protótipo é maior que o atual (0.65rem → 10.5px) e a cor deve usar a variante clara:
```diff
 .wpc-info-box-disclaimer {
-  font-size: 0.65rem;
-  color: var(--mod-nutricao);
+  font-size: 10.5px;
+  color: var(--mod-nutricao-ink);
   opacity: 0.8;
   margin-top: 6px;
   font-weight: 600;
 }
```
Nota: isto afeta também o disclaimer da caixa "Instruções do Coach" se partilhar a classe — confirmar no ficheiro que só o bloco de nutrição usa `.wpc-info-box-disclaimer` antes de aplicar (no código atual, é usado só ali).

**Header do bloco nutri** (linha ~407) já aponta para `var(--mod-nutricao)`; trocar para a variante clara:
```diff
 .wpc-info-box-header.nutri {
-  color: var(--mod-nutricao);
+  color: var(--mod-nutricao-ink);
 }
```

## `src/styles/globals.css`

**Adicionar**, junto às variáveis `--data-*` / `--mod-*` (linha ~68):
```css
--data-proteina-ink: #7295ec;
--data-hidratos-ink: #c9bb3a;
--data-gordura-ink:  #e879c5;
--mod-nutricao-ink:  #34d399;
```

## Testes

`src/components/Home/WeeklyPlanCard.test.jsx` — adicionar/atualizar:
- Render com `meal_suggestion` no formato estruturado → espera `~2150`, `130`, `240`, `65`, nomes das 6 refeições, texto do racional.
- Render com `meal_suggestion` em texto livre antigo (sem o formato) → `parseMealSuggestion` devolve `null`, cai no render `CoachText` atual (teste de regressão).
- `wpc-meal-indicator` com a nova cor (snapshot ou verificação de classe/estilo computado, conforme o padrão já usado nos outros testes do ficheiro).

## Fora de âmbito aqui (sinalizar, não implementar)
- Ajustar o prompt/schema da function do Coach para gerar `meal_suggestion` no formato acima (é o que faz o parser deixar de cair em fallback para dias novos).
- Migração formal para `meal_suggestion_json` estruturado, se decidirem substituir o parser por dados já estruturados no futuro.
