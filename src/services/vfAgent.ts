import { Study, EvidenceItem } from "../types";

/**
 * AGENT: VF Agent (Functional)
 * ROLE: Analyze Visual Field studies for functional damage.
 */
export function vfAgent(study: Study): EvidenceItem[] {
  const evidence: EvidenceItem[] = [];
  const data = study.data?.perimetry;

  if (!data) return evidence;

  // MD (Mean Deviation)
  if ((data.MD.OD !== null && data.MD.OD < -2) || (data.MD.OS !== null && data.MD.OS < -2)) {
    evidence.push({
      name: "Abnormal Mean Deviation (MD)",
      confidence: 0.7,
      description: `MD is abnormal (OD: ${data.MD.OD}, OS: ${data.MD.OS} dB).`
    });
  }

  // PSD (Pattern Standard Deviation)
  if ((data.PSD.OD !== null && data.PSD.OD > 2) || (data.PSD.OS !== null && data.PSD.OS > 2)) {
    evidence.push({
      name: "Abnormal Pattern Standard Deviation (PSD)",
      confidence: 0.8,
      description: `PSD is abnormal (OD: ${data.PSD.OD}, OS: ${data.PSD.OS} dB).`
    });
  }

  // GHT (Glaucoma Hemifield Test)
  if (data.GHT.OD === 'Outside Normal Limits' || data.GHT.OS === 'Outside Normal Limits') {
    evidence.push({
      name: "GHT Outside Normal Limits",
      confidence: 0.9,
      description: "Glaucoma Hemifield Test is outside normal limits."
    });
  }

  // Reliability check
  const rel = data.reliability;
  if (rel) {
    // Simplified reliability check
    if (rel.false_positives.OD?.includes('>') || rel.false_positives.OS?.includes('>')) {
      // This would actually lower confidence of other evidence, 
      // but for now we just note it.
    }
  }

  return evidence;
}
