# ClimaGrid

Aplicação para reproduzir uma hora histórica de geração eólica do Nordeste,
combinar a geração verificada da ONS com o vento ERA5, mapear os conjuntos para
as barras de um caso ANAREDE e exportar uma cópia do PWF com o `Pg` observado.

O contexto canônico para pessoas e agentes de IA está em
[`Docs/CONTEXTO_PROJETO_IA.md`](Docs/CONTEXTO_PROJETO_IA.md). O roadmap oficial
possui quatro etapas:

1. replay histórico — **implementado**;
2. upload climático do usuário → geração estimada → PWF — **próxima etapa e
   limite do MVP**;
3. escolha de hora futura → previsão de geração → PWF — pós-MVP;
4. curtailment — por último e fora do MVP.

## Arquitetura local

- `frontend/`: Next.js, sempre conectado ao NestJS;
- `backend/`: NestJS, fachada da aplicação, parser e writer PWF;
- `backend/ai-service/`: FastAPI, ingestão ERA5/ONS e replay histórico.

## Execução recomendada com Docker

O Docker é o caminho recomendado para desenvolvimento compartilhado. Ele fixa
Node.js 24 LTS e Python 3.13, instala exatamente as dependências dos lockfiles e
evita diferenças entre Linux, Windows e macOS.

### 1. Pré-requisitos

Instale:

- Docker Engine ou Docker Desktop;
- Docker Compose 2.24 ou superior;
- Git.

Confirme a instalação:

```bash
docker --version
docker compose version
```

Não é necessário instalar Node.js ou Python para usar o fluxo com Docker.

### 2. Configuração inicial

Na raiz do repositório, crie o arquivo opcional de configuração do Compose:

```bash
cp .env.example .env
```

Os valores padrão já funcionam nas portas 3000, 3333 e 8000. Edite o novo
`.env` apenas se alguma delas estiver ocupada.

O arquivo `backend/.env` também é opcional. Sem credenciais do Supabase, o
backend usa o volume local `backend-data`. Para usar Supabase, crie o arquivo
a partir do exemplo e substitua os placeholders por credenciais reais:

```bash
cp backend/.env.example backend/.env
```

O arquivo `backend/ai-service/.env` só é necessário para sobrescrever caminhos
ou configurar opções específicas da IA. Nunca faça commit de arquivos `.env`
ou de chaves do Supabase/CDS.

### 3. Construir e iniciar

```bash
docker compose up --build -d
```

Na primeira execução, o Docker baixa as imagens base e instala as dependências,
portanto o build pode levar alguns minutos. O Compose aguarda os health checks:
primeiro inicia o FastAPI, depois o NestJS e por último o frontend.

Confira o estado:

```bash
docker compose ps
```

Os três serviços devem aparecer como `healthy`. Acesse:

- interface: <http://localhost:3000>;
- backend NestJS: <http://localhost:3333>;
- Swagger: <http://localhost:3333/api/docs>;
- FastAPI: <http://localhost:8000/docs>;
- capacidades disponíveis: <http://localhost:3333/system/capabilities>.

### 4. Acompanhar logs

```bash
# Todos os serviços
docker compose logs -f

# Apenas um serviço
docker compose logs -f frontend
docker compose logs -f backend
docker compose logs -f ai-service
```

Use `Ctrl+C` para sair dos logs; os containers continuam executando.

### 5. Parar, reiniciar e reconstruir

```bash
# Parar e remover os containers, preservando dados
docker compose down

# Iniciar novamente
docker compose up -d

# Reconstruir depois de mudar dependências ou Dockerfiles
docker compose up --build -d
```

O comando `docker compose down -v` também apaga o volume local do backend.
Use-o somente quando quiser descartar deliberadamente os casos PWF armazenados.

### Rede, dados e variáveis

- O backend acessa a IA internamente por `http://ai-service:8000`.
- O navegador acessa o backend pela URL pública definida em
  `NEXT_PUBLIC_API_BASE_URL`, por padrão `http://localhost:3333`.
- Se alterar `BACKEND_PORT`, atualize também `NEXT_PUBLIC_API_BASE_URL` e
  reconstrua o frontend, pois variáveis `NEXT_PUBLIC_*` entram no bundle.
- Dados e artefatos da IA ficam nos diretórios
  `backend/ai-service/data` e `backend/ai-service/artifacts` do host.
- Casos PWF do fallback local ficam no volume Docker `backend-data`.

### Solução de problemas

Se uma porta estiver ocupada, altere as portas em `.env` e execute novamente
`docker compose up --build -d`. Para diagnosticar falhas:

```bash
docker compose ps
docker compose logs --tail=200 ai-service backend frontend
```

Um AI service saudável sem snapshot é um estado válido: a API inicia, mas o
replay histórico permanece bloqueado até a geração ONS e o ERA5 terem sido
unidos. O replay não depende de modelo preditivo.

## Replay histórico — os 7 passos operacionais

O recorte concluído usa a geração horária verificada da ONS, não a base de
restrições. Todos os comandos abaixo são executados na raiz do repositório.

1. Baixar SIGA e a composição oficial dos conjuntos ONS:

   ```bash
   docker compose run --rm ai-service python -m ingestion.era5.cli download-siga
   docker compose run --rm ai-service python -m ingestion.era5.cli download-ons-membership
   ```

2. Baixar a geração horária oficial do mês desejado:

   ```bash
   docker compose run --rm ai-service python -m ingestion.era5.cli \
     download-ons-generation --year 2024 --month 1
   ```

3. Construir o catálogo por CEG, com coordenadas e vigência:

   ```bash
   docker compose run --rm ai-service python -m ingestion.era5.cli build-catalog \
     --ons data/raw/ons/year=2024/month=01/GERACAO_USINA-2_2024_01.parquet \
     --plant-type EOL \
     --siga data/raw/siga/siga.csv \
     --ons-membership data/raw/ons/relacionamento_usina_conjunto.parquet
   ```

4. Baixar e extrair o ERA5 para o mesmo período:

   ```bash
   docker compose run --rm ai-service python -m ingestion.era5.cli backfill \
     --catalog data/processed/reference/plant_locations.parquet \
     --start 2024-01-01 --end 2024-01-31
   ```

5. Gerar o de-para CEG → barras a partir da planilha de referência:

   ```bash
   docker compose run --rm \
     -v "$PWD/Docs:/service/Docs:ro" \
     ai-service python -m ingestion.era5.cli build-pwf-mapping \
     --workbook "/service/Docs/Casos de Referência/Lista_de_Usinas.xlsx" \
     --catalog data/processed/reference/plant_locations.parquet \
     --output data/processed/reference/pwf_bus_mapping.parquet \
     --report data/processed/reference/pwf_bus_mapping_report.json
   ```

6. Unir geração e vento por conjunto e hora UTC:

   ```bash
   docker compose run --rm ai-service python -m ingestion.era5.cli join-ons \
     --ons data/raw/ons/year=2024/month=01/GERACAO_USINA-2_2024_01.parquet \
     --weather data/processed/era5/year=2024/month=01/weather_hourly.parquet \
     --catalog data/processed/reference/plant_locations.parquet \
     --ons-format generation \
     --output data/processed/historical/observations.parquet \
     --report data/processed/historical/report.json
   ```

7. Subir a aplicação e percorrer Hora → Usinas → Barras → Exportar:

   ```bash
   docker compose up --build -d
   docker compose ps
   ```

O caso PWF deve corresponder ao horizonte da planilha de barras. Para o arquivo
`Lista_de_Usinas.xlsx`, use preferencialmente um caso de 2040. Um mesmo conjunto
ONS pode alimentar várias barras; a interface distribui a geração por capacidade
conectada e o backend soma parcelas que chegam à mesma barra.

Para adicionar fevereiro, um ano completo ou outro intervalo, não basta baixar
um arquivo: catálogo, ERA5, mapa de barras e snapshot consolidado devem ser
reconstruídos com todos os meses desejados. O procedimento está em
[`Docs/OPERACAO_HISTORICO_MENSAL.md`](Docs/OPERACAO_HISTORICO_MENSAL.md).

## Execução nativa opcional

O ambiente nativo requer Node.js 24.15+ (24.21.0 em `.nvmrc`) e Python 3.13.
Não reutilize uma `.venv` criada com Python 3.10.

```bash
nvm install
nvm use

cd backend/ai-service
python3.13 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip setuptools wheel
python -m pip install -r requirements-dev.txt
```

Depois, abra três terminais e execute:

```bash
# terminal 1
cd backend/ai-service
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# terminal 2
cd backend
npm ci
npm run start:dev

# terminal 3
cd frontend
npm ci
npm run dev
```

Para verificar o projeto nativamente:

```bash
cd backend && npm run lint && npm run build && npm test && npm run test:e2e
cd ../frontend && npm run lint && npm run build
cd ../backend/ai-service && python -m pytest -q
```

## Estado atual dos dados

`GET /system/capabilities` informa o que está realmente disponível. Nesta cópia
de trabalho, o snapshot de janeiro de 2024 está em
`backend/ai-service/data/processed/historical/observations.parquet`; ele contém
741 horas disponíveis entre 1 e 31 de janeiro. Os dados brutos e processados são
ignorados pelo Git e precisam ser preservados ou republicados separadamente.

O upload de cenário futuro, a estimativa por IA e o classificador de
curtailment permanecem fora deste recorte. A interface do MVP identifica
explicitamente o fluxo atual como replay de geração observada.

## Preparação para AWS

O `compose.yaml` é a orquestração local. Para produção, publique as três
imagens no Amazon ECR e execute frontend, backend e AI service como serviços
separados no ECS/Fargate, permitindo escala independente. Mantenha a IA em rede
privada, exponha frontend/backend por load balancer e injete credenciais pelo
AWS Secrets Manager ou Parameter Store.

A ingestão ERA5/ONS deve ser executada como tarefa agendada separada. Snapshots
e artefatos de modelo não entram nas imagens: em produção, devem vir de S3/EFS
ou de uma etapa explícita de inicialização.
