Aqui está o relatório completo e estruturado sobre o conteúdo dos três dias de treinamento do hackathon e dos tutoriais técnicos de apoio, baseado nos vídeos fornecidos:

  

### Visão Geral do Hackathon

- O evento é focado na temática de transição energética e inteligência artificial.
    
      
    
- A organização conta com a COPPE/UFRJ em parceria com a comunidade Made in Rio.
    
      
    
- A jornada inclui uma fase inicial online chamada Ideathon e uma etapa presencial (Hackathon), que contará com a infraestrutura da AWS para o amadurecimento das soluções.
    
      
    
- Os participantes devem atuar em grupos de cinco pessoas, compostos idealmente por desenvolvedores, um scrum master/gerente de projeto e um especialista.
    
      
    
- As bases de dados principais do evento incluem informações do ONS (Operador Nacional do Sistema Elétrico) e dados climáticos do ERA5.
    
      
    

### Dia 1: Infraestrutura e Inteligência Artificial (Nvidia e AWS)

**Treinamento da Nvidia:**

  

- Jomar Silva apresentou a stack da Nvidia para desenvolvimento de agentes de IA baseados em Large Language Models (LLMs).
    
      
    
- Foi destacada a família de modelos Nemotron (em versões Ultra, Super e Nano), que é altamente otimizada para "reasoning" avançado e utilização de ferramentas externas.
    
      
    
- A plataforma inclui ferramentas como o NeMo Guardrails, que garante a segurança corporativa, mantendo o agente dentro do contexto estabelecido e filtrando conteúdos maliciosos.
    
      
    
- O uso de ferramentas de roteamento adaptável ajuda a escolher qual modelo usar dependendo da complexidade da tarefa, reduzindo de forma significativa o custo com tokens.
    
      
    
- Os modelos e contêineres otimizados podem ser testados e implementados a partir da plataforma `build.nvidia.com`.
    
      
    

**Treinamento da AWS:**

  

- Rodrigo e Wagner demonstraram a arquitetura de Inteligência Artificial da AWS, que pode ser dividida em três camadas principais.
    
      
    
- Na **camada de aplicações**, o Amazon Q atua como uma IDE agêntica focada em "spec-driven development", dividindo as tarefas em requisitos funcionais, requisitos técnicos e escrita do código.
    
      
    
- A **camada intermediária** é centralizada no Amazon Bedrock, que oferece acesso a diversos modelos fundacionais (como os da Meta e Anthropic). O Bedrock Agent Core facilita a orquestração do sistema fornecendo ambiente de runtime seguro, controle de memória, interpretador de código e acesso a APIs externas.
    
      
    
- A **camada de infraestrutura** utiliza ferramentas como o Amazon SageMaker para o treinamento e a customização profunda de modelos próprios (MLOps).
    
      
    

### Dia 2: Os Desafios do Sistema Elétrico Brasileiro (ONS)

**Visão Geral do Operador Nacional do Sistema:**

  

- O ONS é o responsável por orquestrar a geração e transmissão de energia do país inteiro.
    
      
    
- O objetivo central é manter o sistema interligado equilibrando a segurança do abastecimento energético com o menor custo global possível.
    
      
    

**Desafio da Previsão de Carga e "Curva do Pato":**

  

- A grande inserção de Micro e Minigeração Distribuída (MMGD), principalmente de painéis fotovoltaicos, alterou o comportamento da demanda de energia.
    
      
    
- Isso gera o efeito conhecido como "curva do pato", onde o ONS enfrenta enormes rampas de variação de consumo em questão de poucas horas no final da tarde, quando a geração solar cai e o consumo humano atinge o pico.
    
      
    

**Desafio de Curtailment (Restrição de Geração):**

  

- As restrições acontecem quando usinas (principalmente eólicas e solares) precisam ter sua geração cortada ou reduzida.
    
      
    
- Esses cortes ocorrem por razões elétricas (quando há gargalos limitando a transmissão, como a restrição de exportação do Nordeste para o resto do país) ou por ordem energética (quando a oferta de energia supera o consumo e usinas inflexíveis não podem ser desligadas).
    
      
    

**Desafio do Baixo Carbono (Despacho Térmico):**

  

- As emissões do sistema elétrico aumentam quando usinas térmicas fósseis precisam ser acionadas.
    
      
    
- O acionamento ocorre para suprir picos de carga ou por questões de segurança hídrica e elétrica.
    
      
    
- A redução no consumo durante os picos (resposta da demanda) ajuda a evitar o acionamento dessas usinas e, consequentemente, diminui o fator de emissão do sistema.
    
      
    

**Dados e Inteligência Artificial:**

  

- O ONS possui o portal de dados abertos para acesso irrestrito às informações.
    
      
    
- A instituição inova oferecendo interfaces conversacionais baseadas em IA para explorar seus dados.
    
      
    
- Foi disponibilizado um Model Context Protocol (MCP) que fornece aos agentes de Inteligência Artificial um contrato de dados para que consumam as informações do ONS de modo estruturado e confiável.
    
      
    

### Dia 3: Economia Azul e Transmissão de Energia (OceanPact e Taesa)

**Economia Azul com a OceanPact:**

  

- A OceanPact atua em logística marítima e engenharia no mar, e a sua representante, Luíza, discutiu as frentes da "Economia Azul", que visa a utilização sustentável e não-linear dos recursos oceânicos.
    
      
    
- Para enfrentar as mudanças climáticas e o alto nível de emissões na logística costeira, a empresa investe em descarbonização, digitalização e tecnologias de propulsão híbrida.
    
      
    
- Foram citados testes da empresa utilizando diesel verde e implantação de velas nas embarcações.
    
      
    
- Há um projeto focado na restauração e conservação de manguezais (Carbono Azul), porque esses ecossistemas possuem raízes profundas capazes de estocar até seis vezes mais carbono no solo em comparação às florestas tropicais.
    
      
    
- O Brasil possui alto potencial em energia eólica offshore, porém sua implementação esbarra nos altos custos e no excesso de oferta de energia interna, devendo ter seu foco futuro possivelmente voltado ao Hidrogênio Verde.
    
      
    

**O Setor de Transmissão com a Taesa:**

  

- Michel representou a Taesa (empresa de transmissão de energia) explicando que, na transmissão, a remuneração não é baseada no volume de energia transportada, mas sim na disponibilidade ininterrupta das linhas, gerando multas severas em casos de desligamentos intempestivos.
    
      
    
- A Taesa mapeou 20 desafios focados em IA e apresentou 3 para o Hackathon.
    
      
    
- **Desafio 1:** Desenvolver um copiloto para monitoramento de documentos não estruturados, capaz de entender normativas e regulações diárias publicadas pelo ONS, ANEEL, CCEE, entre outros.
    
      
    
- **Desafio 2:** Criar um agente de IA capaz de ler e padronizar relatórios voluntários de sustentabilidade/ESG de diversas empresas elétricas, criando um mapa comparativo.
    
      
    
- **Desafio 3:** Utilizar os relatórios de perturbação do sistema elétrico e os procedimentos de rede divulgados no portal "Sintegre" do ONS para gerar um agente de melhores práticas de manutenção e operação.
    
      
    

### Tutoriais Técnicos Adicionais (ERA5, QGIS e Python)

Para trabalhar com a base de dados ERA5 mencionada no início do evento, foram realizados três treinamentos práticos de análise de dados geoespaciais e climáticos:

  

- **Aquisição de Dados (ERA5):** Tutorial guiado por André Pimentel sobre como extrair variáveis climáticas e de geração (como energia eólica, precipitação, velocidade do vento e temperatura) diretamente da documentação do serviço Copernicus/ECMWF em formatos NetCDF ou CSV.
    
      
    
- **Visualização no QGIS:** Ensina a importar os arquivos raster no QGIS utilizando o complemento Quickmap Services para o mapa base georreferenciado. O treinamento abrange como mapear dados utilizando faixas de cor falsa em multibandas e como criar um _time-lapse_ animado sobre as chuvas do ano utilizando a ferramenta de Controle Temporal do software.
    
      
    
- **Processamento com Python:** Demonstra a importação dos dados do ERA5 em ambientes como o Google Colab utilizando as bibliotecas `Xarray`, `Pandas`, `Matplotlib` e `Rasterio`. O script explora como filtrar e recortar mapas em formato de array para extrair dados climáticos precisos de latitudes específicas (ex: calcular as chuvas totais ou os ventos de Brasília, Manaus e Porto Alegre).