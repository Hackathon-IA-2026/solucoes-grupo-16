# Plano prático: dados e treino para o cenário climático do usuário

Este plano prepara a **fase 2** do ClimaGrid: o usuário envia dados climáticos,
escolhe uma hora do arquivo, recebe estimativas de geração e exporta um PWF
daquela hora. A [fase 1](../CONTEXTO_PROJETO_IA.md) já usa geração ONS observada.
A fase 3, com hora futura escolhida sem arquivo climático, fica para depois e
precisará de uma fonte ou hipótese explícita para o vento futuro.

**Regra de partida:** uma base útil para treino contém muitas horas de muitas
usinas. Muitas usinas em um único dia não mostram ao modelo a variação de vento,
geração e estações do ano. Os experimentos 1 e 2 testaram o funcionamento do
pipeline com uma usina e 15 dias; seus resultados não escolhem os parâmetros de
um futuro modelo para o Nordeste.

## 1. Fechar o significado da geração a estimar

Antes de baixar um ano inteiro, registrar com o especialista:

- Se o resultado da fase 2 pretende representar **geração verificada esperada**
  ou **potencial de geração pelo vento**. São alvos diferentes.
- Qual coluna ONS representa o alvo escolhido e quais horas podem entrar no
  treino. A série completa `GERACAO_USINA-2_HO` fornece geração verificada; a
  base `RESTRICAO_COFF_EOLICA` não substitui a série completa.
- De onde virá a **disponibilidade**, exigida pelo treino e pela API atuais.
  A ingestão da série completa de geração não produz essa coluna. Obter uma
  fonte válida ou alterar explicitamente o contrato do modelo; não preencher
  disponibilidade histórica ou futura com um número inventado.
- Como tratar mudanças de capacidade, cadastro CEG, localização e composição
  dos conjuntos ao longo do tempo.

**Concluído quando:** alvo, unidades, filtros e disponibilidade estão
documentados, e uma linha real do snapshot pode ser explicada do início ao fim.
Sem essa decisão, o snapshot da série completa serve para análise, mas ainda
não está pronto para o `training.train` atual.

## 2. Fazer uma prova de um mês completo

Usar janeiro de 2024 como piloto e executar os comandos dentro de
`backend/ai-service`. A [ONS publica a geração horária por mês](https://dados.ons.org.br/dataset/geracao-usina-2);
o [ERA5 fornece clima horário histórico](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels?tab=overview).

```powershell
.\.venv\Scripts\python.exe -m ingestion.era5.cli download-ons-generation --year 2024 --month 1
```

Conferir se os snapshots SIGA e de composição ONS existem; se faltarem,
executar `download-siga` e `download-ons-membership`. Construir o catálogo
para o mês, filtrando eólicas do Nordeste:

```powershell
.\.venv\Scripts\python.exe -m ingestion.era5.cli build-catalog `
  --ons data/raw/ons/year=2024/month=01/GERACAO_USINA-2_2024_01.parquet `
  --plant-type EOL `
  --siga data/raw/siga/siga.csv `
  --ons-membership data/raw/ons/relacionamento_usina_conjunto.parquet `
  --output data/processed/training/pilot_2024_01_catalog.parquet `
  --report data/processed/training/pilot_2024_01_catalog_report.json
```

Ler `data/processed/training/pilot_2024_01_catalog_report.json`. Resolver ou
documentar CEGs e localizações sem cobertura antes de seguir. O catálogo do
piloto fica separado do catálogo usado pelo replay. A prova anterior de janeiro
de 2024 encontrou cobertura de 93,75% por conjunto; portanto, o limite padrão
de 95% pode encerrar `build-catalog` após gravar o relatório. Revisar os casos
pendentes e só usar outro limite se a exclusão estiver documentada e aceita,
como explica o [guia mensal](../OPERACAO_HISTORICO_MENSAL.md). O comando
`plan` apenas mostra os pedidos ERA5; `backfill` faz o download e a extração:

```powershell
.\.venv\Scripts\python.exe -m ingestion.era5.cli plan `
  --catalog data/processed/training/pilot_2024_01_catalog.parquet `
  --start 2024-01-01 --end 2024-01-31

.\.venv\Scripts\python.exe -m ingestion.era5.cli backfill `
  --catalog data/processed/training/pilot_2024_01_catalog.parquet `
  --start 2024-01-01 --end 2024-01-31
```

`backfill` requer credencial CDS e termos do dataset aceitos. Unir as duas
fontes em um **arquivo de treino separado** do snapshot operacional do replay:

```powershell
.\.venv\Scripts\python.exe -m ingestion.era5.cli join-ons `
  --ons data/raw/ons/year=2024/month=01/GERACAO_USINA-2_2024_01.parquet `
  --weather data/processed/era5/year=2024/month=01/weather_hourly.parquet `
  --catalog data/processed/training/pilot_2024_01_catalog.parquet `
  --ons-format generation `
  --output data/processed/training/pilot_2024_01.parquet `
  --report data/processed/training/pilot_2024_01_report.json
```

**Concluído quando:** o relatório mostra horas ONS e ERA5 coincidentes,
cobertura de junção revisada, chaves `usina_id + timestamp_utc` únicas,
capacidades válidas e exclusões explicadas. Não baixar os outros meses antes
de entender as perdas desta prova.

## 3. Ampliar para um ano e preservar a origem dos dados

Depois do piloto, baixar os 12 arquivos mensais ONS de 2024. Reconstruir o
catálogo com **todos** os meses, planejar e executar os 12 pedidos ERA5, e unir
todos os meses em um snapshot de treino versionado. O guia
[Operação do histórico mensal](../OPERACAO_HISTORICO_MENSAL.md) detalha o
procedimento e os limites de cobertura. Não baixar apenas vento, nem juntar
somente o mês novo ao publicar um snapshot anual.

Guardar manifests, hashes, período, versão do catálogo e relatórios. Medir
cobertura por mês **e por usina**; excluir ou sinalizar conjuntos sem CEG ou
localização confiável. Depois de validar um ano, considerar 24–36 meses para
capturar mais variação sazonal, mantendo a consistência cadastral.

**Concluído quando:** cada linha do snapshot anual tem uma usina, uma hora UTC,
clima e geração do mesmo instante, com a origem verificável.

## 4. Adaptar o treino para várias usinas

Hoje `training/build_dataset.py` rejeita mais de uma usina e o artefato
experimental só atende a usina treinada. Implementar:

1. Dataset com chave única `usina_id + timestamp_utc`, cobertura e exclusões
   por usina e por mês.
2. Features disponíveis também quando o usuário enviar o clima. Evitar campos
   conhecidos somente depois da hora estimada.
3. Split temporal comum: dados mais antigos para treino, período seguinte
   para validação e período final **intocado** para teste. Criar também uma
   avaliação com usinas não vistas se o modelo precisar generalizar para elas.
4. Métricas da curva física e do híbrido por usina, mês e faixa de vento, além
   da média geral. A aprovação não deve esconder usinas com erros altos.
5. Artefato versionado e carregamento explícito pela API. Registrar o snapshot,
   o alvo, os parâmetros, as métricas e as usinas cobertas.

**Concluído quando:** o mesmo código treina e avalia várias usinas sem vazamento
temporal, e a API identifica claramente quando usa o modelo ou a curva física.

## 5. Comparar hiperparâmetros sem usar o teste para escolhê-los

Depois de validar os dados e o treino multiusina:

1. Treinar um **baseline** com os valores padrão da seção `lightgbm`.
2. Definir uma pequena lista de candidatos antes de rodar. Por exemplo, variar
   `min_child_samples` entre 50, 100 e 200, mantendo os demais valores iguais.
3. Usar os **mesmos dados e splits** para todos. Salvar um JSON e uma pasta de
   artefatos por candidato; não editar os parâmetros padrão em `config.py` a
   cada tentativa.
4. Escolher candidatos pelas métricas de **validação**, inclusive por usina e
   mês. O *early stopping* escolhe o número de árvores; não procura sozinho
   valores para os outros hiperparâmetros.
5. Avaliar o candidato escolhido **uma vez** no teste final reservado.
   Comparar com a curva física e verificar os grupos de usinas, não apenas o
   MAE geral. Se falhar, manter fallback e revisar dados/abordagem antes de
   iniciar outra rodada com um teste ainda intocado.

O pipeline atual registra sobretudo métricas de **teste** no metadata e usa o
teste para `approved`. Para fazer a seleção acima corretamente, primeiro
registrar métricas de validação dos candidatos e reservar o teste final para
aceite. Os experimentos 1 e 2 já consultaram o mesmo teste; eles permanecem
como provas do pipeline, não como seleção definitiva de hiperparâmetros.

**Não é preciso mudar parâmetros fixos no código após escolher um candidato.**
`TrainingConfig` já aceita a seção `lightgbm` no JSON. Preserve os padrões como
referência, versionando o JSON e o artefato aprovado. A aplicação deve apontar
explicitamente para esse artefato e registrar sua versão.

## 6. Entregar o fluxo da fase 2

Definir e implementar o contrato do arquivo climático do usuário: identificação
por CEG/usina, hora com timezone, `u100` e `v100` em m/s, temperatura e pressão
nas unidades esperadas, além da disponibilidade ou hipótese escolhida na etapa
1. Validar cobertura, duplicatas e correspondência com o cadastro. Para a hora
selecionada, estimar cada conjunto, mostrar proveniência e avisos, distribuir a
geração pelas barras e exportar **um PWF para essa hora**. Testar a interface de
ponta a ponta com um arquivo e um PWF reais.

**Concluído quando:** upload, escolha da hora, estimativas, revisão das barras e
exportação funcionam sem mocks e preservam os campos não editados do PWF.

## Depois: fase 3

Reutilizar o modelo de geração somente após a fase 2 estar operacional e
validada. Uma data futura, sozinha, não fornece o vento daquela hora. A fase 3
precisará declarar se usa previsão meteorológica, climatologia ou cenário
probabilístico; ERA5 é histórico e não fornece previsão futura. O resultado
continua sendo um PWF por instante, sujeito à revisão no ANAREDE.
