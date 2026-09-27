# Respostas às dúvidas sobre o modelo ML com ERA5 e ONS

> **Documento de pesquisa para a etapa 3.** Algumas afirmações sobre “código
> atual” registram um estado antigo do merge e não devem ser usadas como status
> do projeto. Consulte [`../CONTEXTO_PROJETO_IA.md`](../CONTEXTO_PROJETO_IA.md).

Este documento complementa o [guia prático](GUIA_PRATICO_MODELO_ML_ERA5_ONS.md). As respostas foram conferidas no código atual de `backend/ai-service`. Os comandos partem desse diretório.

## Visão geral

O LightGBM não recebe ERA5 e ONS como bases separadas. Antes do treino, elas são alinhadas por usina e hora:

```text
ONS (geração/disponibilidade) --+
                                +--> snapshot unido --> curva física --> residual --> LightGBM
ERA5 (clima) -------------------+
SIGA (localização/capacidade) --+
```

Cada linha final representa uma usina em uma hora. A curva física produz a estimativa inicial e o LightGBM tenta corrigir seu erro.

## 1. Onde exatamente a curva física é calculada?

A implementação está em [`training/physical_curve.py`](../../backend/ai-service/training/physical_curve.py), na função `physical_power_mw()`.

Antes disso, [`training/features.py`](../../backend/ai-service/training/features.py) calcula a velocidade a partir dos componentes ERA5:

```text
velocidade a 100 m = sqrt(u100² + v100²)
```

Durante o preparo do treino, [`training/train.py`](../../backend/ai-service/training/train.py) chama a curva e grava o resultado em `baseline_mw`. A potência disponível é:

```text
potência disponível = capacidade instalada × disponibilidade
```

A curva é uma aproximação por trechos:

- abaixo de `cut_in_ms`: zero;
- entre `cut_in_ms` e `rated_ms`: rampa cúbica;
- entre `rated_ms` e `cut_out_ms`: potência disponível;
- a partir de `cut_out_ms`: zero, representando desligamento de proteção;
- o resultado sempre fica entre zero e `capacidade × disponibilidade`.

Os padrões são 3, 12 e 25 m/s. Eles estão em `PhysicalCurveConfig`, em [`training/config.py`](../../backend/ai-service/training/config.py), e podem ser alterados no JSON:

```json
{
  "physical_curve": {
    "cut_in_ms": 3.0,
    "rated_ms": 12.0,
    "cut_out_ms": 25.0
  }
}
```

Essa curva é genérica, não a curva oficial de um aerogerador específico. Para maior fidelidade, os valores — e futuramente a curva completa — devem refletir os equipamentos da usina. A API reutiliza a mesma implementação em [`app/predictor.py`](../../backend/ai-service/app/predictor.py).

## 2. Onde o LightGBM aprende o erro residual?

Isso ocorre em [`training/train.py`](../../backend/ai-service/training/train.py). O código calcula:

```text
target_cf   = target_mw / capacidade_instalada_mw
baseline_cf = baseline_mw / capacidade_instalada_mw
residual_cf = target_cf - baseline_cf
```

O `model.fit()` usa `residual_cf` como alvo. Na previsão:

```text
correção ML em MW = residual previsto × capacidade instalada
geração híbrida   = baseline físico + correção ML
```

Depois, `apply_physical_bounds()` reaplica os limites físicos. Assim, o LightGBM não aprende toda a geração do zero: aprende quanto a curva física costuma errar dadas as features de clima, calendário, capacidade, disponibilidade e distância ao ponto ERA5.

O split é temporal: 70% treino, 15% validação e 15% teste. O modelo só recebe `approved: true` se o MAE híbrido no teste for estritamente menor que o MAE da curva física.

## 3. Posso alimentar o pipeline com arquivos que já possuo?

Sim, em três níveis.

### Snapshot já unido

O treino aceita CSV ou Parquet por meio de `TabularDatasetAdapter`, em [`training/build_dataset.py`](../../backend/ai-service/training/build_dataset.py). O mínimo esperado é:

```text
usina_id
timestamp_utc
capacidade_instalada_mw
disponibilidade
u100
v100
temperature_2m
surface_pressure
geracao_referencia_mw
```

`era5_distance_km` é uma feature, mas pode ficar ausente; nesse caso será marcada como desconhecida. Se os nomes das suas colunas forem diferentes, mapeie-os em `columns` no JSON:

```json
{
  "target": "geracao_referencia_mw",
  "columns": {
    "usina_id": "codigo_da_usina",
    "timestamp_utc": "data_hora",
    "geracao_referencia_mw": "geracao_referencia_ons"
  }
}
```

Novos treinos recusam `geracao_verificada_mw`. Essa coluna continua útil no
replay e em auditorias, mas não pode ser target nem feature do estimador.

À direita ficam os nomes do seu arquivo; à esquerda, os nomes canônicos.

### ONS e clima processado em arquivos separados

`join-ons` aceita um ou vários CSV/Parquet em `--ons` e `--weather`:

```powershell
.\.venv\Scripts\python.exe -m ingestion.era5.cli join-ons `
  --ons caminho\ons_jan.parquet caminho\ons_fev.parquet `
  --weather caminho\clima_jan.parquet caminho\clima_fev.parquet `
  --catalog caminho\catalogo.parquet `
  --output data\processed\training\snapshot_unido.parquet `
  --report data\processed\training\join_report.json
```

Os arquivos ainda precisam respeitar os campos e unidades dos adaptadores. O mapeamento flexível de `TrainingConfig.columns` vale para o snapshot entregue ao treino; ele não transforma automaticamente qualquer formato bruto no `join-ons`.

### NetCDF meteorológico próprio

É possível extrair um arquivo local sem baixar do CDS:

```powershell
.\.venv\Scripts\python.exe -m ingestion.era5.cli extract `
  --catalog data\processed\reference\plant_locations.parquet `
  --input caminho\meu_arquivo.nc `
  --output data\processed\era5\meu_clima.parquet `
  --manifest data\manifests\meu_clima.json
```

O NetCDF precisa ter coordenadas, variáveis e unidades compatíveis com o extrator ERA5. Outra fonte pode exigir uma etapa de adaptação.

Importante: [`tests/test_cds_client.py`](../../backend/ai-service/tests/test_cds_client.py) não baixa uma base mensal real. Ele monta uma requisição de janeiro de 2024, substitui o CDS por `fake_retrieve()` e cria um NetCDF mínimo temporário. Isso testa o downloader; não fornece dados de treino.

## 4. Como funciona a pasta `tests` e como utilizá-la?

[`tests`](../../backend/ai-service/tests) contém testes automatizados com `pytest`. Ela verifica o código, mas não é uma base de produção nem um caminho alternativo de treinamento.

O fixture `synthetic_frame`, em `tests/conftest.py`, cria 30 dias determinísticos para uma usina fictícia. Arquivos temporários usam o `tmp_path` do pytest, não `data`.

| Arquivo | O que verifica |
|---|---|
| `test_physical_curve.py` | cut-in, nominal, cut-out e limites físicos |
| `test_features_and_split.py` | features e ausência de vazamento temporal |
| `test_dataset.py` | esquema, inválidos, duplicidades, timezone e agregação |
| `test_pipeline.py` | LightGBM real, artefatos, aprovação/fallback, avaliação e API |
| `test_api.py` | contrato HTTP e validações |
| `test_historical.py` | cenário histórico com snapshot e catálogo |
| `test_era5_planner.py` | requisições ERA5 mensais |
| `test_cds_client.py` | download simulado, manifest e idempotência |
| `test_era5_extract.py` | extração de grade e agregação por capacidade |
| `test_ons_hourly.py` | hora UTC e união ONS–ERA5 |
| `test_plant_catalog.py` | CEG, coordenadas, limites e conjuntos de usinas |

Comandos úteis:

```powershell
# Todos
.\.venv\Scripts\python.exe -m pytest -q

# Um arquivo
.\.venv\Scripts\python.exe -m pytest tests\test_physical_curve.py -v

# Um teste
.\.venv\Scripts\python.exe -m pytest `
  tests\test_pipeline.py::test_configurable_curve_roundtrip -v

# Filtrar pelo nome ou parar na primeira falha
.\.venv\Scripts\python.exe -m pytest -k "physical or residual" -v
.\.venv\Scripts\python.exe -m pytest -x -v
```

Ao mudar uma regra, execute primeiro o arquivo relacionado e, antes de concluir, a suíte inteira.

### Situação atual

As regressões antigas em `app/predictor.py` e `app/main.py` foram corrigidas.
O replay histórico operacional usa `GET /capabilities` e
`POST /replay-historico`; a suíte automatizada deve permanecer verde antes de
qualquer publicação. O restante deste documento continua útil como referência
para a pesquisa de estimativa e previsão das etapas 2 e 3.

## 5. Como funciona a pasta `training`? Preciso mudar hiperparâmetros a cada teste?

[`training`](../../backend/ai-service/training) contém todo o pipeline offline:

| Arquivo | Papel |
|---|---|
| `config.py` | configuração, colunas, target e curva física |
| `config.example.json` | exemplo de experimento |
| `build_dataset.py` | leitura, validação e consolidação horária |
| `features.py` | features usadas no treino e na API |
| `physical_curve.py` | baseline e limites físicos |
| `train.py` | split, treino, aprovação e artefatos |
| `evaluate.py` | métricas e intervalos no teste preservado |

Você não precisa mudar hiperparâmetros para rodar os testes automatizados e não deve mudá-los aleatoriamente a cada treino. Comece com os padrões, compare poucas combinações na validação e consulte o teste apenas ao final. Use um diretório de artefatos diferente para cada experimento.

Os hiperparâmetros padrão do LightGBM estão declarados em `training/config.py`:

```text
learning_rate=0.04, n_estimators=2500, num_leaves=31
min_child_samples=100, subsample=0.8
colsample_bytree=0.8, reg_lambda=5.0
```

O JSON também aceita uma seção `lightgbm` com esses campos. Cada campo omitido usa o valor padrão. Não há grid search, random search ou Optuna. O único ajuste automático é o `early stopping`: 2.500 árvores é o teto padrão, o treino para após 100 rodadas sem melhora na validação e grava `best_iteration`.

Para comparar experimentos, use um JSON e um diretório de artefatos por execução. Os valores efetivos ficam em `metadata.json`, em `lightgbm_params`.

## 6. O `.env.example` é utilizado? Preciso criar `.env`? O que são as URLs?

[`.env.example`](../../backend/ai-service/.env.example) é apenas um modelo; não é carregado automaticamente. Você pode criar o real e carregá-lo ao iniciar a API:

```powershell
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --env-file .env --port 8000
```

As variáveis não são URLs, mas caminhos locais:

| Variável | Valor esperado |
|---|---|
| `CLIMAGRID_ARTIFACT_DIR` | diretório com modelo e metadados |
| `CLIMAGRID_TRAINING_SNAPSHOT` | snapshot unido para o histórico |
| `CLIMAGRID_PLANT_CATALOG` | catálogo de usinas |
| `CLIMAGRID_DATA_ROOT` | raiz local dos dados |

`CLIMAGRID_ARTIFACT_DIR` também muda o diretório padrão de artefatos. `CLIMAGRID_TARGET`, mostrado apenas como comentário, não é lido pelo código atual; defina o target por `--target` ou no JSON.

As URLs oficiais de SIGA e do relacionamento ONS já têm padrões na CLI. A credencial ERA5/CDS não pertence a esse `.env`: o `cdsapi` usa a credencial pessoal configurada conforme o Copernicus e exige aceite dos termos do dataset. Não versione tokens. O `.env` está no `.gitignore`; o `.env.example` pode ser versionado sem segredos.

## 7. O que são os `constraints`?

O termo pode ter dois sentidos.

### `constraints.txt`

[`constraints.txt`](../../backend/ai-service/constraints.txt) fixa versões exatas exercitadas no Windows/Python 3.13. [`requirements.txt`](../../backend/ai-service/requirements.txt) declara os pacotes e intervalos; a linha `-c constraints.txt` restringe a instalação às versões testadas, melhorando a reprodutibilidade.

Não se altera isso a cada execução. Ao atualizar dependências, valide com:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -m pytest -q
```

### Restrições físicas

São as regras de `physical_curve.py`: geração entre zero e a potência disponível, e zero fora de cut-in/cut-out. Elas continuam valendo após a correção do ML.

## 8. O que é `physical_fallback`?

Não é outro arquivo nem outro LightGBM. É o modo seguro em que a API usa somente a curva física, com correção ML zero.

É acionado quando:

- não há artefato;
- o artefato está inválido/incompatível;
- o modelo não venceu o baseline e tem `approved: false`;
- a entrada está fora do domínio de treino;
- a usina não apareceu no treino.

Nesse modo, `model_scope` é `physical_fallback`, a confiança é baixa e não há intervalo calibrado pelo ML. Um treino reprovado ainda grava artefatos e métricas para auditoria; apenas não é usado pela API.

## 9. Preciso configurar algo em `.venv`?

Não edite arquivos dentro dela. `.venv` é um ambiente Python local, isolado e descartável. O repositório atual possui uma criada com Python 3.13.1 nesta máquina. Verifique com:

```powershell
.\.venv\Scripts\python.exe --version
.\.venv\Scripts\python.exe -m pip check
```

Se não existir, tiver vindo de outra máquina ou estiver quebrada, recrie:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Não é necessário ativá-la: chamar seu `python.exe` diretamente basta. Ela está no `.gitignore`; não armazene credenciais, dados ou configurações do modelo dentro dela.

## 10. Como o diretório `data` foi criado? São dados reais? Preciso alterar algo?

A estrutura separa:

```text
data/raw/         cópias brutas
data/processed/   resultados derivados
data/manifests/   origem, hashes, pedidos e datas
```

### Conteúdo atual

| Arquivo | Rastreabilidade e situação |
|---|---|
| `raw/siga/siga.csv` | manifest aponta para dados abertos da ANEEL; é snapshot real segundo o manifest |
| `raw/ons/relacionamento_usina_conjunto.parquet` | manifest aponta para bucket público ONS; real segundo o manifest |
| `raw/era5/.../era5_ne_2024-01.nc` | manifest registra CDS, payload, hash e 744 horas; ERA5 real de jan/2024 segundo o manifest |
| `raw/ons/RESTRICAO_COFF_EOLICA_2026_09.parquet` | 146.304 linhas, de 1 a 20/09/2026; aparenta dado operacional real, mas não há manifest de origem para comprová-lo no repositório |
| `processed/reference/plant_locations.parquet` | derivado de ONS–SIGA; relatório indica 139 usinas, 1.002 localizações e cerca de 98,56% de cobertura por usina |

Os dados sintéticos vivem em `tests/conftest.py`, não nesses arquivos.

### Ainda não há dataset de treino pronto

O ERA5 presente é de janeiro de 2024 e o ONS de restrição é de setembro de 2026. Sem sobreposição temporal, eles não geram linhas unidas. Também não existe no estado atual um `weather_hourly.parquet` processado nem `snapshot_unido.parquet` pronto.

Além disso, `RESTRICAO_COFF_EOLICA` representa situações relacionadas a restrição e não necessariamente toda a operação da usina.

Não altere os brutos manualmente. Para treinar:

1. escolha período e usina;
2. obtenha ONS e ERA5 sobrepostos;
3. prefira série ONS completa, não só restrições;
4. confirme significado/unidade do target;
5. reconstrua o catálogo quando necessário;
6. extraia ERA5 e execute `join-ons`;
7. revise cobertura, timezone e ausências no relatório;
8. preserve manifests/hashes;
9. grave cada treino em novo diretório de artefatos.

Os novos dados são ignorados por padrão no `.gitignore`, embora alguns snapshots atuais já estejam no histórico Git. Antes de versionar novos arquivos, avalie tamanho, licença, privacidade e armazenamento externo.

## Sequência prática recomendada

1. Corrigir as regressões da API e deixar os testes verdes.
2. Escolher ONS e ERA5 no mesmo período.
3. Rodar uma usina e poucos dias.
4. Inspecionar snapshot e relatório.
5. Treinar com os padrões.
6. Comparar `baseline_test` e `hybrid_test`.
7. Só então variar curva e hiperparâmetros usando validação e artefatos separados.
