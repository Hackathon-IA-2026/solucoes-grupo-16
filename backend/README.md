# ClimaGrid — backend

> Contexto e prioridades: [`../Docs/CONTEXTO_PROJETO_IA.md`](../Docs/CONTEXTO_PROJETO_IA.md).
> O backend concluiu a integração da etapa 1. A etapa 2 possui um protótipo
> ponta a ponta em validação; previsão futura e curtailment não devem ser
> misturados a esse contrato. Consulte
> [`../Docs/ML/AUDITORIA_FASE_2.md`](../Docs/ML/AUDITORIA_FASE_2.md).

API NestJS do ClimaGrid. O primeiro módulo funcional recebe casos de referência
PWF, preserva o arquivo original, interpreta os blocos elétricos necessários e
expõe os alvos de geração encontrados.

O NestJS também funciona como fachada única do frontend: consulta o serviço
FastAPI, expõe o estado dos insumos e transforma um snapshot unido ONS + ERA5
em observações horárias prontas para a interface.

## API PWF

```http
POST /pwf/reference-cases
Content-Type: multipart/form-data
Campo: file
```

O upload aceita arquivos de até 25 MB. O arquivo original é salvo de forma
imutável, acompanhado de metadados, SHA-256 e um índice interpretado. Por
padrão, os dados ficam em `data/pwf`; a variável `PWF_STORAGE_ROOT` permite
trocar o diretório.

Depois de enviar e validar um caso, o operador pode definir seu UUID em
`PWF_DEFAULT_REFERENCE_ID`. A interface então oferece esse caso persistido como
alternativa ao upload. O padrão continua sendo um PWF real e versionado; o
sistema não fabrica uma rede elétrica mínima nem remove a rastreabilidade do
caso-base.

```http
GET /pwf/reference-cases/:id
GET /pwf/reference-cases/:id/generation-targets
POST /pwf/exports
```

O parser suporta estruturalmente `TITU`, `DBAR`, `DGBT`, `DGER` e `DGEI`. A
versão homologada nesta etapa é ANAREDE 12.03.04. Outras versões podem ser
interpretadas, mas são devolvidas como `unverified`.

`POST /pwf/exports` recebe as parcelas de geração observada/estimada, a seleção
de conjuntos e os campos `Número`, `Operação` (`A/E/M`) e `Estado` (`0/1/2`).
Parcelas destinadas à mesma barra são somadas e devem usar os mesmos parâmetros.

No modo `reference`, o writer copia o caso original e altera somente `Operação`,
`Estado` e geração ativa (`Pg`) nos registros `DBAR` incluídos. Barras
inexistentes, desligadas, swing, valores acima do limite ou que não cabem no
campo fixo são rejeitados; `DGER`, `DGEI` e todos os demais bytes são
preservados. O caso pode vir do upload do usuário ou de
`PWF_DEFAULT_REFERENCE_ID`, mantendo nome, ID e SHA-256 na trilha.

No modo `dbar`, a rota não exige `referencePwfId` e cria um arquivo de
alterações com `DBAR`, cabeçalho de colunas fixas, registros selecionados,
`99999` e `FIM`. Esse arquivo não contém a rede completa e não representa
convergência; precisa ser aplicado e validado no ANAREDE.

## Integração com o serviço de IA

Configure `AI_SERVICE_URL` (padrão `http://127.0.0.1:8000`) e use:

```http
GET /system/capabilities
GET /experimental-insights
POST /climate-scenarios/historical
POST /climate-scenarios/file/inspect
POST /climate-scenarios/file/estimate
POST /climate-scenarios/era5/estimate
GET /climate-scenarios/:id
```

A rota de capacidades diferencia backend configurado, serviço de IA online,
catálogo, ONS bruto, partições ERA5 e snapshot observado. Uma hora fora do cache
inicia a coleta ONS/ERA5 no AI service quando a credencial CDS está configurada.
O cliente recebe `status: preparing` enquanto a partição é construída e repete
a consulta até obter o replay; falhas de fonte ou de conciliação retornam `409`.

`GET /experimental-insights` encaminha um relatório DML pré-calculado para o
painel do pitch. A resposta é evidência exploratória, declara explicitamente
`scientifically_approved: false` e não participa da estimativa nem da exportação
PWF.

As rotas `file/inspect` e `file/estimate` aceitam o CSV climático normalizado
`normalized-ons-hourly-v1`, não ERA5 NetCDF/GRIB nativo. A estimativa atual usa
a curva física genérica. Cada estimativa persiste o CSV e um manifesto com
hashes, versões, observações e avisos. Na exportação estimada, o backend busca o
cenário pelo `scenarioId`, recalcula a geração por barra e rejeita dados
adulterados, alocações incompletas e cobertura cadastral parcial.

Cada exportação persiste o PWF final e outro manifesto com o modo, PWF base
quando aplicável, seleção, alocações, barras modificadas e hashes. `GET /climate-scenarios/:id` recupera a
trilha e verifica os arquivos armazenados. Por padrão, esses dados ficam em
`data/scenarios`; `SCENARIO_STORAGE_ROOT` permite trocar o diretório. No
Compose, `/app/data/scenarios` pertence ao volume `backend-data`. Quando
`SUPABASE_URL`, `SUPABASE_KEY` e `SUPABASE_BUCKET` estão configurados, o backend
também grava e lê a trilha completa em `climate-scenarios/<uuid>/` no Supabase
Storage. Isso permite usar o backend no Render Free sem depender do filesystem
efêmero da instância.

O corpo JSON de exportação aceita até 2 MB para comportar centenas de parcelas
usina–barra em um único replay.

## Execução local

```bash
npm ci
npm run start:dev
```

A API inicia por padrão em `http://localhost:3333` e aceita o frontend em
`http://localhost:3000`.

Para iniciar toda a aplicação com as versões homologadas de Node.js e Python,
use o Docker Compose documentado no `README.md` da raiz.

## Verificação

```bash
npm run lint
npm run build
npm test
npm run test:e2e
```

---

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

O backend é distribuído pela imagem definida em `backend/Dockerfile`. O fluxo
local com Compose e a arquitetura recomendada para Amazon ECR + ECS/Fargate
estão documentados no `README.md` da raiz. Segredos devem ser injetados em
runtime e nunca incorporados à imagem.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Auto-instrument your application with [NestJS Observer](https://observer.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
