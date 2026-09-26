# ClimaGrid AI Service — replay histórico e base experimental

## Cenário climático do usuário (fase 2)

`POST /cenario-climatico/inspecionar` recebe `{"csv_text":"..."}` e lista as horas válidas. `POST /cenario-climatico/estimar` recebe o mesmo CSV e `timestamp_utc`; devolve potencial eólico para **uma hora**, usando a curva física, capacidade do catálogo e disponibilidade informada no arquivo. `POST /cenario-climatico/era5/estimar` recebe uma hora histórica e uma disponibilidade global, prepara somente o ERA5 mensal em segundo plano quando necessário, gera o CSV normalizado e usa a mesma curva física. A resposta identifica a fonte `USER` ou `ERA5`, schema `normalized-ons-hourly-v1`, estimador `physical-curve-v1`, parâmetros da curva e hashes SHA-256 do CSV, catálogo, clima e mapa PWF. O NestJS usa essa proveniência para persistir e vincular o cenário à exportação. O formato está documentado em [`Docs/ML/CENARIO_CLIMATICO_FASE_2.md`](../../Docs/ML/CENARIO_CLIMATICO_FASE_2.md). Nenhum artefato LightGBM experimental é usado como modelo aprovado de potencial. Consulte também a [`auditoria da fase 2`](../../Docs/ML/AUDITORIA_FASE_2.md).

> A fonte canônica de escopo e status é
> [`../../Docs/CONTEXTO_PROJETO_IA.md`](../../Docs/CONTEXTO_PROJETO_IA.md). O
> replay é a etapa 1; upload climático encerra o MVP na etapa 2; previsão futura
> e curtailment são etapas posteriores.

O fluxo operacional desta etapa reproduz uma hora já observada: geração
verificada da ONS e vento ERA5 alinhados por conjunto eólico do Nordeste. Ele
não executa previsão nem usa o modelo experimental para produzir o `Pg` do PWF.

O repositório também mantém infraestrutura experimental de estimativa de geração
eólica a partir de vento. Artefatos legados preservam o split 70/15/15 para
reprodutibilidade. O protocolo novo separa folds de desenvolvimento, early
stopping, calibração e teste final; nenhum resultado é servido sem homologação
operacional explícita. Esse experimento é separado do replay.

Há adaptadores comuns para LightGBM e XGBoost no protocolo temporal. Não há
classificador de curtailment, SHAP ou modelos por usina/cluster nesta fase. A
integração com o NestJS mantém essas ausências explícitas no contrato.

## Instalação e execução

O ambiente homologado usa Python 3.13. Não reutilize um ambiente virtual criado
com Python 3.10, pois as versões fixadas em `constraints.txt` exigem uma versão
mais recente do interpretador.

No diretório `ai-service`, em PowerShell:

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
python -m pytest -q
uvicorn app.main:app --reload --port 8000
```

Em Linux/macOS, use `python3.13 -m venv .venv` e
`source .venv/bin/activate`. Alternativamente, o Dockerfile já fornece o
Python correto e o `compose.yaml` da raiz inicia toda a aplicação.

Com a API ativa, consulte `GET /health`, `GET /capabilities`,
`GET /historico/disponibilidade`, `POST /replay-historico` e
`POST /estimar-geracao` em
`http://127.0.0.1:8000/docs`.

`requirements.txt` aplica `constraints.txt`, que registra as versões exercitadas no Windows com Python 3.13. Extras de plataforma podem diferir no Linux. O ambiente inclui `scikit-learn`, necessário ao `LGBMRegressor`. Use `python -m pip check` para verificar consistência das dependências.

`POST /replay-historico` recebe uma hora com timezone. Se ela já está em cache,
devolve a geração observada, fator de capacidade, vento e alocações sugeridas
de barras. Caso contrário, inicia a coleta e responde `202` com
`{"status":"preparing"}`; repita a mesma chamada até receber o replay. A rotina
`app/historical_ingestion.py` baixa o mês ONS da hora local, o mês ERA5 da hora
UTC, reconstrói o catálogo por CEG, valida chaves e cobertura da hora e grava
snapshot e relatório separados por mês. O cache legado indicado por
`CLIMAGRID_HISTORICAL_SNAPSHOT` continua aceito.

Configure `CDSAPI_KEY` no ambiente do AI service ou disponibilize `~/.cdsapirc`
ao processo. No Docker Compose, coloque a variável em
`backend/ai-service/.env` (não versionado); a credencial do host não é montada
automaticamente no contêiner. O arquivo ONS mensal precisa existir na fonte.
São aceitas horas encerradas desde janeiro de 2022, sujeitas à publicação dos
arquivos pelas fontes. Uma hora sem geração e vento conciliados retorna `409`; nenhuma
observação é simulada. O primeiro acesso pode levar minutos. Para executar a
mesma coleta manualmente:

```powershell
.\.venv\Scripts\python.exe -m app.historical_ingestion --timestamp 2024-08-15T12:00:00Z
```

## Coleta oficial ONS, SIGA e ERA5

A ingestão base fica em `ingestion/`. Ela pode ser executada antecipadamente
por CLI ou acionada pelo replay sob demanda em `app/historical_ingestion.py`.
O fluxo implementado:

1. baixa a geração horária oficial `GERACAO_USINA-2_HO`;
2. filtra conjuntos eólicos do subsistema `NE`;
3. concilia o CEG com o SIGA/ANEEL e publica o catálogo de coordenadas;
4. baixa e extrai o ERA5 em partições mensais idempotentes;
5. une ONS e ERA5 por conjunto e hora UTC;
6. relaciona os CEGs às barras da planilha PWF;
7. publica o snapshot observado e o mapa de alocação para a API.

Configure antes uma credencial pessoal do CDS e aceite os termos do dataset `reanalysis-era5-single-levels`, seguindo <https://cds.climate.copernicus.eu/how-to-api>. A credencial fica fora do repositório.

### 1. Obter o SIGA

```powershell
python -m ingestion.era5.cli download-siga
python -m ingestion.era5.cli download-ons-membership
```

O primeiro comando descobre o recurso CSV mais recente pela API pública da
ANEEL. O segundo baixa do ONS a composição oficial dos conjuntos de usinas.
Ambos gravam snapshots e manifests e permitem ligar o identificador agregado da
ONS aos CEGs das usinas integrantes.

### 2. Criar o catálogo de usinas

```powershell
python -m ingestion.era5.cli build-catalog `
  --ons data/raw/ons/year=2024/month=01/GERACAO_USINA-2_2024_01.parquet `
  --plant-type EOL `
  --siga data/raw/siga/siga.csv `
  --ons-membership data/raw/ons/relacionamento_usina_conjunto.parquet
```

A ligação usa primeiro o CEG exato. O fallback sem o sufixo terminal (`.1`, `.01`) só é aceito quando encontra um único empreendimento. Conjuntos são expandidos para as coordenadas exatas de suas usinas membros; o clima do conjunto é depois agregado com pesos de capacidade instalada, sem inventar um centroide. Ambiguidades ou conjuntos ausentes permanecem explícitos no relatório. Correções revisadas podem ser fornecidas com `--overrides arquivo.csv`, usando as colunas `location_id,ceg_siga`.

### 3. Baixar a geração horária ONS

```powershell
python -m ingestion.era5.cli download-ons-generation --year 2024 --month 1
```

O comando baixa o Parquet mensal oficial e grava manifest com URL, hash e data
de obtenção. A base de restrição não é usada como substituto da geração real.

Para auditar o alvo de **potencial sem limitação** do experimento da fase 2, baixe
separadamente o Parquet mensal de constrained-off eólico:

```powershell
python -m ingestion.era5.cli download-ons-restriction --year 2024 --month 8
```

Ele fica em `data/raw/ons/year=AAAA/month=MM/` e possui manifest próprio em
`data/manifests/ons_restriction/`. O campo `val_geracaoreferencia` é uma estimativa
ONS de geração sem limitação; validar sua cobertura e regras de cálculo antes de
usá-lo como target. O dataset de fator de capacidade é derivado da geração e da
capacidade instalada; não fornece esse alvo nem disponibilidade independente.

### 4. Conferir a área e os pedidos

Este comando não acessa o CDS:

```powershell
python -m ingestion.era5.cli plan `
  --catalog data/processed/reference/plant_locations.parquet `
  --start 2023-10-01 --end 2026-08-31
```

### 5. Fazer a prova de um mês

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

### 6. Unir ONS e ERA5

```powershell
python -m ingestion.era5.cli join-ons `
  --ons data/raw/ons/year=2024/month=01/GERACAO_USINA-2_2024_01.parquet `
  --weather data/processed/era5/year=2024/month=01/weather_hourly.parquet `
  --catalog data/processed/reference/plant_locations.parquet `
  --ons-format generation `
  --output data/processed/historical/observations.parquet `
  --report data/processed/historical/report.json
```

Timestamps ONS sem timezone são interpretados por padrão como
`America/Sao_Paulo` e convertidos para UTC; altere `--ons-timezone` se a fonte
fornecida tiver outra convenção. A fonte oficial desta etapa já é horária e não
é agregada a partir de registros de restrição.

### 7. Gerar o mapa de barras PWF

```powershell
python -m ingestion.era5.cli build-pwf-mapping `
  --workbook "../../Docs/Casos de Referência/Lista_de_Usinas.xlsx" `
  --catalog data/processed/reference/plant_locations.parquet `
  --output data/processed/reference/pwf_bus_mapping.parquet `
  --report data/processed/reference/pwf_bus_mapping_report.json
```

A associação usa o CEG. Quando um conjunto ONS possui várias usinas ou barras,
a API distribui a geração observada proporcionalmente à potência conectada. A
cobertura parcial permanece explícita em vez de ser tratada como completa.

Para ampliar o período publicado, siga o procedimento completo em
[`../../Docs/OPERACAO_HISTORICO_MENSAL.md`](../../Docs/OPERACAO_HISTORICO_MENSAL.md).

### Atualização e reconciliação do ERA5

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

`timestamp_utc` é convertido para UTC e os dados são consolidados em hora, pela chave lógica `usina_id + timestamp_utc`. Timestamps sem timezone são excluídos, a menos que `source_timezone` esteja explicitamente configurado após validar o fuso da fonte. Não há imputação de target, disponibilidade ou lacunas. A distância ERA5 permanece ausente quando não fornecida.

O adaptador `DatasetAdapter` define a interface para futuros conectores; `TabularDatasetAdapter` lê somente o snapshot já unido. A extração NetCDF, associação por coordenadas e junção das bases reais permanecem a cargo da preparação anterior, pois seus schemas ainda não foram validados. A cobertura calculada aqui é do snapshot recebido; não mede perdas de joins que ocorreram antes dele.

### Configuração do experimento

Use `training/config.example.json` como ponto de partida. O target inicia em `null`, bloqueando treino até uma escolha explícita em `--target` ou no JSON. `--target` tem precedência. Exemplo de configuração com nomes canônicos, sem presumir campos ONS:

```json
{
  "target": "geracao_referencia_mw",
  "usina_id": "ID_REAL_VALIDADO",
  "start_utc": "2024-08-01T00:00:00Z",
  "experiment_days": 30,
  "source_timezone": null,
  "columns": {},
  "physical_curve": {"cut_in_ms": 3, "rated_ms": 12, "cut_out_ms": 25},
  "lightgbm": {"min_child_samples": 100}
}
```

Em `columns`, cada chave é o nome canônico e cada valor é o nome confirmado no seu snapshot. O mapeamento inclui os dois targets. Não renomeie campos sem conferir unidade e semântica. Com `usina_id: null`, só são aceitos dados de uma única usina por padrão. Para um experimento multiusina explícito, use `allow_multiple_plants: true` e deixe `usina_id: null`; a cobertura registra tanto horas distintas quanto pares usina–hora. Com `start_utc: null`, a janela começa na primeira hora encontrada. São selecionados 30 dias por padrão, com exclusões e cobertura registradas. Dados menores podem testar a execução, mas geram aviso de cobertura incompleta; o split requer ao menos sete horas distintas. O piloto multiusina de agosto de 2024 está documentado em [`Docs/ML/EXPERIMENTOS_03_A_06_MULTIUSINA.md`](../../Docs/ML/EXPERIMENTOS_03_A_06_MULTIUSINA.md).

Disponibilidade deve ser uma fração conhecida no instante da previsão. O serviço não converte automaticamente disponibilidade em MW para fração. Temperatura deve estar em 150–350 K, pressão em 50.000–120.000 Pa e vento derivado em 0–50 m/s, tanto no dataset quanto na API. Essas faixas são verificações iniciais, sujeitas à revisão com os dados reais.

Duplicatas exatas da chave lógica são excluídas por inteiro. Se uma linha contiver campo obrigatório ausente/inválido, toda a hora correspondente é excluída para não mascarar, por média, um target ou disponibilidade faltante. Subintervalos válidos são consolidados por média aritmética, assumindo duração uniforme e valores em MW, nunca energia acumulada em MWh. O relatório inclui nulos após conversão numérica, duplicatas, período, cobertura e motivos de exclusão que podem se sobrepor. Ele também é salvo quando faltam colunas ou nenhuma hora é aproveitável.

## CLI

### Protocolo temporal versionado

`training/protocol.example.json` é apenas uma fixture de infraestrutura: suas
datas e hashes zero não autorizam execução científica. Depois da auditoria e da
aprovação das decisões da Fase 0, crie uma versão com limites calendáricos e
hashes reais. O fluxo novo é deliberadamente separado do legado:

```powershell
python -m training.splits --input data/processed/snapshot.parquet --protocol protocol.json --validity validity.csv --output assignments.parquet --development-output development.parquet --calibration-output calibration.parquet --final-test-output final-test.parquet
python -m training.tune --input development.parquet --assignments assignments.parquet --protocol protocol-frozen.json --config config.json --output tuning.json
python -m training.train_final --input development.parquet --assignments assignments.parquet --protocol protocol-frozen.json --config config.json --tuning tuning.json --artifacts artifacts/run-v1 --output-protocol protocol-model-frozen.json
python -m training.calibrate --input calibration.parquet --assignments assignments.parquet --protocol protocol-model-frozen.json --config config.json --artifacts artifacts/run-v1 --actor NOME --output-protocol protocol-calibration-frozen.json
python -m training.final_evaluate --input final-test.parquet --assignments assignments.parquet --protocol protocol-calibration-frozen.json --config config.json --artifacts artifacts/run-v1 --actor NOME --output-protocol protocol-final-consumed.json
```

Cada etapa grava uma nova versão do manifesto. Os comandos recusam datasets com
linhas fora do papel autorizado; tuning não recebe as reservas e calibração e
teste usam arquivos fisicamente separados. Calibração requer `model_frozen`; o
acesso à reserva é gravado antes da leitura e o teste final é recusado na
segunda abertura. `prepare_snapshot` valida o snapshot sem usar
`experiment_days`; a seleção temporal pertence exclusivamente ao protocolo.
Vigências em `validity.csv` usam `usina_id,valid_from_utc,valid_to_utc` e formam
o denominador de cobertura por bloco.

Homologação operacional não é inferida pelas métricas. Ela exige chamada
explícita a `homologate_operationally`, com referências do fluxo ponta a ponta e
do aceite no ANAREDE. Até isso ocorrer, o `Predictor` usa a curva física.

### Pipeline legado

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

Validação e treino aceitam `--config caminho/config.json`. O treino também gera `data/processed/hourly.csv` (alterável por `--processed`). Use `--artifacts caminho` no treino/avaliação para escolher o diretório do artefato; a avaliação aceita `--output` e reutiliza a configuração salva, inclusive curva física e mapeamento. Para avaliar, forneça o mesmo snapshot original do treino.

O treino não sobrescreve um `model.txt` existente: escolha outro diretório para cada versão. O hash do modelo permite detectar mistura de arquivos de artefatos diferentes no carregamento.

O treino legado registra em `artifacts/global/v1/`: `model.txt`, `metadata.json`, `residual_quantiles.json` e `validation_report.json`, identificado por `artifact_schema_version=legacy-temporal-70-15-15`. O metadata contém configuração completa, ordem de features, versões das bibliotecas, melhor iteração, períodos do split 70/15/15, hash do dataset/teste, métricas geral/por faixa de vento/por usina, cobertura do intervalo e decisão exploratória. A avaliação verifica o período e o conteúdo do teste pelo hash; não refaz o split com os dados novos.

LightGBM aprende `(target_mw - baseline_mw) / capacidade_instalada_mw`. Os parâmetros padrão são mantidos quando `lightgbm` é omitido. Essa seção do JSON aceita `learning_rate`, `n_estimators`, `num_leaves`, `min_child_samples`, `subsample`, `colsample_bytree` e `reg_lambda`; o metadata registra os valores efetivos e as métricas de validação. `subsample_freq=1` ativa a amostragem, o determinismo é habilitado e uma thread é usada por padrão. `n_jobs` é configurável. Apenas validação entra no early stopping de 100 rodadas. O teste decide aprovação por MAE estritamente menor; empate implica fallback. A aprovação é experimental, não validação de produção.

MAE/RMSE são em MW; `nmae_cf` é a média de `abs(erro_mw) / capacidade_mw`; WAPE é `sum(abs(erro)) / sum(abs(target))`, ou `null` quando a geração total é zero. O domínio de entrada é calculado somente no treino, sobre vento, temperatura, pressão, capacidade e disponibilidade. Como este primeiro artefato foi treinado com uma usina, outras usinas usam fallback, mesmo que o diretório seja `global/v1`.

## API

### Registro de experimentos no Supabase

O treino aceita `--tracking supabase` (ou `CLIMAGRID_EXPERIMENT_TRACKING=supabase`)
para publicar automaticamente o bundle final no Postgres/Storage privado. O modo
local permanece disponível. Sem `--artifacts`, o modo Supabase usa um diretório
novo em `artifacts/experiments/`, sem substituir o modelo servido.

O módulo `python -m training.experiments` oferece `publish`, `list`, `show`, `pull`
e `clean`. A limpeza é uma simulação por padrão e exige backup remoto verificado.
Migração SQL, configuração, comandos e limites estão em
[`Docs/ML/EXPERIMENTOS_SUPABASE.md`](../../Docs/ML/EXPERIMENTOS_SUPABASE.md).
Publicar um experimento não homologa potencial nem promove o modelo para a API.

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

O lote é limitado a 500 registros, com timestamps únicos em ordem crescente e timezone obrigatório. A resposta converte os horários para UTC. Entradas não finitas são rejeitadas. O artefato é carregado uma vez no startup de cada processo; `GET /health` informa aprovação e escopo efetivo.

A incerteza usa os percentis 5 e 95 do erro **assinado**, `(target - híbrido) / capacidade`, calculados exclusivamente na validação por faixa de vento. Faixas com menos de 20 amostras usam quantis globais da validação. Na previsão, ambos os quantis são multiplicados pela capacidade e somados à estimativa; os limites passam pelo clipping e cut-in/cut-out. O intervalo pode ser assimétrico e não precisa conter a estimativa pontual. Sua cobertura no teste é registrada: trata-se de intervalo empírico, sem garantia probabilística.

Sem artefato, com modelo reprovado/incompatível ou lote fora do domínio, a API retorna `model_scope: physical_fallback`, correção zero e confiança baixa. Um registro fora do domínio provoca fallback do lote inteiro. Os limites são `null` com warning `incerteza_nao_calibrada`; um intervalo de largura zero não representa incerteza desconhecida. `correcao_ml_mw` representa a correção efetiva após limites físicos. `model_version` identifica o artefato consultado; `model_scope` informa se ele foi usado.

Configure `CLIMAGRID_ARTIFACT_DIR` no ambiente para alterar o artefato da API. O arquivo `.env` não é lido automaticamente: use `uvicorn app.main:app --env-file .env --port 8000` se quiser carregá-lo.

## Docker

```powershell
docker build -t climagrid-ai .
docker run --rm -p 8000:8000 climagrid-ai
```

A imagem inclui `libgomp1`, necessário ao LightGBM no Linux. Por padrão inicia em fallback físico; dados locais, `.venv`, segredos e artefatos não entram no contexto. Para usar um modelo, monte seu diretório em `/service/artifacts/global/v1` como volume somente leitura.

Em produção, o snapshot histórico validado permanece fora do Git e é publicado
como uma imagem de dados separada. Depois de gerar ou atualizar
`observations.parquet`, `plant_locations.parquet` e `pwf_bus_mapping.parquet`,
publique a versão indicada em `deploy/historical-data-version.txt` a partir da
raiz do repositório:

```bash
docker login --username SEU_USUARIO
DOCKER_REPO=SEU_USUARIO ./deploy/publish-historical-data.sh --push
```

O workflow de deploy baixa essa imagem e copia somente os três arquivos
validados para a imagem final do AI service. Alterações do snapshot exigem uma
nova tag no arquivo de versão, nova publicação da imagem de dados e novo deploy.

## Limites e decisões pendentes

- Confirmar target com o especialista ONS. Referência precisa representar o potencial sem corte. Se usar geração verificada, preparar previamente um snapshot filtrado por ausência de restrição e disponibilidade adequada, com critérios documentados pelo especialista. Esses filtros não são inferidos e restrição nunca entra nas features.
- Validar nomes, unidades, timezone, identificação entre bases `tm`/`detail`, coordenadas e associação ao ERA5. Não assumir equivalência entre conjuntos e usinas.
- Escolher a usina, os 30 dias e uma cobertura mínima aceitável. Sem dados reais não há estimativa de desempenho, intervalo calibrado ou artefato de produção.
- Confirmar se a disponibilidade histórica estaria disponível antes da previsão. O serviço não estima nem imputa disponibilidade futura.
- ERA5 é reanálise histórica; previsões futuras exigem cenário climático informado ou uma fonte meteorológica de previsão.

Os dados sintéticos determinísticos vivem exclusivamente nos testes e seus diretórios temporários. Os testes exercitam treino real do LightGBM, aprovação/reprovação, gravação/leitura do artefato, avaliação no teste preservado, contrato HTTP, consistência de features e regras físicas. Nenhum modelo sintético é instalado em `artifacts/global/v1/`.
