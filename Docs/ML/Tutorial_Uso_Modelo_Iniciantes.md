# Tutorial para Iniciantes: Como Utilizar o Modelo Preditivo (LightGBM + Curva Física)

> **Documento de pesquisa para a etapa 3, fora do MVP atual.** O próximo trabalho
> oficial é a etapa 2 (arquivo climático do usuário → geração → PWF). Leia
> [`../CONTEXTO_PROJETO_IA.md`](../CONTEXTO_PROJETO_IA.md) antes de executar ou
> alterar este tutorial.

Olá! Este guia foi feito para você que está começando a mexer na parte de inteligência artificial (Machine Learning) do ClimaGrid. Não se preocupe se você não tem muita experiência prévia, vamos explicar o passo a passo bem detalhado!

Tudo o que vamos fazer aqui roda em **Python** (não Node.js). O Node.js/NestJS é usado apenas para a API do backend da aplicação web, mas o treinamento, download e processamento dos dados do modelo preditivo são feitos com scripts Python usando o ecossistema de dados (`pandas`, `lightgbm`, etc).

## Entendendo o Modelo (Resumo Rápido)
O nosso modelo usa uma abordagem híbrida:
1. **Curva Física:** Primeiro, tentamos estimar a geração de energia usando apenas matemática e física (a partir da velocidade do vento e da capacidade da usina).
2. **LightGBM:** Depois, usamos o LightGBM (um algoritmo parecido com XGBoost, porém muito rápido) para tentar "corrigir" os erros que a curva física cometeu. O algoritmo aprende sozinho quando a física erra para mais ou para menos, baseado em padrões do passado.

---

## Passo 1: Preparando o Ambiente
Antes de qualquer coisa, abra o seu terminal (PowerShell) e garanta que as dependências do Python estão instaladas no seu ambiente virtual. Todos os comandos a seguir devem ser rodados de dentro da pasta `backend/ai-service`.

```powershell
cd C:\Code\hackathon\solucoes-grupo-16\backend\ai-service
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

---

## Passo 2: Como Baixar os Arquivos (S3 e Copernicus)
Para alimentar o modelo, precisamos de dados do clima (ERA5) e de energia (ONS). **A boa notícia é que você não precisa ir manualmente na nuvem baixar arquivos em buckets S3.** Nossos scripts Python automatizam o download e organizam tudo localmente!

Execute os seguintes comandos no terminal:

**1. Baixar lista de usinas (do S3 da ONS e do SIGA):**
```powershell
.\.venv\Scripts\python.exe -m ingestion.era5.cli download-siga
.\.venv\Scripts\python.exe -m ingestion.era5.cli download-ons-membership
```

**2. Juntar os dados das usinas e criar um catálogo focado no Nordeste (NE):**
```powershell
.\.venv\Scripts\python.exe -m ingestion.era5.cli build-catalog `
  --ons data/raw/ons/RESTRICAO_COFF_EOLICA_2026_09.parquet `
  --siga data/raw/siga/siga.csv `
  --ons-membership data/raw/ons/relacionamento_usina_conjunto.parquet `
  --subsystem NE
```

**3. Baixar dados climáticos (Copernicus / ERA5):**
*(Lembre-se que aqui você já deve ter configurado o arquivo `.cdsapirc` que criamos anteriormente!)*
```powershell
.\.venv\Scripts\python.exe -m ingestion.era5.cli backfill `
  --catalog data/processed/reference/plant_locations.parquet `
  --start 2026-09-01 `
  --end 2026-09-17
```

---

## Passo 3: O Que Entra e O Que Sai? (Input / Output)

A máquina não lê planilhas separadas de vento e energia. Ela precisa de tudo na mesma linha para cruzar a informação. Por isso, juntamos o clima com a geração de energia:
```powershell
.\.venv\Scripts\python.exe -m ingestion.era5.cli join-ons `
  --ons data/raw/ons/RESTRICAO_COFF_EOLICA_2026_09.parquet `
  --weather data/processed/era5/year=2026/month=09/weather_hourly.parquet `
  --catalog data/processed/reference/plant_locations.parquet `
  --output data/processed/training/snapshot_unido.parquet
```

**O que você insere no modelo (Inputs / Features):**
- Velocidade do vento e direção (`u100` e `v100`)
- Temperatura e Pressão
- Hora do dia, Dia do ano (para capturar o efeito de dia/noite e sazonalidade)
- Capacidade Instalada (MW) e Disponibilidade da usina

**O que o modelo retorna (Output / Target):**
O modelo vai retornar (cuspir) a **Geração de Energia (MW)**. No nosso projeto, você escolhe se quer que ele preveja a geração potencial (que seria a geração de referência, se não houvesse problemas) ou a verificada (a que foi realmente injetada na rede).

---

## Passo 4: Fazendo o Primeiro Teste (Treinamento)

Nesse momento, para realizar um teste simples, vamos focar em treinar o modelo para uma única usina específica. 

Crie um arquivo chamado `experimento-usina-01.json` dentro da pasta `training/` com o seguinte código (no futuro, você trocará o `usina_id` pelo ID real de uma usina do seu catálogo):
```json
{
  "target": "geracao_referencia_mw",
  "usina_id": "ID_ONS_DA_USINA",
  "start_utc": "2026-09-01T00:00:00Z",
  "experiment_days": 15,
  "physical_curve": {
    "cut_in_ms": 3.0,
    "rated_ms": 12.0,
    "cut_out_ms": 25.0
  }
}
```

Agora, inicie o treinamento rodando:
```powershell
.\.venv\Scripts\python.exe -m training.train `
  --input data/processed/training/snapshot_unido.parquet `
  --config training/experimento-usina-01.json `
  --processed data/processed/training/usina-01-hourly.parquet `
  --artifacts artifacts/experiments/usina-01-exp-001
```

Esse script vai gerar uma pasta (`usina-01-exp-001`) com os resultados: o arquivo do modelo inteligente em texto e métricas de erro.

Para ver se o modelo ficou bom, rode a avaliação:
```powershell
.\.venv\Scripts\python.exe -m training.evaluate `
  --input data/processed/training/snapshot_unido.parquet `
  --target geracao_referencia_mw `
  --artifacts artifacts/experiments/usina-01-exp-001
```

O arquivo de avaliação dirá se o algoritmo de LightGBM "venceu" a conta básica da física. Se no JSON aparecer `"approved": true`, parabéns, a Inteligência Artificial entendeu o padrão da usina!

---

## Passo 5: Como Melhorar o Modelo (Hiperparâmetros)

Como você tem uma base com LightGBM e XGBoost, sabe que eles têm "botões" que podemos configurar para o algoritmo aprender melhor. Esses botões são os Hiperparâmetros.

Para este experimento, você pode definir esses valores na seção `lightgbm` do JSON antes de rodar o passo 4 novamente. Campos omitidos usam os padrões de `backend/ai-service/training/config.py`:

* **`learning_rate` (Taxa de aprendizado):** Comece com `0.04`. Se quiser que ele aprenda mais rápido (com menos árvores, mas maior risco de errar o ajuste fino), suba para `0.08`. Se o erro estiver alto e o modelo não estiver aprendendo nuances, baixe para `0.02` ou `0.01`.
* **`num_leaves` (Folhas da árvore):** O padrão é `31`. É o controle da profundidade/complexidade da árvore. Se o modelo estiver errando muito (underfitting), suba para `63`. Se ele decorar os dados de treino e for mal em dados novos (overfitting), diminua para `15`.
* **`min_child_samples`:** Quantidade mínima de dados que uma folha precisa ter. Subir para `200` força o modelo a ser mais conservador e generalista.
* **`colsample_bytree` / `subsample`:** O ideal é manter entre `0.7` e `1.0`. Eles sorteiam parte dos dados em cada árvore para impedir que o modelo vicie em uma única variável (ex: apenas depender do vento).

**Dica Prática para Testes:** Mude apenas UM hiperparâmetro de cada vez. Por exemplo, no JSON, use `"lightgbm": {"min_child_samples": 50}`. Rode `train` com uma nova pasta `--artifacts artifacts/experiments/usina-01-exp-002` para preservar a anterior. Compare candidatos pela validação e reserve o teste para a avaliação final; repetir ajustes olhando o teste pode tornar sua estimativa de desempenho otimista.

---

## Passo 6: O que fazer com o resultado?

Quando você finalizar os testes com hiperparâmetros e chegar em um modelo de erro baixo, esse arquivo `.txt` final nos seus artefatos será o seu "Cérebro" salvo e pronto para a ação. 

Em produção, nossa API em Python (que roda local via `uvicorn`) vai carregar esse arquivo. Dessa forma, quando sua aplicação web pedir uma previsão de energia de uma usina do nordeste para a semana que vem, a API pegará os ventos futuros, passará pelo seu `.txt` treinado e devolverá, em milissegundos, a quantidade de Megawatts esperados!
