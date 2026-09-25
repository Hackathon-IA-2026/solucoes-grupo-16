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
