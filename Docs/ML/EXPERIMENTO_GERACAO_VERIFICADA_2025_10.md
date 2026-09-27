# Experimento exploratório: híbrido versus geração verificada ONS — outubro/2025

**Execução:** 27/09/2026. **Estado:** exploratório, coorte parcial, não homologado.
Este é um **novo** LightGBM residual treinado com `geracao_verificada_mw`,
distinto dos modelos antigos treinados com `geracao_referencia_mw`. O modelo
servido pela aplicação não foi alterado.

## Contrato e separação temporal

- Alvo: `GERACAO_USINA-2_HO.val_geracao` da ONS, em MW, normalizado como
  `geracao_verificada_mw`. A amostra de 30 chaves do snapshot confere com a
  fonte bruta. A base de restrição é mantida para auditoria da referência, mas
  **não** fornece o alvo deste treino.
- Clima: ERA5 horário histórico de outubro/2025 e das três primeiras horas UTC
  de novembro/2025; não é previsão meteorológica futura.
- Treino: 01/08 a 25/08/2024, 89.250 conjunto-horas; validação: 25/08 a
  31/08/2024, 22.350 conjunto-horas. Outubro/2025 ficou inteiramente fora do
  treino, validação e escolha de hiperparâmetros.
- Features: vento, temperatura, pressão, hora/calendário, capacidade instalada
  e históricos causais do clima (3/6 h). Disponibilidade histórica ONS,
  referência e geração contemporânea não são features. A curva física usa
  disponibilidade hipotética 1,0. O resíduo de geração observada/capacidade é
  aprendido por LightGBM e a saída é limitada a 0–capacidade instalada.
- Hiperparâmetros: `objective=regression_l1`, 500 árvores máximas,
  `learning_rate=0.04`, `num_leaves=31`, `min_child_samples=100`,
  `subsample=0.8`, `colsample_bytree=0.8`, `reg_lambda=5`, semente 42,
  `n_jobs=1`, parada antecipada após 50 rodadas; melhor iteração **494**.
- Artefato do modelo: `backend/ai-service/artifacts/experiments/observed-hybrid-2025-10-v2/model.txt`,
  SHA-256 `bf8ebc9f71d3df3eeb51f9a572ba89c9a96b987a2ec09205e9beb5da51838885`.

## População e fontes

O arquivo ONS de outubro contém 149 conjuntos eólicos NE. O catálogo CEG/SIGA
localizou completamente 137 (**91,9%**), abaixo do gate padrão de 95%; por
autorização explícita do usuário este ensaio é restrito à coorte rastreável e
**não** representa a frota completa. Nove excluídos são grupos agregados `PQU_*`
sem CEG individual; `CJU_BASDA1` não foi localizado e `CJU_CEARD` e
`CJU_RN5ETGS` têm membros parcialmente localizados/revisão de coordenadas.
Os 137 conjuntos têm 744 horas cada, totalizando **101.928** pares. O snapshot
pré-coorte tinha 139 conjuntos; 1.488 linhas dos dois parcialmente localizados
foram retiradas explicitamente. A capacidade instalada somada da coorte é
**30.238,145 MW** em cada hora.

Fontes locais e hashes constam em
`backend/ai-service/data/processed/audit/monthly-observed-2025-10/snapshot/snapshot_manifest.json`.
As fontes oficiais ONS baixadas são `GERACAO_USINA-2_2025_10.parquet`
(SHA-256 `108482042cc2de3a817cdc9e3e87edb5ecf437af2d6a77529e22b712e3c45577`)
e `RESTRICAO_COFF_EOLICA_2025_10.parquet`
(SHA-256 `e2e6104c01f35f51441a18e26f2f811e7a7cdb6f74da0c65f4bf33e1e8e78f9d`).

## Potência estimada versus produção real

**Capacidade instalada não é geração prevista.** A capacidade de 30.238 MW é o
limite nominal da coorte; a estimativa híbrida e a geração ONS são potência
ativa horária (MW). As somas de horas abaixo são energia (MWh).

| Período local de outubro | Horas | Híbrido (MWh) | ONS verificada (MWh) | Diferença (MWh) | WAPE horário |
| --- | ---: | ---: | ---: | ---: | ---: |
| 01–07 | 168 | 2.749.309 | 2.301.294 | +448.015 | 21,9% |
| 08–14 | 168 | 2.623.965 | 2.335.211 | +288.753 | 15,3% |
| 15–21 | 168 | 2.273.353 | 2.098.768 | +174.584 | 16,4% |
| 22–28 | 168 | 2.908.627 | 2.350.718 | +557.909 | 24,9% |
| 29–31 | 72 | 979.162 | 998.975 | −19.813 | 10,9% |
| **Mês** | **744** | **11.534.415** | **10.084.966** | **+1.449.450** | **18,84%** |

Potência média horária do híbrido: **15.503 MW**; ONS: **13.555 MW**.
MAE agregado horário: **2.553 MW**; viés: **+1.948 MW**. A curva física
sem correção ML teve WAPE horário de **36,64%** na mesma coorte. O WAPE
conjunto-hora do híbrido é **41,79%**. O modelo melhora o agregado perante a
curva física, mas superestima a energia mensal em **14,37%**. Esta diferença
não prova curtailment: disponibilidade, operação, cadastro e erro meteorológico
também podem contribuir.

Dez conjuntos da coorte de teste não apareciam no conjunto de treino. O
cadastro SIGA usado para localizar CEGs e informar capacidade é o snapshot
local disponível; sua vigência histórica exata em outubro/2025 ainda precisa
ser validada. Isso, a distância temporal de 14 meses entre treino e teste e
a coorte parcial limitam qualquer conclusão de generalização.

## Arquivos reproduzíveis

- `backend/ai-service/artifacts/experiments/observed-hybrid-2025-10-v2/previsoes_vs_ons.parquet`:
  101.928 linhas por conjunto e hora, com capacidade, curva física, híbrido e ONS.
- `backend/ai-service/artifacts/experiments/observed-hybrid-2025-10-v2/comparacao_horaria.parquet`:
  744 horas agregadas, adequadas à entrada instantânea de um PWF.
- `backend/ai-service/artifacts/experiments/observed-hybrid-2025-10-v2/comparacao_diaria.csv`:
  31 dias, capacidade MW e energias MWh claramente rotuladas.
- `backend/ai-service/artifacts/experiments/observed-hybrid-2025-10-v2/relatorio_experimento.json`:
  hashes, coorte, hiperparâmetros, versões, métricas e exclusões.

O comando exato para repetir o treino/teste consta no README do AI service.
Testes Python: **161 aprovados** após a adição do teste de não vazamento dos
campos ONS. Os artefatos e dados são locais e ignorados pelo Git; o script e
este relatório são versionáveis. Não houve promoção ao `Predictor`, inferência
de previsão meteorológica futura nem validação de convergência no ANAREDE.
