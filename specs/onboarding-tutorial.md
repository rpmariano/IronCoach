# Especificação: Tutorial da App ("A Carol Mostra-te a Casa") & Sequência de Onboarding

**Data:** 2026-09-27  
**Estado:** Implementado em DEV  
**Alvo:** `src/components/Tutorial/`, `src/components/Onboarding/`, `src/components/Perfil/`, `src/App.jsx`

---

## 1. Contexto e Objetivos

O IronCoach é uma PWA orientada a treino de corrida e saúde com inteligência artificial, centrada na persona da **Carol** (treinadora pessoal dedicada).

O atleta já dispõe de um arranque guiado em 6 passos ([Onboarding.jsx](file:///c:/Users/rpmar/IronHealth-antigravity/src/components/Onboarding/Onboarding.jsx)), mas o fluxo de primeiro acesso beneficia enormemente de uma introdução humana antes do pedido de dados:
1. **Primeiro o Tutorial, Depois o Onboarding:** O atleta novo precisa de sentir **quem é a Carol** antes de começar a responder a perguntas de perfil. O tutorial cria afinidade, transmite segurança e explica a filosofia de treino da app.
2. **A Carol como PT Empática, Omnisciente e Omnipresente:**
   - **Empática e Presente:** Ela não é um bot rígido de ginásio. É compreensiva, adapta-se aos dias difíceis, celebra conquistas e prioriza a saúde e prevenção de lesões.
   - **Omnisciente:** Cruza sono, ritmo cardíaco, nutrição, esforço, histórico de treinos e até altimetria de prova e meteorologia. Lê screenshots do relógio e fotos das refeições por IA.
   - **Omnipresente:** Acompanha o atleta em todos os ecrãs — Início (resumo e ordem do dia), botão central (+) para registo sem formulários, plano de provas e chat 24/7.
3. **Transição Contínua para o Arranque:** No 5.º passo do tutorial, o botão principal é *"Avançar para o arranque"*, que transita imediatamente para os 6 passos do onboarding.
4. **Revisitação a Qualquer Altura:** O tutorial pode ser reaberto pelo separador Perfil (`Carol` ➔ *"Ver tutorial da app"*) ou pelo parâmetro `?tutorial=1`.

---

## 2. Os 5 Pilares do Tutorial da Carol

1. **A tua Treinadora Pessoal ("Mais do que uma app, tens uma PT ao teu lado")**
   - Papel de treinadora empática e calorosa: "Eu cuido do plano, tu cuidas do treino".
2. **Omnisciente ("Reparo em tudo o que fazes")**
   - Cruzamento de dados de relógios (Garmin/Strava/Apple), fotos de refeições, sono, carga acumulada e meteorologia.
3. **Omnipresente ("Acompanho-te em cada ecrã")**
   - Presença no Início, no botão central (+), no plano de treinos e no chat direto.
4. **O Teu Grande Objetivo ("Levamos-te à meta com total confiança")**
   - Contagem decrescente, semanas de tapering, estratégia de ritmo km a km e nutrição para a véspera.
5. **Conversa Direta e Aberta ("Uma conversa resolve qualquer imprevisto")**
   - Flexibilidade total para dores, imprevistos de vida ou ajustes na rotina.
   - CTA Final: *"Avançar para o arranque"* ➔ Inicia o Onboarding.

---

## 3. Requisitos Técnicos e Acessibilidade (WCAG 2.1 AA)

- **Diálogo Modal e Ecrã de Acolhimento:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby="tutorial-step-title"`, `aria-describedby="tutorial-step-desc"`.
- **Navegação por Teclado:**
  - `Escape`: fecha/salta o tutorial e prossegue.
  - `ArrowRight` / `Enter`: avança de passo.
  - `ArrowLeft`: recua um passo.
- **Touch Targets:** Botões com altura mínima de 48px (`var(--tap)`).
- **Persistência Local:** Chave `ironcoach_tutorial_done_${userId}` para não incomodar o utilizador após completado, com fallback gracioso para modo privado ou utilizador anónimo/demo.
- **Sequenciamento no App.jsx:**
  - `isFirstArrival = needsOnboarding && !isTutorialDoneLocally(userId)`
  - Se `isFirstArrival`: renderiza `AppTutorial` primeiro; ao terminar, ativa `onboardingOpen = true`, renderizando `Onboarding`.

---

## 4. O Fluxo de Onboarding Expandido (7 Passos)

Após a conclusão ou encerramento do tutorial, o atleta entra no fluxo de arranque guiado pela Carol:

### Sequência de Ecrãs:
0. **Intro Carol (`carol`):** Saudação pessoal e calorosa sem barra de progresso.
1. **Passo 1/7: Quem és (`quem-es`):**
   - Nome próprio / alcunha.
   - Peso (kg), Altura (cm), Data de nascimento e Género.
   - **Novo:** Onde treinas? (cidade / localidade de treino - `training_city`).
   - **Novo:** Frequência Cardíaca em Repouso (`resting_hr_bpm`), para afinar zonas de treino cardíacas (Z1 a Z5).
2. **Passo 2/7: O teu Objetivo (`objetivo`):**
   - Escolha do foco principal: Preparar uma prova específica, Melhorar o meu ritmo, Manter a forma e saúde, Regressar aos treinos.
3. **Passo 3/7: Como corres (`como-corres`):**
   - Nível de experiência (Iniciante, Regular, Intermédio, Avançado).
   - Volume semanal habitual (km/semana).
   - Dias disponíveis por semana para treinar.
4. **Passo 4/7: Como comes (`como-comes`):**
   - Tipo de alimentação e restrições alimentares (omnívoro, vegetariano, vegan, etc.).
   - Alergias e intolerâncias alimentares.
5. **Passo 5/7: O que a Carol deve lembrar (`memorias`):**
   - **Conceito:** A Carol possui memória de longo prazo que nunca esquece os detalhes confiados pelo atleta.
   - **Chips de Exemplos Rápidos com toggle:**
     - *Preferências de Horário:* "Prefiro correr de manhã antes das 7h30", "Treinos longos sempre ao sábado".
     - *Dias de Treino / Disponibilidade:* "Segundas são sempre descanso", "Terças e quintas posso fazer séries".
     - *Doenças e Limitações Físicas:* "Histórico de fascite plantar no pé esquerdo", "Sensibilidade no joelho direito em descidas longas", "Asma induzida por esforço no tempo frio".
     - *Rotina / Contexto de Vida:* "Trabalho por turnos rotativos", "Noites irregulares com bebé pequeno".
   - **Formulário para Memória Livre:** Seleção de categoria (`disponibilidade`, `limitacao_fisica`, `contexto_vida`, `preferencia_treino`) e campo de texto com botão "Guardar detalhe".
   - **Gestão Contínua:** Lista de notas ativas com remoção instantânea e indicação de que podem ser geridas a qualquer altura em Perfil · Carol.
6. **Passo 6/7: Presença e Alertas (`alertas`):**
   - Três interruptores acessíveis (`role="switch"`, touch target >= 44px):
     - **Alertas proativos da Carol (`carol_push_enabled`):** Notificações de recuperação, tempo meteorológico e ajustes antes de sair para o treino.
     - **Saudação ao abrir a app (`carol_welcome_enabled`):** Mensagem contextual no topo do Início adaptada ao descanso e treino do dia.
     - **Lembretes de hidratação (`water_reminder_enabled`):** Apoio regular nos dias de treino intenso e calor.
7. **Passo 7/7: A tua Prova Alvo (`prova`):**
   - Nome da prova, distância (5k, 10k, 21k, 42k, ultra), data, tempo objetivo e localização.
   - Botão principal: **"Continuar"** (avança para o fecho e resumo).
   - Botão secundário: **"Ainda não tenho prova marcada"** (avança para o fecho sem registar prova).
8. **Fecho (`fecho`):**
   - Resumo dinâmico completo: nome, cidade, foco, volume, número de memórias registadas e canais de alerta ativos.
   - Botão de ação primário: **"Combinar o meu plano"** ➔ Conclui o onboarding e abre o chat com a Carol para montar o plano.
   - Botão secundário: **"Ver o Início primeiro"** ➔ Abre o Início da app.
   - *Nota:* O botão para ver o tutorial da app foi eliminado deste ecrã, pois o tutorial já foi realizado antes do arranque (e continua disponível em Perfil · Carol).

---

## 5. Persistência de Dados e Robustez

- **Tabela `profiles`:** Atualizada com `training_city`, `resting_hr_bpm`, `carol_push_enabled`, `carol_welcome_enabled`, `water_reminder_enabled` através de `markOnboardingDone(perfil)`. O helper `safeProfileUpdate` tolera esquemas parciais sem quebrar o fluxo.
- **Tabela `coach_notes`:** As memórias adicionadas são inseridas com `source: 'atleta'` e a sua respetiva `category`. No arranque em modo reentry, notas já persistidas são preservadas sem duplicação.
- **Tabela `races`:** Criada ou atualizada automaticamente se o atleta configurou prova no passo 6.

