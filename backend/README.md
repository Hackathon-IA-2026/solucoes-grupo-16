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

```http
GET /pwf/reference-cases/:id
GET /pwf/reference-cases/:id/generation-targets
POST /pwf/exports
```

O parser suporta estruturalmente `TITU`, `DBAR`, `DGBT`, `DGER` e `DGEI`. A
versão homologada nesta etapa é ANAREDE 12.03.04. Outras versões podem ser
interpretadas, mas são devolvidas como `unverified`.

`POST /pwf/exports` recebe as parcelas de geração observada e o de-para de
barras. Parcelas destinadas à mesma barra são somadas. O writer copia o caso
original e altera somente o campo de geração ativa (`Pg`) do registro `DBAR`;
barras inexistentes, desligadas, swing, valores acima do limite ou que não
cabem no campo fixo são rejeitados. Os blocos `DGER` e `DGEI` são preservados.

## Integração com o serviço de IA

Configure `AI_SERVICE_URL` (padrão `http://127.0.0.1:8000`) e use:

```http
GET /system/capabilities
POST /climate-scenarios/historical
POST /climate-scenarios/file/inspect
POST /climate-scenarios/file/estimate
GET /climate-scenarios/:id
```

A rota de capacidades diferencia backend configurado, serviço de IA online,
catálogo, ONS bruto, partições ERA5 e snapshot observado. O replay só é
liberado quando `data/processed/historical/observations.parquet` existe; a API
responde `409` com instrução objetiva enquanto o insumo estiver ausente.

As rotas `file/inspect` e `file/estimate` aceitam o CSV climático normalizado
`normalized-ons-hourly-v1`, não ERA5 NetCDF/GRIB nativo. A estimativa atual usa
a curva física genérica. Cada estimativa persiste o CSV e um manifesto com
hashes, versões, observações e avisos. Na exportação estimada, o backend busca o
cenário pelo `scenarioId`, recalcula a geração por barra e rejeita dados
adulterados, alocações incompletas e cobertura cadastral parcial.

Cada exportação persiste o PWF final e outro manifesto com o PWF base, seleção,
alocações, barras modificadas e hashes. `GET /climate-scenarios/:id` recupera a
trilha e verifica os arquivos armazenados. Por padrão, esses dados ficam em
`data/scenarios`; `SCENARIO_STORAGE_ROOT` permite trocar o diretório. No
Compose, `/app/data/scenarios` pertence ao volume `backend-data`.

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
