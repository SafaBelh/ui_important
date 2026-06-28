import { PIPELINE_DEFS } from "@/constants/integrationWizard";

export function getPipelineGroupByErrors(data) {
  const pipelines = data.pipelines || {};
  const customPipelines = data.customPipelines || [];
  const checks = [
    { key: "facture", label: PIPELINE_DEFS.facture.label },
    { key: "commande", label: PIPELINE_DEFS.commande.label },
    ...customPipelines.map((pipeline) => ({ key: pipeline.id, label: pipeline.label })),
  ];
  const errors = [];
  for (const { key, label } of checks) {
    const pipeline = pipelines[key] || {};
    if (pipeline.enabled === false) continue;
    const groupCols = Array.isArray(pipeline.groupByCols) ? pipeline.groupByCols : [];
    const mappings = pipeline.fieldMappings || {};
    if (key !== "facture" && groupCols.length === 0) {
      errors.push({ key, label, type: "empty" });
      continue;
    }
    const unmapped = groupCols.filter((col) => !mappings[col] || !String(mappings[col]).trim());
    if (unmapped.length > 0) errors.push({ key, label, type: "unmapped", fields: unmapped });
  }
  return errors;
}
