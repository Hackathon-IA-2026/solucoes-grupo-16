"use client";

import React, { useState } from "react";
import { climagridApi } from "@/lib/api";
import { Forecast15DaysRequest, Forecast15DaysResponse } from "@/types/climagrid";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function PrevisaoPage() {
  const [formData, setFormData] = useState<Forecast15DaysRequest>({
    usina_id: "parque-eolica-demo",
    latitude: -5.5,
    longitude: -37.0,
    capacidade_instalada_mw: 100,
    disponibilidade: 0.95,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<Forecast15DaysResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const data = await climagridApi.get15DayForecast({
        ...formData,
        latitude: Number(formData.latitude),
        longitude: Number(formData.longitude),
        capacidade_instalada_mw: Number(formData.capacidade_instalada_mw),
        disponibilidade: Number(formData.disponibilidade),
      });
      setResponse(data);
    } catch (err: any) {
      setError(err.message || "Ocorreu um erro ao buscar a previsão.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Formatador para o eixo X do gráfico (ex: "27/09 06:00")
  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Previsão 15 Dias (Fase 2)</h1>
          <p className="mt-2 text-gray-600">
            Previsão de geração horária projetada para as próximas duas semanas no mercado de curto prazo, baseada em dados meteorológicos do Open-Meteo GFS e IA.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ID da Usina</label>
              <input
                type="text"
                name="usina_id"
                value={formData.usina_id}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
              <input
                type="number"
                step="any"
                name="latitude"
                value={formData.latitude}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
              <input
                type="number"
                step="any"
                name="longitude"
                value={formData.longitude}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Capacidade (MW)</label>
              <input
                type="number"
                step="any"
                name="capacidade_instalada_mw"
                value={formData.capacidade_instalada_mw}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Disponibilidade</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                name="disponibilidade"
                value={formData.disponibilidade}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <div className="md:col-span-5 flex justify-end mt-4">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Calculando..." : "Gerar Previsão"}
              </button>
            </div>
          </form>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {response && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <p className="text-sm text-gray-500 font-medium">Usina Selecionada</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{response.usina_id}</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <p className="text-sm text-gray-500 font-medium">Horizonte da Previsão</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{response.horizon_hours} horas</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <p className="text-sm text-gray-500 font-medium">Fonte de Dados</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{response.data_source}</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <p className="text-sm text-gray-500 font-medium">Escopo do Modelo</p>
                <p className="text-xl font-bold text-gray-900 mt-1">
                  {response.model_scope === "physical_fallback" ? "Curva Física" : response.model_scope}
                </p>
              </div>
            </div>

            {response.warnings.length > 0 && (
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
                <h3 className="text-yellow-800 font-medium text-sm uppercase tracking-wider mb-2">Avisos do Motor:</h3>
                <ul className="list-disc list-inside text-yellow-700 text-sm space-y-1">
                  {response.warnings.map((warn, i) => (
                    <li key={i}>{warn}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-6">Projeção de Geração (MW)</h2>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={response.predicoes}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis 
                      dataKey="timestamp_utc" 
                      tickFormatter={formatDate}
                      tick={{ fontSize: 12, fill: "#6B7280" }}
                      minTickGap={30}
                    />
                    <YAxis 
                      tick={{ fontSize: 12, fill: "#6B7280" }}
                      domain={[0, 'dataMax + 10']}
                      label={{ value: 'Potência (MW)', angle: -90, position: 'insideLeft', style: { fill: '#374151' } }}
                    />
                    <Tooltip 
                      labelFormatter={(label) => formatDate(label as string)}
                      formatter={(value: any) => [`${Number(value).toFixed(2)} MW`, '']}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    />
                    <Legend verticalAlign="top" height={36}/>
                    <Line 
                      type="monotone" 
                      dataKey="baseline_mw" 
                      name="Fallback Físico (Baseline)" 
                      stroke="#9CA3AF" 
                      strokeDasharray="5 5"
                      dot={false}
                      strokeWidth={2}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="geracao_estimada_mw" 
                      name="Geração Estimada (IA/Híbrida)" 
                      stroke="#2563EB" 
                      dot={false}
                      strokeWidth={3}
                      activeDot={{ r: 6, fill: "#2563EB" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
