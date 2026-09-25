# Operação do histórico mensal ONS + ERA5

Este guia explica o que significa “ampliar além de janeiro de 2024”. O processo
não acontece automaticamente: os arquivos mensais precisam ser baixados,
validados, unidos e publicados num novo snapshot consolidado.

## O que muda ao adicionar um mês

Para cada mês são necessários dois insumos com horas sobrepostas:

- geração horária `GERACAO_USINA-2_HO` da ONS;
- clima horário ERA5 para as localizações do catálogo.

Baixar apenas um deles não amplia a interface. Depois do download é obrigatório
recriar `data/processed/historical/observations.parquet` incluindo **todos** os
meses que devem continuar disponíveis. Se o join for executado apenas com
fevereiro, janeiro deixa de aparecer no snapshot publicado.

## Pré-requisitos

1. Docker Compose operacional.
2. Conta no Copernicus Climate Data Store.
3. Termos do dataset `reanalysis-era5-single-levels` aceitos.
4. Token pessoal em `${HOME}/.cdsapirc`, conforme a
   [documentação oficial da API do CDS](https://cds.climate.copernicus.eu/how-to-api).
5. Espaço em disco; os dados são locais e não entram no Git.

Ao usar Docker, monte a credencial apenas como leitura em `/home/app/.cdsapirc`.
Nunca copie o token para o repositório, imagem ou logs.

## Exemplo: acrescentar fevereiro de 2024

### 1. Baixar a geração ONS

```bash
docker compose run --rm ai-service python -m ingestion.era5.cli \
  download-ons-generation --year 2024 --month 2
```

O downloader atual recebe um mês por execução. Para um ano completo:

```bash
for month in $(seq 1 12); do
  docker compose run --rm ai-service python -m ingestion.era5.cli \
    download-ons-generation --year 2024 --month "$month"
done
```

### 2. Reconstruir o catálogo com o universo dos meses escolhidos

Ao usar a base completa de geração, aplique `--plant-type EOL`; sem esse filtro,
o catálogo incluiria também hidrelétricas, térmicas e solares do NE.

Para janeiro e fevereiro:

```bash
docker compose run --rm ai-service python -m ingestion.era5.cli build-catalog \
  --ons \
    data/raw/ons/year=2024/month=01/GERACAO_USINA-2_2024_01.parquet \
    data/raw/ons/year=2024/month=02/GERACAO_USINA-2_2024_02.parquet \
  --plant-type EOL \
  --siga data/raw/siga/siga.csv \
  --ons-membership data/raw/ons/relacionamento_usina_conjunto.parquet \
  --minimum-coverage 0.93
```

Leia `plant_locations_report.json` antes de continuar. Categorias agregadas
`PQU ... EOL` não têm CEG individual e não devem receber coordenada ou barra
inventada. CEGs ausentes, coordenadas inválidas e cobertura inferior ao limite
precisam de revisão ou override documentado.

Na prova feita com janeiro de 2024, esse catálogo mais amplo encontrou 160
conjuntos eólicos: 150 ficaram totalmente localizados, 1 exigiu revisão e 9
ficaram sem solução, resultando em 93,75% de cobertura por conjunto. Por isso o
limite padrão de 95% interrompe o comando depois de gravar o catálogo e o
relatório. Isso é uma trava de qualidade, não uma falha do download.

O caminho preferencial é corrigir a coordenada revisável e documentar quais
agregados `PQU` ficam fora do produto. Se o especialista aceitar explicitamente
essa exclusão para o replay, o mesmo limiar aprovado deve ser informado tanto
no catálogo quanto no backfill, por exemplo
`--minimum-coverage 0.93` e `--minimum-location-coverage 0.93`. Não reduza os
limites apenas para fazer o comando passar.

### 3. Planejar o ERA5 sem baixar

```bash
docker compose run --rm ai-service python -m ingestion.era5.cli plan \
  --catalog data/processed/reference/plant_locations.parquet \
  --start 2024-01-01 --end 2024-02-29
```

### 4. Baixar e processar o ERA5

```bash
docker compose run --rm \
  -v "${HOME}/.cdsapirc:/home/app/.cdsapirc:ro" \
  ai-service python -m ingestion.era5.cli backfill \
  --catalog data/processed/reference/plant_locations.parquet \
  --minimum-location-coverage 0.93 \
  --start 2024-01-01 --end 2024-02-29
```

O valor `0.93` acima só é válido se a exclusão descrita na etapa 2 tiver sido
aceita. Com todas as localizações corrigidas, mantenha o padrão de 95% ou use um
limite mais rigoroso.

`backfill` divide o intervalo automaticamente em meses, grava NetCDF bruto,
Parquet processado e manifests com hashes. Uma partição já concluída é ignorada,
a menos que `--overwrite` seja informado.

### 5. Refazer o mapa CEG → barras

O catálogo pode ganhar conjuntos quando o período cresce; portanto regenere o
mapa:

```bash
docker compose run --rm \
  -v "$PWD/Docs:/service/Docs:ro" \
  ai-service python -m ingestion.era5.cli build-pwf-mapping \
  --workbook "/service/Docs/Casos de Referência/Lista_de_Usinas.xlsx" \
  --catalog data/processed/reference/plant_locations.parquet \
  --output data/processed/reference/pwf_bus_mapping.parquet \
  --report data/processed/reference/pwf_bus_mapping_report.json
```

### 6. Publicar um snapshot contendo janeiro **e** fevereiro

```bash
docker compose run --rm ai-service python -m ingestion.era5.cli join-ons \
  --ons \
    data/raw/ons/year=2024/month=01/GERACAO_USINA-2_2024_01.parquet \
    data/raw/ons/year=2024/month=02/GERACAO_USINA-2_2024_02.parquet \
  --weather \
    data/processed/era5/year=2024/month=01/weather_hourly.parquet \
    data/processed/era5/year=2024/month=02/weather_hourly.parquet \
  --catalog data/processed/reference/plant_locations.parquet \
  --ons-format generation \
  --output data/processed/historical/observations.parquet \
  --report data/processed/historical/report.json
```

Para muitos meses, passe todas as partições em ordem ou automatize a montagem da
lista. O contrato do comando já aceita vários valores em `--ons` e `--weather`.

### 7. Conferir qualidade e republicar

No relatório, confirme:

- período inicial/final esperado;
- quantidade de horas distintas;
- `ons_join_coverage` aceitável;
- ausência de duplicatas `usina_id + timestamp_utc`;
- geração não negativa e capacidade válida;
- meses ONS e ERA5 realmente sobrepostos.

Depois reinicie o serviço e consulte as capacidades:

```bash
docker compose restart ai-service
curl http://localhost:3333/system/capabilities
```

`historicalFirstTimestamp`, `historicalLastTimestamp` e
`historicalInstantCount` devem refletir o novo intervalo. Faça pelo menos um
replay da primeira e da última hora e uma exportação PWF antes de considerar o
mês publicado.

## Quanto histórico carregar

- Para demonstração do replay: alguns meses já permitem navegar por eventos.
- Para sazonalidade e treino: prefira pelo menos 12 meses; 24–36 meses são mais
  representativos quando a cobertura cadastral permanece consistente.
- Para setembro de 2027: ampliar o histórico ajuda o treino, mas não cria o
  vento futuro. Essa necessidade pertence à etapa 3 do roadmap.
