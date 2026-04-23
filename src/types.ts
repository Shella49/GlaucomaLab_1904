// --- Universal Ophthalmic Schema (Clinical Core) ---

export interface RNFLSchema {
  average: number | null;
  quadrants: {
    S: number | null;
    I: number | null;
    N: number | null;
    T: number | null;
  };
  clock_hours: Record<string, number | null>;
  quadrant_status: {
    S: "normal" | "borderline" | "thin" | null;
    I: "normal" | "borderline" | "thin" | null;
    N: "normal" | "borderline" | "thin" | null;
    T: "normal" | "borderline" | "thin" | null;
  };
  classification?: "normal" | "borderline" | "abnormal" | null;
  local_defect?: boolean | null;
}

export interface ONHSchema {
  cup_disc_ratio: number | null;
  rim_area: number | null;
  disc_area: number | null;
  cup_volume: number | null;
  ddls: number | null;
  // Extended fields for internal use
  rim_volume?: number | null;
  cup_area?: number | null;
  cd_vertical?: number | null;
  cd_horizontal?: number | null;
}

export interface MaculaSchema {
  central_thickness: number | null;
  inner_ring: {
    S: number | null;
    N: number | null;
    I: number | null;
    T: number | null;
  };
  outer_ring: {
    S: number | null;
    N: number | null;
    I: number | null;
    T: number | null;
  };
  total_volume: number | null;
  // Optional detailed metrics
  center_etdrs?: number | null;
  central_min?: number | null;
  central_max?: number | null;
}

export interface QualitySchema {
  signal_strength: number | null;
  centered: boolean | null;
  motion_artifacts: boolean | null;
}

export interface EyeSchema {
  rnfl: RNFLSchema;
  onh: ONHSchema;
  macula: MaculaSchema;
  quality: QualitySchema;
}

export interface UniversalOphthalmicSchema {
  OD: EyeSchema;
  OS: EyeSchema;
  global: {
    device?: string;
    exam_date?: string;
    [key: string]: any;
  };
  scan_info?: {
    type?: string;
    eye?: string;
    eye_confidence?: number;
    device?: string;
  };
  asymmetry: {
    rnfl_diff?: number | null;
    [key: string]: any;
  };
}

export type TrustLevel = 'trusted' | 'review_required' | 'limited' | 'not_diagnostic' | 'diagnostic';

export interface TrustResult {
  trust_level: TrustLevel;
  message: string;
}

export interface AgentResult {
  agentName: string;
  timestamp: number;
  status: 'success' | 'error';
  output: any;
  duration: number;
}

export interface ConfidenceResult {
  confidence_score: number;
  confidence_level: 'low' | 'medium' | 'high';
  reasons: string[];
}

export interface EarlyGlaucomaResult {
  risk_level: 'LOW' | 'SUSPICIOUS' | 'HIGH' | 'UNKNOWN';
  early_signs: string[];
  confidence: number;
  requires_followup: boolean;
  details: {
    asymmetry_score: number;
    thinning_score: number;
    onh_score: number;
    macula_score: number;
  };
}

export interface RawMetric {
  name: string;
  value: number | null;
  unit: string | null;
}

export type StudyType = 'OCT' | 'PERIMETRY' | 'FUNDUS' | 'TONOMETRY' | 'CLINICAL' | 'CORNEAL_TOPOGRAPHY' | 'BIOMETRY' | 'BSCAN' | 'UNKNOWN';

export type StudyRole = 
  | 'STRUCTURAL_GLAUCOMA' 
  | 'FUNCTIONAL_GLAUCOMA' 
  | 'IOP_CORRECTION' 
  | 'MORPHOLOGY_ONLY' 
  | 'SUPPORTIVE' 
  | 'UNKNOWN';

export type EyeSide = 'OD' | 'OS' | 'BOTH';

export type Usability = 'VALID' | 'LIMITED' | 'NON_DIAGNOSTIC';

export type DeviceDomain = 'retina' | 'cornea' | 'biometry' | 'functional' | 'unknown';

export interface StudyAnalysisResult {
  modality: string;
  subtype: string;
  role: StudyRole;
  usability: Usability;
  doctor_message: string;
  allow_pipeline: boolean;
  device_domain: DeviceDomain;
}

export interface PerimetryData {
  MD: { OD: number | null; OS: number | null };
  PSD: { OD: number | null; OS: number | null };
  VFI: { OD: number | null; OS: number | null };
  GHT: { OD: string | null; OS: string | null };
  reliability: {
    fixation_losses: { OD: string | null; OS: string | null };
    false_positives: { OD: string | null; OS: string | null };
    false_negatives: { OD: string | null; OS: string | null };
  };
}

export interface TopographyData {
  K1: { OD: number | null; OS: number | null };
  K2: { OD: number | null; OS: number | null };
  CCT: { OD: number | null; OS: number | null }; // Central Corneal Thickness
  astigmatism: { OD: number | null; OS: number | null };
}

export interface BiometryData {
  AL: { OD: number | null; OS: number | null }; // Axial Length
  ACD: { OD: number | null; OS: number | null }; // Anterior Chamber Depth
  lens_thickness: { OD: number | null; OS: number | null };
  K1: { OD: number | null; OS: number | null };
  K2: { OD: number | null; OS: number | null };
  WTW: { OD: number | null; OS: number | null };
}

export interface ClinicalData {
  IOP?: {
    OD: { value: number; method: string; time?: string };
    OS: { value: number; method: string; time?: string };
  };
  CCT?: {
    OD: number;
    OS: number;
  };
  risk_factors?: {
    family_history: boolean;
    myopia_high: boolean;
    diabetes: boolean;
    other?: string[];
  };
}

export interface EvidenceItem {
  name: string;
  confidence: number;
  description: string;
}

export interface EvidenceMap {
  structural_damage: EvidenceItem[];
  functional_damage: EvidenceItem[];
  pressure_risk: EvidenceItem[];
  clinical_risk: EvidenceItem[];
}

export interface DatasetCompletenessResult {
  score: number; // 0 to 100
  present: string[];
  missing: string[];
  recommendations: string[];
  rejected?: { modality: string; id: string; explanation: string }[];
}

export interface ReasoningResult {
  confidence_reasoning: number;
  summary: string;
  explanation: string;
  logic_path: string[];
}

export interface Study {
  id: string;
  type: StudyType;
  modality: string;
  subtype: string;
  role: StudyRole;
  eye: EyeSide;
  usability: Usability;
  quality_score: number;
  clinical_quality_flag?: string;
  name?: string;
  timestamp: number;
  imageUrl: string;
  thumbnailUrl?: string;
  examDate?: string;
  patient_info?: { sex?: string; dob?: string };
  doctor_message?: string;
  device_domain?: DeviceDomain;
  is_medical_study?: boolean;
  status?: 'pending_review' | 'accepted' | 'rejected';
  report_text?: string;
  rotation?: number;
  last_analyzed?: number;
  
  // Data from specific pipelines
  data?: {
    raw_metrics?: any;
    normalized?: any;
    quality?: any;
    clinical?: any;
    perimetry?: PerimetryData;
    topography?: TopographyData;
    biometry?: BiometryData;
    confidence?: ConfidenceResult;
    trust?: TrustResult;
    earlySuspicion?: EarlyGlaucomaResult;
  };

  // Legacy fields for compatibility (to be phased out)
  layout?: any;
  raw_metrics?: any;
  normalized?: any;
  quality?: any;
  clinical?: any;
  diagnosis?: any;
  confidence?: ConfidenceResult;
  trust?: TrustResult;
  earlySuspicion?: EarlyGlaucomaResult;
  perimetry?: PerimetryData;
  topography?: TopographyData;
  biometry?: BiometryData;
  reasoning?: ReasoningResult;
  collectorNormalized?: any;
  agentResults?: AgentResult[];
}

export type OCTStudy = Study;

export interface PatientRecord {
  id: string;
  patient_id: string;
  patient_meta: {
    name?: string;
    sex?: string;
    dob?: string;
    age?: number;
  };
  studies: Study[];
  clinical_data: ClinicalData;
  oct_data?: UniversalOphthalmicSchema;
  OD?: EyeSchema;
  OS?: EyeSchema;
  asymmetry?: any;
  evidence: EvidenceMap;
  clinical_analyzer?: any;
  perimetry_analyzer?: any;
  diagnosis_agent?: any;
  completeness?: DatasetCompletenessResult;
  reasoning?: ReasoningResult;
  conclusion?: any;
  analysis?: PatientAnalysis;
  integrated_assessment?: PatientAnalysis;
}

// Keep Patient as an alias or updated version
export type Patient = PatientRecord;

export interface EyeReport {
  quality: string;
  onh_morphometry?: {
    disc_area: number;
    cup_area: number;
    cd_ratio: number;
    rim_volume: number;
  };
  rnfl_morphometry?: {
    average: number;
    inferior: number;
    superior: number;
    nasal: number;
    temporal: number;
  };
  ddls?: {
    score: number;
    probability: string;
  };
  additional_description: string;
  macula_description: string;
  damage_score?: number;
}

export interface ExplanationReport {
  header: {
    title: string;
    subtitle: string;
    zones: string;
    date: string;
  };
  patient: {
    id: string;
    sex: string;
    dob: string;
  };
  OD: EyeReport;
  OS: EyeReport;
  conclusion: {
    OD_summary: string;
    OS_summary: string;
    interpretation: string;
  };
  note: string;
  recommendation: string;
}

export interface ExplainOutput {
  summary: string;
  OD: { status: string; findings: string[] };
  OS: { status: string; findings: string[] };
  interpretation: string;
  recommendation: string;
}

export interface PatientAnalysis {
  dynamics: string;
  clinicalSigns: string[];
  diagnosis: string;
  recommendations: string[];
  results?: ExplainOutput;
  glaucomaRisk?: 'low' | 'moderate' | 'high';
  possibleDiagnosis?: string;
  explanation?: string;
  pattern?: string;
  explanationReport?: ExplanationReport;
  trust?: TrustResult;
  clinicalAnalysis?: {
    rnflStatus: string;
    asymmetry: boolean;
    glaucomaSigns: boolean;
  };
  agentResults?: AgentResult[];
  structuralStatus?: {
    status: string;
    worst_eye: string;
    score: number;
  };
  functionalStatus?: {
    status: string;
  };
  // New modular fields
  evidence?: EvidenceMap;
  completeness?: DatasetCompletenessResult;
  reasoning?: ReasoningResult;
  conclusion?: any;
  aiOpinion?: {
    conclusion_text: string;
    summary: string;
    recommendations: string;
    timestamp: number;
  };
}

export interface LogEntry {
  timestamp: number;
  action: string;
  duration: number;
  type?: 'info' | 'success' | 'warning' | 'error';
}
