import { Component } from "react";
import styles from "./ErrorBoundary.module.css";

export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return this.props.fallback ?? (
      <div
        role="alert"
        className={styles.root}
      >
        <div className={`glass-card ${styles.card}`}>
          <div className={styles.label}>
            Erreur d'affichage
          </div>
          <h2 className={styles.title}>Cette page n'a pas pu se charger.</h2>
          <p className={styles.message}>
            Changez de page ou rechargez l'application. L'erreur est isolée pour éviter un écran blanc complet.
          </p>
        </div>
      </div>
    );
  }
}
