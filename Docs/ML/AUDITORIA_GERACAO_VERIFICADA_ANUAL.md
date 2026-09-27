# Auditoria contrafactual contra a geração verificada da ONS

**Execução:** 27 de setembro de 2026
**Janela:** outubro de 2024 a setembro de 2025
**Estado:** análise exploratória; não é uma nova validação do target científico

## Pergunta respondida

Como as previsões anuais já congeladas se comportariam se fossem interpretadas
como previsão da geração efetivamente entregue e comparadas com
`geracao_verificada_mw` da ONS?

O exercício mantém exatamente as mesmas previsões do backtest anual, sem
retreino, recalibração ou escolha de modelo. Somente o valor usado para calcular
as métricas muda de potência de referência para geração verificada. Portanto,
os resultados abaixo são uma **auditoria contrafactual**, não a acurácia do
modelo para o objetivo em que ele foi treinado.

## Cobertura

- 12 meses contíguos;
- 8.760 estados horários da rede;
- 1.149.341 pares usina-hora;
- 142 conjuntos distintos;
- geração de referência e verificada presentes em 100% das linhas;
- correspondência `1:1` validada por mês, timestamp UTC e usina;
- referência dos snapshots idêntica ao target congelado do backtest.

## Resultado no total horário da rede

| Série tratada como previsão | Energia anual | WAPE | Diferença total | MAE horário | RMSE horário | P95 abs. | R² | Correlação |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Curva física | 40,852 TWh | 55,68% | -53,42% | 5.575 MW | 6.144 MW | 9.520 MW | -1,333 | 0,660 |
| **LightGBM agosto** | **94,950 TWh** | **17,48%** | **+8,26%** | **1.751 MW** | **2.560 MW** | **5.859 MW** | **0,595** | **0,801** |
| DML agosto | 82,621 TWh | 21,74% | -5,80% | 2.176 MW | 2.798 MW | 5.314 MW | 0,516 | 0,747 |
| LightGBM × 1,03 | 97,707 TWh | 17,97% | +11,40% | 1.799 MW | 2.687 MW | 6.212 MW | 0,554 | 0,801 |
| Referência ONS | 100,633 TWh | 20,27% | +14,74% | 2.030 MW | 3.256 MW | 7.770 MW | 0,345 | 0,740 |

A geração verificada no período somou **87,708 TWh**. A “diferença total” usa
essa energia como denominador; valores positivos indicam sobrestimação da
geração entregue. WAPE mede a soma dos erros absolutos horários e, por isso,
não permite que excessos e faltas se cancelem.

`1 - WAPE`, usado apenas como tradução simples de proximidade para o pitch, é
82,52% no LightGBM original, 82,03% no candidato calibrado e 78,26% no DML. O
termo não deve ser chamado de acurácia sem explicar sua definição.

## O que mudou em relação ao target correto

| Modelo | WAPE vs. referência | WAPE vs. verificada | Erro total vs. referência | Erro total vs. verificada |
|---|---:|---:|---:|---:|
| LightGBM agosto | 11,07% | 17,48% | -5,65% | +8,26% |
| DML agosto | 18,58% | 21,74% | -17,90% | -5,80% |
| LightGBM × 1,03 | **10,25%** | 17,97% | -2,91% | +11,40% |

A calibração `1,03` é coerente com o objetivo original: ela corrige parte da
subestimação da referência e reduz o WAPE de 11,07% para 10,25%. Quando a mesma
saída é comparada à geração entregue, que é menor no agregado, o fator aumenta
a sobrestimação e o LightGBM sem calibração passa a ter o menor WAPE. Isso não é
contradição nem motivo para trocar o candidato; os targets representam
perguntas diferentes.

## Distância entre referência e geração verificada

- referência ONS: **100,633 TWh**;
- geração verificada ONS: **87,708 TWh**;
- diferença: **12,925 TWh**, ou **12,84% da referência**;
- comparada à geração verificada, a referência ficou **14,74% acima** no total;
- o WAPE horário entre as duas séries foi **20,27%**;
- a referência ficou acima da verificada em 64,27% dos pares usina-hora e em
  65,59% das horas agregadas.

A diferença não pode ser rotulada integralmente como curtailment. Ela pode
conter restrições operativas, indisponibilidade, despacho, critérios de cálculo
da ONS e qualidade cadastral. Também houve referência abaixo da verificada em
35,51% dos pares usina-hora, reforçando que o campo não é um rótulo direto de
restrição.

## Estabilidade mensal no total da rede

Cada célula mostra `WAPE / diferença total` contra a geração verificada.

| Mês | LightGBM | DML | LightGBM × 1,03 | Referência ONS |
|---|---:|---:|---:|---:|
| 2024-10 | 12,58% / +1,20% | 17,78% / -12,46% | 12,26% / +4,04% | 13,98% / +0,56% |
| 2024-11 | 13,15% / -0,46% | 20,41% / -16,77% | 12,57% / +2,36% | 13,11% / -2,50% |
| 2024-12 | 13,73% / +1,21% | 24,61% / -21,00% | 13,50% / +4,17% | 13,92% / -0,22% |
| 2025-01 | 19,32% / +7,24% | 26,97% / -21,55% | 20,13% / +10,41% | 13,98% / +4,22% |
| 2025-02 | 22,73% / +16,79% | 21,23% / -7,69% | 24,59% / +20,21% | 37,24% / +36,74% |
| 2025-03 | 12,77% / +5,99% | 20,98% / -17,48% | 13,99% / +9,13% | 14,18% / +13,86% |
| 2025-04 | 15,68% / +5,48% | 26,16% / -22,00% | 16,10% / +8,61% | 12,15% / +9,01% |
| 2025-05 | 16,66% / +10,72% | 19,00% / -2,92% | 18,02% / +13,98% | 17,76% / +13,54% |
| 2025-06 | 15,98% / +7,78% | 18,79% / +1,90% | 16,43% / +10,94% | 17,44% / +15,26% |
| 2025-07 | 19,24% / +9,90% | 20,30% / +9,06% | 19,34% / +13,11% | 22,90% / +21,63% |
| 2025-08 | 23,69% / +14,68% | 24,37% / +12,12% | 23,94% / +17,98% | 29,71% / +28,70% |
| 2025-09 | 24,64% / +18,45% | 23,97% / +12,05% | 25,75% / +21,82% | 34,23% / +33,97% |

O LightGBM calibrado melhora o WAPE contra a verificada apenas nos três
primeiros meses. De janeiro em diante, o LightGBM original é melhor na maioria
dos meses; em fevereiro e setembro, o DML é o melhor dos três modelos. O aumento
do descolamento entre referência e verificada no fim da janela é um insight
operacional que merece segmentação futura por região, causa de restrição e
estado da rede, mas ainda não permite atribuição causal.

## Qualidade espacial

No nível usina-hora, o WAPE foi 44,53% no LightGBM, 43,83% no DML e 45,30% no
LightGBM calibrado; os MAEs foram, respectivamente, 33,98 MW, 33,45 MW e
34,57 MW. A própria referência ONS, comparada à verificada, teve WAPE de 31,84%
e MAE de 24,30 MW.

Isso reforça a conclusão do backtest principal: a evidência é mais forte para o
montante agregado da rede do que para a distribuição perfeita das injeções por
usina e barra.

## Insight útil para o produto e para o pitch

O modelo de referência e a geração verificada podem ser apresentados como duas
camadas distintas do estudo:

1. **potencial climático sem limitação**, que é o target atual do modelo;
2. **geração historicamente entregue**, observada pela ONS.

No período, o potencial de referência ficou 12,925 TWh acima do entregue. O
modelo calibrado capturou o potencial com WAPE de 10,25%, mas, se interpretado
como geração entregue, teria WAPE de 17,97% e excesso anual de 11,40%. Essa
distância quantifica o valor potencial de uma futura camada operacional, sem
afirmar que o modelo atual prevê curtailment.

Formulação segura:

> No mesmo backtest de 12 meses, a estimativa de potencial eólico apresentou
> WAPE de 10,25% contra a referência ONS. Em uma auditoria separada contra a
> geração efetivamente entregue, sem qualquer retreino, o LightGBM original
> apresentou WAPE de 17,48% e diferença anual de +8,26%. A distância de 12,925
> TWh entre referência e geração verificada evidencia uma camada operacional
> relevante para a evolução futura do produto.

Não dizer que o modelo prevê geração entregue, restrição ou curtailment. Também
não dizer que superar numericamente a referência ONS contra o realizado prova
um modelo melhor: a subestimação do potencial pode compensar acidentalmente o
descolamento operacional.

## Artefatos reproduzíveis

- `artifacts/causal/verified-generation-audit-2024-10_2025-09/verified_audit_report.json`;
- `artifacts/causal/verified-generation-audit-2024-10_2025-09/verified_audit_summary.json`;
- `artifacts/causal/verified-generation-audit-2024-10_2025-09/verified_audit_predictions.parquet`;
- `artifacts/causal/verified-generation-audit-2024-10_2025-09/verified_audit_access_receipt.json`.
