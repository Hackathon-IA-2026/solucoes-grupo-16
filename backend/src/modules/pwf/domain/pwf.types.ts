export type PwfLineEnding = 'CRLF' | 'LF' | 'MIXED' | 'NONE';

export type PwfCompatibility = 'supported' | 'unverified';

export interface PwfFieldReference<T> {
  value: T;
  byteOffset: number;
  width: number;
  rawValue: string;
}

export interface PwfBus {
  number: number;
  name: string;
  status: string;
  type: 0 | 1 | 2 | 3;
  baseVoltageGroup?: string;
  baseVoltageKv?: number;
  voltageMagnitude?: number;
  voltageAngleDegrees?: number;
  activeGenerationMw: number;
  reactiveGenerationMvar: number;
  reactiveMinimumMvar?: number;
  reactiveMaximumMvar?: number;
  activeGenerationMinimumMw?: number;
  activeGenerationMaximumMw?: number;
  activeLoadMw: number;
  reactiveLoadMvar: number;
  area?: number;
  lineNumber: number;
  activeGenerationField: PwfFieldReference<number>;
}

export interface PwfGeneratorGroup {
  busNumber: number;
  groupNumber: number;
  operation: string;
  automaticMode: boolean;
  status: 'on' | 'off';
  units: number;
  unitsOnline: number;
  minimumUnitsOnline: number;
  activeGenerationPerUnitMw: number;
  reactiveGenerationPerUnitMvar: number;
  reactiveMinimumPerUnitMvar?: number;
  reactiveMaximumPerUnitMvar?: number;
  apparentPowerPerUnitMva?: number;
  mechanicalLimitPerUnitMw?: number;
  activeMinimumPerUnitMw?: number;
  lineNumber: number;
  activeGenerationField: PwfFieldReference<number>;
}

export interface ParsedPwfDocument {
  anaredeVersion: string;
  compatibility: PwfCompatibility;
  encoding: 'latin1';
  lineEnding: PwfLineEnding;
  title?: string;
  studyYear?: number;
  blocks: string[];
  buses: PwfBus[];
  generatorGroups: PwfGeneratorGroup[];
  warnings: string[];
}

export interface PwfReferenceCaseMetadata {
  id: string;
  name: string;
  sizeBytes: number;
  sha256: string;
  uploadedAt: string;
  status: 'valid';
  anaredeVersion: string;
  compatibility: PwfCompatibility;
  encoding: 'latin1';
  lineEnding: PwfLineEnding;
  title?: string;
  studyYear?: number;
  busCount: number;
  generatorBusCount: number;
  generatorGroupCount: number;
  blocks: string[];
  warnings: string[];
}

export interface PwfGenerationTarget {
  kind: 'bus';
  busNumber: number;
  busName: string;
  busType: 0 | 1 | 2 | 3;
  area?: number;
  baseVoltageKv?: number;
  activeGenerationMw: number;
  activeGenerationMinimumMw?: number;
  activeGenerationMaximumMw?: number;
  editable: boolean;
  generatorGroups: PwfGenerationTargetGroup[];
}

export interface PwfGenerationTargetGroup {
  busNumber: number;
  groupNumber: number;
  automaticMode: boolean;
  status: 'on' | 'off';
  units: number;
  unitsOnline: number;
  activeGenerationPerUnitMw: number;
  mechanicalLimitPerUnitMw?: number;
  activeMinimumPerUnitMw?: number;
}

export interface PwfReferenceCaseIndex {
  buses: PwfBus[];
  generatorGroups: PwfGeneratorGroup[];
}
