# Fase 2: cenário climático enviado pelo usuário

O usuário envia vento horário de conjuntos eólicos do Nordeste, escolhe **uma hora** do arquivo e recebe uma estimativa de **potencial pelo vento** para preparar um PWF. Este fluxo usa uma curva física genérica. Ele não usa o modelo LightGBM dos experimentos 1 e 2, não reproduz a geração observada da ONS e não prevê o vento futuro.

## Arquivo aceito

CSV em UTF-8, com até 5 MB e 50 mil linhas. Aceita vírgula ou ponto e vírgula como separador. O cabeçalho obrigatório é:

```csv
timestamp_utc,usina_id,u100,v100,disponibilidade
2026-09-15T12:00:00Z,CEECVA,7.2,-3.1,0.95
```

- `timestamp_utc`: hora cheia em ISO 8601, com `Z` ou deslocamento de fuso. O serviço converte para UTC.
- `usina_id`: identificador do **conjunto ONS** presente no catálogo local, como `CEECVA`. O serviço exige que todos os membros desse conjunto estejam conciliados no catálogo.
- `u100` e `v100`: componentes do vento a 100 m em m/s. A velocidade calculada deve ser no máximo 50 m/s.
- `disponibilidade`: fração disponível da capacidade instalada naquela hora, entre 0 e 1. O usuário informa esse valor por conjunto no arquivo; o sistema não o inventa.
- `temperature_2m` em K e `surface_pressure` em Pa são opcionais. São validados, mas a curva física atual não os usa no cálculo.

Uma linha representa um conjunto em uma hora. O mesmo conjunto e hora não pode aparecer duas vezes. Para gerar outro instante, escolha outra hora do mesmo CSV e exporte outro PWF.

## Uso

1. Inicie os três serviços conforme o README principal e acesse **Cenário climático** na página inicial.
2. Envie o CSV. O serviço lista as horas validadas e mostra quantos conjuntos encontrou.
3. Escolha a hora e clique em **Estimar e revisar usinas**.
4. Revise capacidades, estimativas e avisos. Selecione os conjuntos que entram no estudo.
5. Envie um caso base `.pwf` e confira as barras propostas. Se não houver mapeamento cadastral, indique a barra no caso base e confirme a escolha com um especialista.
6. Exporte o PWF. O writer altera apenas `Pg` das barras escolhidas. Abra e valide o resultado no ANAREDE; o ClimaGrid não executa o fluxo de potência.

O serviço registra o hash SHA-256 do CSV em `dataVersion`, a hora escolhida e as fontes `PHYSICAL_CURVE` e `USER`. A interface indica que se trata de estimativa física ainda sem validação como modelo de potencial. Avisos de mapeamento ausente ou parcial permanecem visíveis.

## Próximo passo para um modelo treinado de potencial

A série completa `GERACAO_USINA-2_HO` da ONS mede **geração verificada**, que pode refletir operação e restrições. Ela não é, por si, um alvo validado de potencial pelo vento. Antes de treinar e aprovar um modelo multiusina para esta fase, é preciso obter uma série horária de **potencial** com significado e origem confirmados, conciliá-la por conjunto e hora com vento e disponibilidade histórica, resolver as pendências do catálogo e comparar os candidatos em validação temporal. Os experimentos 1 e 2 continuam sendo testes do pipeline, sem aprovação para este fluxo.

O piloto de janeiro de 2024 já possui a geração ONS baixada, mas o relatório de catálogo mostrou cobertura de 93,75%, abaixo do limite padrão de 95%. As pendências devem ser revistas antes do backfill ERA5 daquele piloto. Consulte [Plano prático de dados e treino](PLANO_PRATICO_DADOS_E_TREINO_FASE_2.md).

### Quais arquivos ONS baixar para investigar o alvo

O downloader do projeto já obtém, mês a mês, o Parquet de [Geração por Usina em Base Horária](https://dados.ons.org.br/dataset/geracao-usina-2). Esse dataset informa **geração verificada**. O dataset de [Fator de Capacidade](https://dados.ons.org.br/dataset/fator-capacidade-2) informa a razão entre geração e capacidade instalada; não fornece uma medição independente de potencial nem disponibilidade eletromecânica.

O [dicionário ONS de constrained-off eólico](https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/restricao_coff_eolica_tm/DicionarioDados_RestricaoContrainedoff_UsiEolicas.pdf) define `val_geracaoreferencia` como estimativa de quanto a usina ou conjunto poderia gerar sem a limitação, e `val_disponibilidade` como disponibilidade eletromecânica verificada. Esses campos são **candidatos concretos ao alvo e à disponibilidade de treino**. O arquivo local de agosto de 2024, baixado do Parquet oficial, contém 218.496 linhas do NE: 147 IDs ONS e 1.488 instantes semi-horários no mês. Ambos os campos estão preenchidos em todas essas linhas; 104.059 linhas não possuem código de razão de restrição. A maioria dos IDs tem os 1.488 intervalos, mas o mínimo observado é 1.248. Em 35.871 linhas, a referência supera a disponibilidade: isso conflita com o limite aplicado pelo modelo atual e deve ser revisado antes do treino. A geração de referência continua sendo **estimativa produzida pelo método ONS**, não medição direta do potencial físico. O [detalhamento por usina](https://dados.ons.org.br/dataset/restricao_coff_eolica_detail) pode ajudar na conciliação por CEG, mas também exige auditoria de cobertura e significado.

Para a coleta, prefira os **Parquets oficiais mensais**, cada fonte em uma pasta própria, acompanhados de URL, data do download e hash. CSV é uma alternativa se o Parquet estiver indisponível; XLSX não é necessário para o pipeline. Não é preciso baixar as três representações do mesmo mês. Antes de ampliar a coleta, auditar um mês das fontes candidatas: chaves ONS/CEG, granularidade, timezone, nulos, restrições, disponibilidade, capacidade e junção com ERA5. Só então definir o alvo e a avaliação temporal dos hiperparâmetros.

O comando `download-ons-restriction --year 2024 --month 8` já baixa essa fonte. Para o piloto de agosto de 2024, `build-catalog` produziu 146 de 147 conjuntos totalmente localizados (99,32%); um tem coordenadas fora do limite geográfico configurado e permanece para revisão. O ERA5 de agosto e as três horas complementares de setembro em UTC foram baixados. O snapshot ONS–ERA5 tem 108.518 linhas para 147 conjuntos e as 744 horas de agosto no horário local, com cobertura de junção de 100% entre os registros ONS válidos. A auditoria ainda precisa resolver 17.709 linhas em que a referência supera a disponibilidade e 109 em que supera a capacidade instalada. Esse piloto mede qualidade de dados e execução do pipeline. Uma comparação de hiperparâmetros para uso geral ainda precisa de vários meses, divisões temporais separadas e métrica de validação dos candidatos.
