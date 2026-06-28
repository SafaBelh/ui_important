export function autoDetect(headers) {
  const score = (h, patterns) => {
    const lh = h.toLowerCase().replace(/[_\-\s]/g, "");
    let best = 0;
    for (const p of patterns) {
      const lp = p.toLowerCase().replace(/[_\-\s]/g, "");
      if (lh === lp) {
        best = Math.max(best, 3);
        continue;
      }
      if (lh.startsWith(lp) || lh.endsWith(lp)) {
        best = Math.max(best, 2);
        continue;
      }
      if (lh.includes(lp) || lp.includes(lh)) best = Math.max(best, 1);
    }
    return best;
  };
  const best = (patterns, exclude = []) => {
    let top = "",
      topScore = 0;
    for (const h of headers) {
      if (exclude.includes(h)) continue;
      const s = score(h, patterns);
      if (s > topScore) {
        topScore = s;
        top = h;
      }
    }
    return topScore > 0 ? top : "";
  };
  const amount = best([
    "amount",
    "montant",
    "netamount",
    "totalamount",
    "total",
    "net",
    "value",
    "mnt",
    "amt",
    "prix",
  ]);
  const date = best(
    [
      "invoicedate",
      "facturedate",
      "date",
      "datepiece",
      "period",
      "issued",
      "created",
    ],
    [amount]
  );
  const supplier = best(
    ["supplier", "fournisseur", "vendor", "tiers", "partner", "codefourn"],
    [amount, date]
  );
  const status = best(
    ["status", "statut", "state", "etat", "flag"],
    [amount, date, supplier]
  );
  const label = best(
    ["label", "libelle", "description", "service", "category", "designation"],
    [amount, date, supplier, status]
  );
  const tenant = best(
    ["tenant", "entite", "entity", "company", "societe", "org"],
    [amount, date, supplier, status, label]
  );
  const docref = best(
    ["reference", "ref", "docref", "invoicenum", "number", "id"],
    [amount, date, supplier, status, label, tenant]
  );
  return { amount, date, supplier, status, label, tenant, docref };
}
