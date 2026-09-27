# Transcrição: Mentoria de Projeto (Hackathon)

**Participante 1:** E quando tu fala contornar é... é a redistribuição?

**Participante 2:** Aqui não... você pode, não necessariamente você vai redistribuir, você pode... tem vários outros tipos de solução que você pode fazer. E aí, os nossos dados, no nosso sistema, ele vai criar o cenário para que o cara que tá estudando ali, o engenheiro, ele consiga tomar... fazer um checklist, digamos assim, de quais medidas ele pode tomar para contornar aquele cenário.
Então é só, tipo, contextualizar exatamente o que que a nossa ferramenta entrega hoje, aí eu acho que talvez isso não tenha ficado tão explícito. Mas o que a gente entrega exatamente como um produto no final, é um arquivo, que é um arquivo PWF, que é o arquivo usado hoje no mercado para os softwares de simulador... É um simulador que existe hoje que o ONS usa, as empresas de energia que mexem com sistemas elétricos hoje usam, chama Anarede. É um software que já existe no mercado, é o usado. 
E aí ele tem um arquivo, um tipo de arquivo específico que se chama PWF, e é isso que a gente gera. A gente gera esse arquivo PWF que tem os dados que ele consegue usar tanto de um replay histórico das usinas elétricas do que elas geraram, quanto também de uma previsão baseada nos dados climáticos.

**Mentor:** Certo. Então qual é... por que que isso ajuda? Qual dor isso soluciona?

**Participante 2:** O cara que tá lá trabalhando no ONS, ele precisa fazer uma análise ali do que tá acontecendo. Eles têm que fazer um planejamento de como que eles vão fazer, quais ações eles vão tomar para os próximos meses, próximos dias.

**Mentor:** Hum.

**Participante 2:** Então, esses dados, eles são fundamentais para eles conseguirem determinar o que eles vão fazer. Então assim, se eles pudessem ter uma forma de poder analisar dentro do simulador ali quais as condições de geração, como é que vai estar gerando, como essa usina vai estar funcionando daqui a 15 dias, como essa usina vai estar funcionando daqui a 30 dias... Se eles tivessem essas informações, eles poderiam ter um direcionamento melhor para tomar as decisões que eles vão ter que tomar, eventualmente sobre distribuição de carga, sobre a necessidade de às vezes ter que fazer um corte de geração. 
Então a nossa ideia no fim é essa: é gerar esse arquivo para que os operadores, o pessoal que trabalha e que toma as decisões de fato, consigam usar junto com o software que já existe, que eles já usam, mas mais focado em ter esse dado, em ter essa informação para melhorar a decisão dessas pessoas.

**Mentor:** Hum. Então é um sistema de recomendação no final do dia?

**Participante 2:** Sim. É que ele já gera o arquivo... A recomendação é mais de insumo, você não vai estar recomendando o que o cara vai fazer, você tá dando o insumo para que ele consiga a partir dali criar uma solução.

**Participante 1:** É, isso num MVP, tá? Tipo, o que seria um planejamento de roadmap é realmente ser de recomendação, mas no MVP a gente não tem como alcançar isso por enquanto. Por enquanto são os insumos.

**Mentor:** Como é que vocês ganham dinheiro com isso?

**Participante 2:** Então, a gente tem alguns clientes potenciais com isso, né? A gente tem, como eu comentei, o ONS, então tem as transmissoras de energia, tem a Eletrobras, tem a Taesa, tem a Alupar, enfim... Tem as distribuidoras de energia também, Enel, Light, os operadores de sistema como o ONS, e estudantes e acadêmicos. Então a gente tem um mercado muito amplo para isso. Muitas pessoas poderiam gostar de usar essa ferramenta para conseguir estudar fluxo de potência melhor. Então é daí que a gente poderia ganhar dinheiro com isso, a gente poderia vender a plataforma, talvez vender uma assinatura, e aí depende do uso.

**Mentor:** E esse problema... não tem solução hoje? Sabe dizer se a Eletrobras, o ONS... eles não têm nada interno que faça isso, não?

**Participante 2:** Ah, eles fazem, só que não é tão ágil assim. Então a gente busca contornar esse problema de disponibilidade, porque o que que o ONS faz, né? Eles esperam tanto a gerência interna do ONS quanto os agentes do sistema elétrico mandarem os insumos para eles. Então, se eles tiverem uma ferramenta que produz esses insumos, eles podem fazer estudos mais rápidos. Não necessariamente esse estudo vai ser o estudo final, porque poxa, você vai confiar mais no que o agente tá mandando do que necessariamente no que a IA tá fazendo, mas o estudo pode já te guiar para outras soluções que você tá pensando.
Então, tem outros tipos de análise que o ONS faz, que é, por exemplo: se perder um equipamento, se perder um transformador, como é que o sistema vai se comportar a partir daí? Aí você pode usar esses insumos, ao invés dos insumos dos agentes e da própria gerência interna. E a própria, por exemplo, as transmissoras de energia: se você quer fabricar uma linha de transmissão, você vai precisar saber quanta potência vai passar por ali. Com base nos nossos dados, você vai poder estimar na sua localidade quanto de potência vai passar ali na sua linha e você vai poder criar o equipamento com base nessas especificações.

**Mentor:** Qual é a formação de vocês?

**Participante 2:** Eu faço engenharia elétrica.

**Participante 3:** Eletrônica. Eletrônica também.

**Mentor:** Já ouviram falar em CFD?
**Participante 2:** CFD?
**Mentor:** Tu é da elétrica, pega alta tensão, né?
**Participante 2:** Alta tensão.
**Mentor:** CFD é *Computational Fluid Dynamics*. Ele faz um gêmeo digital para fazer a previsão de funcionamento da turbina eólica para que ele possa chegar e mostrar uma curva de geração estimada para que aquele motor, para que aquelas turbinas eólicas possam funcionar. Então CFD é rodado em computadores que tenham um alto nível de processamento gráfico para poder entregar o que chama de *predictive*... PPT que chama. Que, em resumo, é: eu não posso dizer pro cliente que ele vai consumir A nem B, porque tem que ser C. Se ele não consome como deveria, ele perde dinheiro. Se ele não gera, não produz energia como deveria, ele perde dinheiro. E se ele produz energia mais do que deveria, ele perde dinheiro também. Tem que ser uma certificação para isso acontecer.
Dito isso, quando vocês pegam uma situação dessas, eu fico me questionando aqui onde que vocês estão de fato gerando valor para o mercado. Eu tô vendo vocês bem Brasil, certo? Onde é que vocês geram valor do mercado aqui?

**Participante 2:** Então, é justamente isso. Quando... porque esse programa que você citou, ele analisa o cenário de geração de um equipamento. A gente tá analisando o sistema de potência do Brasil.

**Mentor:** Ah, então, o sistema de potência do Brasil e vocês têm dados para isso.
**Participante 2:** Isso.

**Mentor:** Tá, sistema de potência do Brasil, só para ver se eu entendi aqui, tá? Vocês pegam esse sistema de potência do Brasil e vocês fazem uma análise para identificar onde que a energia pode ser redistribuída ou cortada. É isso que vocês estão fazendo?

**Participante 2:** Não, a gente fornece o insumo de geração...
**Mentor:** O que é esse insumo?
**Participante 2:** É a geração de potência ativa das usinas principais.
**Mentor:** Não entendi. As usinas produzem...
**Participante 2:** Uma certa potência.
**Mentor:** Uma certa potência. Em megawatt?
**Participante 2:** É, megawatt.
**Mentor:** Beleza. Essa potência ela vai para algum lugar. Vocês pegam essa potência e entregam isso pra alguém?

**Participante 2:** Então, é, aí justamente. Essa potência ela vai ser colocada num arquivo que se chama PWF. E aí esse arquivo, quem for estudar uma determinada parte do sistema ou o sistema inteiro... você pode até conseguir um arquivo do sistema inteiro no ONS. Você carrega isso no modelo e aí o próprio Anarede vai executar o fluxo de potência, que basicamente é a solução de várias equações, para analisar: "Pô, com essas medidas de potência, tá tendo uma sobrecarga nesse equipamento aqui, nesse equipamento aqui tá tendo uma sobretensão nesse barramento aqui..."

**Mentor:** Modelagem e simulação, então. Eu pego o PWF, coloco num sistema de simulação e ele me diz quais máquinas têm a probabilidade de ter defeito.
**Participante 2:** Isso.

**Mentor:** Então vocês estão trabalhando em um cenário de manutenção preventiva.
**Participante 2:** Não sei se é manutenção, mas é algo preventivo de fato. 

**Mentor:** E esse PWF ele entra num sistema... tem um software, isso?
**Participante 2:** Isso, isso.

**Mentor:** Então vocês estão entregando a geração de energia, esse PWF, que ele já tá colocando a distribuição dessa potência no circuito, e quando o cara coloca esse PWF dentro do software, daquela subestação ou daquela região, esse circuito ele vai atuar em cima dessa distribuição e aí a partir daí ele vai dizer onde que pode dar sobrecarga ou não. É isso, então. E vocês estão ganhando dinheiro entregando o PWF pro cara.
**Participante 2:** Isso.

**Mentor:** Vocês estão entregando a inteligência de redistribuição dessa energia na simulação.
**Participante 2:** É... só não sei se redistribuição é o termo correto, mas a gente só tá indicando qual que vai ser a potência gerada por aquelas usinas. Mas a gente não tá redistribuindo de fato. Ele que vai, no estudo dele, redistribuir de acordo com o que ele quiser.

**Mentor:** Posso resumir?
**Participante 2:** Hum.
**Mentor:** Então tu tá me entregando uma base de dados.
**Participante 2:** Sim, mais ou menos.

**Mentor:** Esse PWF é uma base de dados. É uma base de dados mostrando onde cada ponto de consumo, ponto de acesso, vai receber em potencial de geração. Não é isso? Tu entrega a base de dados. E é por hora, por dia, minuto, segundo?
**Participante 2:** É instantâneo, né? Então... dia 1º de janeiro de 2025 às 6 horas. É nesse instante. E aí ele vai analisar nesse instante. Ele pode analisar vários instantes.

**Mentor:** Vocês vão entregar a projeção, a previsão disso, ou vocês vão entregar o que aconteceu antes?
**Participante 2:** A gente tem as duas funcionalidades. A gente tem a funcionalidade de dados anteriores, do passado, que aí ele pode criar documentos futuros com base no que aconteceu em cenários passados. Então, por exemplo, teve um *blackout* em 2023 na parte Nordeste. O cara pode pegar os dados que estavam acontecendo naquele horário e carregar no sistema dele para ele criar medidas operativas para mitigar aquilo num cenário futuro. 

**Mentor:** Aí entra o caso do cliente ser um acadêmico, por exemplo, tá. Só entendendo o que a visão de cliente de vocês deveria ser...

**Participante 2:** Mas também, aí que entra a parte da inteligência artificial, a gente tem de criar também o modelo de previsão. Então: "Pô, com base nesses ventos que a gente vai colocar, ou com base numa certa data, a gente quer que o sistema cuspa pra gente esses dados de geração de potência".

**Mentor:** Então vocês estão entregando série do passado pro cliente poder analisar... que aí na minha cabeça não seria uma base de dados, seria um relatório de inteligência. E vocês têm um modelo preditivo que tá mostrando o que que vai acontecer com a geração de qualquer nicho de geração de energia (eólica, solar, hidrelétrica).
**Participante 2:** No MVP a gente tá fazendo só eólica por conta do escopo do hackathon, né? Mas o nosso plano é fazer de todas as gerações do sistema.

**Mentor:** Tá, então, recapitulando. Vocês têm na startup dois tipos de serviços: vocês entregam inteligência pra ele entender (dado o que aconteceu no passado, com a análise que vocês estão fazendo) o que ele precisaria pensar para poder tomar decisões novas; e uma base de dados que contempla esses dados; e o modelo preditivo entregando o que aconteceria com esses dados daquela usina... Entendi. E onde vocês estão hoje?

**Participante 1:** Queria entender o que você acha que... tipo, entenda que é pro escopo do hackathon. O que a gente tava produzindo eram modelos de *machine learning* que já estão funcionando, mas até o que o Vitor sugeriu era a gente evoluir isso para uma rede neural nesses próximos dias agora, para ficar algo ainda mais preciso...

**Mentor:** O que vocês estão usando hoje?
**Participante 1:** Assim, só pra dar uma contextualizada melhor. A gente tem, vamos supor, uma fórmula física que leva em conta alguns parâmetros... supondo que gere uma capacidade de potência ativa que vai retornar. Só que ela não leva em consideração alguns parâmetros que a gente traz do ERA5, que são dados climáticos. Seja direção do vento, densidade atmosférica...
**Mentor:** Tem uma equação matemática aí.
**Participante 1:** É. Mas assim, essa equação matemática, imagino que não seja algo tipo tão unificado em relação a cada empresa, que elas devem utilizar parâmetros diferentes de acordo com o critério deles. Só que nós não temos acesso a isso, certo? Então, tipo, a gente tem uma curva física e o modelo preditivo ele justamente iria fazer esse ajuste, levando em consideração esses parâmetros trazidos pelo ERA5, os dados climáticos, e tentar fazer uma coisa mais otimizada... um retorno mais otimizado desses dados da potência ativa elétrica.

**Participante 2:** É porque também, assim, cada usina ela tem características físicas da própria usina. Então, não necessariamente se você jogar o mesmo vento numa usina X e numa usina Y, elas vão gerar a mesma potência. Então, como não tem uma fórmula que tem como descobrir isso, a gente tá usando a inteligência da IA pra resolver essa situação.

**Mentor:** Da situação de que o que se prevê pra uma usina não necessariamente é pra outra. Então vocês estão entregando a previsão da geração de potência eólica pra cada usina, estão entregando essa estimativa em série temporal. A base de dados ela entrega em que espaço de tempo?
**Participante 2:** De 1 em 1 hora.

**Mentor:** Eu sugeriria isso para o pessoal do outro grupo, mas... vocês vão pesquisar por LSTM (*Long Short-Term Memory*). *Multistep*. O que acontece: essa forma como vocês estão querendo fazer essa previsão, o negócio de vocês precisa olhar que vocês estão entregando dado como inteligência, então tem um custo associado ao dado e tem um custo associado ao relatório. E o cuidado que vocês têm que ter é a precisão desse dado. Porque quem tá fazendo certificação precisa de um intervalo de confiança bom. Dado ruim ou dado mentiroso pra uma galera dessa é uma perda milionária. Então vocês podem andar numa linha muito perigosa se vocês tiverem o treinamento errado. Então vocês têm que ter a autoridade de dizer assim: "O dado funciona. O dado tá aqui e essa previsão aqui ela tem tantos % do intervalo de confiança necessário". 
E aí vocês também têm que fazer uma análise dos dados de clima mesmo. Porque assim, como eu falei, vento é muito da região, tem a topografia, tem a aerodinâmica... são tantas variáveis que às vezes ter o dado só por ter o dado talvez não seja suficiente. 

**Participante 1:** Então, era por isso que eu tava pensando na questão da rede neural. Porque o modelo, ele basicamente usa árvore, né? Então ele não analisa a série histórica.
**Mentor:** Não, o XGBoost não usa... A LSTM ela é uma rede neural.
**Participante 1:** Ah, perfeito.

**Participante 2:** Uma outra coisa também que existe, e existe uma API... você consegue pegar dado climático de previsão meteorológica também. Tem da CPTEC. CPTEC tinha um FTP aberto que você podia acessar e pegar dado por lá. Que são olhando pro Brasil, tá? Vocês dão uma sacada lá que eu acho que vale a pena. É dado do governo, tá lá.
**Participante 2:** Mas aí os dados passados a gente já tá pegando do ERA5, que é gratuito e tem todos os dados passados. Mas a questão é a previsão meteorológica do vento que a gente ainda não implementou.
**Mentor:** Mas aí a rede neural que você recomendou... eu acho que é a questão da precisão mesmo. Porque eu acho que o modelo que só corrige uma fórmula física, que já não leva em consideração algumas coisas, ele teria uma precisão bem menor do que uma rede neural.

**Mentor:** Para você chegar nessa validação de tese, você vai ter que rodar as outras opções e comparar a precisão delas. Tanto pra F1 Score, F2 Score também... e você vai ter uma comparação. Porque é assim: se o custo de treinar uma rede LSTM vai te dar uma melhoria de 2% de uma fórmula matemática, a fórmula matemática já resolve. Então vocês têm que ter um *threshold* que vocês têm que ter de um pro outro, ele tem que ser suficientemente bom pra você ter isso como validação de tese. Se eu tenho um modelo que é apenas uma função matemática com uma base estatística que entrega 80% de precisão, e eu tenho uma LSTM que entrega 82%, eu não posso fazer ciência fraca. Eu vou ficar no que é barato. O barato é a equação, não é ter uma LSTM treinada.
Agora, se a minha LSTM entrega uma acurácia boa, 90%... eu tenho uma distribuição estatística relevante, os dados são independentes ali no processo e eu tive uma validação de fato do dado, aí sim já é outra coisa. Você já tem uma tese que diz: "Ó, eu tô trocando esse por esse por causa disso." É um processo científico no final do dia. 
Mas o produto em si, ele tem que ser atrativo pra quem tá investindo nesse consórcio de energia eólica, por exemplo. Por que eu vou contratar e vou comprar um PWF de vocês e não vou contratar uma empresa de energia renovável que vai trabalhar a simulação para mim? Qual é a diferença de vocês pra essa empresa? Porque tem empresa de energia renovável que trabalha com isso e eles entregam o CFD da parada, entendeu? E assim, é um contrato gigante... o que é que vai diferenciar? Qual o valor atrelado ao que vocês estão entregando?

**Participante 2:** Se você entrega um PWF com uma base de dados fazendo *forecast* de geração de energia, isso é uma coisa. Mas a empresa que tá dando viabilidade, se ela tá dizendo uma coisa diferente do dado de vocês, quem é que tá correto? Tudo isso pesa porque é dinheiro. Você tem que ter uma carga de precisão alta, porque se eu consumir mais que deveria eu perco dinheiro, se eu consumir menos do que eu deveria eu perco dinheiro.

**Mentor:** E aí é mostrar o ganho, por exemplo: é um relatório de inteligência, eu tenho uma zona não explorada no sertão de Pernambuco. E aí, por eu não ter isso explorado, eu quero pegar um relatório para entender se de fato a geração de energia esperada lá tá valendo. Ou então eu quero ir lá pro interior do Ceará. Dá pra fazer energia eólica lá? E aí, quando você entrega um relatório de inteligência com as variáveis, aí você pode ter um modelo híbrido também. Pode ter equação, pode ter modelo de LSTM, pode ter os dois juntos.

**Participante 1:** A gente tava tentando fazer um modelo híbrido do LightGBM junto com essa curva física, era o que a gente tem implementado agora. Só que a gente tava pensando em mudar isso...
**Mentor:** É, são teses a se validar. Olhando pro produto de vocês, vocês têm que saber vender o ganho de negócio pro cara. Se não, vai ficar só uma base de dados. Tamo junto? Se não, é só uma base de dados que vocês estão vendendo. Vocês vão vender dados. Tem que ver se a empresa quer comprar. Aí vocês entram numa área de *commodity* muito forte. A nível de negócio é isso que vocês têm que fazer. Olhar pro Brasil faz sentido. Agora... quem compra essa solução? Quem é o cliente final? Pô, Eletrobras. A Eletrobras compraria a solução de vocês? Como você vai mostrar pra um engenheiro da Eletrobras que a estatística dele vai perder pra uma rede neural? Porque existe uma trava grande na ciência dos estatísticos e do engenheiro de *machine learning*. Tem gente que consegue andar bem nos dois mundos, mas o engenheiro que tá na estatística, pra ele sair dali pra um modelo probabilístico estocástico, tem que ter um salto grande. Vocês têm que ter uma base pra entregar esse valor porque o cara vai dizer "isso aqui é mil vezes melhor". 
**Participante 1:** E aí mapear a dor.
**Mentor:** Qual é a dor do cara quando ele tá na estatística? "Ah, não tenho acesso ao dado, não tá claro pra mim novas regiões"... E aí cruzar onde é a dor de geração com o que vocês poderiam trazer. 

**Participante 1:** Faz sentido. Entendi. Então você acha que, se a gente trouxesse esses dados tanto de *machine learning*, tanto da rede neural, isso já é um ponto de compra assim também?
**Mentor:** Pode ser, a base de dados em si, sendo convertida em PWF, são formas de entrega. E aí vocês podem incrementar isso também para: "Vamos ter agora um sistema especialista que ele vai olhar pro maquinário, dado o que tá entregando de energia aqui, e ele vai fazer uma análise estimativa de manutenção preventiva". Onde que isso entra em ganho financeiro? A manutenção preventiva hoje gera quanto de custo para um cara que tá com problema na obra? Se eu tiver prevenção, eu consigo reduzir em quanto esse custo operacional? Aí vocês têm que ter o ROI atrelado à solução. Não é só sobre *machine learning* aqui, tá?
**Participante 1:** Sim, é sobre negócio.
**Mentor:** É negócio. Vocês não podem estar olhando só pra ciência. Se for pra olhar só pra ciência, vão fazer mestrado e doutorado. Ok? E AWS, como é que vocês estão?

**Participante 1:** Ah, no caso até a gente já conversou com o Lucas Passos. A gente já tinha falado lá, mas a AWS não era algo obrigatório, a gente tá usando o *deploy* lá mesmo, então... 
**Mentor:** É, o que eu acho, a AWS ela só entra aqui quando vocês estão em escala, assim. Se vocês quiserem apresentar um MVP, por exemplo... sobe um MVP lá. Um MVP e aí tem um relatório de explicabilidade fazendo análise, aí você pode até usar IA Generativa para isso. Mas, de novo, não é o centro do negócio de vocês.

**Aviso (Organização):** Gente, só avisando, 2:30 eu vou começar o workshop de pitch lá na frente. Não adianta ter a melhor solução do mundo se você não sabe comunicar ela. Tá certo? 2:30.

**Participantes:** Beleza, valeu! Ajudou muito, hein? Com certeza. Muito obrigado, prazer em conhecê-lo. Valeu gente, tamo junto!
