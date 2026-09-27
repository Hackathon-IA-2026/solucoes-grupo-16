# Plano de evolução da validação temporal

**Status:** infraestrutura local implementada; auditoria remota e execução
científica bloqueadas pelas autorizações/decisões descritas abaixo. Nenhuma
etapa deste documento implica aprovação científica ou homologação operacional.
**Escopo:** estimador vento → potência do cenário climático da fase 2.  
**Fora de escopo:** replay observado, previsão meteorológica futura,
curtailment e cálculo elétrico do ANAREDE.

## 1. Objetivo

Substituir o split exploratório único 70/15/15 por um protocolo temporal
reproduzível para o painel `conjunto ONS × hora`, comum ao LightGBM e ao futuro
XGBoost. O protocolo deve separar desenvolvimento, calibração de incerteza e
teste final, registrar exatamente quais linhas participaram de cada etapa e
impedir que os blocos reservados sejam usados pelo caminho normal de tuning.

Este plano permite desenvolver a infraestrutura com fixtures sintéticas e com
pilotos já examinados. Resultados produzidos antes da aprovação das
pré-condições devem permanecer marcados como `exploratory`.

## 2. Problemas que o plano resolve

| Problema atual | Resultado esperado |
| --- | --- |
| Um único split por quantidade de horas observadas | Folds expansivos definidos por limites de calendário imutáveis |
| Remover uma hora pode deslocar as fronteiras | Atribuições permanecem iguais para todas as outras horas |
| A mesma validação controla early stopping e intervalos | Bloco exclusivo de early stopping e calibração posterior exclusiva |
| O treino calcula o teste em toda execução | Tuning não recebe acesso ao teste final |
| `approved` depende do MAE do teste legado | Seleção, teste final e homologação passam a ter estados distintos |
| Cobertura presume todos os conjuntos ativos o período inteiro | Denominador considera vigência cadastral e composição |
| `experiment_days` mistura recorte e validação | Snapshot e protocolo temporal tornam-se contratos separados |
| Testes usam principalmente uma usina regular | Fixtures passam a representar painel irregular, lacunas e mudanças de vigência |
| Metadados atuais são específicos do LightGBM legado | Manifesto versionado e contrato comum entre algoritmos |
| `Predictor` conhece apenas a regra antiga de aprovação | Compatibilidade explícita por versão de artefato e fallback seguro |

## 3. Pré-condições científicas

As fases de infraestrutura podem avançar sem estas aprovações, mas a execução
do protocolo científico fica bloqueada até que todas estejam registradas:

- contrato do alvo versionado e aprovado;
- política de elegibilidade dos rótulos aprovada;
- snapshot imutável com hashes, fontes e cobertura por conjunto/mês;
- target e disponibilidade sem imputação ou clipping;
- capacidade e composição com vigência verificável;
- perdas de fonte, cadastro e junção reconciliadas;
- lista dos períodos já examinados pela equipe;
- disponibilidade operacional de cada feature confirmada.

O piloto de agosto de 2024 já foi consultado nos experimentos 3–6. Ele pode ser
usado para desenvolver e testar o pipeline, mas não pode ser tratado novamente
como teste final intocado. Um único mês não demonstra desempenho anual.

## 4. Estados e gates

| Estado | O que permite | O que não permite |
| --- | --- | --- |
| `infrastructure_test` | Fixtures sintéticas, testes unitários e integração | Alegação de desempenho real |
| `exploratory` | Pilotos reais já examinados e comparação preliminar | Aprovação científica ou promoção |
| `protocol_frozen` | Execução dos folds conforme manifesto aprovado | Alterar regras após consultar reservas |
| `model_frozen` | Calibrar somente a incerteza | Alterar modelo, features ou filtros |
| `calibration_frozen` | Executar uma avaliação final | Ajustar calibração após abrir o teste |
| `final_test_consumed` | Emitir relatório de aceite ou reprovação | Reutilizar o teste como se fosse intocado |
| `operationally_homologated` | Seleção explícita para servir na fase 2 | Afirmar validação elétrica sem ANAREDE |

`complete` no registro Supabase significa que o backup foi verificado. Esse
estado não equivale a `scientifically_approved` ou
`operationally_homologated`.

## 5. Protocolo alvo

### 5.1 Folds de desenvolvimento

Cada fold terá três intervalos timezone-aware, fechados à esquerda e abertos à
direita: `[start_utc, end_utc)`.

1. **Treino:** ajusta o estimador e qualquer transformação aprendida.
2. **Early stopping:** determina a melhor iteração daquele fold.
3. **Avaliação do fold:** produz as métricas usadas para comparar candidatos.

O treino cresce nos folds seguintes. Um intervalo de avaliação pode integrar o
treino de uma rodada posterior, desde que continue disjunto do treino e early
stopping dentro do fold original. Calibração e teste final nunca participam dos
folds de desenvolvimento.

As datas só serão definidas depois da auditoria de disponibilidade, cobertura e
histórico de uso. Não serão derivadas do número de linhas presentes.

### 5.2 Seleção do candidato

Features, algoritmo, hiperparâmetros, filtros, pesos e parâmetros da curva
física podem ser escolhidos apenas com os resultados dos folds de
desenvolvimento. Antes de executar o protocolo, registrar:

- métrica primária;
- métricas de proteção e limites por conjunto/regime;
- forma de agregação entre folds;
- regra de desempate;
- orçamento de candidatos;
- condição para considerar um fold insuficiente.

A regra numérica final ainda é decisão pendente. Uma opção a avaliar é média de
MAE em MW nos folds, sujeita a limites de viés, cobertura e estabilidade.

### 5.3 Treino pontual final

Depois da seleção, congelar a configuração e treinar no desenvolvimento
completo. O número de árvores deve seguir uma regra definida antes de abrir a
calibração. A proposta inicial é usar a mediana das melhores iterações dos
folds, com arredondamento e limites declarados no manifesto, e treinar com esse
número fixo.

O resultado recebe hash e estado `model_frozen`.

### 5.4 Calibração de incerteza

O bloco de calibração recebe apenas o modelo pontual congelado. Ele pode ajustar
somente os parâmetros do método de incerteza previamente escolhido, como
quantis de resíduos, limiar de amostras e fallback global. Não pode selecionar
algoritmo, features, hiperparâmetros, filtros, pesos ou curva física.

Modelo e calibração terão hashes separados e vinculados.

### 5.5 Teste final

O teste final só pode ser aberto com modelo, calibração, métricas e critérios de
aceite congelados. A execução muda seu estado para `final_test_consumed` e gera
um relatório imutável.

Qualquer ajuste motivado por esse relatório exige uma nova versão do protocolo
e uma nova reserva temporal ainda não consultada.

## 6. Lacunas, cobertura e vigência

Horas ausentes continuam ausentes. O sistema não deve estender blocos, mover
fronteiras, imputar target/disponibilidade ou descartar folds silenciosamente.

A cobertura por conjunto e bloco será:

```text
horas elegíveis observadas / horas esperadas durante a vigência
```

O denominador deve considerar vigência do conjunto, membros CEG, capacidade e
granularidade. O relatório deve separar perdas por fonte ONS, ERA5, cadastro,
coordenada, junção, duplicata e política de elegibilidade.

Fold vazio bloqueia a execução. Limites mínimos de horas, conjuntos e cobertura
serão decisões versionadas. Fixtures podem usar limites próprios apenas sob
estado `infrastructure_test`.

## 7. Suporte temporal e purga

Cada feature e rótulo deve declarar:

- instante de referência;
- intervalo de dados consumido;
- momento de disponibilidade operacional;
- atraso de publicação relevante;
- horizonte que representa.

O gap será calculado pela sobreposição real desses intervalos. Não haverá gap
fixo arbitrário. Com features e alvo estritamente horários, sem janelas que
atravessem fronteiras, gap zero pode ser válido, mas isso depende de confirmar a
semântica temporal ONS e a disponibilidade usada no cenário.

Autocorrelação é dependência temporal e pode reduzir a independência das
métricas; sozinha, não prova vazamento. Ela será tratada por blocos temporais,
variação entre folds e análise por períodos.

ERA5 histórico valida a relação entre reanálise e rótulo histórico. Não valida
o desempenho com uma futura fonte meteorológica operacional, que terá erro,
latência e distribuição próprios. Essa avaliação pertence à etapa futura e não
deve ser inferida deste protocolo.

## 8. Generalização para conjuntos não vistos

Este protocolo adicional só será executado se o produto assumir atendimento a
conjuntos sem histórico de treino.

Antes de observar resultados, construir grupos que mantenham juntos:

- conjuntos com membros CEG compartilhados;
- identidades relacionadas por divisão, fusão ou renomeação;
- cadastros com continuidade operacional;
- opcionalmente, mesma célula ERA5 ou regiões muito próximas.

Reserva por ID mede uma hipótese diferente de reserva por célula ERA5 ou região.
Os resultados serão separados em conjunto conhecido, conjunto novo em região
conhecida e transferência geográfica. Em todos os casos, a separação temporal
continua obrigatória.

## 9. Manifestos e atribuição das linhas

Criar um manifesto imutável com, no mínimo:

- `protocol_version`, estado e data;
- hash do contrato do alvo e da política de elegibilidade;
- hashes do snapshot, catálogo, composição e fontes;
- semântica temporal, timezone e limites `[start, end)`;
- suporte temporal das features e justificativa do gap;
- folds planejados e efetivamente observados;
- cobertura por conjunto/mês e motivos de exclusão;
- candidatos autorizados e orçamento de tuning;
- regra de seleção e treino final;
- método e parâmetros permitidos na calibração;
- hashes do modelo, calibração e relatório final;
- períodos já expostos e log de acesso aos blocos reservados.

Materializar uma tabela de atribuições:

```text
protocol_version, fold_id, usina_id, timestamp_utc, role, row_fingerprint
```

Seu hash será consumido igualmente por LightGBM e XGBoost. Reordenar linhas não
pode mudar o hash lógico ou as atribuições.

## 10. Permissões por etapa

| Job | Leitura permitida |
| --- | --- |
| Construção/auditoria | Fontes completas para criar snapshot e reservas |
| Tuning | Somente blocos de desenvolvimento |
| Treino final | Desenvolvimento completo e configuração congelada |
| Calibração | Modelo congelado e bloco de calibração |
| Avaliação final | Modelo + calibração congelados e teste final |
| Predictor | Artefatos homologados, sem datasets de avaliação |

> Observação: a linha “Tuning” significa apenas blocos de desenvolvimento.

Separar fisicamente os arquivos ou objetos reservados. Jobs científicos não
devem receber uma chave administrativa ampla do Supabase. Preferir credenciais
restritas ou URLs assinadas para os objetos autorizados. Toda abertura de
calibração ou teste final deve produzir registro de acesso.

## 11. Plano de implementação por fase

### Fase 0 — decisões e inventário

**Objetivo:** determinar se existe base para uma execução científica.

Tarefas:

1. versionar contrato do alvo e política de elegibilidade;
2. inventariar meses materializados e períodos já consultados;
3. reconciliar perdas contra fontes originais;
4. validar vigências de capacidade, conjunto e CEG;
5. decidir promessa sobre conjuntos não vistos;
6. definir métricas, cobertura mínima e regra de seleção.

Entregáveis:

- contrato do alvo aprovado;
- relatório de auditoria do snapshot;
- registro dos períodos expostos;
- decisões pendentes explicitamente bloqueantes.

Gate: sem esses itens, somente `infrastructure_test` e `exploratory`.

### Fase 1 — contrato do protocolo

**Objetivo:** criar formatos estáveis antes de alterar o treinamento.

Arquivos planejados:

- `training/protocol.py`: schemas e validação do manifesto;
- configuração versionada de períodos;
- schema da tabela de atribuições;
- extensão do registro Supabase para protocolo e acessos.

Testes:

- rejeição de intervalos ingênuos, sobrepostos ou invertidos;
- serialização determinística;
- alteração de decisão ou snapshot muda o hash;
- estados não podem retroceder ou pular gates.

Gate: manifesto reproduzível e revisado antes do gerador de splits.

### Fase 2 — gerador de splits puro

**Objetivo:** atribuir linhas sem conhecer algoritmo ou métricas.

Arquivo planejado: `training/splits.py`.

Tarefas:

1. atribuir por limites de calendário;
2. manter toda hora no mesmo papel;
3. aplicar purga declarada;
4. calcular cobertura por vigência;
5. materializar atribuições e hashes;
6. falhar em folds vazios/insuficientes.

Testes com painel sintético irregular:

- múltiplos conjuntos por hora;
- entrada e saída de operação;
- lacunas diferentes por conjunto;
- viradas UTC, mês, ano e ano bissexto;
- remoção/adiação de linhas sem deslocar fronteiras;
- fragmentação de hora impossível.

Gate: mesmas atribuições após embaralhar linhas e entre execuções.

### Fase 3 — separar snapshot e protocolo

**Objetivo:** impedir que `experiment_days` determine implicitamente os splits.

Alterações planejadas em `training/build_dataset.py` e `training/config.py`:

- `build_dataset` valida e consolida o snapshot;
- protocolo seleciona blocos posteriormente;
- cobertura usa vigência;
- configurações antigas permanecem legíveis como legado;
- exclusões científicas vêm de política versionada, não de defaults ocultos.

Gate: um snapshot imutável pode ser reutilizado por diferentes protocolos sem
ser reconstruído ou reordenado.

### Fase 4 — treino dos folds

**Objetivo:** desacoplar ajuste, early stopping e avaliação.

Alterações planejadas:

- `training/train.py`: função de treino de um fold sem teste/calibração;
- novo `training/tune.py`: orquestra candidatos e folds;
- interface de estimador comum a LightGBM e XGBoost;
- registro de métricas e melhores iterações por fold.

Testes:

- `fit` recebe somente treino;
- `eval_set` recebe somente early stopping;
- avaliação não aparece no ajuste;
- calibração e teste não precisam estar montados para executar tuning;
- LightGBM e estimador substituto recebem os mesmos hashes.

Gate: seleção reproduzível usando apenas avaliações dos folds.

### Fase 5 — treino final congelado

**Objetivo:** produzir o modelo pontual sem consultar reservas.

Tarefas:

1. aplicar regra predefinida de iterações;
2. treinar sobre desenvolvimento completo;
3. registrar configuração e hashes;
4. mudar estado para `model_frozen`.

Testes:

- alterações em calibração/teste não mudam o modelo;
- resultado reproduzível com seed e runtime registrados;
- modelo só aceita um candidato selecionado pelo manifesto.

### Fase 6 — calibração exclusiva

**Objetivo:** separar os parâmetros de incerteza do ajuste pontual.

Arquivo planejado: `training/calibrate.py`.

Testes:

- hash do modelo obrigatório;
- calibração acessa somente seu bloco;
- alterar targets do teste não muda intervalos;
- parâmetros fora da lista permitida são rejeitados;
- cobertura e largura são reportadas sem reabrir tuning.

Gate: `calibration_frozen` com artefato próprio.

### Fase 7 — avaliação final controlada

**Objetivo:** consumir uma vez o teste reservado.

Alterações planejadas em `training/evaluate.py`:

- comando separado para avaliação de fold e final;
- validação de modelo, calibração, snapshot e atribuições;
- registro de acesso antes da leitura;
- relatório imutável e transição para `final_test_consumed`.

Testes:

- artefato divergente é rejeitado;
- teste não pode ser usado como `eval_set`;
- segunda abertura fica registrada e não recupera status de intocado;
- dados adicionais ou ausentes não alteram silenciosamente o período.

### Fase 8 — compatibilidade operacional

**Objetivo:** adaptar o consumidor sem promover artefatos automaticamente.

Alterações planejadas em `app/predictor.py`:

- introduzir `artifact_schema_version`;
- reconhecer artefatos legados como `legacy-temporal-70-15-15`;
- exigir evidência separada de homologação para artefatos novos;
- manter fallback físico em incompatibilidade;
- carregar modelo e calibração somente com hashes compatíveis.

Gate: testes de round-trip e fallback passam para versões antiga, nova e
corrompida.

### Fase 9 — XGBoost e execução científica

**Objetivo:** comparar algoritmos sob o mesmo protocolo.

1. implementar adaptador XGBoost;
2. reutilizar snapshot, atribuições, features e métricas;
3. provar igualdade de hashes entre algoritmos;
4. executar inicialmente em fixtures/pilotos;
5. executar protocolo congelado somente após a Fase 0 ser aprovada.

Se o teste reservado for consultado antes de incluir XGBoost na seleção, ele
não poderá ser reutilizado como teste final imparcial da comparação.

## 12. Matriz de testes de aceite

| Categoria | Evidência exigida |
| --- | --- |
| Temporal | Blocos disjuntos dentro do fold; `[start, end)`; sem fragmentação da hora |
| Estabilidade | Ordem, ausência ou linhas externas não deslocam cortes |
| Vazamento | Features e transformações só usam dados autorizados |
| Early stopping | Somente o bloco exclusivo aparece em `eval_set` |
| Reservas | Tuning executa sem acesso à calibração/teste |
| Calibração | Ajusta apenas incerteza do modelo congelado |
| Teste final | Acesso único registrado; critérios já congelados |
| Painel | Lacunas, vigências e cobertura são calculadas por conjunto |
| Algoritmos | Mesmos hashes de linhas/features para LightGBM e XGBoost |
| Artefatos | Manifesto, modelo e calibração incompatíveis são rejeitados |
| Predictor | Legado funciona; novo exige homologação; corrupção gera fallback |
| Auditoria | Supabase preserva decisões, estados, acessos e hashes |

## 13. Critério de conclusão

A infraestrutura estará concluída quando:

1. o manifesto reproduzir todas as atribuições;
2. os testes demonstrarem isolamento dos blocos em todos os caminhos suportados;
3. tuning puder rodar sem acesso às reservas;
4. LightGBM e XGBoost compartilharem exatamente dados e protocolo;
5. treino final, calibração e teste tiverem estados e artefatos separados;
6. acessos e decisões forem auditáveis;
7. o `Predictor` preservar compatibilidade e fallback seguro.

A aprovação científica exige adicionalmente todas as pré-condições da seção 3.
A homologação operacional exige ainda validação ponta a ponta da fase 2 e aceite
do caso no ANAREDE. Nenhum resultado deste protocolo implica convergência
elétrica.

## 14. Riscos e reversão

| Risco | Mitigação |
| --- | --- |
| Teste final consultado durante desenvolvimento | Separação física, credenciais restritas e log de acesso |
| Mudança de cadastro altera cobertura histórica | Snapshot e composição versionados por vigência |
| Novo metadata quebra o Predictor | `artifact_schema_version` e carregador legado explícito |
| Algoritmos recebem amostras diferentes | Tabela de atribuições externa e hash comum |
| Fold insuficiente é ignorado | Falha explícita ou estado exploratório previsto no manifesto |
| Supabase `complete` é confundido com aprovação | Estados científicos e operacionais separados |
| Retreino após teste apaga histórico | Artefatos imutáveis e nova versão de protocolo |

Reversão operacional:

- manter artefatos legados imutáveis;
- selecionar explicitamente a versão anteriormente homologada;
- restaurá-la pelo registro Supabase;
- manter resultados novos, inclusive reprovados, para auditoria;
- nunca sobrescrever o modelo anterior durante a migração.

## 15. Decisões pendentes

- contrato e fonte de verdade do target;
- política para referência acima da disponibilidade;
- critérios de elegibilidade ONS;
- cobertura mínima por conjunto, mês e fold;
- extensão temporal necessária;
- inventário de períodos já examinados;
- métrica primária e agregação entre folds;
- regra de iterações do treino final;
- método de calibração;
- significado de conjunto não visto;
- nível de agrupamento espacial;
- disponibilidade operacional das features;
- critérios de aprovação científica e homologação operacional.

Até essas decisões serem resolvidas, todo resultado permanece exploratório.

## 16. Estado da implementação

Implementado em 26 de setembro de 2026, sem consumir reservas reais:

- contrato e estados em `training/protocol.py`, com serialização determinística,
  hashes, gates e log de acesso a blocos reservados;
- atribuição pura `[start,end)` e cobertura por vigência em
  `training/splits.py`, estável a ordem, lacunas e linhas externas;
- snapshot reutilizável por `prepare_snapshot`, mantendo leitura explícita do
  formato legado;
- tuning de folds em `training/tune.py`, com interfaces comuns de LightGBM e
  XGBoost e sem uso de calibração/teste;
- treino congelado, calibração exclusiva, teste final de abertura única e
  homologação explícita em `training/protocol_jobs.py` e CLIs separados;
- `artifact_schema_version` no produtor e consumidor, compatibilidade do legado
  e fallback físico para artefato novo não homologado ou corrompido;
- bundle Supabase compatível com artefatos novos e migração auditável em
  `backend/supabase/migrations/20260926_temporal_protocol.sql`;
- fixtures de painel irregular, fronteiras, estabilidade e gates em
  `tests/test_temporal_protocol.py`.

Não implementado por depender de decisão/aprovação externa: datas científicas,
contrato final do target, política ONS de elegibilidade, mínimos de cobertura,
lista final de candidatos, critérios numéricos de aceite, execução com dados
reais e aceite no ANAREDE. A emissão automática dos eventos de acesso para o
Supabase também não está habilitada: o bundle mantém primeiro o log local
imutável e a migração prepara o registro remoto, mas a escrita externa exige
configuração/autorização operacional específica. O arquivo
`training/protocol.example.json` permanece deliberadamente em
`infrastructure_test`, com hashes placeholder.
