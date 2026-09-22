# ClimaGrid AI Service — Fase 1

Experimento mínimo e reproduzível de estimativa de geração eólica a partir de vento. A camada de ML aprende somente o resíduo normalizado da curva física; ela só é usada se superar o MAE da curva física no teste temporal. Caso contrário — inclusive sem artefato — a API informa e usa `physical_fallback`.

Não há classificador de curtailment, XGBoost, SHAP ou modelos por usina/cluster
nesta fase. A integração com o NestJS está disponível, mas mantém essas
ausências explícitas no contrato em vez de fabricar classificações.

## Instalação e execução

No diretório `ai-service`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pytest -q
uvicorn app.main:app --reload --port 8000
```

Com a API ativa, consulte `GET /health`, `GET /capabilities`,
`POST /estimar-geracao` e `POST /estimar-historico` em
`http://127.0.0.1:8000/docs`.

`POST /estimar-historico` lê o snapshot unido configurado por
`CLIMAGRID_TRAINING_SNAPSHOT`, filtra o período e devolve a média horária por
usina. Sem artefato aprovado, a resposta usa e identifica `physical_fallback`.
Sem snapshot unido, responde `409`; o arquivo ONS bruto sozinho não habilita a
estimativa porque ainda faltam as observações ERA5 alinhadas.

## Coleta oficial ONS, SIGA e ERA5

A ingestão fica em `ingestion/` e é executada como job separado da API. O fluxo implementado:

1. filtra no ONS as usinas do subsistema `NE`;
2. concilia o CEG com o SIGA/ANEEL e publica o catálogo de coordenadas;
3. calcula a menor caixa regional com margem de 0,5°;
4. baixa o ERA5 em partições mensais idempotentes;
5. extrai o ponto de grade mais próximo de cada usina;
6. agrega o ONS de 30 minutos para hora UTC e produz o snapshot unido.

Configure antes uma credencial pessoal do CDS e aceite os termos do dataset `reanalysis-era5-single-levels`, seguindo <https://cds.climate.copernicus.eu/how-to-api>. A credencial fica fora do repositório.

### 1. Obter o SIGA

```powershell
python -m ingestion.era5.cli download-siga
python -m ingestion.era5.cli download-ons-membership
```

O primeiro comando descobre o recurso CSV mais recente pela API pública da ANEEL. O segundo baixa do ONS a composição oficial dos conjuntos de usinas. Ambos gravam snapshots e manifests; essa composição é necessária porque o arquivo de constrained-off informa `ceg = "-"` para a maioria dos conjuntos.

### 2. Criar o catálogo de usinas

```powershell
python -m ingestion.era5.cli build-catalog `
  --ons data/raw/ons/restricao_coff_eolica_usi.csv `
  --siga data/raw/siga/siga.csv `
  --ons-membership data/raw/ons/relacionamento_usina_conjunto.parquet
```

A ligação usa primeiro o CEG exato. O fallback sem o sufixo terminal (`.1`, `.01`) só é aceito quando encontra um único empreendimento. Conjuntos são expandidos para as coordenadas exatas de suas usinas membros; o clima do conjunto é depois agregado com pesos de capacidade instalada, sem inventar um centroide. Ambiguidades ou conjuntos ausentes permanecem explícitos no relatório. Correções revisadas podem ser fornecidas com `--overrides arquivo.csv`, usando as colunas `location_id,ceg_siga`.

### 3. Conferir a área e os pedidos

Este comando não acessa o CDS:

```powershell
python -m ingestion.era5.cli plan `
  --catalog data/processed/reference/plant_locations.parquet `
  --start 2023-10-01 --end 2026-08-31
```

### 4. Fazer a prova de um mês

```powershell
python -m ingestion.era5.cli backfill `
  --catalog data/processed/reference/plant_locations.parquet `
  --start 2024-01-01 --end 2024-01-31
```

Use `--dry-run` para listar partições e caminhos sem baixar. Cada mês recebe NetCDF bruto, Parquet por usina e manifests com hashes. Downloads incompletos usam a extensão `.part` e nunca são publicados como concluídos.

Depois da prova, execute o histórico:

```powershell
python -m ingestion.era5.cli backfill `
  --catalog data/processed/reference/plant_locations.parquet `
  --start 2023-10-01 --end 2026-08-31
```

### 5. Unir ONS e ERA5

```powershell
python -m ingestion.era5.cli join-ons `
  --ons data/raw/ons/restricao_coff_eolica_usi.csv `
  --weather data/processed/era5/year=2024/month=01/weather_hourly.parquet `
  --catalog data/processed/reference/plant_locations.parquet `
  --output data/processed/training/snapshot_unido.parquet `
  --report data/processed/training/join_report.json
```

Timestamps ONS sem timezone são interpretados por padrão como `America/Sao_Paulo` e convertidos para UTC; altere `--ons-timezone` se a fonte fornecida tiver outra convenção. Horas com menos de dois intervalos são excluídas e reportadas. Potências em MWmed são agregadas por média, nunca soma.

### 6. Atualização e reconciliação

```powershell
python -m ingestion.era5.cli update --catalog data/processed/reference/plant_locations.parquet
python -m ingestion.era5.cli reconcile --catalog data/processed/reference/plant_locations.parquet --months-back 3
```

`update` usa por padrão uma janela móvel de dez dias e atraso de disponibilidade de cinco dias. `reconcile` refaz as partições recentes para permitir a substituição de ERA5T pelo ERA5 final.

## Contrato do snapshot de treinamento

O snapshot CSV/Parquet unido usa os nomes canônicos abaixo (ou exige adaptação explícita em `ColumnConfig`, em `training/config.py`):

- ONS tratado, com `usina_id`, `timestamp_utc`, `disponibilidade` e o target escolhido;
- ERA5 horário com `u100`, `v100`, `temperature_2m` (K) e `surface_pressure` (Pa);
- cadastro de usinas para `capacidade_instalada_mw` e, futuramente, latitude/longitude e `era5_distance_km`;
- definição semântica validada de **um** target: `geracao_referencia_mw` ou `geracao_verificada_mw`.

`timestamp_utc` é convertido para UTC e os dados são consolidados em hora, pela chave lógica `usina_id + timestamp_utc`. Não há imputação silenciosa de target ou disponibilidade. A distância ERA5 é suportada quando for fornecida; o pipeline não inventa esse valor.

## CLI

Valide e gere o dataset horário (o target é opcional aqui, mas incluí-lo amplia a validação):

```powershell
python -m training.build_dataset --input data/raw/snapshot_unido.csv --output data/processed/hourly.csv --report data/processed/validation_report.json --target geracao_referencia_mw
```

Treine. O comando exige target explícito e o bloqueia se não for um dos dois valores permitidos:

```powershell
python -m training.train --input data/raw/snapshot_unido.csv --target geracao_referencia_mw
```

Reavalie o artefato no bloco temporal de teste (sem usá-lo para early stopping):

```powershell
python -m training.evaluate --input data/raw/snapshot_unido.csv --target geracao_referencia_mw
```

O treino registra em `artifacts/global/v1/`: `model.txt`, `metadata.json`, `residual_quantiles.json` e `validation_report.json`. O metadata contém ordem de features, parâmetros, períodos do split 70/15/15, métricas geral/por faixa de vento/por usina e a decisão de aprovação.

## API

Exemplo de corpo para `POST /estimar-geracao`:

```json
{
  "usina_id": "ONS_123",
  "capacidade_instalada_mw": 100.0,
  "disponibilidade": 0.95,
  "registros": [{
    "timestamp_utc": "2026-08-01T14:00:00Z",
    "u100": 7.2,
    "v100": -3.1,
    "temperature_2m": 298.15,
    "surface_pressure": 100900
  }]
}
```

O lote é limitado a 500 registros, o timestamp deve ter timezone e a velocidade derivada deve estar em 0–50 m/s. A incerteza é o intervalo empírico simétrico derivado do p95 do erro absoluto da validação por faixa de vento, com fallback global para amostras escassas; não é garantia probabilística.
