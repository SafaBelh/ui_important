import { useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw, X, Zap } from "lucide-react";
import { previewConnectorConnection } from "@/features/integrations/api/IntegrationAdminApi";
import { INTEGRATION_COLORS } from "@/features/integrations/utils/theme";
import styles from "./TenantStepControls.module.css";

const tagToneClass = (color) => {
  if (color === INTEGRATION_COLORS.warning) return styles.warning;
  if (color === INTEGRATION_COLORS.success) return styles.success;
  return styles.info;
};

export function StatusTagInput({ value = [], onChange, placeholder, color = INTEGRATION_COLORS.info }) {
  const [draft, setDraft] = useState("");
  const tags = Array.isArray(value) ? value : String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  const toneClass = tagToneClass(color);

  const commit = (raw = draft) => {
    const nextValues = String(raw || "").split(",").map((item) => item.trim()).filter(Boolean);
    if (!nextValues.length) return;
    const seen = new Set(tags.map((item) => item.toLowerCase()));
    const merged = [...tags];
    nextValues.forEach((item) => {
      const key = item.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    });
    onChange(merged);
    setDraft("");
  };

  const remove = (item) => onChange(tags.filter((tag) => tag !== item));

  return (
    <div className={`${styles.tagInput} ${toneClass} ${tags.length ? styles.hasTags : styles.empty}`}>
      {tags.map((tag) => (
        <span key={tag} className={`${styles.tag} ${toneClass}`}>
          {tag}
          <button type="button" onClick={() => remove(tag)} className={`${styles.removeTagButton} ${toneClass}`}>
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
        }}
        placeholder={tags.length ? "" : placeholder}
        className={styles.tagInputField}
      />
    </div>
  );
}

export function IsolatedDbTester({ db }) {
  const [state, setState] = useState(null);
  const ready = !!(db?.jdbcUrl && db?.jdbcUsername && db?.jdbcPassword);
  const test = async () => {
    setState({ loading: true });
    try {
      const res = await previewConnectorConnection(null, {
        jdbcUrl: db.jdbcUrl,
        jdbcUsername: db.jdbcUsername,
        jdbcPassword: db.jdbcPassword,
        jdbcDriverClassName: db.jdbcDriverClassName || "org.postgresql.Driver",
      });
      if (res?.status === "ok") setState({ ok: res.message || "Connexion réussie" });
      else setState({ error: res?.message || "Échec de connexion" });
    } catch (error) {
      setState({ error: error.message || "Échec de connexion" });
    }
  };

  return (
    <div className={styles.dbTester}>
      <button type="button" className={`btn btn-ghost ${styles.dbTestButton}`} disabled={!ready || state?.loading} onClick={test}>
        {state?.loading ? <RefreshCw size={11} className="spin" /> : <Zap size={11} />} Tester la connexion DB
      </button>
      {state?.ok && <span className={`${styles.dbStatus} ${styles.dbStatusOk}`}><CheckCircle2 size={12} /> {state.ok}</span>}
      {state?.error && <span className={`${styles.dbStatus} ${styles.dbStatusError}`}><AlertCircle size={12} /> {state.error}</span>}
    </div>
  );
}
