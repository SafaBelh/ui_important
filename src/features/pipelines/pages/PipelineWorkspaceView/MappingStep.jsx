

import { useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { Spinner } from "@/shared/ui/Spinner";
import { parseCSV, wsStore } from "@/features/pipelines/api/PipelineWorkspaceApi";
import { WS_MAPPING_CORE_FIELDS, WS_MAPPING_DEFAULT_COLUMNS } from "@/constants/uiConstants";
import { autoDetect } from "@/features/pipelines/pages/PipelineWorkspaceView/utils";
import styles from "./MappingStep.module.css";

export function WSMappingStep({ uploadData, onConfirm, onNavigate: _onNavigate, manageMode = false }) {
  // Prefer uploadData from previous upload step; fall back to headers stored in
  // wsStore by the pipeline-creation modal CSV import (new flow, no upload step).
  const headers = uploadData?.columns || wsStore.csvHeaders || WS_MAPPING_DEFAULT_COLUMNS;
  const detected = autoDetect(headers);
  const [cols, setCols] = useState(detected);
  const [extraCols, setExtraCols] = useState([]);
  const [importing, setImporting] = useState(false);
  const [err, setErr] = useState(null);

  const sampleRows = uploadData?.sampleRows || wsStore.csvSampleRows || [];
  const reservedCols = new Set(
    [
      cols.amount,
      cols.date,
      cols.supplier,
      cols.tenant,
      cols.status,
      cols.label,
      cols.docref,
      cols.note,
    ].filter(Boolean)
  );
  const availableForExtra = headers.filter((h) => !reservedCols.has(h));
  const toggleExtra = (h) =>
    setExtraCols((e) => (e.includes(h) ? e.filter((x) => x !== h) : [...e, h]));
  const CORE = WS_MAPPING_CORE_FIELDS;
  const sampleVals = (col) => {
    if (!col || !sampleRows.length) return [];
    return [
      ...new Set(
        sampleRows.map((r) => r[col]).filter((v) => v !== undefined && v !== "")
      ),
    ].slice(0, 3);
  };
  const confidence = (k) => {
    if (!cols[k]) return null;
    const h = cols[k].toLowerCase().replace(/[_\-\s]/g, "");
    const sk = k.toLowerCase();
    if (h === sk) return "high";
    if (h.includes(sk) || sk.includes(h)) return "high";
    return "med";
  };
  const can = cols.amount && cols.date && cols.supplier;
  const confirm = async () => {
    setImporting(true);
    setErr(null);
    try {
      if (uploadData?.file) {
        // Real file uploaded via the old upload step
        const text = await uploadData.file.text();
        const parsed = parseCSV(text);
        wsStore.invoices = parsed.rows
          .map((r, i) => ({
            invoice_ref: r[cols.docref] || `INV-${i + 1}`,
            invoice_date: r[cols.date] || "",
            amount: parseFloat(r[cols.amount]) || 0,
            supplier_code: r[cols.supplier] || "",
            label: cols.label ? r[cols.label] : null,
            entity: cols.tenant ? r[cols.tenant] : "CORP01",
            status: cols.status ? r[cols.status] : "VALID",
            doc_ref: r[cols.docref] || "",
            ...Object.fromEntries(extraCols.map((col) => [col, r[col] ?? ""])),
          }))
          .filter((r) => r.amount > 0 && r.invoice_date && r.supplier_code);
        wsStore.series = [];
        wsStore.alerts = [];
        wsStore.detectionRun = false;
      } else if (!uploadData && wsStore.csvRawRows?.length) {
        // CSV was already uploaded via the pipeline creation modal — re-map using
        // the user's column selections from this mapping step.
        wsStore.invoices = wsStore.csvRawRows
          .map((r, i) => ({
            invoice_ref: r[cols.docref] || `INV-${i + 1}`,
            invoice_date: r[cols.date] || "",
            amount: parseFloat(r[cols.amount]) || 0,
            supplier_code: r[cols.supplier] || "",
            label: cols.label ? r[cols.label] : null,
            entity: cols.tenant ? r[cols.tenant] : "CORP01",
            status: cols.status ? r[cols.status] : "VALID",
            doc_ref: r[cols.docref] || "",
            ...Object.fromEntries(extraCols.map((col) => [col, r[col] ?? ""])),
          }))
          .filter((r) => r.amount > 0 && r.invoice_date && r.supplier_code);
        wsStore.series = [];
        wsStore.alerts = [];
        wsStore.detectionRun = false;
      } else {
        // Reuse rows already parsed by the pipeline creation flow.
        wsStore.invoices = Array.isArray(wsStore.invoices) ? wsStore.invoices : [];
      }
      onConfirm({ cols, extraCols, statusConfig: null });
    } catch (e) {
      setErr(e.message);
      setImporting(false);
    }
  };
  return (
    <div className={styles.shell}>
      {err && (
        <div className={styles.errorMessage}>
          {err}
        </div>
      )}
      {/* Column chips */}
      <div
        className={`glass-card ${styles.chipsCard}`}
      >
        <div className={styles.smallTitle}>
          Colonnes du fichier{" "}
          <span className={styles.titleHint}>
            rouge = mappé, gris = non mappé
          </span>
        </div>
        <div className={styles.chipRow}>
          {headers.map((h) => {
            const mappedAs = Object.entries(cols).find(([, v]) => v === h)?.[0];
            return (
              <span
                key={h}
                className={`${styles.columnChip} ${mappedAs ? styles.columnChipMapped : ""}`}
              >
                {h}
                {mappedAs && (
                  <span className={styles.mappedArrow}>
                    →{mappedAs}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>
      {/* Core mapping */}
      <div className={`glass-card ${styles.card}`}>
        <div className={styles.sectionTitle}>
          Association des champs
        </div>
        <div className={styles.mappingGrid}>
          {CORE.map(({ k, lbl, req, hint }) => {
            const mapped = cols[k];
            const vals = sampleVals(mapped);
            const conf = mapped ? confidence(k) : null;
            return (
              <div key={k} className={styles.fieldBlock}>
                <div className={styles.fieldHeader}>
                  <label className={styles.fieldLabel}>
                    {lbl}
                    {req && <span className={styles.requiredMark}> *</span>}
                  </label>
                  {conf && (
                    <span
                      className={`${styles.confidenceBadge} ${conf === "high" ? styles.confidenceHigh : styles.confidenceMed}`}
                    >
                      {conf === "high" ? "Confiant" : "Probable"}
                    </span>
                  )}
                </div>
                <div className={styles.fieldHint}>
                  {hint}
                </div>
                <select
                  value={cols[k] || ""}
                  onChange={(e) =>
                    setCols((c) => ({ ...c, [k]: e.target.value }))
                  }
                  className={`input-field ${mapped ? conf === "high" ? styles.selectMappedHigh : styles.selectMappedMed : ""}`}
                >
                  <option value="">— non mappé —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                {vals.length > 0 && (
                  <div className={styles.sampleValueRow}>
                    {vals.map((v, i) => (
                      <span
                        key={i}
                        className={styles.sampleValue}
                      >
                        {String(v).slice(0, 24)}
                      </span>
                    ))}
                  </div>
                )}
                {!mapped && req && (
                  <div className={styles.requiredWarning}>
                    <TriangleAlert size={9} /> Champ obligatoire
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {/* Sample data table */}
      {sampleRows.length > 0 && (
        <div className={`glass-card ${styles.compactCard}`}>
          <div className={styles.smallTitle}>
            Aperçuçu ({sampleRows.length} premières lignes)
          </div>
          <div className={styles.tableWrap}>
            <table
              className={styles.previewTable}
            >
              <thead>
                <tr className={styles.headerRow}>
                  {headers.map((h) => {
                    const mappedAs = Object.entries(cols).find(
                      ([, v]) => v === h
                    )?.[0];
                    return (
                      <th
                        key={h}
                        className={`${styles.headCell} ${mappedAs ? styles.headCellMapped : ""}`}
                      >
                        {h}
                        {mappedAs && (
                          <div className={styles.mappedLabel}>
                            {mappedAs}
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sampleRows.slice(0, 4).map((row, i) => (
                  <tr key={i} className={styles.bodyRow}>
                    {headers.map((h) => {
                      const mappedAs = Object.entries(cols).find(
                        ([, v]) => v === h
                      )?.[0];
                      return (
                        <td
                          key={h}
                          className={`${styles.bodyCell} ${mappedAs ? styles.bodyCellMapped : ""}`}
                        >
                          {String(row[h] ?? "").slice(0, 30)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Extra cols */}
      {availableForExtra.length > 0 && (
        <div className={`glass-card ${styles.extrasCard}`}>
          <div className={styles.sectionTitle}>
            Colonnes supplémentaires
          </div>
          <div className={styles.extrasText}>
            Cochez les colonnes à inclure comme champs de regroupement dans les
            séries (stockées dans <code>extra_data</code>).
          </div>
          <div className={styles.extraButtonRow}>
            {availableForExtra.map((h) => {
              const vals = sampleVals(h);
              return (
                <button
                  key={h}
                  className={`btn-toggle${
                    extraCols.includes(h) ? " active" : ""
                  } ${styles.extraButton}`}
                  onClick={() => toggleExtra(h)}
                >
                  <span>
                    {extraCols.includes(h) && (
                      <Check
                        size={10}
                        className={styles.checkIcon}
                      />
                    )}
                    {h}
                  </span>
                  {vals.length > 0 && (
                    <span className={styles.extraSample}>
                      {vals.slice(0, 2).join(", ")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <button
        disabled={!can || importing}
        onClick={confirm}
        className={`btn-primary ${styles.confirmButton}`}
      >
        {importing ? (
          <>
            <Spinner size={16} color="#fff" />
            Importation…
          </>
        ) : can ? (
          manageMode ? "Enregistrer le mapping" : `Importer & continuer →`
        ) : (
          "Sélectionner les 3 champs obligatoires (*)"
        )}
      </button>
    </div>
  );
}
