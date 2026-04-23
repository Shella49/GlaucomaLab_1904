/**
 * УЛУЧШЕННЫЙ ГЕНЕРАТОР ОТЧЁТА (V2)
 * Детерминированный конструктор финального медицинского заключения.
 */

import { translateFeature } from "../lib/featureTranslations";

export function generateOCTReport(input: any) {
  const agg =
    input.masterAggregator ||
    input.master_aggregator ||
    {};

  const clinical =
    input.clinical ||
    input.clinical_analyzer_final ||
    {};

  function eyeBlock(name: "OD" | "OS", eye: any) {
    if (!eye) return "";

    const quality = eye.quality || {};

    const qualityText =
      quality.scan_quality === "good"
        ? "удовлетворительное"
        : quality.scan_quality === "bad"
        ? "сниженное"
        : "неопределено";

    const features =
      (eye.features || []).length > 0
        ? eye.features.map(translateFeature).join("; ")
        : "патологических изменений не выявлено";

    return `
${name} (${name === "OD" ? "правый глаз" : "левый глаз"})
Качество исследования: ${qualityText}
Выявленные изменения: ${features}
`;
  }

  const report = `
ПРОТОКОЛ ОКТ

Выполнена спектральная оптическая когерентная томография обоих глаз.

${eyeBlock("OD", agg.OD)}

${eyeBlock("OS", agg.OS)}

ЗАКЛЮЧЕНИЕ

${clinical?.global?.conclusion || "Недостаточно данных для интерпретации."}

Рекомендована клиническая корреляция с функциональными методами исследования (периметрия, внутриглазное давление) и динамическое наблюдение.
`;

  return {
    report_text: report.trim()
  };
}
