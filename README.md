# ClimaGrid

Aplicação para combinar clima ERA5, operação ONS e um modelo físico/híbrido de
geração eólica, mapear usinas para barras de um caso ANAREDE e exportar uma
cópia do PWF com a geração ativa atualizada.

## Arquitetura local

- `frontend/`: Next.js, sempre conectado ao NestJS;
- `backend/`: NestJS, fachada da aplicação, parser e writer PWF;
- `backend/ai-service/`: FastAPI, ingestão ERA5/ONS e predição.

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

Um AI service saudável sem snapshot ou modelo é um estado válido: a API inicia
com a curva física de fallback, mas a estimativa histórica permanece bloqueada
até os dados necessários existirem.

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

`GET /system/capabilities` informa o que está realmente disponível. Enquanto o
snapshot `backend/ai-service/data/processed/training/snapshot_unido.parquet`
não existir, o frontend bloqueia a estimativa histórica e explica que ainda é
necessário processar o ERA5 e executar `join-ons`. O upload climático e o
classificador de curtailment também permanecem explicitamente desabilitados.

## Preparação para AWS

O `compose.yaml` é a orquestração local. Para produção, publique as três
imagens no Amazon ECR e execute frontend, backend e AI service como serviços
separados no ECS/Fargate, permitindo escala independente. Mantenha a IA em rede
privada, exponha frontend/backend por load balancer e injete credenciais pelo
AWS Secrets Manager ou Parameter Store.

A ingestão ERA5/ONS deve ser executada como tarefa agendada separada. Snapshots
e artefatos de modelo não entram nas imagens: em produção, devem vir de S3/EFS
ou de uma etapa explícita de inicialização.
