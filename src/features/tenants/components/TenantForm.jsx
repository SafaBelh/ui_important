// Tenant create/edit form (name, colour, storage, parent). Extracted from TenantsView.
import { useState } from "react";
import { Icon } from "@/shared/ui/Icon";
import { Plus } from "lucide-react";
import { COLORS } from "@/constants/colors";
import { COLORS_PALETTE, _generatePassword } from "@/features/tenants/utils/tenantsShared";
import styles from "./TenantForm.module.css";

const cx = (...classes) => classes.filter(Boolean).join(" ");

const colorClasses = {
  "#D94F3D": styles.colorRed,
  "#3B82F6": styles.colorBlue,
  "#10B981": styles.colorGreen,
  "#F59E0B": styles.colorAmber,
  "#8B5CF6": styles.colorViolet,
  "#06B6D4": styles.colorCyan,
  "#F97316": styles.colorOrange,
  "#EC4899": styles.colorRose,
  "#84CC16": styles.colorLime,
  "#14B8A6": styles.colorTeal,
};

// ── TenantForm ─────────────────────────────────────────────────────────────────
export function TenantForm({ initial, parentId, onSave, onCancel, title }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [color, setColor] = useState(initial?.color ?? COLORS_PALETTE[0]);
  const plan = initial?.plan ?? "Pro";
  const [storage, setStorage] = useState(initial?.storage ?? "shared");
  const [step, setStep] = useState(1);
  const isEdit = !!initial?.id;

  const [currentPassword, setCurrentPassword] = useState(isEdit ? "" : _generatePassword());
  const regenerate = () => setCurrentPassword(_generatePassword());
  const suggestedUsername = name.trim().replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").toLowerCase();
  const passwordStrong = currentPassword.length >= 12 && /[A-Z]/.test(currentPassword) && /[a-z]/.test(currentPassword) && /[0-9]/.test(currentPassword) && /[^A-Za-z0-9]/.test(currentPassword);
  const passwordScore = [
    currentPassword.length >= 8,
    currentPassword.length >= 12,
    /[A-Z]/.test(currentPassword),
    /[a-z]/.test(currentPassword),
    /[0-9]/.test(currentPassword),
    /[^A-Za-z0-9]/.test(currentPassword),
  ].filter(Boolean).length;
  const passwordStrength =
    passwordScore >= 6
      ? { label: "Fort", level: "strong" }
      : passwordScore >= 4
      ? { label: "Correct", level: "ok" }
      : { label: "Faible", level: "weak" };
  const passwordHint = passwordStrong
    ? "Robuste : longueur, majuscules, minuscules, chiffres et symbole inclus."
    : "Conseillé : 12 caractères avec majuscule, minuscule, chiffre et symbole.";

  const valid = isEdit
    ? name.trim().length >= 2 && username.trim().length >= 2 && (!currentPassword || currentPassword.length >= 8)
    : name.trim().length >= 2 && username.trim().length >= 2 && currentPassword.length >= 8;

  const totalSteps = isEdit ? 1 : 2;
  const tenantColorClass = colorClasses[color] ?? styles.colorRed;

  // Color name map for display
  const colorNames = {
    "#D94F3D": "Rouge",
    "#3B82F6": "Bleu",
    "#10B981": "Vert",
    "#F59E0B": "Ambre",
    "#8B5CF6": "Violet",
    "#06B6D4": "Cyan",
    "#F97316": "Orange",
    "#EC4899": "Rose",
    "#84CC16": "Lime",
    "#14B8A6": "Teal",
  };

  return (
    <div className={cx("fade-in", styles.formCard)}>
      {/* ── Top bar ── */}
      <div className={styles.topBar}>
        <div className={cx(styles.avatar, tenantColorClass)}>
          {name ? name.slice(0, 2).toUpperCase() : isEdit ? <Icon name="edit" size={15} color="#fff" /> : <Plus size={15} color="#fff" />}
        </div>
        <div className={styles.titleBlock}>
          <div className={styles.title}>{title}</div>
          {!isEdit && (
            <div className={styles.stepSubtitle}>
              Étape {step} sur {totalSteps} · {step === 1 ? "Identité & configuration" : "Credentials d'accès"}
            </div>
          )}
        </div>
        {/* Step pills */}
        {!isEdit && (
          <div className={styles.stepPills}>
            {[1, 2].map(s => (
              <div
                key={s}
                className={cx(styles.stepPill, s === step && styles.stepPillActive, s < step && styles.stepPillComplete)}
              />
            ))}
          </div>
        )}
        <button onClick={onCancel} className={styles.closeButton}>
          <Icon name="x" size={14} color={COLORS.grey400} />
        </button>
      </div>

      <div className={styles.body}>
        {/* ── STEP 1: Identity ── */}
        {(step === 1 || isEdit) && (
          <div className={styles.stepColumn}>
            {/* Name */}
            <div>
              <div className={styles.label}>
                <span className={styles.hash}>#</span>
                NOM <span className={styles.required}>*</span>
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={styles.input}
                placeholder="Nom de l'entité…"
                autoFocus={!isEdit}
              />
            </div>

            {/* Color picker — redesigned */}
            <div>
              <div className={styles.label}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".5" /><circle cx="17.5" cy="10.5" r=".5" /><circle cx="8.5" cy="7.5" r=".5" /><circle cx="6.5" cy="12.5" r=".5" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.47-1.125-.29-.29-.47-.688-.47-1.125 0-.94.748-1.688 1.688-1.688h1.996c3.051 0 5.555-2.504 5.555-5.555 0-4.97-4.47-9-10-9z" /></svg>
                COULEUR D'IDENTITÉ
              </div>
              <div className={styles.colorGrid}>
                {COLORS_PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    title={colorNames[c]}
                    className={cx(styles.colorSwatch, colorClasses[c], color === c && styles.colorSwatchActive)}
                  />
                ))}
              </div>
            </div>

            {/* Storage — only for top-level tenants on create */}
            {!parentId && !isEdit && (
              <div>
                <div className={styles.label}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>
                  STOCKAGE DES DONNÉES
                </div>
                <div className={styles.storageGrid}>
                  {[
                    {
                      id: "shared",
                      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>,
                      label: "Base partagée",
                      desc: "Multi-tenant logique. Plus rapide à provisionner.",
                      badge: "RECOMMANDÉ",
                      badgeClass: styles.badgeRecommended,
                    },
                    {
                      id: "dedicated",
                      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></svg>,
                      label: "Base dédiée",
                      desc: "Isolation physique. Conformité maximale.",
                      badge: "ENTERPRISE",
                      badgeClass: styles.badgeEnterprise,
                    },
                  ].map(opt => {
                    const active = storage === opt.id;

                    return (
                      <button
                        key={opt.id}
                        onClick={() => setStorage(opt.id)}
                        className={cx(styles.storageOption, tenantColorClass, active && styles.storageOptionActive)}
                      >
                        <div className={styles.storageHeader}>
                          <div className={cx(styles.storageIcon, active && styles.storageIconActive)}>
                            {opt.icon}
                          </div>
                          <span className={cx(styles.badge, opt.badgeClass)}>
                            {opt.badge}
                          </span>
                        </div>
                        <div>
                          <div className={cx(styles.storageLabel, active && styles.storageLabelActive)}>{opt.label}</div>
                          <div className={styles.storageDesc}>{opt.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions for edit mode */}
            {isEdit && (
              <div className={styles.editActions}>
                <div className={styles.credentialsGrid}>
                  <div>
                    <div className={styles.label}>
                      <Icon name="key" size={10} color={COLORS.grey400} />
                      NOM D'UTILISATEUR <span className={styles.required}>*</span>
                    </div>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_.-]/g, "").toLowerCase())}
                      className={styles.input}
                      placeholder="tenant_admin"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <div className={styles.label}>
                      <Icon name="key" size={10} color={COLORS.grey400} />
                      RÉINITIALISER LE MOT DE PASSE
                    </div>
                    <div className={styles.passwordRow}>
                      <input
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className={styles.input}
                        type="text"
                        placeholder="Laisser vide pour ne pas changer"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={regenerate}
                        className={cx("btn-ghost", styles.suggestButton)}
                      >
                        Suggérer fort
                      </button>
                    </div>
                    {currentPassword && (
                      <PasswordStrength passwordScore={passwordScore} passwordStrength={passwordStrength} passwordHint={passwordHint} />
                    )}
                  </div>
                </div>
                <div className={styles.actionRowEdit}>
                  <button
                    onClick={() => valid && onSave({ name: name.trim(), username: username.trim(), password: currentPassword.trim(), color, plan, parentId, type: parentId ? "sub_tenant" : "tenant", logo: name.slice(0, 2).toUpperCase(), storage })}
                    disabled={!valid}
                    className={cx("btn-primary", styles.primaryButton, !valid && styles.disabledButton)}
                  >
                    <Icon name="check" size={14} color="#fff" />
                    Enregistrer
                  </button>
                  <button onClick={onCancel} className={cx("btn-ghost", styles.button13)}>Annuler</button>
                </div>
              </div>
            )}

            {/* Next step button for create mode */}
            {!isEdit && (
              <div className={styles.nextActions}>
                <button onClick={onCancel} className={cx("btn-ghost", styles.button12)}>Annuler</button>
                <button
                  onClick={() => setStep(2)}
                  disabled={name.trim().length < 2}
                  className={cx("btn-primary", styles.nextButton, name.trim().length < 2 && styles.disabledButton)}
                >
                  Suivant
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: Credentials ── */}
        {step === 2 && !isEdit && (
          <div className={cx("fade-in", styles.credentialsStep)}>
            {/* Preview */}
            <div className={styles.preview}>
              <div className={cx(styles.previewAvatar, tenantColorClass)}>
                {name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className={styles.previewName}>{name}</div>
                <div className={styles.previewMeta}>{plan} · {storage === "shared" ? "Base partagée" : "Base dédiée"}</div>
              </div>
            </div>

            <div className={styles.credentialsGrid}>
              {/* Username */}
              <div>
                <div className={styles.label}>
                  <Icon name="key" size={10} color={COLORS.grey400} />
                  NOM D'UTILISATEUR <span className={styles.required}>*</span>
                </div>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_.-]/g, "").toLowerCase())}
                  className={styles.input}
                  placeholder={suggestedUsername || "admin_tenant"}
                  autoComplete="off"
                  autoFocus
                />
                {suggestedUsername && username !== suggestedUsername && (
                  <button
                    type="button"
                    onClick={() => setUsername(suggestedUsername)}
                    className={cx("btn-ghost", styles.useSuggestedButton)}
                  >
                    Utiliser : {suggestedUsername}
                  </button>
                )}
              </div>

              {/* Password */}
              <div>
                <div className={styles.label}>
                  <Icon name="key" size={10} color={COLORS.grey400} />
                  MOT DE PASSE <span className={styles.required}>*</span>
                </div>
                <div className={styles.passwordRow}>
                  <input
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className={styles.input}
                    type="text"
                    placeholder="Mot de passe initial…"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={regenerate}
                    className={cx("btn-ghost", styles.suggestButton)}
                    title="Suggérer un mot de passe fort"
                  >
                    Suggérer fort
                  </button>
                </div>
                <PasswordStrength passwordScore={passwordScore} passwordStrength={passwordStrength} passwordHint={passwordHint} />
              </div>
            </div>

            <p className={styles.passwordNotice}>
              Le mot de passe sera affiché une seule fois après création.
            </p>

            {/* Actions */}
            <div className={styles.createActions}>
              <button
                onClick={() => setStep(1)}
                className={cx("btn-ghost", styles.backButton)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                Retour
              </button>
              <div className={styles.spacer} />
              <button onClick={onCancel} className={cx("btn-ghost", styles.button12)}>Annuler</button>
              <button
                onClick={() => valid && onSave({ name: name.trim(), username: username.trim(), password: currentPassword, color, plan, parentId, type: parentId ? "sub_tenant" : "tenant", logo: name.slice(0, 2).toUpperCase(), storage })}
                disabled={!valid}
                className={cx("btn-primary", styles.nextButton, !valid && styles.disabledButton)}
              >
                <Icon name="check" size={13} color="#fff" />
                Créer le tenant
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PasswordStrength({ passwordScore, passwordStrength, passwordHint }) {
  return (
    <div className={styles.strengthBlock}>
      <div className={styles.strengthTrack}>
        <div className={cx(styles.strengthFill, styles[`score${passwordScore}`], styles[passwordStrength.level])} />
      </div>
      <div className={styles.strengthTextRow}>
        <span className={styles.strengthHint}>{passwordHint}</span>
        <span className={cx(styles.strengthLabel, styles[passwordStrength.level])}>{passwordStrength.label}</span>
      </div>
    </div>
  );
}
