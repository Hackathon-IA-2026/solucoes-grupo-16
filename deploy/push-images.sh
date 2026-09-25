#!/usr/bin/env bash
set -euo pipefail

# Script para build e push das imagens do monorepo
# Uso:
#   DOCKER_REPO=meuusuario ./deploy/push-images.sh --docker
#   GHCR_OWNER=meuusuario GHCR_TOKEN=... ./deploy/push-images.sh --ghcr

usage(){
  cat <<EOF
Usage: $0 [--docker | --ghcr] [--tag TAG]

Options:
  --docker       Push para Docker Hub (requere DOCKER_USER/Docker login)
  --ghcr         Push para GitHub Container Registry (ghcr.io)
  --tag TAG      Tag a usar (default: sha-<short> e latest)
EOF
  exit 1
}

if [ $# -eq 0 ]; then
  usage
fi

REGISTRY="docker"
TAG_OVERRIDE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --docker) REGISTRY="docker"; shift ;;
    --ghcr) REGISTRY="ghcr"; shift ;;
    --tag) TAG_OVERRIDE="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown arg: $1"; usage ;;
  esac
done

SHORT=$(git rev-parse --short HEAD 2>/dev/null || echo "local")
TAG=${TAG_OVERRIDE:-"sha-${SHORT}"}

build_and_push_docker(){
  DOCKER_REPO=${DOCKER_REPO:-"victorszcruzpoli"}
  echo "Building and pushing images to Docker Hub repo: ${DOCKER_REPO}"

  echo "Building frontend"
  FRONTEND_API_BASE_URL=${FRONTEND_API_BASE_URL:-}
  docker build --build-arg NEXT_PUBLIC_API_BASE_URL="${FRONTEND_API_BASE_URL}" -t ${DOCKER_REPO}/climagrid-frontend:${TAG} -f frontend/Dockerfile frontend
  docker tag ${DOCKER_REPO}/climagrid-frontend:${TAG} ${DOCKER_REPO}/climagrid-frontend:latest
  docker push ${DOCKER_REPO}/climagrid-frontend:${TAG}
  docker push ${DOCKER_REPO}/climagrid-frontend:latest

  echo "Building backend"
  docker build -t ${DOCKER_REPO}/climagrid-backend:${TAG} -f backend/Dockerfile backend
  docker tag ${DOCKER_REPO}/climagrid-backend:${TAG} ${DOCKER_REPO}/climagrid-backend:latest
  docker push ${DOCKER_REPO}/climagrid-backend:${TAG}
  docker push ${DOCKER_REPO}/climagrid-backend:latest

  echo "Building ai-service"
  docker build -t ${DOCKER_REPO}/climagrid-ai-service:${TAG} -f backend/ai-service/Dockerfile backend/ai-service
  docker tag ${DOCKER_REPO}/climagrid-ai-service:${TAG} ${DOCKER_REPO}/climagrid-ai-service:latest
  docker push ${DOCKER_REPO}/climagrid-ai-service:${TAG}
  docker push ${DOCKER_REPO}/climagrid-ai-service:latest
}

build_and_push_ghcr(){
  GHCR_OWNER=${GHCR_OWNER:-"victorszcruzpoli"}
  echo "Building and pushing images to GHCR owner: ${GHCR_OWNER}"

  FRONT_TAG=ghcr.io/${GHCR_OWNER}/climagrid-frontend:${TAG}
  BACK_TAG=ghcr.io/${GHCR_OWNER}/climagrid-backend:${TAG}
  AI_TAG=ghcr.io/${GHCR_OWNER}/climagrid-ai-service:${TAG}

  echo "Building frontend"
  FRONTEND_API_BASE_URL=${FRONTEND_API_BASE_URL:-}
  docker build --build-arg NEXT_PUBLIC_API_BASE_URL="${FRONTEND_API_BASE_URL}" -t ${FRONT_TAG} -f frontend/Dockerfile frontend
  docker push ${FRONT_TAG}

  echo "Building backend"
  docker build -t ${BACK_TAG} -f backend/Dockerfile backend
  docker push ${BACK_TAG}

  echo "Building ai-service"
  docker build -t ${AI_TAG} -f backend/ai-service/Dockerfile backend/ai-service
  docker push ${AI_TAG}
}

if [ "${REGISTRY}" = "docker" ]; then
  build_and_push_docker
else
  build_and_push_ghcr
fi

echo "Done. Images pushed with tag: ${TAG}" 
