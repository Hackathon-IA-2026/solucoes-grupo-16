# ClimaGrid AI Service — Fase 1

Experimento mínimo e reproduzível de estimativa de geração eólica a partir de vento. A camada de ML aprende somente o resíduo normalizado da curva física; ela só é usada se superar o MAE da curva física no teste temporal. Caso contrário — inclusive sem artefato — a API informa e usa `physical_fallback`.

Não há classificador de curtailment, XGBoost, SHAP, modelos por usina/cluster ou integração NestJS nesta fase.

## Instalação e execução

No diretório `ai-service`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pytest -q
uvicorn app.main:app --reload --port 8000
```

Com a API ativa, consulte `GET /health` e `POST /estimar-geracao` em `http://127.0.0.1:8000/docs`.

## Dados reais esperados depois

O serviço não baixa dados e não pressupõe os nomes originais do ONS. Primeiro prepare um snapshot único CSV/Parquet unido, em que os nomes são os canônicos abaixo (ou adapte explicitamente `ColumnConfig` em `training/config.py`):

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
