import { StudyAnalysisResult, StudyRole, Usability, StudyType, DeviceDomain } from "../types";

/**
 * AGENT: Study Analyzer
 * ROLE: IDENTIFY → VALIDATE → ROUTE
 * 
 * This agent does NOT analyze glaucoma. It only determines what the study is,
 * whether it's usable for glaucoma analysis, and how it should be routed.
 */
export function studyAnalyzerAgent(layout: any, extracted?: any): StudyAnalysisResult {
  const layoutStr = layout ? JSON.stringify(layout) : "";
  const extractedStr = extracted ? JSON.stringify(extracted) : "";
  const text = (layoutStr + " " + extractedStr).toLowerCase();

  let modality: string = layout?.study_type || "UNKNOWN";
  let role: StudyRole = "UNKNOWN";
  let type: StudyType = layout.study_type || "UNKNOWN";
  let device_domain: DeviceDomain = layout.device_domain || "unknown";

  // ---------- device & domain detection (refinement) ----------

  if (device_domain === "unknown") {
    if (text.includes("oct")) {
      modality = "OCT";
      type = "OCT";
      device_domain = "retina";
      
      // Check if it's anterior segment OCT
      if (text.includes("anterior") || text.includes("cornea") || text.includes("chamber")) {
        device_domain = "cornea";
        type = "CORNEAL_TOPOGRAPHY";
        modality = "CORNEAL_TOPOGRAPHY";
      }
    } else if (
      text.includes("perimetry") || 
      text.includes("field") || 
      text.includes("humphrey") || 
      text.includes("octopus") || 
      text.includes("периметрия") || 
      text.includes("поле зрения") || 
      text.includes("статической периметрии")
    ) {
      modality = "PERIMETRY";
      type = "PERIMETRY";
      device_domain = "functional";
    } else if (
      text.includes("topography") || 
      text.includes("pentacam") || 
      text.includes("orbscan") || 
      text.includes("sirius") || 
      text.includes("galilei") ||
      text.includes("keratometry")
    ) {
      modality = "CORNEAL_TOPOGRAPHY";
      type = "CORNEAL_TOPOGRAPHY";
      device_domain = "cornea";
    } else if (text.includes("fundus") || text.includes("retina photo")) {
      modality = "FUNDUS";
      type = "FUNDUS";
      device_domain = "retina";
    } else if (
      text.includes("biometry") || 
      text.includes("axial length") || 
      text.includes("iolmaster") || 
      text.includes("lenstar") || 
      text.includes("aladdin") || 
      text.includes("argos") ||
      text.includes("биометрия") ||
      text.includes("axial length") ||
      text.includes("длина оси") ||
      text.includes("передней камеры") ||
      text.includes("кератометрия") ||
      text.includes("белого до белого")
    ) {
      modality = "BIOMETRY";
      type = "BIOMETRY";
      device_domain = "biometry";
    } else if (text.includes("b-scan") || text.includes("ultrasound")) {
      modality = "BSCAN";
      type = "BSCAN";
      device_domain = "retina";
    } else if (text.includes("tonometry") || text.includes("iop") || text.includes("pressure")) {
      modality = "TONOMETRY";
      type = "TONOMETRY";
      device_domain = "functional";
    }
  }

  // ---------- subtype ----------

  let subtype = layout.report_type || "unknown";

  // ---------- clinical role ----------

  switch (type) {
    case "OCT":
      if (subtype === "RNFL" || subtype === "ONH" || subtype === "GCC" || subtype === "MACULA") {
        role = "STRUCTURAL_GLAUCOMA";
      } else {
        role = "MORPHOLOGY_ONLY";
      }
      break;

    case "PERIMETRY":
      role = "FUNCTIONAL_GLAUCOMA";
      break;

    case "CORNEAL_TOPOGRAPHY":
      role = "IOP_CORRECTION"; // CCT is a risk factor
      break;

    case "FUNDUS":
      role = "SUPPORTIVE";
      break;
    
    case "BIOMETRY":
      role = "SUPPORTIVE";
      break;

    case "TONOMETRY":
      role = "IOP_CORRECTION";
      break;

    default:
      role = "UNKNOWN";
  }

  // ---------- usability ----------

  let usability: Usability = "NON_DIAGNOSTIC";
  let message = "";

  if (role === "STRUCTURAL_GLAUCOMA" || role === "FUNCTIONAL_GLAUCOMA") {
    usability = "VALID";
    message = "Исследование пригодно для глаукомного анализа.";
  } else if (role === "SUPPORTIVE" || role === "IOP_CORRECTION") {
    usability = "LIMITED";
    message = "Исследование носит вспомогательный или морфологический характер.";
  } else {
    usability = "NON_DIAGNOSTIC";
    message = "Исследование не используется для прямой диагностики глаукомы.";
  }

  return {
    modality,
    subtype,
    role,
    usability,
    doctor_message: message,
    allow_pipeline: usability === "VALID" || usability === "LIMITED",
    device_domain
  };
}
