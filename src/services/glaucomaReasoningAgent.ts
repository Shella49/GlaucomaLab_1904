import { ReasoningResult } from "../types";

/**
 * AGENT: Glaucoma Reasoning Agent
 * ROLE: Integrate diagnosis_agent data to reach clinical conclusion.
 */
export function glaucomaReasoningAgent(patient: { diagnosis_agent?: any }): ReasoningResult {
  const diag = patient["diagnosis_agent"];
  const logic_path: string[] = [];
  let confidence = 0;

  if (!diag) {
    throw new Error("diagnosis_agent output missing");
  }

  if (!("final_diagnosis" in diag)) {
    throw new Error("final_diagnosis missing in diagnosis_agent");
  }

  const diagnosis = diag["final_diagnosis"];
  
  if (!diagnosis || diagnosis === 'Unknown') {
    throw new Error("diagnosis_agent final_diagnosis is unknown");
  }

  logic_path.push(`Диагноз взят из diagnosis_agent: ${diagnosis}`);

  // Оценка структурного статуса
  if (diag.structural) {
    switch (diag.structural.status) {
      case "advanced_damage":
        logic_path.push(`Выявлены выраженные структурные повреждения в ${diag.structural.worst_eye === 'OD' ? 'правом глазу (OD)' : 'левом глазу (OS)'}.`);
        confidence = 0.9;
        break;
      case "moderate_damage":
        logic_path.push(`Выявлены умеренные структурные повреждения.`);
        confidence = 0.75;
        break;
      case "early_damage":
        logic_path.push(`Выявлены начальные структурные повреждения.`);
        confidence = 0.6;
        break;
      case "normal":
        logic_path.push("Значимых структурных повреждений не выявлено.");
        confidence = Math.max(confidence, 0.3);
        break;
      default:
        logic_path.push("Статус структурных изменений не определен.");
        confidence = Math.max(confidence, 0.5);
    }
  }

  // Оценка функционального статуса
  if (diag.functional) {
    if (diag.functional.status && diag.functional.status !== "unknown") {
      const funcStatus = diag.functional.status === 'functional_damage' ? 'выявлены функциональные нарушения' : 
                         diag.functional.status === 'early_functional_loss' ? 'начальные функциональные потери' : 'норма';
      logic_path.push(`Функциональные доказательства: ${funcStatus}`);
      confidence = Math.max(confidence, 0.7);
    } else {
      logic_path.push("Функциональный статус неизвестен или недоступен.");
    }
  }

  // Ограничиваем максимальный confidence
  confidence = Math.min(confidence, 0.99);

  const result: ReasoningResult = {
    confidence_reasoning: confidence,
    summary: `Клиническое заключение для диагноза: ${diagnosis}`,
    explanation: `Диагноз: ${diagnosis} на основании: ${logic_path.join(" ")}`,
    logic_path
  };

  // Guardrail: Reasoning cannot output diagnosis
  if ("diagnosis" in (result as any)) {
    throw new Error("Reasoning cannot output diagnosis");
  }

  return result;
}
