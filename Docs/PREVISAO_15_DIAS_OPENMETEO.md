# Integração de Previsão de 15 Dias (Open-Meteo GFS)

## 📌 Visão Geral
Foi implementada a **Fase 2** do projeto ClimaGrid, adicionando a capacidade de estimar a geração eólica para os próximos 15 dias no mercado de curto prazo. 

A solução utiliza a API gratuita do **Open-Meteo** (baseada no modelo global GFS da NOAA) para obter a previsão meteorológica futura. Esses dados são convertidos dinamicamente e submetidos ao nosso modelo de inteligência artificial (treinado com dados da reanálise ERA5) para gerar a previsão de potência (MW) hora a hora.

---

## 🛠️ O que foi implementado

1. **Cliente Open-Meteo (`backend/ai-service/app/open_meteo_client.py`)**:
   - Faz o request HTTP para a API do Open-Meteo resgatando `temperature_2m`, `surface_pressure`, `wind_speed_100m` e `wind_direction_100m`.
   - Requisita 1 dia de histórico (`past_days=1`) para montar a **janela de contexto** que o modelo necessita (ex: calcular a média móvel de 3h e 6h do vento) e 16 dias para o futuro (`forecast_days=16`).
   - Aplica as conversões físicas necessárias: converte Vento e Direção para vetores `u100` e `v100`, temperatura para Kelvin e pressão para Pascal, mantendo a compatibilidade estrita com o formato do ERA5.

2. **Novos Schemas (`backend/ai-service/app/schemas.py`)**:
   - `Previsao15DiasRequest`: Contrato simplificado que pede apenas coordenadas geográficas, ID da usina e sua capacidade/disponibilidade.
   - `Previsao15DiasResponse`: Retorna o _horizon_hours_ (total de horas de previsão) e uma lista com as projeções geradas, além de registrar alertas de _fallback_ caso a usina esteja fora do domínio de treino.

3. **Novo Endpoint (`backend/ai-service/app/main.py`)**:
   - `POST /previsao-15-dias`: Orquestra todo o fluxo. Busca a previsão, converte os dados, preenche a requisição no formato interno `EstimationRequest`, aciona a inferência de IA e filtra a resposta final para exibir apenas as horas futuras (removendo os `past_days` usados apenas para contexto).

---

## 🚀 Como Testar e Usar no Backend

Com o backend rodando (`cd backend/ai-service && uvicorn app.main:app --reload`), você pode testar o endpoint via linha de comando ou no Swagger (`http://localhost:8000/docs`).

**Exemplo via cURL:**
```bash
curl -X POST http://localhost:8000/previsao-15-dias \
  -H "Content-Type: application/json" \
  -d '{
    "usina_id": "test-nordeste",
    "latitude": -5.5,
    "longitude": -37.0,
    "capacidade_instalada_mw": 100.0,
    "disponibilidade": 0.95
  }'
```

**Retorno Esperado:**
Você receberá um JSON com a projeção das próximas ~373 horas, incluindo a geração base (`baseline_mw`) e a projeção com a inteligência artificial (`geracao_estimada_mw`).

---

## 💻 Já consigo testar isso no Frontend?

**Ainda não.** 

A implementação atual abrange o **motor inteligente no backend**, mas o frontend ainda não está consumindo essa nova rota.

### O que falta implementar no Frontend:
1. **Integração na API Client**: É preciso adicionar a chamada `POST /previsao-15-dias` no arquivo de serviços do frontend (provavelmente onde ficam os _fetches_ da aplicação).
2. **Nova Tela/Componente de "Operação" ou "Mercado"**: Hoje o frontend foca no upload de cenários (arquivos CSV) para planejamento. Você precisará criar uma interface onde o usuário informe (ou selecione num mapa/lista):
   - A usina desejada.
   - Sua latitude, longitude, e capacidade instalada.
   - Um botão "Prever Próximos 15 Dias".
3. **Visualização**: Plotar a série temporal retornada (o array de `predicoes`) em um gráfico contínuo, mostrando as tendências de alta ou baixa geração para os próximos dias, essencial para as decisões de manutenção ou _trading_ de energia.

Se quiser, posso te ajudar a construir o serviço de integração no React/Next.js e o componente de gráfico para conectarmos as duas pontas!
