# Fase 2: cenário climático enviado pelo usuário

O usuário envia vento horário de conjuntos eólicos do Nordeste ou escolhe uma
hora histórica para busca no Copernicus ERA5. Em seguida recebe uma estimativa
de **potencial pelo vento** para preparar um PWF. Este fluxo usa uma curva física
genérica. Ele não usa o modelo LightGBM dos experimentos, não reproduz a geração
observada da ONS e não prevê o vento futuro.

O estado de implementação, as evidências executadas e as pendências bloqueantes
estão em [Auditoria da fase 2](AUDITORIA_FASE_2.md).

## Origens disponíveis

- **Copernicus ERA5 histórico:** o servidor reutiliza a partição mensal em cache
  ou baixa e extrai o mês sob demanda. O usuário informa e confirma uma
  disponibilidade aplicada a todos os conjuntos. O valor é registrado como
  hipótese, não como dado do ERA5.
- **CSV próprio:** o usuário envia diretamente o contrato descrito abaixo,
  podendo informar uma disponibilidade diferente por conjunto e hora.

Nos dois caminhos, o servidor persiste um CSV `normalized-ons-hourly-v1`. A
busca ERA5 não usa a geração observada da ONS no cálculo; ela fornece somente o
vento, enquanto a curva física produz a estimativa. Conjuntos sem cadastro
totalmente conciliado na hora são excluídos do CSV gerado, com IDs, percentual
de cobertura e aviso preservados na resposta e no manifesto.

## Arquivo aceito

CSV em UTF-8, com até 5 MB e 50 mil linhas. Aceita vírgula ou ponto e vírgula como separador. O cabeçalho obrigatório é:

```csv
timestamp_utc,usina_id,u100,v100,disponibilidade
2026-09-15T12:00:00Z,CEECVA,7.2,-3.1,0.95
```

Este é o contrato `normalized-ons-hourly-v1`, um **CSV normalizado pelo
ClimaGrid**, e não o NetCDF/GRIB nativo
baixado do ERA5. O ERA5 fornece clima em grade; ele não fornece o identificador
do conjunto ONS nem disponibilidade eletromecânica. Quem preparar o arquivo
precisa associar as coordenadas aos membros do catálogo, agregar o vento do
conjunto segundo a regra aprovada e obter a disponibilidade de uma fonte
separada. Upload direto de ERA5 nativo ainda não está implementado.

- `timestamp_utc`: hora cheia em ISO 8601, com `Z` ou deslocamento de fuso. O serviço converte para UTC.
- `usina_id`: identificador do **conjunto ONS** presente no catálogo local, como `CEECVA`. O serviço exige que todos os membros desse conjunto estejam conciliados no catálogo.
- `u100` e `v100`: componentes do vento a 100 m em m/s. A velocidade calculada deve ser no máximo 50 m/s.
- `disponibilidade`: fração disponível da capacidade instalada naquela hora, entre 0 e 1. O usuário informa esse valor por conjunto no arquivo; o sistema não o inventa.
- `temperature_2m` em K e `surface_pressure` em Pa são opcionais. São validados, mas a curva física atual não os usa no cálculo.

Uma linha representa um conjunto em uma hora. O mesmo conjunto e hora não pode aparecer duas vezes. Para gerar outro instante, escolha outra hora do mesmo CSV e exporte outro PWF.

## Uso

1. Inicie os três serviços conforme o README principal e acesse **Cenário climático** na página inicial.
2. Escolha **Buscar no Copernicus ERA5** ou **Enviar CSV próprio**.
3. No ERA5, escolha uma hora histórica, informe e confirme a disponibilidade; no CSV, envie o arquivo e escolha uma de suas horas.
4. Obtenha o vento e estime ou clique em **Estimar e revisar usinas**.
5. Revise capacidades, estimativas e avisos. Selecione os conjuntos que entram no estudo.
6. Envie um caso base `.pwf` e confira as barras propostas. Se não houver mapeamento cadastral, indique a barra no caso base e confirme a escolha com um especialista.
7. Exporte o PWF. O writer altera apenas `Pg` das barras escolhidas. A tela
   mostra os IDs e hashes do cenário e da exportação.
8. Abra e valide o resultado no ANAREDE; o ClimaGrid não executa o fluxo de
   potência.

No comportamento atual, conjuntos ausentes do CSV ou desmarcados pelo usuário
não são recalculados: suas barras mantêm o `Pg` do PWF base. Essa semântica
precisa ser aprovada antes de declarar que o arquivo representa um cenário
eólico completo.

O serviço persiste o CSV original e um manifesto imutável com UUID, schema,
hora, fontes `PHYSICAL_CURVE` e `USER`, observações, avisos, parâmetros do
estimador e hashes SHA-256 do CSV, catálogo e mapa PWF. A exportação recupera a
estimativa pelo `scenarioId`, recalcula as parcelas e rejeita divergências
enviadas pelo navegador.

O PWF final e seu manifesto também são persistidos. O manifesto contém o hash
do PWF base e do resultado, barras modificadas, seleção e alocações. A trilha é
consultável por `GET /climate-scenarios/:id`; a leitura confere os hashes dos
arquivos armazenados. Mapeamento cadastral parcial é bloqueado no frontend e no
backend. Conjuntos ausentes ou desmarcados preservam o `Pg` do caso base, e essa
semântica fica registrada como `preserve_reference_pwf_pg`.

No Compose, cenários e exportações ficam no volume `backend-data`, em
`/app/data/scenarios`. Fora do contêiner, o padrão é
`backend/data/scenarios`; `SCENARIO_STORAGE_ROOT` permite alterar o diretório.
Com `SUPABASE_URL`, `SUPABASE_KEY` e `SUPABASE_BUCKET`, o servidor também grava
e recupera CSVs, manifestos e PWFs exportados no prefixo
`climate-scenarios/` do Supabase Storage. Essa é a persistência compartilhada
usada no Render Free. Ainda é necessário definir retenção e expurgo.

## Próximo passo para um modelo treinado de potencial

A série completa `GERACAO_USINA-2_HO` da ONS mede **geração verificada**, que pode refletir operação e restrições. Ela não é, por si, um alvo validado de potencial pelo vento. Antes de treinar e aprovar um modelo multiusina para esta fase, é preciso obter uma série horária de **potencial** com significado e origem confirmados, conciliá-la por conjunto e hora com vento e disponibilidade histórica, resolver as pendências do catálogo e comparar os candidatos em validação temporal. Os experimentos atuais continuam sendo testes do pipeline, sem aprovação para este fluxo.

O replay local de janeiro de 2024 possui geração ONS, ERA5, catálogo e snapshot
unido. Os resultados multiusina de agosto de 2024 foram produzidos em outro
estado local e estão documentados, mas o snapshot e os artefatos não estão
presentes neste checkout. Consulte [Plano prático de dados e treino](PLANO_PRATICO_DADOS_E_TREINO_FASE_2.md).

### Quais arquivos ONS baixar para investigar o alvo

O downloader do projeto já obtém, mês a mês, o Parquet de [Geração por Usina em Base Horária](https://dados.ons.org.br/dataset/geracao-usina-2). Esse dataset informa **geração verificada**. O dataset de [Fator de Capacidade](https://dados.ons.org.br/dataset/fator-capacidade-2) informa a razão entre geração e capacidade instalada; não fornece uma medição independente de potencial nem disponibilidade eletromecânica.

O [dicionário ONS de constrained-off eólico](https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/restricao_coff_eolica_tm/DicionarioDados_RestricaoContrainedoff_UsiEolicas.pdf) define `val_geracaoreferencia` como estimativa de quanto a usina ou conjunto poderia gerar sem a limitação, e `val_disponibilidade` como disponibilidade eletromecânica verificada. Esses campos são **candidatos concretos ao alvo e à disponibilidade de treino**. O arquivo de agosto de 2024 usado pelo outro desenvolvimento continha 218.496 linhas do NE: 147 IDs ONS e 1.488 instantes semi-horários no mês. Ambos os campos estavam preenchidos em todas essas linhas; 104.059 linhas não possuíam código de razão de restrição. A maioria dos IDs tinha os 1.488 intervalos, mas o mínimo observado era 1.248. Em 35.871 linhas, a referência superava a disponibilidade: isso conflita com o limite aplicado pelo modelo atual e deve ser revisado antes do treino. Esses números são resultados documentados, não arquivos disponíveis no checkout atual. A geração de referência continua sendo **estimativa produzida pelo método ONS**, não medição direta do potencial físico. O [detalhamento por usina](https://dados.ons.org.br/dataset/restricao_coff_eolica_detail) pode ajudar na conciliação por CEG, mas também exige auditoria de cobertura e significado.

Para a coleta, prefira os **Parquets oficiais mensais**, cada fonte em uma pasta própria, acompanhados de URL, data do download e hash. CSV é uma alternativa se o Parquet estiver indisponível; XLSX não é necessário para o pipeline. Não é preciso baixar as três representações do mesmo mês. Antes de ampliar a coleta, auditar um mês das fontes candidatas: chaves ONS/CEG, granularidade, timezone, nulos, restrições, disponibilidade, capacidade e junção com ERA5. Só então definir o alvo e a avaliação temporal dos hiperparâmetros.

O comando `download-ons-restriction --year 2024 --month 8` baixa essa fonte. No ambiente usado para o piloto de agosto de 2024, `build-catalog` produziu 146 de 147 conjuntos totalmente localizados (99,32%); um tinha coordenadas fora do limite geográfico configurado e permaneceu para revisão. O ERA5 de agosto e as três horas complementares de setembro em UTC foram baixados naquele ambiente. O snapshot ONS–ERA5 documentado tinha 108.518 linhas para 147 conjuntos e as 744 horas de agosto no horário local, com cobertura de junção de 100% entre os registros ONS válidos. A auditoria ainda precisa resolver 17.709 linhas em que a referência supera a disponibilidade e 109 em que supera a capacidade instalada. Esse piloto mede qualidade de dados e execução do pipeline. Uma comparação de hiperparâmetros para uso geral ainda precisa de vários meses, divisões temporais separadas e métrica de validação dos candidatos.
