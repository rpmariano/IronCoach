# Carol — brief das imagens anatómicas (substituir o "boneco" do ginásio)

Pedido para a ferramenta de imagem que gerou o pacote 3D da Carol (`CAROL_ASSETS_FINAL.md`). Objetivo: trocar o boneco SVG do cartão de treino (`MuscleAnatomy2D`, em `src/components/Gym/GymSessionCard.jsx`) pela Carol em croché, com os músculos trabalhados acesos.

Estado em 2026-10-22: ainda não há imagens novas. Este documento diz o que falta e como entregar.

## 1. O que existe e porque não chega

Há quatro imagens anatómicas da versão castanha, todas com 1376×768 e a vista de frente e de costas lado a lado:

| Ficheiro | O que acende |
|---|---|
| `carol_musculos_peito.jpg` | Peito + ombros |
| `carol_musculos_costas.jpg` | Costas + bíceps |
| `carol_musculos_core.jpg` | Abdominais, oblíquos, lombar |
| `carol_musculos_pernas.jpg` = `carol_mapa_muscular.jpg` | Pernas inteiras + glúteos |

O `carol_mapa_muscular.jpg` **não é** o mapa do corpo inteiro que o inventário anuncia: é byte a byte igual ao das pernas.

Problemas:

1. **Cada imagem é uma combinação fixa.** Um treino de peito + tríceps + gémeos não tem imagem, e desenhar todas as combinações não é viável.
2. **Faltam grupos:** tríceps, antebraços, gémeos isolados, glúteos isolados, ombros isolados, corpo inteiro, cardio.
3. **Texto embutido**, em inglês e português misturados ("WORKOUT TARGET: LEGS", "CALVES", "Maximum Activation", "Dumbbells"). A app tem de escrever as legendas ela própria, em português e acessíveis a leitores de ecrã.

## 2. Como entregar: uma base e uma camada por grupo

Em vez de uma imagem por combinação: **uma base neutra e uma camada transparente por grupo muscular**, todas com exatamente a mesma pose, câmara, enquadramento e tamanho. A app empilha as camadas dos grupos trabalhados por cima da base, e qualquer combinação monta-se sozinha. É o mesmo método das bocas das expressões (`public/carol-avatar/boca_*.webp`).

### 2.1 Regras comuns a todos os ficheiros

- **Personagem:** a Carol oficial, versão **cabelo castanho mel, olhos avelã** (não a preta). Bandolete coral, auscultadores ciano, top e calções azul-petróleo, ténis claros, Galaxy Watch 7 com bracelete cor de vinho no **pulso esquerdo**. Croché tom pêssego/creme, corpo tonificado natural.
- **Composição:** como as imagens atuais, com a vista de **frente à esquerda e de costas à direita**, lado a lado, de corpo inteiro e com os pés no chão. Mesma escala nas duas vistas.
- **Pose:** em pé, neutra, braços ligeiramente afastados do tronco para se verem bíceps, tríceps e antebraços. **Sem halteres nas mãos**: escondem os antebraços e não fazem sentido no cardio.
- **Tamanho:** 2752×1536 px (o dobro das atuais, proporção 16:9 aproximada). A app gera as versões leves.
- **Fundo:** estúdio escuro uniforme, próximo de `#0b1120`, sem vinheta forte, para encaixar no fundo da app.
- **Sem texto nenhum:** sem títulos, legendas, linhas de chamada, legenda de cores nem marcas de água.
- **Sem partículas** no cabelo (os pixels digitais ciano das imagens atuais): mudam de imagem para imagem e desalinham as camadas.

### 2.2 A base — `anatomia_base.png`

A Carol com **todos os músculos visíveis mas apagados**: a malha muscular em tom escuro e dessaturado, como as zonas "Inactive" das imagens atuais. É o que se vê num treino sem categorias.

- PNG, RGB, fundo de estúdio incluído.

### 2.3 As camadas — `anatomia_<grupo>.png`

Cada camada contém **só o brilho** desse grupo, no sítio exato onde está na base. Tudo o resto fica transparente.

- PNG **RGBA**, mesmo tamanho da base, alinhamento ao pixel. Pousada sobre a base sem deslocar nada, tem de parecer que aquele grupo acendeu.
- **Estilo do brilho:** o das imagens atuais, com o músculo em magenta (`#ff5fa8`) a passar para ciano (`#22d3ee`) nas fibras e um halo suave à volta. O halo pode sair do contorno do músculo, mas não deve invadir grupos vizinhos.
- Cada grupo acende **nas duas vistas** em que se vê: o ombro, por exemplo, na frente e nas costas.
- **Sem a personagem** na camada: nada de pele, roupa ou cabelo, só o músculo aceso.

| Ficheiro | Músculos | Vista |
|---|---|---|
| `anatomia_peito.png` | Peitoral maior e menor | Frente |
| `anatomia_ombros.png` | Deltoides anterior, lateral e posterior | Frente + costas |
| `anatomia_costas.png` | Grande dorsal, trapézio, romboides, lombar | Costas |
| `anatomia_biceps.png` | Bíceps | Frente (+ costas, se visível) |
| `anatomia_triceps.png` | Tríceps | Costas (+ frente, se visível) |
| `anatomia_antebracos.png` | Antebraços | Frente + costas |
| `anatomia_core.png` | Reto abdominal, oblíquos, transverso | Frente (+ lombar baixa, de costas) |
| `anatomia_gluteos.png` | Glúteo máximo e médio | Costas |
| `anatomia_coxas.png` | Quadríceps, isquiotibiais, adutores | Frente + costas |
| `anatomia_gemeos.png` | Gémeos e solear | Frente + costas |

São 10 camadas e 1 base.

### 2.4 Cardio — `anatomia_cardio.png`

O cardio não é um músculo, é o sistema cardiorrespiratório. É um ficheiro **completo e não uma camada**, porque muda o corpo inteiro:

- A mesma Carol, a mesma pose e o mesmo enquadramento da base, com a **caixa torácica translúcida** em croché claro.
- **Coração** aceso no centro-esquerda do peito, em vermelho-coral quente (`#ff5f6d` a `#ff5fa8`), com um brilho de pulsação.
- **Pulmões** acesos dos dois lados, em ciano (`#22d3ee`) com textura de alvéolos em malha de croché.
- O resto do corpo como na base, apagado. Pode haver uma linha ténue de vasos a partir do coração, em magenta muito suave.
- Vista de costas: pulmões visíveis por trás e coração discreto, ou só pulmões.
- PNG, RGB, sem texto.

Para a app animar a pulsação, entrega também **`anatomia_cardio_coracao.png`**: uma camada RGBA só com o brilho do coração, alinhada com o `anatomia_cardio.png`. A app faz-lhe um pulsar de opacidade.

### 2.5 Corpo inteiro

Não precisa de ficheiro próprio. "Full Body" é a base com as 10 camadas acesas. O mesmo vale para Levantamento Olímpico, Powerlifting e Calistenia, que acendem as camadas da tabela do §3.

## 3. Como a app usa as camadas

| Categoria do treino | Camadas acesas |
|---|---|
| Peito | peito |
| Costas | costas |
| Ombros | ombros |
| Bíceps | biceps |
| Tríceps | triceps |
| Braços | biceps, triceps, antebracos |
| Core/Abdominais | core |
| Glúteos | gluteos |
| Pernas Superiores | coxas |
| Pernas Inferiores | gemeos |
| Push | peito, ombros, triceps |
| Pull | costas, biceps |
| Full Body | todas |
| Levantamento Olímpico | coxas, gluteos, costas, ombros |
| Powerlifting | peito, coxas, gluteos, costas |
| Calistenia | peito, costas, ombros, biceps, triceps, core |
| Cardio | `anatomia_cardio.png` em vez da base |
| Cardio + outro grupo | `anatomia_cardio.png` com as camadas do grupo por cima |
| Sem categorias | só a base |

A tabela segue `mapCategoriesToMuscles` (`src/utils/gym.js`) e as listas `MUSCLE_GROUPS` (`supabase/functions/analyze-gym/index.ts` e `src/utils/exerciseLocker.js`). Se essas listas mudarem, a tabela muda com elas.

## 4. Critérios de aceitação

Antes de entrar na app, cada entrega é verificada assim:

1. Todos os ficheiros com 2752×1536.
2. Base com cada camada por cima, uma a uma: nenhum desalinhamento visível a 100 %.
3. Base com todas as camadas: o corpo inteiro aceso sem halos a somar em manchas brancas.
4. Camadas: zonas fora do músculo com alfa 0, sem restos de pele ou roupa.
5. Nenhum texto em nenhum ficheiro.
6. Cardio: coração e pulmões reconhecíveis a 120 px de altura, o tamanho no cartão do treino.
7. A Carol igual às imagens aprovadas (cabelo castanho, relógio no pulso esquerdo).

## 5. Depois da entrega (lado da app)

1. Gerar versões WebP leves para `public/carol-anatomia/`, como em `public/carol-avatar/`.
2. Componente novo no lugar do `MuscleAnatomy2D`: a base, com as camadas por cima em fade, e as legendas em português, escritas pela app e lidas por leitores de ecrã.
3. Acrescentar Cardio ao mapeamento: hoje `mapCategoriesToMuscles` não conhece "Cardio" e o boneco fica apagado.
4. Revisão pré-deploy e verificação no browser.
