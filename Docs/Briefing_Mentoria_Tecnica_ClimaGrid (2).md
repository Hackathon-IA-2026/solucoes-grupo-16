# **ClimaGrid e o estimador vento para potência**

*Briefing de mentoria técnica sobre escopo, estado do ML e viabilidade de uso*

Objetivo. Preparar uma conversa técnica sobre o que o ClimaGrid já implementou, o que ainda é experimento e quais decisões científicas precisam ser aprovadas antes de apresentar o modelo como aplicável.

Conclusão em uma frase. O projeto já demonstra uma cadeia útil de cenário climático até um PWF de uma hora, mas o ML ainda não substitui a curva física em produção: hoje a curva é o estimador servido na fase 2, enquanto o LightGBM híbrido é um experimento que precisa de alvo aprovado, histórico mais amplo, validação temporal intacta e confirmação no ANAREDE.

# **1 O que o ClimaGrid resolve**

O ClimaGrid recebe uma condição de vento associada aos conjuntos eólicos do subsistema Nordeste, estima uma injeção de potência ativa em MW, distribui essa potência para as barras elétricas mapeadas e exporta um PWF para análise no ANAREDE. O produto prepara o caso; não executa o fluxo de potência nem afirma convergência elétrica.

A unidade operacional é uma hora e um PWF representa um único instante. Um período gera uma coleção de instantes e arquivos, não um PWF temporal único. No replay histórico, a geração usada é a geração observada da ONS; esse fluxo não depende de ML.

# **2 Evolução do projeto e fases**

| Fase | Estado verificado | Entrada e saída | Papel do ML |
| :---- | :---- | :---- | :---- |
| 1 Replay histórico | Implementada | ONS GERACAO\_USINA-2\_HO \+ ERA5 do mesmo instante; exporta PWF com Pg observado. | Nenhum. Não chamar observação de estimativa. |
| 2 Cenário climático | Protótipo ponta a ponta em validação; limite do MVP | CSV normalizado ou uma hora histórica ERA5; estimativa por conjunto; revisão de barras; PWF de uma hora. | Curva física servida hoje. O híbrido LightGBM ainda não está integrado ao caminho do cenário. |
| 3 Hora futura | Pós-MVP | Exige fonte explícita de meteorologia futura, climatologia ou cenário probabilístico. | Só depois da fase 2; ERA5 isolado não é previsão futura. |
| 4 Curtailment | Fora do MVP; por último | Separaria potencial, geração observada, indisponibilidade e causa de restrição. | Não deve ser antecipado nem confundido com estimativa bruta. |

Os PDFs de visão do Ideathon descrevem uma ambição maior, incluindo previsão futura, risco de curtailment e classificador de causa. O contexto canônico atual restringe o MVP à fase 2\. Para a mentoria, a leitura correta é usar os PDFs como origem da proposta e o repositório atual como estado de implementação.

# **3 O que está implementado hoje**

Fato verificado no código. O caminho de upload e de ERA5 histórico identifica o estimador como physical-curve-v1 em backend/ai-service/app/climate\_file.py. Ele calcula a curva física com velocidade do vento, capacidade e disponibilidade, aplica cut-in/cut-out e limita o resultado a capacidade instalada multiplicada pela disponibilidade.

Fato verificado no código. Existe um Predictor em backend/ai-service/app/predictor.py e um treino em backend/ai-service/training/train.py. O treino usa LightGBM para aprender um resíduo em relação à curva física, em fração da capacidade. O artefato só é considerado aprovado quando o MAE do híbrido no teste é menor que o MAE da curva física; se o artefato faltar, estiver inválido, estiver fora do domínio ou não estiver aprovado, a API cai para a curva física.

Limite operacional. Essa regra de aprovação é uma regra experimental de artefato, não uma aprovação científica para produção. O endpoint da fase 2 ainda não deve ser descrito como “IA em operação”.

# **4 Como o modelo preditivo agiria**

O desenho atual é híbrido e residual:

1. O cenário fornece uma hora, o conjunto ONS e u100/v100 em m/s; temperatura, pressão e disponibilidade podem completar o contexto conforme o contrato.  
2. A curva física produz o baseline em MW, com zero abaixo do cut-in, rampa até a potência nominal, patamar e zero acima do cut-out.  
3. O LightGBM estima uma correção do baseline usando variáveis climáticas, calendário, capacidade, disponibilidade e indicadores de qualidade. O modelo não deveria usar uma restrição contemporânea como feature do cenário.  
4. A correção é somada ao baseline e novamente limitada a \[0, capacidade x disponibilidade\]. Essa barreira é a garantia física disponível no código.  
5. A estimativa por conjunto é distribuída por CEG para uma ou mais barras, e o writer altera somente Pg no PWF. A validação elétrica continua no ANAREDE.

Interpretação importante. Como a saída é limitada por capacidade x disponibilidade, a grandeza atual se comporta como potência disponível condicionada à disponibilidade informada. Isso não é automaticamente potencial bruto eólico, nem geração verificada observada.

# **5 Quatro grandezas que não podem ser misturadas**

| Grandeza | O que representa | Fonte ou hipótese | Uso adequado |
| :---- | :---- | :---- | :---- |
| Potencial eólico bruto | Produção associada ao vento, sem aplicar indisponibilidade operacional ou corte de rede. | Curva física/modelo; requer disponibilidade igual a 1 ou outro contrato explícito. | Estimar o recurso e separar efeitos operacionais. |
| Potência disponível | O que poderia ser gerado no instante dado o vento e a disponibilidade eletromecânica. | Vento \+ cadastro \+ disponibilidade válida. | Alvo mais compatível com o clipping atual, se o ONS confirmar a semântica. |
| Geração efetivamente verificada | Produção observada/entregue, podendo conter efeitos de manutenção, restrição e operação. | ONS GERACAO\_USINA-2\_HO. | Replay e análise operacional; não é automaticamente potencial. |
| Geração de referência ONS | Estimativa ONS usada para representar geração sem limitação, segundo a documentação do piloto. | RESTRICAO\_COFF\_EOLICA e coluna geracao\_referencia\_mw. | Candidato a proxy de potencial, mas exige decisão sobre excessos e qualidade. |

Atualização de 27 de setembro de 2026. Novos treinos aceitam somente
geracao\_referencia\_mw. A referência ONS continua não sendo uma medição direta
e pode superar capacidade instalada ou disponível; portanto, especialista ONS,
filtros e política de elegibilidade ainda precisam de aprovação antes de
qualquer promoção. geracao\_verificada\_mw permanece no replay, em auditorias e
na compatibilidade de artefatos legados, mas é recusada como target novo.

# **6 O que os experimentos realmente mostram**

Os resultados abaixo são evidências de viabilidade do pipeline, não validação de produção. O piloto multiusina usa agosto de 2024, alvo geracao\_referencia\_mw e um split temporal. O teste já foi consultado em várias rodadas e não deve orientar novas escolhas sem reservar outro período final.

| Experimento | Validação física | Validação híbrida | Teste físico | Teste híbrido | Leitura |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Usina 01 exp 1 | n/d | n/d | 73,77 MW | 72,30 MW | Melhora pequena; aprovado apenas pela regra experimental. |
| Usina 01 exp 2 | n/d | n/d | 73,77 MW | 80,10 MW | Piorou; artefato rejeitado e fallback preservado. |
| Multiusina 03 | 49,77 MW | 20,78 MW | 51,03 MW | 23,63 MW | Melhor teste entre 03-06; ainda um mês. |
| Multiusina 04 | 49,77 MW | 20,94 MW | 51,03 MW | 24,03 MW | Melhora; não venceu o teste. |
| Multiusina 05 | 49,77 MW | 20,77 MW | 51,03 MW | 23,71 MW | Melhor validação por 0,006 MW; não prova superioridade. |
| Multiusina 06 | 49,77 MW | 20,89 MW | 51,03 MW | 23,98 MW | Melhora; ainda dependente do mesmo piloto. |

O intervalo empírico do experimento multiusina cobriu cerca de 85% do teste, abaixo dos 90% nominais. Há também grande variação por conjunto. Isso reforça a necessidade de medir por mês, usina, faixa de vento e disponibilidade, em vez de aceitar somente o MAE agregado.

# **7 A pergunta central sobre substituir a curva física**

## **Resposta curta**

O modelo pode se tornar aplicável como estimador de apoio à decisão, mas ainda não há evidência para substituir a curva física hoje. A recomendação técnica é manter a curva como baseline, limite e fallback, e permitir que o ML a corrija somente quando um artefato aprovado estiver dentro do domínio de treino.

## **Por que o ML é interessante**

* A curva genérica assume uma relação idealizada entre vento e potência. Ela não conhece bem composição da frota, esteira, topografia, densidade do ar, viés do ponto ERA5, degradação ou padrões locais.  
* O modelo residual pode aprender apenas a parte sistemática que a curva não explica, reduzindo viés sem abandonar a restrição física.  
* Um modelo aprovado pode produzir intervalos de incerteza e sinalizar cenários fora do domínio, algo que uma curva fixa não oferece.  
* A melhora só importa se alterar decisões de estudo: por exemplo, a injeção estimada precisa mudar a conclusão do fluxo de potência ou reduzir retrabalho do analista.

## **Por que não remover a curva**

* O ML depende de um alvo com semântica correta e de histórico representativo. Um único mês não cobre sazonalidade, mudanças cadastrais e regimes de vento.  
* A geração verificada inclui efeitos que não são vento; treinar diretamente nela pode ensinar restrição ao estimador de potencial.  
* A referência ONS é útil, mas não é verdade absoluta. Linhas acima de capacidade disponível precisam de classificação ou revisão, não de clipping silencioso.  
* A curva oferece comportamento seguro fora da distribuição e uma explicação simples para engenharia. Retirá-la elimina uma barreira útil antes de provar generalização e aceitação no ANAREDE.

# **8 Condições para uma eventual substituição**

6. Aprovar o contrato do alvo: potencial bruto, potência disponível ou geração verificada; unidade MW, uma hora, conjunto ONS e política de disponibilidade.  
7. Construir snapshot reproduzível com vários meses, ciclo anual completo e, se possível, anos adicionais, mantendo a origem por CEG, vigência de capacidade/composição e UTC.  
8. Comparar curva física, híbrido residual e alternativas diretas com splits temporais bloqueados, um período final intocado e avaliação por conjunto e regime.  
9. Demonstrar ganho estável em MAE/RMSE e erro relativo, mas também cobertura de intervalos, limites físicos, out-of-domain e impacto no PWF.  
10. Validar um conjunto de cenários no ANAREDE. O critério não é afirmar que o ML converge; é confirmar que o PWF preserva a estrutura e que a análise elétrica continua válida.  
11. Operar primeiro em shadow mode, registrando saída da curva e do ML sem alterar a decisão do usuário. Só depois de monitoramento e aprovação de domínio promover o artefato.

# **9 Perguntas para o mentor técnico**

## **Alvo e domínio**

* Qual é o estimando de negócio: potencial bruto, potência disponível ou geração verificada? O valor esperado deve ser limitado por capacidade ou por capacidade x disponibilidade?  
* A coluna geracao\_referencia\_mw pode ser tratada como proxy de produção sem limitação? O que explica linhas acima da capacidade instalada e acima da capacidade disponível?  
* Existe uma versão oficial, regra de cálculo ou campo de qualidade para a referência ONS? Quais registros devem ser excluídos, auditados ou mantidos com flag?  
* A disponibilidade significa capacidade eletromecânica disponível, disponibilidade declarada no ONS ou outra medida? Ela é conhecida no momento de uso do cenário?

## **Dados e generalização**

* Qual composição de conjuntos ONS e quais CEGs devem ser aceitos quando há mudança de composição ao longo do tempo? Um CEG raiz é uma chave operacional válida?  
* Qual é a vigência correta de capacidade, localização e associação espacial para cada hora histórica?  
* Quantos meses e anos são o mínimo para representar o ciclo anual e os regimes relevantes? Há períodos oficiais para reservar como teste final?  
* O modelo deve generalizar para conjuntos não vistos, ou somente para conjuntos com histórico e cadastro aprovados?

## **Operação e engenharia elétrica**

* Quais métricas e erros por conjunto seriam aceitáveis para um estudo de fluxo de potência? Um ganho estatístico pequeno muda alguma decisão no ANAREDE?  
* Como o especialista prefere receber incerteza: intervalo por conjunto, faixa de MW, aviso fora do domínio ou cenários baixo/base/alto?  
* Quais campos do PWF podem mudar no estudo? O contrato atual preserva tamanho, codificação, DGER e DGEI e altera somente Pg; isso atende ao procedimento do mentor?  
* Qual caso ANAREDE não sigiloso pode ser usado para o aceite e quais condições de convergência devem ser verificadas fora do ClimaGrid?

## **Decisão de adoção**

* É preferível um modelo híbrido residual global, modelos por cluster ou modelos por conjunto? Como equilibrar desempenho e manutenção?  
* Qual é o gatilho para sair de shadow mode e qual é o gatilho de rollback para a curva física?  
* Que mudança mínima na estimativa justifica trocar a curva no processo do analista: redução de erro, melhor explicação de gargalos, menor retrabalho ou outro benefício?

# **10 Roteiro de fala para abrir a mentoria**

“O ClimaGrid já consegue pegar uma hora de cenário climático, estimar potência por conjunto e gerar um PWF que altera somente Pg. O replay histórico é observado e não usa ML. No cenário climático, o caminho servido ainda é uma curva física com clipping por capacidade e disponibilidade. Em paralelo, testamos um LightGBM residual: ele corrige a curva e volta a respeitar os limites físicos. Os testes de agosto de 2024 mostram melhora no recorte experimental, mas o alvo, a disponibilidade e a cobertura histórica ainda não foram aprovados para produção. Quero validar primeiro qual grandeza devemos estimar e qual evidência faria o modelo ser aplicável no ANAREDE. Minha hipótese é manter a curva como guardrail e fallback, e promover o ML apenas se ele demonstrar ganho estável e impacto operacional.”

# **11 Fonte e classificação das evidências**

Contexto canônico e estado atual: Docs/CONTEXTO\_PROJETO\_IA.md, AGENTS.md, README.md, backend/README.md e backend/ai-service/README.md. Esses documentos prevalecem sobre a visão antiga quando há conflito.

Implementação do cenário e do estimador: backend/ai-service/app/climate\_file.py, backend/ai-service/app/predictor.py, backend/ai-service/training/physical\_curve.py, backend/ai-service/training/train.py e backend/ai-service/training/build\_dataset.py.

Experimentos: Docs/ML/EXPERIMENTO\_02\_USINA\_01.md, Docs/ML/EXPERIMENTOS\_03\_A\_06\_MULTIUSINA.md, Docs/ML/AUDITORIA\_FASE\_2.md e Docs/ML/PLANO\_PRATICO\_DADOS\_E\_TREINO\_FASE\_2.md, além dos artefatos locais em backend/ai-service/artifacts/experiments. Os artefatos são evidência de experimento, não aprovação de produção.

Visão original do Ideathon: Docs/ClimaGrid\_Documento\_Tecnico.pdf e Docs/Equipe 16 \- Entrega Final Ideathon ClimaGrid.pdf. Esses PDFs foram conferidos como material de proposta; a leitura do estado atual segue o contexto canônico.
