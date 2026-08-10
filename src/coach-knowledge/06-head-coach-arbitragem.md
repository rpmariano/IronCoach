# Bloco 6 — Head Coach: arbitragem e comunicação

> Fonte: [specs/coach-investigacao.md](../../specs/coach-investigacao.md), secção "Bloco 6 — Head Coach: arbitragem e comunicação (registo)".
> Este ficheiro é gerado a partir das respostas já registadas e verificadas nessa investigação — não reabre nem reavalia as decisões, só as torna consultáveis por pergunta.

Cinco perguntas, fontes canónicas (Fitzgerald, Burke, ACSM, IOC REDs CAT,
Meeusen, Magill & Anderson, Wulf, NSCA, Daniels, Blagrove, Issurin,
Verkhoshansky & Siff, Bompa), confiança ALTA em todas.

**Este bloco vinha marcado no questionário como "parcialmente de produto, não
de literatura pura" — e essa reserva revelou-se desnecessária.** As cinco
perguntas voltaram com fontes canónicas e números concretos, incluindo as de
comunicação, que assentam em literatura de aprendizagem motora (Magill,
Wulf). Não é preciso decidir nada por intuição.

## Perguntas

### #1 — Conflito entre composição corporal e prova

```
Valor:     A preparação da prova tem prioridade de 100%. A partir de 21-28
           dias antes (pico + início do taper), o défice calórico
           voluntário vai a ZERO — ingestão na manutenção, com
           disponibilidade energética ≥45 kcal/kg FFM/dia.
Condições: Só para provas A. Provas B/C não acionam esta regra.
Fonte:     Racing Weight (Fitzgerald, 2012); Clinical Sports Nutrition 6th
           Ed (Burke, 2021); ACSM Position Stand (2016)
Confiança: ALTA
```

✅ **Totalmente implementável, e liga peças já existentes.** A data e a
prioridade da prova estão em `race_events` (`date`, `race_priority` — este
último acrescentado entretanto). O limiar de 21-28 dias é um gatilho
proativo direto. Confirma o que Nutrição 4.1 #5 já dizia ("défice a zero em
fases de pico"), agora com o número de dias explícito.

### #2 — Hierarquia de alarmes

```
Valor:     Cinco condições, por gravidade decrescente:
           G1 (risco vital): dor torácica em esforço, síncope/pré-síncope,
              palpitações/arritmia, FCR +≥15 bpm com tonturas → urgência.
           G2 (lesão óssea de stress): dor óssea focal ao carregar peso
              (EVA ≥4-5/10), tíbia/fémur/metatarsos → parar impacto,
              ortopedia.
           G3 (RED-S grave): EA <30 kcal/kg FFM/dia crónica, perda
              involuntária >1,5%/semana, amenorreia >3 meses, EAT-26
              positivo → suspender alta intensidade, intervenção
              multidisciplinar.
           G4 (sobretreino não funcional): queda de desempenho ≥14-21 dias
              + HRV suprimida (>2 DP por ≥5-7 dias) + perturbação de sono/
              humor → suspender plano, repouso.
           G5 (lesão músculo-tendinosa): dor EVA ≥4/10 que altera a
              passada → suspender até EVA ≤2/10.
Condições: Prevalece sobre qualquer plano de treino ativo.
Fonte:     IOC RED-S Clinical Assessment Tool v2 (REDs CAT, 2023);
           ECSS/ACSM Consensus on overtraining (Meeusen, 2013); ACSM
           Guidelines (2021)
Confiança: ALTA
```

⚠️ **Implementável em ~2 de 5 — e por boas razões.** G1 (sintomas
cardíacos), G2 e G5 (dor com escala EVA) dependem de sintomas que o atleta
teria de reportar; não há campo, e criar um formulário de sintomas é uma
decisão de produto com implicações sérias (a app passaria a parecer um
instrumento clínico). G3 é parcialmente detetável — perda de peso >1,5%/
semana e EA estimada, com as reservas já registadas em Nutrição 4.2 #1. G4
depende de HRV, que não capturamos.

**Nota importante para a doutrina**: mesmo o que não é detetável deve estar
escrito. O coach não consegue *detetar* dor torácica, mas se o atleta a
mencionar no chat, a doutrina tem de o mandar parar e procurar ajuda médica
— nunca continuar a otimizar o treino. É exatamente para isto que a
hierarquia serve.

### #3 — Quantidade de informação e vocabulário, por nível

```
Iniciante: 1-2 recomendações/semana. Profundidade nula (estágio cognitivo).
           Só sensação de esforço ("ritmo de conversa"), sem acrónimos —
           nada de VDOT, VO2máx, rMSSD, RIR.
Básico:    2-3/semana. Profundidade baixa-moderada (estágio associativo).
           Conceitos funcionais: zonas Z1-Z3, pace min/km, séries e
           repetições, proteína/hidratos.
Médio:     3-4/microciclo. Justificações fisiológicas: limiar anaeróbico,
           regra 80/20, rácio de carga. Termos: RPE Borg, RIR, tapering,
           g/kg de macros.
Avançado:  4-5+/microciclo, análise multi-métrica. Terminologia científica
           completa: VDOT, HRV/rMSSD, GCT balance, ACWR, EA em kcal/kg FFM.
Fonte:     Motor Learning and Control 11th Ed (Magill & Anderson, 2017);
           Attentional focus and motor learning (Wulf, 2013); NSCA
           Essentials 4th Ed (Baechle & Earle, 2016)
Confiança: ALTA
```

✅ **A resposta mais diretamente aplicável de todo o questionário.** Não
precisa de dados nenhuns além de `experience_level`, que já existe nas duas
variantes (perfil e por prova). Traduz-se quase literalmente em regras de
`_comum.md`: quantas recomendações por resposta, que vocabulário é permitido,
que acrónimos estão proibidos a cada nível.

### #4 — Temas contraindicados por nível

```
Iniciante: peso de prova/restrição calórica; métricas avançadas (oscilação
           vertical, watts, HRV, deriva cardíaca, GCT); alta intensidade
           anaeróbica (Z5, intervalos de VO2máx); pliometria de impacto;
           treino em jejum ou depleção de hidratos; contagem minuciosa de
           calorias/macros.
Básico:    maratona/ultra sem base em 10k/21k; força até à falha (RIR 0);
           taper prolongado de 3 semanas; suplementação complexa
           (bicarbonato, nitratos) antes da dieta base consolidada;
           sessões duplas no mesmo dia.
Médio:     volume sem semanas de descarga (deload a cada 3-4 semanas);
           défice calórico na fase de pico; copiar planos de elite
           (>100 km/semana).
Avançado:  alterações não testadas de nutrição/equipamento nas 48-72h
           pré-prova; ignorar sinais biométricos persistentes (HRV baixa,
           FCR alta) para cumprir a prescrição; eliminar por completo o
           treino de força no período competitivo.
Fonte:     Racing Weight (Fitzgerald, 2012); IOC RED-S Consensus
           (2018/2023); Daniels' Running Formula 4th Ed (2021); Strength
           and Conditioning for Endurance Running (Blagrove, 2015)
Confiança: ALTA
```

✅ **Vira lista de exclusão direta na doutrina.** Cruza com o que já estava
registado noutros blocos e confirma-o: "peso de prova" contraindicado a
iniciante (= Bloco 5 #7), força até à falha (= Ginásio #11), maratona sem
base (= Bloco 1 #5), défice em fase de pico (= Nutrição 4.1 #5 e Bloco 6 #1).
Não há contradições — é a mesma doutrina vista do ângulo da comunicação.

### #5 — Frequência de ajuste do plano

```
Valor:     Ajuste programado a cada 7-14 dias, no fim de cada microciclo.
           Micro-ajustes reativos só com sinal claro: dor EVA ≥4/10, FCR
           +≥5 bpm por 2 dias, HRV baixa, ou mudança imprevista de agenda.
           Ajustar demais PREJUDICA: adaptações estruturais e enzimáticas
           (biogénese mitocondrial, densidade capilar, remodelação de
           tendões, síntese de hemoglobina) exigem estímulo consistente
           por 14-21 dias. Mudar a cada 2-3 dias introduz "ruído de
           adaptação", impede supercompensação, gera stress psicológico e
           invalida a avaliação de causa-efeito.
Fonte:     Block Periodization (Issurin, 2008); Daniels' Running Formula
           4th Ed (2021); Supertraining (Verkhoshansky & Siff, 2009);
           Periodization 6th Ed (Bompa, 2015)
Confiança: ALTA
```

✅ **Valida por acaso o desenho do plano de treino.** A spec
`plano-de-treino.md` assumiu planos semanais sem justificação fisiológica —
era intuição de produto. Esta resposta confirma que 7-14 dias é exatamente a
janela certa, e explica porquê. O que a spec **não** tem, e devia passar a
ter: a regra de não substituir um plano ativo sem sinal claro. A instrução
do `coach-chat` já diz ao modelo para não propor por cima de um plano
pendente sem o utilizador pedir — o que se revela alinhado com a literatura,
por sorte mais do que por desenho.

---

## 🏁 Investigação completa

