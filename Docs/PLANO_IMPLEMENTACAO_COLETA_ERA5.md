# Plano oficial de implementação — coleta e preparação dos dados ERA5

> **Status histórico:** este plano precede a implementação do replay. Várias
> lacunas descritas abaixo já foram resolvidas. Para o estado atual, roadmap e
> operação mensal, consulte [`CONTEXTO_PROJETO_IA.md`](CONTEXTO_PROJETO_IA.md) e
> [`OPERACAO_HISTORICO_MENSAL.md`](OPERACAO_HISTORICO_MENSAL.md).

**Projeto:** ClimaGrid  
**Escopo desta versão:** geração eólica no subsistema Nordeste  
**Versão:** 1.0  
**Data:** 21 de setembro de 2026  
**Status:** pipeline implementado; janeiro/2024 materializado; ampliação depende
das credenciais CDS, download dos meses ONS e republicação do snapshot

## 1. Objetivo

Implementar uma esteira reproduzível, auditável e idempotente para:

1. identificar as usinas eólicas pertencentes ao subsistema Nordeste do ONS;
2. localizar cada usina por latitude e longitude usando uma fonte oficial;
3. baixar do ERA5 apenas a região e o período necessários;
4. transformar os arquivos brutos em observações horárias por usina;
5. unir meteorologia, cadastro da usina e dados horários do ONS;
6. entregar ao serviço de IA o contrato já esperado pelo código atual.

O plano cobre o histórico usado para treinamento e deixa preparada a atualização incremental. A obtenção de previsão meteorológica operacional não faz parte desta etapa: ERA5 é reanálise histórica, não previsão do tempo.

## 2. Decisões oficiais do MVP

| Tema | Decisão | Justificativa |
|---|---|---|
| Fonte meteorológica | ERA5 single levels | É a fonte prevista nos documentos do projeto e fornece as variáveis já esperadas pelo código de IA. |
| Resolução temporal | **1 hora** | É a resolução nativa do produto adotado e já é a opção padrão da interface. Evita criar precisão artificial por interpolação para 30 minutos. |
| Fonte de verdade do universo de usinas | **ONS, com `id_subsistema = "NE"`** | O produto é definido pelo subsistema elétrico Nordeste. Uma lista fixa de estados não representa necessariamente a operação do SIN. |
| Fonte das coordenadas | **SIGA/ANEEL**, ligada pelo CEG | A planilha do caso de referência não possui latitude e longitude. O SIGA publica coordenadas e cadastro oficial dos empreendimentos. |
| Área de download | Caixa geográfica dinâmica das usinas selecionadas, com margem de 0,5° e ajuste à grade de 0,25° | Reduz volume sem perder nenhuma usina e se adapta quando o cadastro mudar. |
| Variáveis ERA5 | `u100`, `v100`, temperatura a 2 m e pressão à superfície | É o conjunto mínimo exigido pelo modelo atual. |
| Associação espacial | Ponto de grade mais próximo, com distância registrada | Simples, reproduzível e coerente com o MVP descrito. Interpolação bilinear só será adotada se uma avaliação demonstrar ganho. |
| Formato bruto | NetCDF imutável, particionado por mês | Preserva o produto original e é diretamente suportado pelo ERA5/xarray. |
| Formato processado | Parquet particionado por ano e mês | Leitura eficiente, tipos estáveis e integração direta com o pipeline Python. |
| Fuso horário | UTC em todas as camadas | Evita ambiguidades e já é obrigatório no serviço de IA. |
| Período inicial | 2023-10-01 a 2026-08-31 | Alinha o primeiro backfill à janela disponível do conjunto principal do ONS descrita nos documentos do projeto. Deve ser parametrizável. |

## 3. Validação do recorte geográfico

Não é necessário baixar o Brasil inteiro.

O recorte deve ser produzido nesta ordem:

1. selecionar no ONS os registros de geração eólica cujo `id_subsistema` seja `NE`;
2. consolidar os identificadores únicos de usina e seus CEGs;
3. localizar esses CEGs no SIGA/ANEEL;
4. calcular os extremos norte, oeste, sul e leste das coordenadas válidas;
5. adicionar margem de 0,5°;
6. arredondar os quatro limites para fora, em múltiplos de 0,25°;
7. usar o resultado no parâmetro `area` do CDS, na ordem `[norte, oeste, sul, leste]`.

Na auditoria realizada em 21/09/2026, as coordenadas válidas dos empreendimentos eólicos do SIGA nos nove estados geográficos do Nordeste ficaram aproximadamente entre:

- latitude: -1,67622 a -14,83093;
- longitude: -44,81958 a -34,96643.

Uma caixa conservadora inicial seria:

```text
[norte=0, oeste=-46, sul=-16, leste=-34]
```

Essa caixa contém cerca de 3.185 pontos de grade de 0,25°, contra aproximadamente 25.921 para uma caixa simplificada do Brasil. A redução estimada é de 88%. Esses valores são apenas uma validação da decisão; a execução deve sempre recalcular a caixa a partir do universo efetivo do ONS.

## 4. Situação atual do repositório

### 4.1 O que já está pronto

- O serviço Python em `backend/ai-service` já define o contrato climático esperado:
  - `u100` em m/s;
  - `v100` em m/s;
  - `temperature_2m` em kelvin;
  - `surface_pressure` em pascal;
  - `usina_id` e `timestamp_utc`.
- O pipeline já deriva velocidade e direção do vento, densidade do ar e variáveis temporais.
- O construtor de dataset já normaliza timestamps em UTC e os agrega por hora.
- A interface já usa 60 minutos como padrão e identifica essa opção como a resolução nativa do ERA5.
- O modelo já prevê os campos de cadastro `capacidade_instalada_mw`, latitude, longitude e `era5_distance_km`.

### 4.2 Estado após a implementação do replay

- o coletor mensal do ONS e o coletor/backfill do CDS/ERA5 estão implementados;
- SIGA e o relacionamento ONS usina–conjunto alimentam o catálogo canônico;
- os snapshots de localização, clima processado e observações históricas são
  publicados em Parquet;
- o catálogo aceita o filtro explícito `--plant-type EOL`, necessário quando a
  entrada ONS contém várias tecnologias;
- os dados reais substituíram o `mock-data.ts` no fluxo de replay;
- a operação disponível cobre janeiro de 2024; a expansão exige repetir a
  ingestão para os novos meses e republicar o snapshot consolidado;
- o procedimento operacional atualizado está em
  [`OPERACAO_HISTORICO_MENSAL.md`](OPERACAO_HISTORICO_MENSAL.md).

## 5. Como localizar exatamente cada usina

### 5.1 Identificador de ligação

O vínculo principal será o **CEG — Código Único do Empreendimento de Geração**:

```text
ONS.ceg  →  SIGA.CodCEG
```

Não se deve localizar uma usina automaticamente apenas pelo nome. Nomes podem variar entre as fontes, incluir abreviações ou representar conjuntos de usinas.

### 5.2 Procedimento de obtenção

1. Ler os dados de restrição/geração eólica do ONS.
2. Filtrar `id_subsistema = "NE"` antes de criar o catálogo.
3. Manter, no mínimo, `id_ons`, `nom_usina`, `ceg`, `id_estado` e `id_subsistema`.
4. Baixar e versionar o CSV do SIGA/ANEEL.
5. Ler do SIGA, no mínimo:
   - `CodCEG`;
   - `NomEmpreendimento`;
   - `SigUFPrincipal`;
   - `SigTipoGeracao`;
   - `DscFaseUsina`;
   - `MdaPotenciaOutorgadaKw`;
   - `MdaPotenciaFiscalizadaKw`;
   - `NumCoordNEmpreendimento`;
   - `NumCoordEEmpreendimento`.
6. Tentar primeiro a correspondência exata do CEG completo.
7. Se não houver correspondência, tentar a chave auxiliar `ceg_root`, removendo somente o sufixo terminal de unidade, como `.1` ou `.01`.
8. Aceitar a correspondência por `ceg_root` apenas quando ela levar a um único empreendimento compatível.
9. Enviar raízes ambíguas, divergências e ausências para uma tabela explícita de exceções.
10. Validar coordenadas, UF, tecnologia, fase, potência e plausibilidade geográfica antes de publicar o catálogo.

Exemplo conceitual de normalização:

```text
CEG original: EOL.CV.BA.012345-6.01
ceg_root:     EOL.CV.BA.012345-6
```

A versão original nunca deve ser descartada. A raiz é somente uma chave de conciliação.

### 5.3 Resultado da auditoria da planilha e do SIGA

A planilha `Lista_de_Usinas.xlsx` contém 4.059 linhas de usinas e 1.387 linhas eólicas, mas não contém latitude ou longitude. Ela é útil como referência de barra, CEG, tipo e potência futura do caso elétrico.

Entre as linhas eólicas da planilha, foram identificadas 1.196 raízes de CEG. Comparando-as com o SIGA consultado em 21/09/2026:

- 1.166 raízes tiveram correspondência após normalização;
- todas as 1.166 correspondências possuíam coordenadas;
- 30 raízes não tiveram correspondência automática;
- foram observadas divergências de UF entre a planilha e o SIGA.

Por isso, a UF da planilha não deve ser usada como substituta da localização física. Para localização, a fonte oficial será o SIGA; divergências serão preservadas como sinal de qualidade e submetidas a revisão.

### 5.4 Casos sem CEG individual

O dicionário do ONS informa que conjuntos de usinas podem aparecer com `ceg = "-"`. Esses registros não permitem geolocalização direta.

Regra do MVP:

- usar o conjunto oficial [Dados do Relacionamento Entre Conjuntos e Usinas](https://dados.ons.org.br/dataset/usina_conjunto);
- representar cada membro com sua coordenada, vigência de relacionamento e uma chave do conjunto;
- extrair o ERA5 no ponto de cada membro e agregar `u100`, `v100`, temperatura, pressão e distância por capacidade instalada para obter uma linha horária do conjunto;
- se não existir, marcar `location_status = "unresolved_group"` e excluir o registro do treinamento por usina;
- nunca atribuir silenciosamente o centroide do estado ou da região.

### 5.5 Esquema do catálogo canônico

Arquivo sugerido: `data/processed/reference/plant_locations.parquet`

| Campo | Descrição |
|---|---|
| `usina_id` | Identificador canônico usado pela IA; preferencialmente o `id_ons`. |
| `id_ons` | Identificador original do ONS. |
| `location_id` | Identificador da usina individual cuja coordenada será consultada; para conjuntos, é o `id_ons_usina` da relação oficial. |
| `is_group` | Indica que a série de geração pertence a um conjunto composto por várias localizações. |
| `ceg` | CEG original do ONS. |
| `ceg_siga` | CEG original encontrado no SIGA. |
| `ceg_root` | Chave auxiliar normalizada. |
| `nom_usina_ons` | Nome recebido do ONS. |
| `nom_empreendimento_siga` | Nome recebido do SIGA. |
| `uf_siga` | UF principal do cadastro SIGA. |
| `id_subsistema` | Subsistema informado pelo ONS. |
| `latitude` | Latitude do empreendimento. |
| `longitude` | Longitude do empreendimento. |
| `capacidade_instalada_mw` | Capacidade adotada, com definição e fonte preservadas. |
| `fase_usina` | Fase cadastral do SIGA. |
| `match_method` | `exact_ceg`, `unique_ceg_root`, `manual` ou `unresolved`. |
| `match_status` | `matched`, `review_required` ou `unresolved`. |
| `location_source` | URL/recurso de origem. |
| `source_extracted_at` | Data e hora da extração. |
| `relationship_start` | Início da vigência da usina no conjunto ONS. |
| `relationship_end` | Fim da vigência da usina no conjunto ONS, quando houver. |
| `era5_grid_latitude` | Latitude do ponto de grade selecionado. |
| `era5_grid_longitude` | Longitude do ponto de grade selecionado. |
| `era5_distance_km` | Distância de Haversine entre usina e ponto de grade. |

## 6. Arquitetura proposta no repositório

```text
backend/ai-service/
├── ingestion/
│   ├── common/
│   │   ├── manifests.py
│   │   └── quality.py
│   ├── plants/
│   │   ├── ons_catalog.py
│   │   ├── siga_client.py
│   │   ├── reconcile.py
│   │   └── validate.py
│   └── era5/
│       ├── config.py
│       ├── request_planner.py
│       ├── cds_client.py
│       ├── extract_points.py
│       ├── validate.py
│       └── cli.py
├── data/
│   ├── raw/
│   │   ├── ons/
│   │   ├── siga/
│   │   └── era5/
│   ├── processed/
│   │   ├── reference/
│   │   ├── era5/
│   │   └── training/
│   └── manifests/
└── tests/
    ├── ingestion/
    └── fixtures/
```

Os dados brutos e processados não devem ser enviados ao Git. O repositório deve conter código, esquemas, pequenas fixtures sintéticas e manifests sem segredos.

O download não deve ocorrer dentro de uma requisição HTTP do NestJS. A coleta será um job separado. O NestJS e o FastAPI consumirão snapshots já publicados.

## 7. Configuração e segredos

### 7.1 CDS

Pré-requisitos operacionais:

1. criar uma conta no Copernicus Climate Data Store;
2. aceitar manualmente os termos do dataset ERA5 single levels;
3. gerar o token pessoal;
4. configurar o cliente conforme a documentação atual do CDS;
5. nunca gravar o token no repositório, no manifest ou nos logs.

### 7.2 Dependências Python

Adicionar ao ambiente do serviço de IA, com versões fixadas após o primeiro teste integrado:

```text
cdsapi>=0.7.7
xarray
netcdf4
pyarrow
```

`pyarrow` já pode existir de forma indireta, mas deve ser declarado se o Parquet for parte do contrato de ingestão.

## 8. Planejamento dos pedidos ERA5

### 8.1 Dataset e variáveis

Dataset:

```text
reanalysis-era5-single-levels
```

Variáveis do MVP:

```text
100m_u_component_of_wind
100m_v_component_of_wind
2m_temperature
surface_pressure
```

Não serão baixadas variáveis solares nesta fase. Isso preserva o foco eólico e reduz custo de armazenamento e processamento.

### 8.2 Particionamento

Criar um pedido por mês, contendo todas as horas e a caixa regional completa. O particionamento mensal:

- limita o tamanho de cada trabalho no CDS;
- facilita retentativas;
- permite reconciliar ERA5T e ERA5 final;
- gera partições naturais para validação e leitura.

Exemplo de payload conceitual:

```python
{
    "product_type": ["reanalysis"],
    "variable": [
        "100m_u_component_of_wind",
        "100m_v_component_of_wind",
        "2m_temperature",
        "surface_pressure",
    ],
    "year": ["2024"],
    "month": ["01"],
    "day": ["01", "02", "..."],
    "time": ["00:00", "01:00", "...", "23:00"],
    "data_format": "netcdf",
    "download_format": "unarchived",
    "area": [0.0, -46.0, -16.0, -34.0],
}
```

O `request_planner.py` deve produzir o payload real, o nome do arquivo, a quantidade esperada de horas e um hash determinístico da solicitação.

### 8.3 Concorrência e retentativas

- iniciar com uma solicitação ativa por vez;
- usar retentativas com espera exponencial apenas para falhas transitórias;
- não repetir automaticamente erros de autenticação, aceite de licença ou payload inválido;
- baixar primeiro para um arquivo `.part`;
- validar a abertura do NetCDF e somente então renomeá-lo atomicamente;
- considerar uma partição concluída apenas após gerar checksum e manifest.

## 9. Organização e proveniência dos dados

### 9.1 Arquivos brutos

```text
data/raw/era5/
└── dataset=reanalysis-era5-single-levels/
    └── year=2024/
        └── month=01/
            └── era5_ne_2024-01.nc
```

Cada partição deve ter um manifest contendo:

- dataset e variáveis;
- área efetivamente solicitada;
- início e fim temporal;
- payload normalizado e seu hash;
- horário da solicitação e da conclusão;
- versão do coletor;
- tamanho, checksum e caminho do arquivo;
- status e mensagem de erro, quando houver;
- indicador de dado preliminar/final quando identificável.

### 9.2 Dados meteorológicos processados

```text
data/processed/era5/year=2024/month=01/weather_hourly.parquet
```

Chave única:

```text
(usina_id, timestamp_utc)
```

Colunas mínimas:

| Campo | Unidade/uso |
|---|---|
| `usina_id` | Chave da usina. |
| `timestamp_utc` | Instante horário com timezone UTC. |
| `u100` | m/s. |
| `v100` | m/s. |
| `temperature_2m` | K. |
| `surface_pressure` | Pa. |
| `era5_grid_latitude` | Graus. |
| `era5_grid_longitude` | Graus. |
| `era5_distance_km` | km. |
| `era5_source_file` | Partição bruta de origem. |
| `era5_request_hash` | Rastreabilidade do pedido. |
| `era5_expver` | Versão do fluxo ERA5/ERA5T quando presente. |

As unidades devem permanecer como o modelo espera: não converter kelvin para Celsius nem pascal para hPa na camada canônica.

## 10. Transformação espacial e temporal

### 10.1 Seleção espacial

1. Abrir o NetCDF com xarray.
2. Normalizar os nomes de coordenadas e da dimensão temporal.
3. Calcular uma única vez o ponto de grade mais próximo para cada usina.
4. Reutilizar esse mapeamento em todas as partições mensais.
5. Calcular a distância de Haversine entre a usina e o centro da célula.
6. Deduplicar a leitura quando várias usinas usam o mesmo ponto de grade, sem perder as linhas individuais na saída.

O mapeamento usina-célula deve ser invalidado e recalculado quando:

- a coordenada da usina mudar;
- o universo de usinas mudar;
- a grade ou o produto ERA5 mudar.

### 10.2 Dimensão `expver`

Algumas partições podem combinar ERA5 final e ERA5T preliminar por meio da dimensão `expver`. O transformador deve:

- preferir o valor final quando disponível;
- usar o preliminar apenas quando não houver final;
- nunca calcular a média entre versões;
- registrar a versão escolhida;
- permitir a substituição posterior da observação preliminar pela final.

### 10.3 Alinhamento com o ONS

Os dados ERA5 permanecem horários. Os registros de 30 minutos do ONS devem ser agregados para a hora UTC correspondente antes da união.

Para grandezas de potência média em MWmed, usar média ponderada pela duração dos intervalos disponíveis, não soma. A hora deve ser marcada como incompleta quando não tiver cobertura temporal suficiente.

O campo `val_disponibilidade` do ONS é potência, enquanto o código atual espera `disponibilidade` normalizada entre 0 e 1. A preparação deve criar explicitamente:

```text
disponibilidade = val_disponibilidade_mw / capacidade_instalada_mw
```

A definição de capacidade usada no denominador precisa ser única e documentada. Valores negativos, capacidade nula e razões acima da tolerância devem gerar erro de qualidade, e não correção silenciosa.

O alvo inicial deve ser escolhido explicitamente entre os dois já aceitos pelo código:

- `geracao_referencia_mw`; ou
- `geracao_verificada_mw`.

Dados contemporâneos de restrição ou corte não devem entrar como variáveis explicativas do modelo de geração quando não estiverem disponíveis no instante real da previsão. Isso evita vazamento de informação.

## 11. Idempotência e publicação

Para cada execução:

1. calcular o plano de partições;
2. consultar os manifests existentes;
3. pular partições válidas com o mesmo hash;
4. repetir somente partições ausentes, inválidas ou explicitamente marcadas para reconciliação;
5. escrever saídas temporárias;
6. validar contagens e esquema;
7. publicar por renomeação atômica;
8. atualizar o manifest ao final.

O comando deve poder ser executado novamente sem duplicar linhas nem alterar partições finais sem justificativa rastreável.

Interface de linha de comando sugerida:

```text
python -m ingestion.era5.cli backfill --start 2023-10-01 --end 2026-08-31
python -m ingestion.era5.cli update --rolling-days 10
python -m ingestion.era5.cli reconcile --months-back 3
python -m ingestion.era5.cli validate --year 2024 --month 01
```

## 12. Regras de qualidade

### 12.1 Catálogo de usinas

- 100% dos registros devem possuir `usina_id` não vazio e único no catálogo canônico;
- CEG original e método de correspondência devem ser preservados;
- no mínimo 95% das usinas individuais do universo inicial devem ter localização resolvida antes do backfill completo;
- latitude deve estar entre -90 e 90 e longitude entre -180 e 180;
- coordenadas fora da caixa esperada devem ir para revisão, não ser descartadas silenciosamente;
- correspondências ambíguas não podem ser aprovadas automaticamente;
- os grupos ONS sem CEG devem aparecer no relatório de exclusões.

### 12.2 Partições ERA5

- todas as quatro variáveis obrigatórias devem existir;
- dimensões espacial e temporal devem ser não vazias;
- timestamps devem ser horários, únicos e UTC;
- uma partição mensal completa deve ter 24 × número de dias do mês observações por ponto de grade, salvo lacuna documentada;
- `u100` e `v100` devem ser finitos;
- temperatura e pressão devem estar em unidades compatíveis com K e Pa;
- checksum e manifest devem existir antes da publicação.

### 12.3 Saída por usina

- chave `(usina_id, timestamp_utc)` única;
- cobertura meteorológica mínima de 99% no período selecionado;
- `era5_distance_km` presente para todas as localizações resolvidas;
- nenhuma imputação silenciosa de hora ou variável ausente;
- relatório mensal de cobertura, duplicatas, valores ausentes e distâncias extremas.

## 13. Estratégia de testes

### 13.1 Testes unitários

- normalização de CEG sem alterar o valor original;
- rejeição de raiz ambígua;
- cálculo da caixa com margem e ajuste a 0,25°;
- distância de Haversine;
- seleção do ponto mais próximo em grade com latitude crescente e decrescente;
- resolução de `expver` sem média indevida;
- agregação horária de dois intervalos de 30 minutos;
- detecção de hora incompleta;
- idempotência por hash e manifest.

### 13.2 Teste integrado mínimo

Usar uma fixture de um mês e cerca de dez usinas distribuídas pelo Nordeste:

1. baixar janeiro de 2024;
2. abrir e validar o NetCDF;
3. gerar o catálogo usina-célula;
4. produzir o Parquet horário;
5. unir com uma amostra ONS;
6. executar `build_dataset.py` e os testes do serviço de IA;
7. comparar manualmente alguns valores com a visualização do CDS.

O backfill completo só começa depois que esse fluxo passar de ponta a ponta.

## 14. Fases de implementação

### Fase 0 — contratos e ambiente

- adicionar dependências;
- criar configuração sem segredos;
- criar esquemas e diretórios;
- atualizar `.gitignore`;
- definir o alvo de treinamento e a capacidade instalada oficial.

**Critério de saída:** ambiente reproduzível e contratos validados por testes.

### Fase 1 — catálogo de usinas

- ingerir universo ONS do subsistema NE;
- baixar snapshot SIGA;
- reconciliar CEGs;
- gerar relatório de divergências;
- publicar `plant_locations.parquet`.

**Critério de saída:** pelo menos 95% das usinas individuais localizadas e 100% das exceções explicitadas.

### Fase 2 — prova de coleta ERA5

- calcular a caixa regional;
- solicitar um mês;
- armazenar NetCDF e manifest;
- validar variáveis, horas, área e checksum.

**Critério de saída:** janeiro de 2024 reproduzível sem intervenção manual além da autenticação inicial.

### Fase 3 — transformação por usina

- criar o mapa usina-célula;
- tratar `expver`;
- publicar Parquet horário;
- gerar relatório de qualidade.

**Critério de saída:** cobertura mínima de 99% e chave única por usina/hora.

### Fase 4 — integração ONS e IA

- agregar ONS de 30 minutos para uma hora;
- normalizar disponibilidade;
- unir os três domínios;
- executar o pipeline atual de treinamento;
- testar o baseline físico e o híbrido.

**Critério de saída:** dataset completo aceito pelo código atual e treinamento reproduzível.

### Fase 5 — backfill e atualização incremental

- executar backfill mensal de 2023-10-01 a 2026-08-31;
- criar atualização diária com janela móvel de dez dias;
- reconciliar mensalmente os três meses anteriores para substituir ERA5T por ERA5 final;
- expor status e cobertura para os serviços consumidores.

**Critério de saída:** histórico completo, atualização idempotente e observabilidade mínima.

## 15. Operação recorrente

O ERA5 mais recente pode chegar como ERA5T, normalmente com alguns dias de atraso e sujeito a substituição posterior. Portanto:

- a rotina diária consulta até a data efetivamente disponível, nunca assume “hoje”;
- a janela móvel de dez dias permite recuperar atrasos e falhas recentes;
- a reconciliação mensal refaz os últimos três meses;
- mudanças de checksum ou versão geram nova revisão da partição, preservando a anterior conforme a política de retenção;
- falhas de uma partição não bloqueiam o relatório das demais.

## 16. Integração com frontend e backend

O frontend já espera cenários climáticos e estimativas de geração, mas os endpoints correspondentes ainda precisam de implementação. A responsabilidade deve ser separada:

- **job de ingestão:** CDS, SIGA e preparação de snapshots;
- **serviço de IA:** transformação final, curva física, treinamento e inferência;
- **NestJS:** catálogo/status, cenários e orquestração da experiência da aplicação;
- **frontend:** seleção do período, visualização e comunicação clara de que o histórico é horário.

O backend deve retornar UF e coordenadas do catálogo canônico. Não deve reconstruir a localização a partir do tipo TypeScript atual nem dos mocks.

## 17. Critérios de aceite do MVP

A coleta ERA5 será considerada implementada quando:

1. o universo de plantas for derivado do ONS com `id_subsistema = "NE"`;
2. existir snapshot versionado do SIGA e catálogo reconciliado por CEG;
3. exceções e grupos sem CEG estiverem explicitamente registrados;
4. a área ERA5 for calculada automaticamente e não abranger o Brasil inteiro;
5. um backfill mensal puder ser retomado sem duplicar ou corromper dados;
6. NetCDF bruto, manifest e Parquet processado mantiverem proveniência completa;
7. a saída horária usar o esquema e as unidades esperadas pelo código atual;
8. a cobertura climática for pelo menos 99% para as usinas localizadas;
9. o dataset unido passar pelas validações e testes existentes da IA;
10. um relatório informar cobertura, exclusões, distâncias e falhas por partição.

## 18. Dependências externas e decisões ainda necessárias

Antes da implementação completa, a equipe precisa disponibilizar ou decidir:

- credencial pessoal do CDS e aceite dos termos, fora do Git;
- arquivos reais do ONS usados no snapshot do projeto;
- alvo oficial do primeiro modelo: geração de referência ou geração verificada;
- definição de capacidade instalada usada para normalizar disponibilidade;
- tratamento ou fonte da composição dos conjuntos ONS cujo CEG é `-`;
- local definitivo de armazenamento dos arquivos brutos, caso o volume exceda o ambiente local.

Esses itens não alteram a arquitetura proposta. Apenas condicionam a conclusão das fases correspondentes.

## 19. Fontes

### Fontes oficiais externas

- [Copernicus Climate Data Store — ERA5 hourly data on single levels](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels)
- [Copernicus Climate Data Store — configuração da API](https://cds.climate.copernicus.eu/how-to-api)
- [ANEEL — SIGA, Sistema de Informações de Geração](https://dadosabertos.aneel.gov.br/pt_BR/dataset/siga-sistema-de-informacoes-de-geracao-da-aneel)
- [ONS — Restrição de operação por constrained-off de usinas eólicas](https://dados.ons.org.br/dataset/restricao_coff_eolica_usi)
- [ONS — Relacionamento entre conjuntos e usinas](https://dados.ons.org.br/dataset/usina_conjunto)

### Materiais internos analisados

- `Docs/ClimaGrid_Documento_Tecnico.pdf`
- `Docs/Equipe 16 - Entrega Final Ideathon ClimaGrid.pdf`
- `Docs/Caderno de desafios e dados.md`
- `Docs/RELATORIO_IDEATHON_CURTAILMENT_E_DEMANDA.md`
- `Docs/GUIA_ESTUDANTE_SINAL.md`
- `Docs/Casos de Referência/Lista_de_Usinas.xlsx`
- código atual de `backend/ai-service`, `backend/src`, `frontend/src` e `supabase`.

## 20. Ordem recomendada para começar

A primeira entrega de código deve ser vertical e pequena:

1. criar o catálogo de dez usinas a partir de ONS + SIGA;
2. calcular a caixa geográfica com o mesmo código que será usado em produção;
3. coletar janeiro de 2024 do ERA5;
4. produzir o Parquet horário por usina;
5. unir a amostra ONS;
6. executar o treinamento existente;
7. somente então ampliar para todas as usinas e todo o período.

Essa sequência valida cedo as decisões que apresentam maior risco: identidade da usina, coordenada, associação à grade, semântica temporal e contrato com o modelo.
