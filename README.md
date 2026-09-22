# ClimaGrid

Aplicação para combinar clima ERA5, operação ONS e um modelo físico/híbrido de
geração eólica, mapear usinas para barras de um caso ANAREDE e exportar uma
cópia do PWF com a geração ativa atualizada.

## Arquitetura local

- `frontend/`: Next.js, sempre conectado ao NestJS;
- `backend/`: NestJS, fachada da aplicação, parser e writer PWF;
- `backend/ai-service/`: FastAPI, ingestão ERA5/ONS e predição.

## Como executar

O projeto requer Node 20+ e Python 3.10+. Há um `.nvmrc` para selecionar a
versão já disponível no ambiente.

```bash
nvm use
```

Abra três terminais:

```bash
# terminal 1
cd backend/ai-service
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

```bash
# terminal 2
cd backend
npm run start:dev
```

```bash
# terminal 3
cd frontend
npm run dev
```

A interface fica em `http://localhost:3000`, o NestJS em
`http://localhost:3333` e a documentação do backend em
`http://localhost:3333/api/docs`.

O arquivo local ignorado `frontend/.env.local` já aponta para o NestJS. As
variáveis versionadas de exemplo ficam nos arquivos `.env.example`.

## Estado atual dos dados

`GET /system/capabilities` informa o que está realmente disponível. Enquanto o
snapshot `backend/ai-service/data/processed/training/snapshot_unido.parquet`
não existir, o frontend bloqueia a estimativa histórica e explica que ainda é
necessário processar o ERA5 e executar `join-ons`. O upload climático e o
classificador de curtailment também permanecem explicitamente desabilitados.
