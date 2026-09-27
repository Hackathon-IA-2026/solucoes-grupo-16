export type ClimateSource = "historical" | "upload" | "era5";

export interface ClimateScenario {
  id: string;
  source: ClimateSource;
  mode: "replay" | "scenario" | "forecast";
  subsystem: "NE";
  timestamp: string;
  resolutionMinutes: 30 | 60;
  snapshotDate?: string;
  fileName?: string;
  fileSizeBytes?: number;
  rowCount?: number;
  dataVersion?: string;
  generationSource: "ONS_GERACAO_USINA_2_HO" | "PHYSICAL_CURVE" | "MODEL";
  weatherSource: "ERA5" | "USER";
  warnings?: string[];
  createdAt: string;
  traceability?: {
    schemaVersion: string;
    inputSha256: string;
    catalogSha256: string;
    mappingSha256: string | null;
    estimatorVersion: string;
    weatherDataVersion?: string;
    era5Sha256?: string;
    availabilitySource?: "USER_FILE" | "USER_GLOBAL_ASSUMPTION";
    availabilityValue?: number;
    excludedPlantIds?: string[];
    catalogCoveragePercent?: number;
  };
}

export interface WindPlantEstimate {
  id: string;
  onsId: string;
  name: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  installedCapacityMw: number;
  observedGenerationMw: number | null;
  capacityFactorPercent: number | null;
  u100: number;
  v100: number;
  windSpeedMps: number;
  windDirectionDegrees: number;
  generationSource: "ONS_GERACAO_USINA_2_HO" | "PHYSICAL_CURVE" | "MODEL";
  weatherSource: "ERA5" | "USER";
  suggestedBusAllocations: SuggestedBusAllocation[];
  mappingCoveragePercent: number;
  estimatedGenerationMw: number | null;
  availability?: number;
  warnings?: string[];
}

export interface SuggestedBusAllocation {
  busNumber: string;
  busName: string;
  allocationFactor: number;
  allocatedGenerationMw: number;
}

export interface PlantBusMapping {
  plantId: string;
  allocationId: string;
  allocationFactor: number;
  generationMw: number;
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
  generationTargets: PwfGenerationTarget[];
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

export interface ClimateFileInspection {
  rowCount: number;
  plantCount: number;
  timestamps: string[];
  sha256: string;
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
  generationSource: "observed" | "estimated";
  dataVersion: string;
  exportId?: string;
  outputSha256?: string;
  referenceSha256?: string;
  isDemonstration: boolean;
}

export interface SystemCapabilities {
  backend: { available: boolean };
  pwf: { upload: boolean; generationTargets: boolean; export: boolean };
  aiService: { available: boolean };
  climate: {
    historicalReplay: boolean;
    historicalOnDemand?: boolean;
    historicalEstimates: boolean;
    fileUpload: boolean;
    era5Scenario?: boolean;
    experimentalInsights?: boolean;
  };
  model: {
    version: string;
    scope: string;
    approved: boolean;
    physicalFallback: boolean;
  } | null;
  data: {
    plantCatalog: boolean;
    onsRaw: boolean;
    era5Processed: boolean;
    era5PartitionCount: number;
    joinedSnapshot: boolean;
    snapshotDate: string | null;
    historicalFirstTimestamp: string | null;
    historicalLastTimestamp: string | null;
    historicalLatestTimestamp: string | null;
    historicalInstantCount: number;
  } | null;
}

export interface ExperimentalMetric {
  mae_mw: number;
  rmse_mw: number;
  nmae_cf: number;
  wape: number | null;
  bias_mw: number;
  bias_normalized: number;
  p95_abs_error_mw: number;
  p95_abs_error_normalized: number;
  rows: number;
  mae_gain_vs_physical?: number | null;
  mae_gain_vs_lightgbm?: number | null;
  target_total_mwh?: number;
  prediction_total_mwh?: number;
  signed_total_error_fraction?: number | null;
}

export interface IndependentHoldoutModelResult {
  plant_hour: ExperimentalMetric;
  hourly_total: ExperimentalMetric;
}

export interface IndependentHoldoutCohort {
  rows: number;
  hours: number;
  plants: number;
  models: {
    physical: IndependentHoldoutModelResult;
    lightgbm: IndependentHoldoutModelResult;
    dml_operational: IndependentHoldoutModelResult;
  };
}

export interface IndependentHoldoutInsights {
  schema_version: "climagrid-independent-month-holdout-v1";
  status: "exploratory_independent_holdout_consumed";
  scientifically_approved: false;
  separation: {
    gap_hours: number;
    purged_development_rows: number;
    overlapping_keys: number;
    holdout_used_for_training: false;
    development_used: { start_utc: string; end_utc: string; rows: number; hours: number; plants: number };
    holdout: { start_utc: string; end_utc: string; rows: number; hours: number; plants: number };
  };
  coverage: {
    holdout_rows: number;
    dml_model_rows: number;
    fallback_rows: number;
    reference_within_available_rows: number;
    reference_above_available_rows: number;
  };
  metrics: {
    primary_all_physically_valid_holdout: IndependentHoldoutCohort;
    secondary_reference_within_available: IndependentHoldoutCohort;
    paired_dml_eligible: IndependentHoldoutCohort;
  };
  comparison_sha256: string;
}

export interface ExperimentalInsights {
  available: boolean;
  status: "not_materialized" | "exploratory_evidence";
  message: string;
  schema_version?: string;
  scientifically_approved?: false;
  operational_model?: "physical_curve";
  experimental_challenger?: "dml_air_density";
  target?: "geracao_referencia_mw";
  target_semantics?: string;
  comparison?: {
    paired: boolean;
    rows: number;
    hours: number;
    plants: number;
    comparison_sha256: string;
    outer_split_strategy: string;
    outer_splits: number;
  };
  coverage?: {
    evaluation_rows: number;
    model_rows: number;
    fallback_rows: number;
    fallback_unknown_plant_rows: number;
    fallback_incomplete_context_rows: number;
    model_fraction: number;
    note: string;
  };
  overall_metrics?: {
    physical: ExperimentalMetric;
    lightgbm: ExperimentalMetric;
    dml: ExperimentalMetric;
  };
  charts?: {
    fold_performance: Array<{
      fold_id: string;
      physical_mae_mw: number;
      lightgbm_mae_mw: number;
      dml_mae_mw: number;
    }>;
    density_response: Array<{
      label: string;
      density: number;
      physical_error_mw: number;
      dml_correction_mw: number;
      rows: number;
    }>;
    wind_performance: Array<{
      label: string;
      physical_mae_mw: number;
      lightgbm_mae_mw: number;
      dml_mae_mw: number;
      rows: number;
    }>;
  };
  limitations?: string[];
  estimand_sha256?: string;
  input_sha256?: string;
  predictions_sha256?: string;
  independent_holdout?: IndependentHoldoutInsights | null;
}
