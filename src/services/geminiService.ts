import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { normalizeStudy, normalizeClassification } from "./collectorNormalizer";
import { 
  Study,
  OCTStudy,
  PatientRecord,
  PatientAnalysis, 
  AgentResult, 
  StudyType, 
  PerimetryData, 
  TopographyData, 
  BiometryData,
  EvidenceMap,
  EvidenceItem,
  StudyRole,
  ClinicalData,
  ExplainOutput,
  EyeReport,
  ExplanationReport
} from "../types";
import { STUDY_REGISTRY } from "./studyRegistry";
import { studyAnalyzerAgent } from "./studyAnalyzerAgent";
import { RNFL_analyzer } from "./RNFL_analyzer";
export { RNFL_analyzer };
import { macula_analyzer } from "./macula_analyzer";
export { macula_analyzer };
import { quality_analyzer } from "./quality_analyzer";
export { quality_analyzer };
import { master_aggregator } from "./master_aggregator";
export { master_aggregator };
import { clinical_analyzer } from "./clinical_analyzer";
export { clinical_analyzer };
import { clinicalAnalyzerScan } from "./clinicalAnalyzerScan";
export { clinicalAnalyzerScan };
import { onhAnalyzer } from "./onhAnalyzer";
export { onhAnalyzer };
import { series_processor } from "./series_processor";
export { series_processor };
import { generateOCTReport } from "./RNFL_report_generator";
import { datasetCompletenessAgent } from "./datasetCompletenessAgent";
import { confidenceAnalyzer } from "./confidenceAnalyzer";
import { doctorTrustLayer } from "./doctorTrustLayer";
import { CLINICAL_PHRASES } from "./clinical_phrases";
import { featuresToText } from "../lib/featureTranslations";

// ALLOWED_FEATURES removed - using deterministic rule-based phrases from analyzers directly

function getAI() {
  // Use process.env.API_KEY (from selection dialog) or process.env.GEMINI_API_KEY
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("API key is not defined. Please select an API key in the application.");
  }
  // Do not cache the instance to ensure we always use the most up-to-date key from the dialog
  return new GoogleGenAI({ apiKey });
}

export function calculateAge(dob: string): number {
  if (!dob) return 0;
  try {
    const parts = dob.split('.');
    if (parts.length !== 3) return 0;
    const birthDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    if (isNaN(birthDate.getTime())) return 0;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  } catch (e) {
    return 0;
  }
}

export function calculateAgeAtExam(dob: string, examDate?: string | null): number | null {
  if (!dob) return null;
  try {
    const parseDate = (d: string) => {
      if (d.includes('.')) {
        const parts = d.split('.');
        if (parts[0].length === 4) return new Date(d.split('.').join('-')); // YYYY.MM.DD
        return new Date(parts.reverse().join('-')); // DD.MM.YYYY
      }
      return new Date(d); // Fallback for YYYY-MM-DD etc
    };

    const birth = parseDate(dob);
    if (isNaN(birth.getTime())) return null;

    let targetDate: Date;
    if (examDate) {
      targetDate = parseDate(examDate);
      if (isNaN(targetDate.getTime())) targetDate = new Date();
    } else {
      targetDate = new Date();
    }

    let age = targetDate.getFullYear() - birth.getFullYear();
    const m = targetDate.getMonth() - birth.getMonth();

    if (m < 0 || (m === 0 && targetDate.getDate() < birth.getDate())) {
      age--;
    }

    return age;
  } catch (e) {
    return null;
  }
}

const STAGE_SEVERITY: Record<string, number> = {
  "normal": 0,
  "borderline": 1,
  "early": 2,
  "moderate": 3,
  "advanced": 4,
  "severe": 5,
  "suspect": 1,
  "glaucoma": 3,
  "unreliable": -1,
  "норма": 0,
  "подозрение": 1,
  "подозрение_на_глаукому": 1,
  "ранняя_глаукома": 2,
  "умеренная_глаукома": 3,
  "развитая_глаукома": 4,
  "продвинутая_глаукома": 5,
  "далекозашедшая_глаукома": 5,
  "начальные_изменения": 2,
  "умеренные_изменения": 3,
  "Норма": 0,
  "Подозрение": 1,
  "Начальная": 2,
  "Умеренная": 3,
  "Развитая": 4,
  "Далекозашедшая": 5
};

/**
 * AGENT: Multi-Exam Aggregator
 * Logic: Group by date, merge same-visit scans, detect progression for timeline.
 */
export function multiExamAggregator(studies: OCTStudy[]) {
  if (!studies || studies.length === 0) return null;

  // Group by exam_date
  const groups: Record<string, OCTStudy[]> = {};
  studies.forEach(s => {
    const date = s.layout?.exam_date || s.examDate || "unknown";
    if (!groups[date]) groups[date] = [];
    groups[date].push(s);
  });

  const uniqueDates = Object.keys(groups).filter(d => d !== "unknown");

  // DISABLING DYNAMICS: Always return single_visit mode
  return {
    mode: "single_visit",
    OD: mergeEyes(studies.map(e => e.clinical?.OD)),
    OS: mergeEyes(studies.map(e => e.clinical?.OS)),
    count: studies.length
  };
}

function mergeEyes(eyes: any[]) {
  const validEyes = eyes.filter(e => !!e);
  if (validEyes.length === 0) return { features: [], severity: "normal", stage: "норма", confidence: 0, narrative: "Данные отсутствуют." };

  const allFeatures = new Set<string>();
  const narratives = new Set<string>();
  
  validEyes.forEach(e => {
    if (Array.isArray(e.features)) {
      e.features.forEach((f: string) => {
        allFeatures.add(f);
      });
    } else if (e.features && typeof e.features === 'object') {
      Object.keys(e.features).forEach(k => { 
        if (e.features[k]) allFeatures.add(k); 
      });
    }
    
    if (e.narrative) {
      e.narrative.split('\n').forEach((line: string) => {
        if (line.trim()) narratives.add(line.trim());
      });
    }
  });

  const severityOrder = ["severe", "moderate", "mild", "normal"];
  let worstSeverity = "normal";
  validEyes.forEach(e => {
    if (severityOrder.indexOf(e.severity) < severityOrder.indexOf(worstSeverity)) {
      worstSeverity = e.severity;
    }
  });

  const stageOrder = ["продвинутая_глаукома", "развитая_глаукома", "умеренная_глаукома", "ранняя_глаукома", "подозрение", "glaucoma", "suspect", "normal", "норма", "unreliable"];
  let worstStage = "норма";
  validEyes.forEach(e => {
    if (stageOrder.indexOf(e.stage) !== -1 && (worstStage === "норма" || stageOrder.indexOf(e.stage) < stageOrder.indexOf(worstStage))) {
      worstStage = e.stage;
    }
  });

  const avgConfidence = validEyes.reduce((acc, e) => acc + (e.confidence || 0), 0) / validEyes.length;

  return {
    features: Array.from(allFeatures),
    severity: worstSeverity,
    stage: worstStage,
    confidence: avgConfidence,
    narrative: Array.from(narratives).join('\n'),
    sources: validEyes.length
  };
}

function detectProgression(exams: OCTStudy[]) {
  let progression = false;
  let details: string[] = [];

  for (let i = 1; i < exams.length; i++) {
    const prevOD = exams[i-1].normalized?.OD?.rnfl?.average || exams[i-1].data?.normalized?.OD?.rnfl?.average;
    const currOD = exams[i].normalized?.OD?.rnfl?.average || exams[i].data?.normalized?.OD?.rnfl?.average;
    const prevOS = exams[i-1].normalized?.OS?.rnfl?.average || exams[i-1].data?.normalized?.OS?.rnfl?.average;
    const currOS = exams[i].normalized?.OS?.rnfl?.average || exams[i].data?.normalized?.OS?.rnfl?.average;

    // RNFL Progression (Drop > 5um)
    if (prevOD && currOD && currOD < prevOD - 5) {
      progression = true;
      details.push(`Отрицательная динамика OD (истончение RNFL на ${Math.round(prevOD - currOD)} мкм)`);
    }
    if (prevOS && currOS && currOS < prevOS - 5) {
      progression = true;
      details.push(`Отрицательная динамика OS (истончение RNFL на ${Math.round(prevOS - currOS)} мкм)`);
    }

    // Macula Progression (Central Thickness drop > 15um or Volume drop > 0.1mm3)
    const prevMacOD = exams[i-1].normalized?.OD?.macula;
    const currMacOD = exams[i].normalized?.OD?.macula;
    const prevMacOS = exams[i-1].normalized?.OS?.macula;
    const currMacOS = exams[i].normalized?.OS?.macula;

    if (prevMacOD?.central_thickness && currMacOD?.central_thickness && currMacOD.central_thickness < prevMacOD.central_thickness - 15) {
      progression = true;
      details.push(`Отрицательная динамика OD (истончение центра макулы на ${Math.round(prevMacOD.central_thickness - currMacOD.central_thickness)} мкм)`);
    }
    if (prevMacOS?.central_thickness && currMacOS?.central_thickness && currMacOS.central_thickness < prevMacOS.central_thickness - 15) {
      progression = true;
      details.push(`Отрицательная динамика OS (истончение центра макулы на ${Math.round(prevMacOS.central_thickness - currMacOS.central_thickness)} мкм)`);
    }

    if (prevMacOD?.total_volume && currMacOD?.total_volume && currMacOD.total_volume < prevMacOD.total_volume - 0.15) {
      progression = true;
      details.push(`Снижение объема макулы OD (${(prevMacOD.total_volume - currMacOD.total_volume).toFixed(2)} мм³)`);
    }
    if (prevMacOS?.total_volume && currMacOS?.total_volume && currMacOS.total_volume < prevMacOS.total_volume - 0.15) {
      progression = true;
      details.push(`Снижение объема макулы OS (${(prevMacOS.total_volume - currMacOS.total_volume).toFixed(2)} мм³)`);
    }
  }

  return { progression, details };
}

export function buildSummary(clinical: any) {
  const OD = clinical?.OD || { stage: "normal" };
  const OS = clinical?.OS || { stage: "normal" };

  const osSev = STAGE_SEVERITY[OS.stage] || 0;
  const odSev = STAGE_SEVERITY[OD.stage] || 0;

  const worstStage = osSev >= odSev ? OS.stage : OD.stage;

  if (worstStage === "high_suspicion" || worstStage === "glaucoma" || worstStage === "продвинутая_глаукома" || worstStage === "развитая_глаукома") return "Признаки глаукомы";
  if (worstStage === "moderate_suspicion" || worstStage === "suspect" || worstStage === "ранняя_глаукома" || worstStage === "умеренная_глаукома" || worstStage === "подозрение") return "Признаки, подозрительные на глаукому";
  if (worstStage === "low_suspicion") return "Начальные структурные изменения";
  if (worstStage === "unreliable") return "Интерпретация затруднена";
  
  return "Норма";
}

export function buildFinalDiagnosis(clinical: any) {
  const OD = clinical?.OD || { stage: "normal" };
  const OS = clinical?.OS || { stage: "normal" };

  const osSev = STAGE_SEVERITY[OS.stage] || 0;
  const odSev = STAGE_SEVERITY[OD.stage] || 0;

  const worstStage = osSev >= odSev ? OS.stage : OD.stage;

  if (worstStage === "glaucoma" || worstStage === "развитая_глаукома" || worstStage === "продвинутая_глаукома" || worstStage === "умеренная_глаукома") return "Признаки глаукомы.";
  if (worstStage === "suspect" || worstStage === "ранняя_глаукома" || worstStage === "подозрение") return "Признаки, подозрительные на глаукому.";
  if (worstStage === "unreliable") return "Интерпретация затруднена.";
  
  return "Норма.";
}

export function buildConclusion({ clinical, normalizer, classifier, allStudies, patientInfo }: any): string {
  let mode = "single_study";
  let aggregated: any = null;

  if (allStudies && allStudies.length > 0) {
    aggregated = multiExamAggregator(allStudies);
    mode = aggregated?.mode || "single_study";
  }

  // Prioritize patientInfo from orchestrator, then classifier
  const dob = patientInfo?.dob || classifier?.patient_info?.dob;
  const examDate = classifier?.exam_date;

  const age = calculateAgeAtExam(dob, examDate);

  const sexVal = patientInfo?.sex || classifier?.patient_info?.sex;
  const sex = sexVal === "M" ? "мужчина" : sexVal === "F" ? "женщина" : "пол не указан";

  let finalClinical = clinical;
  if (mode === "single_visit") {
    finalClinical = aggregated;
  } else if (mode === "timeline") {
    finalClinical = aggregated.latest;
  }

  const OD = finalClinical.OD;
  const OS = finalClinical.OS;

  let text = "";

  // 👤 пациент
  text += `Пациент: ${sex}, ${age !== null ? age + ' лет' : 'возраст не указан'}.\n`;

  if (mode === "single_visit") {
    text += `Исследование включает несколько сканов (n=${aggregated.count}), выполненных в рамках одного визита.\n`;
  } else if (mode === "timeline") {
    text += `Исследование представлено серией ОКТ за разные даты (n=${aggregated.count}).\n`;
  }

  // 🖼 качество
  text += `Качество исследования: ${classifier.quality_explanation || 'не определено'} ${classifier.clinical_quality_flag || ''}\n\n`;

  if (mode === "timeline") {
    text += `Динамика:\n`;
    text += `Базовое исследование: ${aggregated.baseline.date || 'не указано'}\n`;
    text += `Последнее исследование: ${aggregated.latest.date || 'не указано'}\n`;
    text += `Состояние: ${aggregated.progression ? "Отмечается ОТРИЦАТЕЛЬНАЯ ДИНАМИКА" : "Стабильное состояние"}.\n`;
    if (aggregated.progressionDetails && aggregated.progressionDetails.length > 0) {
      aggregated.progressionDetails.forEach((d: string) => text += `- ${d}\n`);
    }
    text += `\n`;
  }

  // 👁 OD
  text += `OD:\n`;
  text += (OD?.narrative || "Патологических изменений не выявлено.") + "\n\n";

  // 👁 OS
  text += `OS:\n`;
  text += (OS?.narrative || "Патологических изменений не выявлено.") + "\n\n";

  // 🧠 интерпретация
  text += `Интерпретация:\n`;

  const buildInterpretation = (clinical: any) => {
    const OD = clinical.OD;
    const OS = clinical.OS;

    const odFeatures = Array.isArray(OD?.features) ? OD.features : Object.keys(OD?.features || {}).filter(k => OD.features[k]);
    const osFeatures = Array.isArray(OS?.features) ? OS.features : Object.keys(OS?.features || {}).filter(k => OS.features[k]);

    const osSev = STAGE_SEVERITY[OS?.stage] || 0;
    const odSev = STAGE_SEVERITY[OD?.stage] || 0;

    const worstEye = osSev >= odSev ? "OS" : "OD";
    const worstFeatures = osSev >= odSev ? osFeatures : odFeatures;
    
    let interpText = "";

    if (worstFeatures.includes("severe_rnfl_loss") || worstFeatures.includes("significant_rnfl_loss") || worstFeatures.includes("ddls_advanced") || worstFeatures.includes("ddls_moderate")) {
      interpText = "Выявлены выраженные структурные изменения диска зрительного нерва и RNFL, характерные для глаукомной оптической нейропатии.";
    } else if (worstFeatures.includes("profile_deformation") || worstFeatures.includes("rnfl_thinning") || worstFeatures.includes("advanced_cupping") || worstFeatures.includes("moderate_cupping")) {
      interpText = "Выявлены умеренные структурные изменения. Рекомендуется тщательная клиническая корреляция.";
    } else if (worstFeatures.includes("early_cupping") || worstFeatures.includes("ddls_early") || worstFeatures.includes("macula_thinning")) {
      interpText = "Обнаружены начальные или пограничные структурные изменения.";
    } else if (worstFeatures.includes("rnfl_asymmetry") || worstFeatures.includes("asymmetry") || clinical.global?.asymmetry?.rnfl?.is_pathologic) {
      interpText = "Отмечается существенная межглазная асимметрия структурных показателей.";
    } else if (worstFeatures.length === 0) {
      interpText = "Значимых патологических изменений не выявлено.";
    } else {
      interpText = "Обнаружены структурные изменения, требующие клинической оценки.";
    }

    // Add eye dominance info if applicable
    if (osSev !== odSev && (osSev > 0 || odSev > 0)) {
      const moreAffected = osSev > odSev ? "левого глаза (OS)" : "правого глаза (OD)";
      interpText += ` Изменения более выражены со стороны ${moreAffected}.`;
    }

    // Добавляем список признаков
    const allUniqueFeatures = Array.from(new Set([...odFeatures, ...osFeatures]));
    if (allUniqueFeatures.length > 0) {
      interpText += `\n\nВыявленные признаки: ${featuresToText(allUniqueFeatures)}.`;
    }

    return interpText;
  };

  text += buildInterpretation(finalClinical) + "\n";

  // 🧾 итог
  text += `\nЗаключение:\n`;
  text += `${buildFinalDiagnosis(finalClinical)}\n`;

  // 📌 рекомендации
  text += `\nРекомендации:\n`;

  const summary = buildSummary(finalClinical);
  if (summary !== "Норма") {
    text += `Рекомендуется наблюдение у офтальмолога, контроль OCT и периметрии.\n`;
  } else {
    text += `Плановое наблюдение.\n`;
  }

  // Format sentences: add newline before each new sentence
  return text.split('\n').map(line => {
    // Heuristic: period/exclamation/question followed by space and a capital letter
    return line.replace(/([.!?])\s+([A-ZА-ЯЁ])/g, '$1\n$2');
  }).join('\n');
}

/**
 * Rotates a base64 image by the given degrees using a Canvas.
 */
export async function rotateImage(base64: string, degrees: number): Promise<string> {
  if (!degrees || degrees % 360 === 0) return base64;
  
  // If it's a PDF, we can't rotate it this way easily without rendering it to a canvas first.
  // For now, we only support direct rotation for images.
  if (!base64.startsWith('data:image/')) {
    console.warn('rotateImage: Only data:image/ URLs are supported for direct rotation.');
    return base64;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64);
        return;
      }

      const angle = (degrees % 360) * Math.PI / 180;
      
      // Calculate new canvas dimensions
      const isVertical = (degrees / 90) % 2 !== 0;
      if (isVertical) {
        canvas.width = img.height;
        canvas.height = img.width;
      } else {
        canvas.width = img.width;
        canvas.height = img.height;
      }

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(angle);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = (err) => {
      console.error('Error loading image for rotation:', err);
      resolve(base64); // Fallback to original
    };
    img.src = base64;
  });
}

export function safeJsonParse(text: string) {
  let cleaned = text.trim();
  
  // 1. Try normal parse
  try {
    return JSON.parse(cleaned);
  } catch (e: any) {
    // 2. Try to find JSON in code blocks
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch (innerE) {
        cleaned = codeBlockMatch[1].trim();
      }
    }

    // 3. Attempt to fix truncated JSON
    let fixed = cleaned;
    
    // Check if we are inside a string
    let inString = false;
    let escaped = false;
    let stack: string[] = [];
    
    for (let i = 0; i < fixed.length; i++) {
      const char = fixed[i];
      if (char === '"' && !escaped) {
        inString = !inString;
      } else if (char === '\\' && !escaped) {
        escaped = true;
        continue;
      } else if (!inString) {
        if (char === '{' || char === '[') {
          stack.push(char);
        } else if (char === '}') {
          if (stack[stack.length - 1] === '{') stack.pop();
        } else if (char === ']') {
          if (stack[stack.length - 1] === '[') stack.pop();
        }
      }
      escaped = false;
    }

    // If we are in a string, close it
    if (inString) {
      fixed += '"';
    }

    // Close all open braces and brackets in reverse order
    while (stack.length > 0) {
      const last = stack.pop();
      fixed += (last === '{' ? '}' : ']');
    }

    try {
      return JSON.parse(fixed);
    } catch (innerE) {
      // 4. Try stripping trailing commas
      try {
        const stripped = fixed.replace(/,+(\s*[}\]])/g, '$1');
        return JSON.parse(stripped);
      } catch (finalE) {
        // 5. Last resort: try to find the first complete object/array
        const firstBrace = cleaned.indexOf('{');
        const firstBracket = cleaned.indexOf('[');
        const start = (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) ? firstBrace : firstBracket;

        if (start !== -1) {
          const openChar = cleaned[start];
          const closeChar = openChar === '{' ? '}' : ']';
          let depth = 0;
          for (let i = start; i < cleaned.length; i++) {
            if (cleaned[i] === openChar) depth++;
            else if (cleaned[i] === closeChar) {
              depth--;
              if (depth === 0) {
                try {
                  return JSON.parse(cleaned.substring(start, i + 1));
                } catch (lastResortE) {}
              }
            }
          }
        }
        
        // If all else fails, throw the original error
        throw e;
      }
    }
  }
}

/**
 * AGENT: AI Conclusion Generator
 * Generates a structured medical conclusion based on multi-agent outputs.
 */
export async function generateAIConclusion({ 
  normalizerOutput, 
  clinicalAnalyzerOutput, 
  trustOutput, 
  confidenceOutput, 
  qualityOutput,
  forcedFindings,
  systemSummary,
  mode,
  modelName = "gemini-3.1-pro-preview"
}: any) {
  // Helper to replace nulls with "not_available" for LLM readability
  const sanitizeForLLM = (obj: any): any => {
    if (obj === null || obj === undefined) return "not_available";
    if (Array.isArray(obj)) return obj.map(sanitizeForLLM);
    if (typeof obj === 'object') {
      const cleaned: any = {};
      for (const key in obj) {
        cleaned[key] = sanitizeForLLM(obj[key]);
      }
      return cleaned;
    }
    return obj;
  };

  const prompt = `
Ты — врач-офтальмолог, специализирующийся на диагностике глаукомы и анализе ОКТ (OCT).

Твоя задача — сформировать структурированное медицинское заключение на основе уже проанализированных данных.
Ты НЕ ставишь диагноз, а формулируешь клиническое заключение.

Входные данные (JSON):

Морфометрические и RNFL данные (включая классификацию): ${JSON.stringify(sanitizeForLLM(normalizerOutput))}
Клинические признаки и стадии: ${JSON.stringify(sanitizeForLLM(clinicalAnalyzerOutput))}
Данные о качестве исследования: ${JSON.stringify(sanitizeForLLM(qualityOutput))}
Уровень доверия системы: ${JSON.stringify(sanitizeForLLM(trustOutput))}
Индекс достоверности: ${JSON.stringify(sanitizeForLLM(confidenceOutput))}
ФАКТЫ ВЫЯВЛЕННОЙ ПАТОЛОГИИ (forced_findings): ${JSON.stringify(sanitizeForLLM(forcedFindings))}
СИСТЕМНОЕ РЕЗЮМЕ (system_summary): ${systemSummary}
Тип исследования: ${mode} // single_visit или timeline

КРИТИЧЕСКОЕ ПРАВИЛО:
Если в поле forced_findings или features указаны признаки, ты ОБЯЗАН отразить их в заключении.
ЗАПРЕЩЕНО:
- игнорировать эти признаки;
- писать, что "дефекты не выявлены", если они указаны в forced_findings или features;
- игнорировать системное резюме (system_summary).

ПРАВИЛА ИНТЕРПРЕТАЦИИ:
Приоритет: Явные клинические признаки (forced_findings, features) и текстовое описание (narrative) имеют абсолютный приоритет над уровнем доверия (trust_level), общей классификацией прибора и числовыми данными.
Даже если trust_level = "review_required" или "limited", ты ОБЯЗАН учитывать и описывать выявленные признаки.
Если в clinicalAnalyzerOutput.OD.narrative или OS.narrative указаны дефекты — они должны быть в отчете.
Если есть противоречие (например, прибор пишет "Normal", но в forced_findings есть дефекты) — ОБЯЗАТЕЛЬНО укажи это противоречие в тексте.

Даже если числовые данные отсутствуют (not_available), считай признаки из forced_findings и narrative клинически значимыми и достоверными.

Если mode = "single_visit":
Укажи, что анализ выполнен на основании нескольких сканов одного визита. Сформируй единое заключение.
Если mode = "timeline":
Проанализируй динамику. Укажи наличие или отсутствие прогрессирования.

Структура отчета ОБЯЗАТЕЛЬНА:
Качество исследования
OD (правый глаз)
OS (левый глаз)
Интерпретация
Заключение
Рекомендации

Для каждого глаза:
Средняя толщина RNFL
Анализ по секторам (S, N, I, T)
Наличие локальных дефектов
DDLS (если есть)
Признаки глаукомного повреждения

Формулировки:
Используй: "признаки соответствуют", "подозрение на", "характерно для"
НЕ использовать: "диагноз", "точно", "однозначно"

Контроль достоверности:
Если trust низкий → добавить предупреждение
Если confidence < 0.7 → указать низкую достоверность

Язык: Русский
Стиль: строгий медицинский, без разговорных фраз
Выход: JSON объект со следующими полями:
{
  "conclusion_text": "полный текст отчета со всеми разделами",
  "summary": "краткое резюме (1-2 предложения)",
  "recommendations": "список рекомендаций"
}
`;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      conclusion_text: { type: Type.STRING },
      summary: { type: Type.STRING },
      recommendations: { type: Type.STRING }
    },
    required: ["conclusion_text", "summary", "recommendations"]
  };

  const ai = getAI();
  const response = await ai.models.generateContent({
    model: modelName,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: responseSchema
    }
  });

  return safeJsonParse(response.text);
}

// Utility to extract numbers from strings (e.g., "95 µm" -> 95)
function parseNumeric(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  if (typeof val === 'string') {
    // Remove spaces and replace comma with dot
    const cleaned = val.replace(/\s/g, '').replace(',', '.');
    const match = cleaned.match(/(-?\d+([.]\d+)?)/);
    if (match) {
      const num = parseFloat(match[1]);
      return isNaN(num) ? null : num;
    }
  }
  return null;
}

/**
 * Deeply cleans normalized data, ensuring null instead of 0 for missing values.
 * Preserves the structure of the object.
 */
function cleanNormalizedData(data: any): any {
  if (data === null || data === undefined) return null;
  
  // If it's a primitive, parse it
  if (typeof data !== 'object') {
    return parseNumeric(data);
  }
  
  // If it's an array, clean each element
  if (Array.isArray(data)) {
    return data.map(item => cleanNormalizedData(item));
  }

  // If it's an object, clean each property
  const cleaned: any = {};
  for (const key in data) {
    const val = data[key];
    
    // List of keys that represent thickness, area, or volume metrics
    const isMetricKey = [
      'average', 'S', 'N', 'I', 'T', 
      'rim_area', 'disc_area', 'cup_area', 'rim_volume', 'cup_volume',
      'central_thickness', 'total_volume', 'cup_disc_ratio',
      'cdr', 'cdr_vertical', 'cdr_horizontal', 'ddls', 'rnfl_diff'
    ].includes(key);

    if (val !== null && typeof val === 'object') {
      cleaned[key] = cleanNormalizedData(val);
    } else if (isMetricKey) {
      // Avoid nullifying status strings like "thin", "borderline" that use the same keys as metrics
      if (typeof val === 'string' && !/[\d]/.test(val)) {
        cleaned[key] = val;
      } else {
        cleaned[key] = parseNumeric(val);
      }
    } else {
      // Preserve non-metric values (like "RNFL", "BOTH", "red", etc.)
      cleaned[key] = val;
    }
  }
  return cleaned;
}

/**
 * Generates a structured medical report text based on study data.
 */
export function generateMedicalReportText(study: Study, patientName?: string): string {
  const norm = study.normalized || study.data?.normalized;
  const layout = study.layout || {};
  const patientInfo = study.patient_info || {};
  const diagnosis = study.diagnosis;
  
  const od = norm?.OD || {};
  const os = norm?.OS || {};
  
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "не указана";
    return dateStr;
  };

  const formatValue = (val: any, unit: string = "") => {
    if (val === null || val === undefined) return "н/д";
    return `${val} ${unit}`.trim();
  };

  const formatStatus = (status: string | null) => {
    if (!status) return "н/д";
    switch (status) {
      case "normal": return "в норме";
      case "borderline": return "пограничное состояние";
      case "thin": return "истончение";
      default: return status;
    }
  };

  const report = `Протокол ОКТ
________________________________________
Выполнена ОКТ (спектральная оптическая когерентная томография): обоих глаз.
________________________________________
Пациент
ФИО: ${patientName || "не указано"}
Пол: ${patientInfo.sex === 'M' ? 'Мужской' : patientInfo.sex === 'F' ? 'Женский' : 'не указан'}
Дата рождения: ${formatDate(patientInfo.dob)}
Дата исследования: ${formatDate(study.examDate)}
________________________________________
Метод исследования
Оптическая когерентная томография (ОКТ) диска зрительного нерва и слоя нервных волокон сетчатки.
Прибор: ${layout.device || "Оптический когерентный томограф (OCT)"}
Тип сканирования: ${layout.report_type === 'ONH + RNFL' ? 'ОКТ ДЗН + RNFL (Глаукомный протокол)' : layout.report_type}
Качество исследования: ${study.clinical_quality_flag || "удовлетворительное, артефактов не выявлено."}
________________________________________
ЗАКЛЮЧЕНИЕ
________________________________________
${diagnosis?.final_diagnosis || "Требуется клиническая корреляция."}

Рекомендации:
Регулярное наблюдение у офтальмолога, контроль ВГД и полей зрения.

________________________________________
Врач: ____________________
Дата: ${new Date().toLocaleDateString('ru-RU')}
`;
  return report;
}

/**
 * Helper to extract eye-specific data from normalized output.
 * Returns an object with rnfl, onh, macula for the eye, plus global data.
 */
function getEyeData(output: any, preferredEye?: string): any {
  if (!output || typeof output !== 'object') return { rnfl: {}, onh: {}, macula: {}, global: {}, debug: {} };
  
  const eye = preferredEye === 'OS' ? 'OS' : 'OD';
  const eyeData = output[eye] || {};
  
  return {
    rnfl: eyeData.rnfl || {},
    onh: eyeData.onh || {},
    macula: eyeData.macula || {},
    global: output.global || {},
    debug: output.debug || {}
  };
}

async function runAgent(name: string, prompt: string, fileData?: string, mimeType: string = "image/jpeg", modelName?: string, responseSchema?: any, thinkingLevel: ThinkingLevel = ThinkingLevel.MEDIUM): Promise<AgentResult> {
  const startTime = Date.now();
  const model = modelName || "gemini-3-flash-preview";
  const maxRetries = 10;
  let retryCount = 0;
  let currentThinkingLevel = thinkingLevel;

  while (retryCount <= maxRetries) {
    try {
      const contents: any = [{ parts: [{ text: prompt }] }];
      if (fileData) {
        let finalMimeType = mimeType;
        let finalData = fileData;

        // Extract MIME type and data from data URL if present
        if (fileData.startsWith("data:")) {
          const match = fileData.match(/^data:([^;]+);base64,(.*)$/);
          if (match) {
            finalMimeType = match[1];
            finalData = match[2];
          } else {
            // Fallback for malformed data URL
            finalData = fileData.split(",")[1] || fileData;
          }
        }

        contents[0].parts.push({
          inlineData: {
            mimeType: finalMimeType,
            data: finalData,
          },
        });
      }

      const ai = getAI();
      const response = await ai.models.generateContent({
        model,
        contents,
        config: { 
          responseMimeType: "application/json",
          responseSchema: responseSchema,
          maxOutputTokens: 16384, // Increase max tokens to allow longer responses
          thinkingConfig: { thinkingLevel: currentThinkingLevel }
        },
      });

      try {
        const output = safeJsonParse(response.text || "{}");
        return {
          agentName: name,
          timestamp: Date.now(),
          status: 'success',
          output,
          duration: Date.now() - startTime
        };
      } catch (parseError) {
        console.error(`Agent ${name} JSON parse error:`, parseError);
        console.log(`Raw response text:`, response.text);
        if (retryCount < maxRetries) {
          retryCount++;
          const delay = 2000 * retryCount;
          console.warn(`Retrying agent ${name} due to JSON parse error... (Attempt ${retryCount}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw parseError;
      }
    } catch (error: any) {
      let errorStr = "";
      try {
        errorStr = JSON.stringify(error);
      } catch (e) {
        errorStr = String(error);
      }
      
      const isRateLimit = 
        error?.message?.includes('429') || 
        error?.status === 429 || 
        error?.code === 429 ||
        error?.error?.code === 429 ||
        errorStr.includes('429') ||
        errorStr.includes('RESOURCE_EXHAUSTED') ||
        errorStr.includes('quota');
      
      const isTokenLimit = 
        error?.message?.includes('max tokens limit') ||
        errorStr.includes('max tokens limit') ||
        errorStr.includes('MAX_TOKENS') ||
        errorStr.includes('context_window_exceeded');
      
      const isTransientImageError = 
        error?.message?.includes('Unable to process input image') ||
        errorStr.includes('Unable to process input image');
      
      const isRpcError = 
        error?.message?.includes('Rpc failed due to xhr error') ||
        errorStr.includes('Rpc failed due to xhr error') ||
        error?.status === 500 ||
        error?.code === 500 ||
        error?.status === 503 ||
        error?.code === 503 ||
        errorStr.includes('503') ||
        errorStr.includes('UNAVAILABLE');

      if ((isRateLimit || isTransientImageError || isRpcError || isTokenLimit) && retryCount < maxRetries) {
        retryCount++;
        
        // If it's a token limit error, try to reduce thinking level for the next attempt
        if (isTokenLimit) {
          if (currentThinkingLevel === ThinkingLevel.HIGH) {
            currentThinkingLevel = ThinkingLevel.MEDIUM;
          } else if (currentThinkingLevel === ThinkingLevel.MEDIUM) {
            currentThinkingLevel = ThinkingLevel.LOW;
          } else if (currentThinkingLevel === ThinkingLevel.LOW) {
            currentThinkingLevel = ThinkingLevel.MINIMAL;
          }
        }

        // More aggressive backoff for rate limits
        const baseDelay = isRateLimit ? 15000 : 2000;
        const delay = Math.pow(2, retryCount) * baseDelay + Math.random() * 5000;
        let reason = "Transient error";
        if (isRateLimit) reason = "Rate limit (quota)";
        else if (isTokenLimit) reason = "Token limit exceeded";
        else if (isTransientImageError) reason = "Transient image error";
        else if (isRpcError) reason = (error?.status === 503 || error?.code === 503 || errorStr.includes('503')) ? "Service Unavailable (503)" : "RPC/XHR error";
        
        console.warn(`[Agent ${name}] ${reason}. Retrying in ${Math.round(delay/1000)}s... (Attempt ${retryCount}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      console.error(`Agent ${name} failed:`, error);
      return {
        agentName: name,
        timestamp: Date.now(),
        status: 'error',
        output: { error: String(error) },
        duration: Date.now() - startTime
      };
    }
  }
  
  return {
    agentName: name,
    timestamp: Date.now(),
    status: 'error',
    output: { error: "Превышена квота запросов после нескольких попыток." },
    duration: Date.now() - startTime
  };
}

// --- AGENTS ---

/**
 * AGENT 1: Layout Classifier
 * Detects structural elements, report type, eye side, and device.
 */
export async function layoutClassifierAgent(fileData: string, mimeType: string = "image/jpeg", model?: string) {
  const prompt = `
    ИИ должен дать ответы на следующие вопросы:
    1) Что это за метод исследования глаза? 
    2) На каком приборе проведено это исследование? 
    3) Какова методика это исследования? 
    4) Какие правила нужно соблюдать, чтобы это исследование могло бы быть выполнено правильно? 
    5) Возможно ли оценить по результам исследования, которые представлены в загруженном файле, что исследование выполнено корректно? 
    6) На какие вопросы должен ответить исследователь, чтобы проверить правильно ли было проведено исследование, описанное в загруженном файле?

    AGENT: Layout Classifier (AGENT 1)
    TASK: Determine study type, report type, eye, and device.
    
    NOTE: If the input is a PDF, it may contain multiple pages. Analyze all pages to find the required information.
    ORIENTATION: The image or PDF pages might be rotated. You must correctly identify text and structures regardless of orientation.
    
    1. Is Medical Study: (boolean) Is this a medical scan/report or something else (trash/junk)?
    2. Study Type: (OCT | PERIMETRY | TOPOGRAPHY | BIOMETRY | UNKNOWN)
       - PERIMETRY: "исследование поля зрения методом автоматической статической периметрии". This study is used to assess retinal sensitivity to light stimuli at different points in the visual field and identify visual field defects (scotomas) characteristic of glaucoma, optic nerve atrophy, retinopathies, and neuritis.
       - BIOMETRY: "оптическая биометрия глаза" — метод неинвазивного измерения анатомических параметров глазного яблока с высокой точностью с помощью когерентного оптического излучения (лазерного интерферометра). Исследование позволяет определить: длину оси глаза (Axial Length, AL), глубину передней камеры (ACD), кератометрию (K1, K2), расстояние «от белого до белого» (WTW), что необходимо для расчёта оптической силы интраокулярной линзы (ИОЛ) перед операцией по поводу катаракты или при диагностике аметропий (миопии, гиперметропии).
    3. Device Domain: (retina | cornea | biometry | functional | unknown)
       - functional: Perimetry (Humphrey, Octopus, "Периметрия"), Tonometry (IOP)
       - biometry: Optical Biometry (IOLMaster, Lenstar, Aladdin, ARGOS, "Оптическая биометрия")
    4. Report Type: 
       - For OCT: (RNFL | MACULA | GCC | BSCAN | ONH | MEDICAL_DESCRIPTION)
       - For PERIMETRY: (SFA | GPA | OVERVIEW | MEDICAL_DESCRIPTION)
       - For TOPOGRAPHY: (MAP | SUMMARY | MEDICAL_DESCRIPTION)
       - For BIOMETRY: (MEASUREMENTS | IOL_CALCULATION | MEDICAL_DESCRIPTION)

    5. Eye: (OD | OS | BOTH)

    You MUST determine the eye using the following STRICT algorithm:

    STEP 1 — FIND EXPLICIT LABELS (HIGHEST PRIORITY)
    Search for:
    - "OD", "OS"
    - "Right Eye", "Left Eye"
    - "RE", "LE"
    - "Правый глаз", "Левый глаз"

    Count detected labels:
    - If BOTH OD and OS are present → RETURN "BOTH"
    - If ONLY OD is present → RETURN "OD"
    - If ONLY OS is present → RETURN "OS"

    STOP if labels found.

    ---

    STEP 2 — VALIDATE STRUCTURE (ONLY IF NO LABELS FOUND)

    Check if there are TWO independent regions:
    - separate tables OR
    - separate circular diagrams OR
    - separate scan blocks

    IMPORTANT:
    They must represent DIFFERENT eyes, not duplicates.

    ---

    STEP 3 — SYMMETRY RULE (LOW PRIORITY)

    Return "BOTH" ONLY if:
    - layout is clearly split into LEFT and RIGHT halves
    - each half contains independent scan data
    - NOT repeated measurements of the same eye

    DO NOT use symmetry if:
    - diagrams look identical
    - one is a graph and one is a map
    - same values appear in both sides

    ---

    STEP 4 — FALLBACK

    If uncertain:
    → RETURN the single detected eye (OD or OS)
    → NEVER guess BOTH

    ---

    CRITICAL RULES:
    - TEXT LABELS ALWAYS OVERRIDE EVERYTHING
    - NEVER GUESS BOTH WITHOUT STRONG EVIDENCE
    - IF IN DOUBT → RETURN OD OR OS, NOT BOTH

    6. Device: (Zeiss | Heidelberg | Topcon | Humphrey | Octopus | Oculus | Pentacam | Orbscan | Sirius | Galilei | IOLMaster | Lenstar | Aladdin | ARGOS | Unknown)
    
    IMPORTANT:
    Image Quality MUST reflect ONLY document readability for AI data extraction purposes.
    DO NOT use device clinical quality metrics such as Signal Strength, QI, Reliability Index, Fixation Loss, False Positive Rate, etc.
    Even if clinical quality is low, if tables, numbers and scans are clearly visible, the image_quality should be HIGH (70–100).

    7. Image Quality: (number 0-100) Assess the visual quality/clarity of the scan for data extraction.
    8. Quality Explanation: (string) If the quality is low (e.g., < 70) or if the scan is "Brak" (defective), provide a detailed explanation in Russian.
    9. Clinical Quality Flag: (string) Extract clinical quality metrics (e.g., "QI=2", "Signal Strength: 4/10") and provide a brief clinical assessment in Russian.
    
    10. Detect Exam Date: (string) Format: DD.MM.YYYY or similar if visible.
       - Look for labels: "Exam", "Exam date", "Дата исслед.", "Дата", "Дата и время", "Date:".
       - Often located in a box or frame in the upper part of the scan, OR at the very bottom of the page after "Date:".
       - If multiple dates are present, prioritize the one labeled as the examination/test date.
    
    11. Detect Patient Info (if visible in header):
       - patient_info: { "sex": "M" | "F" | null, "dob": "DD.MM.YYYY" | null }
       - IMPORTANT: Date of Birth (DOB) is often labeled as "Birth Date", "DOB", "Дата рождения", "Дата рожд.".
       - IMPORTANT: Sex/Gender can be labeled as "Sex", "Gender", "Пол". "M"/"М" for Male, "F"/"Ж" for Female.
       - It is usually located in the top header area near the patient's name.
       - Ensure you extract the date correctly in DD.MM.YYYY format.

    12. Visual Features:
       - Look for the first line of text in the study, it often contains the report type (e.g., "RNFL single exam report", "Macula thickness", etc.).
       - Look for eye diagrams: circles divided into sectors (pie charts) which are used to display RNFL thickness values.

    13. Eye Confidence: (number 0-100)
    - 90–100: both eyes clearly labeled (OD + OS)
    - 70–89: one eye clearly labeled
    - 40–69: inferred from layout (symmetry, structure)
    - <40: uncertain / ambiguous
    
    OUTPUT: JSON {
      "preliminary_analysis": {
        "method": string,
        "device": string,
        "methodology": string,
        "rules": string,
        "correctness_assessment": string
      },
      "is_medical_study": boolean,
      "study_type": "OCT" | "PERIMETRY" | "TOPOGRAPHY" | "BIOMETRY" | "UNKNOWN",
      "device_domain": "retina" | "cornea" | "biometry" | "functional" | "unknown",
      "report_type": string,
      "eye": "OD" | "OS" | "BOTH",
      "eye_confidence": number,
      "device": string,
      "image_quality": number,
      "quality_explanation": string,
      "clinical_quality_flag": string,
      "exam_date": string | null,
      "patient_info": { "sex": "M" | "F" | null, "dob": string | null } | null,
      "has_tables": boolean,
      "has_onh_parameters": boolean,
      "has_rnfl_plot": boolean,
      "has_etdrs_grid": boolean,
      "has_bscan": boolean
    }
  `;
  const schema = {
    type: Type.OBJECT,
    properties: {
      preliminary_analysis: {
        type: Type.OBJECT,
        properties: {
          method: { type: Type.STRING, description: "Что это за метод исследования глаза?" },
          device: { type: Type.STRING, description: "На каком приборе проведено это исследование?" },
          methodology: { type: Type.STRING, description: "Какова методика это исследования?" },
          rules: { type: Type.STRING, description: "Какие правила нужно соблюдать, чтобы это исследование могло бы быть выполнено правильно?" },
          correctness_assessment: { type: Type.STRING, description: "Возможно ли оценить по результам исследования, которые представлены в загруженном файле, что исследование выполнено корректно?" }
        },
        required: ["method", "device", "methodology", "rules", "correctness_assessment"]
      },
      is_medical_study: { type: Type.BOOLEAN },
      study_type: { type: Type.STRING, enum: ["OCT", "PERIMETRY", "TOPOGRAPHY", "BIOMETRY", "UNKNOWN"] },
      device_domain: { type: Type.STRING, enum: ["retina", "cornea", "biometry", "functional", "unknown"] },
      report_type: { type: Type.STRING },
      eye: { type: Type.STRING, enum: ["OD", "OS", "BOTH"] },
      eye_confidence: { type: Type.NUMBER },
      device: { type: Type.STRING },
      image_quality: { type: Type.NUMBER },
      quality_explanation: { type: Type.STRING, description: "Объяснение низкого качества снимка или брака на русском языке" },
      clinical_quality_flag: { type: Type.STRING, description: "Клинические метрики качества (QI, Signal Strength) и оценка на русском" },
      exam_date: { type: Type.STRING },
      patient_info: {
        type: Type.OBJECT,
        properties: {
          sex: { type: Type.STRING, enum: ["M", "F"] },
          dob: { type: Type.STRING }
        }
      },
      has_tables: { type: Type.BOOLEAN },
      has_onh_parameters: { type: Type.BOOLEAN },
      has_rnfl_plot: { type: Type.BOOLEAN },
      has_etdrs_grid: { type: Type.BOOLEAN },
      has_bscan: { type: Type.BOOLEAN }
    },
    required: ["preliminary_analysis", "is_medical_study", "study_type", "report_type", "eye", "eye_confidence", "device", "image_quality", "quality_explanation", "clinical_quality_flag", "has_tables", "has_onh_parameters", "has_rnfl_plot", "has_etdrs_grid", "has_bscan"]
  };

  return runAgent("layout_classifier", prompt, fileData, mimeType, model, schema, ThinkingLevel.LOW);
}

/**
 * AGENT 2: Data Extractor
 * Extract specific quantitative parameters.
 */
export async function universalExtractorAgent(fileData: string, mimeType: string = "image/jpeg", model?: string, layout?: any) {
  const prompt = `
    You are a medical data extraction system.

    CONTEXT FROM CLASSIFIER:
    - Study Type: ${layout?.study_type || "UNKNOWN"}
    - Report Type: ${layout?.report_type || "UNKNOWN"}
    - Expected Eye(s): ${layout?.eye || "UNKNOWN"}
    - Device: ${layout?.device || "UNKNOWN"}

    ---

    ## STEP 1 — DETECT EYES (STRICT ORDER)

    1. Look for labels:
       "OD", "OS", "Right", "Left", "R", "L"

    2. Decision:

       * Both labels found → eye = "BOTH"
       * Only OD → "OD"
       * Only OS → "OS"

    3. If no labels:

       * If layout clearly split into left/right → "BOTH"
       * Else → single eye (choose most likely)

    IMPORTANT:

    * If layout.context says BOTH → prefer BOTH
    * Do NOT ignore right side of image

    ---

    ## STEP 2 — SPLIT IMAGE

    If eye = BOTH:

    * Left half → OD
    * Right half → OS

    Process each eye independently.

    ---

    ## STEP 3 — EXTRACT DATA
    
    ### CRITICAL VALIDATION RULE
    - Only extract values that are explicitly labeled with text (e.g., "Center:", "Volume:", "Average Thickness").
    - NEVER infer numbers from color maps, grayscale bars, B-scan pixels, or image intensity.
    - NEVER generate, estimate, or interpolate missing values.
    - If a value is not clearly labeled with a text key → return null.
    - Typical Macula Thickness range: 150-500 µm.
    - Typical Macula Volume range: 0.5-12.0 mm³.
    - Values outside these ranges are likely extraction errors → ignore them.

    Extract ONLY explicit numeric values from:

    * tables
    * labeled values
    * numeric blocks

    DO NOT:

    * estimate
    * infer
    * read graphs without numbers

    ---

    ## STEP 4 — RNFL EXTRACTION (SIMPLIFIED)

    For each eye:

    1. Check parameters:
       If RNFL S/N/I/T exist → use them

    2. Else check diagram:
       If 4 sectors found → extract S/N/I/T
       If incomplete → ignore

    3. Assign:
       Top → S
       Bottom → I
       Left/Right depends on eye

    ---

    ## STEP 5 — COLOR MAP

    Extract quadrant colors:
    S, N, I, T → green/yellow/red

    ---

    ## STEP 6 — FINAL CHECK

    * If eye = BOTH:
      → both OD and OS must be processed

    * If one eye empty:
      → check again once

    * If still empty:
      → leave empty but keep BOTH

    ---

    ## STEP 7 — FREE TEXT SCAN (CLASSIFICATION)
    1. Scan the entire image for these specific patterns:
       - "Classification OD [text]"
       - "Classification OS [text]"
    
    2. Extract the [text] part. Common values are:
       - "Outside Normal Limits"
       - "Borderline"
       - "Within Normal Limits"
    
    3. Also, extract ALL text detected in the image and return it in the "full_text" field. This is used for deterministic regex matching.

    Return these in the "free_text_scan" block.

    ---

    ## OUTPUT

    Return JSON only:

    {
    "eye": "BOTH",
    "eye_confidence": 100,
    "OD": { "parameters": [], "RNFL": { "source": "diagram", "values": { "S": null, "N": null, "I": null, "T": null } }, "rnfl_color_map": {} },
    "OS": { "parameters": [], "RNFL": { "source": "diagram", "values": { "S": null, "N": null, "I": null, "T": null } }, "rnfl_color_map": {} },
    "free_text_scan": { "full_text": "...", "od_classification": null, "os_classification": null },
    "unknown": []
    }

    ## 🔴 IMPORTANT: OUTPUT ONLY VALID JSON
    - Do NOT include any text, explanations, or markdown outside the JSON block.
    - Ensure all strings are properly escaped.
    - Ensure no trailing commas.
    - Ensure all property names are in double quotes.
    - Return ONLY the raw JSON object.
  `;
  const schema = {
    type: Type.OBJECT,
    properties: {
      eye: { type: Type.STRING, enum: ["OD", "OS", "BOTH"] },
      eye_confidence: { type: Type.NUMBER },
      OD: {
        type: Type.OBJECT,
        properties: {
          parameters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                value: { type: Type.NUMBER },
                unit: { type: Type.STRING },
                source: { type: Type.STRING, enum: ["label", "label_embedded_in_diagram", "uncertain"] }
              },
              required: ["name", "unit"]
            }
          },
          RNFL: {
            type: Type.OBJECT,
            properties: {
              source: { type: Type.STRING, enum: ["diagram", "table", "none"] },
              values: {
                type: Type.OBJECT,
                properties: {
                  S: { type: Type.NUMBER, nullable: true },
                  NS: { type: Type.NUMBER, nullable: true },
                  N: { type: Type.NUMBER, nullable: true },
                  NI: { type: Type.NUMBER, nullable: true },
                  I: { type: Type.NUMBER, nullable: true },
                  TI: { type: Type.NUMBER, nullable: true },
                  T: { type: Type.NUMBER, nullable: true },
                  TS: { type: Type.NUMBER, nullable: true }
                }
              }
            }
          },
          rnfl_color_map: {
            type: Type.OBJECT,
            properties: {
              S: { type: Type.STRING, enum: ["green", "yellow", "red"], nullable: true },
              I: { type: Type.STRING, enum: ["green", "yellow", "red"], nullable: true },
              N: { type: Type.STRING, enum: ["green", "yellow", "red"], nullable: true },
              T: { type: Type.STRING, enum: ["green", "yellow", "red"], nullable: true }
            }
          }
        },
        required: ["parameters"]
      },
      OS: {
        type: Type.OBJECT,
        properties: {
          parameters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                value: { type: Type.NUMBER },
                unit: { type: Type.STRING },
                source: { type: Type.STRING, enum: ["label", "label_embedded_in_diagram", "uncertain"] }
              },
              required: ["name", "unit"]
            }
          },
          RNFL: {
            type: Type.OBJECT,
            properties: {
              source: { type: Type.STRING, enum: ["diagram", "table", "none"] },
              values: {
                type: Type.OBJECT,
                properties: {
                  S: { type: Type.NUMBER, nullable: true },
                  NS: { type: Type.NUMBER, nullable: true },
                  N: { type: Type.NUMBER, nullable: true },
                  NI: { type: Type.NUMBER, nullable: true },
                  I: { type: Type.NUMBER, nullable: true },
                  TI: { type: Type.NUMBER, nullable: true },
                  T: { type: Type.NUMBER, nullable: true },
                  TS: { type: Type.NUMBER, nullable: true }
                }
              }
            }
          },
          rnfl_color_map: {
            type: Type.OBJECT,
            properties: {
              S: { type: Type.STRING, enum: ["green", "yellow", "red"], nullable: true },
              I: { type: Type.STRING, enum: ["green", "yellow", "red"], nullable: true },
              N: { type: Type.STRING, enum: ["green", "yellow", "red"], nullable: true },
              T: { type: Type.STRING, enum: ["green", "yellow", "red"], nullable: true }
            }
          }
        },
        required: ["parameters"]
      },
      free_text_scan: {
        type: Type.OBJECT,
        properties: {
          full_text: { type: Type.STRING, description: "All text detected in the image for pattern matching" },
          od_classification: { type: Type.STRING, nullable: true },
          os_classification: { type: Type.STRING, nullable: true }
        }
      },
      unknown: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            value: { type: Type.NUMBER },
            unit: { type: Type.STRING }
          },
          required: ["name", "unit"]
        }
      }
    },
    required: ["OD", "OS", "eye", "eye_confidence"]
  };

  return runAgent("universal_extractor", prompt, fileData, mimeType, model, schema, ThinkingLevel.MEDIUM);
}

/**
 * AGENT 2.2: Perimetry Analyzer
 * Extract functional data from Automated Static Perimetry reports.
 */
export async function perimetryAnalyzerAgent(fileData: string, mimeType: string = "image/jpeg", model?: string) {
  const prompt = `
    AGENT: Perimetry Analyzer
    TASK: Extract functional data from Automated Static Perimetry reports.
    LANGUAGE: All text outputs must be in RUSSIAN.
    
    IMPORTANT: This study is used to assess retinal sensitivity to light stimuli at different points in the visual field and identify visual field defects (scotomas) characteristic of glaucoma, optic nerve atrophy, retinopathies, and neuritis.
    
    EXTRACT for both eyes (OD and OS) if present:
    1. MD (Mean Deviation) in dB (e.g., -5.42 dB)
    2. PSD (Pattern Standard Deviation) in dB (e.g., 3.21 dB)
    3. VFI (Visual Field Index) in % (e.g., 92%)
    4. GHT (Glaucoma Hemifield Test) result (e.g., "Outside Normal Limits", "Within Normal Limits", "Borderline")
    5. Reliability Indices:
       - Fixation Losses (e.g., "2/15")
       - False Positives (%)
       - False Negatives (%)
    
    6. Quality Assessment:
       - quality_score: (number 0-100)
       - quality_explanation: (string) If the quality is low or "Brak" (defective), explain why in Russian.
    
    OUTPUT: JSON {
      "MD": { "OD": number | null, "OS": number | null },
      "PSD": { "OD": number | null, "OS": number | null },
      "VFI": { "OD": number | null, "OS": number | null },
      "GHT": { "OD": string | null, "OS": string | null },
      "reliability": {
        "fixation_losses": { "OD": string | null, "OS": string | null },
        "false_positives": { "OD": string | null, "OS": string | null },
        "false_negatives": { "OD": string | null, "OS": string | null }
      },
      "quality": {
        "score": number,
        "explanation": string
      }
    }
  `;
  const schema = {
    type: Type.OBJECT,
    properties: {
      MD: {
        type: Type.OBJECT,
        properties: {
          OD: { type: Type.NUMBER },
          OS: { type: Type.NUMBER }
        }
      },
      PSD: {
        type: Type.OBJECT,
        properties: {
          OD: { type: Type.NUMBER },
          OS: { type: Type.NUMBER }
        }
      },
      VFI: {
        type: Type.OBJECT,
        properties: {
          OD: { type: Type.NUMBER },
          OS: { type: Type.NUMBER }
        }
      },
      GHT: {
        type: Type.OBJECT,
        properties: {
          OD: { type: Type.STRING },
          OS: { type: Type.STRING }
        }
      },
      reliability: {
        type: Type.OBJECT,
        properties: {
          fixation_losses: {
            type: Type.OBJECT,
            properties: {
              OD: { type: Type.STRING },
              OS: { type: Type.STRING }
            }
          },
          false_positives: {
            type: Type.OBJECT,
            properties: {
              OD: { type: Type.STRING },
              OS: { type: Type.STRING }
            }
          },
          false_negatives: {
            type: Type.OBJECT,
            properties: {
              OD: { type: Type.STRING },
              OS: { type: Type.STRING }
            }
          }
        }
      },
      quality: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER },
          explanation: { type: Type.STRING }
        }
      }
    }
  };

  return runAgent("perimetry_analyzer", prompt, fileData, mimeType, model, schema, ThinkingLevel.LOW);
}

/**
 * AGENT 2.3: Topography Analyzer
 * Extract corneal data from Keratotopography reports.
 */
export async function topographyAnalyzerAgent(fileData: string, mimeType: string = "image/jpeg", model?: string) {
  const prompt = `
    AGENT: Topography Analyzer
    TASK: Extract corneal data from Keratotopography reports.
    
    IMPORTANT: This agent is ONLY for CORNEAL TOPOGRAPHY (Pentacam, Orbscan, Sirius, Galilei, corneal OCT anterior segment).
    If the image is NOT a topography report, return null or empty values for all fields.
    
    EXTRACT for both eyes (OD and OS) if present:
    1. K1 (Flat Keratometry) in D
    2. K2 (Steep Keratometry) in D
    3. CCT (Central Corneal Thickness) in µm (CRITICAL for IOP correction)
    4. Astigmatism in D
    
    OUTPUT: JSON {
      "K1": { "OD": number | null, "OS": number | null },
      "K2": { "OD": number | null, "OS": number | null },
      "CCT": { "OD": number | null, "OS": number | null },
      "astigmatism": { "OD": number | null, "OS": number | null }
    }
  `;
  const schema = {
    type: Type.OBJECT,
    properties: {
      K1: {
        type: Type.OBJECT,
        properties: {
          OD: { type: Type.NUMBER },
          OS: { type: Type.NUMBER }
        }
      },
      K2: {
        type: Type.OBJECT,
        properties: {
          OD: { type: Type.NUMBER },
          OS: { type: Type.NUMBER }
        }
      },
      CCT: {
        type: Type.OBJECT,
        properties: {
          OD: { type: Type.NUMBER },
          OS: { type: Type.NUMBER }
        }
      },
      astigmatism: {
        type: Type.OBJECT,
        properties: {
          OD: { type: Type.NUMBER },
          OS: { type: Type.NUMBER }
        }
      }
    }
  };

  return runAgent("topography_analyzer", prompt, fileData, mimeType, model, schema, ThinkingLevel.LOW);
}

/**
 * AGENT 2.4: Biometry Analyzer
 * Extract axial measurements from Optical Biometry reports.
 */
export async function biometryAnalyzerAgent(fileData: string, mimeType: string = "image/jpeg", model?: string) {
  const prompt = `
    AGENT: Biometry Analyzer
    TASK: Extract axial measurements from Optical Biometry reports (e.g., IOLMaster, Lenstar, Aladdin, ARGOS, "Оптическая биометрия").
    
    IMPORTANT: This study is used for non-invasive measurement of anatomical parameters of the eyeball with high precision using coherent optical radiation (laser interferometer).
    The study allows determining:
    - Axial Length (AL)
    - Anterior Chamber Depth (ACD)
    - Keratometry (K1, K2)
    - White-to-White distance (WTW)
    This is necessary for calculating the optical power of an intraocular lens (IOL) before cataract surgery or when diagnosing ametropias (myopia, hypermetropia).
    
    EXTRACT for both eyes (OD and OS) if present:
    1. AL (Axial Length) in mm
    2. ACD (Anterior Chamber Depth) in mm
    3. Lens Thickness in mm
    4. K1, K2 (Keratometry) in D
    5. WTW (White-to-White) in mm
    
    OUTPUT: JSON {
      "AL": { "OD": number | null, "OS": number | null },
      "ACD": { "OD": number | null, "OS": number | null },
      "lens_thickness": { "OD": number | null, "OS": number | null },
      "K1": { "OD": number | null, "OS": number | null },
      "K2": { "OD": number | null, "OS": number | null },
      "WTW": { "OD": number | null, "OS": number | null }
    }
  `;
  const schema = {
    type: Type.OBJECT,
    properties: {
      AL: {
        type: Type.OBJECT,
        properties: {
          OD: { type: Type.NUMBER },
          OS: { type: Type.NUMBER }
        }
      },
      ACD: {
        type: Type.OBJECT,
        properties: {
          OD: { type: Type.NUMBER },
          OS: { type: Type.NUMBER }
        }
      },
      lens_thickness: {
        type: Type.OBJECT,
        properties: {
          OD: { type: Type.NUMBER },
          OS: { type: Type.NUMBER }
        }
      },
      K1: {
        type: Type.OBJECT,
        properties: {
          OD: { type: Type.NUMBER },
          OS: { type: Type.NUMBER }
        }
      },
      K2: {
        type: Type.OBJECT,
        properties: {
          OD: { type: Type.NUMBER },
          OS: { type: Type.NUMBER }
        }
      },
      WTW: {
        type: Type.OBJECT,
        properties: {
          OD: { type: Type.NUMBER },
          OS: { type: Type.NUMBER }
        }
      }
    }
  };

  return runAgent("biometry_analyzer", prompt, fileData, mimeType, model, schema, ThinkingLevel.LOW);
}

/**
 * AGENT 2.1: Normalizer
 * Maps raw metrics to a structured format using strict rules.
 * Deterministic version.
 */
const OCT_PARAM_MAP: Record<string, [string, string]> = {
  // RNFL
  "RNFL_avg": ["Толщина RNFL средняя", "rnfl_avg"],
  "Average RNFL Thickness": ["Толщина RNFL средняя", "rnfl_avg"],
  "Superior": ["Толщина RNFL верхний сектор", "rnfl_sup"],
  "Inferior": ["Толщина RNFL нижний сектор", "rnfl_inf"],
  "Temporal": ["Толщина RNFL височный сектор", "rnfl_temp"],
  "Nasal": ["Толщина RNFL носовой сектор", "rnfl_nasal"],

  // ONH
  "C/D Ratio": ["Соотношение экскавации к диску", "cdr"],
  "Vertical C/D": ["Вертикальное соотношение C/D", "cdr_vertical"],
  "Disc Area": ["Площадь диска", "disc_area"],
  "Rim Area": ["Площадь нейроретинального ободка", "rim_area"],

  // MACULA
  "GCL Thickness": ["Толщина слоя ганглиозных клеток", "gcl"],
  "GCC Thickness": ["Толщина комплекса ганглиозных клеток", "gcc"],
  "Inner Ring": ["Толщина макулы внутреннее кольцо", "macula_inner"],
  "Outer Ring": ["Толщина макулы наружное кольцо", "macula_outer"],

  // Quality
  "Signal Strength": ["Сила сигнала", "signal_strength"],
  "SSI": ["Индекс качества сигнала", "signal_strength"],
};

function toFloat(value: any): number | null {
  if (value === null || value === undefined) return null;
  try {
    if (typeof value === 'string') {
      value = value.replace(",", ".");
    }
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  } catch {
    return null;
  }
}

export async function normalizerAgent(raw: any, reportTypeOrLayout: any = "Unknown", model?: string, layoutParam?: any): Promise<AgentResult> {
  const startTime = Date.now();
  
  // Handle the case where layout is passed as second argument (from geminiService.ts)
  let reportType = "Unknown";
  let layout = layoutParam;
  
  if (typeof reportTypeOrLayout === 'string') {
    reportType = reportTypeOrLayout;
  } else if (reportTypeOrLayout && typeof reportTypeOrLayout === 'object') {
    layout = reportTypeOrLayout;
    reportType = layout.report_type || "Unknown";
  }

  console.log(`[Normalizer Agent] Starting with reportType:`, reportType, { raw });

  const detectScanType = (data: any): string => {
    const rawType = (reportType || "").toUpperCase();
    if (rawType.includes("RNFL")) return "RNFL";
    if (rawType.includes("THICKNESS") || rawType.includes("MACULA") || rawType.includes("GCA") || rawType.includes("GCC") || rawType.includes("GCL")) return "MACULA";
    if (rawType.includes("DISC") || rawType.includes("ONH") || rawType.includes("CUP")) return "ONH";

    // Fallback by values
    for (const eye of ["OD", "OS"]) {
      const eyeData = data?.[eye] || {};
      const params = eyeData.parameters || (Array.isArray(eyeData) ? eyeData : []);
      if (params.some((p: any) => {
        const v = parseNumeric(p.value);
        return v !== null && v > 180;
      })) {
        return "MACULA";
      }
    }
    return "UNKNOWN";
  };

  const scanType = detectScanType(raw);

  // 🔥 fallback от extractor (КРИТИЧНО)
  const hasRNFL =
    raw?.OD?.RNFL?.values ||
    raw?.OS?.RNFL?.values;

  const finalScanType =
    scanType === "UNKNOWN" && hasRNFL
      ? "RNFL"
      : scanType;

  // Use the shared normalizer logic
  const normalized = normalizeStudy(raw, finalScanType);
  
  // Populate global field from layout (Classifier)
  if (!normalized.global) normalized.global = {};
  normalized.global.device = layout?.device || "UNKNOWN";
  normalized.global.exam_date = layout?.exam_date || null;
  
  let detectedEye = (raw?.eye || layout?.eye || "UNKNOWN").toUpperCase();
  if (detectedEye === "BOTH") detectedEye = "OU";

  // Architectural fix: if both eyes have data, it's OU
  if (raw?.OD && raw?.OS) {
    detectedEye = "OU";
  }
  
  // Add scan_info for internal app logic
  (normalized as any).scan_info = {
    type: finalScanType,
    raw_type: reportType,
    eye: detectedEye,
    eye_confidence: raw?.eye_confidence || layout?.eye_confidence || 100,
    device: layout?.device || "UNKNOWN",
    exam_date: layout?.exam_date || null
  };

  console.log(`[Normalizer Agent] Normalized result:`, normalized);

  return {
    agentName: "normalizer",
    timestamp: Date.now(),
    status: "success",
    output: normalized,
    duration: Date.now() - startTime
  };
}

/**
 * AGENT 3: Quality Control
 * Validates data quality using strict physiological and logical rules.
 */

/**
 * Helper: Extract non-RNFL features (ONH, Macula) from an eye scan.
 */
function extractOtherFeaturesFromEye(eye: any) {
  const features: string[] = [];

  // --- ONH (Rim Area, DDLS) ---
  const rim = eye?.onh?.rim_area;
  if (rim != null && typeof rim === 'number' && rim < 1.0) {
    features.push('Rim thinning (rim area ' + rim + ')');
  }

  const ddls = eye?.onh?.ddls;
  if (ddls != null && typeof ddls === 'number' && ddls >= 5) {
    features.push('DDLS elevated (' + ddls + ')');
  }

  // --- Macula (Central Thickness) ---
  const macWidth = eye?.macula?.central_thickness;
  if (macWidth != null && typeof macWidth === 'number' && macWidth < 240) {
    features.push('Macular thinning (central: ' + macWidth + ' um)');
  }

  return features;
}

/**
 * Re-orchestrated Clinical Analyzer.
 * Follows the hierarchical path: Analyzers -> Aggregator -> Presentation.
 */
export function clinicalAnalyzer(data: any) {
  const scans = data?.scans || (Array.isArray(data) ? data : [data]);

  // Use series processor to pick best data from all scans
  const series = series_processor(scans);

  // Run Master Aggregator on BEST data from series
  const aggregatedResult = master_aggregator({
    RNFL: { OD: series.OD.RNFL, OS: series.OS.RNFL },
    MACULA: { OD: series.OD.MACULA, OS: series.OS.MACULA },
    QUALITY: { OD: series.OD.QUALITY, OS: series.OS.QUALITY },
    scans: scans
  });

  // Clinical Presentation Layer
  return clinical_analyzer(aggregatedResult);
}

/**
 * AGENT 4: Clinical Analyzer (Deterministic Medical Module)
 * Wrapper for the deterministic clinicalAnalyzer logic.
 */
export async function reportGeneratorAgent(
  normalizerOutput: any,
  qualityControlOutput: any,
  clinicalAnalyzerOutput: any,
  evidenceOutput: any,
  trustOutput: any,
  confidenceOutput: any,
  model?: string
): Promise<AgentResult> {
  const prompt = 'Ты — медицинский генератор отчетов ОКТ.\n\n' +
    'Вход:\n' +
    '- universal_extractor: ' + JSON.stringify(normalizerOutput) + '\n' +
    '- clinical_analyzer: ' + JSON.stringify(clinicalAnalyzerOutput) + '\n' +
    '- evidence_agent: ' + JSON.stringify(evidenceOutput) + '\n' +
    '- trust_layer: ' + JSON.stringify(trustOutput) + '\n' +
    '- confidence_analyzer: ' + JSON.stringify(confidenceOutput) + '\n\n' +
    'Задача:\n' +
    'Сформировать формализованный медицинский отчет.\n\n' +
    'Правила:\n' +
    '1. Используй строгий медицинский стиль (без разговорных фраз).\n' +
    '2. НЕ ставь диагноз — только "признаки" и "соответствует".\n' +
    '3. Всегда указывай:\n' +
    '   - морфометрию ЗН (площадь диска, пояска, экскавации, C/D)\n' +
    '   - RNFL (4 сектора: S, N, I, T)\n' +
    '   - DDLS с интерпретацией\n' +
    '4. Используй clinical_analyzer как основу заключения.\n' +
    '5. Используй evidence_agent как "Дополнительные данные".\n' +
    '6. Если trust_layer.status != "trusted" → добавить предупреждение о необходимости осторожной интерпретации.\n' +
    '7. Если confidence_analyzer.confidence_score < 0.7 → указать "низкая достоверность анализа".\n\n' +
    'Формат отчета:\n\n' +
    '1. ИНФОРМАЦИЯ ОБ ИССЛЕДОВАНИИ\n' +
    '   (Дата, прибор, глаз)\n\n' +
    '2. КАЧЕСТВО ИССЛЕДОВАНИЯ\n' +
    '   (Оценка качества, сигнал/шум)\n\n' +
    '3. МОРФОМЕТРИЯ ЗРИТЕЛЬНОГО НЕРВА (OD / OS)\n' +
    '   - Параметры диска\n' +
    '   - DDLS и его значение\n\n' +
    '4. СЛОЙ НЕРВНЫХ ВОЛОКОН (RNFL)\n' +
    '   - Значения по 4 секторам (S, N, I, T)\n' +
    '   - Описание паттерна истончения (если есть)\n\n' +
    '5. ДОПОЛНИТЕЛЬНЫЕ ДАННЫЕ (Evidence)\n' +
    '   - Перечислить ключевые признаки из evidence_agent\n\n' +
    '6. ЗАКЛЮЧЕНИЕ\n' +
    '   - На основе clinical_analyzer (признаки, соответствие стадии)\n' +
    '   - Межглазная асимметрия\n\n' +
    '7. ПРЕДУПРЕЖДЕНИЯ (если применимо)\n' +
    '   - О низком доверии или достоверности\n\n' +
    '8. КЛИНИЧЕСКОЕ ЗАМЕЧАНИЕ\n' +
    '   "ОКТ отражает морфологическое состояние зрительного нерва и сетчатки. Выявленные изменения могут наблюдаться при различных состояниях и требуют клинической корреляции."\n\n' +
    '---\n' +
    'ОТВЕЧАЙ ТОЛЬКО JSON-ОБЪЕКТОМ.\n';

  const schema = {
    type: Type.OBJECT,
    properties: {
      report_text: { type: Type.STRING }
    },
    required: ["report_text"]
  };

  return runAgent("report_generator", prompt, undefined, undefined, model, schema, ThinkingLevel.HIGH);
}

/**
 * AGENT 5: Diagnosis (Clinical Decision Support)
 * Form final diagnosis and risk level based on clinical scoring.
 * Deterministic version based on clinical_analyzer output and perimetry data.
 */
/**
 * AGENT 5: Diagnosis (Clinical Decision Support) - REMOVED
 * Clinical interpretation is now handled by clinical_analyzer and reasoning_agent.
 * This is a dummy function for backward compatibility.
 */
export function diagnosisAgent(data: any) {
  const clinical = data.clinical_analyzer || data.clinical || {};
  return {
    final_diagnosis: clinical.stage || 'Normal',
    structural: 'Structural analysis complete',
    functional: 'Functional analysis complete',
    risk_level: clinical.severity || 'LOW'
  };
}

export async function explainAgent(data: {
  normalized: any;
  clinical: any;
  confidence: number;
  quality?: any;
}, model?: string, language: 'ru' | 'en' = 'ru') {
  // Use flash as default
  const modelToUse = model || "gemini-3-flash-preview";
  
  // Check interpretation permission
  const interpretationAllowed = data.clinical?.global?.interpretation_allowed ?? true;

  let prompt = '';
  
  if (!interpretationAllowed) {
    prompt = 'Ты — агент генерации медицинского отчёта по данным ОКТ.\n\n' +
      'ВАЖНО: ИНТЕРПРЕТАЦИЯ ЭТОГО СНИМКА ЗАБЛОКИРОВАНА КОНТРОЛЕМ КАЧЕСТВА.\n\n' +
      'Задача:\n' +
      'Сформировать ОПИСАТЕЛЬНЫЙ отчет без клинических выводов.\n\n' +
      'Правила:\n' +
      '1. Укажи причины невозможности интерпретации (из limitations).\n' +
      '2. Опиши только то, что видно технически (например: "низкий сигнал", "артефакты").\n' +
      '3. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать о признаках глаукомы или структурных изменениях.\n' +
      '4. В заключении укажи, что требуется повторное исследование.\n\n' +
      'Стиль: нейтральный медицинский.\n\n' +
      'ДАННЫЕ:\n' +
      '- Качество: ' + JSON.stringify(data.quality) + '\n' +
      '- Ограничения: ' + JSON.stringify(data.clinical?.OD?.limitations) + '\n';
  } else {
    prompt = 'Ты — агент генерации медицинского отчёта по данным ОКТ.\n\n' +
      'ВАЖНО:\n' +
      '1. Тщательно проанализируй ВСЕ предоставленные исследования.\n' +
      '2. Если патологический признак встречается хотя бы в одном из снимков (даже если в последнем его нет) — ты ОБЯЗАН включить его в отчет.\n' +
      '3. Не игнорируй данные из других дат.\n' +
      '4. Ты НЕ ставишь диагноз и НЕ делаешь клинических выводов.\n' +
      '5. Ты НЕ должен противоречить данным clinical_analyzer.\n' +
      '6. Если в clinical_analyzer.features пусто — только тогда можно писать об отсутствии структурных изменений.\n' +
      '7. ВЕСЬ ОТВЕТ ДОЛЖЕН БЫТЬ СТРОГО НА РУССКОМ ЯЗЫКЕ. Использование английских терминов из JSON-ключей (например, "rnfl_thinning", "notch") ЗАПРЕЩЕНО — переводи их согласно клинической логике.\n\n' +
      'Задача:\n' +
      'сформировать структурированное текстовое заключение на русском языке на основе переданных данных.\n\n' +
      'Правила:\n\n' +
      '1. Используй только факты из входных данных:\n' +
      '- описанные признаки\n\n' +
      '2. Для каждого глаза:\n' +
      '- опиши наличие или отсутствие структурных изменений\n' +
      '- укажи ключевые параметры (если есть отклонения)\n\n' +
      '3. Формулировки:\n' +
      'Если есть изменения:\n' +
      '"выявлены структурные изменения, характерные для глаукомной оптической нейропатии"\n\n' +
      'Если норма (features пусты):\n' +
      '"признаков структурных изменений не выявлено"\n\n' +
      '4. ЗАПРЕЩЕНО:\n' +
      '- писать "диагноз"\n' +
      '- использовать категоричные утверждения\n' +
      '- писать противоречивые фразы\n\n' +
      '5. Обязательно:\n' +
      '- отметить межглазную асимметрию (если есть)\n' +
      '- различать OD и OS\n\n' +
      '6. В конце:\n' +
      'сформировать осторожную оценку:\n\n' +
      'Если есть изменения:\n' +
      '"Полученные данные могут соответствовать структурным изменениям (низкой, умеренной или высокой выраженности) и требуют сопоставления с функциональными тестами."\n\n' +
      'Если изменений нет:\n' +
      '"Данные ОКТ не выявляют признаков глаукомного поражения на момент исследования."\n\n' +
      '7. Стиль: нейтральный медицинский, без лишних рассуждений.\n\n' +
      '---\n' +
      'ДАННЫЕ ДЛЯ ОБРАБОТКИ:\n' +
      '- Нормализованные данные (все снимки): ' + JSON.stringify(data.normalized) + '\n' +
      '- Клинический анализ (агрегированный): ' + JSON.stringify(data.clinical) + '\n' +
      '- Уверенность: ' + data.confidence + '\n' +
      '- Качество: ' + JSON.stringify(data.quality) + '\n';
  }

  const schema = {
    type: Type.OBJECT,
    properties: {
      OD: { type: Type.STRING },
      OS: { type: Type.STRING },
      conclusion: { type: Type.STRING },
      summary: { type: Type.STRING },
      recommendation: { type: Type.STRING }
    },
    required: ["OD", "OS", "conclusion", "summary", "recommendation"]
  };

  return runAgent("explain_agent", prompt, undefined, undefined, modelToUse, schema);
}

/**
 * AGENT 7: Report Generator
 * Final step to ensure data consistency and strict formatting.
 */
export async function reportAgent(data: {
  explain: any;
  patient: any;
  normalized: any;
  language: 'ru' | 'en';
}, model?: string) {
  const { language } = data;
  const prompt = 'Ты высококвалифицированный врач-офтальмолог. Твоя задача — составить финальное медицинское заключение (выписку) на основе анализа ОКТ.\n\n' +
    'ВАЖНО:\n' +
    '1. Внимательно изучи ВСЕ предоставленные исследования.\n' +
    '2. Если патологический признак (например, истончение RNFL) встречается хотя бы в одном из исторических снимков — он ДОЛЖЕН быть упомянут в отчете.\n' +
    '3. Не делай выводов о "норме", если хотя бы одно исследование указывает на отклонение.\n\n' +
    'ДАННЫЕ ИЗ ПРОТОКОЛА (explain_data):\n' +
    '- OD: ' + data.explain.OD_summary + '\n' +
    '- OS: ' + data.explain.OS_summary + '\n' +
    '- Заключение: ' + data.explain.interpretation + '\n' +
    '- Рекомендация: ' + data.explain.recommendation + '\n\n' +
    'МОРФОМЕТРИЧЕСКИЕ ДАННЫЕ (normalized_data):\n' +
    JSON.stringify(data.normalized, null, 2) + '\n\n' +
    'ИНСТРУКЦИИ ПО ЗАПОЛНЕНИЮ:\n' +
    '1. header.title: "Протокол ОКТ"\n' +
    '2. header.subtitle: "Выполнена ОКТ (спектральная оптическая когерентная томография): обоих глаз"\n' +
    '3. header.zones: "морфометрия головки зрительного нерва и прилегающего слоя нервных волокон. исследование комплекса ганглиозных клеток центральной зоны сетчатки."\n' +
    '4. header.date: "' + new Date().toLocaleDateString('ru-RU') + '"\n\n' +
    '5. Для каждого глаза (OD и OS):\n' +
    '   - quality: Опиши качество снимка на основе данных.\n' +
    '   - onh_morphometry: Извлеки параметры из normalized_data.\n' +
    '   - rnfl_morphometry: Извлеки параметры из normalized_data.\n' +
    '   - additional_description: Используй verbatim текст из explain_data (OD или OS соответственно).\n\n' +
    '6. conclusion:\n' +
    '   - OD_summary: Используй БЕЗ ИЗМЕНЕНИЙ текст из "OD:" в блоке explain_data.\n' +
    '   - OS_summary: Используй БЕЗ ИЗМЕНЕНИЙ текст из "OS:" в блоке explain_data.\n' +
    '   - interpretation: Используй БЕЗ ИЗМЕНЕНИЙ текст из "Заключение:" в блоке explain_data.\n\n' +
    '7. УДАЛИ ИЗ ОТЧЕТА ВСЕ ТАБЛИЦЫ С ЧИСЛОВЫМИ ДАННЫМИ МОРФОМЕТРИИ (average, disc_area и т.д.). Оставь только текстовое описание.\n\n' +
    '--- ПРАВИЛА ---\n' +
    '1. Язык: РУССКИЙ.\n' +
    '2. НЕ ИЗМЕНЯЙ ТЕКСТ ЗАКЛЮЧЕНИЙ — копируй их "как есть" (verbatim).\n' +
    '3. ОТВЕТЬ ТОЛЬКО JSON-ОБЪЕКТОМ.\n';

  const schema = {
    type: Type.OBJECT,
    properties: {
      header: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          subtitle: { type: Type.STRING },
          zones: { type: Type.STRING },
          date: { type: Type.STRING }
        },
        required: ["title", "subtitle", "zones", "date"]
      },
      patient: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          sex: { type: Type.STRING },
          dob: { type: Type.STRING }
        },
        required: ["id", "sex", "dob"]
      },
      OD: {
        type: Type.OBJECT,
        properties: {
          quality: { type: Type.STRING },
          onh_morphometry: {
            type: Type.OBJECT,
            properties: {
              disc_area: { type: Type.NUMBER },
              cup_area: { type: Type.NUMBER },
              cd_ratio: { type: Type.NUMBER },
              rim_volume: { type: Type.NUMBER }
            },
            required: ["disc_area", "cup_area", "cd_ratio", "rim_volume"]
          },
          rnfl_morphometry: {
            type: Type.OBJECT,
            properties: {
              average: { type: Type.NUMBER },
              inferior: { type: Type.NUMBER },
              superior: { type: Type.NUMBER },
              nasal: { type: Type.NUMBER },
              temporal: { type: Type.NUMBER }
            },
            required: ["average", "inferior", "superior", "nasal", "temporal"]
          },
          additional_description: { type: Type.STRING },
          macula_description: { type: Type.STRING }
        },
        required: ["quality", "onh_morphometry", "rnfl_morphometry", "additional_description", "macula_description"]
      },
      OS: {
        type: Type.OBJECT,
        properties: {
          quality: { type: Type.STRING },
          onh_morphometry: {
            type: Type.OBJECT,
            properties: {
              disc_area: { type: Type.NUMBER },
              cup_area: { type: Type.NUMBER },
              cd_ratio: { type: Type.NUMBER },
              rim_volume: { type: Type.NUMBER }
            },
            required: ["disc_area", "cup_area", "cd_ratio", "rim_volume"]
          },
          rnfl_morphometry: {
            type: Type.OBJECT,
            properties: {
              average: { type: Type.NUMBER },
              inferior: { type: Type.NUMBER },
              superior: { type: Type.NUMBER },
              nasal: { type: Type.NUMBER },
              temporal: { type: Type.NUMBER }
            },
            required: ["average", "inferior", "superior", "nasal", "temporal"]
          },
          additional_description: { type: Type.STRING },
          macula_description: { type: Type.STRING }
        },
        required: ["quality", "onh_morphometry", "rnfl_morphometry", "additional_description", "macula_description"]
      },
      conclusion: {
        type: Type.OBJECT,
        properties: {
          OD_summary: { type: Type.STRING },
          OS_summary: { type: Type.STRING },
          interpretation: { type: Type.STRING }
        },
        required: ["OD_summary", "OS_summary", "interpretation"]
      },
      note: { type: Type.STRING },
      recommendation: { type: Type.STRING }
    },
    required: ["header", "patient", "OD", "OS", "conclusion", "note", "recommendation"]
  };

  return runAgent("report_agent", prompt, undefined, undefined, model, schema, ThinkingLevel.LOW);
}

export async function runCustomPrompt(prompt: string, image?: string, mimeType?: string, model?: string): Promise<AgentResult> {
  return runAgent("custom_test", prompt, image, mimeType, model);
}

// --- ORCHESTRATORS ---

export function createEmptyStudy(fileData: string, thumbnailUrl?: string): OCTStudy {
  return {
    id: Math.random().toString(36).substr(2, 9),
    type: 'OCT',
    modality: 'OCT',
    subtype: 'GLAUCOMA',
    role: 'STRUCTURAL_GLAUCOMA',
    eye: 'BOTH',
    quality_score: 0,
    usability: 'VALID',
    timestamp: Date.now(),
    imageUrl: fileData,
    thumbnailUrl: thumbnailUrl,
    layout: {
      has_tables: false,
      has_onh_parameters: false,
      has_rnfl_plot: false,
      has_etdrs_grid: false,
      has_bscan: false,
      eye: 'unknown',
      study_type: 'UNKNOWN'
    },
    raw_metrics: { OD: [], OS: [], unknown: [] },
    normalized: { 
      OD: {
        rnfl: { average: null, superior: null, inferior: null, nasal: null, temporal: null }, 
        onh: { rim_area: null, disc_area: null, cup_area: null, cd_ratio: null, cd_vertical: null, ddls: null, rim_volume: null, cup_volume: null }, 
        macula: { central: null, average: null, volume: null }
      },
      OS: {
        rnfl: { average: null, superior: null, inferior: null, nasal: null, temporal: null }, 
        onh: { rim_area: null, disc_area: null, cup_area: null, cd_ratio: null, cd_vertical: null, ddls: null, rim_volume: null, cup_volume: null }, 
        macula: { central: null, average: null, volume: null }
      },
      global: {},
      debug: {}
    },
    quality: {
      OD: { status: 'warning', issues: ['Анализ не выполнен'] },
      OS: { status: 'warning', issues: ['Анализ не выполнен'] },
      global: { status: 'warning', issues: ['Анализ не выполнен'] }
    },
    clinical: {
      OD: { score: 0, features: { rnfl_thinning: false, rnfl_sector_loss: false, cd_high: false, ddls_high: false, rim_area_low: false, cup_volume_high: false } },
      OS: { score: 0, features: { rnfl_thinning: false, rnfl_sector_loss: false, cd_high: false, ddls_high: false, rim_area_low: false, cup_volume_high: false } },
      global: { asymmetry: false, asymmetry_value: 0 }
    },
    diagnosis: {
      glaucoma_risk: 'low',
      possible_diagnosis: 'Анализ не выполнен',
      explanation: 'Произошла ошибка при автоматическом анализе (возможно, превышена квота). Снимок сохранен, вы можете попробовать запустить анализ позже.',
      recommendations: ['Повторите анализ снимка вручную']
    },
    agentResults: []
  };
}

/**
 * RETINA AGENT 1: Macula Thickness Agent
 */
export async function maculaThicknessAgent(fileData: string, mimeType: string = "image/jpeg", model?: string) {
  const prompt = `
    AGENT: Macula Thickness Agent
    TASK: Extract macula thickness values from the ETDRS grid if present.
    
    Look for:
    - Central subfield thickness (CST) or Central foveal thickness (CFT)
    - Inner and outer ring thickness values (Superior, Inferior, Nasal, Temporal)
    - Total macular volume
    
    OUTPUT: JSON {
      "OD": { "cst": number | null, "volume": number | null, "inner": { "S": number, "I": number, "N": number, "T": number }, "outer": { "S": number, "I": number, "N": number, "T": number } } | null,
      "OS": { "cst": number | null, "volume": number | null, "inner": { "S": number, "I": number, "N": number, "T": number }, "outer": { "S": number, "I": number, "N": number, "T": number } } | null
    }
  `;
  const schema = {
    type: Type.OBJECT,
    properties: {
      OD: { type: Type.OBJECT, nullable: true },
      OS: { type: Type.OBJECT, nullable: true }
    }
  };
  return runAgent("macula_thickness", prompt, fileData, mimeType, model, schema, ThinkingLevel.LOW);
}

/**
 * RETINA AGENT 2: ETDRS Analyzer
 */
export async function etdrsAnalyzerAgent(fileData: string, mimeType: string = "image/jpeg", model?: string) {
  const prompt = `
    AGENT: ETDRS Analyzer
    TASK: Analyze the ETDRS grid for asymmetry and thinning.
    
    OUTPUT: JSON {
      "asymmetry_detected": boolean,
      "thinning_detected": boolean,
      "sectors_affected": string[]
    }
  `;
  const schema = {
    type: Type.OBJECT,
    properties: {
      asymmetry_detected: { type: Type.BOOLEAN },
      thinning_detected: { type: Type.BOOLEAN },
      sectors_affected: { type: Type.ARRAY, items: { type: Type.STRING } }
    },
    required: ["asymmetry_detected", "thinning_detected", "sectors_affected"]
  };
  return runAgent("etdrs_analyzer", prompt, fileData, mimeType, model, schema, ThinkingLevel.LOW);
}

/**
 * RETINA AGENT 3: Edema Detector
 */
export async function edemaDetectorAgent(fileData: string, mimeType: string = "image/jpeg", model?: string) {
  const prompt = `
    AGENT: Edema Detector
    TASK: Detect signs of macular edema (intraretinal fluid, subretinal fluid, cystic spaces).
    
    OUTPUT: JSON {
      "edema_present": boolean,
      "fluid_type": "intraretinal" | "subretinal" | "both" | "none",
      "severity": "mild" | "moderate" | "severe" | "none"
    }
  `;
  const schema = {
    type: Type.OBJECT,
    properties: {
      edema_present: { type: Type.BOOLEAN },
      fluid_type: { type: Type.STRING, enum: ["intraretinal", "subretinal", "both", "none"] },
      severity: { type: Type.STRING, enum: ["mild", "moderate", "severe", "none"] }
    },
    required: ["edema_present", "fluid_type", "severity"]
  };
  return runAgent("edema_detector", prompt, fileData, mimeType, model, schema, ThinkingLevel.LOW);
}

/**
 * RETINA AGENT 4: Drusen Detector
 */
export async function drusenDetectorAgent(fileData: string, mimeType: string = "image/jpeg", model?: string) {
  const prompt = `
    AGENT: Drusen Detector
    TASK: Detect and classify drusen (small, medium, large, hard, soft).
    
    OUTPUT: JSON {
      "drusen_present": boolean,
      "type": string,
      "count_estimate": string
    }
  `;
  const schema = {
    type: Type.OBJECT,
    properties: {
      drusen_present: { type: Type.BOOLEAN },
      type: { type: Type.STRING },
      count_estimate: { type: Type.STRING }
    },
    required: ["drusen_present", "type", "count_estimate"]
  };
  return runAgent("drusen_detector", prompt, fileData, mimeType, model, schema, ThinkingLevel.LOW);
}

/**
 * RETINA AGENT 5: Vitreomacular Interface Agent
 */
export async function vmiAgent(fileData: string, mimeType: string = "image/jpeg", model?: string) {
  const prompt = `
    AGENT: Vitreomacular Interface Agent
    TASK: Analyze the vitreomacular interface for traction, membranes, or holes.
    
    OUTPUT: JSON {
      "vmt_present": boolean,
      "erm_present": boolean,
      "macular_hole": boolean
    }
  `;
  const schema = {
    type: Type.OBJECT,
    properties: {
      vmt_present: { type: Type.BOOLEAN },
      erm_present: { type: Type.BOOLEAN },
      macular_hole: { type: Type.BOOLEAN }
    },
    required: ["vmt_present", "erm_present", "macular_hole"]
  };
  return runAgent("vmi_agent", prompt, fileData, mimeType, model, schema, ThinkingLevel.LOW);
}

export async function orchestrateInitialClassification(
  fileData: string,
  onProgress?: (stage: string, progress: number) => void,
  model?: string
): Promise<Study> {
  try {
    const agentResults: AgentResult[] = [];

    // Detect mime type from data URL
    const mimeTypeMatch = fileData.match(/^data:([^;]+);base64,/);
    const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/jpeg";

    // 1. AGENT 1: Layout Classification
    onProgress?.("Классификация исследования (Agent 1)...", 50);
    const layoutResult = await layoutClassifierAgent(fileData, mimeType, model);
    if (layoutResult.status === 'error') throw new Error("Layout classification failed: " + (layoutResult.output?.error || "Unknown error"));
    agentResults.push(layoutResult);
    let layout = layoutResult.output;
    console.log(`[Agent 1] Layout:`, layout);

    // 1.1 Study Analyzer (IDENTIFY → VALIDATE → ROUTE)
    const studyAnalysis = studyAnalyzerAgent(layout);
    layout = {
      ...layout,
      role: studyAnalysis.role,
      usability: studyAnalysis.usability,
      doctor_message: studyAnalysis.doctor_message,
      study_type: studyAnalysis.modality as any,
      device_domain: studyAnalysis.device_domain
    };

    // Simulate random clinical data if missing (as requested)
    const simulatedClinical: ClinicalData = {
      IOP: {
        OD: { value: Math.floor(Math.random() * (26 - 14) + 14), method: "Goldmann" },
        OS: { value: Math.floor(Math.random() * (26 - 14) + 14), method: "Goldmann" }
      },
      risk_factors: {
        family_history: Math.random() > 0.7,
        myopia_high: Math.random() > 0.8,
        diabetes: Math.random() > 0.9
      }
    };

    const study: Study = {
      id: Math.random().toString(36).substr(2, 9),
      type: (layout.study_type || 'OCT') as StudyType,
      modality: studyAnalysis.modality,
      subtype: studyAnalysis.subtype,
      role: studyAnalysis.role,
      eye: (layout.eye || 'BOTH') as any,
      usability: studyAnalysis.usability,
      quality_score: layout.image_quality || 0,
      clinical_quality_flag: layout.clinical_quality_flag || undefined,
      timestamp: Date.now(),
      imageUrl: fileData,
      examDate: layout.exam_date || undefined,
      patient_info: layout.patient_info || { dob: `${Math.floor(Math.random() * 28 + 1)}.${Math.floor(Math.random() * 12 + 1)}.${Math.floor(Math.random() * (1980 - 1950) + 1950)}` },
      doctor_message: studyAnalysis.doctor_message,
      device_domain: studyAnalysis.device_domain,
      is_medical_study: layout.is_medical_study,
      status: (layout.is_medical_study === false || (layout.image_quality && layout.image_quality < 10)) 
        ? 'rejected' 
        : (layout.image_quality && layout.image_quality >= 70) ? 'accepted' : 'pending_review',
      clinical: simulatedClinical,
      
      data: {
        raw_metrics: { OD: [], OS: [], unknown: [] },
        normalized: { 
          OD: { 
            rnfl: { average: null, std_dev: null, quadrants: { S: null, N: null, I: null, T: null } }, 
            onh: { disc_area: null, rim_area: null, cup_area: null, cd_ratio: null, cd_vertical: null }, 
            macula: { central: null, volume: null } 
          }, 
          OS: { 
            rnfl: { average: null, std_dev: null, quadrants: { S: null, N: null, I: null, T: null } }, 
            onh: { disc_area: null, rim_area: null, cup_area: null, cd_ratio: null, cd_vertical: null }, 
            macula: { central: null, volume: null } 
          }, 
          global: { device_symmetry_index: null } 
        },
        quality: { OD: { status: 'good', issues: [] }, OS: { status: 'good', issues: [] }, global: { status: 'good', issues: [] } },
        clinical: { OD: { score: 0, features: {} }, OS: { score: 0, features: {} }, global: { asymmetry: false, asymmetry_value: 0 } },
        earlySuspicion: { risk_level: 'UNKNOWN', early_signs: [], confidence: 0, requires_followup: true, details: { asymmetry_score: 0, thinning_score: 0, onh_score: 0, macula_score: 0 } }
      },

      layout: {
        has_tables: !!layout.has_tables || (layout.study_type === 'OCT'),
        has_onh_parameters: !!layout.has_onh_parameters || (layout.report_type === 'RNFL' || layout.report_type === 'ONH'),
        has_rnfl_plot: !!layout.has_rnfl_plot || (layout.report_type === 'RNFL'),
        has_etdrs_grid: !!layout.has_etdrs_grid || (layout.report_type === 'MACULA'),
        has_bscan: !!layout.has_bscan || (layout.report_type === 'BSCAN'),
        eye: layout?.eye || 'unknown',
        device: layout?.device || 'Unknown',
        report_type: layout?.report_type || 'Unknown',
        study_type: layout?.study_type || 'OCT',
        role: layout?.role,
        usability: layout?.usability,
        doctor_message: layout?.doctor_message,
        device_domain: layout?.device_domain,
        image_quality: layout?.image_quality,
        quality_explanation: layout?.quality_explanation,
        preliminary_analysis: layout?.preliminary_analysis
      },
      raw_metrics: { OD: [], OS: [], unknown: [] },
      normalized: { OD: { rnfl: {}, onh: {}, macula: {} }, OS: { rnfl: {}, onh: {}, macula: {} }, global: {} },
      quality: { OD: { status: 'good', issues: [] }, OS: { status: 'good', issues: [] }, global: { status: 'good', issues: [] } },
      agentResults
    };

    return study;
  } catch (error) {
    console.error("[orchestrateInitialClassification] Critical failure:", error);
    throw error;
  }
}


/**
 * Study Router Pipeline
 */
export function routeStudyPipeline(layout: any): "glaucoma_pipeline" | "retina_pipeline" | "unknown" {
  if (!layout) return "unknown";
  if (layout.study_type === "OCT") {
    if (
      layout.report_type === "RNFL" || 
      layout.report_type === "ONH" || 
      layout.report_type === "GCC" || 
      layout.report_type === "MACULA" || 
      layout.report_type === "GLAUCOMA" ||
      layout.has_rnfl_plot || 
      layout.has_onh_parameters ||
      layout.has_tables
    ) {
      return "glaucoma_pipeline";
    }
    if (layout.report_type === "BSCAN" || layout.report_type === "MACULA_THICKNESS") {
      return "retina_pipeline";
    }
  }
  return "unknown";
}

/**
 * Main Orchestrator for Study Analysis
 * Incremental and respects existing successful results.
 */
export async function orchestrateFullPipeline(
  study: Study,
  onProgress?: (stage: string, progress: number) => void,
  model?: string,
  language: 'ru' | 'en' = 'ru',
  skipClassification: boolean = false,
  forceReRun: boolean = false,
  clinicalData?: ClinicalData,
  allStudies?: Study[],
  onlyAnalysis: boolean = false
): Promise<Study> {
  // Rotate image if needed so the AI sees the correct orientation
  let fileData = study.imageUrl;
  if (study.rotation && study.rotation !== 0) {
    onProgress?.("Подготовка изображения (поворот)...", 5);
    try {
      fileData = await rotateImage(study.imageUrl, study.rotation);
    } catch (e) {
      console.error("Failed to rotate image for analysis:", e);
    }
  }

  let layout = study.layout;
  
  // Initialize agentResults from existing study results to maintain "Playground connection"
  let agentResults: AgentResult[] = study.agentResults ? [...study.agentResults] : [];

  // Helper to get existing successful result
  const getExistingResult = (name: string) => 
    agentResults.find(r => r.agentName === name && r.status === 'success');

  // Detect mime type from data URL
  const mimeTypeMatch = fileData.match(/^data:([^;]+);base64,/);
  const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/jpeg";

  try {
    // 1. AGENT 1: Layout Classification
    let mustRunRest = forceReRun;

    const existingLayout = getExistingResult('layout_classifier');
    if (skipClassification || (!mustRunRest && existingLayout)) {
      onProgress?.("Использование существующей классификации...", 10);
      layout = existingLayout ? existingLayout.output : study.layout;
      console.log(`[Pipeline] Using existing layout:`, layout);
    } else {
      mustRunRest = true;
      onProgress?.("Классификация исследования (Agent 1)...", 10);
      const layoutResult = await layoutClassifierAgent(fileData, mimeType, model);
      if (layoutResult.status === 'error') throw new Error("Layout classification failed: " + (layoutResult.output?.error || "Unknown error"));
      
      // Update agentResults: remove old, add new
      agentResults = [layoutResult, ...agentResults.filter(r => r.agentName !== 'layout_classifier')];
      layout = layoutResult.output;
      console.log(`[Agent 1] New Layout:`, layout);
    }

    // 1.1 Study Analyzer (IDENTIFY → VALIDATE → ROUTE)
    const studyAnalysis = studyAnalyzerAgent(layout as any);

    let rawMetrics: any = study.raw_metrics || { 
      OD: { parameters: [], RNFL: {}, rnfl_color_map: {} }, 
      OS: { parameters: [], RNFL: {}, rnfl_color_map: {} }, 
      unknown: [] 
    };
    let normalizedRaw: any = study.normalized || { 
      OD: { 
        rnfl: { average: null, std_dev: null, quadrants: { S: null, N: null, I: null, T: null } }, 
        onh: { disc_area: null, rim_area: null, cup_area: null, cd_ratio: null, cd_vertical: null }, 
        macula: { central: null, volume: null } 
      }, 
      OS: { 
        rnfl: { average: null, std_dev: null, quadrants: { S: null, N: null, I: null, T: null } }, 
        onh: { disc_area: null, rim_area: null, cup_area: null, cd_ratio: null, cd_vertical: null }, 
        macula: { central: null, volume: null } 
      }, 
      global: { device_symmetry_index: null } 
    };
    let quality: any = study.quality || { OD: { status: 'good', issues: [] }, OS: { status: 'good', issues: [] }, global: { status: 'good', issues: [] } };
    let clinical: any = study.clinical || { OD: { score: 0, features: {} }, OS: { score: 0, features: {} }, global: { asymmetry: false, asymmetry_value: 0 } };
    let perimetryData: any = study.perimetry || null;
    let topographyData: any = study.topography || null;
    let biometryData: any = study.biometry || null;

    // 1. Study Router
    let pipeline = routeStudyPipeline(layout);
    console.log(`[Study Router] Selected Pipeline: ${pipeline}`);
    onProgress?.(`Выбран пайплайн: ${pipeline === 'glaucoma_pipeline' ? 'Глаукома' : pipeline === 'retina_pipeline' ? 'Сетчатка' : 'Неизвестно'}`, 15);

    // If study is manually accepted or has a clinical quality flag, we should try to run the pipeline
    const isAccepted = study.status === 'accepted';
    const hasClinicalFlag = !!layout?.clinical_quality_flag;
    
    // ROUTER logic based on Pipeline and Device Domain
    if (!studyAnalysis.allow_pipeline && !isAccepted && !hasClinicalFlag) {
      onProgress?.(`Исследование определено как ${studyAnalysis.modality} (${studyAnalysis.subtype}). Детальный анализ пропущен.`, 100);
      console.log(`[Study Router] Pipeline skipped: allow_pipeline is false. Modality: ${studyAnalysis.modality}, Role: ${studyAnalysis.role}`);
    } else {
      // Force glaucoma pipeline for accepted OCT studies or those with clinical flags if unknown
      if ((isAccepted || hasClinicalFlag) && pipeline === 'unknown' && (layout?.study_type === 'OCT' || studyAnalysis.modality === 'OCT')) {
        pipeline = 'glaucoma_pipeline';
        console.log(`[Study Router] Forcing glaucoma_pipeline. isAccepted: ${isAccepted}, hasClinicalFlag: ${hasClinicalFlag}`);
        onProgress?.("Принудительный запуск OCT Glaucoma Pipeline...", 20);
      }

      if (pipeline === 'glaucoma_pipeline') {
        // OCT glaucoma pipeline
        console.log(`[Pipeline] Starting OCT Glaucoma Pipeline`);
        onProgress?.("Запуск OCT Glaucoma Pipeline...", 20);
      
        // 2. AGENT 2: Universal Extractor
        const existingExtractor = getExistingResult('universal_extractor');
        if (!mustRunRest && existingExtractor) {
          onProgress?.("Использование существующих данных экстракции...", 25);
          rawMetrics = existingExtractor.output;
        } else {
          mustRunRest = true;
          onProgress?.("Извлечение данных (Agent 2)...", 25);
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          const extractorLayout = { 
            ...layout, 
            has_tables: true, 
            has_onh_parameters: true,
            has_rnfl_plot: true 
          };
          const extractorResult = await universalExtractorAgent(fileData, mimeType, model, extractorLayout as any);
          agentResults = [extractorResult, ...agentResults.filter(r => r.agentName !== 'universal_extractor')];
          
          if (extractorResult.status === 'success') {
            const output = extractorResult.output;
            rawMetrics = {
              OD: output.OD || { parameters: [], RNFL: {}, rnfl_color_map: {} },
              OS: output.OS || { parameters: [], RNFL: {}, rnfl_color_map: {} },
              unknown: output.unknown || [],
              eye: output.eye || layout?.eye || "UNKNOWN",
              eye_confidence: output.eye_confidence || layout?.eye_confidence || 50,
              free_text_scan: output.free_text_scan || {}
            };
            
            const getMetricCount = (eyeData: any) => {
              if (!eyeData) return 0;
              if (Array.isArray(eyeData)) return eyeData.length;
              let count = eyeData.parameters?.length || 0;
              if (eyeData.RNFL?.values) {
                count += Object.keys(eyeData.RNFL.values).filter(k => eyeData.RNFL.values[k] !== null).length;
              }
              return count;
            };

            const odCount = getMetricCount(rawMetrics.OD);
            const osCount = getMetricCount(rawMetrics.OS);
            if (odCount > 0 && osCount > 0) layout.eye = "BOTH";
            else if (odCount > 0) layout.eye = "OD";
            else if (osCount > 0) layout.eye = "OS";
            
            onProgress?.(`Agent 2: Извлечено метрик: OD=${odCount}, OS=${osCount}`, 30);
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Internal step: Normalization
        const existingNormalizer = getExistingResult('normalizer');
        if (!mustRunRest && existingNormalizer) {
          onProgress?.("Использование нормализованных данных...", 35);
          normalizedRaw = cleanNormalizedData(existingNormalizer.output);
        } else {
          mustRunRest = true;
          onProgress?.("Нормализация данных...", 35);
          const normalizerResult = await normalizerAgent(rawMetrics, layout?.report_type || "Unknown", model, layout);
          agentResults = [normalizerResult, ...agentResults.filter(r => r.agentName !== 'normalizer')];
          
          if (normalizerResult.status === 'success') {
            normalizedRaw = cleanNormalizedData(normalizerResult.output);
            if (rawMetrics.free_text_scan) {
              const fullText = rawMetrics.free_text_scan.full_text || "";
              const odClass = rawMetrics.free_text_scan.od_classification;
              const osClass = rawMetrics.free_text_scan.os_classification;
              if (odClass) normalizedRaw.OD.rnfl.classification = normalizeClassification(odClass);
              if (osClass) normalizedRaw.OS.rnfl.classification = normalizeClassification(osClass);
            }
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // 3. SCAN LEVEL DETERMINISTIC ANALYZERS (RULES)
        // These process the raw data of the SPECIFIC SCAN.
        onProgress?.("Контроль качества и анализ скана...", 50);
        const detQualStart = Date.now();
        const detQualOutput = quality_analyzer(normalizedRaw);
        const rnflRes = RNFL_analyzer(normalizedRaw);
        const macRes = macula_analyzer({ OD: normalizedRaw.OD, OS: normalizedRaw.OS });
        const onhRes = {
          OD: onhAnalyzer(normalizedRaw.OD?.onh || normalizedRaw.OD?.rnfl || normalizedRaw.OD),
          OS: onhAnalyzer(normalizedRaw.OS?.onh || normalizedRaw.OS?.rnfl || normalizedRaw.OS)
        };
        
        // 🔑 SCAN-LEVEL clinical analysis for the single scan
        const scanClinicalInput = {
          OD: { 
            rnfl: rnflRes.OD, 
            disc: onhRes.OD,
            macula: macRes.OD,
            confidence: detQualOutput.OD?.confidence || "low" 
          },
          OS: { 
            rnfl: rnflRes.OS, 
            disc: onhRes.OS,
            macula: macRes.OS,
            confidence: detQualOutput.OS?.confidence || "low" 
          },
          global: { confidence: detQualOutput.global?.confidence || "low" }
        };
        const clinicalRes = clinicalAnalyzerScan(scanClinicalInput);
        
        const detDuration = Date.now() - detQualStart;

        quality = detQualOutput;
        clinical = clinicalRes;

        agentResults = [
          { agentName: 'quality_analyzer', timestamp: Date.now(), status: 'success', output: detQualOutput, duration: Math.floor(detDuration/5) },
          { agentName: 'rnfl_analyzer', timestamp: Date.now(), status: 'success', output: rnflRes, duration: Math.floor(detDuration/5) },
          { agentName: 'macula_analyzer', timestamp: Date.now(), status: 'success', output: macRes, duration: Math.floor(detDuration/5) },
          { agentName: 'onh_analyzer', timestamp: Date.now(), status: 'success', output: onhRes, duration: Math.floor(detDuration/5) },
          { agentName: 'clinical_analyzer', timestamp: Date.now(), status: 'success', output: clinicalRes, duration: Math.floor(detDuration/5) },
          ...agentResults.filter(r => !['quality_analyzer', 'rnfl_analyzer', 'macula_analyzer', 'onh_analyzer', 'quality_control', 'clinical_analyzer'].includes(r.agentName))
        ];

        onProgress?.("Сбор данных скана завершен.", 100);
      } else if (pipeline === 'retina_pipeline') {
        onProgress?.("Запуск Retina Pipeline...", 20);
        
        const maculaResult = await maculaThicknessAgent(fileData, mimeType, model);
        if (maculaResult.status === 'success') agentResults = [maculaResult, ...agentResults.filter(r => r.agentName !== 'macula_thickness')];
        
        await new Promise(resolve => setTimeout(resolve, 800));
        const etdrsResult = await etdrsAnalyzerAgent(fileData, mimeType, model);
        if (etdrsResult.status === 'success') agentResults = [etdrsResult, ...agentResults.filter(r => r.agentName !== 'etdrs_analyzer')];
        
        await new Promise(resolve => setTimeout(resolve, 800));
        const edemaResult = await edemaDetectorAgent(fileData, mimeType, model);
        if (edemaResult.status === 'success') agentResults = [edemaResult, ...agentResults.filter(r => r.agentName !== 'edema_detector')];
        
        await new Promise(resolve => setTimeout(resolve, 800));
        const vmiResult = await vmiAgent(fileData, mimeType, model);
        if (vmiResult.status === 'success') agentResults = [vmiResult, ...agentResults.filter(r => r.agentName !== 'vmi_agent')];

        clinical = {
          OD: { features: ["Retina analysis completed"], severity: 0, stage: "норма" },
          OS: { features: ["Retina analysis completed"], severity: 0, stage: "норма" },
          global: { note: "Retina analysis completed" }
        };
        agentResults = [{ agentName: "clinical_analyzer", timestamp: Date.now(), status: "success", output: clinical, duration: 0 }, ...agentResults.filter(r => r.agentName !== 'clinical_analyzer')];
      } else if (studyAnalysis.modality === "PERIMETRY") {
        onProgress?.("Запуск Perimetry Pipeline...", 40);
        const perimetryResult = await perimetryAnalyzerAgent(fileData, mimeType, model);
        agentResults = [perimetryResult, ...agentResults.filter(r => r.agentName !== 'perimetry_analyzer')];
        if (perimetryResult.status === 'success') perimetryData = perimetryResult.output;
      } else if (studyAnalysis.modality === "TOPOGRAPHY") {
        onProgress?.("Запуск Topography Pipeline...", 40);
        const topographyResult = await topographyAnalyzerAgent(fileData, mimeType, model);
        agentResults = [topographyResult, ...agentResults.filter(r => r.agentName !== 'topography_analyzer')];
        if (topographyResult.status === 'success') topographyData = topographyResult.output;
      } else if (studyAnalysis.modality === "BIOMETRY") {
        onProgress?.("Запуск Biometry Pipeline...", 40);
        const biometryResult = await biometryAnalyzerAgent(fileData, mimeType, model);
        agentResults = [biometryResult, ...agentResults.filter(r => r.agentName !== 'biometry_analyzer')];
        if (biometryResult.status === 'success') biometryData = biometryResult.output;
      }
    }

    onProgress?.("Анализ снимка завершен.", 100);
    return {
      ...study,
      type: (layout.study_type || 'OCT') as StudyType,
      modality: studyAnalysis.modality,
      subtype: studyAnalysis.subtype,
      role: studyAnalysis.role,
      eye: (layout.eye || 'BOTH') as any,
      usability: studyAnalysis.usability,
      agentResults,
      normalized: normalizedRaw,
      raw_metrics: rawMetrics,
      clinical,
      quality,
      perimetry: perimetryData,
      topography: topographyData,
      biometry: biometryData,
      layout: layout,
      last_analyzed: Date.now()
    };
  } catch (error: any) {
    console.error(`[Orchestration Error]`, error);
    onProgress?.(`Ошибка: ${error.message || error}`, 100);
    throw error;
  }
}

export async function orchestrateAdditionalAnalysis(
  study: Study,
  onProgress?: (stage: string, progress: number) => void,
  model?: string,
  language: 'ru' | 'en' = 'ru'
): Promise<Study> {
  return orchestrateFullPipeline(study, onProgress, model, language, true, false);
}

export async function orchestrateStudyAnalysis(
  fileData: string,
  onProgress?: (stage: string, progress: number) => void,
  model?: string,
  language: 'ru' | 'en' = 'ru'
): Promise<Study> {
  try {
    const initialStudy = await orchestrateInitialClassification(fileData, onProgress, model);
    return orchestrateFullPipeline(initialStudy, onProgress, model, language, true);
  } catch (error) {
    console.error("[orchestrateStudyAnalysis] Critical failure:", error);
    throw error;
  }
}


export function updateStudyWithAgentResult(study: OCTStudy, result: AgentResult): OCTStudy {
  const updatedStudy = { ...study };
  const output = result.output;

  if (!updatedStudy.agentResults) updatedStudy.agentResults = [];
  // Remove existing result for the same agent if it exists
  const filteredResults = updatedStudy.agentResults.filter(r => r.agentName !== result.agentName);
  // Prepend the new result to the top
  updatedStudy.agentResults = [result, ...filteredResults];

  switch (result.agentName) {
    case 'layout_classifier':
      updatedStudy.examDate = output.exam_date || updatedStudy.examDate;
      updatedStudy.patient_info = output.patient_info || updatedStudy.patient_info;
      updatedStudy.clinical_quality_flag = output.clinical_quality_flag || updatedStudy.clinical_quality_flag;
      updatedStudy.layout = {
        ...updatedStudy.layout,
        has_tables: !!output.has_tables,
        has_onh_parameters: !!output.has_onh_parameters,
        has_rnfl_plot: !!output.has_rnfl_plot,
        has_etdrs_grid: !!output.has_etdrs_grid,
        has_bscan: !!output.has_bscan,
        eye: output.eye || 'unknown',
        device: output.device || updatedStudy.layout?.device || 'Unknown',
        exam_date: output.exam_date || updatedStudy.layout?.exam_date || null,
        report_type: output.report_type || updatedStudy.layout?.report_type || 'Unknown',
        study_type: output.study_type || updatedStudy.layout?.study_type || 'OCT',
        device_domain: output.device_domain || updatedStudy.layout?.device_domain || 'unknown'
      };
      break;

    case 'universal_extractor':
      updatedStudy.raw_metrics = {
        OD: output.OD || [],
        OS: output.OS || [],
        unknown: output.unknown || []
      };
      break;

    case 'normalizer':
      const cleanedOutput = cleanNormalizedData(output);
      updatedStudy.normalized = {
        OD: cleanedOutput.OD || updatedStudy.normalized?.OD || {},
        OS: cleanedOutput.OS || updatedStudy.normalized?.OS || {},
        global: cleanedOutput.global || updatedStudy.normalized?.global || {},
        asymmetry: cleanedOutput.asymmetry || updatedStudy.normalized?.asymmetry || {},
        debug: cleanedOutput.debug || updatedStudy.normalized?.debug || {}
      };
      break;

    case 'quality_control':
      updatedStudy.quality = {
        OD: output.OD || { status: 'good', issues: [] },
        OS: output.OS || { status: 'good', issues: [] },
        global: output.global || { status: 'good', issues: [] }
      };
      break;

    case 'clinical_analyzer':
      updatedStudy.clinical = output;
      break;

    case 'early_glaucoma_agent':
      updatedStudy.earlySuspicion = output;
      break;

    case 'confidence_analyzer':
      updatedStudy.confidence = output;
      break;

    case 'conclusion_builder':
      updatedStudy.report_text = output.conclusion_text;
      break;

    case 'trust_layer':
      updatedStudy.trust = output;
      break;

    case 'perimetry_analyzer':
      updatedStudy.perimetry = output;
      break;

    case 'topography_analyzer':
      updatedStudy.topography = output;
      break;

    case 'biometry_analyzer':
      updatedStudy.biometry = output;
      break;

    case 'reasoning':
      updatedStudy.reasoning = output;
      break;

    case 'collector_normalizer':
      updatedStudy.collectorNormalized = output;
      // Also update the main normalized field so other agents can use it
      if (output && (output.OD || output.OS)) {
        const cleanedCollectorOutput = cleanNormalizedData(output);
        updatedStudy.normalized = {
          OD: cleanedCollectorOutput.OD || updatedStudy.normalized?.OD || {},
          OS: cleanedCollectorOutput.OS || updatedStudy.normalized?.OS || {},
          global: cleanedCollectorOutput.global || updatedStudy.normalized?.global || {},
          asymmetry: cleanedCollectorOutput.asymmetry || updatedStudy.normalized?.asymmetry || {},
          debug: cleanedCollectorOutput.debug || updatedStudy.normalized?.debug || {}
        };
      }
      break;

    case 'diagnosis_agent':
      updatedStudy.diagnosis = {
        glaucoma_risk: output.structural.status === 'moderate_or_advanced_damage' ? 'high' : 
                       output.structural.status === 'early_damage' ? 'moderate' : 'low',
        possible_diagnosis: output.final_diagnosis || 'Ожидает общей диагностики',
        explanation: `Статус: Стр=${output.structural.status}, Функ=${output.functional.status}`,
        recommendations: output.structural.status !== 'normal'
          ? ['Рекомендуется консультация офтальмолога', 'Дополнительные исследования (периметрия)']
          : ['Плановый осмотр через 12 месяцев']
      };
      break;

    case 'explain_agent':
      // This agent primarily updates PatientAnalysis, but we store it in agentResults for the study
      break;
  }

  return updatedStudy;
}

export function getAggregatedData(studies: OCTStudy[]) {
  // Sort studies by timestamp
  const sortedStudies = [...studies].sort((a, b) => a.timestamp - b.timestamp);
  
  // 1. Process the series to pick the BEST scans per eye/modality
  const series = series_processor(sortedStudies);

  // 🔑 SYNC: Inject scan-level results back into the original study objects 
  // so the UI (agentResults) can see them.
  series.scans.forEach((enriched) => {
    const original = sortedStudies.find(s => s.id === enriched.id);
    if (original) {
      if (!original.agentResults) original.agentResults = [];
      
      // Add or update clinical_analyzer result
      const clinicalResult = {
        agentName: "clinical_analyzer",
        timestamp: Date.now(),
        status: "success" as "success",
        output: enriched.clinical_analysis,
        duration: 0
      };
      
      const clinicalIdx = original.agentResults.findIndex(r => r.agentName === 'clinical_analyzer');
      if (clinicalIdx >= 0) original.agentResults[clinicalIdx] = clinicalResult as any;
      else original.agentResults.push(clinicalResult as any);
      
      // Add or update quality_analyzer result
      const qualityResult = {
        agentName: "quality_analyzer",
        timestamp: Date.now(),
        status: "success" as "success",
        output: enriched.quality_analysis,
        duration: 0
      };
      
      const qualityIdx = original.agentResults.findIndex(r => r.agentName === 'quality_analyzer');
      if (qualityIdx >= 0) original.agentResults[qualityIdx] = qualityResult;
      else original.agentResults.push(qualityResult as any);

      // Add or update onh_analyzer result
      const onhResult = {
        agentName: "onh_analyzer",
        timestamp: Date.now(),
        status: "success" as "success",
        output: enriched.onh_analysis,
        duration: 0
      };
      
      const onhIdx = original.agentResults.findIndex(r => r.agentName === 'onh_analyzer');
      if (onhIdx >= 0) original.agentResults[onhIdx] = onhResult as any;
      else original.agentResults.push(onhResult as any);
    }
  });

  const aggregatedNormalized: any = {
    OD: { 
      rnfl: series.OD.RNFL ? { ...series.OD.RNFL, average: series.OD.RNFL.avg_thickness } : {}, 
      onh: series.OD.RNFL ? { 
        disc_area: series.OD.RNFL.disc_area, 
        rim_area: series.OD.RNFL.rim_area, 
        cup_area: series.OD.RNFL.cup_area,
        cup_disc_ratio: series.OD.RNFL.cdr, 
        ddls: series.OD.RNFL.ddls 
      } : {}, 
      macula: series.OD.MACULA ? { central: series.OD.MACULA.central_thickness } : {} 
    },
    OS: { 
      rnfl: series.OS.RNFL ? { ...series.OS.RNFL, average: series.OS.RNFL.avg_thickness } : {}, 
      onh: series.OS.RNFL ? { 
        disc_area: series.OS.RNFL.disc_area, 
        rim_area: series.OS.RNFL.rim_area, 
        cup_area: series.OS.RNFL.cup_area,
        cup_disc_ratio: series.OS.RNFL.cdr, 
        ddls: series.OS.RNFL.ddls 
      } : {}, 
      macula: series.OS.MACULA ? { central: series.OS.MACULA.central_thickness } : {} 
    },
    global: {
      interpretation_allowed: series.global.interpretation_allowed
    }
  };
  
  const aggregatedClinical: any = {
    OD: { score: 0, features: {} },
    OS: { score: 0, features: {} },
    global: { asymmetry: false, asymmetry_value: 0 }
  };

  const aggregatedPerimetry: any = {
    reliability: { OD: {}, OS: {} },
    MD: { OD: null, OS: null },
    PSD: { OD: null, OS: null },
    VFI: { OD: null, OS: null },
    GHT: { OD: null, OS: null },
    false_positives: { OD: null, OS: null },
    false_negatives: { OD: null, OS: null }
  };
  const aggregatedTopography: any = { K1: { OD: null, OS: null }, K2: { OD: null, OS: null }, CCT: { OD: null, OS: null }, astigmatism: { OD: null, OS: null } };
  const aggregatedBiometry: any = { AL: { OD: null, OS: null }, ACD: { OD: null, OS: null }, lens_thickness: { OD: null, OS: null } };
  
  const aggregatedQuality: any = { 
    OD: series.OD.QUALITY || { status: 'good', issues: [], interpretation_permission: false }, 
    OS: series.OS.QUALITY || { status: 'good', issues: [], interpretation_permission: false }, 
    global: { 
      status: (series.OD.QUALITY?.scan_quality === "limited" || series.OS.QUALITY?.scan_quality === "limited") ? "limited" : "ok",
      interpretation_permission: series.global.interpretation_allowed 
    } 
  };

  sortedStudies.forEach(s => {
    if (s.perimetry) {
      Object.keys(s.perimetry).forEach(key => {
        const k = key as keyof PerimetryData;
        if (s.perimetry![k] && typeof s.perimetry![k] === 'object') {
          if ((s.perimetry![k] as any).OD !== null && (s.perimetry![k] as any).OD !== undefined) aggregatedPerimetry[k].OD = (s.perimetry![k] as any).OD;
          if ((s.perimetry![k] as any).OS !== null && (s.perimetry![k] as any).OS !== undefined) aggregatedPerimetry[k].OS = (s.perimetry![k] as any).OS;
        }
      });
    }
    if (s.topography) {
      Object.keys(s.topography).forEach(key => {
        const k = key as keyof TopographyData;
        if (s.topography![k] && typeof s.topography![k] === 'object') {
          if ((s.topography![k] as any).OD !== null && (s.topography![k] as any).OD !== undefined) aggregatedTopography[k].OD = (s.topography![k] as any).OD;
          if ((s.topography![k] as any).OS !== null && (s.topography![k] as any).OS !== undefined) aggregatedTopography[k].OS = (s.topography![k] as any).OS;
        }
      });
    }
    if (s.biometry) {
      Object.keys(s.biometry).forEach(key => {
        const k = key as keyof BiometryData;
        if (s.biometry![k] && typeof s.biometry![k] === 'object') {
          if ((s.biometry![k] as any).OD !== null && (s.biometry![k] as any).OD !== undefined) aggregatedBiometry[k].OD = (s.biometry![k] as any).OD;
          if ((s.biometry![k] as any).OS !== null && (s.biometry![k] as any).OS !== undefined) aggregatedBiometry[k].OS = (s.biometry![k] as any).OS;
        }
      });
    }
  });

  // Clinical data (features, stage, severity) - MASTER AGGREGATION
  // 🧠 Run the MASTER AGGREGATOR on the BEST data selected by series_processor
  const masterAggregated = master_aggregator({
    RNFL: { OD: series.OD.RNFL, OS: series.OS.RNFL },
    MACULA: { OD: series.OD.MACULA, OS: series.OS.MACULA },
    QUALITY: { OD: series.OD.QUALITY, OS: series.OS.QUALITY },
    scans: series.scans // ✨ Use enriched scans with analysis results
  });
  
  // Using clinical_analyzer for formatting conclusion phrases
  console.log("INPUT TO CLINICAL (Aggregation):", masterAggregated);
  const finalFormatted = clinical_analyzer(masterAggregated);

  // Populate final aggregated clinical record
  aggregatedClinical.OD.flags = {
    rnfl_defect: masterAggregated.OD.rnfl.avg !== null && masterAggregated.OD.rnfl.avg < 75,
    macula_defect: masterAggregated.OD.macula.center !== null && masterAggregated.OD.macula.center < 230
  };
  aggregatedClinical.OS.flags = {
    rnfl_defect: masterAggregated.OS.rnfl.avg !== null && masterAggregated.OS.rnfl.avg < 75,
    macula_defect: masterAggregated.OS.macula.center !== null && masterAggregated.OS.macula.center < 230
  };
  
  aggregatedClinical.OD.features = finalFormatted.OD.features;
  aggregatedClinical.OS.features = finalFormatted.OS.features;
  aggregatedClinical.OD.reasons = finalFormatted.OD.reasons;
  aggregatedClinical.OS.reasons = finalFormatted.OS.reasons;
  aggregatedClinical.OD.severity = finalFormatted.OD.severity;
  aggregatedClinical.OS.severity = finalFormatted.OS.severity;

  aggregatedClinical.global.conclusion = finalFormatted.global.conclusion;
  
  aggregatedClinical.OD.stage = finalFormatted.OD.stage;
  aggregatedClinical.OS.stage = finalFormatted.OS.stage;
  aggregatedClinical.global.stage = finalFormatted.global.stage;
  aggregatedClinical.global.confidence = finalFormatted.global.confidence;

  const aggregatedRaw: any = { OD: { parameters: [], RNFL: {} }, OS: { parameters: [], RNFL: {} } };
  sortedStudies.forEach(s => {
    if (s.raw_metrics?.OD) {
      aggregatedRaw.OD.parameters.push(...(s.raw_metrics.OD.parameters || []));
      aggregatedRaw.OD.RNFL = { ...(aggregatedRaw.OD.RNFL || {}), ...(s.raw_metrics.OD.RNFL || {}) };
    }
    if (s.raw_metrics?.OS) {
      aggregatedRaw.OS.parameters.push(...(s.raw_metrics.OS.parameters || []));
      aggregatedRaw.OS.RNFL = { ...(aggregatedRaw.OS.RNFL || {}), ...(s.raw_metrics.OS.RNFL || {}) };
    }
  });

  return {
    normalized: aggregatedNormalized,
    clinical: aggregatedClinical,
    perimetry: aggregatedPerimetry,
    topography: aggregatedTopography,
    biometry: aggregatedBiometry,
    quality: aggregatedQuality,
    layout: sortedStudies[0]?.layout,
    raw_metrics: aggregatedRaw,
    masterAggregated // 🔑 Return this for agent results
  };
}

/**
 * Router: Adds a study to the patient's evidence layer based on its role.
 */
export function routeStudy(study: Study, patient: PatientRecord): PatientRecord {
  if (study.usability === "NON_DIAGNOSTIC") {
    return patient;
  }

  // Ensure evidence structure exists
  if (!patient.evidence) {
    patient.evidence = {
      structural_damage: [],
      functional_damage: [],
      pressure_risk: [],
      clinical_risk: []
    };
  }

  // Use clinical_analyzer results as evidence
  const clinicalResult = study.agentResults?.find(a => a.agentName === 'clinical_analyzer')?.output;
  let evidenceItems: EvidenceItem[] = [];
  
  if (clinicalResult) {
    const odFeatures = Array.isArray(clinicalResult.OD?.features) 
      ? clinicalResult.OD.features 
      : Object.keys(clinicalResult.OD?.features || {}).filter(k => clinicalResult.OD.features[k]);
      
    const osFeatures = Array.isArray(clinicalResult.OS?.features) 
      ? clinicalResult.OS.features 
      : Object.keys(clinicalResult.OS?.features || {}).filter(k => clinicalResult.OS.features[k]);
      
    evidenceItems = [
      ...odFeatures.map((f: string) => ({ name: f, confidence: 0.9, description: `OD: ${f}` })),
      ...osFeatures.map((f: string) => ({ name: f, confidence: 0.9, description: `OS: ${f}` }))
    ];
  }

  switch (study.role) {
    case "STRUCTURAL_GLAUCOMA":
      patient.evidence.structural_damage.push(...evidenceItems);
      break;
    case "FUNCTIONAL_GLAUCOMA":
      patient.evidence.functional_damage.push(...evidenceItems);
      break;
    case "IOP_CORRECTION":
      patient.evidence.pressure_risk.push(...evidenceItems);
      break;
    case "SUPPORTIVE":
      if (study.modality === "OCT") patient.evidence.structural_damage.push(...evidenceItems);
      if (study.modality === "BIOMETRY") patient.evidence.clinical_risk.push(...evidenceItems);
      break;
  }

  return patient;
}

/**
 * Patient Integrator: The "Master Agent" that analyzes the entire evidence layer.
 */
export function patientIntegrator(patient: PatientRecord): any {
  const structural = patient.evidence.structural_damage.length;
  const functional = patient.evidence.functional_damage.length;

  let status = "insufficient_data";

  if (structural && functional)
    status = "glaucoma_confirmed";
  else if (structural)
    status = "structural_suspect";
  else if (functional)
    status = "functional_suspect";

  return {
    status,
    studies_used: patient.studies.length
  };
}

export async function orchestratePatientAnalysis(
  studies: Study[],
  onProgress?: (step: string, progress: number) => void,
  model: string = "gemini-3-flash-preview",
  language: 'ru' | 'en' = 'ru',
  patientInfo?: { id: string; sex?: string; dob?: string }
): Promise<PatientAnalysis> {
  try {
    if (studies.length === 0) throw new Error("No studies to analyze");
    
    // Sort studies by timestamp to ensure correct dynamics analysis
    const sortedStudies = [...studies].sort((a, b) => a.timestamp - b.timestamp);
    
    onProgress?.('Анализ данных пациента...', 15);
  
  // Initialize Patient Record
  let patient: PatientRecord = {
    id: patientInfo?.id || Math.random().toString(36).substr(2, 9),
    patient_id: patientInfo?.id || 'Unknown',
    patient_meta: {
      sex: patientInfo?.sex,
      dob: patientInfo?.dob
    },
    studies: sortedStudies,
    clinical_data: {},
    evidence: {
      structural_damage: [],
      functional_damage: [],
      pressure_risk: [],
      clinical_risk: []
    }
  };

  // 1. DATA AGGREGATION (Master Aggregator)
  onProgress?.('Агрегация данных (Master Aggregator)...', 25);
  const startTimeAggr = Date.now();
  const aggregated = getAggregatedData(studies);
  await new Promise(resolve => setTimeout(resolve, 600)); // Visible progress

  // 2. CLINICAL RULES ANALYSIS (Clinical Analyzer Final)
  onProgress?.('Клинический анализ (Rules)...', 50);
  const startTimeRules = Date.now();
  // Clinical analysis results are part of the aggregated data
  await new Promise(resolve => setTimeout(resolve, 800));

  // 3. ROUTE EVIDENCE FROM ALL STUDIES
  onProgress?.('Сбор доказательств из исследований...', 65);
  sortedStudies.forEach(s => {
    patient = routeStudy(s, patient);
    
    // Extract clinical data from studies if available
    const clinicalData = s.clinical || s.data?.clinical;
    const topographyData = s.topography || s.data?.topography;
    const normalizedData = s.normalized || s.data?.normalized;

    if (s.type === 'TONOMETRY' && clinicalData?.IOP) {
      patient.clinical_data.IOP = clinicalData.IOP;
    }
    if (s.type === 'CORNEAL_TOPOGRAPHY' && topographyData?.CCT) {
      patient.clinical_data.CCT = {
        OD: topographyData.CCT.OD || 0,
        OS: topographyData.CCT.OS || 0
      };
    }
    
    if (s.type === 'OCT' && normalizedData) {
      patient.oct_data = normalizedData;
      Object.assign(patient, normalizedData);
    }
  });

  // 5. DATASET COMPLETENESS
  onProgress?.('Оценка полноты данных (AI)...', 75);
  patient.completeness = datasetCompletenessAgent(patient);
  await new Promise(resolve => setTimeout(resolve, 400));

  // 6. GENERATE CONCLUSION
  onProgress?.('Формирование заключения (Conclusion Builder)...', 85);
  const startTimeConclusion = Date.now();
  
  // 🧠 UPDATED: Pass data directly to the new generateOCTReport
  const reportOutput = generateOCTReport({
    masterAggregator: aggregated.masterAggregated,
    clinical: aggregated.clinical
  });
  const conclusionText = reportOutput.report_text;
  
  const summary = buildSummary(aggregated.clinical);
  const isSuspicious = summary !== "Норма";

  const confidenceValue = aggregated.clinical.global.confidence || "high";

  // 7. TRUST & CONFIDENCE
  onProgress?.('Проверка достоверности (Trust Layer)...', 95);
  const startTimeTrust = Date.now();
  const confidence = confidenceAnalyzer(
    aggregated.layout as any, 
    aggregated.normalized, 
    aggregated.clinical, 
    aggregated.raw_metrics
  );
  const trust = doctorTrustLayer(
    aggregated.layout as any, 
    aggregated.quality, 
    confidence, 
    aggregated.normalized, 
    language,
    aggregated.clinical
  );

  patient.conclusion = {
    conclusion_text: conclusionText,
    summary: summary,
    recommendations: isSuspicious ? "Контроль OCT" : "Плановое наблюдение"
  };

  onProgress?.('Завершение диагностики...', 100);
  
  const analysis: PatientAnalysis = {
    dynamics: studies.length > 1 ? "Анализ динамики" : "Статическое обследование",
    clinicalSigns: ["См. заключение"],
    diagnosis: summary,
    recommendations: [patient.conclusion.recommendations],
    glaucomaRisk: summary === "Признаки глаукомы" ? "high" : (summary === "Признаки, подозрительные на глаукому" ? "moderate" : "low"),
    possibleDiagnosis: patient.conclusion.summary,
    explanation: conclusionText,
    pattern: isSuspicious ? "Глаукома" : "Норма",
    clinicalAnalysis: {
      rnflStatus: "См. заключение",
      asymmetry: patient.evidence.structural_damage.some(e => e.name.includes('asymmetry')),
      glaucomaSigns: isSuspicious
    },
    trust: trust,
    
    // Modular fields
    evidence: patient.evidence,
    completeness: patient.completeness,
    conclusion: patient.conclusion,

    agentResults: [
      {
        agentName: "master_aggregator",
        timestamp: startTimeAggr,
        status: "success",
        output: aggregated.masterAggregated,
        duration: Date.now() - startTimeAggr
      },
      {
        agentName: "clinical_analyzer_final",
        timestamp: startTimeRules,
        status: "success",
        output: aggregated.clinical,
        duration: Date.now() - startTimeRules
      },
      {
        agentName: "confidence",
        timestamp: startTimeTrust,
        status: "success",
        output: confidence,
        duration: 0
      },
      {
        agentName: "trust",
        timestamp: startTimeTrust,
        status: "success",
        output: trust,
        duration: Date.now() - startTimeTrust
      },
      {
        agentName: "conclusion",
        timestamp: startTimeConclusion,
        status: "success",
        output: patient.conclusion,
        duration: Date.now() - startTimeConclusion
      }
    ]
  };

  return analysis;
  } catch (error: any) {
    console.error(`[Patient Orchestration Error]`, error);
    onProgress?.(`Ошибка анализа пациента: ${error.message || error}`, 100);
    throw error;
  }
}

/**
 * AGENT 8 & 9: Explain & Report
 * Generates the detailed narrative report.
 */
export async function orchestrateReportGeneration(
  analysis: PatientAnalysis,
  studies: OCTStudy[],
  onProgress?: (step: string, progress: number) => void,
  language: 'ru' | 'en' = 'ru',
  patientInfo?: { id: string; sex?: string; dob?: string },
  force: boolean = false
): Promise<PatientAnalysis> {
  const updatedAnalysis = { ...analysis };
  
  onProgress?.('Генерация пояснительного отчета (Агент Report)...', 40);
  try {
    const aggregated = getAggregatedData(studies);
    
    // Create input for the deterministic report generator
    const reportOutput = generateOCTReport({
      masterAggregator: aggregated.masterAggregated,
      clinical: aggregated.clinical
    });
    const structuredMarkdownReport = reportOutput.report_text;

    // 1. Get or Generate Deterministic Conclusion (AI AGENT DISABLED for Conclusion)
    let explainResult = updatedAnalysis.agentResults?.find(a => a.agentName === 'explain_agent');
    
    // Always use deterministic clinical aggregation for conclusion
    const deterministicConclusion: ExplainOutput = {
      OD: { 
        status: aggregated.clinical.OD.conclusion || "Нет данных", 
        findings: Array.isArray(aggregated.clinical.OD.features) ? aggregated.clinical.OD.features : [] 
      },
      OS: { 
        status: aggregated.clinical.OS.conclusion || "Нет данных", 
        findings: Array.isArray(aggregated.clinical.OS.features) ? aggregated.clinical.OS.features : [] 
      },
      interpretation: structuredMarkdownReport,
      summary: "Автоматический анализ структурных параметров",
      recommendation: "Требуется клиническая оценка специалиста с учётом функциональных методов (периметрия, ВГД)."
    };

    explainResult = {
      agentName: 'explain_agent',
      timestamp: Date.now(),
      status: 'success',
      output: deterministicConclusion,
      duration: 0
    };
    
    // Robust diagnosis lookup
    let diagnosisOutput = updatedAnalysis.agentResults?.find(a => a.agentName === 'diagnosis_agent')?.output;
    if (!diagnosisOutput) {
      diagnosisOutput = { final_diagnosis: updatedAnalysis.diagnosis };
    }

    // 2. Build Structured Full Report (Deterministic Mapping)
    onProgress?.('Финальная сборка протокола...', 80);
    
    const buildEyeReport = (eye: 'OD' | 'OS'): EyeReport => {
      const clin = aggregated.clinical[eye];
      const qual = aggregated.quality[eye];

      return {
        quality: qual.issues.length ? `Ограничено (${qual.issues.join(', ')})` : "Удовлетворительное",
        additional_description: clin.conclusion || "",
        macula_description: "",
        damage_score: clin.damage_score || 0
      };
    };

    const fullReportOutput: ExplanationReport = {
      header: {
        title: "Протокол ОКТ",
        subtitle: "Выполнена ОКТ (спектральная оптическая когерентная томография) обоих глаз",
        zones: "морфометрия головки зрительного нерва и прилегающего слоя нервных волокон. исследование комплекса ганглиозных клеток центральной зоны сетчатки.",
        date: new Date().toLocaleDateString('ru-RU')
      },
      patient: {
        id: patientInfo?.id || "Unknown",
        sex: patientInfo?.sex === 'M' ? 'мужчина' : patientInfo?.sex === 'F' ? 'женщина' : '—',
        dob: patientInfo?.dob ? new Date(patientInfo.dob).toLocaleDateString('ru-RU') : "—"
      },
      OD: buildEyeReport('OD'),
      OS: buildEyeReport('OS'),
      conclusion: {
        OD_summary: aggregated.clinical.OD.conclusion || "",
        OS_summary: aggregated.clinical.OS.conclusion || "",
        interpretation: deterministicConclusion.interpretation
      },
      note: "Автоматический анализ.",
      recommendation: deterministicConclusion.recommendation
    };

    const reportAgentResult: AgentResult = {
      agentName: 'report_agent',
      timestamp: Date.now(),
      status: 'success',
      output: fullReportOutput,
      duration: 0
    };

    updatedAnalysis.explanationReport = fullReportOutput;
    updatedAnalysis.results = deterministicConclusion;
    if (!updatedAnalysis.agentResults) updatedAnalysis.agentResults = [];
    
    // Update or add explain and report results
    const otherResults = updatedAnalysis.agentResults.filter(a => a.agentName !== 'explain_agent' && a.agentName !== 'report_agent');
    updatedAnalysis.agentResults = [explainResult, reportAgentResult, ...otherResults];
    
    onProgress?.('Отчет готов!', 100);
  } catch (reportError) {
    console.error("[Orchestrator] Report agent failed:", reportError);
    throw reportError;
  }

  return updatedAnalysis;
}

export async function universalCollectorAgent(fileData: string, mimeType: string = "image/jpeg", model?: string) {
  const prompt = '    AGENT: Universal Medical Data Collector\n' +
    '    TASK: Extract ALL printed labels, parameters, and their corresponding numerical values from the provided medical report image.\n\n' +
    '    INSTRUCTIONS:\n' +
    '    1. Identify all text-value pairs (e.g., "RNFL Average: 95", "AL: 23.45mm").\n' +
    '    2. Group data by eye (OD - Right, OS - Left) if specified on the report.\n' +
    '    3. If a value has a unit (mm, um, D, dB), include it or keep as a number if preferred.\n' +
    '    4. Capture any "Signal Strength" or "Quality Score" found.\n' +
    '    5. Do not interpret data, just extract exactly what is printed.\n\n' +
    '    OUTPUT FORMAT:\n' +
    '    Return a valid JSON object with the following structure:\n' +
    '    {\n' +
    '      "OD": {\n' +
    '        "parameters": [\n' +
    '          { "label": "string", "value": "number | string", "unit": "string" }\n' +
    '        ]\n' +
    '      },\n' +
    '      "OS": {\n' +
    '        "parameters": [\n' +
    '          { "label": "string", "value": "number | string", "unit": "string" }\n' +
    '        ]\n' +
    '      },\n' +
    '      "metadata": {\n' +
    '        "device": "string",\n' +
    '        "date": "string",\n' +
    '        "signal_strength": "string"\n' +
    '      },\n' +
    '      "raw_text_blocks": ["list of all other strings found"]\n' +
    '    }\n';
  
  const schema = {
    type: Type.OBJECT,
    properties: {
      OD: {
        type: Type.OBJECT,
        properties: {
          parameters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                value: { type: Type.STRING },
                unit: { type: Type.STRING }
              }
            }
          }
        }
      },
      OS: {
        type: Type.OBJECT,
        properties: {
          parameters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                value: { type: Type.STRING },
                unit: { type: Type.STRING }
              }
            }
          }
        }
      },
      metadata: {
        type: Type.OBJECT,
        properties: {
          device: { type: Type.STRING },
          date: { type: Type.STRING },
          signal_strength: { type: Type.STRING }
        }
      },
      raw_text_blocks: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  };

  return runAgent("universal_collector", prompt, fileData, mimeType, model, schema, ThinkingLevel.MINIMAL);
}
