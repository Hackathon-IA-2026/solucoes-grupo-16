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
    label: "Instante histórico",
    shortLabel: "Hora",
    description: "Replay horário ONS + ERA5",
    icon: "wind",
  },
  {
    href: "/usinas-estimativas",
    label: "Geração observada",
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
    description: "Arquivo para o ANAREDE",
    icon: "file",
  },
];
