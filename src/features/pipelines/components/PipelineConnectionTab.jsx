import { AlertCircle, CheckCircle, Network, RefreshCw, Upload } from "lucide-react";
import { Spinner } from "@/shared/ui/Spinner";
import { COLORS } from "@/constants/colors";
import { Helper, LBL } from "./PipelineConfigFormUi";
import styles from "./PipelineConnectionTab.module.css";

export function PipelineConnectionTab({
  connType,
  apiUrl,
  setApiUrl,
  apiAuth,
  setApiAuth,
  apiToken,
  setApiToken,
  jdbcDriver,
  setJdbcDriver,
  jdbcUrl,
  setJdbcUrl,
  jdbcUser,
  setJdbcUser,
  jdbcPass,
  setJdbcPass,
  discoverSourceSchema,
  schemaLoading,
  schemaMessage,
  schemaError,
  sftpHost,
  setSftpHost,
  sftpPort,
  setSftpPort,
  sftpUser,
  setSftpUser,
  sftpPath,
  setSftpPath,
  sftpAuthMethod,
  setSftpAuthMethod,
  sftpPass,
  setSftpPass,
  csvImportPhase,
  csvImportLines,
  setCsvImportPhase,
  setCsvImportLines,
  csvFile,
  setCsvFile,
  csvDetectedFields,
  csvDelim,
  setCsvDelim,
  csvEnc,
  setCsvEnc,
  csvHeader,
  setCsvHeader,
  csvDropRef,
  handleCsvFile,
}) {
  if (connType === "api") {
    return (
      <div className={styles.stack12}>
        <div>
          <LBL>BASE URL</LBL>
          <input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} className="input-field" placeholder="https://api.exemple.com/v1" />
        </div>
        <div className={styles.twoColumnGrid}>
          <div>
            <LBL>AUTH</LBL>
            <select value={apiAuth} onChange={(event) => setApiAuth(event.target.value)} className="input-field">
              <option>Bearer token</option>
              <option>API Key</option>
              <option>Basic Auth</option>
              <option>OAuth 2.0</option>
            </select>
          </div>
          <div>
            <LBL>TOKEN / CLÉ</LBL>
            <input type="password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} className="input-field" placeholder="••••••••••••" />
          </div>
        </div>
      </div>
    );
  }

  if (connType === "jdbc") {
    return (
      <div className={styles.stack16}>
        <div className={styles.jdbcSection}>
          <div className={styles.sectionHeading}>
            <span className={styles.stepBadge}>1</span>
            <LBL>CONNEXION BASE DE DONNÉES</LBL>
          </div>
          <div className={styles.fieldBlock}>
            <LBL>DRIVER</LBL>
            <select value={jdbcDriver} onChange={(event) => setJdbcDriver(event.target.value)} className="input-field">
              <option>PostgreSQL</option><option>MySQL</option><option>MSSQL</option><option>Oracle</option>
            </select>
          </div>
          <div className={styles.fieldBlock}>
            <LBL>URL JDBC complète</LBL>
            <input value={jdbcUrl} onChange={(event) => setJdbcUrl(event.target.value)} className={`input-field ${styles.jdbcUrlInput}`} autoComplete="off" placeholder="jdbc:postgresql://localhost:5432/askgo_db" />
            <Helper>URL JDBC complète — ex: jdbc:postgresql://localhost:5432/askgo_db (le port est lu depuis l'URL).</Helper>
          </div>
          <div className={styles.twoColumnGrid}>
            <div>
              <LBL>UTILISATEUR</LBL>
              <input value={jdbcUser} onChange={(event) => setJdbcUser(event.target.value)} className="input-field" autoComplete="off" placeholder="readonly_user" />
            </div>
            <div>
              <LBL>MOT DE PASSE</LBL>
              <input type="password" value={jdbcPass} onChange={(event) => setJdbcPass(event.target.value)} className="input-field" autoComplete="new-password" placeholder="••••••••" />
            </div>
          </div>
          <div className={styles.schemaActions}>
            <button type="button" onClick={discoverSourceSchema} disabled={schemaLoading} className={`btn-primary ${styles.schemaButton}`}>
              {schemaLoading ? <RefreshCw size={13} color="#fff" className="spin" /> : <Network size={13} color="#fff" />}
              Tester et découvrir le schéma
            </button>
            {schemaMessage && <span className={styles.schemaMessage}>{schemaMessage}</span>}
          </div>
          {schemaError && (
            <div className={styles.schemaError}>
              <AlertCircle size={13} color="#dc2626" className={styles.schemaErrorIcon} />
              {schemaError}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (connType === "sftp") {
    return (
      <div className={styles.stack12}>
        <div className={styles.hostPortGrid}>
          <div><LBL>HOST</LBL><input value={sftpHost} onChange={(event) => setSftpHost(event.target.value)} className="input-field" placeholder="sftp.exemple.com" /></div>
          <div><LBL>PORT</LBL><input value={sftpPort} onChange={(event) => setSftpPort(event.target.value)} className="input-field" placeholder="22" /></div>
        </div>
        <div className={styles.twoColumnGrid}>
          <div><LBL>UTILISATEUR</LBL><input value={sftpUser} onChange={(event) => setSftpUser(event.target.value)} className="input-field" placeholder="erp_export" /></div>
          <div><LBL>CHEMIN</LBL><input value={sftpPath} onChange={(event) => setSftpPath(event.target.value)} className="input-field" placeholder="/exports/" /></div>
        </div>
        <div>
          <LBL>AUTHENTIFICATION</LBL>
          <div className={styles.authButtons}>
            {[["password", "Mot de passe"], ["ssh", "Clé SSH"]].map(([id, label]) => (
              <button key={id} onClick={() => setSftpAuthMethod(id)} className={`${styles.authButton} ${sftpAuthMethod === id ? styles.authButtonActive : ""}`}>{label}</button>
            ))}
          </div>
        </div>
        {sftpAuthMethod === "password" && <div><LBL>MOT DE PASSE</LBL><input type="password" value={sftpPass} onChange={(event) => setSftpPass(event.target.value)} className="input-field" placeholder="••••••••" /></div>}
      </div>
    );
  }

  if (connType === "csv") {
    return (
      <div className={styles.stack12}>
        {csvImportPhase === "idle" && (
          <>
            <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); handleCsvFile(event.dataTransfer.files[0]); }} onClick={() => csvDropRef.current?.click()} className={styles.csvDropzone}>
              <Upload size={28} color={COLORS.red} strokeWidth={1.5} />
              <div className={styles.csvDropTitle}>Déposez votre CSV ici</div>
              <div className={styles.csvDropHint}>ou cliquez pour sélectionner · max 50 MB</div>
            </div>
            <input ref={csvDropRef} type="file" accept=".csv" className={styles.hiddenInput} onChange={(event) => handleCsvFile(event.target.files[0])} />
            <div className={styles.csvNotice}>
              Importez uniquement un fichier CSV réel. Les jeux de données démo sont désactivés en mode production.
            </div>
          </>
        )}
        {csvImportPhase === "importing" && (
          <div className={styles.importingState}>
            <Spinner size={14} />
            <span className={styles.importingText}>Import en cours…</span>
          </div>
        )}
        {csvImportPhase === "error" && (
          <div className={styles.errorStack}>
            {csvImportLines.map((line, index) => <span key={index} className={styles.csvErrorLine} ref={(el) => { if (el) el.style.setProperty("--csv-line-color", line.color || COLORS.red); }}>{line.text}</span>)}
            <button type="button" onClick={() => { setCsvImportPhase("idle"); setCsvImportLines([]); setCsvFile(null); }} className={styles.retryButton}>
              Réessayer
            </button>
          </div>
        )}
        {csvImportPhase === "done" && (
          <>
            <div className={styles.csvDoneBadge}>
              <CheckCircle size={13} color={COLORS.success} strokeWidth={2} />
              <span className={styles.csvDoneText}>{csvFile?.name ? `${csvFile.name} · ` : "Fichier chargé · "}{csvDetectedFields.length} champs détectés</span>
            </div>
            <div className={styles.threeColumnGrid}>
              <div><LBL>DÉLIMITEUR</LBL><select value={csvDelim} onChange={(event) => setCsvDelim(event.target.value)} className="input-field"><option value=",">, virgule</option><option value=";">; point-virgule</option><option value="\t">tabulation</option><option value="|">| pipe</option></select></div>
              <div><LBL>ENCODAGE</LBL><select value={csvEnc} onChange={(event) => setCsvEnc(event.target.value)} className="input-field"><option>UTF-8</option><option>ISO-8859-1</option><option>Windows-1252</option></select></div>
              <div><LBL>EN-TÊTES</LBL><select value={csvHeader} onChange={(event) => setCsvHeader(event.target.value)} className="input-field"><option value="first">Première ligne</option><option value="none">Aucun</option></select></div>
            </div>
          </>
        )}
      </div>
    );
  }

  return null;
}
