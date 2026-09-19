# ClimaGrid — frontend

Interface do MVP para transformar um cenário de vento em estimativas de geração eólica, mapear usinas para barras elétricas e solicitar a geração de um arquivo PWF para estudo no ANAREDE.

O recorte implementado segue o documento técnico do projeto:

1. entrada histórica ERA5/ONS ou upload de cenário climático;
2. revisão e seleção das estimativas por usina eólica do Nordeste;
3. mapeamento manual usina → barra e envio de um caso base PWF;
4. leitura de risco e exportação, sem executar fluxo de potência no frontend.

## Execução local

```bash
npm install
npm run dev
```

Sem configuração adicional, a aplicação inicia em **modo demonstração**. Os dados são fictícios, o estado do cenário fica no `localStorage` e o download final recebe o sufixo `.pwf.txt` para não ser confundido com um arquivo válido do ANAREDE.

## Conexão com o backend

Copie `.env.example` para `.env.local` e configure:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3333
```

O acesso HTTP está isolado em `src/lib/api.ts`. Esse adaptador espera inicialmente os seguintes contratos REST, que podem ser ajustados em um único arquivo quando a API NestJS estabilizar:

| Método | Endpoint | Responsabilidade |
| --- | --- | --- |
| `POST` | `/climate-scenarios/historical` | Criar cenário a partir do snapshot ERA5/ONS |
| `POST` | `/climate-scenarios/upload` | Receber CSV/XLSX e devolver o cenário validado |
| `POST` | `/generation/estimates` | Estimar geração por usina a partir de `scenarioId` |
| `POST` | `/pwf/reference-cases` | Armazenar e validar o caso base `.pwf` |
| `POST` | `/pwf/exports` | Gerar o PWF e devolver o arquivo como `Blob` |

Na exportação, a API pode devolver os cabeçalhos `x-filename`, `x-generated-at`, `x-model-version` e `x-data-version` para preencher o log de proveniência.

Os tipos compartilhados pelo frontend ficam em `src/types/climagrid.ts`. A regra de negócio permanece no backend; as validações locais existem para feedback rápido e não substituem a validação oficial dos dados ou do PWF.

## Verificação

```bash
npm run lint
npm run build
```
