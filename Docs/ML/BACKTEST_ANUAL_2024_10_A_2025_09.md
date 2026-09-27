# Backtest anual do potencial eólico agregado

**Execução:** 27 de setembro de 2026  
**Janela:** outubro de 2024 a setembro de 2025  
**Estado:** exploratório; não homologado e fora do `Predictor`

## Pergunta respondida

O candidato congelado — LightGBM residual treinado em agosto de 2024 e
calibração escalar `1,03` aprendida em setembro — mantém desempenho útil durante
12 meses completos, sem retreino ou seleção de parâmetros no período anual?

Para o produto, a métrica primária agrega todas as usinas por hora: cada cenário
do usuário e cada PWF representam um instante da rede. Métricas por usina-hora
são secundárias, mas necessárias para avaliar a qualidade espacial das injeções.

## Separação e cobertura

- 12 meses contíguos e posteriores ao treino/adaptação;
- 8.760 estados horários da rede;
- 1.149.341 pares usina-hora fisicamente válidos;
- 142 conjuntos distintos ao longo do ano;
- 100% de associação ONS--ERA5 em cada mês;
- 0 fallback DML por conjunto desconhecido;
- 88.512 linhas com referência acima de capacidade × disponibilidade foram
  mantidas no resultado principal, nunca filtradas pelo target;
- nenhum ajuste, refit ou seleção foi feito com os 12 meses.

O candidato foi carregado para o anual depois de ser comparado nos checkpoints
de janeiro/abril de 2026. Portanto, esta é uma avaliação retrospectiva anual,
não um teste final prospectivo completamente cego.

## Resultado agregado por hora da rede

| Modelo | WAPE | Erro total anual | MAE horário | RMSE horário | P95 erro absoluto | R² horário |
|---|---:|---:|---:|---:|---:|---:|
| Curva física | 59,41% | -59,41% | 6.824 MW | 7.146 MW | 10.047 MW | -2,145 |
| LightGBM agosto | 11,07% | -5,65% | 1.271 MW | 1.592 MW | 3.079 MW | 0,844 |
| DML agosto | 18,58% | -17,90% | 2.134 MW | 2.518 MW | 4.597 MW | 0,610 |
| **LightGBM + fator 1,03** | **10,25%** | **-2,91%** | **1.178 MW** | **1.475 MW** | **2.806 MW** | **0,866** |

A ONS somou 100.633.084 MWh de potência de referência horária; o candidato
estimou 97.707.190 MWh, diferença assinada de -2.925.894 MWh. Como cada registro
é horário, a soma em MW equivale à energia em MWh na janela.

A calibração reduziu o WAPE em 0,81 ponto percentual contra o LightGBM sem
calibração, ganho relativo de 7,36%. O bootstrap pareado por dia UTC, com 2.000
reamostragens, produziu IC95% de 0,64 a 0,98 p.p.; o ganho é estatisticamente
sustentado. Contra o DML, a redução relativa de WAPE foi 44,82%; contra a curva
física, 82,74%.

## Métricas ligadas ao uso do PWF

- proximidade `1 - WAPE`, apenas como tradução para pitch: **89,75%**;
- erro percentual absoluto mediano do total horário: **9,06%**;
- 54,50% das horas ficaram a até 10% da referência;
- 74,12% ficaram a até 15%;
- 85,51% ficaram a até 20%;
- correlação horária com a referência: **0,936**;
- pico real agregado: 20.782 MW;
- estimativa no instante do pico real: 18.255 MW, erro de **-12,16%**;
- o horário do maior pico previsto não coincidiu com o pico real.

Essas métricas representam a qualidade do montante total inserido no caso de
rede. Elas não afirmam convergência elétrica; isso exige executar o PWF no
ANAREDE.

## Qualidade espacial das injeções

No nível usina-hora, o candidato teve:

- WAPE: **34,60%**;
- MAE: **30,29 MW** por usina-hora;
- RMSE: **49,00 MW**;
- P95 do erro absoluto: **98,42 MW**.

A calibração melhora o balanço agregado, mas praticamente não melhora o WAPE
por usina em relação ao LightGBM original (34,55%). Assim, o resultado sustenta
melhor a previsão do total eólico da rede do que a distribuição perfeita entre
barras. Para análises locacionais, essas métricas devem permanecer visíveis.

## Estabilidade mensal

| Mês | Fórmula | LightGBM | DML | LightGBM × 1,03 | Erro total do escolhido |
|---|---:|---:|---:|---:|---:|
| 2024-10 | 51,70% | 7,86% | 13,51% | 8,40% | +3,46% |
| 2024-11 | 51,68% | 9,32% | 15,19% | 10,14% | +4,98% |
| 2024-12 | 62,06% | 10,01% | 21,04% | 10,90% | +4,40% |
| 2025-01 | 71,95% | 16,45% | 25,68% | 17,37% | +5,94% |
| 2025-02 | 72,12% | 15,72% | 32,54% | 13,89% | -12,09% |
| 2025-03 | 71,38% | 11,63% | 27,84% | 10,66% | -4,15% |
| 2025-04 | 71,44% | 13,04% | 28,77% | 12,68% | -0,36% |
| 2025-05 | 61,60% | 7,95% | 15,50% | 7,62% | +0,39% |
| 2025-06 | 60,25% | 8,69% | 12,88% | 7,22% | -3,75% |
| 2025-07 | 55,94% | 11,92% | 12,68% | 10,30% | -7,00% |
| 2025-08 | 52,26% | 11,64% | 13,26% | 9,75% | -8,33% |
| 2025-09 | 47,98% | 11,71% | 16,36% | 9,33% | -9,07% |

O candidato calibrado venceu o LightGBM original em 8 de 12 meses. O melhor mês
foi junho de 2025, com WAPE de 7,22%; o pior foi janeiro, com 17,37%. A mediana
mensal foi 10,22%. Outubro a janeiro mostram que um único fator global não
melhora todas as estações, embora melhore o ano completo.

## Formulação segura para o pitch

> Em um backtest histórico de 12 meses, cobrindo 8.760 estados horários e mais
> de 1,1 milhão de observações usina-hora com associação ONS--ERA5 completa, o
> modelo experimental reproduziu o potencial eólico agregado da rede com WAPE
> de 10,25%, correlação de 0,936 e diferença total anual de -2,91%.

Isso é **evidência técnica do protótipo**, não tração comercial ou desempenho do
produto em produção. O `Predictor` servido atualmente continua usando a curva
física. Também não se deve dizer que o número mede previsão meteorológica
futura: o experimento usa reanálise ERA5 histórica.

## Artefatos

- `artifacts/causal/annual-backtest-2024-10_2025-09/annual_report.json`;
- `artifacts/causal/annual-backtest-2024-10_2025-09/traction_summary.json`;
- `artifacts/causal/annual-backtest-2024-10_2025-09/annual_predictions.parquet`;
- `artifacts/causal/annual-backtest-2024-10_2025-09/annual_access_receipt.json`.

