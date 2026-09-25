# Contexto canônico do projeto ClimaGrid

**Atualizado em:** 25 de setembro de 2026  
**Escopo geográfico:** conjuntos eólicos do subsistema Nordeste (NE)  
**Fonte de verdade deste documento:** código e validações do repositório atual

Este arquivo existe para que pessoas e agentes de IA não confundam o que já foi
implementado com ideias de pesquisa ou funcionalidades futuras.

## Objetivo do produto

O ClimaGrid transforma uma condição climática associada a usinas eólicas em
injeções de potência ativa (`Pg`) num caso PWF. O arquivo é então usado pelo
especialista no ANAREDE. O ClimaGrid prepara o cenário; não substitui o cálculo
de fluxo de potência nem afirma que o caso converge.

## Roadmap oficial em quatro etapas

| Etapa | Estado | Entrega | Limite |
| --- | --- | --- | --- |
| 1. Replay histórico | **Implementada** | Escolher uma hora existente, recuperar geração ONS observada e vento ERA5, mapear barras e exportar PWF | Não há previsão de IA |
| 2. Arquivo climático do usuário | **Protótipo ponta a ponta em validação** | Upload CSV, escolha da hora, curva física de potencial e fluxo até PWF | CSV normalizado e rastreabilidade persistida; ainda faltam aprovação de cobertura/domínio e aceite no ANAREDE |
| 3. Hora futura | **Pós-MVP** | Escolher uma hora futura, estimar geração com um modelo e exportar um PWF daquele instante | Exige fonte/hipótese meteorológica futura explícita |
| 4. Curtailment | **Por último — fora do MVP** | Estimar risco, montante e causa provável de restrição | Não se confunde com potencial eólico ou geração bruta |

### Etapa 1 — replay histórico

Fluxo implementado:

1. geração horária oficial `GERACAO_USINA-2_HO` da ONS;
2. filtro para eólicas do subsistema `NE`;
3. catálogo CEG → SIGA/ANEEL → coordenadas e capacidade;
4. ERA5 horário no ponto de grade de cada membro do conjunto;
5. união por `usina_id + timestamp_utc`;
6. relação CEG → uma ou mais barras da planilha PWF;
7. exportação de uma cópia do PWF alterando somente o `Pg`.

Estado dos dados locais nesta cópia: julho e agosto de 2024 foram preparados
sob demanda, com 1.485 horas distintas em cache. Agosto está completo nas
duas partições UTC; julho ainda requer o ERA5 de agosto para as últimas três
horas locais. A prova real de 15 de
agosto encontrou 150 conjuntos ONS com capacidade cadastrada e 150 registros unidos ao ERA5; a virada
de mês usou ONS de agosto e ERA5 de setembro, também com 150/150. Uma chamada
HTTP para julho, antes sem cache, passou de `202 preparing` a `200` e devolveu
149 conjuntos com cobertura ONS–ERA5 de 100% entre os registros válidos. O piloto
anterior de janeiro de 2024 registrou 741 horas e 91.092 linhas, mas seu
arquivo não está presente nesta cópia de trabalho.

Ao escolher uma hora fora do cache, a API inicia em segundo plano a coleta do
mês ONS no horário de São Paulo e do mês ERA5 em UTC, reconstrói o catálogo,
valida a junção e publica uma partição. A interface aguarda o processamento.
Isso depende da credencial CDS e da disponibilidade dos arquivos na ONS/CDS;
somente horas encerradas desde janeiro de 2022 são aceitas; a disponibilidade
efetiva das horas recentes depende do atraso de publicação das fontes. Nenhuma geração é inventada quando a hora não possui dados
conciliados. Consulte [`OPERACAO_HISTORICO_MENSAL.md`](OPERACAO_HISTORICO_MENSAL.md)
para a carga planejada de períodos maiores.

### Etapa 2 — arquivo climático do usuário

Esta etapa encerra o MVP. O fluxo CSV e a estimativa física inicial estão
implementados. Um smoke test com `CEECVA` e um PWF real de 2040 percorreu os
três serviços, preservou o tamanho do arquivo e alterou a barra esperada. Isso
valida a integração técnica mínima, mas ainda não constitui aceite da fase.
Fluxo:

1. usuário envia um arquivo climático;
2. backend valida formato, unidades, timezone e duplicatas;
3. usuário seleciona uma hora presente no arquivo;
4. serviço valida cadastro/capacidade para a hora, calcula a geração esperada
   de cada conjunto/usina e persiste CSV, proveniência e observações;
5. usuário revisa usinas e alocações de barras;
6. backend recupera a estimativa persistida, valida seleção/fatores e gera um
   PWF para aquela hora;
7. backend persiste o PWF e seu manifesto de exportação;
8. especialista abre o arquivo no ANAREDE.

O contrato implementado está em [`ML/CENARIO_CLIMATICO_FASE_2.md`](ML/CENARIO_CLIMATICO_FASE_2.md). O mínimo aceito é:

- `timestamp_utc` com timezone;
- `usina_id` do conjunto ONS conciliado no catálogo por CEG;
- `u100` e `v100` em m/s;
- opcionalmente temperatura a 2 m em K e pressão de superfície em Pa;
- disponibilidade entre 0 e 1 por conjunto e hora;
- uma linha por usina e hora, sem duplicatas.

Somente CSV está implementado para esta etapa. Parquet e NetCDF ainda não são
aceitos. O contrato do MVP é **CSV normalizado por conjunto ONS**, schema
`normalized-ons-hourly-v1`, não um arquivo ERA5 nativo: `u100` e `v100` podem
vir do ERA5, mas `usina_id` e disponibilidade
precisam vir da preparação/cadastro. A série ONS de geração verificada não
valida um modelo de potencial; por isso a curva física é identificada
explicitamente como estimativa genérica.

Critério de conclusão do MVP: um arquivo climático representativo, uma hora
escolhida e um PWF real devem percorrer toda a interface sem mocks; geração e
proveniência devem ser registradas no servidor; cobertura ausente ou parcial
precisa ter regra aprovada; o arquivo deve preservar todos os campos não
editados e ser validado no ANAREDE. O mapa detalhado de pendências está em
[`ML/AUDITORIA_FASE_2.md`](ML/AUDITORIA_FASE_2.md).

### Etapa 3 — hora futura

O usuário escolherá uma data e hora futura, por exemplo setembro de 2027. O
resultado será um PWF daquele instante específico.

[ERA5 é reanálise histórica](https://www.ecmwf.int/en/forecasts/datasets/era5-hourly-data-single-levels-1940-present),
não previsão futura. A etapa deve escolher e expor uma destas semânticas:

- previsão meteorológica operacional, adequada apenas ao horizonte publicado
  pela fonte escolhida;
- previsão sazonal/probabilística;
- cenário climatológico construído dos anos anteriores;
- arquivo meteorológico futuro fornecido pelo usuário (que continua sendo etapa
  2, não uma previsão criada pelo ClimaGrid).

Uma data distante calculada somente a partir do calendário não deve ser
apresentada como previsão meteorológica determinística. Treino, validação
temporal, incerteza e origem da meteorologia são obrigatórios antes de liberar a
etapa na interface.

### Etapa 4 — curtailment

Somente depois do MVP. Deve usar dados de restrição/constrained-off para separar:

- potencial eólico esperado;
- geração efetivamente observada/entregue;
- indisponibilidade;
- energia restringida;
- causa provável, como energética, confiabilidade ou indisponibilidade externa.

O módulo não deve inferir causalidade apenas da diferença entre previsão e
geração observada. Os documentos `GUIA_ESTUDANTE_SINAL.md` e
`RELATORIO_IDEATHON_CURTAILMENT_E_DEMANDA.md` são pesquisa para esta etapa.

## Arquitetura atual

- `frontend/`: Next.js; assistente Hora → Usinas → Barras → Exportar.
- `backend/`: NestJS; fachada, upload/parser/writer PWF e integração.
- `backend/ai-service/`: FastAPI; ingestão, replay e experimento de geração.
- `backend/ai-service/data/`: dados locais, ignorados pelo Git.
- `Docs/Casos de Referência/Lista_de_Usinas.xlsx`: CEG, barra e potência do
  horizonte 2040.

Endpoints operacionais dos fluxos atuais:

- `GET /system/capabilities`;
- `POST /climate-scenarios/historical`;
- `POST /climate-scenarios/file/inspect` e `POST /climate-scenarios/file/estimate`;
- `GET /climate-scenarios/:id`;
- `POST /pwf/reference-cases`;
- `GET /pwf/reference-cases/:id/generation-targets`;
- `POST /pwf/exports`.

## Limitações conhecidas

- Meses ainda não solicitados não estão materializados; a primeira consulta
  pode levar minutos e depende das fontes externas e da credencial CDS.
- A fonte ONS mensal inclui categorias agregadas de pequenas usinas sem CEG
  individual; elas não podem ser inventadas no mapa PWF.
- Há associações parciais/revisões de CEG e coordenadas que devem permanecer
  visíveis ao especialista.
- A planilha de barras representa 2040; outro PWF pode não conter as mesmas
  barras. O upload deve validar cada alvo.
- Os casos PWF reais disponíveis não contêm `DGEI`/`DGER`; a preservação desses
  blocos foi coberta por teste sintético, mas o aceite final deve ocorrer no
  ANAREDE com um caso representativo.
- A entrada da etapa 2 é CSV normalizado; upload direto de ERA5 NetCDF/GRIB não
  está implementado.
- Cenários estimados e seus PWFs são persistidos no disco/volume local com
  manifestos e hashes. Ainda não há réplica em Supabase, política de retenção ou
  backup para um ambiente distribuído.
- Mapeamento PWF parcial é bloqueado. Cobertura 0% permite uma alocação manual
  completa; essa decisão e a permanência do `Pg` do caso base para conjuntos
  ausentes/desmarcados ainda precisam de aprovação do domínio.
- Os experimentos multiusina 3 a 6 estão documentados, mas seus dados,
  relatórios e artefatos são locais e não estão presentes neste checkout.

## Orientação para futuras IAs

- Não reintroduzir médias de períodos no replay: o PWF representa uma hora.
- Não usar a base de curtailment como substituta da série completa de geração.
- Não cair silenciosamente para mocks ou curva física quando a interface disser
  que está usando dados observados ou um modelo aprovado.
- Não começar curtailment antes de concluir o upload climático do MVP.
- Atualizar este documento quando uma etapa mudar de estado.
