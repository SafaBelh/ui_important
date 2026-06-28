import { LayoutDashboard, Map, Layers, Settings, BarChart2, Wand2 } from "lucide-react";

export const PIPELINE_STEPS = [
  {
    id: "mapping",
    label: "Mapping",
    desc: "Associer les colonnes sources",
    Icon: Map,
  },
  {
    id: "cleaning",
    label: "Nettoyage",
    desc: "Filtrer les données invalides",
    Icon: Wand2,
  },
  {
    id: "clusterEDA",
    label: "Clusters",
    desc: "Analyse exploratoire",
    Icon: BarChart2,
  },
  {
    id: "seriesBuilder",
    label: "Séries",
    desc: "Construire les séries temps",
    Icon: Layers,
  },
  {
    id: "seriesConfig",
    label: "Configuration",
    desc: "Paramétrer les tolérances",
    Icon: Settings,
  },
  {
    id: "dashboard",
    label: "Dashboard",
    desc: "Résultats & anomalies",
    Icon: LayoutDashboard,
  },
];
