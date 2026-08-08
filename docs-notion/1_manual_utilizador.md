# 📖 Manual do Utilizador — IronHealth v2

Este manual descreve todas as funcionalidades, fluxos de registo, fórmulas de cálculo e regras funcionais da aplicação **IronHealth v2**.

---

## 📋 Conteúdo
1. [Painel Inicial (Dashboard Home)](#1-painel-inicial-dashboard-home)
2. [Módulo de Nutrição & Hidratação](#2-módulo-de-nutrição--hidratação)
3. [Módulo de Ginásio (Treinos & Aulas)](#3-módulo-de-ginásio-treinos--aulas)
4. [Módulo de Composição Corporal (13 Métricas)](#4-módulo-de-composição-corporal-13-métricas)
5. [Módulo de Corrida & Agenda de Provas](#5-módulo-de-corrida--agenda-de-provas)
6. [Perfil, Definições & Salvaguardas](#6-perfil-definições--salvaguardas)

---

## 1. Painel Inicial (Dashboard Home)

O painel **Início** centraliza as estatísticas diárias e o progresso do atleta.

### 📊 Fórmulas de Cálculo e Cartões
1. **Consumo Calórico Diário**:
   Mostra o acumulado das calorias ingeridas hoje face à meta do perfil (`calorie_goal`).
   $$\text{Progresso Calórico (\%)} = \left( \frac{\sum \text{Calorias de hoje}}{\text{calorie\_goal}} \right) \times 100$$
2. **Progresso de Hidratação**:
   $$\text{Progresso de Água (\%)} = \left( \frac{\sum \text{Água de hoje (ml)}}{\text{water\_goal\_ml}} \right) \times 100$$
3. **Pace Médio (min/km)**:
   Calculado de forma dinâmica a partir da duração em segundos e distância total em km:
   $$\text{Pace Médio} = \frac{\text{Duração Total (segundos)}}{\text{Distância Total (km)} \times 60}$$
   *Se a corrida contiver splits específicos para distâncias de 5k, 10k ou 21k, é exibido o tempo do split real registado no relógio.*

### 🛠️ Layout Personalizável
O utilizador pode ordenar e ocultar os cartões de estatísticas (Peso, Gordura, Treinos, Kms de Corrida, Pace) através do campo `home_layout` no Perfil.

---

## 2. Módulo de Nutrição & Hidratação

O módulo de Nutrição gere a ingestão calórica diária e o balanço de macronutrientes.

### 🥗 Tipos de Refeição e Validações
* **Enum fixo de refeições (`meal_type`)**: `pequeno-almoco`, `lanche-manha`, `almoco`, `lanche`, `jantar`, `ceia`.
* **Gramagem opcional**: O utilizador pode omitir os gramas de um item. Nesses casos, o Coach estima a porção padrão (ex: "1 banana" ou "1 fatia de pão").
* **Registo por Foto/IA**: Upload de 1 a 6 fotos da refeição. A IA Gemini processa os itens, estima as quantidades e calcula a tabela nutricional.
* **Registo Manual**: O utilizador adiciona os nomes e pesos locais. O sistema faz uma chamada única ao Gemini para gerar a estimativa total, mantendo custos baixos.
* **Regra Nutricional por 100g**:
  A aplicação calcula no cliente a quantidade final baseando-se nos valores por 100g retornados pela IA:
  $$\text{Valor Consumido} = \frac{\text{Quantidade (g)}}{100} \times \text{Valor por 100g}$$

### 📅 Calendário Nutricional
* **Ponto Verde**: Metas cumpridas (Calorias, Gorduras e Hidratos não excedidos, e Proteína igual ou superior à meta).
* **Ponto Vermelho**: Metas falhadas (qualquer macro excedido ou proteína em falta).
* **Ponto Azul Claro**: Indica que a meta diária de hidratação (`water_goal_ml`) foi atingida no dia respetivo.

### 💧 Lembretes de Água (Web Push)
* **Periodicidade**: Notificações automáticas no browser/PWA de acordo com o intervalo escolhido (ex: a cada 120 minutos).
* **Fuso Horário de Lisboa**: A janela horária corre de acordo com o fuso local (por defeito 08:00 - 22:00).
* **Reset por Ingestão**: Beber água e registar na app atualiza o registo de atividade (`water_last_activity_at`), reiniciando a contagem de tempo para o próximo lembrete.
* **Controlo de Silêncio**: Botões de "Adiar Próximo" ou "Silenciar Hoje" (desativa as notificações até à meia-noite seguinte).

---

## 3. Módulo de Ginásio (Treinos & Aulas)

Suporta dois tipos de sessões físicas (`kind`):
1. **Treino de Força (`forca`)**: Musculação tradicional baseada em exercícios, séries e repetições. O volume semanal é calculado dinamicamente:
   $$\text{Volume da Sessão (kg)} = \sum_{i=1}^{n} (\text{Repetições}_i \times \text{Carga}_i)$$
2. **Aula de Grupo (`aula`)**: Cardio, HIIT, Pilates, RPM.
   * **Regra de Volume Zero**: Estas sessões não contêm séries ou kg. O sistema e a IA aceitam volume zero como correto e nunca marcam estas aulas como treinos em falta.

---

## 4. Módulo de Composição Corporal (13 Métricas)

Permite acompanhar a evolução biométrica a partir de prints da app **Renpho Health**.

### 📋 Os 13 Indicadores Corporais
A IA extrai e valida as seguintes métricas na base de dados:
* **Peso (`weight_kg`)**
* **IMC (`bmi`)**
* **Gordura Corporal % (`body_fat_pct`)**
* **Músculo Esquelético % (`skeletal_muscle_pct`)**
* **Massa Muscular kg (`muscle_mass_kg`)**
* **Água Corporal % (`body_water_pct`)**
* **Proteína % (`protein_pct`)**
* **Massa Óssea kg (`bone_mass_kg`)**
* **Metabolismo Basal (`bmr_kcal`)**
* **Gordura Visceral (`visceral_fat`)**
* **Gordura Subcutânea % (`subcutaneous_fat_pct`)**
* **Idade Metabólica (`metabolic_age`)**
* **Massa Magra kg (`lean_body_mass_kg`)**

---

## 5. Módulo de Corrida & Agenda de Provas

### 🏃 Registo de Corridas
* **Categorias de Treino (`training_type`)**: `continuo`, `longo`, `tempo`, `recuperacao`, `fartlek`, `intervalos`, `subidas`, `trail`, `tecnico`.
* **Esforço Percetível (RPE)**: Escala subjetiva de 1 a 10 reportada pelo atleta.

### 🏁 Agenda de Provas
* **Campos Obrigatórios**: Data, local, nome, tipo, distância (kms), tempo-alvo e ritmo-alvo.
* **Cálculos Dinâmicos**: A edição do campo Tempo-Alvo atualiza automaticamente o Ritmo-Alvo (pace) correspondente com base na distância escolhida, e vice-versa.
* **Fórmula de Conversão de Ritmo**:
  O pace é representado com um ponto decimal (ex: `5.20` representa 5 minutos e 20 segundos por quilómetro).
* **Desnível Trail (D+)**: O campo de desnível positivo acumulado só fica visível e disponível para edição se o tipo de prova for `trail`. Uma prova de `estrada` tem a check constraint na base de dados a forçar desnível nulo.

---

## 6. Perfil, Definições & Salvaguardas

### 👤 Dados do Perfil
* **Data de Nascimento (`birth_date`)**: Guardada como data fixa. A idade é sempre calculada em runtime para evitar desatualização cronológica e permitir o ajuste dinâmico de zonas de frequência cardíaca.
* **Nível Geral (`experience_level`)**: Iniciante, Básico, Médio ou Avançado.

### 🛡️ Salvaguarda contra Perda de Dados
* **NavGuard**: Qualquer alteração não guardada nos formulários do Perfil ou Provas ativa um alerta de navegação. Caso tente sair, o utilizador deve escolher entre **Gravar e Sair**, **Sair sem gravar** ou **Cancelar**.
* **Gravação Parcial**: O comando de atualização envia apenas os campos efetivamente alterados para a base de dados. Isto impede a substituição acidental de dados voláteis controlados pelo servidor (como os contadores e carimbos de atividade de hidratação).
