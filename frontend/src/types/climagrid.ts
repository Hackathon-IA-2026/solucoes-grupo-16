export type ClimateSource = "historical" | "upload";

export type CurtailmentReason = "REL" | "CNF" | "ENE" | "PAR" | "NONE";

export type RiskLevel = "low" | "medium" | "high";

export interface ClimateScenario {
  id: string;
  source: ClimateSource;
  subsystem: "NE";
  startAt: string;
  endAt: string;
  resolutionMinutes: 30 | 60;
  snapshotDate?: string;
  fileName?: string;
  fileSizeBytes?: number;
  rowCount?: number;
  createdAt: string;
}

export interface WindPlantEstimate {
  id: string;
  onsId: string;
  name: string;
  state: "BA" | "CE" | "PE" | "PI" | "RN";
  latitude: number;
  longitude: number;
  installedCapacityMw: number;
  estimatedGenerationMw: number;
  confidenceLowMw: number;
  confidenceHighMw: number;
  confidencePercent: number;
  historicalAvailabilityPercent: number;
  historicalCurtailmentPercent: number;
  probableReason: CurtailmentReason;
  riskLevel: RiskLevel;
}

export interface PlantBusMapping {
  plantId: string;
  busNumber: string;
  busName: string;
  nominalVoltageKv: string;
  area: string;
}

export interface ReferencePwf {
  id?: string;
  name: string;
  sizeBytes: number;
  uploadedAt: string;
  status?: "valid";
  sha256?: string;
  anaredeVersion?: string;
  compatibility?: "supported" | "unverified";
  encoding?: "latin1";
  lineEnding?: "CRLF" | "LF" | "MIXED" | "NONE";
  title?: string;
  studyYear?: number;
  busCount?: number;
  generatorBusCount?: number;
  generatorGroupCount?: number;
  blocks?: string[];
  warnings?: string[];
}

export interface PwfGeneratorGroup {
  busNumber: number;
  groupNumber: number;
  automaticMode: boolean;
  status: "on" | "off";
  units: number;
  unitsOnline: number;
  activeGenerationPerUnitMw: number;
  mechanicalLimitPerUnitMw?: number;
  activeMinimumPerUnitMw?: number;
}

export interface PwfGenerationTarget {
  kind: "bus";
  busNumber: number;
  busName: string;
  busType: 0 | 1 | 2 | 3;
  area?: number;
  baseVoltageKv?: number;
  activeGenerationMw: number;
  activeGenerationMinimumMw?: number;
  activeGenerationMaximumMw?: number;
  editable: boolean;
  generatorGroups: PwfGeneratorGroup[];
}

export interface StudyDraft {
  name: string;
  referencePwf: ReferencePwf | null;
  mappings: Record<string, PlantBusMapping>;
}

export interface ClimaGridState {
  climateScenario: ClimateScenario | null;
  estimates: WindPlantEstimate[];
  selectedPlantIds: string[];
  study: StudyDraft;
}

export interface FileValidationIssue {
  row?: number;
  field?: string;
  message: string;
}

export interface FileValidationResult {
  status: "idle" | "validating" | "valid" | "invalid" | "pending-backend";
  fileName?: string;
  rowCount?: number;
  startAt?: string;
  endAt?: string;
  delimiter?: "," | ";";
  issues: FileValidationIssue[];
}

export interface ProcessScenarioResult {
  scenario: ClimateScenario;
  estimates: WindPlantEstimate[];
}

export interface PwfExportRequest {
  climateScenario: ClimateScenario;
  estimates: WindPlantEstimate[];
  selectedPlantIds: string[];
  study: StudyDraft;
}

export interface PwfExportResult {
  blob: Blob;
  filename: string;
  generatedAt: string;
  modelVersion: string;
  dataVersion: string;
  isDemonstration: boolean;
}
