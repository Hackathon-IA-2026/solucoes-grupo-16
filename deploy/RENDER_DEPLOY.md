Guia de deploy por imagens Docker (Render)
========================================

Resumo rápido
- Se você não consegue ligar o repositório do GitHub ao Render por permissões da org, publique imagens Docker em um registry (Docker Hub ou GHCR) e crie serviços no Render apontando para essas imagens.

Fluxo geral
1. Build das imagens a partir dos Dockerfiles do monorepo
2. Push para um registry (Docker Hub ou GitHub Container Registry)
3. No Render: criar 3 serviços apontando para as imagens (frontend, backend, ai-service)

Convenções recomendadas de tags
- Use $(git rev-parse --short HEAD) para tag semântica: :sha-<short> e mantenha :latest opcional.

1) Exemplo: build e push manual (Docker Hub)

Substitua DOCKER_REPO por meuusuario ou meuorg.

```bash
# login (use token como senha)
docker login --username DOCKER_USER

# frontend
docker build -t DOCKER_REPO/climagrid-frontend:sha-$(git rev-parse --short HEAD) -f frontend/Dockerfile frontend
docker tag DOCKER_REPO/climagrid-frontend:sha-$(git rev-parse --short HEAD) DOCKER_REPO/climagrid-frontend:latest
docker push DOCKER_REPO/climagrid-frontend:sha-$(git rev-parse --short HEAD)
docker push DOCKER_REPO/climagrid-frontend:latest

Nota sobre o frontend (build-arg)
- O `frontend/Dockerfile` aceita o `ARG NEXT_PUBLIC_API_BASE_URL` em build-time
  e não força mais `http://localhost:3333` por padrão. Para embutir a URL do
  backend no bundle do Next.js use `--build-arg NEXT_PUBLIC_API_BASE_URL=...`.
  Exemplo: `docker build --build-arg NEXT_PUBLIC_API_BASE_URL=https://backend-ztk6.onrender.com -t "$DOCKER_REPO/climagrid-frontend:sha-$(git rev-parse --short HEAD)" -f frontend/Dockerfile frontend`.

Alternativa conveniente: use o script `deploy/push-images.sh` e passe a variável
`FRONTEND_API_BASE_URL` no ambiente — o script repassa como `--build-arg`.
```bash
DOCKER_REPO=victorszcruzpoli FRONTEND_API_BASE_URL=https://backend-ztk6.onrender.com ./deploy/push-images.sh --docker
```

# backend (NestJS)
docker build -t DOCKER_REPO/climagrid-backend:sha-$(git rev-parse --short HEAD) -f backend/Dockerfile backend
docker tag DOCKER_REPO/climagrid-backend:sha-$(git rev-parse --short HEAD) DOCKER_REPO/climagrid-backend:latest
docker push DOCKER_REPO/climagrid-backend:sha-$(git rev-parse --short HEAD)
docker push DOCKER_REPO/climagrid-backend:latest

# ai-service (FastAPI)
docker build -t DOCKER_REPO/climagrid-ai-service:sha-$(git rev-parse --short HEAD) -f backend/ai-service/Dockerfile backend/ai-service
docker tag DOCKER_REPO/climagrid-ai-service:sha-$(git rev-parse --short HEAD) DOCKER_REPO/climagrid-ai-service:latest
docker push DOCKER_REPO/climagrid-ai-service:sha-$(git rev-parse --short HEAD)
docker push DOCKER_REPO/climagrid-ai-service:latest
```

2) Exemplo: build e push para GHCR (GitHub Container Registry)

Substitua GITHUB_OWNER e REPO conforme seu repositório. Use um Personal Access Token (scope write:packages / read:packages).

```bash
# login
echo $GHCR_TOKEN | docker login ghcr.io -u GITHUB_USER --password-stdin

# tags com ghcr.io
docker build -t ghcr.io/GITHUB_OWNER/climagrid-frontend:sha-$(git rev-parse --short HEAD) -f frontend/Dockerfile frontend
docker push ghcr.io/GITHUB_OWNER/climagrid-frontend:sha-$(git rev-parse --short HEAD)

docker build -t ghcr.io/GITHUB_OWNER/climagrid-backend:sha-$(git rev-parse --short HEAD) -f backend/Dockerfile backend
docker push ghcr.io/GITHUB_OWNER/climagrid-backend:sha-$(git rev-parse --short HEAD)

docker build -t ghcr.io/GITHUB_OWNER/climagrid-ai-service:sha-$(git rev-parse --short HEAD) -f backend/ai-service/Dockerfile backend/ai-service
docker push ghcr.io/GITHUB_OWNER/climagrid-ai-service:sha-$(git rev-parse --short HEAD)
```

3) Automatizar com GitHub Actions (exemplo simplificado)

Coloque este workflow em .github/workflows/docker-publish.yml para automatizar push ao push na main.

```yaml
name: Build and push images
on:
  push:
    branches: [ main ]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      - name: Login to registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io # ou docker.io
          username: ${{ secrets.REGISTRY_USER }}
          password: ${{ secrets.REGISTRY_TOKEN }}
      - name: Build & push frontend
        run: |
          docker build -t ghcr.io/${{ github.repository_owner }}/climagrid-frontend:${{ github.sha }} -f frontend/Dockerfile frontend
          docker push ghcr.io/${{ github.repository_owner }}/climagrid-frontend:${{ github.sha }}
      - name: Build & push backend
        run: |
          docker build -t ghcr.io/${{ github.repository_owner }}/climagrid-backend:${{ github.sha }} -f backend/Dockerfile backend
          docker push ghcr.io/${{ github.repository_owner }}/climagrid-backend:${{ github.sha }}
      - name: Build & push ai-service
        run: |
          docker build -t ghcr.io/${{ github.repository_owner }}/climagrid-ai-service:${{ github.sha }} -f backend/ai-service/Dockerfile backend/ai-service
          docker push ghcr.io/${{ github.repository_owner }}/climagrid-ai-service:${{ github.sha }}
```

4) Usando as imagens no Render

- Registre as credenciais do registry no painel do Render:
  - Account → Private Docker Registry → Connect (Docker Hub) ou Custom Registry para GHCR (forneça server ghcr.io, username e token).
- Crie três serviços no Render (New → Web Service):
  - **Frontend**: escolha "Deploy from Docker image", informe a imagem (ex.: ghcr.io/OWNER/climagrid-frontend:sha-...). Defina NEXT_PUBLIC_API_BASE_URL → URL pública do backend.
  - **Backend**: imagem .../climagrid-backend:.... Defina AI_SERVICE_URL → URL do ai-service (se o ai-service for Private Service, use o hostname interno — Render mostra o hostname na página do serviço). Adicione variáveis do backend/.env.example necessárias.
  - **AI Service**: imagem .../climagrid-ai-service:.... Marque como Private Service (opção no momento da criação). Monte Persistent Disk se precisar de armazenamento (opção Volumes nas configurações do serviço) e monte no caminho que o ai-service espera (ex.: /service/data).

Observações de rede
- Se ai-service for Private, o backend pode chamar http://<ai-service-service-name>:8000 usando o hostname interno do Render. Defina AI_SERVICE_URL com esse hostname.
- Se não puder usar Private services, proteja endpoints com tokens e configure AI_SERVICE_URL para a URL pública.

Health checks e start commands
- Se a imagem já tiver CMD definido, normalmente não precisa preencher Start Command no Render. Caso precise, use:
  - Frontend: npm run start (ou conforme Dockerfile)
  - Backend: node dist/main.js ou npm run start:prod
  - AI: uvicorn app.main:app --host 0.0.0.0 --port 8000

Volumes e persistência
- O Render oferece Persistent Disks por serviço (pago). Para armazenar snapshots/artefatos do ai-service, crie um volume e monte no caminho esperado, ou migre para S3 e ajuste ARTIFACTS_PATH.

Exemplo de render.yaml (exemplo ilustrativo — substitua IMAGE e envVars):

```yaml
services:
  - type: web
    name: climagrid-frontend
    image: docker.io/DOCKER_REPO/climagrid-frontend:latest
    env: docker
    envVars:
      - key: NEXT_PUBLIC_API_BASE_URL
        value: https://<backend-url>

  - type: web
    name: climagrid-backend
    image: docker.io/DOCKER_REPO/climagrid-backend:latest
    env: docker
    envVars:
      - key: AI_SERVICE_URL
        value: http://climagrid-ai-service:8000

  - type: web
    name: climagrid-ai-service
    image: docker.io/DOCKER_REPO/climagrid-ai-service:latest
    env: docker
    plan: starter
    # marque como privado no painel do Render
```

5) Checklist rápido após deploy
- Ajuste NEXT_PUBLIC_API_BASE_URL e reconstrua o frontend se necessário.
- Verifique: /system/capabilities, /api/docs (backend) e /docs (FastAPI).
- Verifique logs no painel do Render.

Se quiser, eu:
- gero um render.yaml mais completo preenchido com placeholders do seu repo, ou
- gero um pequeno script deploy/push-images.sh pronto para usar (com DOCKER_REPO/GHCR variables) — qual prefere?
