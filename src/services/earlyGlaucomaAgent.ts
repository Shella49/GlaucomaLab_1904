import { OCTStudy, EvidenceItem } from '../types';

/**
 * AGENT: OCT Agent (Structural)
 * ROLE: Analyze OCT studies for structural damage.
 */
export function octAgent(study: OCTStudy): EvidenceItem[] {
  const norm = study.normalized;
  const evidence: EvidenceItem[] = [];

  const od = norm.OD;
  const os = norm.OS;

  // 1. Check for data availability
  if (!od?.rnfl?.average || !os?.rnfl?.average) {
    return evidence;
  }

  // --- 2. Inter-eye Asymmetry (Strong early marker) ---
  const avgDiff = Math.abs((od.rnfl.average || 0) - (os.rnfl.average || 0));
  if (avgDiff > 10) {
    evidence.push({
      name: "Значимая асимметрия RNFL между глазами",
      confidence: 0.85,
      description: `Асимметрия RNFL между глазами значима (${avgDiff.toFixed(1)} мкм).`
    });
  } else if (avgDiff > 7) {
    evidence.push({
      name: "Пограничная асимметрия RNFL между глазами",
      confidence: 0.6,
      description: `Асимметрия RNFL между глазами на границе нормы (${avgDiff.toFixed(1)} мкм).`
    });
  }

  // --- 3. Inferior-First Rule & Sector Thinning ---
  const infOD = od?.rnfl?.quadrants?.I || 0;
  const infOS = os?.rnfl?.quadrants?.I || 0;
  const supOD = od?.rnfl?.quadrants?.S || 0;
  const supOS = os?.rnfl?.quadrants?.S || 0;

  // Inferior is more critical for early glaucoma
  if (infOD < 80 || infOS < 80) {
    evidence.push({
      name: "Истончение нижнего сектора RNFL",
      confidence: 0.8,
      description: "Истончение нижнего сектора RNFL (маркер высокой чувствительности)."
    });
  }
  
  if (supOD < 80 || supOS < 80) {
    evidence.push({
      name: "Истончение верхнего сектора RNFL",
      confidence: 0.7,
      description: "Истончение верхнего сектора RNFL."
    });
  }

  // ISNT rule violation (simplified: inferior should be thicker than superior)
  if ((infOD < supOD - 5) || (infOS < supOS - 5)) {
    evidence.push({
      name: "Нарушение правила ISNT",
      confidence: 0.5,
      description: "Нарушение правила ISNT (Нижний сектор < Верхнего)."
    });
  }

  // --- 4. ONH (Optic Nerve Head) Early Signs ---
  const cdOD = od.onh?.cup_disc_ratio || od.onh?.cd_vertical || od.onh?.cdr_vertical || 0;
  const cdOS = os.onh?.cup_disc_ratio || os.onh?.cd_vertical || os.onh?.cdr_vertical || 0;
  const ddlsOD = od.onh?.ddls || 0;
  const ddlsOS = os.onh?.ddls || 0;

  if (cdOD > 0.7 || cdOS > 0.7) {
    evidence.push({
      name: "Высокое соотношение Э/Д",
      confidence: 0.75,
      description: "Высокое соотношение экскавации к диску (> 0.7)."
    });
  }
  
  if (Math.abs(cdOD - cdOS) > 0.15) {
    evidence.push({
      name: "Асимметрия соотношения Э/Д",
      confidence: 0.7,
      description: "Асимметрия соотношения экскавации к диску (> 0.15)."
    });
  }

  if (ddlsOD >= 4 || ddlsOS >= 4) {
    evidence.push({
      name: "Критический показатель DDLS",
      confidence: 0.9,
      description: `Критический показатель DDLS (ПГ: ${ddlsOD}, ЛГ: ${ddlsOS}).`
    });
  }

  // --- 5. Macula / GCC (Often underestimated) ---
  const maculaOD = od?.macula || {};
  const maculaOS = os?.macula || {};
  
  const innerIOD = maculaOD?.inner_ring?.I || 0;
  const innerIOS = maculaOS?.inner_ring?.I || 0;
  const outerIOD = maculaOD?.outer_ring?.I || 0;
  const outerIOS = maculaOS?.outer_ring?.I || 0;

  if (innerIOD > 0 || innerIOS > 0 || outerIOD > 0 || outerIOS > 0) {
    if ((innerIOD > 0 && innerIOD < 65) || (innerIOS > 0 && innerIOS < 65) ||
        (outerIOD > 0 && outerIOD < 65) || (outerIOS > 0 && outerIOS < 65)) {
      evidence.push({
        name: "Истончение нижнего сектора макулы",
        confidence: 0.8,
        description: "Выявлено истончение в нижних секторах макулы (внутреннем или внешнем кольце)."
      });
    }
  }

  const volOD = maculaOD.total_volume || 0;
  const volOS = maculaOS.total_volume || 0;
  if (volOD > 0 && volOS > 0 && Math.abs(volOD - volOS) > 0.5) {
    evidence.push({
      name: "Асимметрия объема макулы",
      confidence: 0.6,
      description: `Выявлена асимметрия объема макулы между глазами (${Math.abs(volOD - volOS).toFixed(2)} мм³).`
    });
  }

  return evidence;
}
