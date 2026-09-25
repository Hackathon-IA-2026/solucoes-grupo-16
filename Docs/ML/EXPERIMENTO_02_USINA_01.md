# Experimento 2 da usina 01: como executar e entender o resultado

> **Estado:** preparado, ainda não executado. Este é um experimento de pesquisa.
> O replay histórico do ClimaGrid usa geração observada da ONS e não depende
> deste modelo. Veja o [contexto do projeto](../CONTEXTO_PROJETO_IA.md).

## O que vamos testar?

O modelo combina uma curva física com o LightGBM. A curva faz uma primeira
estimativa da geração a partir do vento. O LightGBM tenta corrigir o erro dessa
estimativa usando os dados históricos.

No experimento 1, o LightGBM usou `min_child_samples: 100`. No experimento 2,
usará **`min_child_samples: 50`**. Esse número é a quantidade mínima de exemplos
exigida em uma folha de uma árvore. Reduzi-lo permite que o modelo aprenda
padrões mais específicos, mas também pode fazê-lo se ajustar demais aos dados
de treino. É uma hipótese a testar, não uma melhoria garantida.

O experimento 1 teve 252 horas na parte de treino. Manteremos a mesma usina,
os mesmos 15 dias, o mesmo arquivo de dados, o mesmo alvo de geração e a mesma
curva física. Assim, a mudança planejada entre os dois experimentos é somente
esse hiperparâmetro do LightGBM.

| Configuração | Experimento 1 | Experimento 2 |
| --- | --- | --- |
| Usina | `CJU_RNCAJ1` | `CJU_RNCAJ1` |
| Período | 15 dias, desde `2026-09-01T03:00:00Z` | Igual |
| Alvo | `geracao_referencia_mw` | Igual |
| Curva física | 3, 12 e 25 m/s | Igual |
| `min_child_samples` | 100 | **50** |

A configuração do segundo teste está em
[`training/experimento-usina-02.json`](../../backend/ai-service/training/experimento-usina-02.json).
O treino agora lê a seção `lightgbm` desse JSON. Os parâmetros efetivamente
usados ficam registrados em `metadata.json`, dentro de `lightgbm_params`.
Rodar o comando não altera automaticamente o JSON nem escolhe outros
hiperparâmetros. O único ajuste automático é o *early stopping*, que seleciona
quando parar de adicionar árvores com base na validação.

## Como executar

Abra o PowerShell e entre na pasta `backend/ai-service`. Confirme que o arquivo
`data/processed/training/snapshot_unido.parquet` está disponível. Execute:

```powershell
cd C:\Code\hackathon\solucoes-grupo-16\backend\ai-service

.\.venv\Scripts\python.exe -m training.train `
  --input data/processed/training/snapshot_unido.parquet `
  --config training/experimento-usina-02.json `
  --processed data/processed/training/usina-01-exp-002-hourly.parquet `
  --artifacts artifacts/experiments/usina-01-exp-002
```

Depois, faça a avaliação usando o **mesmo arquivo de entrada**:

```powershell
.\.venv\Scripts\python.exe -m training.evaluate `
  --input data/processed/training/snapshot_unido.parquet `
  --target geracao_referencia_mw `
  --artifacts artifacts/experiments/usina-01-exp-002
```

Use a pasta `exp-002` indicada nos comandos. O treino impede sobrescrever um
`model.txt` existente, preservando o resultado do experimento 1 em `exp-001`.

## Onde olhar o resultado

A pasta `artifacts/experiments/usina-01-exp-002` terá estes arquivos:

| Arquivo | Para que serve |
| --- | --- |
| `model.txt` | Modelo LightGBM treinado. |
| `metadata.json` | Configuração usada, melhor iteração, métricas e decisão `approved`. |
| `validation_report.json` | Cobertura dos dados, exclusões e avisos de qualidade. |
| `residual_quantiles.json` | Valores usados nos intervalos empíricos de incerteza. |
| `evaluation_report.json` | Métricas da reavaliação; aparece após rodar `training.evaluate`. |

Em `metadata.json`, confira `lightgbm_params.min_child_samples`: no experimento
2, ele deve ser **50**. Confira também `best_iteration` e estes dois valores:

- `metrics.baseline_test.overall.mae_mw`: erro médio da curva física, em MW;
- `metrics.hybrid_test.overall.mae_mw`: erro médio da curva física com a correção
  do LightGBM, em MW.

O experimento 1 obteve MAE de **73,77 MW** para a curva física e **72,30 MW**
para o híbrido no teste. Seu `best_iteration` foi **640**: isso é o número de
árvores selecionado pelo *early stopping*, não uma sugestão para mudar
`min_child_samples`. Preencha os números do experimento 2 somente depois de
executá-lo; hoje não há resultado para comparar.

`approved: true` significa apenas que, naquele teste, o MAE do híbrido foi
menor que o da curva física. Não significa que o modelo esteja validado para
produção. Se você testar muitas configurações olhando sempre o mesmo bloco de
teste, acabará escolhendo uma configuração ajustada a esse bloco. Para uma
busca maior de hiperparâmetros, use métricas de validação para escolher
candidatos e guarde um teste final que não participou dessa escolha.

## Antes de usar o modelo fora do experimento

O relatório do experimento 1 avisa que o significado do alvo
`geracao_referencia_mw` e os filtros aplicados aos dados ONS ainda precisam
ser confirmados com um especialista. A comparação entre dois modelos não
resolve essa dúvida sobre os dados. O período de 15 dias também é curto para
demonstrar desempenho em outras épocas do ano.
