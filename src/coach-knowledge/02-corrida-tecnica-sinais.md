# Bloco 2.4 — Corrida: técnica e sinais de alerta

> Fonte: [specs/coach-investigacao.md](../../specs/coach-investigacao.md), secção "Corrida 2.4 — Técnica e sinais de alerta (registo)".
> Este ficheiro é gerado a partir das respostas já registadas e verificadas nessa investigação — não reabre nem reavalia as decisões, só as torna consultáveis por pergunta.

Duas perguntas, confiança ALTA nas duas. **Fecha o Bloco 2 (Corrida) por
completo.** Mas é o registo com maior distância entre o que a literatura sabe
e o que a app consegue medir — ver avaliação de implementabilidade abaixo.

## Perguntas

### #1 — Cadência: faixa-alvo ou individual?

```
Pergunta:  Corrida 2.4 #1 — existe faixa defensável ou é individual?
Valor:     INDIVIDUAL — depende de estatura/comprimento dos membros, massa
           corporal, velocidade e nível de treino. O mito dos "180 spm para
           todos" é rejeitado pela biomecânica moderna.
           MAS existem dois números defensáveis:
           - Faixa fisiológica funcional: 160-180 spm em ritmo aeróbico.
           - Sinal vermelho: cadência cronicamente <155 spm associa-se a
             sobrepassada (overstriding) e a +15-20% de força de impacto
             no joelho e anca.
           Correção, quando indicada: aumentar +5-10% sobre a cadência
           autosselecionada do próprio corredor — nunca impor um valor
           absoluto.
Condições: Para corrida contínua aeróbica (Z1-Z3). A cadência sobe
           naturalmente com a velocidade — 180-200+ spm em ritmos de Z4/Z5
           é normal, não é sinal de nada.
Fonte:     Effects of Step Rate Manipulation on Foot Strike Mechanics
           (Heiderscheit, MSSE 2011); Daniels' Running Formula 4th Ed
           (2021); Is There a Pathomechanical Association Between Running
           Kinematics and Lower Limb Injuries? (Bramah, AJSM 2018);
           Influence of step rate in biomechanics of running (Schubert, 2014)
Confiança: ALTA
```

**Resolve a pergunta original de forma acionável.** A pergunta era "existe
faixa alvo ou é individual — se for individual, dizê-lo para o coach não
recomendar um número universal". A resposta é as duas coisas: é individual
(logo, **nunca recomendar 180 spm**), mas o piso de 155 spm é um sinal real
e verificável. Implementável já: `runs.details.cadence_spm` existe.

**Regra de doutrina proposta**: comentar cadência apenas quando <155 spm
sustentado, e mesmo aí sugerir "+5-10% sobre a tua cadência atual", nunca um
valor absoluto. Fora disso, não comentar — é ruído.

### #2 — Sinais mensuráveis que precedem lesão por sobreuso

```
Pergunta:  Corrida 2.4 #2 — que sinais precedem lesão por sobreuso
Valor:     1. FC em repouso (FCR): +≥5-7 bpm acima da média móvel de 7-14
              dias, mantido ≥2-3 dias consecutivos.
           2. HRV (rMSSD): queda >1,5 desvios-padrão abaixo da média basal
              de 7 dias, ≥2-3 dias consecutivos.
           3. Degradação de cadência intra-sessão: queda >3-5% (ou >5 spm)
              entre a 1ª e a 2ª metade da mesma corrida, em plano, a ritmo
              e FC constantes.
           4. Deriva cardíaca / discrepância RPE-ritmo: FC +5-8% a ritmo
              constante, OU +≥2 pontos Borg CR10 para o mesmo pace, ≥2
              sessões consecutivas.
           5. Assimetria de tempo de contacto com o solo (GCT balance):
              desvio E/D >2,5-3,0% (pior que 51,5/48,5) em piso plano.
Condições: Em condições normais de saúde e temperatura. Alteração isolada
           num único dia (desidratação, álcool, jet lag, calor) NÃO
           confirma sobreuso.
Fonte:     ECSS/ACSM Consensus on overtraining (Meeusen, 2013); Training
           adaptation and heart rate variability in elite endurance
           athletes (Plews, 2013); Is There a Standardized Footstrike
           Pattern and Cadence for Optimal Running Economy? (Moore, Sports
           Med 2016); Monitoring training (Foster, 1998); Firstbeat/Garmin
           Biomechanical Metrics Standard (2023)
Confiança: ALTA
```

⚠️ **Avaliação de implementabilidade: 1 de 5 sinais é detetável hoje.**

| Sinal | Detetável? | Porquê |
|---|---|---|
| 1. FC em repouso | ❌ | Não capturamos FC de repouso em lado nenhum. **Mesma lacuna já identificada em 2.2 #4** (Karvonen precisa dela) — dois usos independentes a pedir o mesmo campo. |
| 2. HRV (rMSSD) | ❌ | Não capturado, e não aparece em prints de corrida — viria de app de wearable (Garmin Connect, Whoop), não de um screenshot de treino. |
| 3. Degradação de cadência intra-sessão | ❌ | Só temos `cadence_spm` **média** da corrida inteira. Os splits guardam apenas `distance_km` e `time_seconds` — sem cadência nem FC por troço, não dá para comparar 1ª vs. 2ª metade. |
| 4. Deriva cardíaca / RPE-ritmo | ⚠️ metade | A deriva cardíaca precisa de FC ao longo do tempo (só temos média) — **não detetável**. A parte RPE-vs-ritmo **é** detetável e já está registada em 2.2 #5, com os mesmos limiares. |
| 5. Assimetria GCT | ❌ | Não capturado. Métrica de relógio topo de gama, raramente visível num print. |

**Consequência para o produto**: a flag `risco_lesao` — que identifiquei como
"o alerta de maior valor para o utilizador" quando escrevi esta pergunta — é
hoje largamente **não implementável** como a literatura a descreve. O que
sobra é a metade RPE/ritmo (já coberta) e o piso de cadência de #1.

**Três caminhos possíveis, nenhum decidido aqui**:
1. **Aceitar a cobertura parcial** — implementar só o que dá (RPE/ritmo +
   cadência <155), e assumir que a deteção de lesão é fraca por agora.
2. **Capturar FC de repouso** — um campo no Perfil ou um registo diário
   rápido. Desbloqueia o sinal #1 *e* a fórmula de Karvonen (2.2 #4). É o
   melhor retorno por esforço dos três.
3. **Integração com wearable** (Garmin Connect/Strava API) em vez de prints
   — desbloquearia #2, #3 e #5 de uma vez, mas é um projeto próprio, muito
   maior do que acrescentar um campo.

