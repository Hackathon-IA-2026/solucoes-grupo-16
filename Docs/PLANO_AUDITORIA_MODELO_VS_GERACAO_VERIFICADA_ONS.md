# Plano de auditoria do modelo contra a geração verificada da ONS

**Data da auditoria:** 27 de setembro de 2026  
**Janela do relatório de referência:** outubro de 2024 a setembro de 2025  
**Decisão atual:** o relatório existente **não** mede o modelo contra a potência
ativa efetivamente produzida. Ele mede contra `geracao_referencia_mw`.

## 1. Conclusão da auditoria inicial

O documento `comparativo_modelo_vs_ons.md` descreve 100.633.084 MWh como
"Real ONS" e apresenta WAPE horário de 10,25%. Essa descrição não é sustentada
pelos artefatos auditáveis disponíveis:

- `Docs/ML/annual_report.json` declara `target: geracao_referencia_mw`;
- o mesmo artefato declara `geracao_verificada_mw` como `replay/audit_only` e
  `used_as_target_or_feature: false` em todos os meses;
- `Docs/BACKTEST_ANUAL_2024_10_A_2025_09.md` chama o total de 100.633.084 MWh
  de potência de **referência**, não de geração verificada;
- o backtest é retrospectivo, exploratório e não homologado;
- o arquivo citado `annual_predictions.parquet` e o bundle exato do modelo
  anual não estão presentes nesta cópia local, logo as métricas não podem ser
  recalculadas linha a linha apenas com os arquivos versionados.

Portanto, o valor de 10,25% pode permanecer como métrica contra a proxy de
potencial/referência, mas não deve ser apresentado como erro contra a geração
real entregue à rede.

## 2. Evidência independente obtida da ONS

Para conferir a origem das colunas, foram baixadas pelos scripts oficiais do
repositório duas partições de setembro de 2025, mês contido no relatório:

| Fonte ONS | Arquivo | SHA-256 |
| --- | --- | --- |
| Geração horária | `GERACAO_USINA-2_2025_09.parquet` | `adc987c963829d622290fadc2b62a0688ed2cc6f88c91c8ad9c34113e75056af` |
| Restrição eólica | `RESTRICAO_COFF_EOLICA_2025_09.parquet` | `bd07d2fda2cafcddc9171cc550a520365af1cc18b30ac2bdc635b363366fa6cd` |

Resultado da normalização com `ingestion.ons.hourly` e o catálogo atual:

| Verificação | Resultado |
| --- | ---: |
| Linhas horárias válidas em `GERACAO_USINA-2_HO` | 91.866 |
| Linhas horárias válidas na base de restrição | 91.140 |
| Linhas pareadas por `usina_id + timestamp_utc` | 91.140 |
| Conjuntos pareados | 128 |
| MAE entre os dois campos de geração verificada | 0,000254 MW |
| Geração verificada no recorte pareado | 8.657.865 MWh |
| Geração de referência no mesmo recorte | 11.594.870 MWh |

A igualdade numérica, salvo arredondamento, confirma que
`geracao_verificada_mw` representa `val_geracao` da fonte oficial de geração.
Também demonstra que `geracao_referencia_mw` não pode ser renomeada como
produção real: neste recorte, a referência é aproximadamente 33,9% maior que a
geração verificada.

Os 90.646 pares de setembro registrados no relatório anual formam uma coorte
ligeiramente menor que as 91.140 linhas desta checagem, pois o snapshot anual
original e seu `annual_predictions.parquet` não estão disponíveis localmente.
Logo, os totais acima são prova de semântica e de ordem de grandeza, não uma
substituição das métricas finais na mesma coorte.

## 3. Objetivo correto

Produzir dois placares separados e rastreáveis para as mesmas previsões:

1. **Potencial/referência ONS:** previsão versus `geracao_referencia_mw`;
2. **Produção observada ONS:** previsão versus `geracao_verificada_mw`.

O primeiro avalia aderência à proxy de potencial usada no experimento. O
segundo responde à pergunta de potência ativa efetivamente produzida. A
diferença entre eles não deve ser atribuída automaticamente a curtailment, pois
também pode refletir disponibilidade, cadastro, operação e regras da fonte.

## 4. Plano de execução

### Fase A — congelar contratos e recuperar artefatos

1. Preservar o relatório anual existente como avaliação contra
   `geracao_referencia_mw`; não sobrescrevê-lo.
2. Recuperar o `annual_predictions.parquet` cujo hash esperado é
   `d4e2f288dd365b02085771ad0bf7a1a44d95e7cd707340f2dc0a7964ead7c0cc`.
3. Recuperar e verificar o modelo base cujo hash esperado é
   `e861dcfcba5653333c565ce68b229457808c0f2b1c28af66b80827bc02e6d311`.
4. Se esses artefatos não puderem ser recuperados, regenerar as previsões com o
   mesmo LightGBM de agosto de 2024 e fator fixo `1,03`; não retreinar nem
   selecionar parâmetros na janela anual.
5. Registrar hashes, versões de bibliotecas, configuração e origem de cada
   arquivo em um manifesto novo.

**Gate A:** nenhuma métrica é publicada se o hash do artefato recuperado não
coincidir ou se o candidato tiver sido alterado.

### Fase B — reconstruir ONS e ERA5 para a janela anual

1. Baixar, para cada mês entre 2024-10 e 2025-09:
   - `GERACAO_USINA-2_HO`, fonte canônica de `geracao_verificada_mw`;
   - a base de restrição eólica, necessária para manter
     `geracao_referencia_mw`, disponibilidade e auditoria paralela.
2. Validar SHA-256, schema, unidade MW, timezone `America/Sao_Paulo`, intervalos
   esperados e ausência de chaves conflitantes.
3. Reconstruir o catálogo pela chave CEG, mantendo nomes apenas como informação.
4. Baixar ERA5 para a mesma janela e extrair `u100`, `v100`, temperatura a 2 m
   e pressão de superfície para as coordenadas do catálogo.
5. Unir por `usina_id + timestamp_utc`, sem imputar geração, clima ou cadastro.

O planejamento do script já confirmou 12 partições ERA5 e 8.760 horas para a
área `[-2.25, -43.25, -15.25, -34.75]`. O backfill está atualmente bloqueado
porque a cobertura geográfica do catálogo é 93,8%, abaixo do gate padrão de
95%. Não reduzir `--minimum-location-coverage` sem decisão explícita do
especialista de domínio; corrigir coordenadas/CEGs ou aprovar formalmente a
população excluída.

**Gate B:** publicar, por mês, cobertura ONS--ERA5, conjuntos ausentes,
duplicatas, horas incompletas, diferenças entre as duas fontes de
`val_geracao` e qualquer mudança de composição da frota.

### Fase C — construir uma única coorte pareada

1. Partir das previsões congeladas, não do target.
2. Fazer `inner join` explícito entre previsão, ONS e ERA5 por
   `usina_id + timestamp_utc`.
3. Manter a população primária independente do valor do target: não filtrar
   linhas porque o erro é alto, porque a geração é zero ou porque a referência
   supera a capacidade disponível.
4. Excluir apenas registros tecnicamente inválidos, com motivo e contagem
   versionados.
5. Calcular ambos os placares sobre exatamente as mesmas chaves.

**Gate C:** os relatórios de referência e de geração verificada devem ter os
mesmos `rows`, `hours`, `plants` e hash da lista ordenada de chaves.

### Fase D — calcular as métricas corretas

Métrica primária, alinhada ao PWF de um instante:

- WAPE do total agregado por hora da rede contra `geracao_verificada_mw`.

Métricas obrigatórias adicionais:

- MAE, RMSE, viés, erro energético total, R² e correlação do total horário;
- P50/P90/P95/P99 do erro absoluto e percentual por hora;
- WAPE e MAE por usina-hora;
- métricas mensais e por conjunto;
- diferença entre `geracao_referencia_mw` e `geracao_verificada_mw`;
- cobertura da coorte e sensibilidade com/sem registros de restrição, sem
  transformar a diferença em alegação causal.

MAPE deve ser acompanhado de uma política explícita para horas de geração zero;
não deve substituir WAPE como métrica principal.

### Fase E — entregar e revisar o relatório

Gerar artefatos separados, por exemplo:

- `observed_generation_predictions.parquet`;
- `observed_generation_report.json`;
- `COMPARATIVO_MODELO_VS_GERACAO_VERIFICADA_ONS.md`;
- `observed_generation_manifest.json`.

O novo texto deve usar:

- **"geração verificada/observada ONS"** somente para
  `geracao_verificada_mw`;
- **"geração de referência/proxy de potencial"** para
  `geracao_referencia_mw`;
- **"estimativa com ERA5 histórico"**, não previsão meteorológica futura;
- **"erro de entrada de geração para o PWF"**, sem afirmar convergência no
  ANAREDE.

## 5. Comandos previstos

Executar em `backend/ai-service`, usando a `.venv` do projeto.

```powershell
# ONS: repetir para cada mês da janela
.\.venv\Scripts\python.exe -m ingestion.era5.cli download-ons-generation `
  --year 2024 --month 10

.\.venv\Scripts\python.exe -m ingestion.era5.cli download-ons-restriction `
  --year 2024 --month 10

# Planejamento ERA5 sem download
.\.venv\Scripts\python.exe -m ingestion.era5.cli plan `
  --catalog data/processed/reference/plant_locations.parquet `
  --start 2024-10-01 --end 2025-09-30

# Executar somente após resolver/aprovar o gate de cobertura do catálogo
.\.venv\Scripts\python.exe -m ingestion.era5.cli backfill `
  --catalog data/processed/reference/plant_locations.parquet `
  --start 2024-10-01 --end 2025-09-30
```

Para a união final, usar `join-ons --ons-format generation` para a série de
produção real. A base de restrição deve ser unida separadamente para acrescentar
referência e disponibilidade, sem substituir `val_geracao` da fonte canônica.

## 6. Critérios de aceite

O trabalho só estará concluído quando:

- as previsões e o modelo tiverem hashes verificados;
- os 12 meses ONS e ERA5 tiverem manifests reproduzíveis;
- a cobertura e todas as exclusões estiverem explícitas;
- a mesma coorte alimentar os dois placares;
- as métricas contra `geracao_verificada_mw` forem recalculadas diretamente do
  Parquet de previsões pareadas;
- uma amostra estratificada de pelo menos 30 chaves for conferida contra os
  arquivos brutos ONS;
- o relatório não chamar `geracao_referencia_mw` de geração real;
- limitações de curtailment, retrospectividade, ERA5 e ANAREDE permanecerem
  visíveis.

## 7. Prioridade recomendada

1. Corrigir imediatamente o rótulo do documento atual para
   "modelo versus geração de referência ONS".
2. Recuperar o `annual_predictions.parquet` original; isso evita refazer as
   previsões e permite recalcular o placar observado com menor risco.
3. Resolver o gate de cobertura de 93,8% do catálogo.
4. Materializar ONS + ERA5 dos 12 meses e executar a comparação pareada.
5. Só então substituir números executivos, gráficos e alegações de precisão
   contra a produção real.
