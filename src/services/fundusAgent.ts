import { Study, EvidenceItem } from "../types";

/**
 * AGENT: Fundus Agent (Placeholder)
 * ROLE: Analyze fundus photos for morphological signs.
 */
export function fundusAgent(study: Study): EvidenceItem[] {
  const evidence: EvidenceItem[] = [];

  // Placeholder logic
  if (study.type === 'FUNDUS') {
    evidence.push({
      name: "Morphology Assessment (Fundus)",
      confidence: 0.5,
      description: "Fundus photo analyzed for morphological signs. (Placeholder logic)"
    });
  }

  return evidence;
}
