# Registro de experimentos no Supabase

## Decisão e alcance

Para o volume atual, Supabase Postgres + Storage privado é suficiente como
registro leve de experimentos. Não substitui uma plataforma completa como MLflow:
não há painel de comparação dedicado, agendamento de treinos ou promoção automática.
O Studio e a Data API permitem consultar os resultados sem criar um serviço novo.

Na inspeção local desta implementação, `artifacts/` continha 32 arquivos e
5.778.077 bytes (aproximadamente 5,8 MB). Isso não mede datasets, ambientes virtuais
ou dependências. Migrar os modelos não elimina o peso desses outros diretórios.

| Componente | Conteúdo |
| --- | --- |
| `public.ml_experiments` | UUID, estado de publicação, família, versão, alvo, parâmetros, métricas, metadata completo e manifesto SHA-256 |
| Bucket privado `ml-experiments` | `<run_id>/model.txt`, metadata e relatórios JSON |
| Diretório local | Área de gravação/reenvio e cache explicitamente recuperado |

O manifesto JSONB guarda nome, tamanho e hash dos 4–5 arquivos de cada bundle.
Uma tabela adicional de arquivos não é necessária neste recorte pequeno; pode ser
normalizada quando houver centenas de artefatos por execução. Índices por data e
alvo atendem as consultas iniciais; não se cria um GIN amplo sem necessidade.

O formato nativo do LightGBM (`model.txt`) é preservado. Não se converte o modelo
para pickle. Adicionar outra família exige atualizar o contrato e seus testes.
Os snapshots de treino não são enviados: os hashes existentes ficam no metadata,
mas a reprodução ainda exige preservar separadamente o dataset correspondente.

O campo `metadata.approved` continua sendo o resultado experimental existente.
`status=complete` significa somente que o backup dos artefatos foi verificado.
Nenhum desses campos promove o modelo à produção ou altera replay/cenário climático.

## Fluxo e consistência

1. O treino grava seus arquivos localmente, incluindo o relatório final original.
2. O publicador valida o hash do modelo e calcula o manifesto dos arquivos aceitos.
3. Um UUID determinístico derivado do manifesto identifica o bundle. Repetir o
   envio dos mesmos bytes é idempotente; um relatório alterado cria outro bundle.
4. Insere-se o registro como `uploading`, sem sobrescrever um registro existente.
5. Arquivos ausentes são enviados sem upsert; existentes devem ter o mesmo hash.
6. O publicador baixa e verifica todos os arquivos e então marca `complete`.
7. Grava-se um recibo local sem credenciais. A limpeza é uma operação separada.

Postgres e Storage não compartilham uma transação. Se houver falha, o registro pode
ficar `uploading` e os arquivos parciais permanecem disponíveis para retomada.
Reexecute `publish` para o mesmo diretório. Falhas HTTP/transporte têm tentativas
limitadas; credenciais, corpos de erro e URLs assinadas não são registrados.
Uma falha de publicação após o treino retorna código 2 e preserva o resultado local.

Treinos que falham antes de gerar um bundle completo não são registrados remotamente
nesta versão. Os experimentos concluídos, inclusive os reprovados pelo baseline,
são publicados. Chamadas Python diretas a `train()` continuam locais; use `publish()`
depois de finalizar todos os relatórios quando orquestrar fora da CLI.

Cada arquivo tem limite cliente/bucket de 64 MiB. O upload usa REST padrão, adequado
ao volume pequeno atual, e a verificação gera tráfego de download adicional. Para
modelos grandes ou redes instáveis, evoluir para upload retomável/TUS ou S3. Custos
dependem do plano, volume armazenado e egress; não foram estimados com dados de conta.
Backups do banco não substituem uma política de backup dos objetos Storage.

## Aplicação da migração

1. Execute **uma vez** `backend/supabase/migrations/20260926_ml_experiments.sql`
   no SQL Editor do projeto Supabase ou pelo seu runner de migrações. O script é
   transacional e falha se os nomes já existirem, evitando mudar tabelas/buckets
   preexistentes silenciosamente. Não é necessário reexecutar `schema.sql` do PWF.
2. Para o protocolo temporal, execute também
   `backend/supabase/migrations/20260926_temporal_protocol.sql`. Ela cria o
   manifesto versionado e o log imutável de acesso às reservas. O estado
   `complete` do bundle continua significando somente backup verificado.
3. A tabela usa RLS, sem acesso para `anon`/`authenticated`. O bucket é privado.
   Não copie políticas públicas do exemplo antigo de PWF para os experimentos.
4. Confira políticas preexistentes em `storage.objects`: políticas genéricas
   permissivas podem alcançar o novo bucket. Não remova políticas de outros
   módulos sem avaliar seu uso.
5. Configure a credencial administrativa apenas no processo Python/servidor.

Aplicação verificada em 2026-09-26 no projeto Supabase do ClimaGrid: a tabela
`public.ml_experiments` existe com RLS ativo, o bucket `ml-experiments` existe
como privado com limite de 64 MiB e a consulta a `storage.objects` retornou
zero políticas. Nenhuma política pública foi adicionada.

```sql
select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects';
```

Em `backend/ai-service/.env`, preserve as configurações existentes e acrescente:

```dotenv
CLIMAGRID_EXPERIMENT_TRACKING=supabase
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SECRET_KEY=CHAVE_PRIVADA_DO_SERVIDOR
```

Alternativamente use `SUPABASE_SERVICE_ROLE_KEY` para o JWT legado. O módulo
deliberadamente não lê `SUPABASE_KEY`, pois no backend esse nome também aceita anon.
Não coloque a chave no frontend, em `NEXT_PUBLIC_*`, em código ou em commits.
Credenciais no ambiente do processo prevalecem sobre `--env-file`.

O transporte manda `sb_secret_*` somente em `apikey`; para a chave JWT legada,
também envia `Authorization: Bearer`. Respostas e redirecionamentos não são seguidos
automaticamente para outros hosts. Para uso por usuários finais, adicione uma
fachada autenticada com autorização; não distribua a credencial administrativa.

## Uso: comandos a partir de backend/ai-service

Instale as dependências do projeto no ambiente homologado. `httpx` e `python-dotenv`
passaram a ser dependências diretas de execução, respeitando `constraints.txt`.

```powershell
python -m pip install -r requirements-dev.txt

# Treino com publicação automática; sem --artifacts, cria experiments/<uuid>.
python -m training.train --env-file .env --input data/processed/training/SNAPSHOT.parquet --target geracao_referencia_mw --tracking supabase

# Migração de um experimento antigo ou retomada após falha de rede.
python -m training.experiments --env-file .env publish artifacts/experiments/EXPERIMENTO

# Consulta paginada via Data API.
python -m training.experiments --env-file .env list --limit 20 --offset 0
python -m training.experiments --env-file .env show UUID_DO_BUNDLE

# Recupera para um diretório NOVO e verifica os hashes antes de disponibilizá-lo.
python -m training.experiments --env-file .env pull UUID_DO_BUNDLE artifacts/cache/UUID_DO_BUNDLE
```

O target acima é ilustrativo: seu uso científico ainda depende de validação de
domínio. `--tracking local` preserva o fluxo anterior sem acessar o Supabase.
O CSV intermediário em `--processed` continua local e fora da limpeza de modelos.
Se `training.evaluate` gerar um relatório adicional depois da publicação, execute
`publish` novamente: será registrado outro bundle imutável, sem perder o anterior.

API Python para um processo confiável:

```python
from pathlib import Path
from training.experiment_store import ExperimentStore

with ExperimentStore.from_env() as registry:
    receipt = registry.publish(Path("artifacts/experiments/EXPERIMENTO"))
    runs = registry.list_runs(limit=20, offset=0)
    detail = registry.get_run(receipt["run_id"])
    registry.pull(receipt["run_id"], Path("artifacts/cache/NOVO_DIRETORIO"))
```

A consulta HTTP está disponível em `GET /rest/v1/ml_experiments` no Supabase,
com parâmetros PostgREST como `status=eq.complete`, `target=eq.geracao_referencia_mw`,
`order=created_at.desc` e `limit=20`. Os downloads autenticados usam
`GET /storage/v1/object/ml-experiments/<uuid>/<nome>`. O cliente acima encapsula
essas chamadas e a validação de integridade. Não foi criada uma rota pública
adicional no FastAPI ou NestJS.

## Limpeza local segura

Primeiro publique, faça uma recuperação de teste para outro diretório e confirme
que o artefato pode ser carregado pelo consumidor previsto. Pare processos que
possam escrever/servir o diretório a limpar. Se um experimento estiver em uso por
outro processo, crie um arquivo `.pin` nele para bloqueá-lo explicitamente.

```powershell
# Simulação: verifica backup remoto e lista exatamente os arquivos candidatos.
python -m training.experiments --env-file .env clean artifacts/experiments/EXPERIMENTO --older-than-days 30

# Execução explícita, depois de revisar a simulação.
python -m training.experiments --env-file .env clean artifacts/experiments/EXPERIMENTO --older-than-days 30 --apply
```

A retenção conta desde a modificação mais recente, incluindo o recibo: recém-
publicados ficam protegidos por 30 dias. Para uma migração revisada que deve liberar
espaço imediatamente, use `--older-than-days 0`, primeiro sem e depois com `--apply`.

A limpeza aceita somente um filho direto de `artifacts/experiments`, rejeita links,
junctions, subdiretórios, `.pin`, arquivos extras, arquivos Git e o diretório
selecionado por `CLIMAGRID_ARTIFACT_DIR` (ou o global padrão). Exige recibo do mesmo
projeto, publicação completa e igualdade dos hashes locais/remotos. Falha de rede
bloqueia exclusão. Não há remoção recursiva nem deleção de objetos remotos.

Dados ONS/ERA5, snapshots, configurações JSON em `training/`, PWFs e o modelo global
ficam fora dessa limpeza. `.gitignore` evita novos artefatos no Git, mas não libera
disco nem remove arquivos já versionados. Não use `git rm`/`git clean` genérico.

## Verificação e limites desta entrega

Os testes usam `httpx.MockTransport` e bundles temporários: idempotência, retomada,
corrupção, restauração, autenticação, integração com treino real LightGBM e guardas
da limpeza. A suíte local foi executada com **96 testes aprovados**. A migração
remota foi aplicada e verificada, mas publicação/pull reais ainda exigem configurar
`SUPABASE_SECRET_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` no ambiente do processo; nenhum
backup de experimento foi executado nesta verificação.

Verificação desta alteração: **96 testes aprovados**, incluindo 16 novos casos,
com `python -m pytest -q -p no:cacheprovider --basetemp=../../tmp/ml-registry-validation`.
O cache foi desabilitado após um problema de escrita no ambiente local. A execução
usou a `.venv` existente (Python 3.12.10); a documentação do projeto recomenda
Python 3.13, cuja execução não foi reproduzida aqui. Houve 45 avisos de dependências,
incluindo deprecações e um aviso NumPy/netCDF. A consulta a
`http://127.0.0.1:3333/system/capabilities` encontrou conexão recusada; replay/exportação
HTTP real e smoke remoto Supabase não foram executados nesta entrega.

Referências oficiais:
- [Data API](https://supabase.com/docs/guides/api)
- [Chaves de API](https://supabase.com/docs/guides/getting-started/api-keys)
- [Buckets privados](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Uploads padrão e retomáveis](https://supabase.com/docs/guides/storage/uploads/standard-uploads)
