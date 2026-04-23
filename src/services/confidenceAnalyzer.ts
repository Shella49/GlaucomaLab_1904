import { OCTStudy, ConfidenceResult } from "../types";

/**
 * Confidence Analyzer
 * Calculates a confidence score based on study quality, completeness, and consistency.
 * This is a deterministic clinical logic module, not an AI agent.
 */
export function confidenceAnalyzer(
  layout: OCTStudy['layout'],
  normalized: OCTStudy['normalized'],
  clinical: OCTStudy['clinical'],
  raw_metrics: OCTStudy['raw_metrics']
): ConfidenceResult {

  let score = 100;
  const reasons: string[] = [];

  // -----------------------------
  // 1. Study Type
  const isGlaucoma = layout.report_type === "RNFL" || layout.report_type === "ONH" || layout.has_rnfl_plot || layout.has_onh_parameters;
  const isRetina = layout.report_type === "MACULA" || layout.has_etdrs_grid;

  if (!isGlaucoma && !isRetina) {
    score -= 40;
    reasons.push("Неизвестный или недиагностический тип исследования");
  }

  // 2. Quantitative Tables / Grids
  if (!layout.has_tables && !layout.has_etdrs_grid) {
    score -= 30;
    reasons.push("Отсутствуют количественные данные (таблицы/сетки)");
  }

  // 3. Both Eyes Presence
  if (layout.eye !== "BOTH" && layout.eye !== "OD" && layout.eye !== "OS") {
    score -= 20;
    reasons.push("Глаз не идентифицирован");
  }

  // 4. Data Completeness
  if (isGlaucoma) {
    const rnflOD = normalized?.OD?.rnfl?.average;
    const rnflOS = normalized?.OS?.rnfl?.average;
    
    // Check for "Strong Structural Signs" (ONH)
    // If these are present, missing RNFL is less of a confidence killer
    const hasStrongONH_OD = (normalized?.OD?.onh?.ddls >= 8) || 
                            (normalized?.OD?.onh?.cd_vertical >= 0.8) || 
                            (normalized?.OD?.onh?.rim_area != null && normalized?.OD?.onh?.rim_area < 0.8) ||
                            (normalized?.OD?.onh?.rim_volume != null && normalized?.OD?.onh?.rim_volume < 0.1);
    
    const hasStrongONH_OS = (normalized?.OS?.onh?.ddls >= 8) || 
                            (normalized?.OS?.onh?.cd_vertical >= 0.8) || 
                            (normalized?.OS?.onh?.rim_area != null && normalized?.OS?.onh?.rim_area < 0.8) ||
                            (normalized?.OS?.onh?.rim_volume != null && normalized?.OS?.onh?.rim_volume < 0.1);

    const hasStrongStructuralSigns = hasStrongONH_OD || hasStrongONH_OS;

    if (rnflOD == null || rnflOS == null) {
      if (layout.eye === "BOTH") {
        if (!hasStrongStructuralSigns) {
          score -= 25;
          reasons.push("Данные RNFL неполные для обоих глаз");
        } else {
          // We still note it, but we don't penalize as much because ONH is diagnostic
          score -= 5;
          reasons.push("Данные RNFL неполные, но присутствуют выраженные признаки изменений ДЗН");
        }
      }
    }
  }

  // 4.1 Macula Data Sufficiency
  if (isRetina) {
    const checkMacula = (eye: any) => {
      if (!eye || !eye.macula) return false;
      const m = eye.macula;
      const innerValues = Object.values(m.inner_ring || {}).filter(v => v != null);
      const outerValues = Object.values(m.outer_ring || {}).filter(v => v != null);
      return m.central_thickness != null || m.center_etdrs != null || innerValues.length > 0 || outerValues.length > 0;
    };

    const hasOD = checkMacula(normalized?.OD);
    const hasOS = checkMacula(normalized?.OS);

    if (!hasOD && !hasOS) {
      score = 10;
      reasons.push("Отсутствуют критические данные макулы (толщина, ETDRS)");
    } else if ((layout.eye === "BOTH" || layout.eye === "OU") && (!hasOD || !hasOS)) {
      score -= 40;
      reasons.push("Данные макулы (ETDRS) доступны только для одного глаза");
    }
  }

  // 4.2 Quality Cross-Check
  if (clinical?.global?.status === "error") {
     score = Math.min(score, 30);
     reasons.push("Критическая ошибка контроля качества");
  } else if (clinical?.global?.status === "limited") {
     score -= 20;
     reasons.push("Предупреждение контроля качества (Limited status)");
  }

  // -----------------------------
  // 5. Scan Quality (Signal Strength)
  // -----------------------------
  // Find quality/signal metrics in raw_metrics arrays
  const findQuality = (metrics: any) => {
    if (!metrics) return undefined;
    
    // Handle both direct array and nested parameters array (Universal Extractor schema)
    let targetArray: any[] = [];
    if (Array.isArray(metrics)) {
      targetArray = metrics;
    } else if (metrics && typeof metrics === 'object' && Array.isArray(metrics.parameters)) {
      targetArray = metrics.parameters;
    } else if (metrics && typeof metrics === 'object') {
      // If it's an object but not an array and no parameters array, 
      // it might be a single metric object or something else.
      // We don't call .find on it.
      return undefined;
    } else {
      return undefined;
    }

    const qMetric = targetArray.find(m => {
      if (!m || !m.name) return false;
      const name = String(m.name).toLowerCase();
      return name.includes('quality') || name.includes('signal') || name.includes('ss') || name.includes('qi');
    });
    return qMetric ? qMetric.value : undefined;
  };

  const qOD = findQuality(raw_metrics?.OD);
  const qOS = findQuality(raw_metrics?.OS);

  if (qOD != null && qOD < 15) {
    score -= 10;
    reasons.push("Низкое качество сканирования ПГ");
  }

  if (qOS != null && qOS < 15) {
    score -= 10;
    reasons.push("Низкое качество сканирования ЛГ");
  }

  // -----------------------------
  // 6. Feature Consistency
  // -----------------------------
  const featureCountOD = clinical?.OD?.supporting_features ? 
    clinical.OD.supporting_features.length : 0;

  const featureCountOS = clinical?.OS?.supporting_features ? 
    clinical.OS.supporting_features.length : 0;

  const totalFeatures = featureCountOD + featureCountOS;

  if (totalFeatures === 1) {
    score -= 10;
    reasons.push("Выявлен только один слабый клинический признак");
  }

  // -----------------------------
  // Normalize Score & Level
  // -----------------------------
  score = Math.max(0, Math.min(100, score));

  let level: 'low' | 'medium' | 'high' = "high";
  if (score < 80) level = "medium";
  if (score < 50) level = "low";

  // 🔥 ХАРДЕН (USER FIX): Приоритет сильных клинических признаков над отсутствующими данными
  const featuresOD = clinical?.OD?.features || [];
  const featuresOS = clinical?.OS?.features || [];
  const hasStrongRNFL = featuresOD.includes("significant_rnfl_loss") || featuresOS.includes("significant_rnfl_loss");
  const hasMacula = (normalized?.OD?.macula?.central_thickness != null) || (normalized?.OS?.macula?.central_thickness != null);

  if (hasStrongRNFL) {
    level = "high";
    score = Math.max(score, 90);
  } else if (hasMacula) {
    if (level === "low") level = "medium";
    score = Math.max(score, 60);
  }

  return {
    confidence_score: score,
    confidence_level: level,
    reasons
  };
}
