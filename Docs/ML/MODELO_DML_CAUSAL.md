# Challenger causal DML para densidade do ar

**Status:** infraestrutura experimental implementada; não homologada e não
conectada ao `Predictor` operacional.  
**Escopo:** estimar o efeito parcial da densidade do ar sobre o resíduo da curva
física no cenário climático da fase 2.  
**Fora de escopo:** previsão meteorológica futura, curtailment, Monin–Obukhov,
CatBoost e fluxo de potência do ANAREDE.

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
de capacidade, disponibilidade, cut-in e cut-out já existentes.

Temperatura e pressão não podem ser controles do estimando v1 porque determinam
algebricamente a densidade usada como tratamento. Target, baseline e outcome
também são proibidos como controles. O contrato completo e versionado está em
`backend/ai-service/training/causal/estimand.example.json`.

## Isolamento temporal

O cross-fitting interno é expansivo e usa timestamps UTC únicos. O primeiro
bloco funciona como warm-up; cada bloco posterior é previsto somente por modelos
ajustados em horas anteriores. Todas as usinas da mesma hora recebem o mesmo
papel. Um gap opcional é aplicado antes de cada bloco de avaliação.

Esse cross-fitting é interno ao bloco `train` de cada fold do protocolo oficial.
Calibração e teste final não são usados pelo experimento causal. Os comandos
recusam um arquivo que contenha linhas fora dos papéis de desenvolvimento.

## Artefatos

Um bundle exploratório contém:

- `outcome_model.txt`: nuisance model de `E[Y|X]`;
- `treatment_model.txt`: nuisance model de `E[D|X]`;
- `causal_diagnostics.json`: efeito, intervalo exploratório, overlap e métricas
  out-of-fold;
- `metadata.json`: contrato, configuração, ordem de features e hashes.

O intervalo registrado usa scores ortogonais agrupados em blocos temporais e é
explicitamente exploratório. DML não prova ausência de confundidores não
observados e não garante melhoria preditiva.

## Execução

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

