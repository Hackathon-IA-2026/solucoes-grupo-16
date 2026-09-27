# ClimaGrid — documentação técnica completa do estado atual do código

## 1. Visão geral

O ClimaGrid é uma plataforma para transformar condições climáticas associadas a usinas eólicas em injeções de potência ativa em um caso PWF do ANAREDE. Em termos práticos, a ferramenta:

- recupera geração observada da ONS e vento do ERA5 para uma hora histórica;
- normaliza cenários climáticos vindos do usuário ou do ERA5;
- calcula um potencial eólico físico por usina/conjunto;
- distribui essa geração para barras do caso PWF;
- exporta uma cópia do PWF original com somente o campo `Pg` alterado nas barras alvo;
- persiste a trilha, os manifestos, os hashes e os arquivos gerados para rastreabilidade.

O produto não substitui o fluxo de potência do ANAREDE. Ele prepara cenários e exporta arquivos de entrada para análise elétrica, sem afirmar que o caso converge.

> Fonte canônica do escopo e do status do projeto: [Docs/CONTEXTO_PROJETO_IA.md](CONTEXTO_PROJETO_IA.md)
>
> Código implementado hoje: [README.md](../README.md), [backend/README.md](../backend/README.md), [backend/ai-service/README.md](../backend/ai-service/README.md), [frontend/README.md](../frontend/README.md)

---

## 2. Estado real do produto

O projeto hoje está em um estado bem definido, com etapas diferentes:

| Etapa | Situação | Descrição |
| --- | --- | --- |
| 1. Replay histórico | Implementada | Seleciona hora histórica, busca geração ONS + ERA5, mapeia para barras e exporta PWF |
| 2. Cenário climático do usuário | Protótipo ponta a ponta em validação | CSV normalizado ou ERA5 histórico; estima potencial físico; gera PWF |
| 3. Hora futura | Pós-MVP | Não implementado como funcionalidade principal |
| 4. Curtailment | Fora do MVP | Não é parte do contrato atual |

Em palavras simples: a ferramenta já é funcional para replay histórico e também já possui um fluxo de cenário climático para uma hora escolhida, mas ainda não é uma solução de previsão futura nem de curtailment. O que existe hoje é preparação e exportação de arquivos PWF a partir de dados observados ou estimados físicos.

---

## 3. Arquitetura do sistema

A arquitetura atual é composta por três camadas principais:

### 3.1 Frontend Next.js

Local: [frontend/](../frontend/)

Responsabilidade:
- interface para a jornada Hora → Usinas → Barras → Exportar;
- seleção histórica ou upload de CSV climático;
- revisão da geração por usina / conjunto;
- validação das alocações sugeridas para cada barra;
- envio do caso base PWF ao backend;
- disparo da exportação final do PWF.

Comportamento:
- no modo sem API configurada, funciona em modo demonstração local com dados fictícios;
- com API configurada, o frontend não cai silenciosamente para mocks; ele exige conexão com o backend e usa as respostas reais;
- expõe a jornada de usuário para replay histórico, cenário via arquivo do usuário e cenário via ERA5 histórico.

### 3.2 Backend NestJS

Local: [backend/](../backend/)

Responsabilidade:
- ser a fachada da aplicação;
- receber upload de caso PWF;
- interpretar blocos de PWF, extrair metadados e alvos de geração;
- chamar o AI service;
- persistir cenários climáticos e exportações;
- validar de-para do cenário para as barras do caso base;
- gravar o PWF final e manifestos de rastreabilidade.

O backend também atua como orquestrador da integração com o FastAPI e mantém a persistência local ou no Supabase.

### 3.3 AI Service FastAPI

Local: [backend/ai-service/](../backend/ai-service/)

Responsabilidade:
- ingestão de dados ONS e ERA5;
- reconciliação de geração real com vento por conjunto e hora;
- cálculo de estimativas físicas com curva genérica;
- normalização de CSV climático do usuário;
- execução do replay histórico e do cenário climático.

Este serviço é o motor de dados e de modelagem física da ferramenta.

---

## 4. Fluxos implementados hoje

### 4.1 Replay histórico observado

Este é o fluxo que está implementado e validado.

Fluxo operacional:
1. o usuário escolhe um timestamp histórico;
2. o backend chama o AI service com `POST /climate-scenarios/historical`;
3. o AI service verifica se o snapshot ONS + ERA5 já existe;
4. se não existir, tenta preparar a partição mensal sob demanda;
5. o serviço consolida geração observada da ONS com vento ERA5 por usina/conjunto e por hora UTC;
6. a API devolve observações com:
   - capacidade instalada;
   - geração observada;
   - vento (`u100`, `v100`);
   - fator de capacidade;
   - alocações sugeridas de barras;
   - cobertura de mapeamento;
   - avisos.
7. o frontend mostra esse cenário ao usuário;
8. o usuário seleciona barras e o backend exporta um PWF modificado.

Dados usados:
- base ONS: `GERACAO_USINA-2_HO` e filtro de usinas eólicas do subsistema NE;
- catálogo de usinas: CEG, SIGA/ANEEL, coordenadas e capacidade;
- ERA5: dados horários associados por coordenadas e por conjunto;
- mapemento de barras: planilha de referência do PWF, em geral com horizonte 2040.

Esse caminho não usa IA de previsão. Ele usa geração real observada.

### 4.2 Cenário climático via upload de CSV

Fluxo:
1. usuário envia um CSV contendo dados climáticos por usina e hora;
2. o backend valida o arquivo e chama `POST /climate-scenarios/file/inspect`;
3. o serviço verifica o schema esperado, número de linhas, timestamps e integridade;
4. o usuário seleciona uma hora disponível; 
5. o backend envia `POST /climate-scenarios/file/estimate`;
6. o AI service valida o CSV, aplica a curva física genérica e calcula geração estimada por usina;
7. o backend persiste o cenário, o CSV normalizado e o manifesto com hashes e proveniência;
8. depois, o usuário faz o mapeamento para barras e exporta o PWF.

Contrato do CSV suportado:
- `timestamp_utc` com timezone;
- `usina_id` de conjunto ONS conciliado no catálogo;
- `u100` e `v100` em m/s;
- temperatura e pressão opcionais;
- disponibilidade entre 0 e 1;
- uma linha por usina e hora;
- sem duplicatas.

Schema persistido do MVP:
- `normalized-ons-hourly-v1`

Importante: upload direto de NetCDF/GRIB não é aceito; a entrada aceita CSV normalizado.

### 4.3 Cenário climático usando ERA5 histórico

Fluxo:
1. usuário escolhe uma hora histórica enviada para o backend;
2. backend chama o AI service em `POST /climate-scenarios/era5/estimate`;
3. o AI service busca os dados ERA5 históricos no catálogo e calcula a estimativa física;
4. se a partição ainda não estiver pronta, retorna `202 preparing` e o frontend repete a chamada até o processamento terminar;
5. o resultado é tratado como cenário estimado, com proveniência de ER5 e disponibilidade externa;
6. a exportação final é feita do mesmo jeito que no cenário do CSV.

Esse fluxo não é previsão futura; trata-se de cenário climático histórico.

### 4.4 Upload e parsing do caso PWF de referência

O backend aceita upload de um caso PWF em `.pwf`, interpreta o arquivo e salva os metadados.

O parser suporta estruturalmente:
- `TITU`
- `DBAR`
- `DGBT`
- `DGER`
- `DGEI`

O backend valida:
- extensão `.pwf`;
- tamanho máximo de 25 MB;
- integridade do arquivo;
- compatibilidade com a versão do ANAREDE;
- quantidade de barras geradoras e grupos geradores;
- campos de geração ativos e limites.

### 4.5 Geração de PWF final

Fluxo de exportação:
1. backend recebe `scenarioId`, `referencePwfId`, `studyName`, `generationSource`, `selectedPlantIds`, `plants` e `mappings`;
2. verifica a consistência da origem do cenário;
3. valida alocações por barra;
4. soma a geração de várias usinas ao mesmo barramento;
5. rejeita barras inexistentes, swing, desligadas, limites excedidos e campos incompatíveis;
6. copia o arquivo base e altera somente o campo de geração ativa `Pg` das barras alvo;
7. preserva os blocos `DGER`/`DGEI` e demais campos fora do `Pg`;
8. grava o arquivo exportado e o manifesto de exportação;
9. retorna o blob e headers com hash, identificadores e metadata.

Importante: o backend não executa fluxo de potência; o arquivo gerado é um PWF preparado para uso do especialista no ANAREDE.

---

## 5. Endpoints implementados

### 5.1 Backend NestJS

#### `GET /system/capabilities`
Retorna o estado da integração:
- backend disponível;
- serviço de IA disponível;
- dados ONS, ERA5 e catálogo;
- presença do snapshot histórico;
- disponibilidade de replay histórico;
- suporte para CSV e ERA5.

#### `POST /climate-scenarios/historical`
Reproduz uma hora observada do snapshot ONS + ERA5.

#### `POST /climate-scenarios/file/inspect`
Valida CSV climático e lista as horas disponíveis.

#### `POST /climate-scenarios/file/estimate`
Calcula a estimativa para uma hora do CSV do usuário.

#### `POST /climate-scenarios/era5/estimate`
Faz a estimativa usando ERA5 histórico com disponibilidade informada.

#### `GET /climate-scenarios/:id`
Recupera o manifesto e a trilha de rastreabilidade do cenário persistido.

#### `POST /pwf/reference-cases`
Upload de arquivo PWF de referência.

#### `GET /pwf/reference-cases/:id`
Metadados do caso base.

#### `GET /pwf/reference-cases/:id/generation-targets`
Lista barras que podem receber geração.

#### `POST /pwf/exports`
Gera o PWF final com `Pg` nas barras informadas.

### 5.2 AI Service FastAPI

#### `GET /health`
Retorna o status do serviço e dos artefatos carregados.

#### `GET /capabilities`
Expõe status de dados, catálogo, snapshot e recursos do histórico.

#### `GET /historico/disponibilidade`
Verifica se há snapshot histórico disponível e qual o intervalo temporal.

#### `POST /replay-historico`
Busca o replay observacional de uma hora.

#### `POST /cenario-climatico/inspecionar`
Valida um CSV climático do usuário.

#### `POST /cenario-climatico/estimar`
Estima geração física para uma hora do CSV do usuário.

#### `POST /cenario-climatico/era5/estimar`
Calcula cenário climático a partir de ERA5 histórico.

---

## 6. Estrutura de dados e persistência

### 6.1 Persistência local do backend

O backend usa diretórios de dados sob `data/` para:
- PWF de referência;
- cenários climáticos;
- exportações PWF;
- manifestos;
- hashes;
- arquivos temporários e cópias de instâncias.

Diretórios relevantes:
- `backend/data/pwf` para casos base;
- `data/scenarios` para cenários climáticos;
- `data/exports` ou subdiretórios de cenário para PWFs exportados;
- também há suporte a bucket do Supabase, quando configurado.

### 6.2 Manifestos e rastreabilidade

Toda exportação e cenário persistido recebe um manifesto com:
- `id` do cenário/export;
- data de criação;
- nome do estudo;
- caso base PWF;
- versão de dados;
- geração observada ou estimada;
- lista de barramentos modificados;
- alocações por usina;
- hashes SHA-256;
- cobertura e warnings;
- seleção de usinas e comportamento para montantes não selecionados.

O objetivo é manter uma trilha verificável de origem e saída, sem confiar só em arquivos sem metadados.

### 6.3 Supabase

Se `SUPABASE_URL`, `SUPABASE_KEY` e `SUPABASE_BUCKET` estiverem configurados, o backend:
- envia os casos persistidos para o bucket do Supabase;
- sincroniza os arquivos de cenário e exportação;
- lê retroativamente desde o Storage;
- mantém a rastreabilidade mesmo em ambientes efêmeros como Render Free.

---

## 7. Modelo físico e estimativa atual

A estimativa atual não é um modelo de machine learning aprovado para previsão. O que existe hoje é uma curva física genérica, usada como fallback e como estimador no MVP.

Elementos da curva física:
- `cut_in_ms`: entrada do vento;
- `rated_ms`: velocidade nominal;
- `cut_out_ms`: velocidade de desligamento;

A geração estimada é calculada em função de:
- `u100` e `v100`;
- capacidade instalada;
- disponibilidade informada;
- catálogo de usinas;
- cobertura cadastral do conjunto;
- mapeamento para as barras do PWF.

A lógica de estimativa laboriosamente preserva a ideia de que essa geração representa um potencial físico, não uma previsão meteorológica, e não deve ser confundida com geração observada real.

---

## 8. O que o código hoje faz, funcionalmente

### 8.1 Consegue realizar

- importar e validar um arquivo PWF de referência;
- interpretar blocos estruturais do caso ANAREDE;
- listar barras geradoras e grupos de geração;
- reproduzir geração histórica observada por hora;
- conciliar ONS + ERA5 por conjunto e hora UTC;
- baixar dados históricos sob demanda, quando a credencial do CDS está disponível;
- validar CSV climático do usuário;
- estimar potencial físico para um caso climático local ou histórico;
- persistir cenários com hashes e manifesto;
- distribuir geração estimada por barras do PWF;
- exportar uma cópia do PWF com `Pg` corrigido;
- preservar todo o restante do arquivo e campos como `DGER`/`DGEI`.

### 8.2 Ainda não faz de forma oficial

- não é uma ferramenta de previsão do tempo para datas futuras;
- não produz previsão meteorológica futura determinística;
- não implementa classificação de curtailment;
- não calcula convergência elétrica no ANAREDE;
- não aceita NetCDF/GRIB diretamente como entrada de cenário;
- não se baseia em um modelo ML aprovado como substituto do cálculo físico;
- não presume que cobertura parcial de cadastro seja completa.

---

## 9. Dados e fontes reais ligadas ao projeto

### 9.1 ONS

Fonte de geração horária oficial `GERACAO_USINA-2_HO`.

Usado para:
- geração observada;
- captação histórica por zona e conjunto ONS;
- base de replay;
- validação da geração real.

### 9.2 ERA5

Dataset de reanálise do Copernicus CDS.

Usado para:
- vento em altura 100 m (`u100`, `v100`);
- associação com coordenadas de usinas;
- cálculo de potencial eólico físico.

### 9.3 SIGA / ANEEL

Usado para:
- mapear usinas e conjuntos ONS;
- associar CEGs às coordenadas;
- criar catálogo de usinas e capacidade instalada;
- definir a relação entre conjunto ONS e barras do PWF.

### 9.4 Caso PWF de referência

Arquivo com horizonte de referência, normalmente 2040, usado como base sobre a qual a geração é modificada.

---

## 10. Limitações e regras de domínio do projeto

O código hoje deixa explícitas várias restrições importantes:

- dados brutos e processados são locais e não são totalmente versionados no Git;
- somente o código e parte dos artefatos existem no repositório;
- um mesmo conjunto ONS pode alimentar várias barras;
- cobertura parcial de cadastro deve permanecer visível;
- o caso PWF representa um instante específico; não é uma série temporal da geração em um único arquivo;
- a ferramenta não deve afirmar convergência elétrica;
- o replay histórico depende de dados externos (ONS e ERA5) que podem estar indisponíveis ou com atrasos de publicação;
- o CSV do usuário precisa estar em um schema específico;
- o cálculo estimado do potencial não deve ser confundido com estimativa de geração em data futura.

---

## 11. Ponto em que a ferramenta está hoje

O ponto atual do projeto é o seguinte:

### 11.1 Já está pronto em termos de execução funcional

- replay histórico funcional;
- upload e processamento de CSV climático;
- cenário ERA5 histórico;
- parsing e validação PWF;
- exportação de PWF com `Pg` alterado; 
- persistência com manifesto e hash.

### 11.2 Ainda é um produto em maturação

- a etapa de cenário climático ainda está em validação de domínio e aceitação técnica;
- ainda faltam aprovações e cobertura de cadastro em alguns casos;
- não há promessa de previsibilidade para datas futuras;
- não há módulo de curtailment;
- a operação depende de dados externos e credenciais.

Em resumo: a ferramenta está em uma fase sólida de construção de base operacional para cenário e replay, mas ainda não é um sistema completo de previsão climática, nem um solução de planejamento de curto/curto prazo para data futura. Ela é um preparador de cenários e exportador PWF de base técnica consistente.

---

## 12. Fluxo de execução recomendado

A aplicação é normalmente iniciada com Docker:

```bash
docker compose up --build -d
```

Acessos esperados:
- frontend: http://localhost:3000
- backend NestJS: http://localhost:3333
- Swagger NestJS: http://localhost:3333/api/docs
- FastAPI: http://localhost:8000/docs
- capabilities: http://localhost:3333/system/capabilities

Para o replay histórico, o processo é:
1. preparar dados ONS e catálogo;
2. preparar ERA5 e join;
3. selecionar hora no frontend;
4. exportar caso PWF.

---

## 13. Conclusão

O ClimaGrid, como existe hoje no código, é uma plataforma de preparação de cenários eólicos para casos PWF, com foco em:

- geração observada de forma histórica;
- cenário climático de hora escolhida;
- validação do ajuste das usinas nas barras;
- exportação verificável do PWF final.

A ferramenta já faz isso com arquitetura clara, integração entre frontend, backend e serviço de IA, rastreabilidade de arquivos e uma base operacional para análise do sistema elétrico em ANAREDE.

O que está implementado hoje é muito mais do que uma prova de conceito: é um pipeline funcional de ingestão, elaboração, persistência e exportação. O que ainda não está no escopo é a etapa futura de previsão meteorológica e curtailment, que continuam sendo trabalho posterior e fora do MVP.
