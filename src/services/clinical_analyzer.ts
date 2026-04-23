/**
 * CLINICAL CORE (analyzeOCT Engine)
 * Final Stage: Determines diagnosis and features based on pre-analyzed input.
 */

// ======================
// MAIN ENGINE
// ======================

import { onhAnalyzer } from "./onhAnalyzer";
import { asymmetry_analyzer } from "./asymmetry_analyzer";

export function clinical_analyzer(input: any) {
  const data = input.masterAggregated || input.master_aggregator || input.AGGREGATED || input || {};
  
  console.log("INPUT TO CLINICAL", data);

  function analyzeEye(eye: any) {
    const disc = onhAnalyzer(eye?.disc || eye?.RNFL || eye);
    const features: string[] = [...(eye?.features || []), ...(disc.features || [])];
    const confidence = eye?.confidence || "low";

    // 🔑 CALCULATE EYE SEVERITY SCORE (Numerical Damage)
    const rnfl = eye?.rnfl || {};
    const rnfl_global_loss = (features.includes("diffuse_loss") || features.includes("severe_rnfl_loss") || features.includes("significant_rnfl_loss")) ? 1 : 0;
    const rnfl_focal_defects = (features.includes("local_defect") || features.includes("notch") || features.includes("focal_defect")) ? 1 : 0;
    
    // Count thin quadrants
    let quadrants_thin_count = 0;
    if (rnfl.quadrant_status) {
      quadrants_thin_count = Object.values(rnfl.quadrant_status).filter(v => v === "thin").length;
    } else if (eye?.quadrant_status) {
      quadrants_thin_count = Object.values(eye.quadrant_status).filter(v => v === "thin").length;
    }

    // Count thin clock hours
    let clock_hours_thin_count = 0;
    if (rnfl.clock_hour_status) {
      clock_hours_thin_count = Object.values(rnfl.clock_hour_status).filter(v => v === "thin").length;
    } else if (eye?.clock_hour_status) {
      clock_hours_thin_count = Object.values(eye.clock_hour_status).filter(v => v === "thin").length;
    }

    const eye_damage_score = (
      rnfl_global_loss * 2 +
      rnfl_focal_defects * 1.5 +
      quadrants_thin_count * 1 +
      clock_hours_thin_count * 0.5
    );

    let score = 0;
    const reasons: string[] = [];

    // 🔑 STAGING SCORING (Keep for classification)
    if (features.includes("severe_rnfl_loss")) {
      score = Math.max(score, 5);
      reasons.push("Тяжелая деструкция слоя RNFL");
    } else if (features.includes("significant_rnfl_loss")) {
      score = Math.max(score, 4);
      reasons.push("Значимая потеря волокон RNFL");
    } else if (features.includes("profile_deformation")) {
      score = Math.max(score, 4);
      reasons.push("Выраженная деформация профиля RNFL");
    } else if (features.includes("rnfl_thinning")) {
      score = Math.max(score, 2);
      reasons.push("Выявлено истончение RNFL");
    }

    if (disc.classification === "unknown") {
      reasons.push("Данные ДЗН отсутствуют или недостаточны");
    } else if (features.includes("extreme_cdr") || features.includes("advanced_cupping")) {
      score = Math.max(score, 4);
      reasons.push("Выраженная экскавация диска (Cupping)");
    } else if (features.includes("moderate_cupping") || features.includes("early_cupping")) {
      score = Math.max(score, 2);
      reasons.push("Расширение экскавации диска");
    }

    if (features.includes("rim_loss") || features.includes("rim_thinning")) {
      score = Math.max(score, 3);
      reasons.push("Иссушение нейроретинального пояска (Rim area)");
    }

    if (features.includes("ddls_advanced")) {
      score = Math.max(score, 5);
      reasons.push("Терминальная стадия по шкале DDLS");
    } else if (features.includes("ddls_moderate")) {
      score = Math.max(score, 4);
      reasons.push("Развитая стадия поражения по DDLS");
    } else if (features.includes("ddls_early")) {
      score = Math.max(score, 2);
      reasons.push("Начальные изменения по DDLS");
    }

    if (features.includes("macula_thinning")) {
      score = Math.max(score, score > 0 ? score : 2);
      reasons.push("Истончение макулярной зоны");
    }

    // 🔑 STAGING (5-tier system)
    let stage = "норма";

    if (score >= 5) stage = "продвинутая_глаукома";
    else if (score >= 4) stage = "развитая_глаукома";
    else if (score >= 3) stage = "умеренная_глаукома";
    else if (score >= 2) stage = "ранняя_глаукома";
    else if (score >= 1) stage = "подозрение";

    return {
      damage_score: eye_damage_score,
      score,
      features,
      severity: score,
      stage,
      confidence,
      reasons,
      disc,
      onh_status: disc.classification
    };
  }

  const OD = analyzeEye(data.OD);
  const OS = analyzeEye(data.OS);

  // 🔑 AUTOMATIC WORSE EYE (Numerical Damage Priority)
  let worseEye = "symmetric";
  if (OD.damage_score > OS.damage_score) {
    worseEye = "OD";
  } else if (OS.damage_score > OD.damage_score) {
    worseEye = "OS";
  }

  // 🔑 ASYMMETRY ANALYSIS
  const asymmetry = asymmetry_analyzer(OD.damage_score, OS.damage_score);

  const maxScore = Math.max(OD.score, OS.score);
  let globalStage = "норма";

  if (maxScore >= 5) globalStage = "продвинутая_глаукома";
  else if (maxScore >= 4) globalStage = "развитая_глаукома";
  else if (maxScore >= 3) globalStage = "умеренная_глаукома";
  else if (maxScore >= 2) globalStage = "ранняя_глаукома";
  else if (maxScore >= 1) globalStage = "подозрение";

  // 🔑 ТЕКСТОВОЕ ЗАКЛЮЧЕНИЕ
  let conclusion = "Структурные изменения не выявлены. Признаков глаукомы не обнаружено.";

  if (globalStage === "подозрение") {
    conclusion = "Выявлены пограничные структурные изменения, требующие клинического наблюдения.";
  } else if (globalStage === "ранняя_глаукома") {
    conclusion = "Обнаружены начальные структурные признаки глаукомной оптиконейропатии.";
  } else if (globalStage === "умеренная_глаукома") {
    conclusion = "Выявлены умеренные глаукомные изменения RNFL и диска зрительного нерва.";
  } else if (globalStage === "развитая_глаукома") {
    conclusion = "Выраженные структурные изменения. Высокая вероятность развитой стадии глаукомы.";
  } else if (globalStage === "продвинутая_глаукома") {
    conclusion = "Терминальные структурные изменения. Картина соответствует продвинутой стадии глаукомы.";
  }

  // Inject asymmetry note
  if (asymmetry.level !== "none") {
    conclusion += ` ${asymmetry.asymmetry_text}`;
  }

  return {
    OD,
    OS,
    global: {
      worse_eye: worseEye,
      stage: globalStage,
      asymmetry: asymmetry.level,
      asymmetry_details: asymmetry,
      confidence: data.global?.confidence || "low",
      conclusion
    }
  };
}

