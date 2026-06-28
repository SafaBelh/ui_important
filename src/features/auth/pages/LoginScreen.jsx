import { useState } from "react";
import { Icon } from "@/shared/ui/Icon";
import { Spinner } from "@/shared/ui/Spinner";
import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/authContextValue";
import { setActiveTenant } from "@/shared/model/sessionActions";
import styles from "./LoginScreen.module.css";

export function LoginScreen({ onLogin }) {
  const { login, loading, clearError } = useAuth();
  const [username, setUsername] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e?.preventDefault();
    clearError();
    if (!username || !pass) {
      setErr("Veuillez remplir tous les champs.");
      return;
    }
    setErr("");
    try {
      const userData = await login(username, pass);
      // Admin starts with no tenant filter (global view); only set tenant for non-admin
      if (userData?.isEngineAdmin) {
        setActiveTenant(null, null);
      } else if (userData?.tenantId) {
        setActiveTenant(userData.tenantId);
      }
      onLogin(userData);
    } catch (err) {
      setErr(err.body?.message || err.message || "Identifiants incorrects.");
    }
  };

  const FEATURES = [
    {
      icon: "bolt",
      title: "Scoring temps réel",
      desc: "Chaque facture scorée avec tolérances configurables par série.",
    },
    {
      icon: "sparkle",
      title: "Apprentissage adaptatif",
      desc: "Le feedback affine la détection — par fournisseur, par série.",
    },
    {
      icon: "integrations",
      title: "Connecteurs universels",
      desc: "CSV, SQL, REST, S3, SFTP — toute source connectée en minutes.",
    },
    {
      icon: "chart",
      title: "Audit complet",
      desc: "Chaque alerte, décision, seuil — journalisé et exportable.",
    },
  ];

  return (
    <div className={styles.root}>
      {/* Left */}
      <div
        className={styles.left}
      >
        <div className={`fade-up ${styles.loginPanel}`}>
          <div className={styles.header}>
            <div
              className={styles.logoMark}
            >
              <Icon name="bolt" size={28} color="#fff" />
            </div>
            <h1
              className={styles.title}
            >
              Bienvenue
            </h1>
            <p className={styles.subtitle}>
              Connectez-vous à votre espace AnomalyIQ
            </p>
          </div>
          <form
            onSubmit={submit}
            className={styles.form}
          >
            <div>
              <label
                className={styles.label}
              >
                Identifiant
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field"
                placeholder="admin@anomalyiq.com ou nom_tenant"
              />
            </div>
            <div>
              <label
                className={styles.label}
              >
                Mot de passe
              </label>
              <div className={styles.passwordWrap}>
                <input
                  type={showPass ? "text" : "password"}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  className={`input-field ${styles.passwordInput}`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((p) => !p)}
                  className={styles.passwordToggle}
                >
                  <Icon
                    name={showPass ? "eyeOff" : "eye"}
                    size={16}
                    color={COLORS.grey500}
                  />
                </button>
              </div>
            </div>
            {err && (
              <div
                className={styles.errorBox}
              >
                ⚠ {err}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className={`btn-primary ${styles.submitButton}`}
            >
              {loading ? (
                <>
                  <Spinner size={16} color="#fff" />
                  Connexion…
                </>
              ) : (
                <>Se connecter →</>
              )}
            </button>
          </form>
          <div className={styles.helpBox}>
            Identifiez-vous avec les accès administrateur fournis par votre équipe.
            <br />
            <span className={styles.helpBoxSmall}>
              AnomalyIQ — Détection d&apos;anomalies invoice-to-pay
            </span>
          </div>
        </div>
      </div>
      {/* Right */}
      <div
        className={styles.right}
      >
        <div className={`fade-up ${styles.rightHeader}`}>
          <div
            className={styles.badge}
          >
            <span
              className={styles.badgeText}
            >
              Powered by ML
            </span>
          </div>
          <h2
            className={styles.rightTitle}
          >
            Détectez chaque{" "}
            <span className={styles.rightTitleAccent}>anomalie</span>.
            <br />
            Avant qu'elle ne coûte.
          </h2>
        </div>
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            className={`glass-card-sm fade-up-${Math.min(3, i)} ${styles.featureCard}`}
          >
            <div
              className={styles.featureIcon}
            >
              <Icon name={f.icon} size={18} color={COLORS.red} />
            </div>
            <div>
              <p className={styles.featureTitle}>
                {f.title}
              </p>
              <p
                className={styles.featureDesc}
              >
                {f.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
