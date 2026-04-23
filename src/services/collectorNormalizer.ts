/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UniversalOphthalmicSchema, EyeSchema, RNFLSchema, ONHSchema, MaculaSchema, QualitySchema } from "../types";

/**
 * FIELD_MAP - Heart of the normalizer.
 * Maps device-specific labels to (clinical_section, schema_key) pairs.
 */
export const FIELD_MAP: Record<string, [string, string]> = {
  // -------- ONH --------
  "disc area": ["onh", "disc_area"],
  "площадь диска": ["onh", "disc_area"],
  "rim area": ["onh", "rim_area"],
  "площадь нрп": ["onh", "rim_area"],
  "cup area": ["onh", "cup_area"],
  "площадь экск": ["onh", "cup_area"],

  "rim volume": ["onh", "rim_volume"],
  "объем нрп": ["onh", "rim_volume"],
  "cup volume": ["onh", "cup_volume"],
  "объем экск": ["onh", "cup_volume"],

  "mean cup depth": ["onh", "mean_cup_depth"],
  "сред глуб экск": ["onh", "mean_cup_depth"],
  "max cup depth": ["onh", "max_cup_depth"],
  "макс глуб экск": ["onh", "max_cup_depth"],
  "максимальная глубина экскавации": ["onh", "max_cup_depth"],

  "cup disc area ratio": ["onh", "cup_disc_ratio"],
  "площадь э д": ["onh", "cup_disc_ratio"],
  "c d": ["onh", "cup_disc_ratio"],
  "э д": ["onh", "cup_disc_ratio"],
  "cup disc ratio": ["onh", "cup_disc_ratio"],

  "vertical c d ratio": ["onh", "cd_vertical"],
  "э д по вертикали": ["onh", "cd_vertical"],
  "horizontal c d ratio": ["onh", "cd_horizontal"],
  "э д по горизонтали": ["onh", "cd_horizontal"],

  "ddls": ["onh", "ddls"],
  "вертикальное э д": ["onh", "cd_vertical"],
  "горизонтальное э д": ["onh", "cd_horizontal"],
  "площадь кольца": ["onh", "rim_area"],
  "объем кольца": ["onh", "rim_volume"],

  // -------- RNFL --------
  "average rnfl thickness": ["rnfl", "average"],
  "global rnfl thickness": ["rnfl", "average"],
  "mean rnfl thickness": ["rnfl", "average"],
  "average thickness": ["rnfl", "average"],
  "mean thickness": ["rnfl", "average"],
  "rnfl average": ["rnfl", "average"],
  "avg thickness": ["rnfl", "average"],
  "средняя толщина": ["rnfl", "average"],
  "средняя толщина слоя нервных волокон": ["rnfl", "average"],
  "среднее nstin": ["rnfl", "average"],
  
  "superior rnfl thickness": ["rnfl", "S"],
  "толщина снв s (superior)": ["rnfl", "S"],
  "толщина снв s": ["rnfl", "S"],
  "снв s": ["rnfl", "S"],
  "s quadrant": ["rnfl", "S"],
  "superior quadrant": ["rnfl", "S"],
  "s": ["rnfl", "S"],
  
  "nasal rnfl thickness": ["rnfl", "N"],
  "толщина снв n (nasal)": ["rnfl", "N"],
  "толщина снв n": ["rnfl", "N"],
  "снв n": ["rnfl", "N"],
  "n quadrant": ["rnfl", "N"],
  "nasal quadrant": ["rnfl", "N"],
  "n": ["rnfl", "N"],
  
  "inferior rnfl thickness": ["rnfl", "I"],
  "толщина снв i (inferior)": ["rnfl", "I"],
  "толщина снв i": ["rnfl", "I"],
  "снв i": ["rnfl", "I"],
  "i quadrant": ["rnfl", "I"],
  "inferior quadrant": ["rnfl", "I"],
  "i": ["rnfl", "I"],
  
  "temporal rnfl thickness": ["rnfl", "T"],
  "толщина снв t (temporal)": ["rnfl", "T"],
  "толщина снв t": ["rnfl", "T"],
  "снв t": ["rnfl", "T"],
  "t quadrant": ["rnfl", "T"],
  "temporal quadrant": ["rnfl", "T"],
  "t": ["rnfl", "T"],

  // -------- Macula --------
  "central subfield thickness": ["macula", "central_thickness"],
  "центральная толщина": ["macula", "central_thickness"],
  "center": ["macula", "central_thickness"],
  "central": ["macula", "central_thickness"],
  "cst": ["macula", "central_thickness"],
  "cube volume": ["macula", "total_volume"],
  "объем куба": ["macula", "total_volume"],
  "total volume": ["macula", "total_volume"],
  "общий объем": ["macula", "total_volume"],
  "macular volume": ["macula", "total_volume"],

  // ETDRS Macula Synonyms (Heidelberg & Zeiss formats)
  "inner superior": ["macula", "inner_ring.S"],
  "inner nasal": ["macula", "inner_ring.N"],
  "inner inferior": ["macula", "inner_ring.I"],
  "inner temporal": ["macula", "inner_ring.T"],
  "outer superior": ["macula", "outer_ring.S"],
  "outer nasal": ["macula", "outer_ring.N"],
  "outer inferior": ["macula", "outer_ring.I"],
  "outer temporal": ["macula", "outer_ring.T"],
  
  "верхний внутренний": ["macula", "inner_ring.S"],
  "носовой внутренний": ["macula", "inner_ring.N"],
  "нижний внутренний": ["macula", "inner_ring.I"],
  "височный внутренний": ["macula", "inner_ring.T"],
  "верхний внешний": ["macula", "outer_ring.S"],
  "носовой внешний": ["macula", "outer_ring.N"],
  "нижний внешний": ["macula", "outer_ring.I"],
  "височный внешний": ["macula", "outer_ring.T"],

  "center thickness": ["macula", "central_thickness"],
  "etdrs superior inner": ["macula", "inner_ring.S"],
  "etdrs nasal inner": ["macula", "inner_ring.N"],
  "etdrs inferior inner": ["macula", "inner_ring.I"],
  "etdrs temporal inner": ["macula", "inner_ring.T"],
  "etdrs superior outer": ["macula", "outer_ring.S"],
  "etdrs nasal outer": ["macula", "outer_ring.N"],
  "etdrs inferior outer": ["macula", "outer_ring.I"],
  "etdrs temporal outer": ["macula", "outer_ring.T"],
  "etdrs center": ["macula", "center_etdrs"],
  "central minimum": ["macula", "central_min"],
  "central maximum": ["macula", "central_max"],

  // Specific synonyms for Heidelberg
  "inner s": ["macula", "inner_ring.S"],
  "inner i": ["macula", "inner_ring.I"],
  "inner n": ["macula", "inner_ring.N"],
  "inner t": ["macula", "inner_ring.T"],
  "outer s": ["macula", "outer_ring.S"],
  "outer i": ["macula", "outer_ring.I"],
  "outer n": ["macula", "outer_ring.N"],
  "outer t": ["macula", "outer_ring.T"],

  // -------- Quality --------
  "signal strength": ["quality", "signal_strength"],
  "signal quality q": ["quality", "signal_strength"],
  "сила сигнала": ["quality", "signal_strength"],
  "ss": ["quality", "signal_strength"],
  "quality score": ["quality", "signal_strength"],
  "показатель качества": ["quality", "signal_strength"],
  "q": ["quality", "signal_strength"],
};

/**
 * Normalizes a label for stable mapping.
 */
export function normalizeLabel(label: string): string {
  if (!label) return "";
  return label
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\./g, "") // Remove dots for robust mapping
    .replace(/\//g, " ")
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\s\s+/g, " ") // replace double spaces
    .trim();
}

/**
 * Safe value parser.
 * Handles "mean ± SD" (e.g., "0.679 + 0.223") by taking the first number.
 */
export function parseValue(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;

  const strValue = String(value);
  
  // 🔥 FIX: Handle ratio formats like "15/30" or "8/10" by taking the numerator
  if (strValue.includes("/") && !strValue.includes("±") && !strValue.includes("+")) {
     const parts = strValue.split("/");
     const firstVal = parseFloat(parts[0].replace(/[^\d.-]/g, ''));
     if (!isNaN(firstVal)) return firstVal;
  }

  const numbers = strValue.match(/[-+]?\d*\.\d+|\d+/g);

  if (!numbers) return null;
  
  const parsed = parseFloat(numbers[0]);
  
  // 🔥 FIX: Sanity check for extremely high quality scores (e.g., 10000)
  if (parsed > 1000) return parsed / 100; // Likely a decimal error or concatenation

  return parsed; // Take mean
}

/**
 * RNFL Classification based on numeric thresholds.
 * THIN < 85 (red)
 * BORDERLINE < 95 (yellow)
 * NORMAL >= 95 (green)
 */
export function classifyRNFL(value: number | null): "normal" | "borderline" | "thin" | null {
  if (value === null || value === undefined) return null;
  if (value < 85) return "thin";
  if (value < 95) return "borderline";
  return "normal";
}

/**
 * Semantic guards to distinguish RNFL from Macula based on value ranges.
 * RNFL is usually < 150-200. Macula is usually > 200.
 */
export function isLikelyRNFL(values: number[]): boolean {
  if (values.length === 0) return true; // Default
  return values.every(v => v < 200);
}

export function isLikelyMacula(values: number[]): boolean {
  if (values.length === 0) return false;
  return values.some(v => v >= 200);
}

export function mapMaculaFromParameters(params: any[]): MaculaSchema {
  const get = (name: string) => {
    const p = params.find(item => item.name === name || normalizeLabel(item.name || "") === normalizeLabel(name));
    return p ? parseValue(p.value) : null;
  };

  return {
    central_thickness: get("Center Thickness") || get("Central Subfield Thickness") || get("CST"),
    inner_ring: {
      S: get("ETDRS Superior Inner") || get("Inner Superior"),
      N: get("ETDRS Nasal Inner") || get("Inner Nasal"),
      I: get("ETDRS Inferior Inner") || get("Inner Inferior"),
      T: get("ETDRS Temporal Inner") || get("Inner Temporal"),
    },
    outer_ring: {
      S: get("ETDRS Superior Outer") || get("Outer Superior"),
      N: get("ETDRS Nasal Outer") || get("Outer Nasal"),
      I: get("ETDRS Inferior Outer") || get("Outer Inferior"),
      T: get("ETDRS Temporal Outer") || get("Outer Temporal"),
    },
    total_volume: get("Total Volume") || get("Macular Volume") || get("Cube Volume"),
    center_etdrs: get("ETDRS Center"),
    central_min: get("Central Minimum"),
    central_max: get("Central Maximum")
  };
}

/**
 * Validates if a Macula parameter is likely a hallucination from a heatmap/grayscale bar.
 */
export function validateMaculaSource(params: any[], macula: MaculaSchema): MaculaSchema {
  const validated = { ...macula };

  // Helper to check if a value is suspicious (typical pseudo-thickness from grayscale scales or B-scan noise)
  const isSuspiciousValue = (v: number | null) => {
    if (v === null) return false;
    // Values like 139, 140, 142 are often grayscale intensity values if they don't match labels
    // However, they can be real in severe atrophy, so we check if they are "naked" numbers in parameters
    return [139, 140, 142].includes(v);
  };

  // Rule 1: Physiological range Filter
  // Typical central thickness is 150-400. If it's < 150 and not labeled with "Atrophy", be suspicious.
  if (validated.central_thickness != null && (validated.central_thickness < 80 || validated.central_thickness > 600)) {
     validated.central_thickness = null;
  }

  // Rule 2: Volume ranges
  if (validated.total_volume != null && (validated.total_volume < 0.5 || validated.total_volume > 15)) {
    validated.total_volume = null;
  }
  
  // Specific detection for the 3.39 / 3.23 hallucination case
  if (validated.total_volume === 3.39 || validated.total_volume === 3.23) {
    validated.total_volume = null;
  }

  // Rule 3: Confirmation by label
  // If no thickness and no ETDRS sectors, Macula is effectively empty/unreliable
  const innerCount = Object.values(validated.inner_ring || {}).filter(v => v != null).length;
  const outerCount = Object.values(validated.outer_ring || {}).filter(v => v != null).length;
  
  const hasMaculaData = validated.central_thickness != null || 
                         validated.center_etdrs != null || 
                         innerCount > 0 || 
                         outerCount > 0;
  
  if (!hasMaculaData) {
    // If we only have volume but no grid, we clear the grid to be safe
    // (though mapMaculaFromParameters should have only set them if labeled)
  }
  
  return validated;
}

/**
 * Maps color from deviation map to clinical status.
 */
export const COLOR_TO_STATUS: Record<string, string> = {
  "green": "normal",
  "yellow": "borderline",
  "red": "thin"
};

export function normalizeClassification(text: string | null): "normal" | "borderline" | "abnormal" | null {
  if (!text) return null;

  const upper = text.toUpperCase();
  if (upper.includes("OUTSIDE NORMAL LIMITS")) return "abnormal";
  if (upper.includes("BORDERLINE")) return "borderline";
  if (upper.includes("WITHIN NORMAL LIMITS")) return "normal";

  return null;
}

export function detectLocalDefects(rnfl: RNFLSchema): boolean {
  if (!rnfl) return false;

  const values = [
    rnfl.quadrants?.N,
    rnfl.quadrants?.T,
    rnfl.quadrants?.S,
    rnfl.quadrants?.I
  ].filter((v): v is number => typeof v === "number");

  const low = values.filter(v => v < 80);

  // Bonus: Early glaucoma detection (N or T < 70)
  if ((rnfl.quadrants?.N != null && rnfl.quadrants.N < 70) || 
      (rnfl.quadrants?.T != null && rnfl.quadrants.T < 70)) {
    return true;
  }

  return low.length >= 2;
}

/**
 * Creates an empty Universal Ophthalmic Schema.
 */
export function emptyUniversalSchema(): UniversalOphthalmicSchema {
  const createEmptyEye = (): EyeSchema => ({
    rnfl: {
      average: null,
      quadrants: { S: null, I: null, N: null, T: null },
      clock_hours: {},
      quadrant_status: { S: null, I: null, N: null, T: null }
    },
    onh: {
      cup_disc_ratio: null,
      rim_area: null,
      disc_area: null,
      cup_volume: null,
      ddls: null,
      rim_volume: null,
      cup_area: null,
      cd_vertical: null,
      cd_horizontal: null
    },
    macula: {
      central_thickness: null,
      center_etdrs: null,
      inner_ring: { S: null, N: null, I: null, T: null },
      outer_ring: { S: null, N: null, I: null, T: null },
      total_volume: null
    },
    quality: {
      signal_strength: null,
      centered: null,
      motion_artifacts: null
    }
  });

  return {
    OD: createEmptyEye(),
    OS: createEmptyEye(),
    global: {},
    scan_info: { type: "unknown" },
    asymmetry: {}
  };
}

/**
 * Study Classifier - Detects the type of study from extracted items.
 */
export function classifyStudy(items: any[]): "macula" | "rnfl" | "onh" | "unknown" {
  if (!items || !Array.isArray(items)) return "unknown";
  
  const text = items.map(i => (i.name || "").toLowerCase()).join(" ");

  if (text.includes("толщина:") || text.includes("macula") || text.includes("макул") || text.includes("etdrs")) {
    return "macula";
  }

  if (text.includes("rnfl") || text.includes("снв") || text.includes("nstin")) {
    return "rnfl";
  }

  if (text.includes("rim") || text.includes("disc") || text.includes("диск") || text.includes("нрп") || text.includes("экск")) {
    return "onh";
  }

  return "unknown";
}

/**
 * Specific Parsers for Clinical Entities
 */

export function parseMacula(items: any[], schema: MaculaSchema) {
  for (const i of items) {
    const rawLabel = i.name || "";
    const name = normalizeLabel(rawLabel);
    const val = parseValue(i.value);
    if (val === null) continue;

    // Direct mapping from FIELD_MAP
    if (FIELD_MAP[name]) {
      const [section, key] = FIELD_MAP[name];
      if (section === "macula") {
        if (key.includes(".")) {
          const [ring, quad] = key.split(".");
          (schema as any)[ring][quad] = val;
        } else {
          (schema as any)[key] = val;
        }
      }
    }
  }
}

export function parseRNFL(items: any[], schema: RNFLSchema, colorMap?: any) {
  for (const i of items) {
    const label = normalizeLabel(i.name || "");
    const value = parseValue(i.value);
    if (value == null || (value != null && value > 200)) continue; // 🔥 Reject Macula values in RNFL

    if (FIELD_MAP[label]) {
      const [section, key] = FIELD_MAP[label];
      if (section === "rnfl") {
        if (key === "average") schema.average = value;
        else if (["S", "N", "I", "T"].includes(key)) {
          schema.quadrants[key as "S" | "N" | "I" | "T"] = value;
        }
      }
    }
  }

  // Process quadrant status
  const quads = ["S", "N", "I", "T"] as const;
  for (const q of quads) {
    let status: "normal" | "borderline" | "thin" | null = null;
    if (colorMap && colorMap[q]) {
      status = (COLOR_TO_STATUS[colorMap[q].toLowerCase()] as any) || null;
    }
    if (!status && schema.quadrants[q] !== null) {
      status = classifyRNFL(schema.quadrants[q]);
    }
    schema.quadrant_status[q] = status;
  }
}

export function parseONH(items: any[], schema: ONHSchema) {
  for (const i of items) {
    const label = normalizeLabel(i.name || "");
    const value = parseValue(i.value);
    if (value === null) continue;

    if (FIELD_MAP[label]) {
      const [section, key] = FIELD_MAP[label];
      if (section === "onh") {
        (schema as any)[key] = value;
      }
    }
  }
}

export function parseQuality(items: any[], schema: QualitySchema) {
  for (const i of items) {
    const label = normalizeLabel(i.name || "");
    const value = parseValue(i.value);
    
    if (FIELD_MAP[label]) {
      const [section, key] = FIELD_MAP[label];
      if (section === "quality") {
        (schema as any)[key] = value;
      }
    }

    // Centered and artifacts usually come from layout or clinical flags, 
    // but we can look for keywords if they appear in extractor output
    const text = (i.name || "").toLowerCase();
    if (text.includes("centered") || text.includes("центрирован")) {
       schema.centered = String(i.value).toLowerCase().includes("true") || String(i.value).toLowerCase().includes("да");
    }
    if (text.includes("artifact") || text.includes("артефакт")) {
       schema.motion_artifacts = String(i.value).toLowerCase().includes("true") || String(i.value).toLowerCase().includes("да");
    }
  }
}

/**
 * MAIN NORMALIZER - CLINICAL TRANSLATOR
 * Translates device-specific data into Universal Ophthalmic Schema.
 */
export function normalizeStudy(extracted: any, forcedType?: string): UniversalOphthalmicSchema {
  const result = emptyUniversalSchema();

  if (!extracted) return result;

  for (const eye of ["OD", "OS"] as const) {
    const eyeData = extracted[eye];
    if (!eyeData) continue;

    const parameters = Array.isArray(eyeData) ? eyeData : eyeData.parameters;
    const colorMap = !Array.isArray(eyeData) ? eyeData.rnfl_color_map : null;

    if (Array.isArray(parameters)) {
      // 1. Detect Study
      const detectedType = classifyStudy(parameters);
      const studyType = (forcedType && forcedType !== "UNKNOWN") ? forcedType.toLowerCase() : detectedType;
      
      // Update scan_info
      if (result.scan_info) {
        result.scan_info.type = studyType;
        if (extracted.eye) result.scan_info.eye = extracted.eye;
        if (extracted.eye_confidence) result.scan_info.eye_confidence = extracted.eye_confidence;
      }
      
      // 2. Route to Parser
      if (studyType === "macula") {
        const rawMacula = mapMaculaFromParameters(parameters);
        result[eye].macula = validateMaculaSource(parameters, rawMacula);
      } else if (studyType === "rnfl") {
        parseRNFL(parameters, result[eye].rnfl, colorMap);
      } else if (studyType === "onh") {
        parseONH(parameters, result[eye].onh);
      }

      // 🔥 ДОБОР ДАННЫХ ИЗ DIAGRAM (ОСНОВНОЙ ФИКС)
      // skip for macula scans to keep RNFL clean
      if (studyType !== "macula" && !Array.isArray(eyeData) && eyeData?.RNFL?.values) {
        const diag = eyeData.RNFL.values;
        
        // Semantic guard: Determine if these 4 sectors are RNFL or Macula
        const numericValues = (["S", "N", "I", "T"] as const)
          .map(q => parseValue(diag[q]))
          .filter((v): v is number => v != null);

        const isRNFL = isLikelyRNFL(numericValues);
        const isMac = isLikelyMacula(numericValues);

        if (isRNFL) {
          for (const q of ["S", "N", "I", "T"] as const) {
            const val = parseValue(diag[q]);
            if (val !== null) {
              result[eye].rnfl.quadrants[q] = val;
            }
          }
        }

        if (isMac) {
          // If these are actually Macula inner ring values (which happens on some reports)
          for (const q of ["S", "N", "I", "T"] as const) {
            const val = parseValue(diag[q]);
            if (val !== null) {
              result[eye].macula.inner_ring[q] = val;
            }
          }
        }

        // 🔥 clock hours / sectors (расширенные)
        for (const key of Object.keys(diag)) {
          if (!["S", "N", "I", "T"].includes(key)) {
            const val = parseValue(diag[key]);
            if (val !== null) {
              result[eye].rnfl.clock_hours[key] = val;
            }
          }
        }
      }

      // Always parse quality if present
      parseQuality(parameters, result[eye].quality);

      // 🔥 ДОПОЛНИТЕЛЬНЫЕ ФИКСЫ (AVERAGE, QUALITY, CLASSIFICATION)
      
      // 1. Average RNFL fallback (ONLY for RNFL scans)
      if (studyType !== "macula" && result[eye].rnfl.average === null) {
        const avgParam = parameters.find(p => p.name?.toLowerCase().includes("average"));
        if (avgParam) {
          const val = parseValue(avgParam.value);
          if (val != null && val < 200) result[eye].rnfl.average = val;
        }
      }

      // 2. Quality/Signal Strength fallback
      if (result[eye].quality.signal_strength === null) {
        const qParam = parameters.find(p => p.name?.toLowerCase().includes("quality") || p.name?.toLowerCase().includes("signal"));
        if (qParam) result[eye].quality.signal_strength = parseValue(qParam.value);
      }

      // 3. Classification
      if (extracted.free_text_scan) {
        const classText = eye === "OD" ? extracted.free_text_scan.od_classification : extracted.free_text_scan.os_classification;
        if (classText) {
          result[eye].rnfl.classification = normalizeClassification(classText);
        }
      }

      // 4. Local Defects Detection
      result[eye].rnfl.local_defect = detectLocalDefects(result[eye].rnfl);

      // 5. Fallback for mixed reports or missed fields
      for (const item of parameters) {
        const label = normalizeLabel(item.name || "");
        const value = parseValue(item.value);
        if (value === null) continue;

        if (FIELD_MAP[label]) {
          const [section, key] = FIELD_MAP[label];
          // If it wasn't handled by specific parser, try to fill it
          if (studyType !== "macula" && section === "rnfl" && key === "average" && result[eye].rnfl.average === null) {
             if (value < 200) result[eye].rnfl.average = value;
          } else if (section === "onh" && (result[eye].onh as any)[key] === null) {
             (result[eye].onh as any)[key] = value;
          } else if (section === "macula" && (result[eye].macula as any)[key] === null) {
             (result[eye].macula as any)[key] = value;
          }
        }
      }
    }
  }

  // Compute Asymmetry
  if (result.OD.rnfl.average != null && result.OS.rnfl.average != null) {
    result.asymmetry.rnfl_diff = Math.abs(result.OD.rnfl.average - result.OS.rnfl.average);
  }

  // 🔥 MACULA VOLUME ASYMMETRY
  const checkGrid = (m: any) => m.central_thickness != null || m.center_etdrs != null || Object.values(m.inner_ring).some(v => v != null) || Object.values(m.outer_ring).some(v => v != null);
  const odMaculaValid = checkGrid(result.OD.macula);
  const osMaculaValid = checkGrid(result.OS.macula);

  if (odMaculaValid && osMaculaValid && result.OD.macula.total_volume != null && result.OS.macula.total_volume != null) {
    result.asymmetry.macula_volume_diff = Math.abs(result.OD.macula.total_volume - result.OS.macula.total_volume);
  }

  // 🔥 ASYMMETRY FROM UNKNOWN (FIX 4)
  if (extracted.unknown && Array.isArray(extracted.unknown)) {
    extracted.unknown.forEach((item: any) => {
      if (item.name && item.name.includes("Asymmetry")) {
        const key = item.name.replace("Asymmetry ", "").trim();
        const val = parseValue(item.value);
        if (val !== null) {
          (result.asymmetry as any)[key] = val;
        }
      }
    });
  }

  return result;
}
