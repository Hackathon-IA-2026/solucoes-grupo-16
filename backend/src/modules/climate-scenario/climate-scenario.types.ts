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
  generationSource: 'PHYSICAL_CURVE';
  weatherSource: 'USER';
  dataVersion: string;
  input: {
    schemaVersion: 'normalized-ons-hourly-v1';
    name: string;
    sizeBytes: number;
    sha256: string;
    mediaType: 'text/csv';
    rowCount: number;
  };
  provenance: {
    catalogSha256: string;
    mappingSha256: string | null;
    estimatorVersion: string;
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
