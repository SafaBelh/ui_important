import { Spinner } from "@/shared/ui/Spinner";
import styles from "./RouteLoadingFallback.module.css";

export function RouteLoadingFallback() {
  return (
    <div className={styles.root}>
      <div className={`glass-card ${styles.card}`}>
        <Spinner size={18} />
        <span className={styles.label}>Chargement de la page...</span>
      </div>
    </div>
  );
}
