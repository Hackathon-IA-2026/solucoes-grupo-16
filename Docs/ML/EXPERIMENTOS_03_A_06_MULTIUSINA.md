# Experimentos 3 a 6: piloto multiusina de agosto de 2024

## Dados usados

O alvo é `geracao_referencia_mw` da base de restrição eólica da ONS: **uma
estimativa ONS de geração sem limitação**, não uma medição direta do potencial
físico. O vento vem do ERA5. A disponibilidade é a fração calculada a partir
da disponibilidade eletromecânica ONS e da capacidade do catálogo.

O snapshot unido continha 108.518 linhas de 147 conjuntos em 744 horas locais.
Para este piloto, excluímos explicitamente 17.709 linhas nas quais a referência
superava a disponibilidade em MW; 109 delas também superavam a capacidade
instalada. Não houve clipping nem preenchimento artificial. O recorte de treino
ficou com **90.809 linhas, 144 conjuntos e 744 horas**. Três conjuntos ficaram
sem linhas elegíveis. A cobertura é 84,76% dos pares conjunto–hora possíveis
para esses 144 conjuntos. O arquivo usado foi
`backend/ai-service/data/processed/training/pilot_2024_08_fit.parquet` e a
contagem das exclusões está em `pilot_2024_08_fit_report.json` ao lado dele.

Todos os experimentos usaram o mesmo recorte, curva física e separação
cronológica: treino de 1 a 22 de agosto (63.618 linhas), validação de 22 a 27
de agosto (13.754) e teste de 27 de agosto a 31 de agosto no horário local
(13.437). Os hiperparâmetros foram escolhidos pela validação; o teste foi
consultado apenas depois das quatro rodadas. A curva física teve MAE de
49,77 MW na validação e 51,03 MW no teste.

## Rodadas

Os demais parâmetros LightGBM permaneceram iguais: `learning_rate=0.04`,
`n_estimators=2500`, `subsample=0.8` e `colsample_bytree=0.8`. Early stopping
usou somente a validação.

| Experimento | Alteração em relação ao anterior | `num_leaves` | `min_child_samples` | `reg_lambda` | Melhor iteração | MAE validação (MW) | MAE teste (MW) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 3 | Configuração inicial | 31 | 100 | 5 | 358 | 20,776 | 23,632 |
| 4 | Menos folhas | 15 | 100 | 5 | 893 | 20,941 | 24,033 |
| 5 | Volta a 31 folhas; menos amostras por folha | 31 | 50 | 5 | 366 | 20,770 | 23,711 |
| 6 | Mais regularização | 31 | 50 | 10 | 435 | 20,886 | 23,980 |

O experimento 5 venceu na validação por apenas **0,006 MW** contra o 3, enquanto
o 3 teve o menor erro no teste. A diferença é pequena para declarar um conjunto
de hiperparâmetros superior. Os quatro modelos venceram a curva física no teste,
mas isso é uma aprovação **experimental** do código, não autorização para usar o
artefato na API nem validação de potencial para produção. A cobertura do
intervalo empírico no teste ficou perto de 85%, abaixo dos 90% nominais entre
os percentis 5 e 95.

## Decisão e próximos passos

Manter os parâmetros padrão do código e o modelo atualmente servido sem
alteração. Os JSONs `training/experimento-multiusina-03.json` até `-06.json`
guardam cada configuração; o treino **não atualiza automaticamente** os
parâmetros fixos nem publica o vencedor. O experimento 3 é a referência
provisória deste piloto: foi mais conservador que o 5 e teve o menor MAE no
teste, mas essa observação não deve ser usada para ajustar novas rodadas neste
mesmo teste.

Antes de escolher parâmetros gerais, revisar com especialista a semântica de
`geracao_referencia_mw`, as exclusões por disponibilidade, os três conjuntos
sem linhas elegíveis e o conjunto com localização pendente. Depois, coletar
vários meses e comparar candidatos em validações temporais sucessivas,
reservando um período final que ainda não participou das decisões. Validar
também por conjunto, faixa de vento, cobertura de intervalos e disponibilidade
que o usuário consegue informar no cenário da fase 2.

Os comandos usados, a partir de `backend/ai-service`, seguiram este padrão:

```powershell
.\.venv\Scripts\python.exe -m training.train --input data/processed/training/pilot_2024_08_fit.parquet --config training/experimento-multiusina-03.json --processed data/processed/training/pilot_2024_08_hourly.parquet --artifacts artifacts/experiments/multiusina-exp-003
.\.venv\Scripts\python.exe -m training.evaluate --input data/processed/training/pilot_2024_08_fit.parquet --target geracao_referencia_mw --artifacts artifacts/experiments/multiusina-exp-003
```

Os mesmos comandos foram executados para `04`/`004`, `05`/`005` e `06`/`006`.
Cada diretório de artefato contém `metadata.json`, `validation_report.json`,
`evaluation_report.json`, `model.txt` e `residual_quantiles.json`.
