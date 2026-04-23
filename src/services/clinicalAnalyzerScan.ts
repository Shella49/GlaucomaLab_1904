// clinicalAnalyzerScan.ts

import { onhAnalyzer } from "./onhAnalyzer";

export function clinicalAnalyzerScan(input: any) {
  const result: any = {};

  ["OD", "OS"].forEach((eye) => {
    const eyeData = input[eye] || {};

    const rnfl = eyeData.rnfl || {};
    const disc = onhAnalyzer(eyeData.disc);

    let severity = 0;
    let features: string[] = [];
    let reasons: string[] = [];

    // --- RNFL ---
    if (rnfl) {
      if (rnfl.severe_loss || (rnfl.features && rnfl.features.includes("severe_rnfl_loss"))) {
        severity = Math.max(severity, 5);
        features.push("severe_rnfl_loss");
        reasons.push("Выраженная потеря RNFL");
      } else if (rnfl.significant_loss || (rnfl.features && rnfl.features.includes("significant_rnfl_loss"))) {
        severity = Math.max(severity, 4);
        features.push("significant_rnfl_loss");
        reasons.push("Значимая потеря RNFL");
      } else if (rnfl.thinning || (rnfl.features && rnfl.features.includes("rnfl_thinning"))) {
        severity = Math.max(severity, 3);
        features.push("rnfl_thinning");
        reasons.push("Истончение RNFL");
      }

      if (rnfl.local_defect || (rnfl.features && rnfl.features.includes("local_defect"))) {
        features.push("local_defect");
        reasons.push("Локальный дефект RNFL");
      }

      if (rnfl.diffuse_loss || (rnfl.features && rnfl.features.includes("diffuse_loss"))) {
        severity = Math.max(severity, 4);
        features.push("diffuse_loss");
      }

      if (rnfl.profile_deformation || rnfl.profile_distorted || (rnfl.features && rnfl.features.includes("profile_deformation"))) {
        severity = Math.max(severity, 4);
        features.push("profile_deformation");
      }

      if (eye === "OS" && (rnfl.early_structural_loss || (rnfl.features && rnfl.features.includes("early_structural_loss")))) {
        severity = Math.max(severity, 5);
      }
    }

    // --- ONH (приоритет) ---
    if (!disc.onh_data_missing) {
      severity = Math.max(severity, disc.severity);

      if (disc.features.length) {
        features.push(...disc.features);
        reasons.push("Изменения диска зрительного нерва (ONH)");
      }
    }

    // --- stage ---
    let stage = "норма";

    if (severity >= 5) stage = "продвинутая_глаукома";
    else if (severity >= 4) stage = "развитая_глаукома";
    else if (severity >= 3) stage = "умеренная_глаукома";
    else if (severity >= 2) stage = "ранняя_глаукома";
    else if (severity >= 1) stage = "подозрение";

    result[eye] = {
      severity,
      score: severity,
      stage,
      features: [...new Set(features)],
      reasons,
      disc
    };
  });

  // --- global ---
  const OD = result.OD;
  const OS = result.OS;

  const worse_eye =
    (OD?.severity || 0) > (OS?.severity || 0) ? "OD" : "OS";

  const asymmetry = Math.abs((OD?.severity || 0) - (OS?.severity || 0));

  result.global = {
    worse_eye,
    stage: result[worse_eye]?.stage,
    asymmetry: asymmetry >= 2 ? "high" : asymmetry === 1 ? "moderate" : "low"
  };

  return result;
}
