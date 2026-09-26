# Relatório de Análise: Código vs Documentação Técnica

Este relatório destaca as discrepâncias e omissões encontradas ao comparar o código-fonte atual do projeto ClimaGrid com o documento `Docs/DOCUMENTACAO_TECNICA_COMPLETA_CLIMAGRID.md`.

## 1. Frameworks e Bibliotecas Omitidos

A documentação atual menciona superficialmente as tecnologias principais (Next.js, NestJS, FastAPI), mas omite dependências cruciais que ditam a arquitetura e manutenção do sistema.

### Frontend
- **Tailwind CSS v4:** Não está documentado. O sistema de design e estilização depende inteiramente dele (visto no `package.json` e `globals.css`).
- **React 19:** Embora implícito pelo uso do Next.js, a versão 19 tem particularidades importantes (como o React Compiler ativado via `babel-plugin-react-compiler`) que deveriam constar na documentação de arquitetura.

### Backend
- **Vitest:** A documentação não menciona que o framework de testes unitários e end-to-end (e2e) adotado para o NestJS é o Vitest, não o Jest padrão.

### AI Service (Python)
- **Bibliotecas de Machine Learning e Dados:** O `requirements.txt` contém bibliotecas pesadas de IA que não foram listadas: `lightgbm`, `scikit-learn`, `pandas`, `numpy`, `xarray` e `netCDF4`.

---

## 2. Features e Módulos Não Citados

### Pipeline de Treinamento ML (`backend/ai-service/training/`)
A documentação diz o seguinte: *"A estimativa atual não é um modelo de machine learning aprovado para previsão. O que existe hoje é uma curva física genérica..."*. 
No entanto, ela **omite completamente a existência de toda uma infraestrutura de treinamento de Machine Learning já presente no código**.
O diretório de treinamento inclui:
- `train.py`: Lógica para treinar modelos.
- `evaluate.py`: Avaliação de quantis e intervalos de erro.
- `build_dataset.py` e `features.py`: Preparação de features do modelo.

### Arquitetura Híbrida do `predictor.py`
O arquivo `app/predictor.py` não calcula apenas a curva física genérica. Na verdade, ele implementa uma **arquitetura híbrida de ML + Física**.
Ele tenta carregar um modelo LightGBM (`model.txt`) e metadados (`metadata.json`). Se o modelo estiver marcado como `"approved": true` e a entrada estiver dentro do domínio, ele calcula a correção baseada em Machine Learning usando o LightGBM, aplicando a curva física apenas como *fallback* (ou restrição de limites físicos). A documentação super simplifica isso e não detalha essa arquitetura condicional híbrida presente no sistema hoje.

---

## 3. Pendências Existentes no Sistema (Roadmap Implícito vs Código)

Embora não existam marcações tradicionais de `TODO` ou `FIXME` no código (o que indica uma boa limpeza de código), existem pendências claras que cruzam a arquitetura:

1. **Aprovação do Modelo Híbrido (ML):** 
   A validação e aprovação do modelo ML (mudar a flag `approved` nos metadados gerados pelo pipeline de treinamento) é a maior pendência técnica do AI Service. Hoje o código já tem a estrutura, mas roda em modo fallback forçado. A transição para usar a correção de IA é uma pendência que não consta claramente no fluxo.
2. **Integração Real NetCDF/GRIB:**
   A documentação diz que "upload direto de NetCDF/GRIB não é aceito". Porém, o AI Service já possui as bibliotecas `xarray` e `netCDF4` instaladas, indicando um trabalho pendente (ou iniciado) para manipular esses formatos pesados de grade de vento internamente, possivelmente no pipeline de extração de características.

## Conclusão e Recomendação
O documento deve ser atualizado para refletir a complexidade real da base de código, que já é muito superior ao descrito. O submódulo de ML e as bibliotecas utilizadas precisam ser explicitados no documento técnico para manter a fidedignidade com o projeto atual.
