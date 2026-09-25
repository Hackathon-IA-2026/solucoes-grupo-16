# Guia da Interface Web (Frontend)

Se você está um pouco confuso sobre os botões e campos do painel principal da aplicação, não se preocupe! A interface foi desenhada como um **"Assistente de 4 Etapas"** (um passo a passo) para guiar você desde a escolha do clima até a geração do arquivo elétrico para o ANAREDE.

Abaixo, explicamos o que significa cada tela e cada campo.

---

## Etapa 1: Entrada climática
**Objetivo da tela:** Dizer para a plataforma *de onde* ela deve puxar as informações de vento para calcular a geração de energia.

* **Aba "Histórico" ou "Cenário próprio":** 
  * Se você escolher **Histórico**, o sistema vai usar os dados reais do passado que a nossa equipe baixou do Copernicus (ERA5) e conectou com a ONS. 
  * Se escolher **Cenário próprio**, você poderá fazer upload de uma planilha do Excel ou CSV com seus próprios dados inventados de vento, caso queira simular uma situação extrema (ex: "E se ventar muito forte na semana que vem?").
* **Subsistema:** Fixo em Nordeste (NE) para este MVP.
* **Início e Fim do período:** Você escolhe as datas que deseja avaliar. O modelo calculará a energia para essas datas.
* **Resolução temporal:** É de quanto em quanto tempo o modelo faz a conta. O padrão do modelo meteorológico (ERA5) é a cada **1 hora**.

---

## Etapa 2: Geração estimada
**Objetivo da tela:** Ver o que a Inteligência Artificial respondeu e **selecionar quais usinas** você quer mandar para o seu estudo elétrico.

* **Filtros (Busca, Estado, Risco):** Servem para você encontrar usinas específicas se a lista for gigante.
* **Tabela Principal:**
  * **Checkbox (A caixinha de marcar):** Essa é a parte mais importante. Só as usinas que você marcar com o "V" nessa caixa irão avançar para a próxima etapa.
  * **Estimativa (MW):** É a quantidade de Megawatts que o nosso modelo previu que a usina vai gerar naquele período.
  * **Faixa de Incerteza:** É a margem de erro do modelo.
  * **Sinal de Risco:** Mostra se o modelo identificou alguma chance de ter "corte de energia" (curtailment) baseado no comportamento histórico dessa usina.

---

## Etapa 3: Mapeamento usina → barra (O "De-Para")
**Objetivo da tela:** Aqui é onde o mundo do Machine Learning se conecta com a Engenharia Elétrica. O programa ANAREDE não sabe o que é uma "Usina", ele só entende "Barras" (nós da rede elétrica). Aqui você ensina o sistema qual Usina fica conectada em qual Barra.

* **Nome do cenário de estudo:** Apenas um nome de batismo para você lembrar depois do que se trata (ex: "Estudo de Ventos Fortes - Agt 2026").
* **Caso base ANAREDE (.pwf):** Aqui você faz o **Upload do arquivo .pwf original**. O nosso sistema vai abrir esse arquivo, ler todas as barras (nós) que existem nele e prepará-las para você.
* **Tabela de De-para elétrico (Nº da barra):** Na coluna "Nº da barra", você deve selecionar (no menu que vai abrir) a barra que corresponde a cada usina. O nome e a tensão (kV) da barra serão preenchidos sozinhos assim que você escolher o número.

*Atenção:* O sistema tem uma trava para não deixar você colocar duas usinas na mesma barra (regra do projeto).

---

## Etapa 4: Exportação e risco
**Objetivo da tela:** Fazer a revisão final e baixar o arquivo PWF modificado, pronto para rodar no ANAREDE.

* **Painel de Resumo:** Mostra quantas usinas você selecionou, a soma de toda a energia que elas vão gerar, e um indicativo se o cenário está pronto.
* **Tabela Final:** Um resumo claro de cada usina, a barra onde ela foi conectada, a geração (em MW) que a nossa IA calculou e a **Razão Provável** de risco (por exemplo, "ENE" que significa Restrição Energética ou "CNF" de Confiabilidade). 
* **Botão "Gerar e baixar PWF":** Ao clicar aqui, o nosso sistema pega o `.pwf` original que você subiu na etapa 3, **atualiza a energia ativa** das barras que você mapeou com a quantidade prevista pela Inteligência Artificial e faz o download de um **novo arquivo `.pwf`**. 

Esse arquivo final pode ser aberto no ANAREDE e ele já estará com as configurações corretas baseadas no clima previsto!
