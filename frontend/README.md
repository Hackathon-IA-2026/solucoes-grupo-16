# ClimaGrid — frontend

> Leia [`../Docs/CONTEXTO_PROJETO_IA.md`](../Docs/CONTEXTO_PROJETO_IA.md) antes de
> alterar o fluxo. A interface atual implementa a etapa 1. A próxima etapa é o
> cenário climático enviado pelo usuário e encerra o escopo do MVP.

Interface do MVP para reproduzir a geração eólica observada em uma hora,
mapear conjuntos ONS para barras elétricas e gerar um PWF para estudo no
ANAREDE.

O recorte implementado segue o documento técnico do projeto:

1. seleção de uma hora disponível no snapshot ONS + ERA5;
2. revisão da geração ONS e do vento ERA5 por conjunto eólico do Nordeste;
3. upload do caso PWF e validação das alocações sugeridas por CEG;
4. exportação do PWF, sem executar fluxo de potência no frontend.

## Execução local

```bash
npm install
npm run dev
```

Sem configuração adicional, a aplicação inicia em **modo demonstração**. Os dados são fictícios, o estado do cenário fica no `localStorage` e o download final recebe o sufixo `.pwf.txt` para não ser confundido com um arquivo válido do ANAREDE. Com a URL da API presente, não existe queda silenciosa para mocks: falhas e insumos ausentes são mostrados ao usuário.

## Conexão com o backend

Copie `.env.example` para `.env.local` e configure:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3333
```
Copie `.env.example` para `.env.local` e configure (development):

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3333
```

## Produção / Docker build note
- Quando construir a imagem Docker do frontend para implantação, defina a URL do backend como um build-arg para que o Next.js a injete no pacote de produção.
	Exemplo usando o script auxiliar incluído:

```bash
DOCKER_REPO=victorszcruzpoli \
FRONTEND_API_BASE_URL=https://backend-ztk6.onrender.com \
./deploy/push-images.sh --docker
```

Ou, se você construir manualmente:

```bash
docker build --build-arg NEXT_PUBLIC_API_BASE_URL=https://backend-ztk6.onrender.com \
	-t victorszcruzpoli/climagrid-frontend:sha-$(git rev-parse --short HEAD) \
	-f frontend/Dockerfile frontend
```

O navegador conversa somente com o NestJS; o FastAPI permanece um serviço interno. O acesso HTTP está isolado em `src/lib/api.ts` e usa os contratos abaixo:

| Método | Endpoint | Responsabilidade |
| --- | --- | --- |
| `GET` | `/system/capabilities` | Informar disponibilidade do NestJS, IA, ONS, ERA5 e modelo |
| `POST` | `/climate-scenarios/historical` | Reproduzir uma hora observada do snapshot ONS + ERA5 |
| `POST` | `/pwf/reference-cases` | Armazenar e validar o caso base `.pwf` |
| `GET` | `/pwf/reference-cases/:id/generation-targets` | Listar barras geradoras do caso base |
| `POST` | `/pwf/exports` | Gerar o PWF e devolver o arquivo como `Blob` |

Na exportação, a API devolve os cabeçalhos `x-filename`, `x-generated-at`,
`x-generation-source`, `x-data-version` e `x-modified-buses` para preencher o
log de proveniência.

Os tipos compartilhados pelo frontend ficam em `src/types/climagrid.ts`. A regra de negócio permanece no backend; as validações locais existem para feedback rápido e não substituem a validação oficial dos dados ou do PWF.

O upload de cenário futuro, a estimativa por IA e a classificação de
curtailment permanecem fora desta etapa. Não há queda silenciosa do replay real
para dados previstos ou fictícios.

Roadmap da interface:

1. replay histórico observado — implementado;
2. arquivo climático do usuário e PWF de uma hora — próximo/MVP;
3. hora futura prevista — pós-MVP;
4. curtailment — fora do MVP.

## Verificação

```bash
npm run lint
npm run build
```
