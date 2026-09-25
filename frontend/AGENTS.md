<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Contexto do ClimaGrid

Leia `../AGENTS.md` e `../Docs/CONTEXTO_PROJETO_IA.md` antes de alterar o fluxo.
A interface atual é o replay histórico da etapa 1. A próxima tarefa do MVP é a
etapa 2: upload de arquivo climático, escolha de uma hora, cálculo de geração e
exportação do PWF. Não reintroduza curtailment ou previsão futura nesta etapa.
