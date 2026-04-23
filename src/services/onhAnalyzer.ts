// onhAnalyzer.ts

export function onhAnalyzer(data: any) {
  if (!data) {
    return {
      onh_data_missing: true,
      classification: "unknown",
      severity: 0,
      features: []
    };
  }

  const cdr = (data.cdr !== undefined) ? data.cdr : (data.v_cd_ratio !== undefined ? data.v_cd_ratio : null);
  const rim = (data.rim_area !== undefined) ? data.rim_area : null;
  const ddls = (data.ddls !== undefined) ? data.ddls : null;

  const hasData = cdr !== null || rim !== null || ddls !== null;

  if (!hasData) {
    return {
      onh_data_missing: true,
      classification: "unknown",
      severity: 0,
      features: []
    };
  }

  let severity = 0;
  let features: string[] = [];

  // --- CDR анализ ---
  if (cdr !== null) {
    if (cdr >= 0.9) {
      severity = Math.max(severity, 5);
      features.push("extreme_cdr");
    } else if (cdr >= 0.8) {
      severity = Math.max(severity, 4);
      features.push("advanced_cupping");
    } else if (cdr >= 0.6) {
      severity = Math.max(severity, 3);
      features.push("moderate_cupping");
    } else if (cdr >= 0.5) {
      severity = Math.max(severity, 2);
      features.push("early_cupping");
    }
  }

  // --- Rim анализ ---
  if (rim !== null) {
    if (rim < 0.2) {
      severity = Math.max(severity, 5);
      features.push("rim_loss");
    } else if (rim < 0.5) {
      severity = Math.max(severity, 4);
      features.push("rim_thinning");
    }
  }

  // --- DDLS (если есть — приоритетный) ---
  if (ddls !== null) {
    if (ddls >= 8) {
      severity = Math.max(severity, 5);
      features.push("ddls_advanced");
    } else if (ddls >= 6) {
      severity = Math.max(severity, 4);
      features.push("ddls_moderate");
    } else if (ddls >= 4) {
      severity = Math.max(severity, 3);
      features.push("ddls_early");
    }
  }

  // --- классификация ---
  let classification = "normal";

  if (severity >= 5) classification = "advanced";
  else if (severity >= 3) classification = "moderate";
  else if (severity >= 1) classification = "suspect";

  return {
    onh_data_missing: false,
    cdr,
    rim_area: rim,
    ddls,
    classification,
    severity,
    features
  };
}
