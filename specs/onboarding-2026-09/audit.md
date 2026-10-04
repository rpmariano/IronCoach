# Auditoria de Onboarding: IronCoach (IronHealth)
**Data**: 2026-09-27
**URL**: http://localhost:3000 (login) e http://localhost:3000/?demo=true (app, 375×812)
**Método**: navegação no browser (login, criar conta, Início, Provas, Evolução, Carol, menu +, Perfil) + leitura do código (`src/`).

## Nota de primeira impressão
**3,5 / 5**: depois de entrar, um utilizador novo percebe em 30 segundos o que fazer (onboarding de 6 passos com a Carol + `FirstDayCard` no Início). Antes de entrar, não: o ecrã de login não diz o que a app é, não tem demo e não tem recuperação de palavra-passe.

### O que já está bem
- Onboarding guiado pela Carol, com 6 passos: quem és → objetivo → como corres → como comes → prova → fecho (`Onboarding/Onboarding.jsx`, `OnboardingSteps.jsx`). Nenhum campo é obrigatório, o rascunho é guardado entre recarregamentos e dá para repetir em Perfil › Carol.
- No primeiro dia, o Início mostra o `FirstDayCard` com o pedido adaptado ao objetivo escolhido (`utils/firstDay.js`).
- Os dashboards vazios usam `EmptyModuleState` com texto e CTA ("Registar corrida/treino/refeição/avaliação").
- O Perfil tem texto de ajuda excelente em quase todos os campos: data de nascimento, FC em repouso, nível como corredor, local de treino.
- O chat da Carol vazio tem 3 perguntas sugeridas.

## Estados vazios encontrados
| Página | Estado atual | Recomendação |
|---|---|---|
| Calendário (vista geral) | "Sem registos neste dia" numa caixa tracejada, sem CTA | Quando não há nenhum registo em lado nenhum: explicar o calendário + CTA "Registar o primeiro treino" |
| Calendários por módulo (Corrida/Ginásio/Nutrição/Corpo) | "Sem corridas neste dia." e semelhantes, sem CTA | CTA "Registar corrida neste dia", com a data preenchida |
| Evolução › Geral, pilares | "Sem dados" sem explicação; **Prontidão 18% "Baixa"** e barras a 0% quando só há 2 corridas | Com poucos dados, mostrar "Ainda a calibrar: faltam X registos" em vez de uma percentagem baixa, que parece um mau resultado |
| ACWR (KPI e gráfico) | "Sem dados" sem dizer quanto falta | "Preciso de 4 semanas de corridas: tens X" (a Carol já diz isto noutro sítio) |
| Ginásio › Aulas | Texto explicativo, sem CTA | Acrescentar "Registar aula" |
| Vitrina › Badges | "Aparecem aqui à medida que os ganhares." | Mostrar o badge mais próximo e o que falta (o "O que há para ganhar" já existe; ligar os dois) |
| Análise cruzada | Texto com instrução, sem botão | CTA para o registo em falta |
| Corpo | Refere "print da Renpho Health" sem contexto | "…ou um print da tua balança inteligente (ex.: Renpho)" |

## Orientação em falta
| Local | Falha | Prioridade |
|---|---|---|
| Login / Criar conta | Não diz o que a app faz nem para quem é; só o logótipo e "Entra na tua conta" | Alta |
| Login | Não há "Esqueci-me da palavra-passe" (`resetPasswordForEmail` não é usado em lado nenhum) | Alta |
| Criar conta | Não diz os requisitos da palavra-passe e não tem link para os termos/privacidade (é uma app de saúde) | Média |
| Início (depois do 1.º dia) | A checklist "O que falta para começar" (perfil, prova, 3 corridas, 1 semana de refeições) só existe em Evolução › Geral, que ninguém abre no início | Alta |
| Registo de corrida | "Nível de esforço (RPE, opcional)": escala 1–10 sem legenda (`RunRegistration.jsx:2054`); o do ginásio tem legenda | Média |
| Onboarding › como corres | `ExperienceLevelHelp` não é usado aqui, mas é usado no Perfil | Baixa |
| Ecrã inicial | Botão flutuante de bug + botão "!" com badge + FAB, que tapam conteúdo (cartão de nutrição, Perfil) | Média |

## Problemas de descoberta de funcionalidades
| Funcionalidade | Problema | Correção |
|---|---|---|
| Modo demo | Não há forma de lá chegar a partir do login; é um parâmetro de URL escondido | Link "Explorar sem conta" no login. **Antes disso, tirar `is_admin: true` do `DEMO_PROFILE` (`App.jsx:249`)**, senão os visitantes ficam com um perfil de admin (o toque duplo no logótipo abre o Admin) |
| Calculadora de ritmo | Ícone no cabeçalho sem rótulo visível | Dica contextual na primeira vez que se abre Provas |
| Admin | Só por toque duplo no logótipo | OK (intencional) |
| Ajuda em geral | Não há página de ajuda, FAQ nem glossário; os ~73 `title="…"` não aparecem em ecrãs táteis | Glossário curto (RPE, ACWR, VDOT, Prontidão, D+, Z1/Z2) acessível pelo (i) do `MetricInfo` |
| Jargão sem explicação | "ACWR Status", VDOT e Z1/Z2 no hub da prova, "Prontidão %" (só em `title`), D+, "Viabilidade Tática", "Disponibilidade Energética" nos pilares | Usar `MetricInfo` nestes sítios também |

## Observação à parte (dados de demo)
Os dados de demo contradizem-se: a boas-vindas da Carol diz "Amanhã é dia de prova · Corrida do Tejo", o Início diz "Prova · São Silvestre de Lisboa" hoje, e há ainda o Trail dos Moinhos por registar. Se o demo passar a ser porta de entrada para visitantes, estes dados têm de contar uma história coerente.

## Melhorias rápidas
1. **Login**: uma frase sobre o que a app faz ("A tua treinadora de corrida, nutrição e ginásio") + "Esqueci-me da palavra-passe".
2. **Levar a checklist "O que falta para começar" para o Início**, logo abaixo do `FirstDayCard`, e mantê-la até estar completa.
3. **Prontidão com poucos dados**: substituir "18% · Baixa" e as barras a 0% por um estado "a calibrar" com o que falta.
4. **Legenda do RPE no registo de corrida** (reutilizar a do ginásio) e `MetricInfo` em ACWR Status, VDOT e Prontidão.
5. **CTA nos calendários vazios**, com a data do dia preenchida.
