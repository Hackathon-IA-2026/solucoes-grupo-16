# Challenger causal DML para densidade do ar

**Status:** infraestrutura experimental implementada e alinhada ao contrato de
target, rolling e MOST; não homologada e não conectada ao `Predictor`
operacional.
**Escopo:** estimar o efeito parcial da densidade do ar sobre o resíduo da curva
física no cenário climático da fase 2.  
**Fora de escopo:** previsão meteorológica futura, curtailment, CatBoost e fluxo
de potência do ANAREDE. MOST é suportado na construção do vento na altura do
hub, mas seus indicadores e parâmetros ainda não são controles do estimando v1.

## Estimando v1

O outcome usa a mesma normalização do modelo residual existente:

```text
Y = residual_cf
  = target_mw / capacidade_instalada_mw
  - baseline_mw / capacidade_instalada_mw
```

O tratamento contínuo é `D = air_density_kg_m3`. O modelo parcialmente linear é:

```text
Y = theta * D + g(X) + erro
```

Dois modelos auxiliares LightGBM estimam `E[Y|X]` e `E[D|X]`. O coeficiente
`theta` é calculado com resíduos out-of-fold. A predição do challenger é:

```text
residual_cf_previsto = E[Y|X] + theta * (D - E[D|X])
```

A correção volta para MW, é somada à curva física e continua sujeita aos limites
de capacidade, disponibilidade, cut-in e cut-out já existentes. Esses limites
usam `wind_speed_hub_m`, de forma idêntica ao pipeline residual principal.

Temperatura e pressão não podem ser controles do estimando v1 porque determinam
algebricamente a densidade usada como tratamento. Target, baseline e outcome
também são proibidos como controles. O contrato completo e versionado está em
`backend/ai-service/training/causal/estimand.example.json`.

## Estimando temporal/MOST v2

O v1 permanece imutável como referência. O contrato `temporal-most-v2` adiciona
explicitamente `wind_speed_hub_m`, médias, desvios e componentes de vento de 3
e 6 horas e gradientes de 1, 3 e 6 horas. Ele exige `most_enabled=true` e
`require_complete_history=true`; uma execução incompatível é recusada antes do
ajuste.

Há dois contratos de exemplo para a análise de sensibilidade:

- `estimand.temporal-most-v2.example.json`, sem disponibilidade nos controles;
- `estimand.temporal-most-v2-with-availability.example.json`, com
  disponibilidade.

As duas variantes existem porque a disponibilidade pode atuar como ajuste
operacional relevante ou como variável posterior, dependendo da semântica final
do target. A decisão não é tomada silenciosamente pelo código. Temperatura,
pressão, indicadores `most_applied`/`most_missing`, target e baseline continuam
fora dos controles causais.

## Isolamento temporal

O cross-fitting interno é expansivo e usa timestamps UTC únicos. O primeiro
bloco funciona como warm-up; cada bloco posterior é previsto somente por modelos
ajustados em horas anteriores. Todas as usinas da mesma hora recebem o mesmo
papel. Um gap opcional é aplicado antes de cada bloco de avaliação.

Esse cross-fitting é interno ao bloco `train` de cada fold do protocolo oficial.
Quando `require_complete_history=true`, o gap efetivo é no mínimo o lookback de
seis horas do contrato de features, ainda que o estimando solicite um gap menor.
Linhas sem `temporal_context_complete` não participam do ajuste nem da avaliação.
Calibração e teste final não são usados pelo experimento causal. Os comandos
recusam um arquivo que contenha linhas fora dos papéis de desenvolvimento.
Também recusam target divergente de `geracao_referencia_mw` e manifestos que não
declarem o lookback ou as entradas MOST obrigatórias.

## Artefatos

Um bundle exploratório contém:

- `outcome_model.txt`: nuisance model de `E[Y|X]`;
- `treatment_model.txt`: nuisance model de `E[D|X]`;
- `causal_diagnostics.json`: efeito, intervalo exploratório, overlap e métricas
  out-of-fold;
- `metadata.json`: contrato causal, configuração dos nuisance models,
  `FeatureConfig`, versão das features, lookback, requisito MOST, ordem de
  controles e hashes.

O loader rejeita bundle com configuração temporal/MOST inconsistente. A
inferência também rejeita usinas ausentes do treino e entradas sem o histórico
exigido; o fallback operacional será responsabilidade do futuro adaptador do
`Predictor`.

O intervalo registrado usa scores ortogonais agrupados em blocos temporais e é
explicitamente exploratório. DML não prova ausência de confundidores não
observados e não garante melhoria preditiva.

## Execução

### Fluxo pré-hackathon em nove passos

O caminho curto para produzir evidência de pitch, sem confundi-la com
homologação, está implementado assim:

1. baixar o mês de restrição eólica ONS, que contém a proxy
   `geracao_referencia_mw`;
2. baixar os meses ERA5 necessários, inclusive a partição seguinte para cobrir
   a virada UTC; a extração adicional fica isolada em
   `data/processed/training/era5-spillover/`, sem relaxar a partição operacional;
3. conciliar ONS, catálogo e ERA5 por conjunto e hora;
4. materializar elegibilidade e exclusões num relatório auditável;
5. calcular a curva física nas mesmas linhas futuras;
6. ajustar um LightGBM residual fixo como baseline de ML;
7. ajustar o DML com cross-fitting temporal e diagnóstico de overlap;
8. comparar os três modelos em folds futuros pareados e persistir predições,
   métricas, hashes e limitações;
9. publicar o JSON somente leitura na tela **Insights DML**, mantendo o
   `Predictor` e o PWF na curva física.

Na raiz do serviço, um mês real pode ser preparado e avaliado com:

```bash
python -m training.causal.prepare_data \
  --year 2024 --month 8 --collect-missing \
  --output data/processed/training/hackathon_2024_08.parquet \
  --report data/processed/training/hackathon_2024_08.report.json

python -m training.causal.hackathon \
  --input data/processed/training/hackathon_2024_08.parquet \
  --config training/causal/hackathon.example.json \
  --estimand training/causal/estimand.example.json \
  --output-dir artifacts/causal/hackathon
```

O segundo comando não sobrescreve um resultado existente. Para outra execução,
use um diretório versionado e só atualize `CLIMAGRID_DML_INSIGHTS_PATH` depois de
conferir o relatório. A API expõe `GET /insights-experimentais`; a fachada
NestJS expõe `GET /experimental-insights`.

### Resultado local materializado para o pitch

Em 27 de setembro de 2026, o fluxo acima foi executado sobre agosto de 2024:

- 239.328 registros ONS de meia hora produziram 107.894 linhas horárias válidas;
- a junção dessas linhas com ERA5 teve 100% de cobertura;
- 90.185 linhas ficaram elegíveis após excluir 109 targets inválidos/acima da
  capacidade instalada e 17.709 referências acima da capacidade disponível;
- a comparação futura pareada usou 67.883 linhas, 558 horas e 140 conjuntos;
- a cobertura DML foi 99,89%; 76 linhas de conjuntos inéditos usaram fallback;
- MAE: curva física 49,29 MW, LightGBM 22,55 MW e DML 21,68 MW;
- o DML reduziu o MAE em 56,02% contra a curva física e 3,88% contra o
  LightGBM fixo.

Esses números são evidência exploratória sobre a proxy ONS, não uma estimativa
de desempenho operacional homologada. O menor fold possui apenas um cluster
semanal de inferência; portanto os intervalos causais são subpotentes. O ganho
preditivo pode ser mostrado no pitch, mas não deve ser apresentado como prova
causal nem como desempenho de uma previsão meteorológica futura.

### Experimento seguinte: holdout mensal independente

O módulo `training/causal/independent_holdout.py` recebe dois snapshots físicos
e logicamente separados, exige que o holdout seja posterior, remove do treino o
gap temporal declarado e ajusta DML e LightGBM somente no desenvolvimento.

A métrica primária usa todas as linhas do holdout que passaram pelas validações
físicas gerais. A regra baseada no próprio target — referência menor ou igual à
capacidade disponível — é calculada depois da previsão e publicada apenas como
análise secundária. O relatório também separa usinas conhecidas, fallback de
usinas inéditas, métricas por usina-hora e total horário. O diretório de saída é
imutável e registra hashes de entradas, configuração, estimando, modelos e
previsões.

Antes de abrir um novo mês, a configuração deve estar congelada e a equipe deve
aceitar que o período passará a constar como exposto. Mesmo depois da execução,
o estado continua exploratório até que haja cobertura multiestação e validação
com hindcasts meteorológicos.

#### Resultado do holdout setembro de 2024

O holdout foi consumido em 27 de setembro de 2026 com configuração e estimando
congelados. O desenvolvimento de agosto forneceu 107.785 linhas antes da purga;
870 linhas das seis horas finais foram retiradas do treino. Setembro forneceu
103.801 linhas fisicamente válidas, 720 horas e 146 conjuntos, sem chaves
sobrepostas e sem fallback DML.

Na população primária completa, o WAPE por usina-hora foi 54,35% para a curva
física, 23,62% para o LightGBM e 25,46% para o DML. Após agregar os conjuntos por
hora, o WAPE foi 46,00%, 7,88% e 13,29%, respectivamente. Na coorte secundária
em que a referência não ultrapassa a capacidade disponível, o WAPE horário foi
41,67%, 5,18% e 9,10%.

O resultado independente contradiz a pequena vantagem do DML observada dentro
de agosto. O LightGBM fixo é o melhor candidato deste teste. Naquele protocolo,
setembro não podia ser reutilizado para escolher novos hiperparâmetros sem
perder o papel de holdout. O DML permanece challenger de pesquisa e nenhum
artefato foi promovido para o `Predictor`.

#### Adaptação sequencial em setembro, janeiro e abril

Depois do relatório acima ser congelado, a equipe decidiu explicitamente
reclassificar setembro como dado exposto de adaptação e reservar janeiro e
abril de 2026 como checkpoints posteriores. Essa decisão não altera o placar
histórico do holdout, mas impede usar setembro como evidência independente para
qualquer escolha posterior.

O módulo `training/causal/iterative_residual.py` executa a sequência:

1. treina LightGBM residual e DML apenas em agosto de 2024;
2. busca seis famílias de correção LightGBM, quatro intensidades e o guardrail
   sem correção no bloco final de setembro, com gap de 6 h;
3. aprende também uma calibração de baixa variância com um único fator agregado
   na grade congelada de 0,70 a 1,40;
4. mede janeiro de 2026 antes de usar seu target em qualquer adaptação;
5. repete as duas buscas sobre o resíduo restante em janeiro;
6. mede todos os candidatos congelados em abril, que não participa de treino ou
   seleção de parâmetros;
7. estima a diferença de WAPE por bootstrap pareado em blocos de dia UTC, com
   2.000 reamostragens.

Janeiro forneceu 92.973 linhas fisicamente válidas, 744 horas e 126 conjuntos;
abril forneceu 89.272 linhas, 720 horas e 124 conjuntos. A cobertura da junção
ONS--ERA5 foi 100% nos dois meses. A métrica primária reteve todas as linhas,
inclusive 5.000 referências acima da capacidade disponível em janeiro e 2.342
em abril após a validação final.

A correção flexível de setembro escolheu o guardrail sem correção. A correção
flexível aprendida em janeiro pareceu boa dentro do próprio mês, mas piorou o
WAPE horário de abril de 11,73% para 17,40%; a piora foi de 5,67 p.p., com IC95%
de -7,16 a -4,00 p.p. para a suposta melhora. Esse candidato foi rejeitado.

A calibração escalar escolheu `1,03` em setembro. Em janeiro, reduziu o WAPE
horário do LightGBM de 14,48% para 12,83%, ganho de 1,65 p.p. (IC95% 1,24 a
1,99). Em abril, reduziu 11,73% para 10,96%, ganho de 0,77 p.p. (IC95% 0,27 a
1,23). A calibração seguinte, `1,10` aprendida em janeiro, piorou abril para
12,06% e também foi rejeitada. Logo, o candidato a congelar para um backtest
anual é o LightGBM de agosto multiplicado por `1,03`, preservando os limites
físicos já aplicados. Isso ainda é evidência exploratória e não promove o modelo
para o `Predictor`.

O relatório e as previsões imutáveis ficam em
`artifacts/causal/iterative-residual-calibrated-2026-04/`. Abril passa a ser
período exposto; um teste anual deve usar meses ainda não empregados na escolha
do candidato ou um protocolo walk-forward pré-registrado.

Depois de gerar `assignments.parquet` e a partição `development.parquet` pelo
protocolo temporal:

```bash
cd backend/ai-service

python -m training.causal.experiment \
  --input data/processed/development.parquet \
  --assignments data/processed/assignments.parquet \
  --protocol protocol.json \
  --config config.json \
  --estimand training/causal/estimand.example.json \
  --output artifacts/causal-experiment.json
```

Para materializar um bundle ainda exploratório sobre o desenvolvimento completo:

```bash
python -m training.causal.train \
  --input data/processed/development.parquet \
  --assignments data/processed/assignments.parquet \
  --protocol protocol.json \
  --config config.json \
  --estimand training/causal/estimand.example.json \
  --artifacts artifacts/dml-density-v1
```

O segundo comando aceita somente protocolos `infrastructure_test` ou
`exploratory`. Ele não promove o bundle para a API.

O arquivo de exemplo fixa `crossfit_gap_hours=6`. O runtime também calcula o
gap efetivo a partir de `FeatureConfig`, impedindo que uma configuração externa
reduza acidentalmente o purge necessário.

Para executar a ablação, rode o comando uma vez para cada um dos três contratos
(legado, temporal/MOST sem disponibilidade e temporal/MOST com disponibilidade),
mantendo snapshot, atribuições e protocolo idênticos. Cada relatório registra o
hash do estimando usado.

## Gates antes de integração operacional

1. aprovar contrato do target e política ONS de elegibilidade;
2. congelar o DAG e os controles do estimando;
3. demonstrar overlap da densidade residual em mais de uma estação;
4. executar placebos e análise de estabilidade por fold/região;
5. comparar, nos mesmos hashes, curva física, correção física por densidade,
   LightGBM residual e DML;
6. definir critérios numéricos antes de abrir o teste final;
7. implementar o job final controlado e o loader operacional somente se o DML
   for selecionado e homologado.
