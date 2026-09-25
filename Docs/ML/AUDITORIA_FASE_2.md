# Auditoria da fase 2 — cenário climático do usuário

**Data:** 25 de setembro de 2026  
**Branch auditada:** `feature/traindois` no commit `11286a6`  
**Base da comparação:** `develop` no commit `ea81006`

## Conclusão

A branch contém um **protótipo ponta a ponta executável** da fase 2:

1. recebe um CSV climático normalizado;
2. valida o arquivo e lista as horas;
3. calcula potencial eólico com uma curva física genérica;
4. mostra usinas e alocações sugeridas;
5. recebe um PWF real;
6. altera o `Pg` das barras escolhidas e devolve outro PWF.

Isso ainda não encerra a fase 2. Faltam decisões de domínio, garantias de
integridade do cenário, tratamento seguro de cobertura parcial e o aceite
técnico com um caso completo no ANAREDE. Os experimentos multiusina também não
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
- proveniência `PHYSICAL_CURVE` + `USER` e hash SHA-256 do CSV;
- avisos para mapeamento PWF ausente ou parcial.

### Backend NestJS

- fachada multipart para inspeção e estimativa do CSV;
- tradução dos contratos Python para o frontend;
- capacidade `climate.fileUpload` em `GET /system/capabilities`;
- exportação marcada como `estimated` com `dataVersion` do cenário;
- teste E2E de exportação estimada em PWF sintético e em PWF real de 2040.

### Frontend

- página **Cenário climático**;
- upload, inspeção e escolha de uma hora do arquivo;
- revisão do potencial estimado e seleção de conjuntos;
- reaproveitamento do fluxo de mapeamento e exportação PWF;
- distinção visual entre geração ONS observada e potencial físico estimado;
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

## Evidência executada nesta auditoria

| Verificação | Resultado |
| --- | --- |
| Python 3.13 em contêiner, `python -m pytest -q` | 73 testes passaram; 38 avisos de depreciação/compatibilidade |
| NestJS, `npm run lint && npm test` | lint passou; 13 testes passaram |
| NestJS, `npm run test:e2e && npm run build` | 4 testes E2E passaram; build passou |
| Next.js, `npm run lint && npm run build` | passou; 6 rotas de aplicação geradas |
| Pilha Docker construída da branch | três serviços ficaram saudáveis |
| `GET /system/capabilities` | upload climático disponível; `physical-curve-v1`; nenhum modelo aprovado |
| CSV real de uma hora para `CEECVA` | 7,110642 MW, cobertura de mapeamento de 100%, sem avisos |
| Exportação com PWF real de 2040 | barra 80808 alterada; 3.757.518 bytes antes e depois; fonte e hash preservados nos cabeçalhos |
| Página `/cenario-climatico` na imagem de produção | HTTP 200 |

O teste confirma a integração técnica de uma linha e uma barra. Não substitui
um aceite com a cobertura esperada de conjuntos, revisão elétrica e abertura
do caso no ANAREDE.

## Lacunas para concluir a fase 2

### P0 — decisões e correções bloqueantes

#### 1. Fechar o contrato de entrada

O arquivo atual **não é um arquivo ERA5 nativo**. Ele é um CSV já normalizado
por conjunto ONS, com `u100`/`v100` derivados do ERA5 e uma disponibilidade
informada por outra fonte. ERA5 NetCDF/GRIB não possui `usina_id` do ClimaGrid
nem disponibilidade eletromecânica.

É preciso escolher e declarar uma opção:

- manter o CSV normalizado como contrato do MVP e fornecer modelo de arquivo,
  validador e procedimento de conversão do ERA5; ou
- aceitar ERA5 nativo e implementar extração por coordenadas, agregação dos
  membros por capacidade e uma política explícita para disponibilidade.

Sem essa decisão, a frase “upload de ERA5” promete mais do que o código aceita.

#### 2. Definir cobertura e efeito sobre o PWF

Hoje o CSV pode conter qualquer subconjunto de conjuntos, o usuário pode
desmarcar conjuntos e a exportação altera somente as barras mapeadas. O `Pg`
das outras eólicas permanece com o valor original do caso base. É necessário
definir se uma execução representa:

- todo o cenário eólico do Nordeste, exigindo uma cobertura mínima/completa;
- somente um subconjunto deliberado, mantendo o restante do caso base; ou
- um cenário completo no qual conjuntos ausentes recebem tratamento explícito.

A escolha deve aparecer na interface e na proveniência. Ausência não pode ser
interpretada silenciosamente como zero ou como permanência do caso base.

#### 3. Impedir exportação enganosa com mapeamento parcial

Quando apenas parte dos membros/barras está mapeada, o serviço normaliza os
fatores das barras conhecidas para somarem 100%. Assim, todo o potencial do
conjunto pode ser colocado nas barras conhecidas, embora a cobertura declarada
seja menor que 100%. A interface mostra um aviso, mas ainda permite prosseguir
e não oferece uma linha para cadastrar a parcela ausente.

Antes do aceite, implementar uma das alternativas:

- bloquear o conjunto parcial até completar o cadastro;
- permitir completar manualmente barras, capacidades e fatores, validando que
  a soma seja 100%; ou
- aplicar apenas a fração coberta, deixando explícito o destino da parcela não
  alocada.

#### 4. Vincular cálculo e exportação no servidor

O `scenarioId` é criado pelo Python, mas não é persistido. Na exportação, o
NestJS confia nos valores enviados pelo navegador para `generationMw`, fonte,
versão e barras. Não existe registro durável que permita recuperar o CSV, a
estimativa ou confirmar que o PWF veio daquele cálculo.

Persistir um manifesto de cenário com, no mínimo:

- ID, hash e nome do arquivo;
- hora e contrato/schema usado;
- catálogo, curva/modelo e versões;
- estimativas por conjunto;
- avisos, seleção e alocações confirmadas;
- hash do PWF base e do PWF exportado.

O endpoint de exportação deve buscar ou validar esses dados pelo `scenarioId`,
em vez de aceitar a geração calculada como autoridade do cliente.

#### 5. Aceite de domínio e ANAREDE

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
- Versionar o schema do CSV e oferecer um arquivo de exemplo gerado pelo
  sistema.
- Preservar temperatura e pressão no cenário. Hoje são validadas e descartadas;
  isso impede reutilizá-las por um futuro modelo sem reler o arquivo.
- Corrigir a navegação de volta: se a seleção de conjuntos mudar depois do
  upload do PWF, os mapeamentos não são reconstruídos e a prontidão não exige
  ao menos uma alocação para cada conjunto selecionado.
- Criar teste E2E do frontend para o percurso upload → hora → usinas → PWF →
  download, além dos testes HTTP isolados.
- Tornar o status de capacidade mais rigoroso: a simples existência do arquivo
  de catálogo não garante schema válido, cobertura ou mapeamento utilizável.
- Definir retenção, tamanho e privacidade dos arquivos enviados e dos
  manifestos de cenário.

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

1. Aprovar o contrato do MVP: CSV normalizado ou ERA5 nativo, fonte da
   disponibilidade e regra de cobertura.
2. Corrigir cobertura parcial e garantir uma alocação completa para cada
   conjunto selecionado.
3. Persistir o cenário e fazer a exportação confiar no cálculo do servidor.
4. Melhorar inspeção, relatório de cobertura, template e testes do frontend.
5. Executar um aceite completo com CSV representativo, PWF real e ANAREDE.
6. Só então decidir se a curva física aprovada encerra o MVP ou se um modelo
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
