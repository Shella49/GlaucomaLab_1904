/**
 * QUALITY Analyzer
 * Assesses scan quality and calculates confidence level.
 */
export function quality_analyzer(input: any, aggregated_input?: any) {
  function analyzeEye(eye: any, aggregated_eye?: any) {
    if (!eye) return { 
      scan_quality: "bad", 
      rnfl_status: "missing", 
      confidence: "low",
      rnfl_valid: false,
      macula_valid: false,
      issues: ["данные отсутствуют"],
      quality_score: 1,
      features: [] 
    };

    const issues: string[] = [];

    // Quality check
    const signalStrength = eye.quality?.signal_strength;
    const isLowSignal = signalStrength !== null && signalStrength !== undefined && typeof signalStrength === 'number' && signalStrength < 15;
    if (isLowSignal) {
      issues.push("Низкая интенсивность сигнала");
    }

    // Anatomical validation
    // 🔥 КОРРЕКТНЫЙ ФИКС: данные есть, если флаг missing = false или есть специфические признаки
    // SERIES-AWARE: Мы также смотрим на aggregated_eye (данные по всей серии/пациенту)
    const hasRNFL =
      eye.rnfl_data_missing === false ||
      (aggregated_eye?.rnfl_data_missing === false) ||
      (eye.features || []).some((f: string) => f.toLowerCase().includes("rnfl")) ||
      (eye.rnfl?.quadrants && Object.values(eye.rnfl.quadrants).some(v => v !== null)) ||
      eye.rnfl?.average !== null;

    const hasMacula = 
      eye.macula_data_missing === false ||
      (aggregated_eye?.macula_data_missing === false) ||
      (eye.features || []).some((f: string) => f.toLowerCase().includes("macula")) ||
      (eye.macula?.central_thickness !== null && eye.macula?.central_thickness !== undefined);

    let confidence: "high" | "medium" | "low" = "high";
    if (!hasRNFL && !hasMacula) {
      confidence = "low";
    } else if (isLowSignal) {
      confidence = "medium";
    }

    if (!hasRNFL) issues.push("Данные RNFL отсутствуют");
    if (!hasMacula) issues.push("Данные макулы отсутствуют");

    const scan_quality = isLowSignal ? "limited" : (hasRNFL || hasMacula ? "good" : "bad");

    let rnfl_valid = false;
    let rnfl_status = "missing";

    if (hasRNFL) {
      rnfl_valid = true;
      rnfl_status = "available";
    }

    return { 
      scan_quality, 
      rnfl_status,
      rnfl_valid,
      macula_valid: hasMacula,
      confidence,
      issues,
      quality_score: confidence === "high" ? 3 : (confidence === "medium" ? 2 : 1),
      features: eye.features || [] 
    };
  }

  const od = analyzeEye(input.OD, aggregated_input?.OD);
  const os = analyzeEye(input.OS, aggregated_input?.OS);

  return {
    OD: od,
    OS: os,
    global: {
      status: (od.confidence === "low" && os.confidence === "low") ? "bad" : "ok",
      confidence: (od.confidence === "low" || os.confidence === "low") ? "low" : (od.confidence === "medium" || os.confidence === "medium") ? "medium" : "high",
      note: "Scan quality and confidence metadata"
    }
  };
}
