# Ajuda: perguntas frequentes

> Texto para uma página de ajuda (proposta: Perfil › Carol › "Ajuda", ou um
> link "Como funciona?" no fundo do FirstDayCard). Escrito na voz da app, não
> da Carol. **Antes de publicar, confirmar cada resposta na app**: foi escrito
> a partir do código em 2026-09-27.

## Começar

### Por onde começo?
Marca a tua próxima prova e regista as corridas que fizeres. Com uma prova e duas semanas de registos, a Carol monta um plano até ao dia da prova e diz-te como estás. No Início tens a lista "O que falta para começar".

### Ainda não tenho prova marcada. A app serve-me?
Serve. Diz à Carol o que queres (correr mais rápido, manter-te saudável, voltar depois de uma pausa) e ela trabalha a partir daí. Quando marcares uma prova, o plano passa a ter fases até ao dia.

### Posso repetir as perguntas do início?
Sim: Perfil › Carol › "Rever o arranque com a Carol". As respostas que já deste aparecem preenchidas.

## Registar

### Como registo uma corrida, refeição ou treino?
No botão **+** ao centro, em baixo. Tens: nova prova, refeição, avaliação corporal, corrida, treino de ginásio e água.

### Tenho de escrever tudo o que como?
Não. Em "Registar refeição" podes tirar uma foto ao prato e a app estima os valores.

### E o peso e a composição corporal?
Em **+ › Nova avaliação**. Podes escrever os valores ou enviar um print da tua balança inteligente (por exemplo, a Renpho). O peso do Perfil atualiza-se sozinho a partir da avaliação mais recente.

### Registei uma coisa no dia errado.
Abre o **Calendário** (ícone no topo), toca no dia e abre o registo para o editar.

## Perceber os números

### Porque é que a prontidão está tão baixa?
Nas primeiras duas semanas a prontidão ainda não tem registos suficientes, e o que falta conta como zero. Não quer dizer que estejas mal preparado. Continua a registar e o número passa a fazer sentido.

### O que é o RPE? E o ACWR, o VDOT, o D+?
Toca no **(i)** ao lado de cada um. Em resumo:
- **RPE**: quão duro te pareceu o treino, de 1 a 10.
- **ACWR**: os km desta semana comparados com as últimas quatro. Entre 0,8 e 1,3 é seguro.
- **VDOT**: um número que resume a tua forma aeróbica, a partir dos tempos das corridas.
- **D+**: a soma das subidas de um percurso, em metros.

## A Carol

### Quem é a Carol?
A treinadora da app. Vê o que registas, propõe-te planos e metas (que aceitas ou recusas) e responde às tuas perguntas no separador **Carol**.

### A Carol lembra-se do que lhe digo?
Lembra-se do que for importante: está em Perfil › Carol › "Memória da Carol". Podes corrigir, apagar ou acrescentar factos.

### Tenho restrições alimentares.
Perfil › Carol › "Restrições Alimentares". A Carol trata-as como regra absoluta.

## Conta

### Esqueci-me da palavra-passe.
*(Depende de a proposta em `auth-login.jsx` estar integrada.)* No ecrã de entrada, toca em "Esqueci-me da palavra-passe" e segue o link que recebes por email.

### Como saio da conta?
Perfil › Pessoal, no fundo: "Terminar sessão".

---

## Notas para o demo (não publicar)

Se o modo demo passar a ser a porta de entrada para visitantes, os dados de `buildDemoData` (App.jsx:268-374) têm de contar **uma** história:

- Hoje a boas-vindas da Carol diz "Amanhã é dia de prova · Corrida do Tejo · Noturna", o Início diz "Prova · São Silvestre de Lisboa" hoje, e há ainda o Trail dos Moinhos por registar. São três provas em três dias, e a Carol pede o registo de uma prova "de hoje" que ainda não aconteceu.
- Proposta: **uma** prova próxima (daqui a ~5 semanas, 10 km, com objetivo), **uma** prova passada já registada (para a Vitrina e o Palmarés não estarem vazios) e 3 semanas de corridas, refeições e uma avaliação. Assim a prontidão sai do estado "a calibrar" e o visitante vê a app a funcionar.
- `is_admin: false` para visitantes (ver `auth-login.jsx` › 5).
