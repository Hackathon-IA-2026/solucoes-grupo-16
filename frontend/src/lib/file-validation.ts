import type { FileValidationResult } from "@/types/climagrid";

const REQUIRED_COLUMNS = [
  "timestamp",
  "latitude",
  "longitude",
  "velocidade_vento_100m",
  "direcao_vento",
] as const;

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

function parseNumber(value: string) {
  return Number(value.trim().replace(",", "."));
}

export async function validateClimateFile(file: File): Promise<FileValidationResult> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      status: "invalid",
      fileName: file.name,
      issues: [{ message: "O arquivo excede o limite de 25 MB." }],
    };
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "csv" && extension !== "xlsx") {
    return {
      status: "invalid",
      fileName: file.name,
      issues: [{ message: "Formato não suportado. Use CSV ou XLSX." }],
    };
  }

  if (extension === "xlsx") {
    return {
      status: "pending-backend",
      fileName: file.name,
      issues: [
        {
          message:
            "O arquivo XLSX foi aceito, mas a validação das planilhas será concluída pela API de ingestão.",
        },
      ],
    };
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return {
      status: "invalid",
      fileName: file.name,
      issues: [{ message: "O CSV precisa conter cabeçalho e pelo menos uma linha de dados." }],
    };
  }

  const delimiter = lines[0].split(";").length > lines[0].split(",").length ? ";" : ",";
  const headers = lines[0].split(delimiter).map((header) => header.trim().toLowerCase());
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));

  if (missingColumns.length > 0) {
    return {
      status: "invalid",
      fileName: file.name,
      delimiter,
      issues: [
        {
          message: `Colunas obrigatórias ausentes: ${missingColumns.join(", ")}.`,
        },
      ],
    };
  }

  const issues: FileValidationResult["issues"] = [];
  const indexes = Object.fromEntries(headers.map((header, index) => [header, index]));
  const timestamps: number[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const values = lines[index].split(delimiter);
    const row = index + 1;
    const windSpeed = parseNumber(values[indexes.velocidade_vento_100m] ?? "");
    const windDirection = parseNumber(values[indexes.direcao_vento] ?? "");
    const latitude = parseNumber(values[indexes.latitude] ?? "");
    const longitude = parseNumber(values[indexes.longitude] ?? "");
    const timestamp = values[indexes.timestamp]?.trim();

    if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
      issues.push({ row, field: "timestamp", message: "Data/hora inválida; use ISO 8601." });
    } else {
      timestamps.push(Date.parse(timestamp));
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      issues.push({ row, field: "latitude", message: "Latitude fora do intervalo -90 a 90." });
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      issues.push({ row, field: "longitude", message: "Longitude fora do intervalo -180 a 180." });
    }
    if (!Number.isFinite(windSpeed) || windSpeed < 0 || windSpeed > 50) {
      issues.push({
        row,
        field: "velocidade_vento_100m",
        message: "Velocidade do vento deve estar entre 0 e 50 m/s.",
      });
    }
    if (!Number.isFinite(windDirection) || windDirection < 0 || windDirection > 360) {
      issues.push({
        row,
        field: "direcao_vento",
        message: "Direção do vento deve estar entre 0° e 360°.",
      });
    }

    if (issues.length >= 20) break;
  }

  return {
    status: issues.length === 0 ? "valid" : "invalid",
    fileName: file.name,
    rowCount: lines.length - 1,
    startAt: timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : undefined,
    endAt: timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : undefined,
    delimiter,
    issues,
  };
}

export const climateFileSchema = {
  required: REQUIRED_COLUMNS,
  optional: ["densidade_ar", "temperatura", "pressao_superficie"],
};
