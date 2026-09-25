"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type {
  ClimaGridState,
  ClimateScenario,
  PlantBusMapping,
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
  setReferencePwf: (referencePwf: ReferencePwf | null, generationTargets?: PwfGenerationTarget[]) => void;
  updateMapping: (allocationId: string, patch: Partial<PlantBusMapping>) => void;
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
      if (stored) storedState = JSON.parse(stored) as ClimaGridState;
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
            name: `Replay ${new Date(scenario.timestamp).toLocaleString("pt-BR")}`,
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
      setReferencePwf: (referencePwf, generationTargets = []) => {
        setState((current) => {
          const targets = new Map(
            generationTargets.map((target) => [String(target.busNumber), target]),
          );
          const mappings: Record<string, PlantBusMapping> = {};
          if (referencePwf) {
            current.estimates
              .filter((plant) => current.selectedPlantIds.includes(plant.id))
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
                  mappings[allocationId] = {
                    plantId: plant.id,
                    allocationId,
                    allocationFactor: allocation.allocationFactor,
                    generationMw: allocation.allocatedGenerationMw,
                    busNumber: target?.editable ? String(target.busNumber) : "",
                    busName: target?.editable ? target.busName : allocation.busName,
                    nominalVoltageKv: target?.baseVoltageKv?.toString() ?? "",
                    area: target?.area?.toString() ?? "",
                  };
                });
              });
          }
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
      resetScenario: () => setState(initialState),
    }),
    [isHydrated, state],
  );

  return <ScenarioContext.Provider value={value}>{children}</ScenarioContext.Provider>;
}

export function useScenario() {
  const context = useContext(ScenarioContext);
  if (!context) throw new Error("useScenario precisa ser usado dentro de ScenarioProvider.");
  return context;
}
