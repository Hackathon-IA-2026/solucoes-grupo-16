# Guia prático do modelo de geração eólica com ERA5 e ONS

Este guia explica como preparar os dados, treinar, avaliar e melhorar o modelo de geração eólica do ClimaGrid. Os comandos partem do diretório `backend/ai-service`.

## 1. Como o modelo funciona

O modelo combina duas etapas:

1. uma curva física estima a geração a partir da velocidade do vento, da capacidade instalada e da disponibilidade;
2. um LightGBM aprende o erro residual dessa curva física.

O LightGBM só é aprovado quando seu MAE no teste temporal é menor que o MAE da curva física. Caso contrário, a aplicação deve continuar usando `physical_fallback`. Essa regra impede a publicação de um ML que tenha desempenho pior que a referência física.

As principais features são velocidade e direção do vento a 100 metros, densidade aproximada do ar, hora do dia, dia do ano, capacidade instalada, disponibilidade e distância entre a usina e o ponto da grade ERA5.

## 2. Pendências atuais do merge

Antes de usar a API, corrija estas regressões:

- `ai-service/app/predictor.py` referencia `radius` e `available`, que não existem, ao gerar os limites da previsão;
- o mesmo arquivo usa a disponibilidade geral onde deveria preservar a disponibilidade de cada registro;
- `ai-service/app/main.py` perdeu `GET /capabilities` e `POST /estimar-historico` durante a resolução do conflito.

Enquanto isso não for corrigido, `POST /estimar-geracao` pode terminar com `NameError`, e o NestJS não encontra as rotas históricas.

## 3. Preparar o ambiente

No PowerShell:

```powershell
cd C:\Code\hackathon\solucoes-grupo-16\backend\ai-service

python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pip check
```

Usar diretamente o Python do ambiente virtual evita problemas com a política de execução do PowerShell.

Execute toda a suíte Python:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Execute somente os testes ligados ao ML:

```powershell
.\.venv\Scripts\python.exe -m pytest `
  tests/test_dataset.py `
  tests/test_features_and_split.py `
  tests/test_physical_curve.py `
  tests/test_pipeline.py `
  tests/test_api.py `
  -q
```

## 4. Dados necessários

O treinamento não lê diretamente do Supabase. Ele usa um CSV ou Parquet já unido, com ONS e ERA5 na mesma linha.

| Fonte | Finalidade | Obtenção no projeto |
|---|---|---|
| ONS | Geração, referência e disponibilidade | Fornecer CSV ou Parquet compatível |
| SIGA/ANEEL | CEG, coordenadas e capacidade | Download automatizado |
| ERA5 | Vento, temperatura e pressão | API do Copernicus CDS |

### 4.1 Formato esperado do ONS

O arquivo ONS precisa ter pelo menos:

```text
id_ons
nom_usina
ceg
id_subsistema
din_instante
val_disponibilidade
val_geracaoreferencia
val_geracao
```

`data/raw/ons/RESTRICAO_COFF_EOLICA_2026_09.parquet` já contém essas colunas e possui dados entre 1 e 20 de setembro de 2026.

`build-catalog` filtra o subsistema `NE`, mas não a tecnologia. O resultado atual fica eólico porque `RESTRICAO_COFF_EOLICA` já contém usinas eólicas. Se outra base ONS for usada, filtre-a antes ou adicione um filtro explícito ao código.

Para um modelo robusto, não treine apenas com ocorrências de restrição. Essa amostra pode representar principalmente situações de corte. O ideal é obter uma série histórica completa, incluindo a operação sem restrição.

### 4.2 Escolher o target

- `geracao_referencia_mw`: potencial ou referência de geração;
- `geracao_verificada_mw`: geração efetivamente entregue.

Para estimar potencial eólico sem o efeito direto do corte, a geração de referência tende a ser mais adequada. Para reproduzir energia entregue, use a geração verificada, sabendo que ela inclui efeitos operacionais, indisponibilidade e curtailment.

## 5. Criar o catálogo das usinas eólicas

```powershell
.\.venv\Scripts\python.exe -m ingestion.era5.cli download-siga
.\.venv\Scripts\python.exe -m ingestion.era5.cli download-ons-membership
```

Concilie ONS e SIGA:

```powershell
.\.venv\Scripts\python.exe -m ingestion.era5.cli build-catalog `
  --ons data/raw/ons/RESTRICAO_COFF_EOLICA_2026_09.parquet `
  --siga data/raw/siga/siga.csv `
  --ons-membership data/raw/ons/relacionamento_usina_conjunto.parquet `
  --subsystem NE
```

São gerados:

```text
data/processed/reference/plant_locations.parquet
data/processed/reference/plant_locations_report.json
```

Confira cobertura, CEGs não encontrados, ambiguidades, coordenadas e capacidades ausentes. Uma associação errada fornece o clima de outro local e prejudica todo o modelo.

## 6. Baixar e processar o ERA5

Crie uma credencial no Copernicus Climate Data Store, aceite os termos de `reanalysis-era5-single-levels` e configure o `cdsapi` fora do repositório.

Planeje a requisição sem baixar:

```powershell
.\.venv\Scripts\python.exe -m ingestion.era5.cli plan `
  --catalog data/processed/reference/plant_locations.parquet `
  --start 2026-09-01 `
  --end 2026-09-17
```

Faça a prova curta:

```powershell
.\.venv\Scripts\python.exe -m ingestion.era5.cli backfill `
  --catalog data/processed/reference/plant_locations.parquet `
  --start 2026-09-01 `
  --end 2026-09-17
```

Esse período se sobrepõe ao ONS existente e considera o atraso de publicação do ERA5. O NetCDF de janeiro de 2024 no repositório não se sobrepõe ao ONS de setembro de 2026.

O `backfill` gera algo semelhante a:

```text
data/processed/era5/year=2026/month=09/weather_hourly.parquet
```

## 7. Unir ONS e ERA5

```powershell
.\.venv\Scripts\python.exe -m ingestion.era5.cli join-ons `
  --ons data/raw/ons/RESTRICAO_COFF_EOLICA_2026_09.parquet `
  --weather data/processed/era5/year=2026/month=09/weather_hourly.parquet `
  --catalog data/processed/reference/plant_locations.parquet `
  --output data/processed/training/snapshot_unido.parquet `
  --report data/processed/training/join_report.json
```

Cada linha representa uma usina em uma hora:

```text
usina_id
timestamp_utc
capacidade_instalada_mw
disponibilidade
u100
v100
temperature_2m
surface_pressure
era5_distance_km
geracao_referencia_mw ou geracao_verificada_mw
```

O pipeline agrega por média os dois registros de 30 minutos do ONS. A disponibilidade em MW é dividida pela capacidade e convertida para uma fração entre `0` e `1`.

Confira `ons_join_coverage` em `join_report.json`. Cobertura baixa normalmente indica datas sem sobreposição, identificadores incompatíveis ou horas ausentes.

## 8. Primeiro treinamento

O pipeline atual exige uma única usina. Embora o escopo se chame global, `training/build_dataset.py` bloqueia datasets com várias usinas quando `usina_id` não está configurado.

Copie `training/config.example.json` para `training/experimento-usina-01.json`:

```json
{
  "target": "geracao_referencia_mw",
  "usina_id": "ID_ONS_DA_USINA",
  "start_utc": "2026-09-01T00:00:00Z",
  "experiment_days": 15,
  "source_timezone": null,
  "n_jobs": 1,
  "min_interval_samples": 20,
  "columns": {},
  "physical_curve": {
    "cut_in_ms": 3.0,
    "rated_ms": 12.0,
    "cut_out_ms": 25.0
  }
}
```

Treine em um diretório novo:

```powershell
.\.venv\Scripts\python.exe -m training.train `
  --input data/processed/training/snapshot_unido.parquet `
  --config training/experimento-usina-01.json `
  --processed data/processed/training/usina-01-hourly.parquet `
  --artifacts artifacts/experiments/usina-01-exp-001
```

São gerados:

```text
model.txt
metadata.json
residual_quantiles.json
validation_report.json
```

O código bloqueia a sobrescrita. Use um diretório diferente por experimento para preservar configuração e métricas.

## 9. Avaliar o modelo

```powershell
.\.venv\Scripts\python.exe -m training.evaluate `
  --input data/processed/training/snapshot_unido.parquet `
  --target geracao_referencia_mw `
  --artifacts artifacts/experiments/usina-01-exp-001
```

Observe:

- `baseline_test.overall.mae_mw`: erro da curva física;
- `hybrid_test.overall.mae_mw`: erro do modelo híbrido;
- `rmse_mw`: destaca erros grandes;
- `nmae_cf`: normaliza pela capacidade;
- `wape`: erro relativo ao volume observado;
- `by_wind_band`: desempenho por faixa de vento;
- `by_usina`: desempenho por usina;
- `hybrid_interval_coverage_test`: cobertura do intervalo;
- `approved`: informa se o híbrido venceu o baseline;
- `best_iteration`: árvores selecionadas pelo early stopping.

O split é temporal: 70% treino, 15% validação e 15% teste. Não selecione hiperparâmetros consultando repetidamente o teste; use a validação e consulte o teste no final.

## 10. Alterar hiperparâmetros

Os parâmetros estão fixos em `training/train.py`:

```python
learning_rate=0.04
n_estimators=2500
num_leaves=31
min_child_samples=100
subsample=0.8
colsample_bytree=0.8
reg_lambda=5.0
```

Adicionar esses campos somente ao JSON ainda não funciona, pois `TrainingConfig` não os declara. Para uma prova rápida, altere `train.py` e use um artefato diferente por execução.

| Parâmetro | Valores iniciais |
|---|---|
| `learning_rate` | `0.02`, `0.04`, `0.08` |
| `num_leaves` | `15`, `31`, `63` |
| `min_child_samples` | `50`, `100`, `200` |
| `subsample` | `0.7`, `0.8`, `1.0` |
| `colsample_bytree` | `0.7`, `0.8`, `1.0` |
| `reg_lambda` | `1`, `5`, `10` |

Altere poucas variáveis por vez e compare o MAE da validação. `n_estimators` pode continuar alto porque o early stopping encerra o treino após 100 iterações sem melhora.

A evolução recomendada é criar uma seção `lightgbm` no JSON, validá-la em `TrainingConfig` e registrá-la em `metadata.json`.

## 11. Como melhorar o modelo

1. Use meses ou anos completos. Quinze dias servem somente para testar o pipeline.
2. Obtenha ONS de operação normal, não apenas períodos de restrição.
3. Valide a semântica e as unidades do target.
4. Revise fusos: o ONS é interpretado como `America/Sao_Paulo` e convertido para UTC.
5. Elimine duplicidades, horas incompletas e coordenadas incorretas.
6. Configure `cut_in_ms`, `rated_ms` e `cut_out_ms` conforme os aerogeradores reais.
7. Evite vazamento: disponibilidade observada no futuro não existe no instante da previsão. Use disponibilidade planejada, prevista ou um cenário.
8. Analise o erro por faixa de vento e por usina.
9. Compare sempre com a curva física. Um ML que não vence o baseline não deve ser publicado.
10. Depois da prova com uma usina, adapte o pipeline para várias usinas mantendo o split temporal comum.

Melhorias futuras incluem curvas por modelo de turbina, topografia, altura real do rotor, previsão meteorológica em vez de reanálise e modelos por região ou tipo de aerogerador.

## 12. Executar a API

Depois de corrigir o merge:

```powershell
$env:CLIMAGRID_ARTIFACT_DIR = "artifacts/experiments/usina-01-exp-001"
$env:CLIMAGRID_TRAINING_SNAPSHOT = "data/processed/training/snapshot_unido.parquet"
$env:CLIMAGRID_PLANT_CATALOG = "data/processed/reference/plant_locations.parquet"
$env:CLIMAGRID_DATA_ROOT = "data"

.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Abra `http://127.0.0.1:8000/docs`. Os endpoints esperados são:

```text
GET  /health
GET  /capabilities
POST /estimar-geracao
POST /estimar-historico
```

## 13. Papel do Supabase

O Supabase não é necessário para treinar o modelo. `backend/supabase/schema.sql` cria somente `pwf_reference_cases` e documenta o bucket PWF.

No estágio atual:

- mantenha ERA5, ONS e snapshots em Parquet;
- mantenha artefatos em diretórios versionados;
- use Supabase somente na funcionalidade PWF, se desejado.

Em produção, envie Parquets e artefatos para o Supabase Storage. O Postgres pode guardar catálogo, caminhos, hashes, períodos e métricas:

```text
ml_datasets
  id, storage_path, sha256, start_at, end_at, row_count, created_at

ml_models
  id, artifact_path, dataset_id, target, approved, metrics_json, created_at

ml_training_runs
  id, config_json, status, started_at, finished_at
```

Evite gravar milhões de observações ERA5 como linhas no Postgres. Parquet é mais simples e eficiente para o pipeline offline; o banco registra a versão e a localização dos arquivos.

## 14. Ordem recomendada de aprendizado

1. Corrigir o merge e deixar os testes verdes.
2. Executar o pipeline com uma usina e poucos dias.
3. Abrir o snapshot unido e entender cada coluna.
4. Treinar sem alterar hiperparâmetros.
5. Comparar a curva física com o híbrido.
6. Testar uma pequena grade usando a validação.
7. Aumentar o histórico e melhorar as fontes.
8. Adaptar o pipeline para várias usinas.
9. Só depois automatizar armazenamento, versionamento e treinamento.

Essa sequência evita que problemas de coleta, junção e qualidade sejam confundidos com problemas do algoritmo de ML.
