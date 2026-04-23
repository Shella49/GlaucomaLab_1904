import { TrustLevel, TrustResult } from "../types";

export function doctorTrustLayer(
  layout: any,
  quality: any,
  confidence: any,
  normalized?: any,
  language: 'ru' | 'en' = 'ru',
  clinical?: any
): TrustResult {
  const isRu = language === 'ru';

  // 🔥 USER FIX: TRUST — от результатов анализа (confidence), а не только от наличия данных
  if (confidence?.confidence_level === "high") {
    return {
      trust_level: "diagnostic",
      message: isRu 
        ? "Результаты анализа полностью диагностически значимы и подтверждены структурными изменениями."
        : "Analysis results are fully diagnostic and confirmed by structural changes."
    };
  }

  // Check for "Strong Structural Signs" (ONH)
  const hasStrongONH_OD = (normalized?.OD?.onh?.ddls >= 8) || 
                          (normalized?.OD?.onh?.cd_vertical >= 0.8) || 
                          (normalized?.OD?.onh?.rim_area !== null && normalized?.OD?.onh?.rim_area < 0.8) ||
                          (normalized?.OD?.onh?.rim_volume !== null && normalized?.OD?.onh?.rim_volume < 0.1);
  
  const hasStrongONH_OS = (normalized?.OS?.onh?.ddls >= 8) || 
                          (normalized?.OS?.onh?.cd_vertical >= 0.8) || 
                          (normalized?.OS?.onh?.rim_area !== null && normalized?.OS?.onh?.rim_area < 0.8) ||
                          (normalized?.OS?.onh?.rim_volume !== null && normalized?.OS?.onh?.rim_volume < 0.1);

  const hasStrongStructuralSigns = hasStrongONH_OD || hasStrongONH_OS;

  // 1. Check for Non-diagnostic (🔴)
  if (!layout.has_tables && !layout.has_onh_parameters) {
    if (hasStrongStructuralSigns) {
      return {
        trust_level: "review_required",
        message: isRu 
          ? "Структурные признаки глаукомной нейрооптикопатии высокой вероятности. Требуется функциональное подтверждение (периметрия) и корреляция с ВГД."
          : "Structural signs of glaucoma neuropathy with high probability. Functional confirmation (perimetry) and correlation with IOP required."
      };
    }
    return {
      trust_level: "not_diagnostic",
      message: isRu 
        ? "Нет цифровых данных (таблиц). Анализ основан только на визуальной оценке снимка."
        : "No quantitative data (no tables). Analysis based on visual assessment only."
    };
  }

  if (quality?.global?.status === "error") {
    return {
      trust_level: "not_diagnostic",
      message: isRu 
        ? "Низкое качество изображения: детали плохо различимы для точного анализа."
        : "Poor image quality: details are too blurry for accurate analysis."
    };
  }

  // 2. Check for Supportive imaging (🟡)
  if (layout.report_type === "BSCAN") {
    return {
      trust_level: "limited",
      message: isRu 
        ? "ОКТ B-скан: обзорное исследование, недостаточно данных для количественного анализа" 
        : "OCT B-scan: overview study, insufficient for quantitative analysis"
    };
  }

  // 3. Check for Diagnostic studies (🟢)
  const isGlaucoma = layout.report_type === "RNFL" || layout.has_onh_parameters;
  const isRetina = layout.report_type === "MACULA" || layout.has_etdrs_grid || layout.report_type === "GCC";
  const isDiagnostic = isGlaucoma || isRetina;
  
  if (!isDiagnostic) {
    return {
      trust_level: "limited",
      message: isRu 
        ? "Вспомогательное исследование: требуется основной диагностический протокол"
        : "Supportive study: main diagnostic protocol required"
    };
  }
  
  // 4. Check analytical confidence
  const score = confidence?.confidence_score || 0;

  if (hasStrongStructuralSigns && score < 85) {
    return {
      trust_level: "review_required",
      message: isRu 
        ? "Структурные признаки глаукомной нейрооптикопатии высокой вероятности. Требуется функциональное подтверждение (периметрия) и корреляция с ВГД."
        : "Structural signs of glaucoma neuropathy with high probability. Functional confirmation (perimetry) and correlation with IOP required."
    };
  }

  if (score < 40) {
    return {
      trust_level: "not_diagnostic",
      message: isRu 
        ? "Аналитическая достоверность слишком низка для постановки диагноза"
        : "Analytical confidence too low for diagnosis"
    };
  }

  if (score < 60) {
    return {
      trust_level: "limited",
      message: isRu 
        ? "Ограниченная аналитическая ценность из-за несоответствия данных"
        : "Limited analytical value due to data inconsistency"
    };
  }

  if (score < 85) {
    return {
      trust_level: "review_required",
      message: isRu 
        ? "Рекомендуется проверка врачом: проверьте клиническую состоятельность"
        : "Doctor review recommended: verify clinical consistency"
    };
  }

  // 5. Check for completeness (both eyes)
  const hasBothEyes = layout.eye === "BOTH" || (layout.eye !== "unknown" && layout.eye !== "OD" && layout.eye !== "OS");
  if (!hasBothEyes && score < 90) {
    return {
      trust_level: "review_required",
      message: isRu 
        ? "Анализ одного глаза: требуется проверка для полного клинического контекста"
        : "Single eye analysis: review required for full clinical context"
    };
  }

  return {
    trust_level: "trusted",
    message: isRu 
      ? "Анализ пригоден для клинической интерпретации"
      : "Analysis suitable for clinical interpretation"
  };
}
