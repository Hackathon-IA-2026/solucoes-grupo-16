# Inteligência para triagem de curtailment e flexibilidade do SIN

> **Relatório de pesquisa da etapa 4.** A recomendação abaixo não é o escopo do
> MVP atual. O roadmap vigente prioriza replay, depois upload climático, depois
> previsão futura e somente então curtailment. Consulte
> [`CONTEXTO_PROJETO_IA.md`](CONTEXTO_PROJETO_IA.md).

## 1. Resumo executivo

**Recomendação:** seguir com **SINAL — Sistema Inteligente de Antecipação e Lógica de Curtailment**, uma camada analítica que estima, para agrupamentos de usinas e subsistemas, o risco e o montante de *constrained-off* nas próximas 6–24 horas, **separa a provável causa** (energética, confiabilidade ou indisponibilidade externa) e seleciona poucos cenários críticos para estudo elétrico. A saída não é um alerta genérico: é uma fila priorizada de decisões, por exemplo: “cluster eólico do NE: 78% de risco de ENE nas próximas 6 h; 120–180 MW esperados; confiança moderada; fatores: carga líquida baixa, geração renovável alta e exportação próxima ao histórico alto”.

O melhor papel da IA não é substituir o operador nem o fluxo de potência. É combinar séries heterogêneas, detectar limiares não lineares, quantificar incerteza, explicar os fatores de risco e reduzir o conjunto de cenários que especialistas devem analisar. O ANAREDE, quando houver um caso de rede autorizado, valida a física dos cenários selecionados. Sem um caso `.PWF`/`.SAV` e parâmetros de rede, não se deve alegar validação elétrica real.

**Decisão que melhora:** priorizar antecipadamente a análise de janelas e regiões onde há energia renovável disponível que provavelmente será restringida, distinguindo ações de flexibilidade/absorção (causa ENE) de investigação de rede/manutenção/planejamento (REL/CNF). Usuários iniciais: planejamento operacional de geradoras/transmissoras, pesquisadores e equipes de planejamento; um produto operacional do ONS exigiria governança, dados em tempo útil e validação institucional.

**Escopo realista de MVP:** classificador e regressão em base semi-horária do Hackathon, por fonte–subsistema/estado ou por `id_ons`; painel com risco, causas e explicações; gerador de um arquivo tabular de cenário e, apenas se a equipe obtiver um caso didático/consentido, um adaptador demonstrativo para editar injeções em um `.PWF`. Não prometer controle automático, despacho ou recomendação de corte.

## 2. Interpretação dos Desafios 1 e 2

| Aspecto | Desafio 1 — curtailment | Desafio 2 — demanda e curva | Leitura integrada |
|---|---|---|---|
| Resultado observado | redução de geração potencial de eólica/FV | carga e rampas variam no tempo e no espaço | risco de excedente é função da **carga líquida**, não somente da geração |
| Unidade de decisão | causa, local, duração e montante da restrição | necessidade de flexibilidade e reserva em cada janela | antecipar estado crítico e escolher a análise/ação compatível |
| Dados mínimos | constrained-off, geração/disponibilidade, razão/origem | carga, geração por fonte, MMGD ou proxy, calendário/clima | intercâmbio e limites/estado de rede quando disponíveis |
| Limite da união | nem todo corte é causado pelo balanço agregado | uma curva do pato não prova congestão local | a topologia e os limites de transmissão podem dominar o resultado |

**Fato documentado.** O material local informa que o ONS apura restrições como indisponibilidade externa, confiabilidade e razão energética, e que os dados de *constrained-off* têm cadência de 30 minutos.[^local-dados] O caderno também distingue carga global de carga supervisionada, esta última afetada por MMGD/Tipo 3.[^local-curva]

**Inferência.** Os desafios formam um problema de “risco de estado crítico de integração renovável”, mas não um único modelo físico. O balanço oferta–demanda explica apenas parte dos eventos; uma restrição local pode ocorrer com balanço nacional folgado. A variável causal faltante é a rede: topologia, limites, indisponibilidades, tensão/reativos, contingências e regras operativas.

**Formulação melhor da pergunta central:**

> Como priorizar, com antecedência e incerteza explícita, os clusters renováveis e janelas temporais em que haverá energia disponível sujeita a restrição — e indicar se o próximo passo é investigar absorção/flexibilidade ou validar uma hipótese de rede em simulação?

Ela é superior a “prever curtailment” porque liga previsão a uma decisão e evita tratar causas fisicamente diferentes como um único alvo.

## 3. Contexto do problema

## 4. Como geração, demanda, clima, transmissão e curtailment se relacionam

### Cadeia causal — válida, simplificada e faltante

```text
clima + capacidade + indisponibilidade        calendário + clima + MMGD
                 ↓                                      ↓
     geração renovável disponível ────────► carga líquida por região
                              ↓                 ↓
                         intercâmbios e flexibilidade
                              ↓
         topologia, limites, tensão, contingências e regras operativas
                              ↓
          decisão de restrição por causa (REL / CNF / ENE / PAR)
                              ↓
                    energia restringida e impacto econômico
```

**Verdadeiro:** vento e irradiância condicionam geração disponível; temperatura e calendário influenciam carga; o excedente e a capacidade de escoamento importam. O ONS descreve que geração variável pode não coincidir com consumo e que a restrição é medida de segurança do SIN.[^ons-faq]

**Simplificação inadequada:** “mais geração do que demanda implica curtailment”. O sistema é interligado, possui geração hidráulica/térmica com restrições, intercâmbios, perdas, reserva, serviços ancilares e limites nodais. O balanço agregado não informa fluxo em uma linha nem estabilidade.

**Variáveis faltantes para explicação elétrica:** barras de conexão, mapeamento usina–barra, impedâncias, limites térmicos/operativos, posição de chaves, contingências, estado e indisponibilidades de equipamentos, tensão/reativos, despacho e regras vigentes. Elas não foram encontradas no repositório.

### Causas de restrição

| Categoria | Significado operacional | Sinais nos dados disponíveis | Decisão plausível |
|---|---|---|---|
| `REL` / indisponibilidade externa | limitação fora da instalação geradora; pode envolver equipamento externo indisponível | razão/origem e descrição; seria reforçada por evento/indisponibilidade de rede | investigar manutenção, recomposição e contingência; não recomendar bateria como resposta automática |
| `CNF` / confiabilidade | redução para respeitar segurança, limites ou estabilidade | razão e, se obtidos, fluxo/limite e topologia | selecionar caso para fluxo de potência/contingência; priorizar reforço ou ação operativa |
| `ENE` / razão energética | oferta disponível excede absorção momentânea | carga líquida baixa, renovável alta, exportação limitada; razão registrada | avaliar deslocamento de carga, armazenamento, intercâmbio, flexibilidade e planejamento |
| `PAR` | condição indicada em parecer de acesso | código e metadado do acesso | tratar como regime/limitação conhecida, não como falha de previsão |

Os códigos e origens `LOC`/`SIS` constam da documentação fornecida; a semântica final deve ser validada no dicionário da versão efetivamente usada.[^local-dados]

## 5. Inventário dos dados disponíveis

### Evidência do repositório

O workspace contém oito documentos Markdown e os contextos dos seis desafios; **não contém** a pasta de dados tratada, arquivos Parquet/CSV, notebooks, credenciais, casos ANAREDE nem dicionários baixados. O link de Drive em `Dados.md` é uma referência externa.[^local-dados] Portanto, contagens, campos e períodos abaixo são disponibilidade declarada, não inspeção de arquivos.

| Dataset / fonte | Variáveis confirmadas ou descritas | Período / frequência | Espaço / formato | Uso e ressalva |
|---|---|---|---|---|
| Hackathon `constrained_off_eolica_tm` | geração, geração limitada, disponibilidade, geração de referência/final, razão, origem, motivo; 24 campos no tratado | 01/10/2023–31/08/2026; 30 min; 7.951.920 registros | 180 IDs, 9 UFs, 4 subsistemas; Parquet | alvo e atributos; nulos preservados |
| Hackathon `constrained_off_fotovoltaica_tm` | mesma família de campos | 01/04/2024–31/08/2026; 30 min; 2.854.800 | 87 IDs, 10 UFs, 3 subsistemas; Parquet | alvo solar; período menor |
| Hackathon integrado `eolica_fotovoltaica_tm` | principal integrado + coluna `fonte` | 01/04/2024–31/08/2026; 30 min | 265 IDs, 13 UFs, 4 subsistemas; Parquet | chave é `fonte + id_ons`, não `id_ons` isolado |
| Hackathon `*_detail` | eólica: vento verificado/qualidade e geração estimada/verificada; FV: irradiância/qualidade e geração estimada/verificada | eólica 01/01/2023; FV 01/04/2024; ambos até 31/08/2026; 30 min | 1.060 IDs eólicos e 560 FV; Parquet | excelente para baseline; volume alto e qualidade deve entrar como *feature* ou filtro |
| ONS: geração por usina | geração verificada; grupos Tipo III são previsão | desde 2000; horário, arquivos mensais desde 2022 | usina/conjunto/grupo; CSV/Parquet/XLSX | complemento de geração; não assumir observação de MMGD/Tipo III[^ons-geracao] |
| ONS: intercâmbio entre subsistemas | soma de fluxos ativos nas fronteiras | horário | pares de subsistemas; MWmed; CSV/Parquet/XLSX | proxy de escoamento, não limite de transmissão[^ons-intercambio] |
| ONS: DESSEM balanço detalhado | demanda e geração por fonte **previstas** para dia de referência | semi-horário | subsistema; CSV/Parquet/XLSX | preditor “conhecido no instante de decisão”; validar *vintage* de publicação[^ons-dessem] |
| ONS: carga de energia | existência confirmada no portal; granularidade/campos exigem dicionário | não confirmado nesta pesquisa | não confirmado | obter antes de prometer modelo de carga horário |
| ERA5 single levels | vento (componentes u/v), radiação solar de superfície, nuvens, temperatura 2 m, pressão, umidade, precipitação | 1940–presente; horário; atualização diária | global, 0,25°; GRIB; série temporal também NetCDF/CSV | reanálise histórica, não previsão meteorológica operacional[^era5] |
| EPE / ANEEL / CCEE / ONS adicional | expansão, capacidade, MMGD, eventos e documentos | a verificar por fonte | vários formatos | contexto e *features* estáticas; não reivindicar integração até obter licença e dicionário |
| rede / caso ANAREDE | barras, circuitos, cargas, geradores, limites, controles | **não encontrado** | `.PWF` texto, `.SAV` binário são formatos conhecidos | requisito de acesso para validação física |

**Qualidade e acesso.** O portal ONS informa que seus dados passam por consistência recorrente e podem ser atualizados após publicação; arquivos possuem dicionários e formatos CSV/Parquet/XLSX. O portal disponibiliza API/recursos, mas a equipe deve registrar URL, data de extração e versão, pois reprodutibilidade depende disso.[^ons-portal] A contagem de “85 conjuntos” no material local não deve ser usada como garantia de que todos contêm a granularidade ou campo necessário.[^local-mcp]

## 6. Análise específica dos dados ONS

Os datasets constrained-off tratados são os únicos com rótulos de restrição confirmados no escopo local e, por isso, devem estruturar o MVP. As bases `tm` permitem análise e previsão por agregação; as `detail` acrescentam proxies de recurso e geração por unidade, mas têm volume muito maior. Carga e geração por usina têm cadência horária, enquanto o balanço DESSEM é semi-horário por subsistema; a compatibilização só é válida após conferir unidade, fuso e carimbo de publicação no dicionário oficial. O intercâmbio nacional mede fluxo agregado nas fronteiras, não capacidade, carregamento nem limitação de uma linha.[^ons-intercambio]

**Dados realmente suficientes agora:** ocorrência/causa apurada de curta e características de geração/disponibilidade; com os arquivos adicionais do ONS, geração, intercâmbio e previsões de balanço. **Dados ainda necessários para explicar rede:** limites, indisponibilidades, topologia, barras e contingências. Portanto, é viável prever e explicar associações por causa; não é viável atribuir uma violação de linha sem dados de rede.

## 7. Análise específica dos dados ERA5

### Variáveis ERA5 com justificativa física

| Variável | Fenômeno físico | Impacto elétrico e uso | Decisão / cuidado |
|---|---|---|---|
| componentes `u10`, `v10` → velocidade e direção | escoamento de vento perto da superfície | proxy para disponibilidade eólica; capturar regimes e mudanças de direção | extrair por parque/cluster; altura de cubo e curva de potência não são observadas |
| radiação solar de onda curta descendente | recurso solar incidente | proxy de potencial FV | converter acumulado/energia corretamente para potência média; nuvem pode acrescentar explicação |
| cobertura de nuvens | atenuação e variabilidade irradiância | melhora previsão FV e rampa | complementar, não duplicar sem regularização |
| temperatura 2 m e umidade | conforto térmico e carga de climatização | explica carga por subsistema/UF e perdas indiretamente | efeito regional e não linear; aplicar lags e calendário |
| precipitação / pressão | frentes e regimes sinóticos | possível *feature* de contexto, sobretudo para demanda e vento | baixa prioridade; incluir somente se validação temporal melhorar |

O ERA5 é uma reanálise: combina observações e modelo físico, não é medição na usina nem previsão futura. A grade atmosférica é 0,25° e horária; a série por ponto pode arredondar a localização para a grade. Para previsão 6–24 h real, substituir/combinar o ERA5 por previsão meteorológica disponível no instante de corte do dado.[^era5]

## 8. Viabilidade de integração com ANAREDE

A integração faz sentido como **validação física posterior**, não como fonte automática de verdade para o modelo. Ela é viável somente quando houver caso base autorizado, mapeamento das injeções ao caso e meios permitidos para execução; os requisitos e o desenho proposto aparecem após a matriz de cruzamentos nesta mesma análise.

## 9. Cruzamentos de dados promissores e data engineering

### Modelo analítico unificado

Grão recomendado para MVP: `timestamp_utc_or_brt × fonte × id_ons` para o modelo de ativo, com uma segunda agregação `timestamp × subsistema × fonte`. Somente criar `usina_id` após validar se o ID do arquivo principal representa usina, conjunto ou agregação.

| Campo alvo / coluna | Situação | Regra proposta |
|---|---|---|
| `timestamp`, `fonte`, `id_ons`, UF, subsistema | declarado nos tratados | padronizar fuso, preservar chave composta; aplicar *join* por intervalo de 30 min |
| geração, disponibilidade, referência/final, razão, origem, motivo | declarado na base constrained-off | manter bruto + versões derivadas; não usar variável calculada após o horizonte como preditor |
| `curtailment_mw` e `curtailment_mwh` | derivado | definir após confirmar fórmula do dicionário; `MW × 0,5 h` só se a grandeza for potência média no intervalo |
| carga, geração por fonte, intercâmbio | fonte ONS adicional | reamostrar horário → dois períodos de 30 min apenas quando a grandeza permitir; marcar `is_upsampled` |
| clima | obtível do ERA5 | mapear coordenada do parque/cluster; se não houver coordenada, agregar por UF/centroide com rótulo de proxy |
| capacidade/fluxo de transmissão | não confirmado | não fabricar; usar intercâmbio como proxy de escoamento agregado, jamais como limite de linha |
| barra, circuito e parâmetros elétricos | não disponível | deixar nulo fora do módulo ANAREDE; exigir caso autorizado |

**Sincronização e prevenção de vazamento:** adotar um “tempo de conhecimento” para cada variável. Para a previsão em `t+6h`, usar somente previsão DESSEM/meteo e dados observados liberados até `t`; os rótulos de constrained-off e gerações verificadas são sempre posteriores. Validar com *walk-forward* cronológico, nunca com divisão aleatória.

### Matriz de cruzamentos

| Dados A + B + C | Informação descoberta | Decisão possível | Aplicação |
|---|---|---|---|
| constrained-off + razão/origem + geração de referência | incidência, intensidade e causa observada por fonte/cluster | priorizar classe de risco e investigar eventos | rótulo e EDA |
| geração eólica/FV + vento/irradiância ERA5 + qualidade da medição | relação recurso–disponibilidade e erro de proxy | decidir se ERA5 agrega além do detalhe ONS | *feature selection* |
| constrained-off + carga/DESSEM + renovável prevista | limiar de carga líquida associado a ENE | ativar análise de flexibilidade/absorção | risco energético |
| constrained-off + intercâmbio + subsistema | eventos associados a alto escoamento agregado | priorizar hipótese de exportação/confiabilidade | triagem, não prova de congestionamento |
| carga + temperatura + calendário/feriado | previsão e rampa de carga | reservar flexibilidade e comunicar risco | Desafio 2 |
| geração FV/MMGD proxy + carga + horário | profundidade da carga líquida e rampa vespertina | avaliar janelas críticas | curva do pato |
| eventos REL/CNF + descrição + indisponibilidades de rede obtidas | causas recorrentes por ativo/corredor | priorizar manutenção/expansão | só após obter logs/topologia |
| previsão de risco + caso ANAREDE + mapeamento ativo–barra | sobrecarga/tensão em cenários escolhidos | validar hipótese e comparar alternativas | integração física |
| MWh restringidos + despacho marginal/fator de emissão temporal | emissões evitáveis sob contrafactual | quantificar benefício com intervalo | módulo opcional, não usar fator médio automaticamente |

**Fato externo.** O treinamento do CEPEL descreve o ANAREDE como ferramenta de fluxo de potência com manipulação de arquivos texto `.PWF` e históricos `.SAV`, controles, limites e relatórios de tensão, fluxo e reativos.[^anarede-curso] Um `.SAV` é binário e representa caso previamente convergido; ele não é um formato aberto a ser reconstruído de forma confiável apenas com séries ONS.[^anarede-sav]

| Questão | Conclusão |
|---|---|
| O que analisa? | fluxo de potência e controles/limites de rede; é adequado para testar viabilidade elétrica de uma hipótese de injeção/carga, não para aprender padrões históricos |
| Entradas necessárias | caso base com barras, circuitos, parâmetros, cargas, geração, limites e controles; mais alterações de cenário. As séries ONS/ERA5 não bastam |
| Saídas úteis | convergência, tensões, carregamentos/fluxos, violações e relatórios; retornar indicadores padronizados à camada analítica |
| Formatos | `.PWF` texto e `.SAV` histórico são confirmados pelo CEPEL; detalhes de blocos/códigos devem ser validados na versão instalada |
| Automação | é plausível operar arquivos/execuções em lote **se** a licença, executável e documentação da versão permitirem; nenhuma API pública foi encontrada nesta investigação. Não prometer integração por API |
| IA selecionando cenários | tecnicamente coerente: pontuar/clusterizar/otimizar diversidade de cenários, aplicar alterações parametrizadas no caso e simular os 5–20 mais relevantes |
| Limitação central | sem caso autorizável e mapeamento `id_ons → barra`, só é possível exportar uma tabela de cenário, não validar rede |

Arquitetura corrigida:

```text
ONS tratado + geração/carga/intercâmbio + ERA5/previsão meteo
                         ↓
          lake Parquet versionado + catálogo de dados
                         ↓
      features temporal/espacial + baseline explicável
                         ↓
   risco, montante, causa provável, incerteza e explicações
                         ↓
              seleção diversa de cenários críticos
                         ↓
     [opcional: mapeamento para barras + caso PWF/SAV autorizado]
                         ↓
          ANAREDE: fluxo, tensões, carregamentos, violações
                         ↓
          retorno de indicadores e comparação de alternativas
```

**Não é correto** fazer “IA → estados críticos da rede → ANAREDE” como se a IA inferisse estado elétrico de observações agregadas. A IA deve chamar isso de *hipótese de risco* até que o caso físico a confirme.

## 10. Hipóteses de pesquisa

1. **H1:** a probabilidade de `ENE` cresce não linearmente quando a geração renovável prevista aumenta em relação à carga líquida do subsistema.
2. **H2:** um modelo com carga, geração renovável e intercâmbio supera geração renovável isolada na previsão de ocorrência de constrained-off.
3. **H3:** o ganho do vento/irradiância ERA5 sobre as variáveis verificadas do arquivo `detail` é maior para horizontes futuros do que para explicação *ex post*.
4. **H4:** eventos `CNF` e `REL` possuem assinaturas temporais/espaciais diferentes de `ENE`; um único regresssor de MW perde utilidade decisória.
5. **H5:** para `ENE`, hora do dia, dia da semana e feriados retêm poder preditivo mesmo após controlar geração disponível.
6. **H6:** episódios de baixo consumo supervisionado durante alta produção solar têm maior risco de curta duração e intensidade maior em horários diurnos.
7. **H7:** altos intercâmbios agregados em fronteiras predizem risco adicional de `CNF`, mas não identificam qual linha está congestionada.
8. **H8:** agrupar parques por correlação de geração/recurso produz previsão mais robusta que um modelo por ID em amostra curta.
9. **H9:** explicações SHAP são estáveis entre cortes temporais para `ENE` e instáveis para `REL`, sinalizando variável omitida/eventos não observados.
10. **H10:** seleção de cenários por risco × severidade × diversidade encontra mais violações por execução ANAREDE do que escolher apenas os maiores MW previstos.
11. **H11:** uma previsão probabilística calibrada reduz falsos alertas de operação em comparação a um limiar fixo de geração renovável.
12. **H12:** a magnitude de curta depende de capacidade/disponibilidade; portanto, classificar ocorrência e regressar montante condicionalmente supera regressão única com muitos zeros.

## 11. Análises exploratórias recomendadas

| Experimento | Método e critério de sucesso | Decisão após resultado |
|---|---|---|
| 1. Auditoria de rótulo | validar fórmula, nulos, duplicatas, chaves e distribuição de razão/origem | aprovar ou corrigir alvo |
| 2. Perfil de curta | heatmaps por hora×mês, UF/subsistema, fonte e causa; MW/MWh e frequência | escolher recorte do MVP |
| 3. Recurso–geração | correlacionar detalhe eólico/FV com ERA5 após alinhamento | manter somente variáveis climáticas que acrescentem sinal |
| 4. Balanço e ENE | cruzar curta ENE com geração prevista, carga e intercâmbio | validar a história “sobreoferta” |
| 5. Baseline temporal | regressão logística + modelo zero-inflado/duas etapas; *walk-forward* | obter referência honesta para IA |
| 6. Comparação de *features* | ablação: calendário; +ONS; +clima; +intercâmbio/DESSEM | provar valor incremental de cada fonte |
| 7. Causa versus intensidade | classificador multiclasse e regressão condicional | verificar se as classes têm decisão própria |
| 8. Clusters | agrupar séries de geração/risco e mapear por UF/subsistema | reduzir dimensionalidade e melhorar narrativa visual |

## 12. Ideias de solução

| # / nome | Problema, usuário e decisão | Dados e IA | ANAREDE / resultado | Impacto, complexidade, viabilidade, diferencial e risco |
|---|---|---|---|---|
| 1. **SINAL** | antecipar curta e sua causa; planejador operacional de geradora/transmissora prioriza análise e flexibilidade | constrained-off + detalhe + DESSEM/carga/intercâmbio + clima; classificação causa/ocorrência e regressão de MW | seleciona cenário; `P(corte), causa, faixa MW, SHAP`; integração opcional | eficiência/renováveis; **Média**, **9/10**; decisão causal; risco: acesso a preditores em tempo útil |
| 2. **Mapa de Risco** | localizar risco por cluster e horário; planejadores priorizam regiões | dados do #1 + geocodificação | exporta lista de clusters, não fluxo | comunicação espacial; **Média**, **8/10**; mapa explica heterogeneidade; risco: coordenadas/barras ausentes |
| 3. **Balanço Vivo** | prever carga líquida e rampas; ONS/agentes planejam flexibilidade | carga/DESSEM, geração por fonte, MMGD proxy, clima, calendário; forecast probabilístico | sem integração obrigatória; curva 24 h e rampa | Desafio 2 forte; **Média**, **7/10**; risco assimétrico explícito; risco: carga/MMGD compatível indisponível |
| 4. **Alerta de Sobreoferta** | detectar janela de absorção insuficiente; agregadores/consumidores avaliam deslocar carga | #3 + curta ENE; detecção de limiar/anomalia | tabela de janela e magnitude | flexibilidade; **Baixa–Média**, **8/10**; acionável antes do corte; risco: não existe acesso a recurso de resposta da demanda |
| 5. **ExplicaCorte** | transformar códigos/motivos em causas auditáveis; regulatório/planejamento investigam padrões | razão/origem/motivo + séries; NLP leve só se texto não estruturado, clustering e SHAP | agrega hipóteses para estudo | transparência; **Baixa**, **9/10**; não confunde correlação com causa; risco: campos textuais/nulos |
| 6. **CenA-IA** | reduzir milhares de combinações para cenários ANAREDE úteis; engenheiro de estudos escolhe os casos | risco/severidade/diversidade + caso de rede | gera alterações parametrizadas e recebe violações | validação física; **Alta**, **6/10**; IA + simulador complementares; risco: falta de `.PWF/.SAV` e licença |
| 7. **PriorizaExpansão** | comparar corredores/regiões candidatos a reforço; EPE/transmissoras decidem estudo | histórico, capacidade/expansão, rede e cenários | simula alternativas de topologia | planejamento e renováveis; **Alta**, **4/10**; mede valor de informação; risco: topologia/custos privados ou ausentes |
| 8. **RenovaFlex** | recomendar destino potencial da energia restringida; consumidores flexíveis, baterias, H2 | risco ENE, perfil de carga, preço/contratos e capacidade flexível | cenário de injeção/carga quando houver rede | aproveitamento renovável; **Alta**, **5/10**; recomenda com restrições; risco: dados de flexibilidade e viabilidade comercial |
| 9. **Carbono Condicional** | quantificar benefício ambiental somente onde houver substituição demonstrável; sustentabilidade/governo | curta, despacho, fator marginal/combustível e contrafactual | opcional | descarbonização auditável; **Média–Alta**, **5/10**; evita fator médio enganoso; risco: fator marginal indisponível |
| 10. **Detector de Regimes** | descobrir padrões inéditos antes de regras fixas; analistas | séries normalizadas de geração, carga, intercâmbio e clima; clustering/anomalia | cenários representativos | resiliência; **Média**, **7/10**; acha combinações raras; risco: clusters sem ação clara |

## 13. Comparação e ranking das ideias

Pesos somam 100 e favorecem decisão e demonstrabilidade sem sacrificar dados: relevância D1 12, D2 8, IA real 10, dados 14, MVP 14, impacto 10, originalidade 7, ANAREDE 7, valor ao usuário 10 e demo 8. Descarbonização é tratado no impacto e nas condições de validade, evitando premiar alegação ambiental não mensurada.

| Ideia | D1 | D2 | IA | Dados | MVP | Impacto | Orig. | ANAREDE | Usuário | Demo | Nota /10 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| SINAL | 10 | 8 | 9 | 8 | 9 | 9 | 8 | 7 | 9 | 9 | **8,8** |
| Mapa de Risco | 9 | 6 | 7 | 7 | 8 | 7 | 6 | 4 | 8 | 10 | **7,4** |
| Balanço Vivo | 6 | 10 | 8 | 6 | 7 | 8 | 7 | 4 | 8 | 8 | **7,1** |
| Alerta de Sobreoferta | 8 | 9 | 7 | 7 | 8 | 8 | 7 | 3 | 8 | 9 | **7,4** |
| ExplicaCorte | 9 | 5 | 7 | 9 | 9 | 7 | 7 | 3 | 9 | 8 | **7,7** |
| CenA-IA | 8 | 7 | 9 | 3 | 5 | 9 | 10 | 10 | 8 | 8 | **7,0** |
| PriorizaExpansão | 8 | 6 | 8 | 2 | 3 | 10 | 9 | 10 | 8 | 7 | **6,3** |
| RenovaFlex | 8 | 8 | 8 | 3 | 5 | 9 | 9 | 6 | 9 | 9 | **6,8** |
| Carbono Condicional | 5 | 6 | 7 | 3 | 5 | 8 | 8 | 3 | 7 | 6 | **5,6** |
| Detector de Regimes | 7 | 7 | 8 | 7 | 8 | 6 | 8 | 4 | 6 | 8 | **7,0** |

As notas são **decisão de portfólio**, não medição empírica. O ranking favorece SINAL e ExplicaCorte porque os rótulos declarados existem no conjunto disponibilizado; soluções de expansão/ANAREDE perdem pela lacuna de rede, não por menor relevância setorial.

## 14. Top 3 propostas

1. **SINAL (8,8):** melhor equilíbrio entre dados concretos, IA necessária e decisão. Une D1/D2 ao prever risco *e* causa; o painel é apenas a interface de uma decisão rastreável.
2. **ExplicaCorte (7,7):** maior viabilidade e boa narrativa. Pode ser o primeiro módulo de SINAL, não precisa ser produto separado.
3. **Mapa de Risco / Alerta de Sobreoferta (7,4, empate):** escolher como visualização e módulo de decisão do SINAL, priorizando Alerta de Sobreoferta caso os dados de carga/DESSEM sejam confirmados.

## 15. Solução recomendada

**Caminho recomendado:** apresentar um único produto, **SINAL**, com três telas/artefatos: (1) mapa temporal por cluster/subsistema; (2) ficha explicável de risco e causa; (3) “cenários candidatos ao estudo elétrico”. Isso é mais forte e mais honesto que prometer ANAREDE integrado sem caso de rede.

## 16. Papel da Inteligência Artificial

| Problema | Baseline obrigatório | IA somente se superar baseline | Métrica |
|---|---|---|---|
| ocorrência de corte em 6/12/24 h | regra histórica por hora×mês×cluster; regressão logística | LightGBM/XGBoost com *features* ONS, clima e lags | PR-AUC, recall@top-k, Brier/calibração, custo de falso alerta |
| causa | classe majoritária e árvore rasa | boosting multiclasse / classificação hierárquica | macro-F1, matriz de confusão e calibração por classe |
| MW/MWh | mediana condicional histórica | modelo em duas etapas/hurdle, quantis | MAE/Pinball, cobertura 80/90%, erro por causa |
| regimes | agrupamento por sazonalidade simples | HDBSCAN/k-means com validação e protótipos | estabilidade temporal e utilidade para decisão |
| cenário | top-k por severidade histórica | risco×incerteza×diversidade/otimização | violações/cenários úteis por execução ANAREDE |

Usar explicabilidade com SHAP, importância por permutação e gráficos de dependência apenas para comunicar associações do modelo; não chamá-las de causalidade. Deep learning (LSTM/TFT) só é justificável se a validação *walk-forward* mostrar ganho material, dados e *features* forem suficientes e a explicação/calibração continuarem adequadas. Para o MVP, LightGBM ou regressão logística regularizada é preferível.

O baseline é obrigatório para separar ganho real de complexidade. Métricas e critérios completos estão na seção 19.

## 17. Arquitetura proposta

### SINAL — recomendada
```text
Parquet Hackathon ─┐
ONS adicional ────┼─► DuckDB/Parquet + catálogo (versão e data de extração)
ERA5/meteoprev ──┘                    ↓
                      features + validação temporal
                                      ↓
           baseline → LightGBM/quantis → risco, causa, intervalo, SHAP
                                      ↓
             API FastAPI → Streamlit/React + mapa/tabela + export CSV
                                      ↓
                       fila de cenários para especialista/ANAREDE
```

Tecnologias propostas por adequação: Parquet + DuckDB/Polars para arquivos grandes; Python/scikit-learn/LightGBM; MLflow ou manifesto JSON para rastreabilidade; Streamlit para velocidade de Hackathon. O modelo deve ser batch, não *streaming*.

### CenA-IA — futura condicionada a dados de rede
```text
SINAL: risco + cenário base + alternativas parametrizadas
                           ↓
      seletor (severidade × incerteza × diversidade)
                           ↓
 mapeamento validado usina/subsistema → barra/carga no caso PWF
                           ↓
  executor permitido do ANAREDE → relatórios de fluxo/tensão/violação
                           ↓
             parser → banco de resultados → comparação de cenários
```

Pré-requisitos: caso `.PWF` ou `.SAV` legalmente utilizável, versão instalada/licenciada, mapeamento de barras, parâmetros/limites, interface de execução aprovada e casos de teste. Sem eles, manter somente exportação de tabela.

### Balanço Vivo — módulo do Desafio 2
```text
carga/DESSEM + geração por fonte + calendário + previsão meteorológica
                              ↓
                    previsões por quantis de carga líquida
                              ↓
                 rampa, mínimo diurno e banda de sobreoferta
                              ↓
                  alerta para análise de flexibilidade / SINAL
```

## 18. MVP

### MVP de Hackathon

1. Ingerir 6–12 meses de uma fonte ou o período comum FV+eólica; registrar dicionário e versão.
2. Construir alvo por causa e magnitude somente após auditoria da fórmula.
3. Agregar para `fonte × subsistema` e, se a qualidade permitir, `id_ons`/cluster.
4. Treinar baseline e LightGBM/duas etapas com divisão temporal; mostrar comparação e calibração.
5. Aplicar SHAP a uma janela e expor “fatores associados”, intervalo e dados de qualidade.
6. Disponibilizar mapa/heatmap, lista Top-10 e exportação de `scenario_manifest.csv` (timestamp, cluster, geração/carga prevista, hipótese de causa, severidade).
7. Demonstrar uma reprodução histórica de um evento e um cenário contrafactual de balanço, claramente identificado como agregado.

**Critério de demonstração:** dado um horário histórico não visto, a aplicação mostra risco probabilístico, faixa de MW, causa provável, principais fatores e por que ele foi selecionado. Não afirmar que o modelo determinaria despacho real.

### Visão futura

Ingestão de previsões meteorológicas e operativas *vintage*, mapeamento de rede, execução governada de ANAREDE, catálogo de alternativas flexíveis, avaliação de benefício econômico/carbono e *human-in-the-loop* com auditoria.

## 19. Métricas de avaliação

| Problema | Baseline obrigatório | IA somente se superar baseline | Métrica |
|---|---|---|---|
| ocorrência de corte em 6/12/24 h | regra histórica por hora×mês×cluster; regressão logística | LightGBM/XGBoost com *features* ONS, clima e lags | PR-AUC, recall@top-k, Brier/calibração, custo de falso alerta |
| causa | classe majoritária e árvore rasa | boosting multiclasse / classificação hierárquica | macro-F1, matriz de confusão e calibração por classe |
| MW/MWh | mediana condicional histórica | modelo em duas etapas/hurdle, quantis | MAE/Pinball, cobertura 80/90%, erro por causa |
| cenário | top-k por severidade histórica | risco×incerteza×diversidade/otimização | violações/cenários úteis por execução ANAREDE |

Usar divisão *walk-forward* cronológica, reportar desempenho por causa, fonte, subsistema e período, e publicar o intervalo de previsão. Uma boa acurácia média não é suficiente quando uma classe de segurança ou uma janela rara falha.

## 20. Relação com descarbonização

Curtailment não equivale automaticamente a emissões adicionais. A cadeia válida é:

```text
energia renovável restringida → alternativa de operação em hora/local específico
→ geração marginal efetivamente substituída (ou armazenamento/carga deslocada)
→ fator de emissão marginal verificável → tCO2e evitadas
```

Só estimar MWh potencialmente aproveitáveis após validar a variável de restrição e duração. Pode-se converter em “equivalente de consumo” como `MWh / consumo médio escolhido`, declarando o denominador. Impacto econômico exige preço/contrato/ressarcimento e não pode ser inferido da energia apenas. Emissões evitáveis exigem contrafactual e fator marginal por hora/local; o fator médio do SIN não demonstra qual gerador seria deslocado. O material local também ressalta essa exigência para resposta da demanda.[^local-carbono]

## 21. Limitações

| Limitação | Consequência |
|---|---|
| dados publicados podem ser alterados após consistência | resultados devem declarar versão/data de extração |
| ERA5 não resolve escala de parque/turbina | serve como proxy, não como medição de recurso ou previsão operacional |
| agregação por subsistema não localiza violações nodais | não substitui fluxo de potência |
| séries históricas não revelam todas as regras operativas | explicações são associações, não causalidade |

## 22. Riscos técnicos

| Risco | Mitigação / decisão de escopo |
|---|---|
| rótulo de curta reflete apuração posterior | separar dados observáveis dos posteriores; registrar *as-of timestamp* |
| extremos raros e classes desbalanceadas | PR-AUC, ponderação, intervalos e avaliação por evento, não só acurácia |
| ERA5 não representa microclima/altura da turbina | comparar com variáveis `detail`; não inferir potência física sem curva/altura |
| agregação esconde gargalo nodal | comunicar nível de inferência; usar ANAREDE somente com caso completo |
| mudanças regulatórias e versão de dicionário | congelar versão e revalidar após atualização |
| uso indevido como recomendação de operação | *human-in-the-loop*, intervalos, limitações na UI e validação com engenheiro |
| dados de carga/MMGD ou rede ausentes | MVP degradável: risco histórico por curta + clima/detalhe; não prometer Balanço Vivo/ANAREDE |
| causalidade confundida com SHAP | usar “fator associado”, desenhos de ablação e validação física posterior |

## 23. Perguntas em aberto

| Prioridade | Categoria | Pergunta |
|---|---|---|
| P0 | Dados | Qual é a fórmula oficial e unidade de geração limitada/referência final para calcular MW/MWh restringidos? |
| P0 | Dados | Quais campos, fuso, data de publicação e cobertura real possuem carga, DESSEM, geração e intercâmbio escolhidos? |
| P0 | ANAREDE | A equipe terá licença, versão, caso `.PWF/.SAV` didático e permissão para automatizar execução? |
| P0 | Engenharia elétrica | Qual decisão concreta o mentor/usuário aceita tomar para ENE, CNF e REL? |
| P0 | Hackathon | Quais bases serão oficialmente fornecidas e qual janela de desenvolvimento/demonstração? |
| P1 | Dados | Há coordenadas, potência instalada, mapeamento ativo–barra e disponibilidade de transmissão para cada ID? |
| P1 | IA | Existe previsão meteorológica/operativa disponível no instante de previsão, além de ERA5 histórico? |
| P1 | Produto | O usuário prefere alerta por ativo, cluster, subsistema ou corredor de transmissão? |
| P1 | Descarbonização | Há fator marginal horário/local ou despacho que permita contrafactual auditável? |
| P2 | Engenharia elétrica | Quais serviços ancilares, tensão e estabilidade precisam entrar em cenário futuro? |
| P2 | IA | TFT traz ganho e calibragem superiores ao boosting sob validação temporal? |
| P2 | Produto | Há parceiro com carga flexível/baterias para validar recomendação econômica? |

## 24. Experimentos necessários

| Experimento | Método e critério de sucesso | Decisão após resultado |
|---|---|---|
| 9. Contrafactual limitado | simular +X MW de carga flexível ou −X MW de renovável no balanço agregado | mostrar sensibilidade, rotulando como não físico/nodal |
| 10. Piloto ANAREDE | com caso didático, alterar uma injeção/carga conhecida e rodar fluxo | validar mapeamento, convergência e extração de relatório |
| 11. Seleção de cenários | comparar top-k por risco contra risco×diversidade | medir cobertura de estados diferentes por execução |
| 12. Carbono | avaliar se há fator marginal/ordem de mérito compatível com a janela | só então estimar emissões evitáveis com intervalo |

## 25. Roadmap para o Hackathon

| Fase | Objetivo e tarefas | Dependência | Resultado / sucesso |
|---|---|---|---|
| 1. Entendimento | entrevistar mentor, definir usuário e decisão por causa | acesso a especialistas | matriz decisão–causa aprovada |
| 2. Dados | baixar, versionar, ler dicionários e auditar rótulos | Drive/portal | manifesto + relatório de qualidade |
| 3. Exploração | perfis temporais, espaciais, causas, correlações e clima | fase 2 | 3–5 achados com gráficos reprodutíveis |
| 4. Hipóteses | testar H1–H4 com ablação e *walk-forward* | fase 3 | hipótese aceita/rejeitada e recorte final |
| 5. Baseline | modelos simples, calibração, intervalos e erro por causa | fase 4 | ganho demonstrado ou decisão de manter baseline |
| 6. ANAREDE | obter caso, adaptar cenário e rodar caso teste | licença/caso/mapeamento | piloto ou bloqueio formal documentado |
| 7. MVP | API/UI, narrativa de evento, testes e demo | fases 2–5 | demonstração repetível em menos de 5 min |

## 26. Próximas ações da equipe

1. Baixar os Parquets e dicionários do Hackathon; executar a auditoria do Experimento 1 antes de qualquer modelo.
2. Perguntar imediatamente sobre caso ANAREDE, licença e mapeamento de barras; isso decide se a integração entra no MVP.
3. Escolher um usuário inicial e uma decisão: recomenda-se planejamento operacional de geradora/transmissora, não “operar o ONS”.
4. Construir em paralelo o baseline por causa e o dashboard de reprodução histórica; adicionar ERA5 e DESSEM somente se a ablação justificar.
5. Preparar a narrativa: **previsão sem causa não direciona ação; IA reduz o espaço de cenários e o simulador valida a física.**

## Referências e rastreabilidade

### Materiais locais consultados

[^local-dados]: `Dados.md` — inventário fornecido pelo Hackathon: snapshots, campos descritos, período, cadência e limitações.
[^local-curva]: `demanda_curva_pato_e_curtailment.md` — carga supervisionada, MMGD/Tipo 3, rampa e classificação apresentada.
[^local-carbono]: `descarbonizacao_e_emissoes.md` — condições para atribuir benefício de emissões à resposta da demanda.
[^local-mcp]: `portal_dados_abertos_e_mcp.md` — descrição local do Portal e MCP; alegações institucionais devem ser revalidadas no portal antes da apresentação.

### Fontes externas primárias

[^ons-faq]: ONS. [Curtailment — informações sobre a gestão de excedentes energéticos](https://www.ons.org.br/Paginas/faq_curtailment.aspx). Acesso em 12 set. 2026.
[^ons-geracao]: ONS Dados Abertos. [Geração por Usina em Base Horária](https://dados.ons.org.br/dataset/geracao-usina-2). Acesso em 12 set. 2026.
[^ons-intercambio]: ONS Dados Abertos. [Intercâmbios Entre Subsistemas](https://dados.ons.org.br/dataset/intercambio-nacional). Acesso em 12 set. 2026.
[^ons-dessem]: ONS Dados Abertos. [DESSEM — Balanço de Energia Detalhado](https://dados.ons.org.br/dataset/balanco_dessem_detalhe). Acesso em 12 set. 2026.
[^ons-portal]: ONS Dados Abertos. [Dados de Restrição de Operação por Constrained-off de Usinas Eólicas](https://dados.ons.org.br/dataset/restricao_coff_eolica_usi). Acesso em 12 set. 2026.
[^era5]: Copernicus Climate Data Store. [ERA5 hourly data on single levels from 1940 to present](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels?tab=overview); ECMWF. [ERA5 hourly time-series Product User Guide](https://confluence.ecmwf.int/pages/viewpage.action?navigatingVersions=true&pageId=627854119). Acesso em 12 set. 2026.
[^anarede-curso]: CEPEL. [Treinamento ANAREDE](https://www.cepel.br/treinamento-anarede/). Acesso em 12 set. 2026.
[^anarede-sav]: CEPEL. [Arquivo Histórico ou Savecase — Manual do Anatem](https://dre.cepel.br/manual/anatem/introducao/arquivos/historico.html). Acesso em 12 set. 2026.
