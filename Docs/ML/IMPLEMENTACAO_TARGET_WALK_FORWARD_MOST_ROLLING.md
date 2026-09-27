# Implementação do target, protocolo temporal, MOST e features causais

**Atualizado em:** 27 de setembro de 2026
**Estado:** infraestrutura implementada e coberta por testes; execução
científica e homologação operacional ainda não realizadas.

## 1. Escopo desta entrega

Esta entrega atualiza o estimador experimental vento → potência da fase 2 em
quatro pontos:

1. novos treinos usam exclusivamente `geracao_referencia_mw`;
2. o protocolo walk-forward existente passa a vincular target, suporte temporal
   das features e períodos já expostos;
3. o vento pode ser extrapolado de 100 m para a altura de cubo com MOST;
4. o modelo recebe estatísticas causais de vento de 3 e 6 horas.

Nada nesta implementação promove um modelo para produção, define um calendário
científico com dados reais ou afirma que a referência ONS é uma medição perfeita
do potencial eólico. A curva física continua sendo o estimador servido na fase 2
enquanto não existir artefato científica e operacionalmente homologado.

## 2. Target de treinamento

`training/config.py` aceita somente `geracao_referencia_mw` em novos treinos.
`geracao_verificada_mw` continua válida para:

- replay histórico observado;
- auditoria e comparação de dados;
- leitura controlada de artefatos legados.

Ela é recusada por `training.train`, `training.tune` e pelo protocolo novo. O
manifesto também grava `target_name=geracao_referencia_mw`.

A referência ONS é tratada como **proxy escolhida para geração sem limitação**,
não como verdade física já homologada. A preparação do snapshot:

- não faz clipping do target;
- conta valores acima da capacidade disponível;
- exclui e reporta valores negativos ou acima da capacidade instalada;
- mantém `target_clipped=false` no relatório;
- exige que a política de elegibilidade tenha hash no protocolo científico.

O piloto de agosto de 2024 registrou 17.709 referências acima da capacidade
disponível e 109 acima da capacidade instalada. A causa e a política definitiva
continuam dependendo de validação com o especialista ONS.

## 3. Walk-forward e isolamento das reservas

A implementação não usa mais `temporal_split` como caminho científico. Essa
função permanece apenas para reprodutibilidade do pipeline legado 70/15/15.

O caminho versionado usa:

- `training/protocol.py`: contrato, estados, hashes e gates;
- `training/splits.py`: atribuição por intervalos UTC `[start,end)`;
- `training/tune.py`: treino, early stopping e avaliação dos folds;
- `training/protocol_jobs.py`: treino final, calibração, teste final e
  homologação explícita.

Cada fold possui treino expansivo, bloco exclusivo de early stopping e bloco
posterior de avaliação. Calibração e teste final são reservas separadas. O
tuning recebe somente a partição de desenvolvimento.

O protocolo agora também:

- exige `geracao_referencia_mw` como target;
- valida que o lookback requerido pelo runtime aparece em `feature_support`;
- deriva a purga mínima do suporte declarado;
- rejeita teste final que intersecte um período listado em `exposed_periods`;
- marca agosto de 2024 como exposto no manifesto de infraestrutura.

`training/protocol.example.json` continua sendo apenas uma fixture. Seus hashes
zero e suas datas não autorizam execução científica. Um calendário mensal real
só pode ser congelado depois do inventário de meses, cobertura, vigências e
períodos já consultados.

## 4. Features temporais causais

As features são calculadas por `usina_id`, usando timestamps em UTC e buscas por
horas exatas. A ordem das linhas de entrada não altera o resultado.

| Feature | Suporte temporal |
| --- | --- |
| média e desvio de vento de 3 h | `[t-2,t]` |
| médias de `u100` e `v100` de 3 h | `[t-2,t]` |
| média e desvio de vento de 6 h | `[t-5,t]` |
| médias de `u100` e `v100` de 6 h | `[t-5,t]` |
| gradientes de 1, 3 e 6 h | `U(t)-U(t-h)`, dividido por `h` |
| indicador de contexto completo | exige dados de `t-6` até `t` |

Uma janela não é formada pelas últimas N linhas: todos os timestamps esperados
precisam existir. Assim, ela não atravessa lacunas nem mistura conjuntos. As
primeiras horas ou horas posteriores a uma lacuna recebem `NaN` nas estatísticas
incompletas e flags explícitas.

Artefatos novos gravam `required_history_hours=6`. Na API:

- registros sem seis horas anteriores usam a curva física;
- registros completos do mesmo lote podem usar o modelo;
- um lote parcialmente elegível retorna `model_scope=mixed`;
- intervalos de incerteza só são retornados para registros que usaram ML.

Nenhuma feature usa geração de referência, geração verificada ou clima futuro.

## 5. Extrapolação MOST

MOST é opcional e fica desligado por padrão até haver cadastro e cobertura
adequados. A implementação usa a correção de estabilidade de Businger-Dyer para
o perfil de momento:

```text
U(z_h) = U(100) ×
  [ln(z_h/z0) - ψm(z_h/L) + ψm(z0/L)] /
  [ln(100/z0) - ψm(100/L) + ψm(z0/L)]
```

Entradas necessárias na mesma linha:

- `hub_height_m`, entre 10 e 300 m;
- `surface_roughness_m`, maior que 0 e menor que 10 m;
- `monin_obukhov_length_m`, finito e diferente de zero.

Para `|L| >= 100.000 m`, o regime é tratado como aproximadamente neutro. A
implementação cobre regimes estável, instável e neutro. Altura de cubo igual a
100 m preserva a velocidade de referência dentro da tolerância numérica.

Se apenas parte do trio for enviada no CSV climático, a entrada é rejeitada. Se
o trio inteiro estiver ausente e MOST não for obrigatório, o vento de 100 m é
preservado e o fallback é registrado. Com `most_required=true`, o snapshot é
bloqueado quando os campos estão ausentes ou inválidos.

O código não inventa altura, rugosidade ou estabilidade. Também não afirma
resolução por turbina: hoje a linha operacional é um conjunto ONS. Aplicação
por CEG/parque antes da agregação depende de um cadastro com essa granularidade
e vigência, ainda não disponível no contrato canônico.

## 6. Compatibilidade de artefatos

A lista antiga de 15 features foi preservada como
`LEGACY_FEATURE_COLUMNS`. O `Predictor` reconhece tanto essa ordem quanto a nova
ordem versionada e sempre seleciona as colunas registradas no metadata do
artefato.

Artefatos novos registram adicionalmente:

- configuração completa das features;
- horas de histórico exigidas;
- obrigatoriedade ou não de MOST;
- domínio do vento a 100 m e na altura de cubo.

Artefato novo continua indisponível para servir até passar pelos estados
`model_frozen`, `calibration_frozen`, `final_test_consumed` e
`operationally_homologated`, com hashes compatíveis.

## 7. Arquivos alterados

| Área | Arquivos principais |
| --- | --- |
| target e configuração | `training/config.py`, `training/config.example.json` |
| qualidade do snapshot | `training/build_dataset.py` |
| MOST e rolling | `training/features.py` |
| treino e tuning | `training/train.py`, `training/tune.py` |
| protocolo | `training/protocol.py`, `training/protocol.example.json` |
| reservas e artefatos | `training/protocol_jobs.py`, `training/evaluate.py` |
| inferência | `app/predictor.py`, `app/schemas.py` |
| cenário climático | `app/climate_file.py` |
| testes | `tests/test_dataset.py`, `tests/test_features_and_split.py`, `tests/test_api.py`, `tests/test_climate_file.py`, `tests/test_temporal_protocol.py`, `tests/test_pipeline.py` |

## 8. Evidência de verificação

Em 27 de setembro de 2026:

- 40 arquivos Python foram compilados em memória sem erro de sintaxe;
- `git diff --check` passou;
- testes de target, dataset, rolling, MOST, API, cenário climático, protocolo,
  XGBoost, ingestão, replay e registro de experimentos passaram em execuções
  segmentadas;
- o teste de treino real confirmou o ciclo treino → artefato → avaliação → API;
- os testes demonstram fallback com contexto incompleto, rejeição do target
  verificado, estabilidade das janelas após embaralhamento, não travessia de
  lacunas, identidade MOST em 100 m e bloqueio de período final exposto.

O comando monolítico `python -m pytest -q` foi iniciado, mas permaneceu
CPU-bound nos vários treinos LightGBM legados e foi interrompido sem relatório
final. Os mesmos arquivos de teste passaram quando executados em grupos. O
Docker daemon não estava ativo; por isso `GET /system/capabilities` e um replay
real não foram repetidos nesta mudança.

## 9. O que ainda bloqueia uso científico

- aprovação da semântica e elegibilidade de `geracao_referencia_mw`;
- snapshot com ciclo anual ou histórico plurianual e hashes reais;
- calendário walk-forward mensal congelado após auditoria de cobertura;
- mínimos por conjunto, mês e fold;
- cadastro versionado de altura de cubo e rugosidade na granularidade adequada;
- fonte reproduzível do comprimento de Monin-Obukhov ou das variáveis usadas
  para derivá-lo;
- calibração e teste final ainda não consultados;
- validação ponta a ponta da fase 2 e aceite no ANAREDE.

Até esses gates serem cumpridos, os resultados permanecem exploratórios e a
curva física continua sendo baseline, limite e fallback.
