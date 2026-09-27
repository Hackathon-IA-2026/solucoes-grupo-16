export interface PersistedClimateObservation {
  id: string;
  onsId: string;
  estimatedGenerationMw: number;
  mappingCoveragePercent: number;
  [key: string]: unknown;
}

export interface ClimateScenarioManifest {
  schemaVersion: 'climagrid-climate-scenario-v1';
  id: string;
  createdAt: string;
  subsystem: 'NE';
  timestamp: string;
  resolutionMinutes: 60;
  generationSource: 'PHYSICAL_CURVE' | 'MODEL';
  weatherSource: 'USER' | 'ERA5';
  dataVersion: string;
  input: {
    schemaVersion: 'normalized-ons-hourly-v1';
    name: string;
    sizeBytes: number;
    sha256: string;
    mediaType: 'text/csv';
    rowCount: number;
    source?: 'user_upload' | 'era5_cds_generated';
  };
  provenance: {
    catalogSha256: string;
    mappingSha256: string | null;
    estimatorVersion: string;
    modelRows?: number;
    physicalFallbackRows?: number;
    weatherDataVersion?: string;
    era5Sha256?: string;
    availabilitySource?: 'USER_FILE' | 'USER_GLOBAL_ASSUMPTION';
    availabilityValue?: number;
    excludedPlantIds?: string[];
    catalogCoveragePercent?: number;
    physicalCurve: {
      cutInMs: number;
      ratedMs: number;
      cutOutMs: number;
    };
  };
  observations: PersistedClimateObservation[];
  warnings: string[];
}

export interface ClimateScenarioExportManifest {
  schemaVersion: 'climagrid-pwf-export-v1';
  id: string;
  scenarioId: string;
  createdAt: string;
  studyName: string;
  referencePwf: {
    id: string;
    name: string;
    sha256: string;
  };
  output: {
    filename: string;
    sizeBytes: number;
    sha256: string;
    modifiedBuses: number[];
  };
  selection: {
    selectedPlantIds: string[];
    unselectedPlantIds: string[];
    unselectedPlantBehavior: 'preserve_reference_pwf_pg';
  };
  allocations: Array<{
    plantId: string;
    onsId: string;
    busNumber: number;
    allocationFactor: number;
    generationMw: number;
  }>;
}

export interface ClimateScenarioTrace extends ClimateScenarioManifest {
  exports: ClimateScenarioExportManifest[];
}
