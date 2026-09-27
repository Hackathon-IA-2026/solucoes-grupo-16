"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type {
  ClimaGridState,
  ClimateScenario,
  PlantBusMapping,
  PwfExportMode,
  ReferencePwf,
  PwfGenerationTarget,
  WindPlantEstimate,
} from "@/types/climagrid";

const STORAGE_KEY = "climagrid:historical-replay:v2";

const initialState: ClimaGridState = {
  climateScenario: null,
  estimates: [],
  selectedPlantIds: [],
  study: {
    name: "",
    exportMode: "reference",
    referencePwf: null,
    generationTargets: [],
    mappings: {},
  },
};

interface ScenarioContextValue {
  state: ClimaGridState;
  isHydrated: boolean;
  setProcessedScenario: (scenario: ClimateScenario, estimates: WindPlantEstimate[]) => void;
  setSelectedPlantIds: (plantIds: string[]) => void;
  togglePlant: (plantId: string) => void;
  setStudyName: (name: string) => void;
  setExportMode: (mode: PwfExportMode) => void;
  setReferencePwf: (referencePwf: ReferencePwf | null, generationTargets?: PwfGenerationTarget[]) => void;
  updateMapping: (allocationId: string, patch: Partial<PlantBusMapping>) => void;
  setPlantIncluded: (plantId: string, included: boolean) => void;
  resetScenario: () => void;
}

const ScenarioContext = createContext<ScenarioContextValue | null>(null);

const subscribeToHydration = () => () => undefined;

export function ScenarioProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ClimaGridState>(initialState);
  const didLoadStorage = useRef(false);
  const isHydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);

  useEffect(() => {
    let storedState: ClimaGridState | null = null;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) storedState = normalizeStoredState(JSON.parse(stored) as ClimaGridState);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    queueMicrotask(() => {
      if (storedState) setState(storedState);
      didLoadStorage.current = true;
    });
  }, []);

  useEffect(() => {
    if (didLoadStorage.current) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const value = useMemo<ScenarioContextValue>(
    () => ({
      state,
      isHydrated,
      setProcessedScenario: (scenario, estimates) => {
        setState({
          ...initialState,
          climateScenario: scenario,
          estimates,
          selectedPlantIds: estimates.map((estimate) => estimate.id),
          study: {
            ...initialState.study,
            name: `${scenario.mode === "scenario" ? "Cenário climático" : "Replay"} ${new Date(scenario.timestamp).toLocaleString("pt-BR")}`,
          },
        });
      },
      setSelectedPlantIds: (plantIds) => {
        setState((current) => ({ ...current, selectedPlantIds: plantIds }));
      },
      togglePlant: (plantId) => {
        setState((current) => ({
          ...current,
          selectedPlantIds: current.selectedPlantIds.includes(plantId)
            ? current.selectedPlantIds.filter((id) => id !== plantId)
            : [...current.selectedPlantIds, plantId],
        }));
      },
      setStudyName: (name) => {
        setState((current) => ({
          ...current,
          study: { ...current.study, name },
        }));
      },
      setExportMode: (exportMode) => {
        setState((current) => ({
          ...current,
          study: {
            ...current.study,
            exportMode,
            mappings: buildMappings(
              current,
              current.study.generationTargets,
              exportMode,
            ),
          },
        }));
      },
      setReferencePwf: (referencePwf, generationTargets = []) => {
        setState((current) => {
          const mappings = current.study.exportMode === "dbar"
            ? current.study.mappings
            : referencePwf
              ? buildMappings(current, generationTargets, "reference")
              : {};
          return {
            ...current,
            study: {
              ...current.study,
              referencePwf,
              generationTargets,
              mappings,
            },
          };
        });
      },
      updateMapping: (allocationId, patch) => {
        setState((current) => {
          const existing = current.study.mappings[allocationId];
          const mapping = Object.assign(
            {
              plantId: existing?.plantId ?? allocationId.split(":")[0],
              allocationId,
              allocationFactor: existing?.allocationFactor ?? 1,
              generationMw: existing?.generationMw ?? 0,
              busNumber: "",
              busName: "",
              nominalVoltageKv: "",
              area: "",
              included: true,
              operation: "M" as const,
              state: "0" as const,
            },
            existing,
            patch,
            { allocationId },
          );
          return {
            ...current,
            study: {
              ...current.study,
              mappings: {
                ...current.study.mappings,
                [allocationId]: mapping,
              },
            },
          };
        });
      },
      setPlantIncluded: (plantId, included) => {
        setState((current) => ({
          ...current,
          study: {
            ...current.study,
            mappings: Object.fromEntries(
              Object.entries(current.study.mappings).map(([id, mapping]) => [
                id,
                mapping.plantId === plantId ? { ...mapping, included } : mapping,
              ]),
            ),
          },
        }));
      },
      resetScenario: () => setState(initialState),
    }),
    [isHydrated, state],
  );

  return <ScenarioContext.Provider value={value}>{children}</ScenarioContext.Provider>;
}

function buildMappings(
  state: ClimaGridState,
  generationTargets: PwfGenerationTarget[],
  exportMode: PwfExportMode,
): Record<string, PlantBusMapping> {
  const targets = new Map(
    generationTargets.map((target) => [String(target.busNumber), target]),
  );
  const mappings: Record<string, PlantBusMapping> = {};
  state.estimates
    .filter((plant) => state.selectedPlantIds.includes(plant.id))
    .forEach((plant) => {
      const allocations = plant.suggestedBusAllocations.length > 0
        ? plant.suggestedBusAllocations
        : [{
          busNumber: "",
          busName: "",
          allocationFactor: 1,
          allocatedGenerationMw:
            plant.observedGenerationMw ?? plant.estimatedGenerationMw ?? 0,
        }];
      allocations.forEach((allocation, index) => {
        const allocationId = `${plant.id}:${allocation.busNumber || `manual-${index}`}`;
        const target = targets.get(allocation.busNumber);
        const canUseSuggestedBus = exportMode === "dbar" || target?.editable;
        mappings[allocationId] = {
          plantId: plant.id,
          allocationId,
          allocationFactor: allocation.allocationFactor,
          generationMw: allocation.allocatedGenerationMw,
          busNumber: canUseSuggestedBus ? allocation.busNumber : "",
          busName: target?.busName ?? allocation.busName,
          nominalVoltageKv: target?.baseVoltageKv?.toString() ?? "",
          area: target?.area?.toString() ?? "",
          included: true,
          operation: "M",
          state: "0",
        };
      });
    });
  return mappings;
}

function normalizeStoredState(stored: ClimaGridState): ClimaGridState {
  return {
    ...initialState,
    ...stored,
    study: {
      ...initialState.study,
      ...stored.study,
      exportMode: stored.study?.exportMode === "dbar" ? "dbar" : "reference",
      mappings: Object.fromEntries(
        Object.entries(stored.study?.mappings ?? {}).map(([id, mapping]) => [
          id,
          {
            ...mapping,
            included: mapping.included ?? true,
            operation: ["A", "E", "M"].includes(mapping.operation)
              ? mapping.operation
              : "M",
            state: ["0", "1", "2"].includes(mapping.state)
              ? mapping.state
              : "0",
          },
        ]),
      ),
    },
  };
}

export function useScenario() {
  const context = useContext(ScenarioContext);
  if (!context) throw new Error("useScenario precisa ser usado dentro de ScenarioProvider.");
  return context;
}
