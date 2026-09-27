# Auditoria da fase 2 — cenário climático do usuário

**Data:** 25 de setembro de 2026  
**Branch auditada:** `feature/traindois`, a partir do commit `11286a6`

**Base da comparação:** `develop` no commit `ea81006`

## Conclusão

**Incremento posterior à auditoria:** a interface também permite escolher uma
hora histórica e buscar o vento diretamente no Copernicus ERA5. O serviço
reutiliza ou prepara a partição mensal sem usar geração ONS no cálculo, exige
confirmação de uma disponibilidade global e persiste o CSV normalizado gerado,
seus hashes e a origem ERA5. O upload CSV original continua disponível.

A branch contém um **protótipo ponta a ponta executável** da fase 2:

1. recebe um CSV climático normalizado;
2. valida o arquivo e lista as horas;
3. calcula potencial eólico com uma curva física genérica;
4. mostra usinas e alocações sugeridas;
5. recebe um PWF real;
6. altera o `Pg` das barras escolhidas e devolve outro PWF.

Nesta rodada, o CSV normalizado foi confirmado como contrato do MVP, o cenário
e seus PWFs passaram a ser persistidos com hashes e a exportação deixou de
confiar na geração enviada pelo navegador. Mapeamentos cadastrais parciais agora
bloqueiam a exportação. Isso ainda não encerra a fase 2: faltam aprovação de
domínio para a curva física e a semântica de cobertura, um cenário
representativo e o aceite no ANAREDE. Os experimentos multiusina também não
estão publicados como modelo aprovado e não participam do endpoint do cenário
climático.

## O que foi implementado na branch

### Serviço Python

- `POST /cenario-climatico/inspecionar` e
  `POST /cenario-climatico/estimar`;
- CSV UTF-8 de até 5 MB e 50 mil linhas, com vírgula ou ponto e vírgula;
- timezone obrigatório, conversão para UTC e exigência de hora cheia;
- chave única `usina_id + timestamp_utc`;
- validação de vento, disponibilidade, temperatura e pressão;
- capacidade instalada obtida do catálogo para a hora escolhida;
- curva física com *cut-in*, potência nominal e *cut-out*;
- proveniência `PHYSICAL_CURVE` + `USER`, schema
  `normalized-ons-hourly-v1`, hashes do CSV, catálogo e mapa PWF e parâmetros
  da curva física;
- avisos para mapeamento PWF ausente ou parcial.

### Backend NestJS

- fachada multipart para inspeção e estimativa do CSV;
- tradução dos contratos Python para o frontend;
- capacidade `climate.fileUpload` em `GET /system/capabilities`;
- persistência imutável do CSV e do manifesto de cenário no servidor;
- exportação marcada como `estimated`, recalculada com a estimativa persistida;
- manifesto de exportação com seleção, alocações e hashes do PWF base e final;
- consulta da trilha por `GET /climate-scenarios/:id`;
- bloqueio de geração adulterada, fatores que não somam 100%, conjunto sem
  alocação e mapeamento cadastral parcial;
- teste E2E de exportação estimada em PWF sintético e em PWF real de 2040.

### Frontend

- página **Cenário climático**;
- upload, inspeção e escolha de uma hora do arquivo;
- revisão do potencial estimado e seleção de conjuntos;
- reaproveitamento do fluxo de mapeamento e exportação PWF;
- distinção visual entre geração ONS observada e potencial físico estimado;
- exibição do ID do cenário, schema, hashes e versão do estimador;
- exibição do ID e hash da exportação concluída;
- bloqueio do fluxo real quando a API ou o catálogo não estão disponíveis.

### Treino e pesquisa

- suporte experimental a snapshots multiusina;
- quatro configurações dos experimentos 3 a 6;
- métricas documentadas para o piloto de agosto de 2024.

Esses experimentos são evidência de pesquisa. O checkout auditado não contém o
snapshot, os relatórios nem os artefatos desses experimentos, pois esses
arquivos são locais/ignorados. `artifacts/global/v1` contém apenas `.gitkeep`.
Logo, os números documentados não são reproduzíveis a partir deste checkout
sozinho e nenhum modelo está habilitado na aplicação.

### Mudança posterior à auditoria original

Em 27 de setembro de 2026 foi implementada a evolução descrita em
[`IMPLEMENTACAO_TARGET_WALK_FORWARD_MOST_ROLLING.md`](IMPLEMENTACAO_TARGET_WALK_FORWARD_MOST_ROLLING.md):
target novo restrito à referência ONS, vínculo do lookback ao protocolo,
features causais de 3/6 h e MOST opcional. Essa mudança amplia a infraestrutura
experimental, mas não altera a conclusão operacional desta auditoria: nenhum
modelo novo foi homologado e a curva física continua sendo servida na fase 2.

A tabela abaixo registra a execução da auditoria original e não deve ser lida
como evidência da suíte posterior.

## Evidência executada nesta auditoria

| Verificação | Resultado |
| --- | --- |
| Python 3.13 em contêiner, `python -m pytest -q` | 73 testes passaram; 38 avisos de depreciação/compatibilidade |
| NestJS, `npm run lint && npm test` | lint passou; 16 testes passaram |
| NestJS, `npm run test:e2e && npm run build` | 4 testes E2E passaram; build passou |
| Next.js, `npm run lint && npm run build` | passou; 6 rotas de aplicação geradas |
| Pilha Docker construída da branch | três serviços ficaram saudáveis |
| `GET /system/capabilities` | upload climático disponível; `physical-curve-v1`; nenhum modelo aprovado |
| CSV real de uma hora para `CEECVA` | 7,110642 MW, cobertura de mapeamento de 100%, sem avisos |
| Exportação persistida com PWF real de 2040 | barra 80808 alterada; 3.757.518 bytes antes e depois; hashes conferidos no arquivo, cabeçalhos e manifesto |
| Integridade da exportação estimada | alteração de `generationMw` pelo cliente rejeitada com HTTP 400 |
| `GET /climate-scenarios/:id` | CSV, estimativa, seleção e alocação recuperados; PWF base referenciado e PWF final verificado por IDs e hashes |
| Página `/cenario-climatico` na imagem de produção | HTTP 200 |

O teste confirma a integração técnica de uma linha e uma barra. Não substitui
um aceite com a cobertura esperada de conjuntos, revisão elétrica e abertura
do caso no ANAREDE.

## Decisões e correções concluídas nesta rodada

### Contrato de entrada do MVP

O contrato escolhido é **CSV normalizado**, versionado como
`normalized-ons-hourly-v1`. Ele não é um arquivo ERA5 nativo: é normalizado
por conjunto ONS, com `u100`/`v100` derivados do ERA5 e disponibilidade de
outra fonte. ERA5 NetCDF/GRIB não possui `usina_id` do ClimaGrid nem
disponibilidade eletromecânica.

A busca direta no CDS passou a gerar e persistir o CSV normalizado sem exigir
conversão manual do usuário. Ainda falta um arquivo-modelo gerado pela aplicação
para quem optar pelo upload próprio; upload de NetCDF/GRIB continua fora do
contrato.

### Persistência e autoridade do servidor

Cada estimativa gera um UUID no NestJS e grava, de forma imutável, o CSV
original e `manifest.json`. O manifesto contém schema, hora, fontes, hashes,
catálogo, mapa, versão/parâmetros do estimador, observações e avisos. Na
exportação, o servidor recupera esse cenário, valida a seleção e os fatores e
recalcula cada parcela a partir da estimativa persistida.

Cada PWF estimado recebe outro UUID e um manifesto com PWF base, PWF final,
seleção, comportamento das usinas não selecionadas, alocações e hashes. A rota
`GET /climate-scenarios/:id` verifica os arquivos contra os manifestos antes de
devolver a trilha. No Compose, os dados ficam no volume `backend-data`; fora
dele, o diretório padrão é `backend/data/scenarios` e pode ser alterado por
`SCENARIO_STORAGE_ROOT`. Com Supabase configurado, CSV, manifesto, PWF final e
manifesto de exportação também são gravados no Storage e recuperados dali após
um restart do backend no Render Free.

### Cobertura parcial

Mapeamento cadastral maior que 0% e menor que 100% agora é bloqueado na
interface e no backend. Cada conjunto selecionado precisa de alocação, e seus
fatores precisam somar 100%. Um conjunto com cobertura 0% ainda pode receber
uma alocação manual completa em uma barra validada do caso base.

## Lacunas para concluir a fase 2

### P0 — decisões de domínio e aceite bloqueantes

#### 1. Aprovar cobertura e efeito sobre o PWF

O CSV pode conter qualquer subconjunto de conjuntos e o usuário pode desmarcar
conjuntos. O comportamento agora é explícito no manifesto: a exportação altera
somente as barras dos conjuntos selecionados, e o `Pg` das outras barras
permanece igual ao caso base. É necessário o especialista aprovar se uma
execução representa:

- todo o cenário eólico do Nordeste, exigindo uma cobertura mínima/completa;
- somente um subconjunto deliberado, mantendo o restante do caso base; ou
- um cenário completo no qual conjuntos ausentes recebem tratamento explícito.

A permanência do caso base já aparece na proveniência e não é interpretada
como zero. Falta tornar essa escolha ainda mais destacada antes do download e
obter a aprovação do domínio sobre cobertura mínima ou completa.

#### 2. Aceite de domínio e ANAREDE

A curva física usa parâmetros genéricos e não foi aprovada como estimador de
potencial das usinas reais. O critério de conclusão precisa incluir:

- revisão dos parâmetros e do significado de disponibilidade;
- comparação com um alvo de potencial aceito pelo especialista;
- cenário representativo com muitos conjuntos e avisos reais;
- conferência de todas as barras e totais antes/depois;
- abertura e validação do PWF no ANAREDE.

O ClimaGrid pode comprovar preservação estrutural, mas não convergência elétrica
sem executar o ANAREDE.

### P1 — robustez necessária para o MVP

- Fazer a inspeção informar IDs desconhecidos, conjuntos inelegíveis para a
  hora, cobertura do catálogo e cobertura climática; hoje parte disso só falha
  na estimativa.
- Validar membros ativos na hora escolhida. A checagem atual exige que todas as
  linhas históricas do conjunto estejam conciliadas, mesmo quando uma relação
  não está ativa naquele instante.
- Oferecer um arquivo de exemplo gerado pelo sistema e documentar a conversão
  do ERA5 nativo para o schema `normalized-ons-hourly-v1`.
- Preservar temperatura e pressão no cenário. Hoje são validadas e descartadas;
  isso impede reutilizá-las por um futuro modelo sem reler o arquivo.
- Corrigir a navegação de volta: se a seleção de conjuntos mudar depois do
  upload do PWF, os mapeamentos precisam ser reconstruídos. A prontidão já
  exige ao menos uma alocação para cada conjunto selecionado.
- Criar teste E2E do frontend para o percurso upload → hora → usinas → PWF →
  download, além dos testes HTTP isolados.
- Tornar o status de capacidade mais rigoroso: a simples existência do arquivo
  de catálogo não garante schema válido, cobertura ou mapeamento utilizável.
- Definir retenção e expurgo dos arquivos e manifestos. A implementação já
  replica a trilha da fase 2 em bucket privado do Supabase quando configurado,
  mas ainda não remove cenários antigos automaticamente.

### P2 — modelo treinado, depois do contrato operacional

- Resolver com o especialista o alvo `geracao_referencia_mw`, as ocorrências em
  que ele supera disponibilidade/capacidade e a cobertura temporal necessária.
- Recriar e versionar os dados/relatórios dos experimentos 3 a 6 ou registrar
  um procedimento reproduzível que os obtenha.
- Coletar vários meses e avaliar por mês, conjunto e faixa de vento com splits
  temporais ainda não usados para decisão.
- Publicar um artefato somente após aprovação e integrar o cenário climático ao
  `Predictor`. O endpoint atual chama diretamente a curva física.
- Se o modelo usar temperatura, pressão ou distância ao ponto ERA5, tornar
  esses campos parte efetiva do cenário e da proveniência.

## Sequência recomendada de implementação

1. Aprovar a fonte da disponibilidade e a regra de cobertura do cenário.
2. Fornecer template/conversão, melhorar inspeção e relatório de cobertura e
   criar o teste E2E do frontend.
3. Definir retenção, backup e armazenamento para o ambiente de implantação.
4. Executar um aceite completo com CSV representativo, PWF real e ANAREDE.
5. Só então decidir se a curva física aprovada encerra o MVP ou se um modelo
   multiusina aprovado é requisito de liberação.

## Critério objetivo de encerramento

A fase 2 pode mudar para **implementada** quando:

- o formato aceito corresponde ao que a interface promete;
- cada valor escrito no PWF é rastreável a um cenário imutável no servidor;
- cobertura ausente/parcial tem comportamento aprovado e não silencioso;
- todos os conjuntos selecionados possuem alocação validada no caso base;
- o fluxo completo passa em teste automatizado sem mocks;
- um cenário representativo é revisado por especialista;
- o PWF preserva os demais campos e é aceito no ANAREDE;
- a qualidade e o significado da estimativa estão explicitamente aprovados.

Até lá, o estado correto é **protótipo ponta a ponta em validação**, não fase 2
concluída.
