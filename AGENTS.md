# ClimaGrid — contexto obrigatório para agentes

Antes de propor ou implementar mudanças, leia:

1. `Docs/CONTEXTO_PROJETO_IA.md` — fonte canônica de escopo, estado e roadmap;
2. `README.md` — execução local e arquitetura;
3. o README do componente afetado (`frontend/`, `backend/` ou
   `backend/ai-service/`).

Documentos de ideação e guias antigos em `Docs/` podem descrever propostas que
ainda não existem. Em caso de conflito, prevalece
`Docs/CONTEXTO_PROJETO_IA.md`.

## Roadmap oficial

1. **Replay histórico — implementado.** Recupera geração horária observada da
   ONS e vento ERA5 do mesmo instante, distribui a geração pelas barras e exporta
   um PWF. Não usa previsão de IA.
2. **Cenário climático do usuário — próximo e limite do MVP.** O usuário envia
   clima próprio, escolhe uma hora do arquivo, o sistema estima a geração e gera
   um PWF para essa hora.
3. **Data futura — pós-MVP.** O usuário escolhe uma hora futura e o sistema gera
   uma estimativa e um PWF. ERA5 não é previsão futura; a implementação precisa
   declarar se usa previsão meteorológica, climatologia ou cenário probabilístico.
4. **Curtailment — por último e fora do MVP.** Modelagem de risco/montante/causa
   de restrição, separada da estimativa bruta de geração pelo vento.

Não antecipe as etapas 3 ou 4 enquanto a etapa 2 não estiver operacional e
validada. Não descreva geração observada como estimada, nem cenário como
previsão.

## Estado verificável

- O snapshot operacional atual cobre janeiro de 2024: 741 instantes, até 124
  conjuntos por hora e 91.092 observações unidas.
- O PWF de referência de 2040 foi validado estruturalmente: todas as 789
  alocações do instante de teste encontraram barra, foram consolidadas em 280
  barras e somente os campos `Pg` mudaram.
- Há cobertura parcial de cadastro para alguns conjuntos; avisos não devem ser
  removidos ou convertidos silenciosamente em sucesso.
- Dados brutos/processados são locais e ignorados pelo Git. Código disponível
  não significa que todos os meses já foram baixados.

## Regras de domínio

- Geração do replay: `GERACAO_USINA-2_HO` da ONS.
- Clima histórico: ERA5 horário, associado por coordenadas SIGA/ANEEL.
- Chave de conciliação: CEG; nomes são apenas informativos.
- Um conjunto ONS pode corresponder a várias usinas e barras.
- O PWF representa um instante. Períodos produzem uma coleção de instantes/PWFs,
  não um único PWF temporal.
- O writer deve preservar tamanho, codificação, finais de linha e todos os
  campos fora do `Pg` das barras selecionadas, inclusive `DGER`/`DGEI`.
- O ANAREDE continua responsável pelo fluxo de potência; o ClimaGrid não deve
  afirmar convergência elétrica sem executar e validar o caso no ANAREDE.

## Verificação mínima

- Python: `python -m pytest -q` em `backend/ai-service`;
- NestJS: `npm run lint && npm test && npm run test:e2e && npm run build`;
- Next.js: leia antes as regras em `frontend/AGENTS.md`, depois execute
  `npm run lint && npm run build`;
- integração: `GET /system/capabilities` e um replay/exportação real.

