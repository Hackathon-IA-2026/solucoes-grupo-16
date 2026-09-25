# Guia da interface web

> Este guia descreve o que está disponível agora. O contexto canônico e o
> roadmap estão em [`CONTEXTO_PROJETO_IA.md`](CONTEXTO_PROJETO_IA.md).

## O que funciona hoje: replay histórico

A tela principal permite escolher uma data e uma hora que já estejam presentes
no snapshot histórico. O sistema consulta a geração observada das usinas eólicas
do Nordeste naquele instante e mostra os valores encontrados.

O usuário então envia um caso-base `.pwf`. O sistema aplica o mapeamento
usina–barra já validado, altera somente a potência ativa `Pg` das barras
alcançadas e disponibiliza um novo PWF para download. O restante do arquivo é
preservado para uso no ANAREDE.

O período realmente disponível deve ser lido em `GET /capabilities`; ele não
deve ser presumido ou fixado na interface. No conjunto atual, o replay cobre
janeiro de 2024.

## Fluxo atual da tela

1. Escolher um instante histórico disponível.
2. Consultar a geração observada e revisar as usinas retornadas.
3. Enviar o caso-base PWF.
4. Gerar e baixar o PWF com os valores daquele instante.

Não há, na etapa atual, previsão por IA, faixa de incerteza, sinal de risco ou
classificação de curtailment. A geração exibida no replay é observada, não
estimada.

## Próximas etapas

### Etapa 2 — cenário climático próprio e fim do MVP

O usuário enviará um arquivo climático. O sistema validará seu formato,
relacionará os dados às usinas, calculará a geração estimada e produzirá um PWF
do instante escolhido. Esta funcionalidade ainda não está implementada.

### Etapa 3 — previsão futura

O usuário escolherá uma data e hora futuras. Um modelo e uma fonte meteorológica
apropriada calcularão a geração prevista e o sistema produzirá o PWF daquele
instante. ERA5 é reanálise histórica e, sozinho, não fornece o clima de uma data
futura.

### Etapa 4 — curtailment

Risco, causa provável e análise de corte de geração pertencem à última etapa e
ficam fora do MVP definido nas etapas 1 e 2.

## Regras de apresentação

- usar “geração observada” no replay histórico;
- usar “geração estimada” somente no cenário climático próprio;
- usar “geração prevista” somente na etapa futura;
- não exibir funcionalidades planejadas como se estivessem operacionais;
- mostrar avisos claros quando um instante não pertence ao período ingerido ou
  quando uma usina não possui mapeamento elétrico válido.
