import { PatientRecord, DatasetCompletenessResult } from "../types";

/**
 * AGENT: Dataset Completeness Agent
 * ROLE: Evaluate how complete the clinical dataset is for a definitive diagnosis.
 */
export function datasetCompletenessAgent(patient: PatientRecord): DatasetCompletenessResult {
  const present: string[] = [];
  const missing: string[] = [];
  const recommendations: string[] = [];
  let score = 0;

  // OCT (Structural) - 40%
  const hasOCT = patient.studies.some(s => s.type === 'OCT' && s.role === 'STRUCTURAL_GLAUCOMA' && s.usability !== 'NON_DIAGNOSTIC');
  if (hasOCT) {
    score += 40;
    present.push("ОКТ (Структурные данные)");
  } else {
    missing.push("ОКТ (Структурные данные)");
    recommendations.push("Выполните ОКТ (RNFL/ONH) для оценки структурных изменений.");
  }

  // Perimetry (Functional) - 30%
  const hasPerimetry = patient.studies.some(s => s.type === 'PERIMETRY' && s.usability !== 'NON_DIAGNOSTIC');
  if (hasPerimetry) {
    score += 30;
    present.push("Периметрия (Функциональные данные)");
  } else {
    missing.push("Периметрия (Функциональные данные)");
    recommendations.push("Выполните тест поля зрения (периметрию) для оценки функциональных нарушений.");
  }

  // IOP (Pressure) - 15%
  const hasIOP = !!(patient.clinical_data?.IOP?.OD?.value || patient.clinical_data?.IOP?.OS?.value);
  if (hasIOP) {
    score += 15;
    present.push("Измерение ВГД");
  } else {
    missing.push("Измерение ВГД");
    recommendations.push("Измерьте внутриглазное давление (ВГД).");
  }

  // CCT (Pachymetry) - 10%
  const hasCCT = !!(patient.clinical_data?.CCT?.OD || patient.clinical_data?.CCT?.OS);
  if (hasCCT) {
    score += 10;
    present.push("ЦТР (Пахиметрия)");
  } else {
    missing.push("ЦТР (Пахиметрия)");
    recommendations.push("Выполните пахиметрию (ЦТР) для коррекции показателей ВГД.");
  }

  // Risk Factors - 5%
  const hasRisk = !!(patient.clinical_data?.risk_factors);
  if (hasRisk) {
    score += 5;
    present.push("Оценка факторов риска");
  } else {
    missing.push("Оценка факторов риска");
    recommendations.push("Оцените клинические факторы риска (семейный анамнез, миопия и др.).");
  }

  // Rejected Studies
  const rejected = patient.studies
    .filter(s => s.status === 'rejected')
    .map(s => ({
      modality: s.modality,
      id: s.id,
      explanation: s.layout?.quality_explanation || 'Причина не указана'
    }));

  return {
    score,
    present,
    missing,
    recommendations,
    rejected: rejected.length > 0 ? rejected : undefined
  };
}
