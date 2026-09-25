# Deploy no Render Free com GitHub Actions

Este projeto usa três Web Services públicos no Render e imagens Docker no
Docker Hub. O workflow é manual: ele valida os três componentes, publica
imagens versionadas por commit e aciona os serviços pela API do Render.

## Arquitetura usada no hackathon

- `climagrid-frontend`: Web Service Free;
- `climagrid-backend`: Web Service Free;
- `climagrid-ai-service`: Web Service Free público;
- Supabase Storage: persistência dos casos PWF, cenários climáticos, CSVs,
  manifestos e PWFs exportados;
- filesystem do Render: somente cache temporário;
- Docker Hub: imagens da aplicação e imagem versionada dos dados históricos.

O AI service público é uma decisão consciente para o ambiente de demonstração.
Ele não possui autenticação própria. Não reutilize essa topologia para dados
sensíveis ou produção sem adicionar autenticação e limitação de requisições.

## 1. Preparar o Supabase

Execute `backend/supabase/schema.sql` no SQL Editor. No Storage, crie um bucket
privado chamado `pwf`. O backend usa estes prefixos no mesmo bucket:

```text
reference-cases/<uuid>/
climate-scenarios/<uuid>/
climate-scenarios/<uuid>/exports/<uuid>/
```

Use uma `service_role` key somente no backend. Ela nunca deve ser colocada no
frontend, em `NEXT_PUBLIC_*` ou no GitHub Actions.

## 2. Configurar os serviços no Render

Os três serviços precisam apontar para as imagens do mesmo namespace do Docker
Hub usado em `DOCKER_REPO`. Se o registry for privado, cadastre uma credencial
do Docker Hub em Workspace Settings e associe-a aos três serviços.

### Frontend

```dotenv
PORT=3000
HOSTNAME=0.0.0.0
```

Health check: `/`.

`NEXT_PUBLIC_API_BASE_URL` é incorporada à imagem pelo GitHub Actions durante
o build. Alterá-la apenas no runtime do Render não altera o bundle já criado.

### Backend

```dotenv
NODE_ENV=production
PORT=3333
AI_SERVICE_URL=https://SEU-AI-SERVICE.onrender.com
FRONTEND_ORIGIN=https://SEU-FRONTEND.onrender.com
PWF_STORAGE_ROOT=/app/data/pwf
SCENARIO_STORAGE_ROOT=/app/data/scenarios
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_KEY=SUA-SERVICE-ROLE-KEY
SUPABASE_BUCKET=pwf
```

Health check: `/`.

Não use barra final em `AI_SERVICE_URL` ou `FRONTEND_ORIGIN`. Os caminhos
locais continuam configurados como cache/fallback, mas no plano Free a
durabilidade vem do Supabase Storage.

### AI service

```dotenv
PORT=8000
CDSAPI_URL=https://cds.climate.copernicus.eu/api
CDSAPI_KEY=SEU-TOKEN-CDS
CLIMAGRID_DATA_ROOT=/service/data
CLIMAGRID_HISTORICAL_SNAPSHOT=/service/data/processed/historical/observations.parquet
CLIMAGRID_PLANT_CATALOG=/service/data/processed/reference/plant_locations.parquet
CLIMAGRID_PWF_MAPPING=/service/data/processed/reference/pwf_bus_mapping.parquet
CLIMAGRID_ARTIFACT_DIR=/service/artifacts/global/v1
```

Health check: `/health`.

Sem Persistent Disk, os meses ERA5 baixados sob demanda são cache efêmero e
podem ser baixados novamente depois de um restart. O catálogo, o mapa PWF e o
snapshot inicial continuam presentes porque o workflow os incorpora à imagem
do AI service.

## 3. Configurar os secrets do GitHub Actions

Em Settings → Secrets and variables → Actions → Repository secrets, crie:

| Secret | Conteúdo |
| --- | --- |
| `DOCKER_REPO` | namespace do Docker Hub, por exemplo `victorszcruzpoli` |
| `DOCKERHUB_USERNAME` | usuário do Docker Hub |
| `DOCKERHUB_TOKEN` | token Docker Hub com leitura e escrita |
| `RENDER_API_KEY` | API key do Render |
| `RENDER_SERVICE_ID_AI` | ID `srv-...` do AI service |
| `RENDER_SERVICE_ID_BACKEND` | ID `srv-...` do backend |
| `RENDER_SERVICE_ID_FRONTEND` | ID `srv-...` do frontend |
| `RENDER_BACKEND_URL` | URL pública completa do backend |

O workflow atual usa Repository secrets. Não coloque `CDSAPI_KEY` ou
`SUPABASE_KEY` no GitHub: elas são variáveis de runtime no Render.

## 4. Publicar a imagem de dados históricos

O workflow espera a tag registrada em `deploy/historical-data-version.txt`.
Antes do primeiro deploy, confirme que esta imagem existe no Docker Hub:

```bash
docker login --username SEU_USUARIO
DOCKER_REPO=SEU_NAMESPACE ./deploy/publish-historical-data.sh --push
```

Quando catálogo, mapa ou snapshot validado mudarem, gere uma nova tag no
arquivo de versão, atualize os hashes, publique a imagem e só então faça o
deploy da aplicação.

## 5. Promover para main e implantar

1. Abra um pull request de `develop` para `main`.
2. Revise e faça o merge.
3. Abra Actions → **Build, push and deploy to Render**.
4. Clique em **Run workflow** e selecione `main`.
5. Aguarde o job `Validate application`.
6. O job seguinte publica `sha-<commit>` e `latest`, implanta AI, backend e
   frontend nessa ordem e consulta `/system/capabilities` ao final.

O workflow usa `workflow_dispatch`; merge em `main` não implanta sozinho.
Execuções concorrentes de produção são serializadas.

## 6. Verificação após o deploy

```bash
curl -fsS https://SEU-BACKEND.onrender.com/system/capabilities
curl -fsS https://SEU-AI-SERVICE.onrender.com/health
```

Na resposta de capacidades, confirme AI online, catálogo disponível,
`historical_on_demand` e cenário ERA5 habilitados. Depois percorra no frontend:

1. cenário ERA5 para uma hora histórica;
2. revisão das usinas;
3. upload do PWF;
4. mapeamento e exportação;
5. consulta de `GET /climate-scenarios/:id`;
6. reinício manual do backend;
7. nova consulta do mesmo cenário, comprovando recuperação pelo Supabase.

O plano Free pode suspender serviços inativos. A primeira chamada depois da
suspensão pode ser lenta, e o frontend pode precisar repetir a operação quando
backend e AI service estiverem acordando ao mesmo tempo.
