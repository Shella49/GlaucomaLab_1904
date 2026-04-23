import { StudyRole } from "../types";

export interface RegistryEntry {
  modality: string;
  role: StudyRole;
  pipeline: string;
}

export const STUDY_REGISTRY: Record<string, RegistryEntry> = {
  OCT_RNFL: {
    modality: "OCT",
    role: "STRUCTURAL_GLAUCOMA",
    pipeline: "octPipeline"
  },
  OCT_ONH: {
    modality: "OCT",
    role: "STRUCTURAL_GLAUCOMA",
    pipeline: "octPipeline"
  },
  OCT_MACULA: {
    modality: "OCT",
    role: "SUPPORTIVE",
    pipeline: "octPipeline"
  },
  PERIMETRY_24_2: {
    modality: "PERIMETRY",
    role: "FUNCTIONAL_GLAUCOMA",
    pipeline: "perimetryPipeline"
  },
  PERIMETRY_10_2: {
    modality: "PERIMETRY",
    role: "FUNCTIONAL_GLAUCOMA",
    pipeline: "perimetryPipeline"
  },
  CORNEAL_TOPOGRAPHY: {
    modality: "TOPOGRAPHY",
    role: "IOP_CORRECTION",
    pipeline: "topographyModule"
  },
  BIOMETRY: {
    modality: "BIOMETRY",
    role: "SUPPORTIVE",
    pipeline: "biometryModule"
  },
  FUNDUS_PHOTO: {
    modality: "FUNDUS",
    role: "MORPHOLOGY_ONLY",
    pipeline: "saveWithoutDiagnosis"
  },
  BSCAN: {
    modality: "BSCAN",
    role: "UNKNOWN",
    pipeline: "saveWithoutDiagnosis"
  }
};
