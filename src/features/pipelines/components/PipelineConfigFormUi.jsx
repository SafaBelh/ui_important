import { useState } from "react";
import { X } from "lucide-react";
import { COLORS } from "@/constants/colors";
import { parseStatusTags, stringifyStatusTags } from "./PipelineConfigFormStatusTags";
import styles from "./PipelineConfigFormUi.module.css";

export function LBL({ children }) {
  return <div className={styles.label}>{children}</div>;
}

export function Helper({ children }) {
  return <div className={styles.helper}>{children}</div>;
}

function tagAccentClass(accent) {
  if (accent === "#d97706") return styles.tagAccentOrange;
  if (accent === "#16a34a") return styles.tagAccentGreen;
  return styles.tagAccentInfo;
}

export function TagInput({ value, onChange, placeholder, accent = COLORS.info }) {
  const tags = parseStatusTags(value);
  const [draft, setDraft] = useState("");
  const commit = () => {
    const next = draft.trim();
    if (!next) return;
    if (!tags.includes(next)) onChange(stringifyStatusTags([...tags, next]));
    setDraft("");
  };
  const remove = (tag) => onChange(stringifyStatusTags(tags.filter((item) => item !== tag)));

  return (
    <div className={`input-field ${styles.tagInput}`}>
      {tags.map((tag) => (
        <span key={tag} className={`${styles.tag} ${tagAccentClass(accent)}`}>
          {tag}
          <button type="button" onClick={() => remove(tag)} className={styles.tagRemove}>
            <X size={11} color={accent} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Backspace" && !draft && tags.length) remove(tags[tags.length - 1]);
        }}
        placeholder={tags.length ? "" : placeholder}
        className={styles.tagInputField}
      />
    </div>
  );
}

export function SectionHeader({ num, title, sub, color = "blue" }) {
  const isBlue = color === "blue";

  return (
    <div className={styles.sectionHeader}>
      <span className={`${styles.sectionBadge} ${isBlue ? styles.sectionBadgeBlue : styles.sectionBadgeRed}`}>{num}</span>
      <span className={`${styles.sectionTitle} ${isBlue ? styles.sectionTitleBlue : styles.sectionTitleRed}`}>{title}</span>
      {sub && <span className={styles.sectionSub}>• {sub}</span>}
    </div>
  );
}

export function SliderField({ label, value, min, max, step, onChange, fmt, hint }) {
  return (
    <div>
      <div className={styles.sliderHeader}>
        <LBL>{label}</LBL>
        <div className={styles.sliderValue}>{fmt(value)}</div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className={styles.sliderInput} />
      {hint && <Helper>{hint}</Helper>}
    </div>
  );
}
