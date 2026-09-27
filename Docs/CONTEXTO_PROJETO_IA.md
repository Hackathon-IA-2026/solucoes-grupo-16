# Contexto canônico do projeto ClimaGrid

**Atualizado em:** 27 de setembro de 2026
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
| 2. Cenário climático | **Protótipo ponta a ponta em validação** | Upload CSV ou busca ERA5 histórica, escolha da hora, curva física de potencial e fluxo até PWF | CSV normalizado e rastreabilidade persistida; ainda faltam aprovação de cobertura/domínio e aceite no ANAREDE |
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

### Etapa 2 — cenário climático

Esta etapa encerra o MVP. O fluxo CSV e a estimativa física inicial estão
implementados. Um smoke test com `CEECVA` e um PWF real de 2040 percorreu os
três serviços, preservou o tamanho do arquivo e alterou a barra esperada. Isso
valida a integração técnica mínima, mas ainda não constitui aceite da fase.
Fluxo:

1. usuário envia um arquivo climático ou escolhe uma hora histórica do ERA5;
2. backend valida o CSV ou busca e normaliza o ERA5 pelo catálogo;
3. usuário seleciona a hora e informa a disponibilidade quando usa ERA5;
4. serviço valida cadastro/capacidade para a hora, calcula a geração esperada
   de cada conjunto/usina e persiste CSV, proveniência e observações;
5. usuário revisa usinas e alocações de barras;
6. backend recupera a estimativa persistida, valida seleção/fatores e gera um
   PWF para aquela hora;
7. backend persiste o PWF e seu manifesto de exportação;
8. especialista abre o arquivo no ANAREDE.

O contrato implementado está em [`ML/CENARIO_CLIMATICO_FASE_2.md`](ML/CENARIO_CLIMATICO_FASE_2.md). No upload, o mínimo aceito é:

- `timestamp_utc` com timezone;
- `usina_id` do conjunto ONS conciliado no catálogo por CEG;
- `u100` e `v100` em m/s;
- opcionalmente temperatura a 2 m em K e pressão de superfície em Pa;
- disponibilidade entre 0 e 1 por conjunto e hora;
- uma linha por usina e hora, sem duplicatas.

O upload aceita somente CSV; Parquet e NetCDF enviados pelo navegador ainda
não são aceitos. Como alternativa, a interface busca uma hora histórica no
Copernicus CDS, extrai o ERA5 pelo catálogo e pede uma hipótese explícita de
disponibilidade. Nos dois caminhos, o contrato persistido do MVP é **CSV normalizado por conjunto ONS**, schema
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
- Experimentos ML: publicação opcional no Supabase Postgres/Storage privado,
  com manifesto de hashes, recuperação e limpeza local protegida. Requer aplicar
  a migração e configurar credenciais; a disponibilidade remota não é presumida.
  Consulte [`ML/EXPERIMENTOS_SUPABASE.md`](ML/EXPERIMENTOS_SUPABASE.md).
- A infraestrutura do protocolo temporal versionado está implementada com
  folds calendáricos, reservas separadas, hashes e gates. Sua execução
  científica continua bloqueada pelas decisões registradas em
  [`ML/PROTOCOLO_VALIDACAO_TEMPORAL.md`](ML/PROTOCOLO_VALIDACAO_TEMPORAL.md);
  nenhum artefato novo foi homologado para servir. O pré-voo agora congela um
  snapshot e seu inventário reproduzível antes da escolha das datas, mas os
  exemplos de contrato, política e decisões permanecem pendentes por padrão.
- Novos treinos aceitam somente `geracao_referencia_mw`, ainda tratada como
  proxy cuja semântica e elegibilidade dependem de aprovação ONS. O pipeline
  possui features climáticas causais de 3/6 h e MOST opcional; sua execução
  científica continua bloqueada por histórico, cadastro de altura/rugosidade e
  contrato do alvo. Para a demonstração do MVP, o cenário climático chama o
  `Predictor` com o LightGBM legado configurado e mantém fallback físico por
  linha; isso não equivale à homologação do protocolo novo.
  Consulte o registro verificável em
  [`ML/IMPLEMENTACAO_TARGET_WALK_FORWARD_MOST_ROLLING.md`](ML/IMPLEMENTACAO_TARGET_WALK_FORWARD_MOST_ROLLING.md).
- O challenger DML exploratório de densidade do ar respeita o mesmo contrato de
  target e features, usa purge interno mínimo de 6 h quando o histórico é
  obrigatório e persiste MOST/lookback no bundle. O estimando v1 preserva o
  conjunto legado; um v2 temporal/MOST separado permite ablação com e sem
  disponibilidade. O fluxo de hackathon já consegue coletar a proxy ONS e o
  ERA5, registrar exclusões, comparar curva física, LightGBM fixo e DML em
  linhas futuras pareadas e publicar um relatório somente leitura na tela
  **Insights DML**. O DML continua fora do `Predictor`; o relatório exige
  `scientifically_approved=false`. O Compose local aponta explicitamente para
  o artefato servível `multiusina-exp-003`, referência provisória dos
  experimentos legados. Consulte
  [`ML/MODELO_DML_CAUSAL.md`](ML/MODELO_DML_CAUSAL.md).
  Há também um job de holdout mensal independente que treina em um arquivo
  anterior, aplica gap temporal e avalia um segundo snapshot sem retreino. Sua
  métrica primária não filtra linhas usando o target; a coorte dentro da
  disponibilidade é secundária e explícita. Setembro de 2024 foi consumido
  uma única vez como holdout de agosto, sem sobreposição e com purga externa de
  6 h: nas 103.801 linhas primárias, o WAPE por usina-hora foi 54,35% na curva
  física, 23,62% no LightGBM e 25,46% no DML; no total horário, 46,00%, 7,88% e
  13,29%, respectivamente. O LightGBM generalizou melhor; o DML não foi
  promovido. Por decisão explícita posterior, setembro deixou de ser reserva e
  passou a dado exposto de adaptação; o relatório original permanece imutável,
  mas setembro não pode mais sustentar alegação de holdout para escolhas feitas
  depois dessa decisão.
  O experimento sequencial seguinte está em
  `training/causal/iterative_residual.py`: mantém agosto como desenvolvimento,
  aprende em setembro, mede janeiro de 2026 antes de expô-lo, aprende o resíduo
  de janeiro e mede abril de 2026 sem retuning. Janeiro materializou 92.973
  linhas/744 h/126 conjuntos e abril 89.272 linhas/720 h/124 conjuntos, ambos
  com 100% de associação ONS--ERA5. A busca residual flexível escolheu não
  corrigir em setembro; uma correção aprendida em janeiro piorou o WAPE horário
  de abril de 11,73% para 17,40%. A alternativa de baixa variância aprendeu um
  fator agregado de `1,03` em setembro e reduziu o WAPE horário do LightGBM para
  12,83% em janeiro (antes 14,48%) e 10,96% em abril (antes 11,73%). Os ganhos
  foram sustentados por bootstrap pareado em blocos de dia: +1,65 p.p.
  (IC95% 1,24 a 1,99) e +0,77 p.p. (IC95% 0,27 a 1,23). Uma segunda calibração
  aprendida em janeiro piorou abril para 12,06% e foi rejeitada. O candidato
  congelado para o próximo backtest anual é, portanto, LightGBM de agosto com
  calibração `1,03` de setembro; abril agora é período exposto de validação.
  Esse candidato calibrado não foi materializado no formato do `Predictor`; a
  demonstração usa o artefato legado 003, sem aplicar automaticamente o fator.
  A execução local de agosto de 2024 materializou 90.185 linhas elegíveis e
  comparou 67.883 linhas futuras pareadas: MAE de 49,29 MW na curva física,
  22,55 MW no LightGBM fixo e 21,68 MW no DML, com 99,89% de cobertura do
  challenger. Esses números são exploratórios; o target é proxy e a inferência
  causal mensal tem poucos clusters temporais.
- `Docs/Casos de Referência/Lista_de_Usinas.xlsx`: CEG, barra e potência do
  horizonte 2040.

Endpoints operacionais dos fluxos atuais:

- `GET /system/capabilities`;
- `GET /experimental-insights` (evidência DML exploratória, fora do PWF);
- `POST /climate-scenarios/historical`;
- `POST /climate-scenarios/file/inspect` e `POST /climate-scenarios/file/estimate`;
- `POST /climate-scenarios/era5/estimate`;
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
- A entrada persistida da etapa 2 é CSV normalizado. Upload direto de ERA5
  NetCDF/GRIB não está implementado, mas o servidor pode buscar e normalizar
  ERA5 histórico sob demanda.
- Cenários estimados e seus PWFs são persistidos no disco/volume local com
  manifestos e hashes e, quando configurado e autorizado, replicados no
  Supabase Storage. Uma falha da réplica remota não invalida a persistência
  local e fica registrada nos logs. A réplica mantém a trilha após reinícios
  do Render Free; política de retenção e expurgo ainda não foi definida.
- O LightGBM experimental só é usado nas linhas elegíveis. Conjuntos
  desconhecidos, entradas fora do domínio e arquivos sem temperatura/pressão
  permanecem explicitamente na curva física. Os artefatos são locais,
  ignorados pelo Git e excluídos da imagem; o Compose deste checkout os recebe
  pelo volume montado, mas produção precisa provisioná-los separadamente.
- Mapeamento PWF parcial é bloqueado. Cobertura 0% permite uma alocação manual
  completa; essa decisão e a permanência do `Pg` do caso base para conjuntos
  ausentes/desmarcados ainda precisam de aprovação do domínio.
- Os experimentos multiusina 3 a 6 estão documentados e seus artefatos estão
  presentes neste diretório de trabalho, mas são locais e ignorados pelo Git;
  não estarão disponíveis automaticamente em outro checkout ou na imagem.

## Orientação para futuras IAs

- Não reintroduzir médias de períodos no replay: o PWF representa uma hora.
- Não usar a base de curtailment como substituta da série completa de geração.
- Não cair silenciosamente para mocks ou curva física quando a interface disser
  que está usando dados observados ou um modelo aprovado.
- Não começar curtailment antes de concluir o upload climático do MVP.
- Atualizar este documento quando uma etapa mudar de estado.
