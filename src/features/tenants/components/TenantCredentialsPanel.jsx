// Tenant credential views: read-only creds modal, creds panel, and change-credentials form.
// Extracted from TenantsView.
import { useState } from "react";
import { Icon } from "@/shared/ui/Icon";
import { COLORS } from "@/constants/colors";
import { getTenantCredentials } from "@/features/tenants/model/tenantCredentials";
import { _generatePassword } from "@/features/tenants/utils/tenantsShared";
import { logError } from "@/shared/utils/logError";
import styles from "./TenantCredentialsPanel.module.css";

const cx = (...classes) => classes.filter(Boolean).join(" ");

export function CredsMView({ creds, onClose }) {
  const [copied, setCopied] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const copy = (val, k) => {
    navigator.clipboard.writeText(val).catch((error) => logError("tenantCredentialsModal.copyCredential", error));
    setCopied(k);
    setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div>
      <div className={styles.saveWarning}>
        <span className={styles.iconWrap}><Icon name="triangle" size={14} color={COLORS.warning} /></span>
        <p className={styles.saveWarningText}>Sauvegardez maintenant — le mot de passe ne sera plus affiché</p>
      </div>
      <div className={styles.credentialField}>
        <div className={styles.formLabel}>Nom d'utilisateur</div>
        <div className={styles.credentialValueRow}>
          <span className={styles.modalCredentialValue}>
            {creds.username ?? creds.accessKey ?? "—"}
          </span>
          <button onClick={() => copy(creds.username ?? creds.accessKey ?? "", "usr")} className={cx("btn-icon", styles.iconButtonPad)}>
            {copied === "usr" ? <Icon name="check" size={13} color={COLORS.success} /> : <Icon name="copy" size={13} color={COLORS.grey500} />}
          </button>
        </div>
      </div>
      <div className={styles.credentialField}>
        <div className={styles.formLabel}>Mot de passe</div>
        <div className={styles.credentialValueRow}>
          <span className={styles.modalCredentialValue}>
            {showPassword ? (creds.password ?? creds.apiSecret ?? "—") : "••••••••••••••••••••••••"}
          </span>
          <button onClick={() => setShowPassword((s) => !s)} className={cx("btn-icon", styles.iconButtonPad)}>
            <Icon name={showPassword ? "eyeOff" : "eye"} size={13} color={COLORS.grey500} />
          </button>
          <button onClick={() => copy(creds.password ?? creds.apiSecret ?? "", "pwd")} className={cx("btn-icon", styles.iconButtonPad)}>
            {copied === "pwd" ? <Icon name="check" size={13} color={COLORS.success} /> : <Icon name="copy" size={13} color={COLORS.grey500} />}
          </button>
        </div>
      </div>
      <button onClick={onClose} className={cx("btn-primary", styles.savedButton)}>
        <Icon name="check" size={13} color="#fff" /> J'ai sauvegardé les credentials
      </button>
    </div>
  );
}

// ── CredsPanel ─────────────────────────────────────────────────────────────────
export function CredsPanel({ tenantId, username, onChangeCreds }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(null);
  const storedCreds = getTenantCredentials(tenantId);
  const creds = { username: username || storedCreds?.username || "—" };
  if (!creds) return null;

  const copy = (val, k) => {
    navigator.clipboard.writeText(val).catch((error) => logError("tenantCredentialsPanel.copyUsername", error));
    setCopied(k);
    setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div className={styles.credsPanel}>
      {/* Header */}
      <div className={styles.credsHeader}>
        <span className={styles.credsTitle}>
          <Icon name="key" size={11} color={COLORS.grey500} /> Credentials
        </span>
        <div className={styles.credsActions}>
          {onChangeCreds && (
            <button
              onClick={onChangeCreds}
              className={styles.changeButton}
            >
              <Icon name="refresh" size={10} color={COLORS.red} />
              Modifier
            </button>
          )}
          <button
            onClick={() => setShow((s) => !s)}
            className={styles.toggleButton}
          >
            <Icon name={show ? "eyeOff" : "eye"} size={12} color={COLORS.grey500} />
            {show ? "Masquer" : "Afficher"}
          </button>
        </div>
      </div>

      {show && (
        <div className={cx("fade-in", styles.credsBody)}>
          <div className={styles.credsInfoRow}>
            <span className={styles.credsInfoLabel}>Utilisateur</span>
            <span className={styles.credsInfoValue}>
              {creds.username}
            </span>
            <button onClick={() => copy(creds.username, "usr")} className={styles.copyButton}>
              {copied === "usr" ? <Icon name="check" size={11} color={COLORS.success} /> : <Icon name="copy" size={11} color={COLORS.grey400} />}
            </button>
          </div>
          <div className={styles.credsInfoRow}>
            <span className={styles.credsInfoLabel}>Mot de passe</span>
            <span className={styles.unrecoverableText}>
              Défini à la création · irrécupérable
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ChangeCredentialsForm ──────────────────────────────────────────────────────
export function ChangeCredentialsForm({ tenantId: _tenantId, tenantName, onSave, onCancel }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState(_generatePassword());
  const [showPassword, setShowPassword] = useState(true);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const passwordMatch = password === confirmPassword || confirmPassword === "";
  const valid = username.trim().length >= 2 && password.length >= 8 && password === confirmPassword;

  const strengthScore = (() => {
    let s = 0;
    if (password.length >= 8) s++;
    if (password.length >= 12) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  })();
  const strengthLabel = ["", "Très faible", "Faible", "Moyen", "Fort", "Très fort"][strengthScore] || "";

  const handleSubmit = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await onSave({ username: username.trim(), password });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={cx("fade-in", styles.changeForm)}
    >
      {/* Header */}
      <div className={styles.formHeader}>
        <div className={styles.formHeaderIcon}>
          <Icon name="key" size={14} color={COLORS.red} />
        </div>
        <div className={styles.formTitleWrap}>
          <div className={styles.formTitle}>Modifier les credentials</div>
          <div className={styles.formSubtitle}>{tenantName}</div>
        </div>
        <button onClick={onCancel} className={styles.closeButton}>
          <Icon name="x" size={13} color={COLORS.grey400} />
        </button>
      </div>

      <div className={styles.formBody}>
        {/* Warning */}
        <div className={styles.invalidateWarning}>
          <span className={styles.warningIcon}><Icon name="triangle" size={13} color={COLORS.warning} /></span>
          <p className={styles.invalidateWarningText}>
            Les credentials actuels seront immédiatement invalidés. Assurez-vous que les intégrations utilisant ce tenant sont prêtes.
          </p>
        </div>

        {/* Username */}
        <div>
          <div className={styles.formLabel}>
            <Icon name="user" size={10} color={COLORS.grey400} />
            Nouveau nom d'utilisateur <span className={styles.required}>*</span>
          </div>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            className={styles.textInput}
            placeholder="ex: tenant_admin"
            autoComplete="off"
            autoFocus
          />
          {username.trim().length > 0 && username.trim().length < 2 && (
            <div className={styles.errorText}>Minimum 2 caractères</div>
          )}
        </div>

        {/* Password */}
        <div>
          <div className={styles.passwordHeader}>
            <div className={styles.formLabel}>
              <Icon name="lock" size={10} color={COLORS.grey400} />
              Nouveau mot de passe <span className={styles.required}>*</span>
            </div>
            <button
              onClick={() => setPassword(_generatePassword())}
              className={styles.generateButton}
            >
              <Icon name="refresh" size={10} color={COLORS.info} />
              Générer
            </button>
          </div>
          <div className={styles.passwordInputWrap}>
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              type={showPassword ? "text" : "password"}
              className={cx(styles.textInput, styles.passwordInput)}
              placeholder="Mot de passe sécurisé…"
              autoComplete="new-password"
            />
            <button
              onClick={() => setShowPassword(s => !s)}
              className={styles.passwordToggle}
            >
              <Icon name={showPassword ? "eyeOff" : "eye"} size={13} color={COLORS.grey400} />
            </button>
          </div>
          {/* Strength bar */}
          {password.length > 0 && (
            <div className={cx("fade-in", styles.strength)}>
              <div className={styles.strengthBars}>
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className={cx(styles.strengthBar, i <= strengthScore && styles[`strengthScore${strengthScore}`])} />
                ))}
              </div>
              <div className={cx(styles.strengthLabel, styles[`strengthText${strengthScore}`])}>{strengthLabel}</div>
            </div>
          )}
        </div>

        {/* Confirm password */}
        <div>
          <div className={styles.formLabel}>
            <Icon name="lock" size={10} color={COLORS.grey400} />
            Confirmer le mot de passe <span className={styles.required}>*</span>
          </div>
          <input
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            type="password"
            className={cx(
              styles.textInput,
              confirmPassword.length > 0 && !passwordMatch && styles.inputError,
              confirmPassword.length > 0 && passwordMatch && styles.inputSuccess,
            )}
            placeholder="Répétez le mot de passe…"
            autoComplete="new-password"
          />
          {confirmPassword.length > 0 && !passwordMatch && (
            <div className={styles.errorText}>Les mots de passe ne correspondent pas</div>
          )}
          {confirmPassword.length > 0 && passwordMatch && (
            <div className={styles.successText}>
              <Icon name="check" size={10} color={COLORS.success} /> Mots de passe identiques
            </div>
          )}
        </div>

        {/* Actions */}
        <div className={styles.formActions}>
          <button onClick={onCancel} className={cx("btn-ghost", styles.cancelButton)}>Annuler</button>
          <button
            onClick={handleSubmit}
            disabled={!valid || saving}
            className={cx("btn-primary", styles.submitButton, !valid && styles.disabledSubmit)}
          >
            {saving ? (
              <><Icon name="refresh" size={11} color="#fff" /> Mise à jour…</>
            ) : (
              <><Icon name="check" size={11} color="#fff" /> Mettre à jour</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
