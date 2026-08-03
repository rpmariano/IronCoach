# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Corredores e atletas amadores sérios — pessoas que treinam para provas (corrida, ginásio) e querem métricas detalhadas do seu progresso, não apenas um registo casual. A app é pensada para outros utilizadores além do criador, não só para uso pessoal.

## Product Purpose

Nutrição e treino inteligente: permite registar refeições, treinos de ginásio, corridas e avaliações de composição corporal, com o mínimo de fricção possível, e obter orientação de um coach com acesso a todos esses dados.

## Positioning

Dois mecanismos igualmente centrais, não um só:

1. **Registo por foto + IA (Gemini)** — em vez de introdução manual, o utilizador tira/carrega um print (app de corrida tipo Strava/Garmin, print da Renpho Health para composição corporal, foto da refeição ou do painel do ginásio) e a IA lê e estima os dados.
2. **Tudo-num-só** — nutrição, ginásio, corrida, composição corporal e um coach de IA, todos na mesma app e com o coach a aceder aos dados de todos os módulos, em vez de ferramentas separadas (ex.: MyFitnessPal só para nutrição, Strava só para corrida).

## Operating Context

PWA instalável (Android/iOS), Supabase (Postgres + Edge Functions) como backend, API Gemini para leitura de prints/fotos, notificações push (Web Push) para lembretes de água. Módulos: Início (resumo), Nutrição (refeições + água), Ginásio (sessões, incl. aulas de grupo), Corpo (composição corporal), Corrida (registos + agenda de provas), Coach (chat com IA).

## Capabilities and Constraints

- Stack: React (Vite SPA), Tailwind CSS, Zustand para gestão de estado global, Lucide Icons, Chart.js, Supabase JS SDK.
- Design System: O módulo `design-system/` constitui a fonte única de verdade (Single Source of Truth) para a biblioteca de componentes React e tokens de UI da aplicação.
- Botões de Sistema & Ergonomia: Alvo tátil mínimo obrigatório de **44px × 44px**, superfícies neutras para botões de navegação/ações secundárias e botão flutuante (FAB) em Coral (`var(--accent)`).
- Registo assistido por IA em 4 módulos (refeições, corridas, avaliações corporais, sessões de ginásio), sempre com alternativa de introdução manual.
- Idioma da interface: português (pt-PT), sem alternativa de idioma implementada.
- Sem modo escuro — tema claro fixo.
- Em aberto / não decidido: se haverá suporte a outros idiomas, e se o público-alvo se manterá restrito a corredores/atletas ou alargará a um público mais generalista.

## Brand Commitments

- Nome "IronHealth" é definitivo.
- Paleta de marca (coral, dourado, verde) é definitiva.
- Logótipo atual (anel/espiral vermelho-coral com esfera escura) é definitivo — não reabrir a decisão de logo sem pedido explícito do utilizador.
- Tom de voz: energético e informal/direto — não clínico nem formal.
- Idioma da interface e das respostas do assistente: sempre português de Portugal (pt-PT).

## Evidence on Hand

Dados reais vêm do backend Supabase do próprio utilizador (sem dados de demonstração/testemunhos fictícios). Nenhum estudo de caso, imprensa ou testemunho existe — trabalho futuro não deve inventar nenhum.

## Product Principles

1. Minimizar fricção de registo — a foto/print é o caminho principal, a introdução manual é sempre a alternativa, nunca a única via.
2. Um sistema, não cinco apps — o coach e o resumo do Início devem refletir dados de todos os módulos, não tratar cada vertical como silo.
3. Métricas para quem treina a sério — preferir precisão e detalhe (splits, esforço, macros) a simplificação excessiva, já que o público-alvo já treina com objetivos concretos.
4. A marca (nome, paleta, logótipo) é estável — mudanças visuais futuras são refinamento, não substituição, salvo pedido explícito em contrário.

## Accessibility & Inclusion

Padrão certificado nesta auditoria: **WCAG 2.1 AA** (contraste de texto `#0f172a` > 7:1, foco de teclado visível, alvos de toque ≥44×44px em todos os elementos interativos, FAB 56×56px e atributos `aria-label` em botões de ícones). Simulações de experiência validadas para as personas *Mariana* (Corredora de Maratonas), *Tiago* (Ginásio & Recomposição Corporal) e *Coach André* (Assistente Virtual IA).
