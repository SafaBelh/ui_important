import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/shared/ui/Icon";
import { COLORS } from "@/constants/colors";
import styles from "./Modal.module.css";

export function Modal({
  open,
  onClose,
  children,
  size = "600px",
  title,
  subtitle,
  icon,
  noScroll = false,
}) {
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open || !boxRef.current) return;
    boxRef.current.style.setProperty("--modal-max-width", size);
  }, [open, size]);

  if (!open) return null;
  const boxClassName = `modal-box scale-in ${styles.box}${noScroll ? ` ${styles.boxNoScroll}` : ""}`;
  const modalContent = (
    <div className="modal-overlay">
      <div className="modal-bg" onClick={onClose} />
      <div
        ref={boxRef}
        className={boxClassName}
      >
        {(title || icon) && (
          <div className={styles.header}>
            <div className={styles.heading}>
              {icon}
              <div>
                {title && (
                  <h3 className={styles.title}>
                    {title}
                  </h3>
                )}
                {subtitle && (
                  <p className={styles.subtitle}>
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className={`btn-icon ${styles.closeButton}`}
            >
              <Icon name="x" size={15} color={COLORS.grey500} />
            </button>
          </div>
        )}
        {noScroll ? (
          <div className={styles.noScrollBody}>
            {children}
          </div>
        ) : (
          <div className={styles.body}>{children}</div>
        )}
      </div>
    </div>
  );
  return createPortal(modalContent, document.body);
}
