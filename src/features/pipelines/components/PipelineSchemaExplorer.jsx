import { Link2, RefreshCw } from "lucide-react";
import { Helper, LBL } from "./PipelineConfigFormUi";
import styles from "./PipelineSchemaExplorer.module.css";

const cx = (...classes) => classes.filter(Boolean).join(" ");

function SqlPreview({ validJdbcTables, jdbcJoins, jdbcWhere }) {
  if (validJdbcTables.length === 0) {
    return (
      <div className={styles.sqlEmpty}>
        Sélectionnez au moins une table dans l'exploration pour générer la requête SQL.
      </div>
    );
  }

  return (
    <div className={styles.sqlPreview}>
      <span className={styles.sqlKeyword}>SELECT</span> *{" "}
      <span className={styles.sqlKeyword}>FROM</span>{" "}
      <span className={styles.sqlTable}>{validJdbcTables[0]?.name}</span>{" "}
      <span className={styles.sqlAlias}>{validJdbcTables[0]?.alias}</span>
      {jdbcJoins.map((join, index) => (
        <span key={index}>
          <br />
          <span className={styles.sqlKeyword}>  {join.type} JOIN</span>{" "}
          <span className={styles.sqlTable}>{validJdbcTables.find((table) => table.alias === join.toAlias)?.name || join.toAlias}</span>{" "}
          <span className={styles.sqlAlias}>{join.toAlias}</span>{" "}
          <span className={styles.sqlKeyword}>ON</span> {join.condition}
        </span>
      ))}
      {jdbcWhere && (
        <span>
          <br />
          <span className={styles.sqlKeyword}>WHERE</span> <span className={styles.sqlWhere}>{jdbcWhere}</span>
        </span>
      )}
    </div>
  );
}

export function PipelineSchemaExplorer({
  connType,
  discoveredSchema,
  schemaLoading,
  discoverSourceSchema,
  jdbcTables,
  setJdbcTables,
  jdbcJoins,
  setJdbcJoins,
  jdbcWhere,
  setJdbcWhere,
  addSchemaTable,
  addSchemaRelation,
}) {
  const validJdbcTables = jdbcTables.filter((table) => table.name?.trim() && table.alias?.trim());

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Exploration du schéma</h3>
          <p className={styles.subtitle}>Visualisez les tables disponibles et les connexions détectées avant de créer le pipeline.</p>
        </div>
        {connType === "jdbc" && (
          <button type="button" onClick={discoverSourceSchema} disabled={schemaLoading} className={cx("btn-ghost", styles.refreshButton)}>
            <RefreshCw size={13} className={schemaLoading ? "spin" : ""} /> Rafraîchir
          </button>
        )}
      </div>

      {connType !== "jdbc" ? (
        <div className={styles.infoNotice}>
          L'exploration visuelle des relations est disponible pour les sources JDBC. Pour CSV/API/SFTP, les colonnes sont configurées à partir du fichier ou de la ressource choisie.
        </div>
      ) : !discoveredSchema ? (
        <div className={styles.emptyNotice}>
          Aucun schéma découvert. Revenez à Connexion et lancez “Tester et découvrir le schéma”.
        </div>
      ) : (
        <>
          <div className={styles.schemaGrid}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <span className={styles.panelTitle}>Tables détectées</span>
                <span className={styles.panelCount}>{discoveredSchema.tables?.length || 0} tables</span>
              </div>
              <div className={styles.panelBody}>
                {(discoveredSchema.tables || []).map((table, index) => {
                  const selected = jdbcTables.some((selectedTable) => selectedTable.name === table.name);
                  return (
                    <div key={table.name} className={cx(styles.tableCard, selected && styles.tableCardSelected)}>
                      <div className={styles.tableCardHeader}>
                        <div className={styles.tableNameWrap}>
                          <div className={styles.tableName}>{table.name}</div>
                          <div className={styles.tableMeta}>{(table.cols || []).length} colonnes{table.rowCount ? ` · ${table.rowCount} lignes` : ""}</div>
                        </div>
                        <button type="button" onClick={() => addSchemaTable(table.name)} disabled={selected} className={cx(styles.addTableButton, selected && styles.addTableButtonSelected)}>
                          {selected ? "Ajoutée" : index === 0 && jdbcTables.length === 0 ? "Table principale" : "Ajouter"}
                        </button>
                      </div>
                      <div className={styles.columnList}>
                        {(table.cols || []).slice(0, 10).map((column) => <span key={column} className={styles.columnChip}>{column}</span>)}
                        {(table.cols || []).length > 10 && <span className={styles.moreColumns}>+{table.cols.length - 10}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <span className={styles.panelTitle}>Connexions entre tables</span>
                <span className={styles.panelCount}>{discoveredSchema.rels?.length || 0}</span>
              </div>
              <div className={styles.panelBody}>
                {(discoveredSchema.rels || []).length === 0 && <div className={styles.noRelations}>Aucune relation FK ou inférée détectée.</div>}
                {(discoveredSchema.rels || []).map((relation, index) => (
                  <div key={`${relation.from}-${relation.to}-${relation.col}-${index}`} className={styles.relationCard}>
                    <div className={styles.relationHeader}>
                      <span className={styles.relationFrom}>{relation.from}</span>
                      <Link2 size={12} className={styles.relationIcon} />
                      <span className={styles.relationTo}>{relation.to}</span>
                    </div>
                    <div className={styles.relationColumns}>{relation.col} = {relation.toCol || relation.col}</div>
                    <button type="button" onClick={() => addSchemaRelation(relation)} className={styles.useRelationButton}>
                      Utiliser cette relation
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.selectedSection}>
            <LBL>TABLES SÉLECTIONNÉES POUR LE PIPELINE</LBL>
            <div className={styles.selectedList}>
              {jdbcTables.length === 0 && <div className={styles.emptySelected}>Ajoutez une table principale depuis la liste ci-dessus.</div>}
              {jdbcTables.map((table, index) => (
                <div key={`${table.name}-${index}`} className={styles.selectedRow}>
                  <span className={cx(styles.tableIndex, index === 0 && styles.tableIndexPrimary)}>{index === 0 ? "F" : index}</span>
                  <input value={table.name} onChange={(event) => setJdbcTables((tables) => tables.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} className={cx("input-field", styles.selectedInput)} />
                  <input value={table.alias} onChange={(event) => setJdbcTables((tables) => tables.map((row, rowIndex) => rowIndex === index ? { ...row, alias: event.target.value } : row))} className={cx("input-field", styles.selectedInput)} />
                  <button type="button" onClick={() => setJdbcTables((tables) => tables.filter((_, rowIndex) => rowIndex !== index))} className={styles.removeTableButton}>×</button>
                </div>
              ))}
            </div>

            {validJdbcTables.length > 1 && (
              <div className={styles.joinsSection}>
                <LBL>JOINTURES ({jdbcJoins.length})</LBL>
                {jdbcJoins.map((join, index) => (
                  <div key={index} className={styles.joinRow}>
                    <select value={join.type} onChange={(event) => setJdbcJoins((joins) => joins.map((row, rowIndex) => rowIndex === index ? { ...row, type: event.target.value } : row))} className={cx("input-field", styles.joinTypeSelect)}>
                      <option>INNER</option><option>LEFT</option><option>RIGHT</option>
                    </select>
                    <span className={styles.joinLabel}>JOIN</span>
                    <input value={join.toAlias} onChange={(event) => setJdbcJoins((joins) => joins.map((row, rowIndex) => rowIndex === index ? { ...row, toAlias: event.target.value } : row))} className={cx("input-field", styles.joinAliasInput)} placeholder="s" />
                    <span className={styles.joinLabel}>ON</span>
                    <input value={join.condition} onChange={(event) => setJdbcJoins((joins) => joins.map((row, rowIndex) => rowIndex === index ? { ...row, condition: event.target.value } : row))} className={cx("input-field", styles.joinConditionInput)} placeholder="f.supplier_code = s.supplier_code" />
                    <button type="button" onClick={() => setJdbcJoins((joins) => joins.filter((_, rowIndex) => rowIndex !== index))} className={styles.removeJoinButton}>×</button>
                  </div>
                ))}
                <button type="button" onClick={() => setJdbcJoins((joins) => [...joins, { fromAlias: "", toAlias: "", condition: "", type: "INNER" }])} className={styles.addJoinButton}>
                  + Ajouter une jointure manuelle
                </button>
              </div>
            )}

            <div className={styles.whereSection}>
              <LBL>CLAUSE WHERE (optionnelle)</LBL>
              <input value={jdbcWhere} onChange={(event) => setJdbcWhere(event.target.value)} className={cx("input-field", styles.whereInput)} placeholder="f.status = 'COMPTABILISE'" />
              <Helper>Utilisez les alias sélectionnés. Ex: f.status = 'COMPTABILISE'</Helper>
            </div>
            <SqlPreview validJdbcTables={validJdbcTables} jdbcJoins={jdbcJoins} jdbcWhere={jdbcWhere} />
          </div>
        </>
      )}
    </div>
  );
}
