# ClimaGrid — Documentação Técnica Final e Completa

**Data de geração:** 26 de setembro de 2026
**Fonte:** análise direta de todos os arquivos do repositório
**Escopo geográfico:** conjuntos eólicos do subsistema Nordeste (NE)

> Este documento consolida e corrige os documentos anteriores
> (`DOCUMENTACAO_TECNICA_COMPLETA_CLIMAGRID.md` e `ANALISE_CODIGO_VS_DOC.md`),
> com base na leitura integral do código-fonte do frontend, backend e AI service.

---

## 1. Visão geral do produto

O ClimaGrid é uma plataforma que transforma condições climáticas associadas a
usinas eólicas em injeções de potência ativa (`Pg`) num caso PWF do ANAREDE.
Em termos práticos:

- recupera geração observada da ONS e vento ERA5 para uma hora histórica;
- normaliza cenários climáticos vindos do usuário ou do ERA5;
- calcula um potencial eólico físico por usina/conjunto (com possibilidade de
  correção ML híbrida quando o modelo estiver aprovado);
- distribui essa geração para barras do caso PWF;
- exporta uma cópia do PWF original com somente o campo `Pg` alterado;
- persiste a trilha, os manifestos, os hashes e os arquivos gerados.

**O ClimaGrid não substitui o fluxo de potência do ANAREDE.** Ele prepara
cenários e exporta arquivos de entrada para análise elétrica, sem afirmar que
o caso converge.

---

## 2. Estado real do produto — roadmap em quatro etapas

| # | Etapa | Estado | Descrição |
|---|-------|--------|-----------|
| 1 | Replay histórico | **Implementada** | Seleciona hora histórica, recupera geração ONS + ERA5, mapeia barras e exporta PWF |
| 2 | Cenário climático do usuário | **Protótipo ponta a ponta em validação** | CSV normalizado ou ERA5 histórico; estima potencial físico; gera PWF |
| 3 | Hora futura | Pós-MVP | Não implementado; exige fonte meteorológica futura explícita |
| 4 | Curtailment | Fora do MVP | Não há código nem modelagem dedicada |

---

## 3. Arquitetura do sistema

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────────────┐
│   Frontend       │────▶│   Backend        │────▶│   AI Service             │
│   Next.js 16     │     │   NestJS 12      │     │   FastAPI + Python 3.13  │
│   React 19       │     │   Vitest          │     │   LightGBM, Pandas,      │
│   Tailwind CSS 4 │     │   Swagger/OpenAPI │     │   xarray, netCDF4        │
│   Port :3000     │     │   Port :3333      │     │   Port :8000             │
└──────────────────┘     └──────────────────┘     └──────────────────────────┘
        │                        │                         │
        │                  Volume Docker             Volumes montados
        │                  backend-data/             data/ e artifacts/
        │                  (cenários, PWFs,
        │                   manifestos)
        └── NEXT_PUBLIC_API_BASE_URL (http://localhost:3333) ──┘
```

### 3.1 Frontend — Next.js 16

**Localização:** `frontend/`

**Stack técnica real:**
| Tecnologia | Versão | Finalidade |
|---|---|---|
| Next.js | 16.3.5 | Framework SSR/SSG |
| React | 19.2.8 | Biblioteca de UI |
| React DOM | 19.2.8 | Renderização no browser |
| Tailwind CSS | ^4 | Sistema de design e estilização |
| `@tailwindcss/postcss` | ^4 | Integração PostCSS |
| `babel-plugin-react-compiler` | 1.0.0 | React Compiler (otimização automática de renders) |
| TypeScript | ^5 | Tipagem estática |
| ESLint | 9.39.5 + eslint-config-next | Análise estática de código |

**Estrutura de diretórios:**
```
frontend/src/
├── app/                      # Pages (App Router do Next.js)
│   ├── page.tsx              # Página inicial — seleção de instante histórico
│   ├── cenario-climatico/    # Upload de CSV ou seleção ERA5
│   ├── usinas-estimativas/   # Revisão da geração por usina
│   ├── mapeamento-barras/    # Associação usina → barra PWF
│   ├── exportacao-pwf/       # Download do PWF final
│   ├── layout.tsx            # Layout raiz
│   ├── providers.tsx         # Context providers
│   └── globals.css           # Design system (Tailwind + tokens)
├── components/
│   ├── features/             # Componentes de domínio
│   │   ├── climate/          #   Cenário climático
│   │   ├── generation/       #   Visualização de geração
│   │   ├── bus-mapping/      #   Mapeamento de barras
│   │   └── pwf-export/       #   Exportação PWF
│   ├── layout/               # Shell da aplicação
│   │   ├── app-shell.tsx     #   Container principal
│   │   ├── sidebar.tsx       #   Navegação lateral
│   │   ├── topbar.tsx        #   Barra superior
│   │   ├── app-footer.tsx    #   Rodapé
│   │   └── workflow-stepper.tsx  # Indicador de etapas
│   └── ui/                   # Componentes genéricos reutilizáveis
│       ├── icon.tsx          #   Sistema de ícones SVG
│       ├── notice.tsx        #   Componente de avisos
│       └── page-header.tsx   #   Cabeçalho de página
├── context/
│   ├── scenario-context.tsx  # Estado global do cenário (React Context + localStorage)
│   └── system-context.tsx    # Capabilities do sistema
├── lib/
│   ├── api.ts                # Cliente HTTP para o backend NestJS
│   ├── mock-data.ts          # Dados de demonstração local
│   └── workflow.ts           # Definição das 4 etapas do assistente
└── types/
    └── climagrid.ts          # Tipos TypeScript do domínio (212 linhas)
```

**Jornada do usuário (workflow de 4 passos):**
1. **Hora** (`/`) — Seleção de instante histórico, upload CSV ou busca ERA5
2. **Usinas** (`/usinas-estimativas`) — Revisão da geração por parque eólico
3. **Barras** (`/mapeamento-barras`) — Associação manual usina → barra PWF
4. **Exportar** (`/exportacao-pwf`) — Download do arquivo PWF final

**Comportamento dual:**
- **Modo demonstração** (sem `NEXT_PUBLIC_API_BASE_URL`): funciona localmente
  com dados fictícios de `mock-data.ts`; o PWF exportado é um texto
  demonstrativo sem validade para o ANAREDE.
- **Modo conectado** (com API configurada): exige conexão real com o backend;
  todas as respostas são dados reais.

**Gerenciamento de estado:**
- `ScenarioProvider` em `scenario-context.tsx`: gerencia
  `ClimateScenario`, `WindPlantEstimate[]`, `selectedPlantIds`, `StudyDraft`
  (nome do estudo, PWF de referência, barras e mapeamentos).
- Persiste no `localStorage` com a chave `climagrid:historical-replay:v2`.
- `SystemProvider` em `system-context.tsx`: consulta `GET /system/capabilities`
  e expõe o estado do sistema.

**Tipagem de domínio completa (`climagrid.ts`, 212 linhas):**
- `ClimateSource`: `"historical" | "upload" | "era5"`
- `ClimateScenario`: id, source, mode (`replay | scenario | forecast`),
  subsystem, timestamp, rastreabilidade completa
- `WindPlantEstimate`: 16+ campos incluindo geração observada/estimada,
  vento, alocações sugeridas de barra
- `ReferencePwf`: metadados do caso base (versão ANAREDE, encoding, blocos)
- `PwfGenerationTarget`: barras editáveis com grupos geradores
- `SystemCapabilities`: estado de backend, IA, dados, modelo

---

### 3.2 Backend — NestJS 12

**Localização:** `backend/`

**Stack técnica real:**
| Tecnologia | Versão | Finalidade |
|---|---|---|
| NestJS | ^12.0.1 (core, common, platform-express) | Framework backend |
| @nestjs/swagger | ^12.0.1 | Documentação OpenAPI automática |
| @supabase/supabase-js | ^2.116.0 | Storage remoto no Supabase |
| dotenv | ^18.0.1 | Variáveis de ambiente |
| rxjs | ^7.8.1 | Programação reativa |
| reflect-metadata | ^0.2.2 | Decorators do NestJS |
| TypeScript | ^6.0.2 | Tipagem estática |
| Vitest | ^4.1.2 | Testes unitários e e2e |
| @vitest/coverage-v8 | ^4.1.2 | Cobertura de testes |
| oxlint | ^1.58.0 | Linter rápido Rust-based |
| supertest | ^7.0.0 | Testes HTTP |
| prettier | ^3.4.2 | Formatação de código |

**Módulos do backend (arquitetura modular NestJS):**

```
backend/src/
├── main.ts                     # Bootstrap, CORS, Swagger
├── app.module.ts               # Módulo raiz
├── app.controller.ts           # Health check
├── app.service.ts              # Serviço raiz
├── http-body-parser.ts         # Configuração de body parsers
└── modules/
    ├── integration/            # Fachada de integração com o AI Service
    │   ├── integration.controller.ts   # 6 endpoints (381 linhas)
    │   ├── ai-service.client.ts        # Cliente HTTP para FastAPI (230 linhas)
    │   └── integration.module.ts
    ├── pwf/                    # Domínio PWF completo
    │   ├── api/
    │   │   ├── pwf-reference-case.controller.ts  # Upload e consulta
    │   │   ├── pwf-export.controller.ts          # Exportação final
    │   │   └── dto/                              # Data Transfer Objects
    │   ├── application/
    │   │   ├── pwf-export.service.ts             # Lógica de exportação (362 linhas)
    │   │   └── pwf-reference-case.service.ts     # Lógica de upload/parsing
    │   ├── parser/
    │   │   └── pwf-parser.service.ts             # Parser binário Latin-1 (495 linhas)
    │   ├── domain/
    │   │   └── pwf.types.ts                      # Tipos do domínio PWF (117 linhas)
    │   ├── storage/
    │   │   └── pwf-storage.service.ts            # Armazenamento local + Supabase
    │   └── pwf.module.ts
    ├── climate-scenario/       # Persistência de cenários climáticos
    │   ├── climate-scenario-storage.service.ts   # Gravação de manifesto/CSV/export
    │   ├── climate-scenario.types.ts             # Tipos do manifesto (82 linhas)
    │   ├── climate-scenario.controller.ts        # Consulta de cenários
    │   └── climate-scenario.module.ts
    └── supabase/               # Integração com Supabase Storage
        ├── supabase.service.ts                   # Upload/download no bucket
        └── supabase.module.ts
```

**Parser PWF (`pwf-parser.service.ts` — 495 linhas):**

O parser é binário a nível de byte, operando sobre `Buffer` Latin-1. Ele:
- Valida bytes NUL, BOM UTF-8 e UTF-8 multibyte
- Detecta e preserva line endings (CRLF/LF/MIXED)
- Reconhece 28 códigos de bloco ANAREDE: `TITU`, `DAGR`, `DARE`, `DBAR`,
  `DBSH`, `DCAI`, `DCBA`, `DCCV`, `DCER`, `DCLI`, `DCMT`, `DCNV`, `DCSC`,
  `DCTE`, `DCTG`, `DCTR`, `DELO`, `DGBT`, `DGEI`, `DGER`, `DGLT`, `DLIN`,
  `DOPC`, `DREF`, `DSHL`, `DTPF`, `DVSC`, `EXLF`
- Extrai campos fixos por posição de coluna para `DBAR`, `DGBT`, `DGER`, `DGEI`
- Retorna `PwfFieldReference` com `byteOffset` e `width` para edição in-place
- Versão suportada: `12.3.4`; outras são `unverified`

**Serviço de exportação (`pwf-export.service.ts` — 362 linhas):**

Para cenários estimados, o serviço:
1. Recupera o manifesto do cenário climático persistido
2. Valida a proveniência (`dataVersion`, `generationSource`)
3. Valida cada usina contra as observações do manifesto
4. Bloqueia mapeamento PWF parcial (0% permite alocação manual; parcial é bloqueado)
5. Calcula a geração autoritativa como `estimatedGenerationMw × allocationFactor`
6. Exige que os fatores de alocação de cada usina somem exatamente 100%
7. Soma geração de várias usinas na mesma barra
8. Rejeita barras inexistentes, swing (tipo 2), desligadas, e limites excedidos
9. Edita somente `Pg` via `Buffer.write()` na posição exata
10. Persiste o manifesto de exportação (`climagrid-pwf-export-v1`)

**CORS configurado em `main.ts`:**
- Origens: `FRONTEND_ORIGIN` (padrão `http://localhost:3000`)
- Headers expostos: `X-Filename`, `X-Generated-At`, `X-Model-Version`,
  `X-Data-Version`, `X-Generation-Source`, `X-Modified-Buses`, `X-Export-Id`,
  `X-Output-SHA256`, `X-Reference-SHA256`

---

### 3.3 AI Service — FastAPI + Python 3.13

**Localização:** `backend/ai-service/`

**Stack técnica real:**
| Tecnologia | Versão | Finalidade |
|---|---|---|
| FastAPI | ≥0.115, <1.0 | Framework da API |
| Uvicorn | ≥0.30, <1.0 | Servidor ASGI |
| Pydantic | ≥2.7, <3.0 | Validação de schemas |
| pandas | ≥2.2, <3.0 | Manipulação de dados tabulares |
| NumPy | ≥1.26, <3.0 | Computação numérica vetorizada |
| LightGBM | ≥4.5, <5.0 | Modelo de gradient boosting para correção ML |
| scikit-learn | ≥1.6, <2.0 | Dependência do pipeline de treinamento |
| PyArrow | ≥16, <20 | Leitura/escrita de Parquet |
| openpyxl | ≥3.1, <4.0 | Leitura de planilhas Excel (mapeamento de barras) |
| cdsapi | ≥0.7.7, <1.0 | Cliente da API do Copernicus CDS |
| xarray | ≥2024.7, <2027.0 | Manipulação de dados gridded (ERA5 NetCDF) |
| netCDF4 | ≥1.7, <2.0 | Leitura nativa de arquivos NetCDF |

**Estrutura de diretórios:**
```
backend/ai-service/
├── app/                        # Aplicação FastAPI
│   ├── main.py                 # Entry point, 7 endpoints (101 linhas)
│   ├── schemas.py              # Contratos Pydantic (142 linhas)
│   ├── predictor.py            # Carregamento de modelo e estimativa (150 linhas)
│   ├── historical.py           # Replay histórico e ingestão sob demanda
│   ├── climate_file.py         # Validação e estimativa de CSV (287 linhas)
│   └── historical_ingestion.py # Coleta e preparação de meses sob demanda
├── training/                   # Pipeline de treinamento ML
│   ├── config.py               # Configuração centralizada (149 linhas)
│   ├── train.py                # Treino do modelo LightGBM (153 linhas)
│   ├── evaluate.py             # Avaliação e intervalos de confiança
│   ├── build_dataset.py        # Construção de dataset horário
│   ├── features.py             # Feature engineering (66 linhas, 15 features)
│   └── physical_curve.py       # Curva física vetorizada (64 linhas)
├── ingestion/                  # Pipeline de ingestão de dados
│   ├── era5/                   # Ingestão ERA5
│   │   ├── cli.py              # CLI com 7 subcomandos (19k linhas)
│   │   ├── cds_client.py       # Cliente do Copernicus CDS
│   │   ├── extract_points.py   # Extração de pontos de grade
│   │   ├── request_planner.py  # Planejamento de requisições
│   │   └── config.py           # Configuração ERA5
│   ├── ons/                    # Ingestão ONS
│   │   ├── hourly.py           # Processamento horário de geração
│   │   └── source_client.py    # Download da ONS
│   ├── plants/                 # Catálogo de usinas
│   │   ├── catalog.py          # Construção do catálogo CEG (16k linhas)
│   │   └── siga_client.py      # Download do SIGA/ANEEL
│   └── pwf/                    # Mapeamento PWF
│       └── mapping.py          # CEG → barras do caso base
├── tests/                      # 14 arquivos de teste
│   ├── test_api.py
│   ├── test_climate_file.py
│   ├── test_historical.py
│   ├── test_pipeline.py
│   ├── test_plant_catalog.py
│   ├── test_physical_curve.py
│   ├── test_cds_client.py
│   ├── test_dataset.py
│   ├── test_era5_extract.py
│   ├── test_era5_planner.py
│   ├── test_features_and_split.py
│   ├── test_ons_hourly.py
│   ├── test_pwf_mapping.py
│   └── conftest.py
├── artifacts/                  # Artefatos de modelo treinado
├── data/                       # Dados locais (ignorados pelo Git)
├── requirements.txt
├── requirements-dev.txt
└── Dockerfile
```

---

## 4. Modelo de estimativa — arquitetura híbrida Física + ML

A documentação anterior descrevia o sistema como "apenas uma curva física
genérica". Isso está incompleto. O código implementa uma **arquitetura
híbrida condicional** no `predictor.py`:

### 4.1 Curva física genérica (fallback ativo hoje)

Parâmetros da `PhysicalCurveConfig`:
- `cut_in_ms` = 3.0 m/s (entrada do vento)
- `rated_ms` = 12.0 m/s (velocidade nominal)
- `cut_out_ms` = 25.0 m/s (desligamento)

A curva calcula:
- **Faixa de rampa** (`cut_in ≤ v < rated`): `P = disponibilidade × capacidade × (v³ - cut_in³) / (rated³ - cut_in³)`
- **Faixa de platô** (`rated ≤ v < cut_out`): `P = disponibilidade × capacidade`
- **Fora da faixa**: `P = 0`

### 4.2 Correção ML com LightGBM (infraestrutura pronta, modelo não aprovado)

O `Predictor` no startup tenta carregar três artefatos:
1. `metadata.json` — versão, escopo, flag `approved`, domínio de treino, métricas
2. `model.txt` — modelo LightGBM serializado
3. `residual_quantiles.json` — intervalos empíricos de incerteza

**Condições para ativar o ML:**
- Os três artefatos devem existir e ser válidos
- `metadata.approved` deve ser `true`
- `metadata.model_scope` deve ser `"global"`
- SHA-256 do `model.txt` deve bater com `metadata.model_sha256`
- Features do modelo devem ser exatamente as 15 definidas em `FEATURE_COLUMNS`
- O MAE híbrido no teste deve ter sido menor que o MAE da curva física

**15 features de entrada:**
1. `wind_speed_100m` — velocidade do vento a 100m
2. `wind_dir_sin` / `wind_dir_cos` — componentes da direção
3. `air_density_kg_m3` — densidade do ar (calculada de T e P)
4. `hour_sin` / `hour_cos` — codificação cíclica da hora UTC
5. `doy_sin` / `doy_cos` — codificação cíclica do dia do ano
6. `capacidade_instalada_mw` — capacidade nominal
7. `disponibilidade` — fator de disponibilidade
8. `temperature_2m_missing` — flag de temperatura ausente
9. `surface_pressure_missing` — flag de pressão ausente
10. `disponibilidade_missing` — flag de disponibilidade ausente
11. `era5_distance_km` — distância ao ponto de grade ERA5
12. `era5_distance_known` — flag de distância conhecida

**Fluxo de inferência:**
1. Calcula a curva física como baseline
2. Se ML aprovado e entrada dentro do domínio: prediz o resíduo em capacity
   factor e multiplica pela capacidade
3. Aplica `apply_physical_bounds`: clip no intervalo [0, capacity×availability]
   e zera se fora de cut-in/cut-out
4. Gera intervalos empíricos (p05, p95) se ML ativo

### 4.3 Pipeline de treinamento ML (módulo `training/`)

O pipeline completo é orquestrado por `train.py`:

1. **Preparação de dataset** (`build_dataset.py`): validação rigorosa de
   colunas, timestamps, ranges, duplicatas
2. **Feature engineering** (`features.py`): 15 features de predição
3. **Split temporal 70/15/15** sem shuffle
4. **Treino LightGBM** residual (prediz o resíduo do capacity factor)
5. **Avaliação** (`evaluate.py`): métricas por faixa de vento e por usina
6. **Aprovação automática**: `hybrid_test_MAE < baseline_test_MAE`
7. **Geração de artefatos**: `model.txt`, `metadata.json`,
   `residual_quantiles.json`, `validation_report.json`

**Hiperparâmetros padrão (LightGBMConfig):**
- learning_rate: 0.04
- n_estimators: 2500
- num_leaves: 31
- min_child_samples: 100
- subsample: 0.8
- colsample_bytree: 0.8
- reg_lambda: 5.0
- Early stopping: 100 iterações sem melhora

---

## 5. Endpoints implementados

### 5.1 Backend NestJS

| Endpoint | Método | Descrição |
|---|---|---|
| `/system/capabilities` | GET | Estado completo das integrações (backend, IA, dados, modelo) |
| `/climate-scenarios/historical` | POST | Replay histórico ONS + ERA5 (com polling `202 preparing`) |
| `/climate-scenarios/file/inspect` | POST | Valida CSV climático e lista horas disponíveis |
| `/climate-scenarios/file/estimate` | POST | Estimativa física para uma hora do CSV do usuário |
| `/climate-scenarios/era5/estimate` | POST | Estimativa usando ERA5 histórico + disponibilidade |
| `/climate-scenarios/:id` | GET | Manifesto e trilha do cenário persistido |
| `/pwf/reference-cases` | POST | Upload de arquivo PWF de referência |
| `/pwf/reference-cases/:id` | GET | Metadados do caso base |
| `/pwf/reference-cases/:id/generation-targets` | GET | Lista barras que podem receber geração |
| `/pwf/exports` | POST | Gera o PWF final com `Pg` modificado |

### 5.2 AI Service FastAPI

| Endpoint | Método | Descrição |
|---|---|---|
| `/health` | GET | Status do serviço e versão do modelo |
| `/capabilities` | GET | Status completo de dados, catálogo e features |
| `/historico/disponibilidade` | GET | Intervalo temporal do snapshot |
| `/replay-historico` | POST | Replay observacional de uma hora |
| `/estimar-geracao` | POST | Estimativa direta via Predictor (híbrido/físico) |
| `/cenario-climatico/inspecionar` | POST | Validação de CSV climático |
| `/cenario-climatico/estimar` | POST | Estimativa por hora do CSV |
| `/cenario-climatico/era5/estimar` | POST | Estimativa via ERA5 histórico |

---

## 6. Fluxos implementados — detalhe técnico

### 6.1 Replay histórico observado

1. Frontend envia `POST /climate-scenarios/historical` com
   `{subsystem: "NE", timestamp: ISO, resolutionMinutes: 60}`
2. Backend repassa ao AI Service em `POST /replay-historico`
3. Se a partição mensal não existir, retorna `202 preparing` e o
   frontend repete a chamada a cada 5s (até 240 tentativas = 20min)
4. O AI Service consolida geração ONS + ERA5 por usina e hora UTC
5. Retorna cenário com observações: `generation_source: ONS_GERACAO_USINA_2_HO`,
   `weather_source: ERA5`
6. Frontend mostra as usinas com geração observada e alocações sugeridas
7. Usuário faz upload do PWF base, revisa barras e exporta

**Dados usados:**
- ONS: `GERACAO_USINA-2_HO` filtrado para eólicas NE
- Catálogo: CEG → SIGA/ANEEL → coordenadas e capacidade
- ERA5: horário, u100/v100 a 100m, por ponto de grade de cada conjunto
- Mapeamento de barras: `Lista_de_Usinas.xlsx` (horizonte 2040)

### 6.2 Cenário climático via upload CSV

1. Frontend envia CSV em `POST /climate-scenarios/file/inspect` (multipart)
2. AI Service valida: colunas, tipos, ranges, duplicatas, até 50.000 linhas
3. Frontend mostra as horas disponíveis; usuário seleciona uma
4. Frontend envia CSV + timestamp em `POST /climate-scenarios/file/estimate`
5. AI Service recalcula SHA-256, aplica curva física, retorna estimativas
6. Backend valida proveniência (SHA-256 deve bater), persiste cenário com
   manifesto (`climagrid-climate-scenario-v1`)
7. Fluxo prossegue para upload de PWF base e exportação

**Contrato do CSV:**
- `timestamp_utc` — ISO 8601 com timezone, hora cheia
- `usina_id` — CEG do conjunto ONS, conciliado no catálogo
- `u100`, `v100` — componentes do vento a 100m em m/s
- `disponibilidade` — entre 0 e 1
- (Opcionais) `temperature_2m` (K, 150–350), `surface_pressure` (Pa, 50k–120k)
- Uma linha por usina/hora, sem duplicatas
- Delimitador detectado automaticamente (`,` ou `;`)

### 6.3 Cenário climático usando ERA5 histórico

1. Frontend envia `POST /climate-scenarios/era5/estimate` com
   `{timestamp, availability}` (disponibilidade global 0–1)
2. AI Service busca partição ERA5 processada para o mês/hora
3. Se não existir, dispara coleta sob demanda e retorna `202 preparing`
4. Gera CSV normalizado internamente a partir do ERA5
5. Valida SHA-256 do CSV gerado e persiste com proveniência
6. `availability_source: USER_GLOBAL_ASSUMPTION`

### 6.4 Upload e parsing do caso PWF

O `PwfParserService` (495 linhas):
- Validação binária (NUL, BOM, UTF-8 multibyte)
- Detecção de line ending (CRLF/LF/MIXED)
- Extração da versão ANAREDE
- Reconhecimento de 28 blocos
- Parsing de `DBAR` com 15+ campos por barra
- Parsing de `DGBT` (tensões base)
- Parsing de `DGER` (limites de geração ativa mín/máx por barra)
- Parsing de `DGEI` (grupos geradores por barra)
- Detecção de barras e grupos duplicados
- Limite de upload: 25 MB

### 6.5 Exportação do PWF final

O `PwfExportService` (362 linhas):
- Validação de payload (campos obrigatórios, tipos, valores)
- Para cenários estimados: validação autoritativa contra o manifesto persistido
- Bloqueio de mapeamento parcial (0–100% é parcial e bloqueado)
- Acúmulo de geração de várias usinas na mesma barra
- Edição byte-a-byte: `Buffer.write(formatted, field.byteOffset, field.width, 'latin1')`
- Formatação numérica de largura fixa preservando a precisão original do campo
- Rejeição de barras inexistentes, swing (tipo 2) e desligadas
- Verificação de limites DGER
- Persistência do manifesto de exportação (`climagrid-pwf-export-v1`)

---

## 7. Persistência e rastreabilidade

### 7.1 Armazenamento local

| Tipo | Localização | Conteúdo |
|---|---|---|
| Casos PWF | Volume `backend-data:/app/data/pwf/` | Arquivo original, índice, metadados |
| Cenários climáticos | Volume `backend-data:/app/data/scenarios/` | Manifesto JSON, CSV normalizado |
| Exportações PWF | Subdiretório do cenário | PWF exportado, manifesto de exportação |
| Dados brutos ONS | `ai-service/data/raw/ons/` | Parquets por mês |
| Dados ERA5 | `ai-service/data/processed/era5/` | Parquets por mês |
| Snapshot histórico | `ai-service/data/processed/historical/` | `observations.parquet` |
| Catálogo de usinas | `ai-service/data/processed/reference/` | `plant_locations.parquet` |
| Mapeamento PWF | `ai-service/data/processed/reference/` | `pwf_bus_mapping.parquet` |
| Artefatos de modelo | `ai-service/artifacts/global/v1/` | `model.txt`, `metadata.json`, etc. |

### 7.2 Manifestos

**Cenário climático** (`climagrid-climate-scenario-v1`):
- id, data de criação, subsistema, timestamp, resolução
- generation/weather source, data version
- input: schema version, nome, tamanho, SHA-256, media type, row count, source
- provenance: SHA-256 do catálogo/mapeamento, versão do estimador, curva física
- observations: todas as observações estimadas
- warnings

**Exportação PWF** (`climagrid-pwf-export-v1`):
- id, scenarioId, data de criação, nome do estudo
- referencePwf: id, nome, SHA-256
- output: filename, tamanho, SHA-256, barras modificadas
- selection: IDs selecionados/desmarcados, comportamento dos desmarcados
- allocations: plantId, onsId, busNumber, allocationFactor, generationMw

### 7.3 Supabase Storage

Quando `SUPABASE_URL`, `SUPABASE_KEY` e `SUPABASE_BUCKET` estão configurados:
- Replica automaticamente cenários, CSVs, PWFs e manifestos no bucket
- Permite sobreviver a reinícios do Render Free
- Leitura retroativa via Supabase SDK

---

## 8. Pipeline de ingestão de dados

### 8.1 CLI de ingestão (`ingestion/era5/cli.py`)

Subcomandos disponíveis:
1. `download-siga` — Baixa cadastro SIGA/ANEEL
2. `download-ons-membership` — Composição dos conjuntos ONS
3. `download-ons-generation --year --month` — Geração horária ONS
4. `build-catalog --ons --plant-type --siga --ons-membership` — Catálogo CEG
5. `backfill --catalog --start --end` — Coleta ERA5 por coordenadas
6. `build-pwf-mapping --workbook --catalog --output --report` — CEG → barras
7. `join-ons --ons --weather --catalog --output --report` — União ONS + ERA5

### 8.2 Fontes de dados

| Fonte | Conteúdo | Uso |
|---|---|---|
| ONS `GERACAO_USINA-2_HO` | Geração horária oficial | Replay + validação |
| ERA5 Copernicus CDS | u100, v100 horário por ponto de grade | Vento histórico |
| SIGA/ANEEL | Cadastro de usinas, CEG, coordenadas | Catálogo |
| ONS Composição | Relacionamento usina → conjunto | Conciliação |
| `Lista_de_Usinas.xlsx` | CEG, barra, potência (horizonte 2040) | Mapeamento PWF |

---

## 9. Infraestrutura e deploy

### 9.1 Docker Compose (`compose.yaml`)

Três serviços orquestrados:
1. **ai-service** → inicia primeiro (health check)
2. **backend** → depende de ai-service healthy
3. **frontend** → depende de backend healthy

Configurações de segurança: `no-new-privileges: true`, `init: true`

**Variáveis de ambiente relevantes:**
- `COMPOSE_PROJECT_NAME` (padrão: `climagrid`)
- `AI_SERVICE_PORT` (padrão: 8000)
- `BACKEND_PORT` (padrão: 3333)
- `FRONTEND_PORT` (padrão: 3000)
- `NEXT_PUBLIC_API_BASE_URL` (padrão: `http://localhost:3333`)
- `AI_SERVICE_URL` (interna: `http://ai-service:8000`)

### 9.2 Render (deploy remoto)

O diretório `deploy/` contém:
- `render.yaml` — Blueprint Render com 3 serviços
- `push-images.sh` — Publicação de imagens
- `RENDER_DEPLOY.md` — Guia completo de deploy
- `historical-data.Dockerfile` — Container com dados pré-processados

### 9.3 AWS (preparação)

O README documenta a estratégia:
- Publicar as 3 imagens no Amazon ECR
- Executar como serviços ECS/Fargate separados
- IA em rede privada; frontend/backend por load balancer
- Credenciais via Secrets Manager/Parameter Store
- Ingestão ERA5/ONS como tarefa agendada separada

---

## 10. Testes

### 10.1 Backend NestJS (Vitest)

| Tipo | Comando | Arquivos |
|---|---|---|
| Unitários | `npm test` | `*.spec.ts` nos módulos |
| e2e | `npm run test:e2e` | Configuração dedicada em `vitest.config.e2e.ts` |
| Cobertura | `npm run test:cov` | Via `@vitest/coverage-v8` |
| Lint | `npm run lint` | Via `oxlint` |

### 10.2 AI Service (pytest)

14 arquivos de teste:
- `test_api.py` — endpoints FastAPI
- `test_climate_file.py` — validação e estimativa CSV
- `test_historical.py` — replay histórico
- `test_pipeline.py` — pipeline completo
- `test_plant_catalog.py` — construção do catálogo
- `test_physical_curve.py` — curva física
- `test_cds_client.py` — cliente CDS
- `test_dataset.py` — construção de dataset
- `test_era5_extract.py` — extração ERA5
- `test_era5_planner.py` — planejamento de requisições
- `test_features_and_split.py` — feature engineering e split temporal
- `test_ons_hourly.py` — processamento horário ONS
- `test_pwf_mapping.py` — mapeamento CEG → barras

### 10.3 Frontend

| Tipo | Comando |
|---|---|
| Lint | `npm run lint` (ESLint) |
| Build | `npm run build` (validação TypeScript + compilação) |

---

## 11. O que o sistema já faz (funcional e validado)

1. ✅ Importar, validar e interpretar arquivo PWF de referência (28 blocos)
2. ✅ Listar barras geradoras com limites (DBAR + DGER + DGEI)
3. ✅ Reproduzir geração histórica observada ONS por hora com vento ERA5
4. ✅ Coletar dados ERA5 e ONS sob demanda quando credencial CDS disponível
5. ✅ Validar CSV climático do usuário (schema, ranges, duplicatas)
6. ✅ Estimar potencial físico por curva cúbica genérica
7. ✅ Persistir cenários com manifesto versionado e hashes SHA-256
8. ✅ Distribuir geração para barras com acúmulo multi-usina
9. ✅ Bloquear mapeamento parcial
10. ✅ Exportar PWF com edição byte-a-byte do campo `Pg`
11. ✅ Preservar todos os campos fora de `Pg`, incluindo DGER/DGEI
12. ✅ Replicar artefatos no Supabase Storage
13. ✅ Funcionar em modo demonstração sem backend
14. ✅ Documentação Swagger automática nos dois backends

---

## 12. O que o sistema ainda não faz

1. ❌ Previsão meteorológica para datas futuras
2. ❌ Classificação ou modelagem de curtailment
3. ❌ Convergência elétrica no ANAREDE
4. ❌ Upload direto de NetCDF/GRIB como entrada de cenário
5. ❌ Modelo ML aprovado em produção (infraestrutura pronta, flag `approved` = false)
6. ❌ Política de retenção/expurgo de cenários persistidos
7. ❌ Aprovação formal da regra de cobertura 0% com alocação manual

---

## 13. Pendências técnicas identificadas no código

### 13.1 Aprovação do modelo ML híbrido (maior pendência)

O pipeline de treinamento, avaliação e carregamento está completo. A pendência
é executar o treino com um dataset representativo e validar que o MAE híbrido
supera o baseline físico, gerando os artefatos com `approved: true`. Quando
isso acontecer, o `Predictor` automaticamente passa a usar a correção ML com
intervalos empíricos.

### 13.2 xarray e netCDF4 sem uso na API

Essas bibliotecas estão instaladas e são usadas internamente pelo pipeline de
ingestão (`extract_points.py`) para ler arquivos ERA5 `.nc`. Porém, o upload
direto de NetCDF/GRIB pelo browser não está implementado — o contrato de
entrada é CSV normalizado.

### 13.3 Dados locais não versionados

Dados brutos e processados (ONS, ERA5, snapshot, catálogo) são locais e
ignorados pelo Git. A coleta depende de credenciais CDS e pode demorar minutos.
Nesta cópia, julho e agosto de 2024 estão materializados.

### 13.4 Cobertura de cadastro

Há usinas ONS sem CEG individual ou com CEG não conciliado. Esses conjuntos
são excluídos e o aviso permanece visível. A regra para cobertura 0% (alocação
manual completa) está implementada mas não aprovada formalmente.

---

## 14. Verificação mínima do projeto

```bash
# Backend NestJS
cd backend && npm run lint && npm test && npm run test:e2e && npm run build

# Frontend Next.js
cd frontend && npm run lint && npm run build

# AI Service Python
cd backend/ai-service && python -m pytest -q

# Integração
# GET http://localhost:3333/system/capabilities
# Executar replay + exportação real
```

---

## 15. Conclusão

O ClimaGrid é um **pipeline funcional de preparação de cenários eólicos para
o ANAREDE**, com três camadas integradas (Next.js 16, NestJS 12, FastAPI),
rastreabilidade completa por manifestos SHA-256, e uma arquitetura de
estimativa híbrida (curva física + ML) pronta para ativação quando o modelo
for validado.

O sistema já percorre o ciclo completo: **ingestão → cenário → estimativa →
mapeamento de barras → exportação PWF** — tanto para replay histórico
observado quanto para cenário climático estimado. A próxima fronteira técnica
é a aprovação do modelo ML híbrido e a conclusão formal da etapa 2 do MVP.
