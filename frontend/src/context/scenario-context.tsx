"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type {
  ClimaGridState,
  ClimateScenario,
  PlantBusMapping,
  ReferencePwf,
  WindPlantEstimate,
} from "@/types/climagrid";

const STORAGE_KEY = "climagrid:mvp-scenario:v1";

const initialState: ClimaGridState = {
  climateScenario: null,
  estimates: [],
  selectedPlantIds: [],
  study: {
    name: "",
    referencePwf: null,
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
  setReferencePwf: (referencePwf: ReferencePwf | null) => void;
  updateMapping: (plantId: string, patch: Partial<PlantBusMapping>) => void;
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
            name: `Estudo ${new Date(scenario.startAt).toLocaleDateString("pt-BR")}`,
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
      setReferencePwf: (referencePwf) => {
        setState((current) => ({
          ...current,
          study: { ...current.study, referencePwf },
        }));
      },
      updateMapping: (plantId, patch) => {
        setState((current) => {
          const mapping = Object.assign(
            { plantId, busNumber: "", busName: "", nominalVoltageKv: "", area: "" },
            current.study.mappings[plantId],
            patch,
            { plantId },
          );
          return {
            ...current,
            study: {
              ...current.study,
              mappings: {
                ...current.study.mappings,
                [plantId]: mapping,
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
