import { DEMO_SNAPSHOT_DATE, demoPlantEstimates } from "@/lib/mock-data";
import type {
  ClimateScenario,
  ClimateSource,
  ProcessScenarioResult,
  PwfExportRequest,
  PwfExportResult,
  PwfGenerationTarget,
  ReferencePwf,
} from "@/types/climagrid";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

export const runtimeConfig = {
  apiBaseUrl,
  isDemoMode: !apiBaseUrl,
};

interface ProcessScenarioInput {
  source: ClimateSource;
  startAt: string;
  endAt: string;
  resolutionMinutes: 30 | 60;
  file?: File;
  rowCount?: number;
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
    const body = await response.text();
    let message = body;
    try {
      const parsed = JSON.parse(body) as { message?: string | string[] };
      message = Array.isArray(parsed.message) ? parsed.message.join(" ") : parsed.message ?? body;
    } catch {
      // A API pode responder texto simples em falhas de infraestrutura.
    }
    throw new Error(message || `A API respondeu com status ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

async function processScenario(input: ProcessScenarioInput): Promise<ProcessScenarioResult> {
  if (!apiBaseUrl) {
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    const now = new Date().toISOString();
    const scenario: ClimateScenario = {
      id: `demo-${Date.now()}`,
      source: input.source,
      subsystem: "NE",
      startAt: input.startAt,
      endAt: input.endAt,
      resolutionMinutes: input.resolutionMinutes,
      snapshotDate: input.source === "historical" ? DEMO_SNAPSHOT_DATE : undefined,
      fileName: input.file?.name,
      fileSizeBytes: input.file?.size,
      rowCount: input.rowCount,
      createdAt: now,
    };

    return {
      scenario,
      estimates: demoPlantEstimates,
    };
  }

  let scenario: ClimateScenario;

  if (input.source === "upload" && input.file) {
    const formData = new FormData();
    formData.append("file", input.file);
    formData.append("subsystem", "NE");
    formData.append("resolutionMinutes", String(input.resolutionMinutes));
    scenario = await requestJson<ClimateScenario>("/climate-scenarios/upload", {
      method: "POST",
      body: formData,
    });
  } else {
    scenario = await requestJson<ClimateScenario>("/climate-scenarios/historical", {
      method: "POST",
      body: JSON.stringify({
        subsystem: "NE",
        startAt: input.startAt,
        endAt: input.endAt,
        resolutionMinutes: input.resolutionMinutes,
      }),
    });
  }

  const estimates = await requestJson<ProcessScenarioResult["estimates"]>(
    "/generation/estimates",
    {
      method: "POST",
      body: JSON.stringify({ scenarioId: scenario.id }),
    },
  );

  return { scenario, estimates };
}

async function exportPwf(request: PwfExportRequest): Promise<PwfExportResult> {
  if (!apiBaseUrl) {
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    const generatedAt = new Date().toISOString();
    const mappedPlants = request.selectedPlantIds.map((plantId) => {
      const plant = request.estimates.find((estimate) => estimate.id === plantId);
      const mapping = request.study.mappings[plantId];
      return `${plant?.onsId ?? plantId};${mapping?.busNumber ?? ""};${plant?.estimatedGenerationMw ?? 0}`;
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
      modelVersion: "mock-local-v1",
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
      referencePwfName: request.study.referencePwf?.name,
      mappings: Object.values(request.study.mappings),
      selectedPlantIds: request.selectedPlantIds,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Não foi possível gerar o arquivo PWF.");
  }

  const generatedAt = response.headers.get("x-generated-at") ?? new Date().toISOString();
  return {
    blob: await response.blob(),
    filename: response.headers.get("x-filename") ?? "climagrid-cenario.pwf",
    generatedAt,
    modelVersion: response.headers.get("x-model-version") ?? "informado-pela-api",
    dataVersion: response.headers.get("x-data-version") ?? "informada-pela-api",
    isDemonstration: false,
  };
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

export const climagridApi = {
  processScenario,
  uploadReferencePwf,
  getPwfGenerationTargets,
  exportPwf,
};
