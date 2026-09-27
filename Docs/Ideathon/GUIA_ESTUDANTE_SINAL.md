# Guia universitário: curtailment, demanda e a proposta SINAL

> **Pesquisa reservada para a etapa 4.** Curtailment está fora do MVP atual e
> não deve ser implementado antes do upload climático da etapa 2. Consulte
> [`CONTEXTO_PROJETO_IA.md`](CONTEXTO_PROJETO_IA.md).

> **Como usar este arquivo:** este é o guia de leitura do relatório técnico completo. Ele mantém a mesma conclusão, os mesmos limites e a mesma recomendação, mas explica primeiro a ideia e depois o termo técnico. Para tabelas completas, fontes e detalhes de implementação, consulte [o relatório técnico](RELATORIO_IDEATHON_CURTAILMENT_E_DEMANDA.md).

## Comece por aqui

Imagine que uma região tem muito vento ou sol e, por isso, poderia gerar bastante eletricidade. Mesmo assim, em alguns momentos parte dessa energia não consegue ser usada. Isso pode ocorrer porque a demanda está baixa, porque a rede não consegue transportar toda a energia ou porque há uma condição de segurança do sistema. A redução ordenada dessa geração é chamada de **curtailment** ou *constrained-off*.

Nossa proposta não é “usar IA para adivinhar tudo”. A proposta é usar dados para responder uma pergunta prática:

> **Em qual região, em qual horário e por qual provável motivo a energia renovável corre risco de ser restringida — e qual análise deve ser priorizada?**

O produto recomendado chama-se **SINAL — Sistema Inteligente de Antecipação e Lógica de Curtailment**. Ele prevê risco, estima uma faixa de intensidade, aponta a causa provável e seleciona poucos cenários para estudo técnico. Quando houver dados completos da rede, o **ANAREDE** entra para verificar se o cenário é fisicamente possível; ele não é substituído pela IA.

---

## 1. Resumo executivo

### Em linguagem simples

O SINAL seria um “radar de risco de curta de renováveis”. Em vez de mostrar só um gráfico, ele entregaria algo como:

> “Nas próximas 6 horas, este conjunto de parques eólicos do Nordeste tem 78% de chance de sofrer restrição por excesso de energia disponível. A quantidade esperada está entre 120 e 180 MW. Os sinais mais importantes são carga líquida baixa, muita geração renovável e exportação já elevada.”

Isso ajuda uma equipe de planejamento a decidir **onde olhar primeiro**. Não é uma ordem automática para cortar ou despachar uma usina.

### Mensagem principal preservada

- IA organiza dados, encontra padrões, calcula risco e explica associações.
- Engenheiros e simuladores elétricos validam limites físicos e decisões de operação.
- Sem caso de rede, barras, circuitos e limites, não se deve prometer que a solução identificou uma linha congestionada.
- O MVP mais viável usa os dados de curta já disponibilizados e evolui para dados de carga, intercâmbio, clima e, se possível, ANAREDE.

## 2. O que os Desafios 1 e 2 têm em comum

Os dois desafios falam da mesma transição, por perspectivas diferentes.

| Desafio | Pergunta básica | Exemplo de decisão |
|---|---|---|
| 1 — Curtailment | por que uma fonte renovável precisou reduzir geração? | investigar excesso de oferta, segurança ou uma limitação externa |
| 2 — Demanda e curva do sistema | como a carga varia e cria momentos de estresse? | planejar flexibilidade, reserva e atenção às rampas |

A ponte entre eles é a **carga líquida**: de modo simplificado, é a demanda que ainda precisa ser atendida depois de considerar a geração distribuída e outras gerações que reduzem o que a rede supervisionada “enxerga”. Quando muito sol reduz a carga líquida durante o dia e a solar cai no fim da tarde, surge a conhecida **curva do pato**: vale baixo de dia e subida rápida depois.

Mas há um cuidado importante: um excesso no balanço agregado do Brasil não prova que uma linha específica está congestionada. A rede é espacial: energia precisa viajar por linhas com limites e regras próprias.

## 3. Contexto do problema

O Brasil tem forte presença de renováveis. Isso é uma vantagem para a descarbonização, mas aumenta a necessidade de coordenar geração variável, consumo, transmissão e flexibilidade. Vento e sol variam; consumo também varia por hora, dia, região, temperatura e atividade econômica.

Portanto, “instalar mais renováveis” não garante que toda a energia será aproveitada. A pergunta passa a ser: **como integrar melhor a energia que já pode ser gerada sem comprometer a segurança do sistema?**

## 4. A relação entre geração, demanda, clima, transmissão e curta

Pense na sequência abaixo como uma história, não como uma lei automática:

```text
clima e capacidade instalada → geração renovável disponível
calendário, clima e MMGD     → demanda/carga líquida
ambos, junto com intercâmbios → necessidade de escoamento e flexibilidade
rede, limites e contingências → possibilidade de restrição
```

### O que é verdade

- Vento afeta o potencial eólico; radiação e nuvens afetam o potencial solar.
- Temperatura e calendário ajudam a explicar demanda.
- Intercâmbios entre subsistemas mostram parte do movimento de energia pelo SIN.
- Em determinados horários, uma combinação de alta oferta renovável e baixa absorção pode elevar o risco de corte.

### O que seria simplificar demais

“Tem mais geração que demanda, logo haverá curtailment.” Isso não é sempre verdade. O sistema tem hidrelétricas, térmicas, perdas, reservas, controle de tensão, serviços ancilares e várias restrições locais. Duas regiões podem ter o mesmo balanço de energia, mas uma delas ter um gargalo de transmissão e a outra não.

### Tipos de restrição que não devem ser misturados

| Código / ideia | Tradução simples | Próximo passo adequado |
|---|---|---|
| `ENE` — razão energética | há mais energia disponível do que o sistema consegue absorver naquele momento | estudar flexibilidade, deslocamento de carga, armazenamento ou intercâmbio |
| `CNF` — confiabilidade | é preciso reduzir geração para manter operação segura | investigar restrições e validar hipótese elétrica |
| `REL` — indisponibilidade externa | algo fora da usina limita sua operação | investigar evento, manutenção, recomposição ou ativo externo |
| `PAR` — parecer de acesso | existe uma condição previamente associada ao acesso | tratar como limitação conhecida e conferir o documento aplicável |

Essa separação é a principal diferença entre um projeto útil e um “previsor de cortes” genérico.

## 5. Quais dados existem e quais ainda faltam

O Hackathon declara bases tratadas de *constrained-off* eólico e fotovoltaico em intervalos de **30 minutos**, além de uma base integrada. Elas trazem, entre outros campos descritos, geração, disponibilidade, geração de referência, causa/origem da restrição e motivo. Isso é muito valioso porque fornece um rótulo histórico: sabemos que um corte foi apurado e qual tipo foi registrado.

Outros conjuntos do ONS podem complementar essa visão: geração por usina, intercâmbio entre subsistemas e balanço de energia do DESSEM. O ERA5 pode acrescentar contexto meteorológico. Porém, o repositório não contém os arquivos de dados, nem caso ANAREDE, nem topologia da rede: eles precisam ser obtidos e auditados antes de entrar no modelo.

### Uma regra de ouro para o projeto

**Não inventar colunas.** Se não houver capacidade de linha, estado de chave, barra elétrica ou coordenada de parque no dado recebido, a equipe deve escrever “não disponível” e usar um proxy somente com esse rótulo.

## 6. O que os dados do ONS podem responder

Os dados de curta são o melhor ponto de partida porque já registram o fenômeno de interesse. Eles permitem responder, por exemplo:

- em quais meses, horas, fontes e subsistemas as restrições aparecem mais;
- qual parcela está associada a `ENE`, `CNF` ou `REL`;
- quanta geração foi limitada, depois de validar a fórmula e a unidade no dicionário;
- se geração, disponibilidade e recurso meteorológico ajudam a antecipar um evento.

Os dados de intercâmbio mostram fluxo agregado entre subsistemas. Eles **não** dizem o limite de cada linha. Por isso, são bons para levantar a hipótese “o escoamento estava alto”, mas não para afirmar “a linha X congestionou”.

## 7. O que o ERA5 acrescenta

ERA5 é uma **reanálise meteorológica**: uma reconstrução histórica do estado da atmosfera que combina observações e modelos físicos. Ele tem resolução horária e grade regular de cerca de 0,25° para variáveis atmosféricas. Não é uma medição dentro de cada parque e não deve ser tratado como previsão do futuro.

| Variável | Pergunta física que ajuda a responder | Uso responsável |
|---|---|---|
| componentes do vento | havia condição favorável à geração eólica? | calcular velocidade/direção e comparar com dados verificados |
| radiação solar | havia recurso disponível para FV? | relacionar com geração e atenção à unidade acumulada |
| nuvens | por que a irradiância variou? | complementar a radiação, não duplicar informação sem testar |
| temperatura e umidade | o clima pode alterar a carga? | usar com calendário e região para explicar demanda |
| chuva e pressão | há um regime meteorológico relevante? | incluir somente se melhorar a validação |

Para uma previsão futura de 6–24 horas, o ideal é usar uma **previsão meteorológica disponível naquele momento**. ERA5 é excelente para aprender com o passado; sozinho, não é o dado correto para simular que o futuro já era conhecido.

## 8. Onde o ANAREDE entra — e onde não entra

O ANAREDE é usado para estudos de fluxo de potência: ele ajuda a avaliar tensões, fluxos, carregamentos e violações quando recebe um caso elétrico completo. Em termos práticos, ele precisa de um modelo da rede com barras, circuitos, parâmetros, cargas, geradores, limites e controles.

### Divisão de trabalho saudável

```text
IA: “estes 10 horários e regiões parecem os mais críticos”
                         ↓
ANAREDE: “com este caso de rede, quais tensões, fluxos ou limites aparecem?”
                         ↓
especialista: interpreta resultado e avalia alternativa
```

Faz sentido usar IA para **escolher cenários**: em vez de simular milhares de combinações, escolher as que têm risco alto, severidade alta e são diferentes entre si. Isso economiza tempo de estudo.

Não faz sentido dizer que as séries ONS + ERA5 permitem recriar sozinhas um `.PWF` ou `.SAV`. Sem um caso autorizado e um mapa de `id_ons` para barras, o resultado correto do MVP é uma tabela de cenários, não uma validação elétrica completa.

## 9. Como juntar os dados sem criar erros

O conjunto final pode parecer uma planilha grande, mas sua unidade precisa ser bem definida. Para o MVP, uma linha pode representar:

```text
horário + fonte + id_ons
```

ou, em versão mais simples:

```text
horário + subsistema + fonte
```

Cada linha deve guardar geração, disponibilidade, causa do corte, clima, carga, intercâmbio e campos que indiquem a qualidade/origem do dado. Alguns campos são observados; outros são previstos; outros são derivados. Misturá-los sem registrar isso cria **vazamento de dados**: o modelo parece prever bem porque recebeu uma informação que, na vida real, só seria conhecida depois do evento.

Exemplo: para prever o risco às 10h de um corte às 16h, só podem entrar dados ou previsões que já existiam às 10h. A geração verificada das 16h não pode ser usada como entrada.

### Cruzamentos que fazem sentido

| Combinação | O que pode revelar | O que não permite afirmar |
|---|---|---|
| curta + razão/origem + geração de referência | frequência e intensidade por tipo de causa | a causa física completa de cada evento |
| geração eólica/FV + ERA5 + qualidade de medição | quanto o clima acrescenta ao modelo | a curva de potência exata de cada usina |
| curta + carga/DESSEM + renovável prevista | condições associadas a `ENE` | um limite de transmissão específico |
| curta + intercâmbio + subsistema | sinal de alto escoamento agregado | congestionamento de uma linha concreta |
| risco + caso ANAREDE + mapa para barras | hipótese física de fluxo/tensão | automação segura sem validação de especialista |

## 10. Hipóteses de pesquisa: como transformar ideia em teste

Uma hipótese é uma frase que pode ser confrontada com dados, e não uma conclusão pronta. As mais importantes para começar são:

1. O risco de `ENE` aumenta de forma não linear quando renováveis crescem em relação à carga líquida.
2. Geração renovável + carga + intercâmbio prevê melhor o evento do que geração isolada.
3. Clima acrescenta mais valor para antecipar o futuro do que para explicar um dado já verificado.
4. `ENE`, `CNF` e `REL` têm padrões diferentes e não devem usar uma única regra de decisão.
5. Horário, dia da semana e feriado continuam relevantes mesmo quando se considera geração disponível.
6. Baixa carga supervisionada e alta solar elevam o risco em algumas janelas diurnas.
7. Intercâmbio alto pode ser sinal de risco de confiabilidade, mas não localiza uma linha.
8. Agrupar parques com comportamento parecido pode ser melhor que treinar um modelo separado para cada ID pouco observado.
9. Se as explicações do modelo mudam muito ao longo do tempo, pode haver variável importante faltando.
10. Selecionar cenários por risco, severidade e diversidade deve render mais estudos úteis do que escolher somente os maiores valores previstos.
11. Uma previsão probabilística bem calibrada gera menos alarmes desnecessários do que um limiar fixo.
12. Separar “vai ocorrer?” de “qual será o montante?” deve funcionar melhor do que uma regressão única cheia de zeros.

## 11. Análises exploratórias antes de treinar IA

Antes de escolher XGBoost, LSTM ou qualquer outra técnica, a equipe deve desenhar o problema. As primeiras visualizações podem ser:

- mapa de calor de curta por hora e mês;
- ranking por subsistema, UF, fonte e provável causa;
- distribuição de MW/MWh restringidos, depois de conferir a unidade;
- comparação entre vento/irradiância e geração;
- carga, geração e intercâmbio em dias com e sem `ENE`;
- gráfico de rampas da carga líquida;
- análise de nulos, duplicidades, IDs e qualidade da medição.

Se esses gráficos não sustentarem uma história clara, o modelo sofisticado não resolverá o problema de produto.

## 12. Dez ideias avaliadas

| Ideia | O que entrega | Viabilidade para Hackathon |
|---|---|---:|
| **SINAL** | risco, causa, faixa de MW e cenários prioritários | 9/10 |
| Mapa de Risco | visualização espaço-temporal por cluster | 8/10 |
| Balanço Vivo | previsão de carga líquida e rampas | 7/10 |
| Alerta de Sobreoferta | aviso antecipado de absorção insuficiente | 8/10 |
| ExplicaCorte | explicação auditável de padrões e códigos | 9/10 |
| CenA-IA | seleção de cenários para ANAREDE | 6/10 |
| PriorizaExpansão | apoio a estudos de reforço de transmissão | 4/10 |
| RenovaFlex | alternativas de uso para energia que seria restringida | 5/10 |
| Carbono Condicional | estimativa ambiental somente com contrafactual válido | 5/10 |
| Detector de Regimes | descoberta de padrões atípicos | 7/10 |

As ideias não são todas o mesmo produto. Algumas servem para operação e planejamento de curto prazo; outras precisam de topologia, custos, dados privados ou parceiro de mercado. Por isso, uma ideia muito interessante pode não ser a melhor para um Hackathon curto.

## 13. Como foi feito o ranking

O ranking técnico considera: relevância para os dois desafios, uso real de IA, disponibilidade de dados, viabilidade do MVP, impacto, originalidade, integração com ANAREDE, valor para um usuário e clareza da demonstração.

O resultado principal é:

1. **SINAL: 8,8/10**
2. **ExplicaCorte: 7,7/10**
3. **Mapa de Risco / Alerta de Sobreoferta: 7,4/10**

SINAL vence não por ser “mais tecnológico”, mas porque usa um rótulo que provavelmente está disponível, produz uma decisão clara e permite demonstrar IA explicável sem depender de uma rede que ainda não foi entregue.

## 14. As três propostas finalistas

### 1º — SINAL

É o núcleo recomendado. Junta previsão, estimativa de intensidade, causa provável e priorização de cenários. Seu principal diferencial é responder “por que vale olhar para este evento agora?”.

### 2º — ExplicaCorte

É uma excelente primeira camada: organiza códigos, razões, origem, períodos e fatores associados. Na prática, deve entrar como módulo do SINAL, pois explica a previsão para quem vai usar o resultado.

### 3º — Mapa de Risco / Alerta de Sobreoferta

O mapa é a melhor forma de enxergar o problema; o alerta torna a informação acionável. Eles também entram no SINAL como interface e módulo, especialmente se carga e DESSEM estiverem disponíveis.

## 15. Solução recomendada

O MVP deve ser apresentado como **um único produto** com três pontos de vista:

1. **Mapa/linha do tempo:** onde e quando o risco cresce.
2. **Ficha do evento:** chance, faixa de MW, provável causa, qualidade da previsão e fatores associados.
3. **Fila de cenários:** quais casos merecem estudo elétrico ou investigação humana.

Isso evita cair em duas armadilhas: entregar só um dashboard sem decisão ou prometer uma integração física que ainda não foi validada.

## 16. Qual IA usar — e por quê

O ponto de partida deve ser simples e comparável.

| Tarefa | Primeiro teste | Possível evolução |
|---|---|---|
| ocorrerá curta? | regra histórica e regressão logística | LightGBM/XGBoost |
| qual causa? | classe mais comum e árvore rasa | classificação multiclasse/hierárquica |
| qual intensidade? | mediana histórica condicional | modelo em duas etapas e quantis |
| há um regime incomum? | agrupamento sazonal simples | clustering/anomalia |
| quais cenários simular? | top-k por severidade | risco × incerteza × diversidade |

Por que não começar com LSTM ou Transformer? Porque um modelo complexo não é automaticamente melhor. Para uma competição curta, o modelo deve superar o baseline em validação temporal, ser calibrado e permitir explicação. LightGBM ou uma regressão bem feita tendem a ser escolhas mais seguras para o MVP.

**SHAP** e importância de variáveis podem responder “o que mais influenciou este resultado do modelo?”. Eles não provam que uma variável causou o evento. A linguagem correta é “fator associado”, não “causa comprovada”.

## 17. Arquitetura em palavras simples

```text
dados ONS + dados climáticos + dados complementares
                    ↓
organização, limpeza, versão e alinhamento de horários
                    ↓
criação de variáveis e modelo de risco
                    ↓
probabilidade + faixa de MW + explicações + cenários
                    ↓
aplicação visual e exportação
                    ↓
ANAREDE, somente se houver caso de rede autorizado
```

Ferramentas sugeridas pelo relatório técnico: arquivos Parquet e DuckDB/Polars para lidar com volume; Python com scikit-learn/LightGBM; uma API simples e Streamlit para demonstrar. A escolha não é “moda”: ela busca velocidade, rastreabilidade e facilidade de rodar no Hackathon.

## 18. O MVP que realmente dá para demonstrar

O MVP não precisa resolver toda a operação do SIN. Ele precisa provar uma ideia útil com dados rastreáveis.

### Entrega mínima

1. Ler uma janela de dados e registrar versão/dicionário.
2. Auditar o rótulo de curta e tratar nulos.
3. Criar agregação por fonte e subsistema; avançar para `id_ons` apenas se houver qualidade suficiente.
4. Comparar baseline e modelo simples com divisão temporal.
5. Mostrar previsão probabilística, faixa de intensidade, causa provável e explicações.
6. Exibir mapa/heatmap e lista dos cenários prioritários.
7. Exportar `scenario_manifest.csv` para estudo posterior.

### Demonstração que convence

Escolha um evento histórico que o modelo não viu no treino. A aplicação deve mostrar como o risco cresceu, o que o modelo considerou relevante e qual investigação a equipe sugeriria. A mensagem final é: **o sistema orienta a atenção; ele não substitui a decisão de operação.**

## 19. Como saber se o resultado é bom

Não basta dizer “acertamos 90%”. Se a maioria dos horários não tem curta, um modelo pode acertar muito simplesmente dizendo “não haverá curta”. Por isso, avaliar:

- **PR-AUC e recall@top-k:** o modelo encontra eventos importantes entre os alertas priorizados?
- **calibração/Brier:** uma previsão de 70% acontece aproximadamente 70% das vezes?
- **macro-F1:** ele trata causas menos frequentes de forma minimamente equilibrada?
- **MAE/Pinball e cobertura de intervalos:** a faixa de MW é útil e honesta?
- **cenários úteis por execução ANAREDE:** a seleção reduz trabalho sem perder estados relevantes?

O teste deve respeitar o tempo: treinar no passado e testar no futuro (*walk-forward*), nunca sortear horários aleatoriamente.

## 20. Curtailment e descarbonização: relação com cuidado

É tentador afirmar que toda energia renovável restringida virou emissão. Isso não é garantido. Para estimar CO2 evitado, é preciso mostrar o que teria acontecido sem a ação: qual geração seria substituída, em qual hora e local, e qual é seu fator de emissão marginal.

```text
energia renovável não usada
→ alternativa de operação ou consumo
→ geração realmente deslocada
→ fator de emissão aplicável
→ estimativa de tCO2e evitadas
```

MWh restringidos podem ser calculados somente depois de confirmar unidade e duração. Impacto econômico também precisa de preço, contrato e regras de ressarcimento. O produto pode comunicar o **potencial** de aproveitamento; não deve declarar emissões ou economia como fato sem a metodologia acima.

## 21. Limitações do conhecimento disponível

- O portal pode atualizar dados depois da publicação; toda análise precisa de data de extração e versão.
- ERA5 é uma aproximação espacial e meteorológica, não sensor dentro do parque.
- Agregar por subsistema não revela uma violação em barra/linha.
- Dados históricos não expõem todas as regras e decisões operativas.

Esses limites não inviabilizam o projeto. Eles definem o que é honesto prometer no MVP.

## 22. Riscos técnicos e como reduzir cada um

| Risco | Como reduzir |
|---|---|
| dado do futuro entra sem querer no treino | definir o “tempo de conhecimento” de cada coluna |
| há poucos eventos de curta | usar métricas adequadas, ponderação e intervalos |
| clima não explica o parque | comparar ERA5 com o dado `detail` e não superinterpretar |
| falta dado de rede | limitar resultado a risco/hipótese e não a diagnóstico de linha |
| mudança em regra/dicionário | congelar versão e refazer validação |
| usuário trata previsão como comando | manter humano no processo e explicar incerteza |

## 23. Perguntas que a equipe deve levar ao mentor

### P0 — responder antes de modelar

- Como calcular corretamente MW/MWh restringidos a partir dos campos oficiais?
- Quais dados de carga, DESSEM, geração e intercâmbio estarão realmente acessíveis, com qual fuso e data de publicação?
- Existe caso ANAREDE didático/autorizado, licença, versão e possibilidade de execução?
- Quem é o primeiro usuário e qual decisão concreta ele consegue tomar para cada causa?

### P1 — importante para melhorar a solução

- Existem coordenadas, potência instalada e mapeamento de usina para barra?
- Há previsão meteorológica/operativa disponível no instante em que se quer prever?
- O usuário precisa do risco por ativo, cluster, subsistema ou corredor?
- Existe fator de emissão marginal ou despacho para um cálculo ambiental auditável?

### P2 — visão futura

- Quais estudos de tensão, estabilidade e serviços ancilares devem entrar depois?
- Um modelo profundo realmente melhora resultado e calibração?
- Há consumidor flexível, bateria ou parceiro de mercado para testar uma recomendação econômica?

## 24. Experimentos rápidos que validam a ideia

1. Auditar a base: fórmula, unidades, nulos, duplicatas e chave dos registros.
2. Fazer heatmaps de curta por hora, mês, causa e região.
3. Cruzar geração eólica/FV com vento/irradiância e verificar o ganho de ERA5.
4. Comparar dias com e sem `ENE` usando carga, geração e intercâmbio.
5. Treinar baseline de ocorrência e comparar com LightGBM usando validação temporal.
6. Testar se separar causas melhora utilidade da previsão.
7. Agrupar séries para descobrir clusters de comportamento parecido.
8. Montar contrafactual agregado de carga flexível, marcando claramente que não é fluxo nodal.
9. Se houver caso, alterar uma injeção/carga conhecida no ANAREDE e validar a execução.
10. Comparar seleção de cenários por maior risco contra risco + diversidade.

## 25. Roadmap de trabalho

| Fase | Resultado esperado |
|---|---|
| Entendimento | usuário, decisão e causas claramente definidos |
| Dados | arquivos versionados, dicionários lidos e qualidade conhecida |
| Exploração | poucos gráficos que contam uma história verdadeira |
| Hipóteses | H1–H4 aceitas ou rejeitadas com evidência |
| Baseline | referência simples e honesta para comparar IA |
| ANAREDE | piloto funcional ou bloqueio documentado |
| MVP | demonstração repetível em menos de cinco minutos |

## 26. Próximas ações práticas

1. Baixar os arquivos e dicionários fornecidos; não começar pelo modelo.
2. Verificar imediatamente a disponibilidade de caso ANAREDE e de mapeamento para barras.
3. Definir o usuário inicial como planejamento de geradora/transmissora ou pesquisa, e não “operar o ONS”.
4. Construir primeiro o baseline por causa e uma reprodução visual de evento histórico.
5. Adicionar ERA5, carga e DESSEM somente se os testes mostrarem ganho real.

---

## Glossário curto

| Termo | Explicação direta |
|---|---|
| **Curtailment / constrained-off** | redução de geração que poderia estar disponível, por condição operativa do sistema |
| **Carga** | potência solicitada em um instante; não é o mesmo que consumo acumulado |
| **Carga líquida** | carga após considerar gerações que reduzem o que a rede precisa atender diretamente |
| **MMGD** | micro e minigeração distribuída, como muitos sistemas solares em telhados |
| **Intercâmbio** | troca/fluxo de energia entre subsistemas |
| **Subsistema** | grande região operacional do SIN: Norte, Nordeste, Sul e SE/CO |
| **Baseline** | solução simples que a IA precisa superar para justificar sua complexidade |
| **Calibração** | consistência entre a probabilidade prevista e a frequência observada |
| **SHAP** | técnica para explicar quais variáveis pesaram em uma previsão; não prova causalidade |
| **Cenário** | conjunto coerente de condições de geração, carga e rede a ser analisado |
| **ANAREDE** | programa de estudos elétricos, incluindo fluxo de potência, usado para validação física quando há caso completo |

## Para aprofundar

- [Relatório técnico completo](RELATORIO_IDEATHON_CURTAILMENT_E_DEMANDA.md) — fontes, inventários, matriz de ranking e arquitetura detalhada.
- [Dados.md](../Dados.md) — descrição local das bases disponibilizadas.
- [demanda_curva_pato_e_curtailment.md](../demanda_curva_pato_e_curtailment.md) — conceitos de carga supervisionada, rampa e curta.
