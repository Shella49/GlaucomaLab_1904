// RNFL_analyzer.ts

type EyeKey = "OD" | "OS";

export function RNFL_analyzer(scan: any) {
  const data = scan?.normalized || scan || {};

  function extractEyeData(eye: any) {
    const rnfl = eye?.rnfl;

    // --- НЕТ RNFL ВООБЩЕ ---
    if (!rnfl) {
      return buildEmpty();
    }

    const avg = rnfl.average ?? null;

    const q = rnfl.quadrants || {};
    const S = q.S ?? null;
    const I = q.I ?? null;
    const N = q.N ?? null;
    const T = q.T ?? null;

    // 🔥 БЕРЁМ ГОТОВЫЙ СТАТУС (НЕ ПЕРЕСЧИТЫВАЕМ)
    const quadrant_status = rnfl.quadrant_status || {};

    // --- ПРОВЕРКА НАЛИЧИЯ ДАННЫХ ---
    const hasQuadrants = [S, I, N, T].some(v => v !== null);
    const hasStatus = Object.values(quadrant_status).some(v => v !== null);
    const hasAnyRNFL = hasQuadrants || hasStatus || avg !== null;

    if (!hasAnyRNFL) {
      return buildEmpty();
    }

    // --- ПОДСЧЁТ ---
    const thin_count = Object.values(quadrant_status)
      .filter(v => v === "thin").length;

    const borderline_count = Object.values(quadrant_status)
      .filter(v => v === "borderline").length;

    // --- ПАТТЕРН ---
    let thinning_pattern: string | null = null;

    if (thin_count === 0 && borderline_count === 0) {
      thinning_pattern = "none";
    } else if (thin_count === 1) {
      thinning_pattern = "focal";
    } else if (thin_count === 2) {
      thinning_pattern = "multifocal";
    } else if (thin_count >= 3) {
      thinning_pattern = "diffuse";
    }

    // --- SEVERITY (если есть avg) ---
    let severity = 0;

    if (avg !== null) {
      if (avg < 50) severity = 5;
      else if (avg < 60) severity = 4;
      else if (avg < 75) severity = 3;
      else if (avg < 85) severity = 2;
      else severity = 0;
    } else if (thin_count >= 3) {
      severity = 4; // fallback
    } else if (thin_count >= 1) {
      severity = 3;
    }

    // --- FEATURES ---
    const features: string[] = [];

    if (thin_count > 0) {
      features.push("rnfl_thinning");
    }

    if (thin_count >= 2) {
      features.push("significant_rnfl_loss");
    }

    if (avg !== null && avg < 50 && thin_count >= 3) {
      features.push("severe_rnfl_loss");
      severity = Math.max(severity, 5);
    } else if (features.includes("significant_rnfl_loss")) {
      severity = Math.max(severity, 4);
    }

    if (thin_count >= 3) {
      features.push("diffuse_loss");
    }

    if (thin_count >= 1 && borderline_count >= 1) {
      features.push("early_structural_loss");
    }

    if (rnfl.local_defect) {
      features.push("local_defect");
    }

    if (rnfl.profile_distorted) {
      features.push("profile_deformation");
      severity = Math.max(severity, 4);
    }

    // --- CLASSIFICATION ---
    const classification =
      rnfl.classification ||
      (thin_count > 0 ? "abnormal" : "normal");

    return {
      avg,
      S,
      I,
      N,
      T,
      quadrant_status,
      classification,
      rnfl_data_missing: false,
      thinning_pattern,
      severity,
      features,
      disc_area: eye.onh?.disc_area ?? null,
      rim_area: eye.onh?.rim_area ?? null,
      cup_area: eye.onh?.cup_area ?? null,
      cdr: eye.onh?.cup_disc_ratio ?? null
    };
  }

  function buildEmpty() {
    return {
      avg: null,
      S: null,
      I: null,
      N: null,
      T: null,
      quadrant_status: {},
      classification: "unknown",
      rnfl_data_missing: true,
      thinning_pattern: null,
      severity: null,
      features: [],
      disc_area: null,
      rim_area: null,
      cup_area: null,
      cdr: null
    };
  }

  return {
    OD: extractEyeData(data?.OD),
    OS: extractEyeData(data?.OS),
    global: {
      note: "RNFL structural analysis (robust)"
    }
  };
}
