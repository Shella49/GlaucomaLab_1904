/**
 * ASYMMETRY ANALYZER
 * Calculates structural asymmetry between eyes based on severity scores.
 */

export type AsymmetryLevel = "none" | "mild" | "significant";

export interface AsymmetryResult {
  delta: number;
  level: AsymmetryLevel;
  asymmetry_text: string;
}

export function asymmetry_analyzer(odScore: number, osScore: number): AsymmetryResult {
  const delta = Math.abs(odScore - osScore);
  
  let level: AsymmetryLevel = "none";
  let asymmetry_text = "Значимая межглазная асимметрия не выявлена.";

  if (delta < 1) {
    level = "none";
    asymmetry_text = "Симметричное состояние структуры обоих глаз.";
  } else if (delta < 3) {
    level = "mild";
    asymmetry_text = "Выявлена умеренная межглазная асимметрия.";
  } else {
    level = "significant";
    asymmetry_text = "Выявлена выраженная межглазная асимметрия, характерная для глаукомы.";
  }

  return {
    delta,
    level,
    asymmetry_text
  };
}
