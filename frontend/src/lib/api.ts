import { DEMO_SNAPSHOT_DATE, demoPlantEstimates } from "@/lib/mock-data";
import type {
  ClimateScenario,
  ClimateSource,
  ClimateFileInspection,
  Forecast15DaysRequest,
  Forecast15DaysResponse,
  ProcessScenarioResult,
  PwfExportRequest,
  PwfExportResult,
  PwfGenerationTarget,
  ReferencePwf,
  SystemCapabilities,
} from "@/types/climagrid";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

export const runtimeConfig = {
  apiBaseUrl,
  isDemoMode: !apiBaseUrl,
};

interface ProcessScenarioInput {
  source: ClimateSource;
  timestamp: string;
  resolutionMinutes: 30 | 60;
  file?: File;
  rowCount?: number;
  availability?: number;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  if (!apiBaseUrl) throw new Error("API não configurada.");

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }

  return response.json() as Promise<T>;
}

async function processScenario(input: ProcessScenarioInput): Promise<ProcessScenarioResult> {
  if (input.source === "upload") {
    if (!apiBaseUrl) throw new Error("O cenário climático exige a API do ClimaGrid.");
    if (!input.file) throw new Error("Selecione um arquivo CSV.");
    const formData = new FormData();
    formData.append("file", input.file);
    formData.append("timestamp", input.timestamp);
    const result = await requestJson<{scenario: ClimateScenario; observations: ProcessScenarioResult["estimates"]}>(
      "/climate-scenarios/file/estimate", { method: "POST", body: formData },
    );
    return { scenario: result.scenario, estimates: result.observations };
  }
  if (input.source === "era5") {
    if (!apiBaseUrl) throw new Error("O cenário ERA5 exige a API do ClimaGrid.");
    if (input.availability === undefined || input.availability < 0 || input.availability > 1) {
      throw new Error("Informe uma disponibilidade entre 0 e 1.");
    }
    type Era5Result = {
      scenario: ClimateScenario;
      observations: ProcessScenarioResult["estimates"];
    } | { status: "preparing"; message: string };
    const payload = JSON.stringify({
      timestamp: new Date(input.timestamp).toISOString(),
      availability: input.availability,
    });
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const result = await requestJson<Era5Result>("/climate-scenarios/era5/estimate", {
        method: "POST", body: payload,
      });
      if (!("status" in result)) {
        return { scenario: result.scenario, estimates: result.observations };
      }
      await new Promise((resolve) => window.setTimeout(resolve, 5000));
    }
    throw new Error("A coleta do ERA5 demorou mais de 20 minutos. Tente novamente; os arquivos já baixados serão reutilizados.");
  }
  if (!apiBaseUrl) {
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    const now = new Date().toISOString();
    const scenario: ClimateScenario = {
      id: `demo-${Date.now()}`,
      source: input.source,
      subsystem: "NE",
      mode: "replay",
      timestamp: input.timestamp,
      resolutionMinutes: input.resolutionMinutes,
      snapshotDate: input.source === "historical" ? DEMO_SNAPSHOT_DATE : undefined,
      fileName: input.file?.name,
      fileSizeBytes: input.file?.size,
      rowCount: input.rowCount,
      dataVersion: input.source === "historical" ? `demo-${DEMO_SNAPSHOT_DATE}` : input.file?.name,
      generationSource: "ONS_GERACAO_USINA_2_HO",
      weatherSource: "ERA5",
      createdAt: now,
    };

    return {
      scenario,
      estimates: demoPlantEstimates,
    };
  }

  type HistoricalResult = {
    scenario: ClimateScenario;
    observations: ProcessScenarioResult["estimates"];
  } | { status: "preparing"; message: string };
  const payload = JSON.stringify({
    subsystem: "NE",
    timestamp: new Date(input.timestamp).toISOString(),
    resolutionMinutes: input.resolutionMinutes,
  });
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const result = await requestJson<HistoricalResult>("/climate-scenarios/historical", {
      method: "POST", body: payload,
    });
    if (!("status" in result)) {
      return { scenario: result.scenario, estimates: result.observations };
    }
    await new Promise((resolve) => window.setTimeout(resolve, 5000));
  }
  throw new Error("A coleta histórica demorou mais de 20 minutos. Tente novamente; os arquivos já baixados serão reutilizados.");
}

async function inspectClimateFile(file: File): Promise<ClimateFileInspection> {
  if (!apiBaseUrl) throw new Error("O cenário climático exige a API do ClimaGrid.");
  const formData = new FormData();
  formData.append("file", file);
  return requestJson<ClimateFileInspection>("/climate-scenarios/file/inspect", {
    method: "POST", body: formData,
  });
}

async function exportPwf(request: PwfExportRequest): Promise<PwfExportResult> {
  if (!apiBaseUrl) {
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    const generatedAt = new Date().toISOString();
    const mappedPlants = Object.values(request.study.mappings).map((mapping) => {
      const plant = request.estimates.find((estimate) => estimate.id === mapping.plantId);
      return `${plant?.onsId ?? mapping.plantId};${mapping.busNumber};${mapping.generationMw}`;
    });
    const content = [
      "CLIMAGRID — ARQUIVO DEMONSTRATIVO SEM VALIDADE PARA O ANAREDE",
      "A geração PWF definitiva depende do backend e de um caso base validado.",
      `CENARIO;${request.study.name}`,
      `GERADO_EM;${generatedAt}`,
      "ID_ONS;BARRA;GERACAO_ESTIMADA_MW",
      ...mappedPlants,
    ].join("\n");

    return {
      blob: new Blob([content], { type: "text/plain;charset=utf-8" }),
      filename: "CLIMAGRID_DEMO_SEM_VALIDADE.pwf.txt",
      generatedAt,
      generationSource: request.climateScenario.mode === "replay" ? "observed" : "estimated",
      dataVersion: request.climateScenario.snapshotDate ?? request.climateScenario.fileName ?? "upload-local",
      isDemonstration: true,
    };
  }

  const response = await fetch(`${apiBaseUrl}/pwf/exports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scenarioId: request.climateScenario.id,
      studyName: request.study.name,
      referencePwfId: request.study.referencePwf?.id,
      generationSource: request.climateScenario.mode === "replay" ? "observed" : "estimated",
      dataVersion:
        request.climateScenario.dataVersion ??
        request.climateScenario.snapshotDate ??
        request.climateScenario.fileName ??
        "unknown",
      selectedPlantIds: request.selectedPlantIds,
      plants: Object.values(request.study.mappings).map((mapping) => {
        const estimate = request.estimates.find((item) => item.id === mapping.plantId);
        return {
          plantId: mapping.plantId,
          onsId: estimate?.onsId ?? mapping.plantId,
          generationMw: mapping.generationMw,
          mapping,
        };
      }),
    }),
  });

  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }

  const generatedAt = response.headers.get("x-generated-at") ?? new Date().toISOString();
  return {
    blob: await response.blob(),
    filename: response.headers.get("x-filename") ?? "climagrid-cenario.pwf",
    generatedAt,
    generationSource:
      response.headers.get("x-generation-source") === "estimated"
        ? "estimated"
        : "observed",
    dataVersion: response.headers.get("x-data-version") ?? "informada-pela-api",
    exportId: response.headers.get("x-export-id") ?? undefined,
    outputSha256: response.headers.get("x-output-sha256") ?? undefined,
    referenceSha256: response.headers.get("x-reference-sha256") ?? undefined,
    isDemonstration: false,
  };
}

async function responseErrorMessage(response: Response): Promise<string> {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { message?: string | string[]; detail?: string };
    if (parsed.detail) return parsed.detail;
    if (Array.isArray(parsed.message)) return parsed.message.join(" ");
    if (parsed.message) return parsed.message;
  } catch {
    // A API pode responder texto simples em falhas de infraestrutura.
  }
  return body || `A API respondeu com status ${response.status}.`;
}

async function uploadReferencePwf(file: File): Promise<ReferencePwf> {
  if (!apiBaseUrl) {
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    return {
      id: `demo-pwf-${Date.now()}`,
      name: file.name,
      sizeBytes: file.size,
      uploadedAt: new Date().toISOString(),
      status: "valid",
      anaredeVersion: "não analisada no modo demonstração",
      compatibility: "unverified",
      warnings: ["O modo demonstração não envia nem interpreta os bytes do PWF."],
    };
  }

  const formData = new FormData();
  formData.append("file", file);
  return requestJson<ReferencePwf>("/pwf/reference-cases", {
    method: "POST",
    body: formData,
  });
}

async function getPwfGenerationTargets(referencePwfId: string): Promise<PwfGenerationTarget[]> {
  const result = await requestJson<{ items: PwfGenerationTarget[] }>(
    `/pwf/reference-cases/${referencePwfId}/generation-targets`,
  );
  return result.items;
}

async function getCapabilities(): Promise<SystemCapabilities> {
  if (!apiBaseUrl) {
    return {
      backend: { available: false },
      pwf: { upload: false, generationTargets: false, export: false },
      aiService: { available: false },
      climate: {
        historicalReplay: false,
        historicalOnDemand: false,
        historicalEstimates: false,
        fileUpload: false,
        era5Scenario: false,
      },
      model: null,
      data: null,
    };
  }
  return requestJson<SystemCapabilities>("/system/capabilities");
}

async function get15DayForecast(request: Forecast15DaysRequest): Promise<Forecast15DaysResponse> {
  if (!apiBaseUrl) {
    throw new Error("A funcionalidade de previsão 15 dias exige o backend conectado.");
  }
  return requestJson<Forecast15DaysResponse>("/previsao-15-dias", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export const climagridApi = {
  processScenario,
  inspectClimateFile,
  uploadReferencePwf,
  getPwfGenerationTargets,
  getCapabilities,
  exportPwf,
  get15DayForecast,
};
