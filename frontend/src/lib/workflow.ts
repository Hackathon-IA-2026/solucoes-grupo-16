import type { IconName } from "@/components/ui/icon";

export const workflowSteps: Array<{
  href: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: IconName;
}> = [
  {
    href: "/",
    label: "Entrada climática",
    shortLabel: "Dados",
    description: "ERA5/ONS ou cenário próprio",
    icon: "wind",
  },
  {
    href: "/usinas-estimativas",
    label: "Geração estimada",
    shortLabel: "Usinas",
    description: "Seleção dos parques eólicos",
    icon: "turbine",
  },
  {
    href: "/mapeamento-barras",
    label: "Mapeamento de barras",
    shortLabel: "Barras",
    description: "Associação manual usina → barra",
    icon: "network",
  },
  {
    href: "/exportacao-pwf",
    label: "Exportação PWF",
    shortLabel: "Exportar",
    description: "Risco e arquivo para o ANAREDE",
    icon: "file",
  },
];
