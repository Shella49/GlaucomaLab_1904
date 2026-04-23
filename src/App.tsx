/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, Component } from 'react';
import { get, set } from 'idb-keyval';
import { 
  Users, 
  Plus, 
  Trash2, 
  Upload, 
  Activity, 
  FileText, 
  History, 
  ChevronRight, 
  ChevronLeft,
  Maximize2,
  AlertCircle, 
  AlertTriangle,
  CheckCircle2, 
  XCircle,
  Clock, 
  Loader2,
  Eye,
  TrendingUp,
  Download,
  X,
  Check,
  Play,
  Edit2,
  ShieldCheck,
  Cpu,
  RefreshCw,
  Printer,
  Zap,
  Database,
  BookOpen,
  Copy,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  RotateCw,
  Layout,
  Table,
  Hash,
  Target,
  Shield,
  MessageSquare,
  ShieldAlert,
  GitMerge
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore - Vite specific import
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set worker source for pdfjs
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { formatFeatures, translateFeature } from './lib/featureTranslations';
import { NormalizerDebugView } from './components/NormalizerDebugView';
import { Patient, Study, OCTStudy, PatientAnalysis, LogEntry, AgentResult, ConfidenceResult } from './types';
import { 
  orchestrateStudyAnalysis, 
  orchestrateInitialClassification,
  orchestrateFullPipeline,
  orchestrateAdditionalAnalysis,
  calculateAge,
  calculateAgeAtExam,
  buildConclusion,
  buildSummary,
  buildFinalDiagnosis,
  orchestratePatientAnalysis,
  getAggregatedData,
  routeStudyPipeline,
  orchestrateReportGeneration,
  generateMedicalReportText,
  generateAIConclusion,
  multiExamAggregator,
  layoutClassifierAgent,
  universalExtractorAgent,
  normalizerAgent,
  RNFL_analyzer,
  macula_analyzer,
  quality_analyzer,
  master_aggregator,
  clinical_analyzer,
  clinicalAnalyzerScan,
  onhAnalyzer,
  perimetryAnalyzerAgent,
  topographyAnalyzerAgent,
  biometryAnalyzerAgent,
  universalCollectorAgent,
  diagnosisAgent,
  explainAgent,
  runCustomPrompt,
  updateStudyWithAgentResult,
  createEmptyStudy
} from './services/geminiService';
import { glaucomaReasoningAgent } from './services/glaucomaReasoningAgent';
import { confidenceAnalyzer } from './services/confidenceAnalyzer';
import { doctorTrustLayer } from './services/doctorTrustLayer';
import { normalizeStudy } from './services/collectorNormalizer';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

const renderSafeString = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch (e) {
      return String(val);
    }
  }
  return String(val);
};

// Error Boundary Component
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl border border-rose-100 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">Что-то пошло не так</h1>
            <p className="text-slate-600 mb-6">Приложение столкнулось с непредвиденной ошибкой.</p>
            <div className="bg-slate-50 p-4 rounded-xl mb-6 text-left overflow-auto max-h-40">
              <code className="text-xs text-rose-600 font-mono">{this.state.error?.toString()}</code>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-all"
            >
              Перезагрузить приложение
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <GlaucomaLabApp />
    </ErrorBoundary>
  );
}

// Helper to check if an object has at least one non-null value
const hasData = (obj: any) => {
  if (!obj) return false;
  return Object.values(obj).some(val => val !== null && val !== undefined && val !== '');
};

function GlaucomaLabApp() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [activePatientId, setActivePatientId] = useState<string | null>(null);
  const [activeStudyId, setActiveStudyId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showClinicalForm, setShowClinicalForm] = useState(false);
  const [showImageModal, setShowImageModal] = useState<string | null>(null);
  const [clinicalFormData, setClinicalFormData] = useState({
    iop_od: 16,
    iop_os: 16,
    family_history: false,
    dob: ''
  });
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);
  const [isFullAnalyzing, setIsFullAnalyzing] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isGeneratingAIConclusion, setIsGeneratingAIConclusion] = useState(false);
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analyzingStudyId, setAnalyzingStudyId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'patient' | 'study' | 'all', id: string, title: string } | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'current' | 'history' | 'analysis' | 'report' | 'playground' | 'additional'>('current');
  const [showNewPatientModal, setShowNewPatientModal] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-3-flash-preview');
  const [reportLanguage, setReportLanguage] = useState<'ru' | 'en'>('ru');
  const [aiModel, setAiModel] = useState('gemini-3.1-pro-preview');
  const [newPatientId, setNewPatientId] = useState('');
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  const [isApiKeyChecking, setIsApiKeyChecking] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isExplanationReportCollapsed, setIsExplanationReportCollapsed] = useState(true);
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [editingStudyId, setEditingStudyId] = useState<string | null>(null);
  const [tempStudyName, setTempStudyName] = useState("");
  const [editNameValue, setEditNameValue] = useState('');
  const [isLogsVisible, setIsLogsVisible] = useState(false);
  const [selectedStudyIds, setSelectedStudyIds] = useState<string[]>([]);
  const [uploadQueue, setUploadQueue] = useState<File[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [lastUploadedStudyIds, setLastUploadedStudyIds] = useState<string[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueCurrent, setQueueCurrent] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const AVAILABLE_MODELS = [
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Default)' },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite' },
    { id: 'gemini-3.1-pro-preview-exp', name: 'Geminy GPT 5.2 (Experimental)', actualModel: 'gemini-3.1-pro-preview' },
  ];

  // --- LOGGING ---
  const addLog = (action: string, duration: number, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [{ timestamp: Date.now(), action, duration, type }, ...prev].slice(0, 20));
  };

  // --- GLOBAL ERROR HANDLING ---
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("Global error caught:", event.error);
      addLog(`Критическая ошибка: ${event.message || 'Неизвестная ошибка'}`, 0, 'error');
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      // Prevent the default browser behavior (logging to console)
      // event.preventDefault();
      
      console.error("Unhandled rejection caught by App:", event.reason);
      const reason = event.reason;
      let message = 'Неизвестная ошибка в промисе';
      let stack = '';
      
      if (reason) {
        if (typeof reason === 'string') {
          message = reason;
        } else if (reason instanceof Error) {
          message = reason.message;
          stack = reason.stack || '';
        } else if (reason.message) {
          message = reason.message;
          if (reason.stack) stack = reason.stack;
        } else if (reason.error && typeof reason.error === 'string') {
          message = reason.error;
        } else if (reason.statusText) {
          message = `HTTP Error: ${reason.statusText}`;
        } else if (typeof reason === 'object') {
          try {
            message = JSON.stringify(reason);
          } catch (e) {
            message = 'Ошибка в промисе (не удалось сериализовать причину)';
          }
        }
      }
      
      const logMessage = stack 
        ? `Unhandled rejection: ${message}\nStack: ${stack.substring(0, 500)}...`
        : `Unhandled rejection: ${message}`;
        
      addLog(logMessage, 0, 'error');
      // If we are in deep analysis, clear the states so UI doesn't hang
      setIsAnalyzing(false);
      setIsProcessingQueue(false);
      setIsUploading(false);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  const renderValue = (val: any): React.ReactNode => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'object') {
      if ('value' in val) return String(val.value);
      return JSON.stringify(val);
    }
    return String(val);
  };

  useEffect(() => {
    const checkApiKey = async () => {
      // First check if we have a key in the environment (baked in or injected)
      if (process.env.GEMINI_API_KEY) {
        setHasApiKey(true);
        setIsApiKeyChecking(false);
        return;
      }

      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        try {
          const has = await window.aistudio.hasSelectedApiKey();
          setHasApiKey(has);
        } catch (e) {
          console.error('Failed to check API key status', e);
        }
      }
      setIsApiKeyChecking(false);
    };
    checkApiKey().catch(err => {
      console.error("Error in checkApiKey:", err);
      setIsApiKeyChecking(false);
    });
  }, []);

  const handleOpenSelectKey = async () => {
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      try {
        await window.aistudio.openSelectKey();
        // Assume success and proceed
        setHasApiKey(true);
        addLog('API ключ успешно выбран', 0, 'success');
      } catch (e) {
        console.error('Failed to open API key selection dialog', e);
        addLog('Ошибка при выборе API ключа', 0, 'error');
      }
    }
  };
  // Load data from IndexedDB on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Try to get from IndexedDB first
        const saved = await get('glaucoma_lab_patients');
        
        if (saved && Array.isArray(saved)) {
          // Migration: Ensure all patients have patient_meta
          const migrated = saved.map(p => ({
            ...p,
            patient_meta: p.patient_meta || { 
              name: (p as any).name || '', 
              sex: (p as any).sex || '', 
              dob: (p as any).dob || '' 
            },
            clinical_data: p.clinical_data || {}
          }));
          setPatients(migrated);
        } else {
          // Migration: check if there's data in localStorage
          const localSaved = localStorage.getItem('glaucoma_lab_patients');
          if (localSaved) {
            try {
              const parsed = JSON.parse(localSaved);
              if (Array.isArray(parsed)) {
                const migrated = parsed.map(p => ({
                  ...p,
                  patient_meta: p.patient_meta || { 
                    name: (p as any).name || '', 
                    sex: (p as any).sex || '', 
                    dob: (p as any).dob || '' 
                  },
                  clinical_data: p.clinical_data || {}
                }));
                setPatients(migrated);
                // Save to IDB immediately
                await set('glaucoma_lab_patients', migrated);
              }
            } catch (e) {
              console.error('Failed to migrate data from localStorage', e);
            }
          }
        }
      } catch (e) {
        console.error('Failed to load data from IndexedDB', e);
      } finally {
        setIsDataLoaded(true);
      }
    };

    loadData().catch(err => {
      console.error("Error in loadData:", err);
      setIsDataLoaded(true);
    });
  }, []);

  // Save data to IndexedDB whenever patients change
  useEffect(() => {
    if (!isDataLoaded) return;

    const saveData = async () => {
      try {
        await set('glaucoma_lab_patients', patients);
      } catch (e) {
        console.error('Failed to save patients to IndexedDB', e);
        addLog('Ошибка сохранения данных в хранилище', 0, 'error');
      }
    };

    saveData().catch(err => {
      console.error("Error in saveData:", err);
    });
  }, [patients, isDataLoaded]);

  const activePatient = useMemo(() => 
    patients.find(p => p.id === activePatientId) || null
  , [patients, activePatientId]);

  const activeStudy = useMemo(() => {
    if (!activePatient) return null;
    if (activeStudyId) {
      return activePatient.studies.find(s => s.id === activeStudyId) || activePatient.studies[0] || null;
    }
    return activePatient.studies[0] || null;
  }, [activePatient, activeStudyId]);

  const jsonResultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (jsonResultsRef.current && activeStudy?.agentResults) {
      jsonResultsRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [activeStudy?.agentResults?.length]);

  const activeNormalized = useMemo(() => {
    const empty = {
      rnfl: { average: null, superior: null, inferior: null, nasal: null, temporal: null },
      onh: { rim_area: null, disc_area: null, cup_area: null, rim_volume: null, cup_volume: null, cd_ratio: null, cd_area_ratio: null, cd_vertical: null, cd_horizontal: null, ddls: null },
      macula: { central: null, average: null, volume: null }
    };
    if (!activeStudy) return empty as any;
    const eye = activeStudy.layout?.eye === 'OS' ? 'OS' : 'OD';
    return (activeStudy.normalized?.[eye] || empty) as any;
  }, [activeStudy]);

    const ClinicalAnalysisVerification = ({ study, clinicalData }: { study?: OCTStudy, clinicalData?: any }) => {
      // Look for the clinical analysis result by any of its possible names
      const clinicalResult = study?.agentResults?.find(r => 
        (r.agentName === 'clinical_analyzer' || r.agentName === 'clinical_analyzer_final' || r.agentName === 'clinical_analyzer_ai') 
        && r.status === 'success'
      );
      
      const clinical = clinicalData || clinicalResult?.output;
      if (!clinical) return null;

      const getNumericConfidence = (conf: any) => {
        if (typeof conf === 'number') return conf;
        if (conf === 'high') return 0.95;
        if (conf === 'medium') return 0.70;
        if (conf === 'low') return 0.35;
        return 0.35;
      };

      const getAsymmetryColor = (level: string) => {
        if (level === 'significant') return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
        if (level === 'mild') return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      };

      return (
        <div className="mt-6 bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-rose-500/20 text-rose-400 rounded-lg">
                <Activity size={18} />
              </div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Клинический анализ и Асимметрия</h3>
            </div>
            
            {clinical.global?.asymmetry && (
              <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${getAsymmetryColor(clinical.global.asymmetry)}`}>
                Асимметрия: {clinical.global.asymmetry === 'significant' ? 'Выраженная' : clinical.global.asymmetry === 'mild' ? 'Умеренная' : 'Нет'}
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800">
            {['OD', 'OS'].map((eye) => {
              const data = clinical[eye as 'OD' | 'OS'];
              if (!data) return null;

              const isWorse = clinical.global?.worse_eye === eye;

              const getStageColor = (stage: string) => {
                if (stage === 'норма') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                if (stage === 'подозрение') return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                if (stage === 'ранняя_глаукома') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                if (stage === 'умеренная_глаукома') return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
                if (stage === 'развитая_глаукома') return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                if (stage === 'продвинутая_глаукома') return 'bg-red-500/10 text-red-400 border-red-500/20';
                return 'bg-slate-800 text-slate-400 border-slate-700';
              };

              const numericConf = getNumericConfidence(data.confidence);

              return (
                <div key={eye} className={`p-6 space-y-4 ${isWorse ? 'bg-rose-500/5' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Глаз {eye}</span>
                       {isWorse && <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[8px] font-black rounded uppercase">Worst Eye</span>}
                    </div>
                    <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getStageColor(data.stage || 'неопределено')}`}>
                      {String(data.stage || 'неопределено').replace(/_/g, ' ')}
                    </div>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black text-white tracking-tighter">{data.damage_score ?? data.score ?? '0'}</span>
                    <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">Damage Score</span>
                  </div>

                  {data.onh_status === 'unknown' && (
                    <div className="px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                      <p className="text-[10px] text-amber-400 font-bold flex items-center gap-2">
                        <AlertTriangle size={12} />
                        ДАННЫЕ ДЗН ОТСУТСТВУЮТ
                      </p>
                    </div>
                  )}

                  {data.reasons && data.reasons.length > 0 && (
                    <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800/50">
                      <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Обоснование заключения</div>
                      <div className="space-y-1">
                        {data.reasons.map((reason: string, idx: number) => (
                          <p key={idx} className="text-xs text-cyan-100/80 leading-relaxed italic flex items-start gap-2">
                            <span className="text-indigo-500 mt-1">•</span>
                            {reason}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {data.features?.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[9px] font-bold text-emerald-500/70 uppercase tracking-widest">Выявленные дефекты</span>
                        <div className="flex flex-wrap gap-2">
                          {formatFeatures(data.features).map((featLabel: string) => (
                            <span key={featLabel} className="px-2 py-1 bg-emerald-500/5 text-emerald-400/80 rounded-lg text-[10px] font-bold border border-emerald-500/10 uppercase tracking-tight">
                              {featLabel}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Уверенность ИИ</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${numericConf > 0.8 ? 'bg-emerald-500' : numericConf > 0.6 ? 'bg-amber-500' : 'bg-rose-500'}`}
                          style={{ width: `${numericConf * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">{(numericConf * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {clinical.global && (
            <div className="p-4 bg-slate-900/30 border-t border-slate-800 flex items-center justify-center">
              <p className="text-[10px] text-slate-500 font-medium flex items-center gap-2">
                <ShieldCheck size={12} className="text-emerald-500/50" />
                {clinical.global.conclusion}
              </p>
            </div>
          )}
        </div>
      );
    };

    const NormalizationVerification = ({ study }: { study: OCTStudy }) => {
      const normalizerResult = study.agentResults?.find(r => r.agentName === 'normalizer' && r.status === 'success');
      const normalized = normalizerResult?.output;
      if (!normalized) return null;

      const renderRow = (label: string, odVal: any, osVal: any, isBoolean = false) => {
        const formatVal = (val: any) => {
          if (val === null || val === undefined) return <span className="text-slate-800">—</span>;
          if (isBoolean) return val ? <span className="text-rose-400 font-bold">Да</span> : <span className="text-emerald-400">Нет</span>;
          return val;
        };

        return (
          <tr key={label} className="border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors group">
            <td className="p-1.5 text-xs text-white font-medium">{label}</td>
            <td className="p-1.5 text-sm text-cyan-300 font-mono text-center border-l border-slate-800/50 bg-slate-900/30">{formatVal(odVal)}</td>
            <td className="p-1.5 text-sm text-cyan-300 font-mono text-center border-l border-slate-800/50 bg-slate-900/30">{formatVal(osVal)}</td>
          </tr>
        );
      };

      const formatSource = (src: string) => {
        if (src === 'label') return 'Table';
        if (src === 'label_embedded') return 'Diagram (Numbers)';
        if (src === 'diagram_4') return 'Diagram (4s)';
        if (src === 'diagram_8') return 'Diagram (8s)';
        return src || 'н/д';
      };

      return (
        <div className="mt-6 bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl overflow-x-auto">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg">
                <Activity size={18} />
              </div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Нормализованные данные (Agent 3)</h3>
            </div>
          </div>
          
          <table className="w-full text-left border-collapse min-w-[300px]">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80">
                <th className="p-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-1/2">Параметр</th>
                <th className="p-2 text-[10px] font-bold text-indigo-400 uppercase tracking-widest text-center border-l border-slate-800 w-1/4">OD (Прав)</th>
                <th className="p-2 text-[10px] font-bold text-indigo-400 uppercase tracking-widest text-center border-l border-slate-800 w-1/4">OS (Лев)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-slate-900/40">
                <td colSpan={3} className="px-4 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] border-b border-slate-800">
                  <div className="flex justify-between items-center">
                    <span>RNFL</span>
                    <span className="text-[8px] opacity-50 normal-case tracking-normal">
                      Источник: OD({formatSource(normalized.OD?.rnfl?.source)}) OS({formatSource(normalized.OS?.rnfl?.source)})
                    </span>
                  </div>
                </td>
              </tr>
              {renderRow("Средняя толщина RNFL", normalized.OD?.rnfl?.average, normalized.OS?.rnfl?.average)}
              {renderRow("Верхний сектор (S)", normalized.OD?.rnfl?.quadrants?.S, normalized.OS?.rnfl?.quadrants?.S)}
              {(normalized.OD?.rnfl?.quadrants?.TS || normalized.OS?.rnfl?.quadrants?.TS) && renderRow("Верхне-височный (TS)", normalized.OD?.rnfl?.quadrants?.TS, normalized.OS?.rnfl?.quadrants?.TS)}
              {(normalized.OD?.rnfl?.quadrants?.NS || normalized.OS?.rnfl?.quadrants?.NS) && renderRow("Верхне-носовой (NS)", normalized.OD?.rnfl?.quadrants?.NS, normalized.OS?.rnfl?.quadrants?.NS)}
              {renderRow("Носовой сектор (N)", normalized.OD?.rnfl?.quadrants?.N, normalized.OS?.rnfl?.quadrants?.N)}
              {(normalized.OD?.rnfl?.quadrants?.NI || normalized.OS?.rnfl?.quadrants?.NI) && renderRow("Нижне-носовой (NI)", normalized.OD?.rnfl?.quadrants?.NI, normalized.OS?.rnfl?.quadrants?.NI)}
              {renderRow("Нижний сектор (I)", normalized.OD?.rnfl?.quadrants?.I, normalized.OS?.rnfl?.quadrants?.I)}
              {(normalized.OD?.rnfl?.quadrants?.TI || normalized.OS?.rnfl?.quadrants?.TI) && renderRow("Нижне-височный (TI)", normalized.OD?.rnfl?.quadrants?.TI, normalized.OS?.rnfl?.quadrants?.TI)}
              {renderRow("Височный сектор (T)", normalized.OD?.rnfl?.quadrants?.T, normalized.OS?.rnfl?.quadrants?.T)}

              <tr className="bg-slate-900/40"><td colSpan={3} className="px-4 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] border-b border-slate-800">ONH (Диск)</td></tr>
              {renderRow("Площадь диска", normalized.OD?.onh?.disc_area, normalized.OS?.onh?.disc_area)}
              {renderRow("Площадь НРП", normalized.OD?.onh?.rim_area, normalized.OS?.onh?.rim_area)}
              {renderRow("Площадь экскавации", normalized.OD?.onh?.cup_area, normalized.OS?.onh?.cup_area)}
              {renderRow("Э/Д по вертикали", normalized.OD?.onh?.cd_vertical, normalized.OS?.onh?.cd_vertical)}
              {renderRow("Вертикальное C/D", normalized.OD?.onh?.cd_vertical, normalized.OS?.onh?.cd_vertical)}
              {renderRow("Минимальное Н/Д", normalized.OD?.onh?.minimum_rim_width, normalized.OS?.onh?.minimum_rim_width)}

              <tr className="bg-slate-900/40"><td colSpan={3} className="px-4 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] border-b border-slate-800">Клинические признаки</td></tr>
              {renderRow("Увеличенная экскавация", (normalized.OD?.onh?.cd_vertical || 0) > 0.6, (normalized.OS?.onh?.cd_vertical || 0) > 0.6, true)}
              {renderRow("Асимметрия C/D", Math.abs((normalized.OD?.onh?.cd_vertical || 0) - (normalized.OS?.onh?.cd_vertical || 0)).toFixed(2), null)}
              {renderRow("Истончение НРП", (normalized.OD?.onh?.rim_area || 0) < 1.0, (normalized.OS?.onh?.rim_area || 0) < 1.0, true)}
            </tbody>
          </table>
          
          <div className="p-3 bg-slate-950/50 border-t border-slate-800 flex justify-center">
            <p className="text-[10px] text-slate-500 font-medium flex items-center gap-2">
              <ShieldCheck size={12} className="text-emerald-500/50" />
              Данные нормализованы по стандарту OCT.
            </p>
          </div>
        </div>
      );
    };

  useEffect(() => {
    setSelectedStudyIds([]);
  }, [activePatientId]);

  const handleCreatePatient = () => {
    if (!newPatientId.trim()) return;
    if (patients.some(p => p.id === newPatientId)) {
      addLog('Пациент с таким ID уже существует', 0, 'error');
      return;
    }
    const newPatient: Patient = { 
      id: newPatientId, 
      patient_id: newPatientId, 
      patient_meta: { name: '', sex: '', dob: '' },
      studies: [],
      clinical_data: {},
      evidence: { structural_damage: [], functional_damage: [], pressure_risk: [], clinical_risk: [] }
    };
    setPatients([...patients, newPatient]);
    setActivePatientId(newPatientId);
    setNewPatientId('');
    setShowNewPatientModal(false);
    addLog(`Создан пациент ${newPatientId}`, 0, 'success');
  };

  const handleDeletePatient = (id: string) => {
    setDeleteConfirm({ type: 'patient', id, title: `Удалить пациента ${id} и все его данные?` });
  };

  const getDiagnosisColor = (diagnosis: string) => {
    switch (diagnosis) {
      case 'Normal': return 'bg-emerald-50 border-emerald-100 text-emerald-800';
      case 'Suspicion': return 'bg-amber-50 border-amber-100 text-amber-800';
      case 'Glaucoma': return 'bg-rose-50 border-rose-100 text-rose-800';
      default: return 'bg-slate-50 border-slate-100 text-slate-800';
    }
  };

  const confirmDelete = () => {
    if (!deleteConfirm) return;

    if (deleteConfirm.type === 'patient') {
      const id = deleteConfirm.id;
      setPatients(prev => prev.filter(p => p.id !== id));
      if (activePatientId === id) setActivePatientId(null);
      addLog(`Удален пациент ${id}`, 0, 'warning');
    } else if (deleteConfirm.type === 'study') {
      const studyId = deleteConfirm.id;
      if (!activePatientId) return;
      setPatients(prev => prev.map(p => 
        p.id === activePatientId 
          ? { ...p, studies: p.studies.filter(s => s.id !== studyId) } 
          : p
      ));
      if (activeStudyId === studyId) setActiveStudyId(null);
      addLog(`Удалено исследование ${studyId}`, 0, 'warning');
    } else if (deleteConfirm.type === 'all') {
      if (deleteConfirm.id === 'bulk') {
        if (!activePatientId) return;
        setPatients(prev => prev.map(p => 
          p.id === activePatientId 
            ? { ...p, studies: p.studies.filter(s => !selectedStudyIds.includes(s.id)) } 
            : p
        ));
        if (activeStudyId && selectedStudyIds.includes(activeStudyId)) setActiveStudyId(null);
        addLog(`Удалено ${selectedStudyIds.length} исследований`, 0, 'warning');
        setSelectedStudyIds([]);
      } else {
        setPatients([]);
        setActivePatientId(null);
        setActiveStudyId(null);
        addLog('База данных очищена', 0, 'warning');
      }
    }
    setDeleteConfirm(null);
  };

  const handleDeleteStudy = (studyId: string) => {
    if (!activePatientId) return;
    setDeleteConfirm({ type: 'study', id: studyId, title: 'Удалить это исследование из базы данных?' });
  };

  const handleRotateStudy = (studyId: string) => {
    if (!activePatientId) return;
    setPatients(prev => prev.map(p => {
      if (p.id === activePatientId) {
        return {
          ...p,
          studies: p.studies.map(s => {
            if (s.id === studyId) {
              const currentRotation = s.rotation || 0;
              return { ...s, rotation: (currentRotation + 90) % 360 };
            }
            return s;
          })
        };
      }
      return p;
    }));
    addLog(`Поворот снимка ${studyId}`, 0, 'info');
  };

  const handleNextStudy = () => {
    if (!activePatient) return;
    const studies = activePatient.studies || [];
    if (studies.length <= 1) return;
    
    const currentId = activeStudyId || studies[0].id;
    const currentIndex = studies.findIndex(s => s.id === currentId);
    if (currentIndex === -1) return;
    
    // Cycle to next study
    const nextIndex = (currentIndex + 1) % studies.length;
    setActiveStudyId(studies[nextIndex].id);
    addLog(`Переход к следующему исследованию: ${studies[nextIndex].id}`, 0, 'info');
  };

  const handlePrevStudy = () => {
    if (!activePatient) return;
    const studies = activePatient.studies || [];
    if (studies.length <= 1) return;
    
    const currentId = activeStudyId || studies[0].id;
    const currentIndex = studies.findIndex(s => s.id === currentId);
    if (currentIndex === -1) return;
    
    // Cycle to previous study
    const prevIndex = (currentIndex - 1 + studies.length) % studies.length;
    setActiveStudyId(studies[prevIndex].id);
    addLog(`Переход к предыдущему исследованию: ${studies[prevIndex].id}`, 0, 'info');
  };

  const handleReAnalyzeStudy = async (study: OCTStudy) => {
    if (!activePatientId) return;
    
    addLog(`Запуск повторного анализа для ${study.id}...`, 0, 'info');
    setAnalyzingStudyId(study.id);
    setIsAnalyzing(true);
    setIsFullAnalyzing(true);
    setAnalysisProgress(0);
    
    try {
      const startTime = Date.now();
      // Resolve actual model ID if it's an alias
      const modelConfig = AVAILABLE_MODELS.find(m => m.id === selectedModel);
      const actualModelId = (modelConfig as any)?.actualModel || selectedModel;

      // Force status to accepted for re-analysis
      const studyToAnalyze = { ...study, status: 'accepted' as const };

      const updatedStudy = await orchestrateFullPipeline(
        studyToAnalyze,
        (step, progress) => {
          addLog(step, 0, 'info');
          setCurrentStage(step);
          setAnalysisProgress(progress);
        },
        actualModelId,
        reportLanguage,
        true, // skipClassification - skip Agent 1 as requested
        true,  // forceReRun
        activePatient?.clinical_data
      );
      
      // Get the current patient to get all their studies
      const currentPatient = patients.find(p => p.id === activePatientId);
      if (currentPatient) {
        const updatedStudies = currentPatient.studies.map(s => s.id === study.id ? { ...updatedStudy, id: study.id, status: 'accepted' as const } : s);
        
        // Run patient-level analysis (Agents 5 & 6)
        const patientAnalysis = await orchestratePatientAnalysis(
          updatedStudies, 
          (step, progress) => {
            addLog(step, 0, 'info');
            setCurrentStage(step);
            setAnalysisProgress(progress);
          },
          actualModelId, 
          reportLanguage,
          { id: currentPatient.id, sex: currentPatient.patient_meta?.sex, dob: currentPatient.patient_meta?.dob }
        );
        
        setPatients(prev => prev.map(p => 
          p.id === activePatientId 
            ? { 
                ...p, 
                studies: updatedStudies,
                analysis: patientAnalysis
              } 
            : p
        ));
      }
      
      const duration = Date.now() - startTime;
      
      addLog(`Повторный анализ завершен`, duration, 'success');
    } catch (error) {
      addLog(`Ошибка повторного анализа: ${error}`, 0, 'error');
    } finally {
      setIsAnalyzing(false);
      setIsFullAnalyzing(false);
      setAnalyzingStudyId(null);
      setCurrentStage(null);
      setAnalysisProgress(0);
    }
  };

  const handleAdditionalAnalysis = async (study: OCTStudy) => {
    if (!activePatientId) return;
    
    addLog(`Запуск дополнительного анализа (Collector) для ${study.id}...`, 0, 'info');
    setAnalyzingStudyId(study.id);
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    
    try {
      const modelConfig = AVAILABLE_MODELS.find(m => m.id === selectedModel);
      const actualModelId = (modelConfig as any)?.actualModel || selectedModel;

      const updatedStudy = await orchestrateAdditionalAnalysis(
        study,
        (step, progress) => {
          addLog(step, 0, 'info');
          setCurrentStage(step);
          setAnalysisProgress(progress);
        },
        actualModelId
      );

      // Update state
      setPatients(prev => prev.map(p => {
        if (p.id !== activePatientId) return p;
        const updatedStudies = p.studies.map(s => s.id === study.id ? updatedStudy : s);
        return { ...p, studies: updatedStudies };
      }));
      
      // Re-run patient level analysis to update reasoning
      // await handleAnalyzePatient();
      
      addLog(`Дополнительный анализ для ${study.id} завершен`, 0, 'success');
    } catch (err) {
      console.error(err);
      addLog(`Ошибка при дополнительном анализе: ${err}`, 0, 'error');
    } finally {
      setIsAnalyzing(false);
      setAnalyzingStudyId(null);
      setAnalysisProgress(100);
    }
  };

  const handleGenerateReport = async () => {
    if (!activePatient || !activePatient.analysis) return;
    
    setIsGeneratingReport(true);
    setIsAnalyzing(true);
    setIsFullAnalyzing(true);
    setAnalysisProgress(0);
    addLog('Запуск генерации отчета...', 0, 'info');
    
    try {
      const startTime = Date.now();
      const updatedAnalysis = await orchestrateReportGeneration(
        activePatient.analysis,
        activePatient.studies,
        (step, progress) => {
          addLog(step, 0, 'info');
          setCurrentStage(step);
          setAnalysisProgress(progress);
        },
        reportLanguage,
        { id: activePatient.id, sex: activePatient.patient_meta?.sex, dob: activePatient.patient_meta?.dob },
        true // Force regeneration
      );
      
      setPatients(prev => {
        const newPatients = prev.map(p => 
          p.id === activePatient.id 
            ? { ...p, analysis: updatedAnalysis } 
            : p
        );
        console.log("[App] handleGenerateReport: setPatients called, newPatients count:", newPatients.length);
        return newPatients;
      });
      
      const duration = Date.now() - startTime;
      addLog('Отчет успешно сформирован', duration, 'success');
      setShowReport(true);
    } catch (error) {
      addLog(`Ошибка генерации отчета: ${error}`, 0, 'error');
      addLog('Не удалось сгенерировать отчет. Попробуйте еще раз.', 0, 'error');
    } finally {
      setIsGeneratingReport(false);
      setIsAnalyzing(false);
      setIsFullAnalyzing(false);
      setCurrentStage(null);
      setAnalysisProgress(0);
    }
  };

  const convertPdfToPng = async (pdfData: string): Promise<string> => {
    try {
      addLog('Конвертация PDF в изображение...', 0, 'info');
      const base64Data = pdfData.split(',')[1];
      const binaryData = atob(base64Data);
      const uint8Array = new Uint8Array(binaryData.length);
      for (let i = 0; i < binaryData.length; i++) {
        uint8Array[i] = binaryData.charCodeAt(i);
      }

      const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
      const pdf = await loadingTask.promise;
      
      // Get the first page
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2.0 }); // High quality

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not get canvas context');

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvasContext: context,
        viewport: viewport,
        // @ts-ignore - Some versions of pdfjs-dist require canvas property
        canvas: canvas
      }).promise;

      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('PDF Conversion Error:', error);
      throw new Error('Ошибка при конвертации PDF: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !activePatientId) return;

    setUploadQueue(prev => [...prev, ...files]);
    setQueueTotal(prev => prev + files.length);
    setLastUploadedStudyIds([]); // Reset for new batch
    if (fileInputRef.current) fileInputRef.current.value = '';
    
    addLog(`Добавлено в очередь на загрузку: ${files.length} файлов`, 0, 'info');
  };

  // Ref to track processing state to avoid multiple concurrent processors
    const isProcessingRef = useRef(false);

  useEffect(() => {
    const processNextInQueue = async () => {
      // Use ref to check if already processing a task
      if (uploadQueue.length === 0 || isAnalyzing || isProcessingRef.current) return;

      isProcessingRef.current = true;
      setIsProcessingQueue(true);
      const file = uploadQueue[0];
      const currentIdx = queueCurrent + 1;
      setQueueCurrent(currentIdx);
      
      const startTime = Date.now();
      setIsUploading(true);
      setIsAnalyzing(true);
      setIsFullAnalyzing(true);
      setAnalysisProgress(0);
      
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const result = event.target?.result;
            if (typeof result === 'string') resolve(result);
            else reject(new Error('Invalid file format'));
          };
          reader.onerror = (error) => reject(error);
          reader.readAsDataURL(file);
        });

        addLog(`Обработка файла ${currentIdx} из ${queueTotal}: ${file.name}`, 0, 'info');
        setCurrentStage(`Анализ ${file.name}...`);
        
        const modelConfig = AVAILABLE_MODELS.find(m => m.id === selectedModel);
        const actualModelId = (modelConfig as any)?.actualModel || selectedModel;

        let newStudy: OCTStudy;
        let thumbnailUrl: string | undefined = undefined;
        
        if (file.type === 'application/pdf') {
          try {
            thumbnailUrl = await convertPdfToPng(base64);
          } catch (thumbError) {
            console.error('Failed to generate thumbnail:', thumbError);
          }
        }

        newStudy = await orchestrateInitialClassification(
          base64,
          (step, progress) => {
            setCurrentStage(step);
            setAnalysisProgress(progress);
          },
          actualModelId
        );
        
        if (thumbnailUrl) {
          newStudy.thumbnailUrl = thumbnailUrl;
        }

        const classifierAgent = newStudy.agentResults?.find(a => a.agentName === 'layout_classifier');
        const patientInfo = classifierAgent?.output?.patient_info;

        setPatients(prev => {
          const currentPatient = prev.find(p => p.id === activePatientId);
          
          // Use original file name without extension as requested by user
          const fileNameNoExt = file.name.replace(/\.[^/.]+$/, "");
          newStudy.name = fileNameNoExt;

          return prev.map(p => 
            p.id === activePatientId 
              ? { 
                  ...p, 
                  patient_meta: {
                    ...p.patient_meta,
                    sex: patientInfo?.sex || p.patient_meta?.sex,
                    dob: patientInfo?.dob || p.patient_meta?.dob,
                  },
                  studies: [newStudy, ...(p.studies || [])].sort((a, b) => b.timestamp - a.timestamp) 
                } 
              : p
          );
        });
        
        setActiveStudyId(newStudy.id);
        setLastUploadedStudyIds(prev => [newStudy.id, ...prev]);
        const duration = Date.now() - startTime;
        addLog(`Файл ${file.name} успешно обработан`, duration, 'success');
      } catch (error) {
        console.error("Queue processing error:", error);
        addLog(`Ошибка при обработке ${file.name}: ${error instanceof Error ? error.message : String(error)}`, 0, 'error');
      } finally {
        setUploadQueue(prev => prev.slice(1));
        isProcessingRef.current = false;
        setIsProcessingQueue(false);
        setIsUploading(false);
        setIsAnalyzing(false);
        setIsFullAnalyzing(false);
        setCurrentStage(null);
        setAnalysisProgress(0);
        
        if (uploadQueue.length === 1) {
          setQueueTotal(0);
          setQueueCurrent(0);
          addLog('Массовая загрузка завершена', 0, 'success');
          
          // Trigger review mode if we have uploaded studies
          setIsReviewing(true);
          setReviewIndex(0);
        }
      }
    };

    processNextInQueue().catch(err => {
      console.error("Error in processNextInQueue:", err);
      isProcessingRef.current = false;
      setIsProcessingQueue(false);
      setIsUploading(false);
      setIsAnalyzing(false);
    });
  }, [uploadQueue, isAnalyzing, activePatientId, selectedModel, queueCurrent, queueTotal]);

  const handleToggleStudySelection = (studyId: string) => {
    setSelectedStudyIds(prev => 
      prev.includes(studyId) 
        ? prev.filter(id => id !== studyId) 
        : [...prev, studyId]
    );
  };

  const handleSelectAllStudies = () => {
    if (!activePatient?.studies) return;
    if (selectedStudyIds.length === activePatient.studies.length) {
      setSelectedStudyIds([]);
    } else {
      setSelectedStudyIds(activePatient.studies.map(s => s.id));
    }
  };

  const handleBulkReAnalyze = async () => {
    if (selectedStudyIds.length === 0 || !activePatient) return;
    
    const studiesToAnalyze = activePatient.studies?.filter(s => selectedStudyIds.includes(s.id)) || [];
    if (studiesToAnalyze.length === 0) return;

    addLog(`Запуск массового анализа для ${studiesToAnalyze.length} снимков...`, 0, 'info');
    
    try {
      // We'll process them sequentially to avoid hitting rate limits too hard
      for (const study of studiesToAnalyze) {
        await handleRunFullAnalysis(study);
      }
      
      addLog('Массовый анализ завершен', 0, 'success');
    } catch (error) {
      console.error("Bulk re-analyze error:", error);
      addLog(`Ошибка при массовом анализе: ${error instanceof Error ? error.message : String(error)}`, 0, 'error');
    } finally {
      setSelectedStudyIds([]);
    }
  };

  const handleBulkDelete = () => {
    if (selectedStudyIds.length === 0) return;
    setDeleteConfirm({ 
      type: 'all', 
      id: 'bulk', 
      title: `Вы уверены, что хотите удалить ${selectedStudyIds.length} выбранных исследований?` 
    });
  };
  const handleRenameStudy = (studyId: string, newName: string) => {
    setPatients(prev => prev.map(p => ({
      ...p,
      studies: p.studies.map(s => s.id === studyId ? { ...s, name: newName } : s)
    })));
    setEditingStudyId(null);
    addLog(`Снимок переименован: ${newName}`, 0, 'success');
  };

  // Helper to format date for input[type="date"]
  const formatDateForInput = (dateValue: any) => {
    if (!dateValue) return "";
    try {
      // Handle DD.MM.YYYY format explicitly
      if (typeof dateValue === 'string' && dateValue.includes('.')) {
        const parts = dateValue.split('.');
        if (parts.length === 3) {
          const day = parts[0].padStart(2, '0');
          const month = parts[1].padStart(2, '0');
          const year = parts[2];
          // Check if it's YYYY.MM.DD or DD.MM.YYYY
          if (year.length === 4) {
            return `${year}-${month}-${day}`;
          } else if (parts[0].length === 4) {
            return `${parts[0]}-${month}-${parts[2].padStart(2, '0')}`;
          }
        }
      }

      const d = new Date(dateValue);
      if (isNaN(d.getTime())) return "";
      return d.toISOString().split('T')[0];
    } catch (e) {
      return "";
    }
  };

  const handleUpdateStudyStatus = (studyId: string, status: 'accepted' | 'rejected' | 'pending_review') => {
    setPatients(prev => prev.map(p => ({
      ...p,
      studies: p.studies.map(s => s.id === studyId ? { ...s, status } : s)
    })));
    const statusText = status === 'accepted' ? 'Принят' : status === 'rejected' ? 'Отклонен' : 'Ожидает проверки';
    addLog(`Статус снимка изменен: ${statusText}`, 0, 'info');
  };

  const handleUpdateStudyDate = (studyId: string, newDate: string) => {
    setPatients(prev => prev.map(p => {
      if (p.id !== activePatientId) return p;
      const updatedStudies = p.studies.map(s => {
        if (s.id !== studyId) return s;
        const parsedDate = new Date(newDate).getTime();
        return { 
          ...s, 
          examDate: newDate,
          timestamp: isNaN(parsedDate) ? s.timestamp : parsedDate 
        };
      }).sort((a, b) => b.timestamp - a.timestamp);
      
      return { ...p, studies: updatedStudies };
    }));
    addLog(`Дата исследования обновлена: ${newDate}`, 0, 'info');
  };

  const handleRunFullAnalysis = async (study: OCTStudy) => {
    if (!activePatientId) return;
    
    // Set status to accepted when starting full analysis
    setPatients(prev => prev.map(p => ({
      ...p,
      studies: p.studies.map(s => s.id === study.id ? { ...s, status: 'accepted' } : s)
    })));

    addLog(`Запуск полного анализа для ${study.id}...`, 0, 'info');
    setAnalyzingStudyId(study.id);
    setIsAnalyzing(true);
    setIsFullAnalyzing(true);
    setAnalysisProgress(0);
    
    try {
      const startTime = Date.now();
      const modelConfig = AVAILABLE_MODELS.find(m => m.id === selectedModel);
      const actualModelId = (modelConfig as any)?.actualModel || selectedModel;

      const updatedStudy = await orchestrateFullPipeline(
        { ...study, status: 'accepted' },
        (step, progress) => {
          addLog(step, 0, 'info');
          setCurrentStage(step);
          setAnalysisProgress(progress);
        },
        actualModelId,
        reportLanguage,
        true, // skipClassification - skip Agent 1 as requested
        false,  // forceReRun - changed from true to false
        activePatient?.clinical_data
      );
      
      console.log(`[handleRunFullAnalysis] Result for ${study.id}:`, updatedStudy);
      
      setPatients(prev => prev.map(p => 
        p.id === activePatientId 
          ? { 
              ...p, 
              studies: p.studies.map(s => s.id === study.id ? { ...updatedStudy, status: 'accepted' } : s)
            } 
          : p
      ));
      
      const duration = Date.now() - startTime;
      
      // Log details about what was extracted
      const rawOD = updatedStudy.data?.raw_metrics?.OD;
      const rawOS = updatedStudy.data?.raw_metrics?.OS;
      
      const getMetricCount = (eyeData: any) => {
        if (!eyeData) return 0;
        if (Array.isArray(eyeData)) return eyeData.length;
        let count = eyeData.parameters?.length || 0;
        if (eyeData.RNFL?.values) {
          count += Object.keys(eyeData.RNFL.values).filter(k => eyeData.RNFL.values[k] !== null).length;
        }
        return count;
      };

      const odCount = getMetricCount(rawOD);
      const osCount = getMetricCount(rawOS);
      
      const hasRaw = odCount > 0 || osCount > 0;
      const hasNormalized = updatedStudy.data?.normalized?.OD?.rnfl?.average !== null || updatedStudy.data?.normalized?.OS?.rnfl?.average !== null;
      
      if (hasRaw) {
        addLog(`Извлечено метрик: OD=${odCount}, OS=${osCount}`, 0, 'success');
      } else {
        addLog(`Предупреждение: Количественные метрики не извлечены. Проверьте тип отчета.`, 0, 'warning');
      }
      
      if (hasNormalized) {
        addLog(`Данные нормализованы успешно.`, 0, 'success');
      }
      
      addLog(`Анализ снимка ${study.id} завершен за ${Math.round(duration/1000)}с`, duration, 'success');
      
      // DO NOT run patient level analysis automatically as requested by user
      // await handleAnalyzePatient();
    } catch (error) {
      addLog(`Ошибка анализа: ${error}`, 0, 'error');
    } finally {
      setIsAnalyzing(false);
      setIsFullAnalyzing(false);
      setAnalyzingStudyId(null);
      setCurrentStage(null);
      setAnalysisProgress(0);
    }
  };

  const handleSaveClinicalData = () => {
    if (!activePatient) return;
    
    const updatedPatients = patients.map(p => {
      if (p.id !== activePatient.id) return p;
      
      // Update patient meta with DOB
      const updatedMeta = { ...p.patient_meta, dob: clinicalFormData.dob || p.patient_meta?.dob };
      
      // Update all studies with clinical data
      const updatedStudies = p.studies.map(s => ({
        ...s,
        clinical: {
          ...s.clinical,
          iop_od: clinicalFormData.iop_od,
          iop_os: clinicalFormData.iop_os,
          family_history: clinicalFormData.family_history
        }
      }));
      
      return { ...p, patient_meta: updatedMeta, studies: updatedStudies };
    });
    
    setPatients(updatedPatients);
    setShowClinicalForm(false);
    addLog('Клинические данные обновлены. Рекомендуется перезапустить анализ.', 0, 'success');
  };

  const handleRenamePatient = (id: string, newName: string) => {
    setPatients(prev => prev.map(p => p.id === id ? { ...p, patient_meta: { ...p.patient_meta!, name: newName } } : p));
    setEditingPatientId(null);
    addLog(`Пациент переименован: ${newName}`, 0, 'success');
  };

  const handleAnalyzePatient = async () => {
    if (!activePatient) {
      addLog('Пациент не выбран', 0, 'warning');
      return;
    }
    
    if ((activePatient.studies?.length || 0) === 0) {
      addLog('У пациента нет исследований для анализа', 0, 'warning');
      return;
    }
    
    setIsAnalyzing(true);
    setIsFullAnalyzing(true);
    setAnalysisProgress(0);
    addLog(`Запуск клинического анализа для пациента ${activePatient.id}...`, 0);

    try {
      const startTime = Date.now();
      
      // 1. Check for missing agents in studies and re-analyze if needed
      
      // Resolve actual model ID if it's an alias
      const modelConfig = AVAILABLE_MODELS.find(m => m.id === selectedModel);
      const actualModelId = (modelConfig as any)?.actualModel || selectedModel;

      // Filter out rejected studies
      let currentStudies = (activePatient.studies || []).filter(s => s.status !== 'rejected');
      let updatedAnyStudy = false;

      if (currentStudies.length === 0) {
        addLog("Нет принятых исследований для анализа", 0, 'warning');
        setIsAnalyzing(false);
        return;
      }

      for (let i = 0; i < currentStudies.length; i++) {
        const s = currentStudies[i];
        const isRNFL = s.layout?.report_type === "RNFL";
        const studyRequiredAgents = isRNFL 
          ? ['layout_classifier', 'universal_extractor', 'normalizer', 'quality_control', 'quality_analyzer', 'rnfl_analyzer', 'macula_analyzer']
          : ['layout_classifier', 'universal_extractor', 'normalizer', 'quality_control', 'quality_analyzer', 'rnfl_analyzer', 'macula_analyzer'];

        const successfulAgents = s.agentResults?.filter(r => r.status === 'success').map(r => r.agentName) || [];
        const isIncomplete = !studyRequiredAgents.every(agent => successfulAgents.includes(agent));
        
        // Skip classification if we have any layout result already
        const hasUsableLayout = successfulAgents.includes('layout_classifier') || !!s.layout;

        if (isIncomplete) {
          addLog(`Автоматический переанализ исследования ${s.id} (${i + 1}/${currentStudies.length})...`, 0, 'info');
          setCurrentStage(`Переанализ снимка ${i + 1}...`);
          
          try {
            const updatedStudy = await orchestrateFullPipeline(
              { ...s, status: 'accepted' },
              (step, progress) => {
                setCurrentStage(`Снимок ${i + 1}: ${step}`);
                setAnalysisProgress(progress);
              },
              actualModelId,
              reportLanguage,
              hasUsableLayout, // Skip classification only if we already have a usable one
              false,             // forceReRun - changed from true to false
              activePatient?.clinical_data,
              currentStudies
            );
            
            // Preserve original ID, timestamp and thumbnailUrl
            currentStudies[i] = { ...updatedStudy, id: s.id, timestamp: s.timestamp, thumbnailUrl: s.thumbnailUrl, status: 'accepted' };
            updatedAnyStudy = true;
            addLog(`Исследование ${s.id} успешно переанализировано`, 0, 'success');
          } catch (err) {
            console.error(`Failed to re-analyze study ${s.id}:`, err);
            addLog(`Ошибка при переанализе снимка ${s.id}. Используем старые данные.`, 0, 'warning');
          }
        }
      }

      if (updatedAnyStudy) {
        setPatients(prev => prev.map(p => {
          if (p.id !== activePatient.id) return p;
          
          let updatedSex = p.patient_meta?.sex;
          let updatedDob = p.patient_meta?.dob;
          
          currentStudies.forEach(s => {
            if (s.patient_info) {
              if (!updatedSex && s.patient_info.sex) updatedSex = s.patient_info.sex;
              if (!updatedDob && s.patient_info.dob) updatedDob = s.patient_info.dob;
            }
          });
          
          return { ...p, studies: currentStudies, patient_meta: { ...p.patient_meta, sex: updatedSex, dob: updatedDob } };
        }));
      }

      setActiveTab('history');
      const duration = Date.now() - startTime;
      addLog(`Анализ всех снимков для ${activePatient.id} завершен`, duration, 'success');
      
      // 👉 Trigger the case-level clinical analysis ONE time for the whole case
      // This is deterministic and follows the "one call per case" rule
      await handleGenerateFinalConclusion(false);
    } catch (error) {
      console.error("Patient analysis error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Ошибка клинического анализа для ${activePatient.id}: ${errorMessage}`, 0, 'error');
    } finally {
      setIsAnalyzing(false);
      setIsFullAnalyzing(false);
      setCurrentStage(null);
      setAnalysisProgress(0);
    }
  };

  const handleGenerateFinalConclusion = async (force: boolean = false) => {
    if (!activePatient) return;
    
    const startTime = Date.now();
    setIsAnalyzing(true);
    setIsFullAnalyzing(true);
    
    try {
      const acceptedStudies = activePatient.studies.filter(s => s.status === 'accepted');
      if (acceptedStudies.length === 0) {
        addLog("Нет принятых снимков для формирования заключения", 0, 'warning');
        setIsAnalyzing(false);
        return;
      }

      const currentStudies = [...activePatient.studies];
      let updatedAnyStudy = false;

          // 1. Ensure all accepted studies are analyzed
          for (let i = 0; i < currentStudies.length; i++) {
            const s = currentStudies[i];
            if (s.status === 'accepted') {
              // Determine required agents based on the detected pipeline
              const layout = s.layout;
              const pipeline = routeStudyPipeline(layout);
              
              let studyRequiredAgents: string[] = [];
              if (pipeline === 'glaucoma_pipeline') {
                studyRequiredAgents = ['layout_classifier', 'universal_extractor', 'normalizer', 'quality_control', 'quality_analyzer', 'rnfl_analyzer', 'macula_analyzer'];
              } else if (pipeline === 'retina_pipeline') {
                studyRequiredAgents = ['layout_classifier', 'macula_thickness', 'etdrs_analyzer', 'edema_detector', 'vmi_agent', 'macula_analyzer'];
              } else if (s.modality === 'PERIMETRY') {
                studyRequiredAgents = ['layout_classifier', 'perimetry_analyzer'];
              } else if (s.modality === 'TOPOGRAPHY') {
                studyRequiredAgents = ['layout_classifier', 'topography_analyzer'];
              } else if (s.modality === 'BIOMETRY') {
                studyRequiredAgents = ['layout_classifier', 'biometry_analyzer'];
              } else {
                // Default minimum for any medical study
                studyRequiredAgents = ['layout_classifier'];
              }

              const successfulAgents = s.agentResults?.filter(r => r.status === 'success').map(r => r.agentName) || [];
              const isIncomplete = !studyRequiredAgents.every(agent => successfulAgents.includes(agent));

              // ONLY re-analyze if study is truly incomplete.
              // "Redo Conclusion" (force=true) should NOT trigger Agent 2 re-extraction 
              // for studies that are already fully processed.
              if (isIncomplete) {
                addLog(`Доработка анализа снимка ${s.id}...`, 0, 'info');
                setCurrentStage(`Доработка анализа снимка ${s.id}...`);
                
                const modelConfig = AVAILABLE_MODELS.find(m => m.id === selectedModel);
                const actualModelId = (modelConfig as any)?.actualModel || selectedModel;

                try {
                  const updatedStudy = await orchestrateFullPipeline(
                    s,
                    (step, progress) => {
                      setCurrentStage(step);
                      setAnalysisProgress(progress);
                    },
                    actualModelId,
                    reportLanguage,
                    !!s.layout, // skipClassification if layout exists
                    false,      // forceReRun = false in conclusion loop!
                    activePatient.clinical_data,
                    currentStudies,
                    true // onlyAnalysis = true
                  );
                  
                  currentStudies[i] = { ...updatedStudy, id: s.id, status: 'accepted' as const };
                  updatedAnyStudy = true;
                } catch (err) {
                  console.error(`Failed to complete analysis for study ${s.id}:`, err);
                }
              }
            }
          }

      if (updatedAnyStudy) {
        setPatients(prev => prev.map(p => p.id === activePatient.id ? { ...p, studies: currentStudies } : p));
      }

      // 2. Run patient-level conclusion
      addLog("Формирование финального заключения...", 0, 'info');
      setCurrentStage("Формирование финального заключения...");
      
      const modelConfig = AVAILABLE_MODELS.find(m => m.id === selectedModel);
      const actualModelId = (modelConfig as any)?.actualModel || selectedModel;

      const result = await orchestratePatientAnalysis(
        currentStudies.filter(s => s.status === 'accepted'),
        (step, progress) => {
          setCurrentStage(step);
          setAnalysisProgress(progress);
        },
        actualModelId,
        reportLanguage,
        {
          id: activePatient.id,
          sex: activePatient.patient_meta?.sex,
          dob: activePatient.patient_meta?.dob
        }
      );
      
      setPatients(prev => prev.map(p => 
        p.id === activePatient.id ? { ...p, analysis: result, studies: currentStudies } : p
      ));
      
      setActiveTab('analysis');
      const duration = Date.now() - startTime;
      addLog(`Финальное заключение для ${activePatient.id} сформировано`, duration, 'success');
    } catch (error) {
      console.error("Conclusion generation error:", error);
      addLog(`Ошибка формирования заключения: ${error instanceof Error ? error.message : String(error)}`, 0, 'error');
    } finally {
      setIsAnalyzing(false);
      setIsFullAnalyzing(false);
      setCurrentStage(null);
      setAnalysisProgress(0);
    }
  };

  const handleGenerateAIConclusion = async () => {
    if (!activePatient) return;
    
    setIsGeneratingAIConclusion(true);
    addLog("Запуск генерации мнения ИИ...", 0, 'info');
    
    try {
      const acceptedStudies = activePatient.studies.filter(s => s.status === 'accepted');
      if (acceptedStudies.length === 0) {
        addLog("Нет принятых снимков для анализа ИИ", 0, 'warning');
        setIsGeneratingAIConclusion(false);
        return;
      }

      // 1. Ensure all accepted studies are analyzed
      const currentStudies = [...activePatient.studies];
      let updatedAnyStudy = false;

      for (let i = 0; i < currentStudies.length; i++) {
        const s = currentStudies[i];
        if (s.status === 'accepted') {
          const isRNFL = s.layout?.report_type === "RNFL";
          const studyRequiredAgents = isRNFL 
            ? ['layout_classifier', 'universal_extractor', 'normalizer', 'quality_control', 'quality_analyzer', 'rnfl_analyzer', 'macula_analyzer']
            : ['layout_classifier', 'universal_extractor', 'normalizer', 'quality_control', 'quality_analyzer', 'rnfl_analyzer', 'macula_analyzer'];

          const successfulAgents = s.agentResults?.filter(r => r.status === 'success').map(r => r.agentName) || [];
          const isIncomplete = !studyRequiredAgents.every(agent => successfulAgents.includes(agent));

          if (isIncomplete) {
            addLog(`Досбор данных для снимка ${s.id}...`, 0, 'info');
            const modelConfig = AVAILABLE_MODELS.find(m => m.id === selectedModel);
            const actualModelId = (modelConfig as any)?.actualModel || selectedModel;

            try {
              const updatedStudy = await orchestrateFullPipeline(
                s,
                (step) => addLog(step, 0, 'info'),
                actualModelId,
                reportLanguage,
                !!s.layout,
                false,
                activePatient.clinical_data,
                currentStudies,
                true
              );
              currentStudies[i] = { ...updatedStudy, id: s.id, timestamp: s.timestamp, thumbnailUrl: s.thumbnailUrl, status: 'accepted' };
              updatedAnyStudy = true;
            } catch (err) {
              console.error(`Failed to analyze study ${s.id}:`, err);
            }
          }
        }
      }

      if (updatedAnyStudy) {
        setPatients(prev => prev.map(p => p.id === activePatient.id ? { ...p, studies: currentStudies } : p));
      }

      // 2. Prepare data for AI Agent
      const studiesForAI = currentStudies.filter(s => s.status === 'accepted');
      const aggregated = multiExamAggregator(studiesForAI as any);
      
      if (!aggregated) {
        addLog("Не удалось агрегировать данные для ИИ", 0, 'error');
        setIsGeneratingAIConclusion(false);
        return;
      }

      // Gather outputs from the latest study or aggregated visit
      const latestStudy = studiesForAI[studiesForAI.length - 1];
      
      // Ensure classification is included if available in layout but missing in normalized
      const normalized = latestStudy.normalized || latestStudy.data?.normalized || {};
      if (latestStudy.layout?.od_classification && normalized.OD?.rnfl && !normalized.OD.rnfl.classification) {
        normalized.OD.rnfl.classification = latestStudy.layout.od_classification;
      }
      if (latestStudy.layout?.os_classification && normalized.OS?.rnfl && !normalized.OS.rnfl.classification) {
        normalized.OS.rnfl.classification = latestStudy.layout.os_classification;
      }

      const clinical = latestStudy.clinical || latestStudy.data?.clinical || {};
      
      const getFeatures = (eyeData: any) => {
        if (!eyeData || !eyeData.features) return [];
        if (Array.isArray(eyeData.features)) return eyeData.features;
        return Object.keys(eyeData.features).filter(k => eyeData.features[k]);
      };

      const odFeatures = getFeatures(clinical.OD);
      const osFeatures = getFeatures(clinical.OS);
      
      const forcedFindings = {
        OD: odFeatures,
        OS: osFeatures
      };

      // Transform clinicalAnalyzerOutput to use arrays for features
      const clinicalForAI = JSON.parse(JSON.stringify(clinical));
      if (clinicalForAI.OD) clinicalForAI.OD.features = odFeatures;
      if (clinicalForAI.OS) clinicalForAI.OS.features = osFeatures;

      const hasPathology = odFeatures.length > 0 || osFeatures.length > 0;
      const systemSummary = hasPathology ? "pathology_detected" : "normal_or_stable";

      const aiInput = {
        normalizerOutput: normalized,
        clinicalAnalyzerOutput: clinicalForAI,
        qualityOutput: {
          image_quality: latestStudy.quality_score || latestStudy.data?.quality?.signal_strength || latestStudy.quality?.global?.signal_strength,
          clinical_quality_flag: latestStudy.clinical_quality_flag || latestStudy.layout?.clinical_quality_flag || "удовлетворительное"
        },
        trustOutput: latestStudy.trust || latestStudy.data?.trust,
        confidenceOutput: latestStudy.confidence || latestStudy.data?.confidence,
        forcedFindings,
        systemSummary,
        mode: aggregated.mode,
        modelName: aiModel
      };

      console.log("[AI Opinion] Input Data:", JSON.stringify(aiInput, null, 2));

      addLog(`Генерация текста Мнения ИИ (${aiModel})...`, 0, 'info');
      const aiResult = await generateAIConclusion(aiInput);
      
      setPatients(prev => prev.map(p => {
        if (p.id !== activePatient.id) return p;
        return {
          ...p,
          analysis: {
            ...p.analysis,
            aiOpinion: {
              ...aiResult,
              timestamp: Date.now()
            }
          }
        };
      }));

      addLog("Мнение ИИ успешно сформировано", 0, 'success');
    } catch (error) {
      console.error("AI Conclusion error:", error);
      addLog("Ошибка при генерации мнения ИИ", 0, 'error');
    } finally {
      setIsGeneratingAIConclusion(false);
    }
  };

  const handleRunSingleAgent = async (agentId: string) => {
    if (!activeStudy || !activePatientId) return;
    
    addLog(`Запуск агента ${agentId} [${selectedModel}] для ${activeStudy.id}...`, 0, 'info');
    setIsAnalyzing(true);
    setRunningAgentId(agentId);
    setIsFullAnalyzing(false);
    
    try {
      let result: AgentResult;
      const base64 = activeStudy.imageUrl;
      
      // Resolve actual model ID if it's an alias
      const modelConfig = AVAILABLE_MODELS.find(m => m.id === selectedModel);
      const actualModelId = (modelConfig as any)?.actualModel || selectedModel;
      
      switch (agentId) {
        case 'layout':
          result = await layoutClassifierAgent(base64, undefined, actualModelId);
          break;
        case 'extractor':
          const extractorLayout = activeStudy.status === 'accepted' ? { ...activeStudy.layout, has_tables: true } : activeStudy.layout;
          result = await universalExtractorAgent(base64, undefined, actualModelId, extractorLayout);
          break;
        case 'normalizer':
          console.log(`[Playground] Running Normalizer with raw_metrics:`, activeStudy.raw_metrics);
          result = await normalizerAgent(activeStudy.raw_metrics, activeStudy.layout?.report_type || 'Unknown', actualModelId, activeStudy.layout);
          break;
        case 'quality':
          const normalizedData = activeStudy.normalized || { OD: { rnfl: {}, macula: {} }, OS: { rnfl: {}, macula: {} } };
          const qOutput = quality_analyzer(normalizedData);
          result = {
            agentName: "quality_analyzer",
            timestamp: Date.now(),
            status: "success",
            output: qOutput,
            duration: 0
          };
          break;
        case 'rnfl_analyzer':
          const currentScanRnfl = activeStudy.normalized || { OD: {}, OS: {} };
          result = {
            agentName: "rnfl_analyzer",
            timestamp: Date.now(),
            status: "success",
            output: RNFL_analyzer(currentScanRnfl),
            duration: 0
          };
          break;
        case 'macula_analyzer':
          const currentScanMacula = activeStudy.normalized || { OD: {}, OS: {} };
          result = {
            agentName: "macula_analyzer",
            timestamp: Date.now(),
            status: "success",
            output: macula_analyzer(currentScanMacula),
            duration: 0
          };
          break;
        case 'onh_analyzer':
          const currentScanOnh = activeStudy.normalized || { OD: {}, OS: {} };
          result = {
            agentName: "onh_analyzer",
            timestamp: Date.now(),
            status: "success",
            output: {
              OD: onhAnalyzer(currentScanOnh.OD?.onh || currentScanOnh.OD?.RNFL || currentScanOnh.OD),
              OS: onhAnalyzer(currentScanOnh.OS?.onh || currentScanOnh.OS?.RNFL || currentScanOnh.OS)
            },
            duration: 0
          };
          break;
        case 'quality_analyzer':
          const currentScanQuality = activeStudy.normalized || { OD: {}, OS: {} };
          result = {
            agentName: "quality_analyzer",
            timestamp: Date.now(),
            status: "success",
            output: quality_analyzer(currentScanQuality),
            duration: 0
          };
          break;
        case 'master_aggregator':
          // Consistency: Aggregator in playground MUST use the same logic as the main pipeline
          const seriesData = getAggregatedData(activePatient.studies);
          
          result = {
            agentName: "master_aggregator",
            timestamp: Date.now(),
            status: "success",
            output: seriesData.masterAggregated,
            duration: 0
          };
          break;
        case 'clinical_analyzer_final': {
          const aggregatedData = getAggregatedData(activePatient.studies);
          
          // 🔑 Clinical Analyzer MUST take the aggregator output directly
          console.log("INPUT TO CLINICAL (Final - Deterministic):", aggregatedData.masterAggregated);
          const coreResult = clinical_analyzer(aggregatedData.masterAggregated);
          
          result = {
            agentName: "clinical_analyzer_final",
            timestamp: Date.now(),
            status: "success",
            output: coreResult,
            duration: 100
          };
          break;
        }
        case 'clinical_analyzer_ai':
        case 'clinical_analyzer': {
          // 🔑 SCAN-LEVEL clinical interpretation
          const studyNorm = activeStudy.normalized || { OD: {}, OS: {} };
          const scanQuality = activeStudy.quality || quality_analyzer(studyNorm);
          
          const rnflS = RNFL_analyzer(studyNorm);
          const maculaS = macula_analyzer(studyNorm);
          const onhS = {
            OD: onhAnalyzer(studyNorm.OD?.onh || studyNorm.OD?.rnfl || studyNorm.OD),
            OS: onhAnalyzer(studyNorm.OS?.onh || studyNorm.OS?.rnfl || studyNorm.OS)
          };

          const scanInput = {
            OD: {
              rnfl: rnflS.OD,
              disc: onhS.OD,
              macula: maculaS.OD,
              confidence: scanQuality.OD?.confidence || "low"
            },
            OS: {
              rnfl: rnflS.OS,
              disc: onhS.OS,
              macula: maculaS.OS,
              confidence: scanQuality.OS?.confidence || "low"
            },
            global: { confidence: scanQuality.global?.confidence || "low" }
          };
          
          console.log("RUNNING SCAN CLINICAL (Playground):", scanInput);
          const clinOutput = clinicalAnalyzerScan(scanInput);
          
          result = {
            agentName: "clinical_analyzer",
            timestamp: Date.now(),
            status: "success",
            output: clinOutput,
            duration: 0
          };
          break;
        }
        case 'perimetry':
          result = await perimetryAnalyzerAgent(base64, undefined, actualModelId);
          break;
        case 'topography':
          result = await topographyAnalyzerAgent(base64, undefined, actualModelId);
          break;
        case 'biometry':
          result = await biometryAnalyzerAgent(base64, undefined, actualModelId);
          break;
        case 'conclusion':
          const conclusionText = buildConclusion({
            clinical: activeStudy.clinical,
            normalizer: activeStudy.normalized,
            classifier: activeStudy.layout,
            allStudies: activePatient?.studies
          });
          const summaryText = buildSummary(activeStudy.clinical);
          const isSuspiciousVal = summaryText !== "Норма";
          result = {
            agentName: "conclusion",
            timestamp: Date.now(),
            status: "success",
            output: {
              conclusion_text: conclusionText,
              summary: summaryText,
              recommendations: isSuspiciousVal ? "Контроль OCT" : "Плановое наблюдение"
            },
            duration: 0
          };
          break;
        case 'explain':
          result = await explainAgent({
            normalized: activeStudy.normalized,
            clinical: activeStudy.clinical,
            confidence: activeStudy.confidence?.confidence_score || 0.5,
            quality: activeStudy.quality
          }, actualModelId, reportLanguage);
          result = { ...result, agentName: 'explain' };
          break;
        case 'collector':
          result = await universalCollectorAgent(base64, undefined, actualModelId);
          break;
        case 'collector_normalizer':
          // This is a local function, not an AI agent
          const startTime = Date.now();
          const rawCollectorData = activeStudy.agentResults?.find(a => a.agentName === 'universal_collector')?.output;
          
          const normalizedOutput = normalizeStudy(rawCollectorData);
          
          result = {
            agentName: "collector_normalizer",
            timestamp: Date.now(),
            status: "success",
            output: normalizedOutput,
            duration: Date.now() - startTime
          };
          break;
        case 'confidence':
          result = {
            agentName: "confidence",
            timestamp: Date.now(),
            status: "success",
            output: confidenceAnalyzer(
              activeStudy.layout,
              activeStudy.normalized,
              activeStudy.clinical,
              activeStudy.raw_metrics
            ),
            duration: 0
          };
          break;
        case 'trust':
          result = {
            agentName: "trust",
            timestamp: Date.now(),
            status: "success",
            output: doctorTrustLayer(
              activeStudy.layout,
              activeStudy.quality,
              activeStudy.confidence,
              activeStudy.normalized,
              reportLanguage,
              activeStudy.clinical
            ),
            duration: 0
          };
          break;
        case 'orchestrate_patient_analysis': {
          const startTimeOrch = Date.now();
          const analysisResult = await orchestratePatientAnalysis(
            activePatient.studies.filter(s => s.status === 'accepted'),
            () => {},
            actualModelId,
            reportLanguage,
            { id: activePatient.id, sex: activePatient.patient_meta?.sex, dob: activePatient.patient_meta?.dob }
          );
          result = {
            agentName: "orchestrate_patient_analysis",
            timestamp: Date.now(),
            status: "success",
            output: analysisResult,
            duration: Date.now() - startTimeOrch
          };
          break;
        }
        default:
          throw new Error(`Unknown agent: ${agentId}`);
      }
      
      console.log(`[handleRunSingleAgent] Result for ${agentId}:`, result);
      
      setPatients(prev => prev.map(p => {
        if (p.id !== activePatientId) return p;
        
        const updatedStudies = p.studies.map(s => s.id === activeStudy.id 
          ? updateStudyWithAgentResult(s, result)
          : s);
        
        let updatedAnalysis = p.analysis;
        if (agentId === 'orchestrate_patient_analysis' && result.status === 'success') {
          updatedAnalysis = result.output;
        }
        
        let updatedSex = p.patient_meta?.sex;
        let updatedDob = p.patient_meta?.dob;
        
        if (agentId === 'layout' && result.status === 'success') {
          const patientInfo = result.output.patient_info;
          if (patientInfo) {
            if (!updatedSex && patientInfo.sex) updatedSex = patientInfo.sex;
            if (!updatedDob && patientInfo.dob) updatedDob = patientInfo.dob;
          }
        }
        
        return { 
          ...p, 
          patient_meta: {
            ...p.patient_meta,
            sex: updatedSex,
            dob: updatedDob,
          },
          studies: updatedStudies,
          analysis: updatedAnalysis
        };
      }));
      
      addLog(`Агент ${agentId} завершил работу`, result.duration, 'success');
    } catch (error) {
      addLog(`Ошибка агента: ${error}`, 0, 'error');
      
      // Add error result to agentResults so it's visible in Playground
      const errorResult: AgentResult = {
        agentName: agentId,
        timestamp: Date.now(),
        status: 'error',
        output: { error: String(error) },
        duration: 0
      };
      
      setPatients(prev => prev.map(p => {
        if (p.id !== activePatientId) return p;
        const updatedStudies = p.studies.map(s => s.id === activeStudy.id 
          ? updateStudyWithAgentResult(s, errorResult)
          : s);
        return { ...p, studies: updatedStudies };
      }));
    } finally {
      setIsAnalyzing(false);
      setRunningAgentId(null);
      setIsFullAnalyzing(false);
    }
  };

  const [customPrompt, setCustomPrompt] = useState('');
  const handleRunCustomPrompt = async () => {
    if (!activeStudy || !activePatientId || !customPrompt.trim()) return;
    
    addLog(`Запуск кастомного промпта [${selectedModel}]...`, 0, 'info');
    setIsAnalyzing(true);
    setRunningAgentId('custom');
    setIsFullAnalyzing(false); // Explicitly false for custom prompt
    
    try {
      // Resolve actual model ID if it's an alias
      const modelConfig = AVAILABLE_MODELS.find(m => m.id === selectedModel);
      const actualModelId = (modelConfig as any)?.actualModel || selectedModel;
      
      const result = await runCustomPrompt(customPrompt, activeStudy.imageUrl, undefined, actualModelId);
      
      setPatients(prev => prev.map(p => 
        p.id === activePatientId 
          ? { 
              ...p, 
              studies: p.studies.map(s => s.id === activeStudy.id 
                ? updateStudyWithAgentResult(s, result)
                : s) 
            } 
          : p
      ));
      
      addLog('Кастомный промпт выполнен', result.duration, 'success');
    } catch (error) {
      addLog(`Ошибка: ${error}`, 0, 'error');
      
      const errorResult: AgentResult = {
        agentName: 'custom_prompt',
        timestamp: Date.now(),
        status: 'error',
        output: { error: String(error) },
        duration: 0
      };
      
      setPatients(prev => prev.map(p => 
        p.id === activePatientId 
          ? { 
              ...p, 
              studies: p.studies.map(s => s.id === activeStudy.id 
                ? updateStudyWithAgentResult(s, errorResult)
                : s) 
            } 
          : p
      ));
    } finally {
      setIsAnalyzing(false);
      setRunningAgentId(null);
      setIsFullAnalyzing(false);
    }
  };

  const translateStatus = (status: string | undefined) => {
    if (!status) return 'Н/Д';
    const s = status.toLowerCase();
    if (reportLanguage === 'en') return status;
    
    // Handle "Статус: early_damage" pattern
    if (s.startsWith('статус: ') || s.startsWith('status: ')) {
      const parts = status.split(': ');
      if (parts.length === 2) {
        const val = parts[1].toLowerCase();
        let translatedVal = parts[1];
        if (val === 'moderate_or_advanced_damage' || val === 'advanced_damage') translatedVal = 'Выраженные изменения';
        else if (val === 'moderate_damage') translatedVal = 'Умеренные изменения';
        else if (val === 'early_damage') translatedVal = 'Ранние изменения';
        else if (val === 'structural_suspect') translatedVal = 'Структурное подозрение';
        else if (val === 'normal') translatedVal = 'Норма';
        return `Статус: ${translatedVal}`;
      }
    }

    switch (s) {
      case 'advanced_damage': return 'Выраженные изменения';
      case 'moderate_damage': return 'Умеренные изменения';
      case 'moderate_or_advanced_damage': return 'Выраженные изменения';
      case 'early_damage': return 'Ранние изменения';
      case 'structural_suspect': return 'Структурное подозрение';
      case 'normal': return 'Норма';
      case 'unknown': return 'Неизвестно';
      case 'not_assessed': return 'Не оценивалось';
      case 'not assessed': return 'Не оценивалось';
      default: return status;
    }
  };

  const translateTrustMessage = (message: string | undefined) => {
    if (!message) return '';
    if (reportLanguage === 'en') return message;
    
    if (message.includes('No quantitative data')) {
      return "Нет количественных данных (нет таблиц или параметров). Анализ основан только на качественных признаках.";
    }
    if (message.includes('Poor quality')) {
      return "Плохое качество – не диагностично";
    }
    if (message.includes('Macula study')) {
      return "Исследование макулы – только вспомогательное";
    }
    if (message.includes('Single eye analysis')) {
      return "Анализ одного глаза: требуется проверка для полного клинического контекста";
    }
    if (message.includes('Analysis suitable')) {
      return "Анализ пригоден для клинической интерпретации";
    }
    return message;
  };

  const handlePrintLogicalConclusion = () => {
    if (!activePatient?.analysis?.conclusion) return;
    const conclusion = activePatient.analysis.conclusion;
    const metrics = activePatient.analysis.explanationReport;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Заключение Агента - ${activePatient.patient_meta?.name || 'Пациент'}</title>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap');
              body { font-family: 'Inter', sans-serif; padding: 40px; line-height: 1.6; color: #1e293b; max-width: 850px; margin: 0 auto; }
              .header { border-bottom: 4px solid #4f46e5; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
              h1 { color: #3730a3; margin: 0; font-size: 26px; font-weight: 800; text-transform: uppercase; letter-spacing: -0.02em; }
              .meta { font-size: 11px; color: #64748b; margin-top: 5px; }
              .patient-info { background: #f8fafc; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; border: 1px solid #e2e8f0; }
              .info-item { font-size: 12px; }
              .info-label { font-weight: 700; color: #94a3b8; text-transform: uppercase; font-size: 9px; margin-bottom: 1px; }
              .section-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #4f46e5; margin-top: 25px; margin-bottom: 8px; border-left: 2px solid #4f46e5; padding-left: 8px; }
              .summary-box { background: #f8fafc; padding: 15px; border-radius: 10px; border: 1px solid #e2e8f0; font-weight: 600; color: #1e293b; font-size: 13px; line-height: 1.4; margin-bottom: 15px; }
              .content-box { line-height: 1.5; font-size: 12px; text-align: justify; color: #334155; }
              .tips-box { background: #eef2ff; padding: 15px; border-radius: 10px; margin-top: 15px; font-weight: 600; border: 1px solid #c7d2fe; color: #1e1b4b; font-size: 13px; font-style: italic; }
              .metrics-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 20px; }
              .metric-card { border: 1px solid #e2e8f0; padding: 10px 12px; border-radius: 8px; background: #fff; }
              .metric-title { font-weight: 800; font-size: 10px; color: #475569; border-bottom: 1px solid #f1f5f9; padding-bottom: 3px; margin-bottom: 8px; }
              .metric-row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px; }
              .metric-val { font-weight: 700; color: #4f46e5; }
              .footer { margin-top: 40px; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center; }
              @media print {
                body { padding: 0; }
                .no-print { display: none; }
                .patient-info { background: white !important; }
                .summary-box { background: #f8fafc !important; border: 1px solid #e2e8f0 !important; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <div>
                <h1>ЗАКЛЮЧЕНИЕ ГЛАУКОМА ЛАБ</h1>
                <div class="meta">Аналитическая система интерпретации v4.0</div>
              </div>
              <div style="text-align: right; color: #64748b; font-size: 12px;">
                ДАТА: ${new Date().toLocaleDateString()}<br/>
                ID: ${activePatient.id}
              </div>
            </div>

            <div class="patient-info">
              <div class="info-item">
                <div class="info-label">ФИО ПАЦИЕНТА</div>
                <div style="font-weight: 700;">${activePatient.patient_meta?.name || 'Не указано'}</div>
              </div>
              <div class="info-item">
                <div class="info-label">ДАТА РОЖДЕНИЯ</div>
                <div>${activePatient.patient_meta?.dob || '—'}</div>
              </div>
            </div>

            <div class="section-label">ПОЛНЫЙ АНАЛИТИЧЕСКИЙ ОТЧЕТ</div>
            <div class="content-box">${conclusion.conclusion_text.replace(/\n/g, '<br/>')}</div>

            <div class="section-label">РЕКОМЕНДАЦИИ</div>
            <div class="tips-box">${conclusion.recommendations}</div>
            
            <div class="footer">
              Отчет сформирован программным комплексом Glaucoma Lab. Требуется консультация специалиста.<br/>
              © ${new Date().getFullYear()} Glaucoma Lab Analysis Engine.
            </div>
            
            <div style="text-align: center; margin-top: 40px;" class="no-print">
              <button onclick="window.print()" style="padding: 12px 30px; background: #4f46e5; color: white; border: none; border-radius: 10px; cursor: pointer; font-weight: bold; font-size: 14px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);">Распечатать бумажную копию</button>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const handlePrintAIOpinion = () => {
    if (!activePatient?.analysis?.aiOpinion) return;
    const opinion = activePatient.analysis.aiOpinion;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Мнение ИИ - ${activePatient.patient_meta?.name || 'Пациент'}</title>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
              body { font-family: 'Inter', sans-serif; padding: 30px; line-height: 1.5; color: #1e293b; max-width: 800px; margin: 0 auto; }
              h1 { color: #92400e; border-bottom: 2px solid #fde68a; padding-bottom: 8px; margin-bottom: 16px; font-size: 22px; }
              .meta { font-size: 12px; margin-bottom: 24px; color: #64748b; display: flex; justify-content: space-between; border-bottom: 1px solid #fef3c7; padding-bottom: 10px; }
              .section-title { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #b45309; margin-top: 24px; margin-bottom: 6px; }
              .content-box { line-height: 1.5; font-size: 13px; text-align: justify; color: #1e293b; }
              .recs-box { background: #fefce8; padding: 15px; border-radius: 10px; margin-top: 15px; font-weight: 700; border-left: 3px solid #f59e0b; color: #451a03; font-size: 13px; font-style: italic; }
              .footer { margin-top: 40px; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; text-align: center; font-style: italic; }
              @media print {
                body { padding: 15px; }
                .no-print { display: none; }
              }
            </style>
          </head>
          <body>
            <h1>ГЛАУКОМА ЛАБ: Мнение ИИ</h1>
            <div class="meta">
              <div><strong>Пациент:</strong> ${activePatient.patient_meta?.name || 'Аноним'}</div>
              <div><strong>ID:</strong> ${activePatient.id}</div>
              <div><strong>Дата:</strong> ${new Date().toLocaleDateString()}</div>
            </div>
            
            <div class="section-title">Обоснование анализа</div>
            <div class="content-box">${opinion.conclusion_text.replace(/\n/g, '<br/>')}</div>
            
            <div class="section-title">Рекомендации</div>
            <div class="recs-box">${opinion.recommendations}</div>
            
            <div class="footer">
              Сформировано системой Glaucoma Lab v2.5. Данный отчет носит информационный характер и требует утверждения лечащим врачом.
            </div>
            <div style="text-align: center; margin-top: 40px;" class="no-print">
              <button onclick="window.print()" style="padding: 10px 20px; background: #b45309; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">Распечатать</button>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const handlePrint = () => {
    if (window.self !== window.top) {
      addLog('Печать из этого окна заблокирована браузером. Пожалуйста, откройте приложение в новой вкладке для печати.', 0, 'info');
      return;
    }
    
    // In top window, we can print normally
    window.focus();
    setTimeout(() => {
      window.print();
    }, 500);
  };

  const downloadReadableReport = () => {
    if (!activeStudy || !activePatient) return;

    let reportText = "";
    
    if (activeStudy.report_text) {
      reportText = activeStudy.report_text;
    } else {
      // Fallback to generating it on the fly if not pre-generated
      reportText = generateMedicalReportText(activeStudy, activePatient.patient_meta?.name);
    }

    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `structural_report_${activeStudy.id}.txt`;
    a.click();
    addLog('Структурный отчет выгружен', 0, 'success');
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans w-full">
      {/* Sidebar - Patient Management */}
      <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-72'} bg-white border-r border-slate-200 flex flex-col min-h-0 transition-all duration-300 ease-in-out shrink-0`}>
        <div className={`p-6 border-b border-slate-100 ${isSidebarCollapsed ? 'flex justify-center' : ''}`}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200 shrink-0">
              <Eye size={24} />
            </div>
            {!isSidebarCollapsed && <h1 className="text-xl font-bold tracking-tight text-slate-800 truncate">Glaucoma Lab</h1>}
          </div>
          
          <button 
            onClick={() => setShowNewPatientModal(true)}
            className={`flex items-center justify-center gap-2 bg-slate-900 text-white py-3 rounded-xl hover:bg-slate-800 transition-all shadow-sm active:scale-95 ${isSidebarCollapsed ? 'w-10 h-10 p-0' : 'w-full'}`}
            title="Новый пациент"
          >
            <Plus size={18} />
            {!isSidebarCollapsed && <span className="font-medium">Новый пациент</span>}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
          {!isSidebarCollapsed && (
            <div className="px-3 mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Список пациентов</span>
            </div>
          )}
          <div className="space-y-1">
            {patients.map(patient => (
              <div 
                key={patient.id}
                onClick={() => setActivePatientId(patient.id)}
                className={`group flex items-center p-3 rounded-xl cursor-pointer transition-all ${
                  activePatientId === patient.id 
                    ? 'bg-indigo-50 text-indigo-700' 
                    : 'hover:bg-slate-100 text-slate-600'
                } ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}
                title={isSidebarCollapsed ? patient.id : ''}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    activePatientId === patient.id ? 'bg-indigo-100' : 'bg-slate-200'
                  }`}>
                    <Users size={16} />
                  </div>
                  {!isSidebarCollapsed && (
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 group/name">
                        <div className="font-semibold text-sm truncate">
                          {patient.patient_meta?.name || patient.id}
                        </div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingPatientId(patient.id);
                            setEditNameValue(patient.patient_meta?.name || patient.id);
                          }}
                          className="opacity-0 group-hover/name:opacity-100 p-1 hover:bg-indigo-100 rounded text-indigo-600 transition-all"
                        >
                          <FileText size={10} />
                        </button>
                      </div>
                      <div className="text-[10px] opacity-70 uppercase font-bold tracking-tighter truncate">
                        ID: {patient.id} • {patient.studies?.length || 0} иссл.
                      </div>
                    </div>
                  )}
                </div>
                {!isSidebarCollapsed && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeletePatient(patient.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-rose-100 hover:text-rose-600 rounded-lg transition-all shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Logs Area */}
        {!isSidebarCollapsed && (
          <div className="border-t border-slate-200 bg-slate-50/50">
            <button 
              onClick={handleOpenSelectKey}
              className="w-full p-3 flex items-center justify-between hover:bg-slate-100 transition-all border-t border-slate-100"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck size={12} className={hasApiKey ? 'text-emerald-500' : 'text-amber-500'} />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">API Ключ</span>
              </div>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${hasApiKey ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                {hasApiKey ? 'АКТИВЕН' : 'ВЫБРАТЬ'}
              </span>
            </button>

            <button 
              onClick={() => setIsLogsVisible(!isLogsVisible)}
              className="w-full p-3 flex items-center justify-between hover:bg-slate-100 transition-all"
            >
              <div className="flex items-center gap-2">
                <Clock size={12} className="text-slate-400" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Логи системы</span>
              </div>
              <div className={`transition-transform duration-200 ${isLogsVisible ? 'rotate-180' : ''}`}>
                <ChevronDown size={14} className="text-slate-400" />
              </div>
            </button>
            
            {isLogsVisible && (
              <div className="px-4 pb-4">
                <div className="space-y-2 max-h-32 overflow-y-auto font-mono text-[9px] scrollbar-thin">
                  {logs.map((log, i) => (
                    <div key={i} className={`flex justify-between border-b border-slate-100 pb-1 ${
                      log.type === 'error' ? 'text-rose-500' : 
                      log.type === 'success' ? 'text-emerald-600' : 
                      log.type === 'warning' ? 'text-amber-600' : 'text-slate-500'
                    }`}>
                      <span className="truncate pr-2">{log.action}</span>
                      <span className="whitespace-nowrap opacity-60">{log.duration > 0 ? `${log.duration}ms` : ''}</span>
                    </div>
                  ))}
                  {logs.length === 0 && <div className="text-slate-300 italic py-2">Нет активности</div>}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Toggle Sidebar Button */}
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="p-4 border-t border-slate-100 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-all"
        >
          {isSidebarCollapsed ? <ChevronRight size={20} /> : <X size={20} className="rotate-180" />}
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">
        {activePatient ? (
          <>
            {/* Header */}
            <header className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between gap-4 shrink-0 no-print">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-8 h-8 lg:w-9 lg:h-9 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 border border-slate-200 shrink-0">
                  <Users size={18} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm lg:text-base font-bold text-slate-800 truncate">
                      {activePatient.patient_meta?.name || activePatient.id}
                    </h2>
                    <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono hidden sm:inline-block">
                      ID: {activePatient.id}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] lg:text-[10px] text-slate-500 font-medium overflow-hidden">
                    {activePatient.patient_meta?.sex && (
                      <span className="shrink-0">Пол: {activePatient.patient_meta.sex}</span>
                    )}
                    {activePatient.patient_meta?.dob && (
                      <span className="shrink-0">• ДР: {activePatient.patient_meta.dob}</span>
                    )}
                    <span className="hidden md:inline">• Исслед: {activePatient.studies?.length || 0}</span>
                    <span className="hidden lg:inline bg-indigo-50 text-indigo-600 px-1.5 rounded-full font-bold ml-1">
                      ИИ: {(activePatient.studies.reduce((acc, s) => acc + (s.agentResults?.reduce((sum, r) => sum + (r.duration || 0), 0) || 0), 0) / 1000).toFixed(1)}с
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {activeTab === 'analysis' && (
                  <div className="flex items-center gap-3 mr-4 border-r border-slate-200 pr-4">
                    <div className="flex bg-slate-100 p-0.5 rounded-lg">
                      <button 
                        onClick={() => setReportLanguage('ru')}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${reportLanguage === 'ru' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        RU
                      </button>
                      <button 
                        onClick={() => setReportLanguage('en')}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${reportLanguage === 'en' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        EN
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <select 
                        value={aiModel}
                        onChange={(e) => setAiModel(e.target.value)}
                        className="bg-slate-50 border border-slate-200 text-slate-600 text-[10px] font-bold rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      >
                        {AVAILABLE_MODELS.map(m => (
                          <option key={m.id} value={(m as any).actualModel || m.id}>{m.name}</option>
                        ))}
                      </select>
                      <button 
                        onClick={() => handleGenerateAIConclusion()}
                        disabled={isGeneratingAIConclusion}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-lg text-[10px] font-bold hover:bg-amber-100 transition-all shadow-sm disabled:opacity-50"
                      >
                        {isGeneratingAIConclusion ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} className="text-amber-500" />}
                        Мнение ИИ
                      </button>
                      <button 
                        onClick={() => handleGenerateFinalConclusion(!!activePatient?.analysis?.conclusion)}
                        disabled={isAnalyzing}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition-all shadow-sm disabled:opacity-50"
                      >
                        {isAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                        {activePatient?.analysis?.conclusion ? 'Отчет' : 'Заключение'}
                      </button>
                    </div>
                  </div>
                )}

                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all shadow-sm disabled:opacity-50"
                >
                  {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  <span className="font-bold text-[10px] uppercase">Загрузить</span>
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  className="hidden" 
                  accept="image/*,application/pdf" 
                  multiple
                />
              </div>
            </header>

            {/* Queue Progress Bar */}
            {queueTotal > 0 && (
              <div className="bg-indigo-600 text-white px-4 lg:px-8 py-2 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4 flex-1 overflow-hidden">
                  <Loader2 size={16} className="animate-spin shrink-0" />
                  <span className="text-[10px] lg:text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                    Загрузка: {queueCurrent} из {queueTotal}
                  </span>
                  <div className="flex-1 h-1 lg:h-1.5 bg-indigo-400/30 rounded-full overflow-hidden max-w-[100px] sm:max-w-xs lg:max-w-md">
                    <motion.div 
                      className="h-full bg-white"
                      initial={{ width: 0 }}
                      animate={{ width: `${(queueCurrent / queueTotal) * 100}%` }}
                    />
                  </div>
                  <span className="text-[9px] lg:text-[10px] font-mono opacity-80 truncate">
                    {currentStage || 'Обработка...'}
                  </span>
                </div>
                <button 
                  onClick={() => {
                    setUploadQueue([]);
                    setQueueTotal(0);
                    setQueueCurrent(0);
                    addLog('Загрузка в очередь отменена', 0, 'warning');
                  }}
                  className="text-[9px] lg:text-[10px] font-bold uppercase hover:underline ml-4 shrink-0"
                >
                  Отмена
                </button>
              </div>
            )}

            {/* Navigation Tabs */}
            <div className="px-4 lg:px-8 bg-white border-b border-slate-200 flex gap-4 lg:gap-8 overflow-x-auto no-scrollbar shrink-0">
              {[
                { id: 'current', label: activeStudy?.name || 'Текущее', icon: Eye },
                { id: 'history', label: 'История OCT', icon: History },
                { id: 'analysis', label: 'Заключение', icon: FileText },
                { id: 'playground', label: 'Playground', icon: Cpu },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 py-4 border-b-2 transition-all font-semibold text-xs lg:text-sm whitespace-nowrap ${
                    activeTab === tab.id 
                      ? 'border-indigo-600 text-indigo-600' 
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <tab.icon size={14} className="lg:hidden" />
                  <tab.icon size={16} className="hidden lg:block" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4 lg:p-8 min-h-0">
              {/* API Key Warning/Selector */}
              {!hasApiKey && !isApiKeyChecking && (
                <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-amber-900">API ключ не выбран</h3>
                      <p className="text-xs text-amber-700">Для работы без ограничений по квотам выберите платный API ключ с подключенным биллингом.</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleOpenSelectKey}
                    className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 transition-all shadow-sm whitespace-nowrap"
                  >
                    Выбрать ключ
                  </button>
                </div>
              )}

              <AnimatePresence mode="wait">
                {activeTab === 'current' && (
                  <motion.div 
                    key="current"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="grid grid-cols-12 gap-4"
                  >
                    {activeStudy ? (
                      <>
                        <div className="col-span-12 lg:col-span-7">
                          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                  Визуализация OCT
                                </span>
                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[10px] font-bold uppercase">
                                  {activeStudy.layout?.eye ?? 'unknown'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => handleRotateStudy(activeStudy.id)}
                                  className="flex items-center gap-1.5 px-3 py-1 bg-orange-50 border border-orange-200 text-orange-600 rounded-lg text-xs font-bold hover:bg-orange-100 transition-all shadow-sm"
                                  title="Повернуть снимок на 90 градусов"
                                >
                                  <RotateCw size={14} />
                                  Повернуть
                                </button>
                                
                                {activePatient && activePatient.studies && activePatient.studies.length > 1 && (
                                  <div className="flex flex-col sm:flex-row gap-1">
                                    <button 
                                      onClick={handlePrevStudy}
                                      className="flex items-center justify-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold hover:bg-slate-200 transition-all"
                                      title="Предыдущий снимок"
                                    >
                                      <ChevronLeft size={14} />
                                      Назад
                                    </button>
                                    <button 
                                      onClick={handleNextStudy}
                                      className="flex items-center justify-center gap-1.5 px-3 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition-all shadow-sm"
                                      title="Следующий снимок"
                                    >
                                      Вперед
                                      <ChevronRight size={14} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div 
                              className="aspect-video bg-slate-950 relative group overflow-hidden flex items-center justify-center border-b border-slate-800"
                            >
                              <button 
                                onClick={() => setShowImageModal(activeStudy.imageUrl)}
                                className="absolute top-4 right-4 z-10 p-2 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-black/70"
                                title="Развернуть"
                              >
                                <Maximize2 size={18} />
                              </button>

                              {activeStudy.imageUrl.startsWith('data:application/pdf') ? (
                                <div className="relative w-full h-full flex items-center justify-center">
                                  {activeStudy.thumbnailUrl ? (
                                    <img 
                                      src={activeStudy.thumbnailUrl} 
                                      alt="PDF Preview" 
                                      className="max-w-full max-h-full object-contain opacity-50 group-hover:opacity-70 transition-all"
                                      referrerPolicy="no-referrer"
                                      style={{ transform: `rotate(${activeStudy.rotation || 0}deg)` }}
                                    />
                                  ) : (
                                    <div className="flex flex-col items-center gap-4 text-slate-500">
                                      <FileText size={64} className="opacity-20" />
                                      <span className="text-sm font-bold uppercase tracking-widest opacity-40">PDF Document</span>
                                    </div>
                                  )}
                                  
                                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all bg-black/20 backdrop-blur-[2px]">
                                    <button 
                                      onClick={() => {
                                        const win = window.open();
                                        if (win) {
                                          // Note: Rotation is not applied to the full PDF iframe as it's a native browser viewer
                                          win.document.write(`
                                            <html>
                                              <head>
                                                <title>PDF Viewer</title>
                                                <style>
                                                  body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #333; }
                                                  .container { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
                                                  iframe { border: none; width: 100%; height: 100%; }
                                                </style>
                                              </head>
                                              <body>
                                                <div class="container">
                                                  <iframe id="pdf-frame" src="${activeStudy.imageUrl}"></iframe>
                                                </div>
                                              </body>
                                            </html>
                                          `);
                                        }
                                      }}
                                      className="px-6 py-3 bg-orange-500 text-white rounded-2xl font-bold shadow-xl hover:scale-105 transition-all flex items-center gap-2"
                                    >
                                      <Eye size={18} />
                                      Открыть полный PDF
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <img 
                                  src={activeStudy.imageUrl} 
                                  alt="OCT Scan" 
                                  className="max-w-full max-h-full object-contain select-none transition-all duration-300"
                                  referrerPolicy="no-referrer"
                                  style={{ transform: `rotate(${activeStudy.rotation || 0}deg)` }}
                                />
                              )}
                            </div>

                            {/* Verification Table removed as per user request (Morphometry data) */}
                          </div>
                        </div>

                        <div className="col-span-12 lg:col-span-5 space-y-6">
                          {/* Consolidated Agent 1 Summary */}
                          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex items-center gap-2">
                                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                                  <Cpu size={20} />
                                </div>
                                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Идентификация (Agent 1)</h3>
                              </div>
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => handleRotateStudy(activeStudy.id)}
                                  className="p-2 text-orange-500 hover:bg-orange-50 rounded-lg transition-all border border-orange-100 shadow-sm bg-white"
                                  title="Повернуть снимок"
                                >
                                  <RotateCw size={16} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteStudy(activeStudy.id)}
                                  className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                  title="Удалить снимок"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <p className="text-sm text-slate-700 leading-relaxed">
                                <span className="font-bold">Исследование:</span> {activeStudy.layout?.study_type || 'н/д'}. 
                                <span className="font-bold ml-1">Тип отчета:</span> {activeStudy.layout?.report_type || 'н/д'}. 
                                <span className="font-bold ml-1">Глаз:</span> {activeStudy.layout?.eye === 'OD' ? 'Правый (OD)' : activeStudy.layout?.eye === 'OS' ? 'Левый (OS)' : activeStudy.layout?.eye === 'BOTH' ? 'Оба (OU)' : activeStudy.layout?.eye || 'н/д'}. 
                                <span className="font-bold ml-1">Прибор:</span> {activeStudy.layout?.device || 'н/д'}.
                              </p>
                              <p className="text-sm text-slate-700">
                                <span className="font-bold">Качество:</span> {activeStudy.layout?.image_quality || 0}%
                                {activeStudy.layout?.quality_explanation ? ` — ${activeStudy.layout.quality_explanation}` : ''}.
                              </p>
                              {activeStudy.clinical_quality_flag && (
                                <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
                                  <AlertTriangle size={12} />
                                  {activeStudy.clinical_quality_flag}
                                </p>
                              )}
                            </div>

                            {/* Status and Actions */}
                            <div className="mt-6 space-y-3">
                              {activeStudy.status === 'accepted' ? (
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 font-bold text-xs">
                                    <CheckCircle2 size={14} />
                                    Снимок принят
                                  </div>
                                  <button
                                    onClick={() => handleUpdateStudyStatus(activeStudy.id, 'pending_review')}
                                    className="text-[10px] text-slate-400 hover:text-indigo-600 font-bold uppercase tracking-wider"
                                  >
                                    Изменить
                                  </button>
                                </div>
                              ) : activeStudy.status === 'rejected' ? (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-700 rounded-xl border border-rose-100 font-bold text-xs">
                                      <XCircle size={14} />
                                      Снимок отклонен
                                    </div>
                                    <button
                                      onClick={() => handleUpdateStudyStatus(activeStudy.id, 'pending_review')}
                                      className="text-[10px] text-slate-400 hover:text-indigo-600 font-bold uppercase tracking-wider"
                                    >
                                      Изменить
                                    </button>
                                  </div>
                                  {activeStudy.layout?.quality_explanation && (
                                    <div className="p-3 bg-rose-50/50 border border-rose-100/50 rounded-xl text-xs text-rose-600 leading-relaxed">
                                      <span className="font-bold uppercase text-[10px] block mb-1">Причина:</span>
                                      {activeStudy.layout.quality_explanation}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 gap-3">
                                  <button
                                    onClick={() => handleUpdateStudyStatus(activeStudy.id, 'accepted')}
                                    className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 font-bold hover:bg-emerald-100 transition-all"
                                  >
                                    <Check size={18} />
                                    Принять
                                  </button>
                                  <button
                                    onClick={() => handleUpdateStudyStatus(activeStudy.id, 'rejected')}
                                    className="flex items-center justify-center gap-2 px-4 py-3 bg-rose-50 text-rose-700 rounded-xl border border-rose-100 font-bold hover:bg-rose-100 transition-all"
                                  >
                                    <X size={18} />
                                    Отклонить
                                  </button>
                                </div>
                              )}
                              
                              <div className="space-y-3">
                                {activeStudy.status === 'accepted' && (
                                  <button
                                    onClick={() => handleReAnalyzeStudy(activeStudy)}
                                    disabled={isAnalyzing}
                                    className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                                  >
                                    {isAnalyzing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                                    Анализ снимка
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Early Glaucoma Suspicion (New) */}
                          {activeStudy.earlySuspicion && activeStudy.earlySuspicion.risk_level !== 'UNKNOWN' && (
                            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm overflow-hidden relative">
                              <div className={`absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 rounded-full opacity-10 ${
                                activeStudy.earlySuspicion.risk_level === 'HIGH' ? 'bg-rose-500' :
                                activeStudy.earlySuspicion.risk_level === 'SUSPICIOUS' ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}></div>
                              
                              <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <Activity size={16} className="text-indigo-600" />
                                Стратификация риска (Early Warning)
                              </h3>

                              <div className="flex items-center justify-between mb-6">
                                <div>
                                  <div className={`text-2xl font-black tracking-tighter ${
                                    activeStudy.earlySuspicion.risk_level === 'HIGH' ? 'text-rose-600' :
                                    activeStudy.earlySuspicion.risk_level === 'SUSPICIOUS' ? 'text-amber-600' : 'text-emerald-600'
                                  }`}>
                                    {activeStudy.earlySuspicion.risk_level === 'HIGH' ? 'ВЫСОКИЙ РИСК' :
                                     activeStudy.earlySuspicion.risk_level === 'SUSPICIOUS' ? 'ПОДОЗРИТЕЛЬНО' : 'НИЗКИЙ РИСК'}
                                  </div>
                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                    Вероятность паттерна: {Math.round(activeStudy.earlySuspicion.confidence * 100)}%
                                  </div>
                                </div>
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                                  activeStudy.earlySuspicion.risk_level === 'HIGH' ? 'bg-rose-50 text-rose-600' :
                                  activeStudy.earlySuspicion.risk_level === 'SUSPICIOUS' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                                }`}>
                                  <AlertTriangle size={24} />
                                </div>
                              </div>

                              {activeStudy.earlySuspicion.early_signs.length > 0 && (
                                <div className="space-y-2 mb-4">
                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Выявленные маркеры:</div>
                                  <div className="flex flex-wrap gap-2">
                                    {activeStudy.earlySuspicion.early_signs.map((sign, idx) => (
                                      <span key={idx} className="px-2 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-semibold border border-slate-200">
                                        {sign}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Рекомендация системы:</div>
                                <p className="text-xs text-slate-700 font-medium leading-relaxed">
                                  {activeStudy.earlySuspicion.requires_followup 
                                    ? "Требуется динамическое наблюдение и сопоставление с полем зрения (Периметрия)."
                                    : "Критических структурных изменений не выявлено. Плановый осмотр."}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Specific Data Sections */}
                          <ClinicalAnalysisVerification study={activeStudy} />

                          {/* Normalizer Debug Info */}

                          {/* Normalizer Debug Info */}
                          {activeStudy.normalized?.debug && (
                            <div className="bg-slate-900 rounded-2xl p-6 shadow-sm text-slate-300 font-mono text-[10px] mt-4">
                              <h3 className="text-xs font-bold text-white mb-4 flex items-center gap-2">
                                <ShieldCheck size={16} className="text-emerald-500" />
                                Normalizer Debug (Agent 2.1)
                              </h3>
                              <div className="space-y-2">
                                <div className="flex justify-between border-b border-slate-800 pb-1">
                                  <span>Input Count (OD/OS)</span>
                                  <span className="text-white">
                                    {activeStudy.normalized.debug.OD_input_count ?? 0} / {activeStudy.normalized.debug.OS_input_count ?? 0}
                                  </span>
                                </div>
                                <div className="flex justify-between border-b border-slate-800 pb-1">
                                  <span>Mapped Count (OD/OS)</span>
                                  <span className="text-white">
                                    {activeStudy.normalized.debug.OD_mapped_count ?? 0} / {activeStudy.normalized.debug.OS_mapped_count ?? 0}
                                  </span>
                                </div>
                                {((activeStudy.normalized.debug.OD_unmapped?.length || 0) > 0 || (activeStudy.normalized.debug.OS_unmapped?.length || 0) > 0) && (
                                  <div className="pt-2">
                                    <div className="text-amber-500 mb-1">Unmapped Fields:</div>
                                    <div className="max-h-20 overflow-y-auto">
                                      {activeStudy.normalized.debug.OD_unmapped?.map((f: string, i: number) => (
                                        <div key={`od-${f}-${i}`} className="text-slate-500">OD: {f}</div>
                                      ))}
                                      {activeStudy.normalized.debug.OS_unmapped?.map((f: string, i: number) => (
                                        <div key={`os-${f}-${i}`} className="text-slate-500">OS: {f}</div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Call to Action for Clinical Diagnosis */}
                          <div className="bg-indigo-600 rounded-2xl p-6 shadow-lg shadow-indigo-100 text-white">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="p-2 bg-white/20 rounded-lg">
                                <TrendingUp size={20} />
                              </div>
                              <h3 className="font-bold">Клиническая диагностика</h3>
                            </div>
                            <p className="text-xs text-indigo-100 mb-6 leading-relaxed">
                              Соберите несколько снимков для получения "Второго мнения" от ИИ на основе всех данных пациента.
                            </p>
                            <button 
                              onClick={() => handleGenerateFinalConclusion(!!activePatient?.analysis?.conclusion)}
                              disabled={isAnalyzing || !activePatient.studies.some(s => s.status === 'accepted')}
                              className="w-full py-3 bg-white text-indigo-600 rounded-xl font-bold text-sm hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border border-indigo-100 shadow-md"
                            >
                              {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                              {activePatient?.analysis?.conclusion ? 'Отчет' : 'Заключение'}
                            </button>
                          </div>


                          {/* Agent System Status */}
                          <div className="bg-slate-900 rounded-2xl p-6 shadow-lg">
                            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                              <Cpu size={16} className="text-indigo-400" />
                              Система агентов
                            </h3>
                            <div className="space-y-2">
                              {(() => {
                                const patientLevelAgents = [
                                  'conclusion', 
                                  'explain', 
                                  'reasoning', 
                                  'dataset_completeness_agent',
                                  'master_aggregator',
                                  'clinical_analyzer',
                                  'clinical_analyzer_final',
                                  'confidence',
                                  'trust',
                                  'orchestrate_patient_analysis'
                                ];
                                
                                // Combine study agents and patient agents for a complete view
                                const studyAgents = activeStudy.agentResults || [];
                                const patientAgents = activePatient?.analysis?.agentResults || [];
                                
                                // Filter out patient-level agents that might have leaked into study results
                                const filteredStudyAgents = studyAgents.filter(a => !patientLevelAgents.includes(a.agentName));
                                
                                const allAgents = [...filteredStudyAgents, ...patientAgents];
                                
                                return allAgents.map((agent, i) => {
                                  const isPatientLevel = patientLevelAgents.includes(agent.agentName);
                                  const isDeterministic = [
                                    'rnfl_analyzer', 
                                    'macula_analyzer', 
                                    'quality_analyzer', 
                                    'master_aggregator', 
                                    'clinical_analyzer_final'
                                  ].includes(agent.agentName);
                                  
                                  return (
                                    <div key={i} className={`flex items-center justify-between p-2.5 rounded-xl border ${
                                      isPatientLevel 
                                        ? 'bg-orange-500/10 border-orange-500/20 shadow-sm shadow-orange-500/10' 
                                        : 'bg-emerald-500/10 border-emerald-500/20 shadow-sm shadow-emerald-500/10'
                                    }`}>
                                      <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${
                                          agent.status === 'success' 
                                            ? (isPatientLevel ? 'bg-orange-400' : 'bg-emerald-500') 
                                            : 'bg-rose-500 animate-pulse'
                                        }`}></div>
                                        <div className="flex flex-col">
                                          <span className={`text-[10px] font-mono uppercase font-black tracking-tighter ${isPatientLevel ? 'text-orange-400' : 'text-emerald-500'}`}>
                                            {agent.agentName}
                                          </span>
                                          <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className={`text-[8px] font-bold uppercase px-1 rounded ${isPatientLevel ? 'bg-orange-500/20 text-orange-300' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                              {isPatientLevel ? 'SERIES' : 'SCAN'}
                                            </span>
                                            {isDeterministic && <span className="text-[8px] bg-indigo-500/20 text-indigo-300 px-1 rounded font-bold">RULES</span>}
                                          </div>
                                        </div>
                                      </div>
                                      <span className="text-slate-500 font-mono text-[9px] font-bold">{agent.duration}ms</span>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="col-span-12 flex flex-col items-center justify-center py-20 text-slate-400">
                        <Upload size={48} className="mb-4 opacity-20" />
                        <p className="text-lg font-medium">Нет данных для этого пациента</p>
                        <p className="text-sm">Загрузите OCT скан для начала анализа</p>
                      </div>
                    )}
                  </motion.div>
                )}

                {activeTab === 'history' && (
                  <motion.div 
                    key="history"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-4"
                  >
                    {activePatient.studies && activePatient.studies.length > 0 && (
                      <div className="flex flex-col md:flex-row gap-4 mb-4">
                        {/* Study Navigation Arrows */}
                        <div className="flex items-center gap-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">

                          <div className="flex-1 min-w-[200px]">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Текущий выбор:</p>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${activeStudy?.layout?.eye === 'OD' ? 'bg-blue-500' : 'bg-rose-500'}`}></div>
                              <span className="text-sm font-bold text-slate-700 truncate">
                                {activeStudy?.layout?.study_type || 'Исследование'} • {activeStudy?.layout?.eye || 'OU'}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-1">
                              {activeStudy?.timestamp ? new Date(activeStudy.timestamp).toLocaleString() : 'Дата неизвестна'}
                            </p>
                          </div>
                          <button 
                            onClick={() => setActiveTab('current')}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-md flex items-center gap-2"
                          >
                            <Eye size={14} />
                            Открыть
                          </button>
                        </div>

                        <div className="flex-1 flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                          <div className="flex items-center gap-3">
                            <input 
                              type="checkbox" 
                              checked={selectedStudyIds.length === (activePatient.studies?.length || 0) && (activePatient.studies?.length || 0) > 0}
                              onChange={handleSelectAllStudies}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span className="text-sm font-bold text-slate-600">
                              Выбрано: {selectedStudyIds.length}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={handleBulkReAnalyze}
                              disabled={selectedStudyIds.length === 0 || isAnalyzing}
                              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-sm disabled:opacity-50 text-xs font-bold"
                            >
                              <RefreshCw size={14} className={isAnalyzing ? 'animate-spin' : ''} />
                              Анализировать выбранные
                            </button>
                            <button 
                              onClick={handleBulkDelete}
                              disabled={selectedStudyIds.length === 0}
                              className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl hover:bg-rose-100 transition-all disabled:opacity-50 text-xs font-bold"
                            >
                              <Trash2 size={14} />
                              Удалить
                            </button>
                            </div>
                          </div>
                        </div>
                    )}

                    {activePatient.studies?.filter(s => s.type === 'OCT').map((study, i) => {
                      const isRNFL = study.layout?.report_type === "RNFL";
                      const requiredAgents = isRNFL 
                        ? ['layout_classifier', 'universal_extractor', 'normalizer', 'quality_control', 'clinical_analyzer']
                        : ['layout_classifier', 'universal_extractor', 'normalizer', 'quality_control'];
                      const successfulAgents = study.agentResults?.filter(r => r.status === 'success').map(r => r.agentName) || [];
                      const isIncomplete = !requiredAgents.every(agent => successfulAgents.includes(agent));
                      const isInsufficient = study.layout?.report_type === "BSCAN";
                      const isProcessed = successfulAgents.length > 0;

                      return (
                        <div key={study.id} className={`bg-white rounded-2xl border ${isIncomplete ? 'border-amber-200 bg-amber-50/10' : 'border-slate-200'} p-4 flex items-center gap-4 hover:shadow-md transition-all group relative overflow-hidden`}>
                          {/* Selection Checkbox */}
                          <div className="flex items-center justify-center shrink-0">
                            <input 
                              type="checkbox" 
                              checked={selectedStudyIds.includes(study.id)}
                              onChange={() => handleToggleStudySelection(study.id)}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                          </div>

                          {/* Processing Status Indicator */}
                          <div className={`absolute top-0 left-0 w-1 h-full ${isProcessed ? (isIncomplete ? 'bg-amber-400' : 'bg-emerald-400') : 'bg-slate-200'}`} />
                          
                          <div className="w-24 h-24 bg-slate-900 rounded-xl overflow-hidden shrink-0 border border-slate-200 flex items-center justify-center">
                            {study.thumbnailUrl ? (
                              <img src={study.thumbnailUrl} alt="Thumbnail" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />
                            ) : study.imageUrl.startsWith('data:application/pdf') ? (
                              <div className="flex flex-col items-center gap-1 text-slate-400">
                                <FileText size={32} />
                                <span className="text-[8px] font-bold uppercase">PDF Document</span>
                              </div>
                            ) : (
                              <img 
                                src={study.imageUrl} 
                                alt="Scan" 
                                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" 
                                referrerPolicy="no-referrer" 
                              />
                            )}
                          </div>
                          <div className="flex-1 flex flex-col justify-center gap-2">
                            <div className="flex items-center gap-4">
                              <div className="flex flex-col">
                                <h4 className="font-bold text-slate-800 text-sm">{study.name || `Исслед. #${study.id.slice(-4)}`}</h4>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">Дата снимка</span>
                                  <input 
                                    type="date" 
                                    className="text-[10px] text-slate-600 font-bold bg-transparent border-none p-0 focus:ring-0 cursor-pointer hover:text-indigo-600 transition-colors"
                                    defaultValue={formatDateForInput(study.examDate || study.timestamp)}
                                    onChange={(e) => handleUpdateStudyDate(study.id, e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {study.status === 'accepted' && (
                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-bold uppercase">
                                    Принят
                                  </span>
                                )}
                                {study.status === 'rejected' && (
                                  <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-[9px] font-bold uppercase">
                                    Отклонен
                                  </span>
                                )}
                                {study.status === 'pending_review' && (
                                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-bold uppercase">
                                    Ожидает проверки
                                  </span>
                                )}

                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${isProcessed ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                                  {isProcessed ? 'ОБРАБОТАНО' : 'НЕ ОБРАБОТАНО'}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              {study.status === 'accepted' && study.agentResults?.length === 1 && (
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleRunFullAnalysis(study); }}
                                  className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-sm"
                                  title="Анализ"
                                  disabled={isAnalyzing}
                                >
                                  <Play size={14} />
                                </button>
                              )}
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleReAnalyzeStudy(study); }}
                                className="p-1.5 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg transition-all"
                                title="Повторный анализ"
                                disabled={isAnalyzing}
                              >
                                <RefreshCw size={14} className={analyzingStudyId === study.id ? 'animate-spin' : ''} />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleUpdateStudyStatus(study.id, 'accepted'); }}
                                className={`p-1.5 rounded-lg transition-all shadow-sm border ${study.status === 'accepted' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100'}`}
                                title="Принять"
                              >
                                <Check size={14} />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleUpdateStudyStatus(study.id, 'rejected'); }}
                                className={`p-1.5 rounded-lg transition-all shadow-sm border ${study.status === 'rejected' ? 'bg-rose-600 text-white border-rose-600' : 'bg-rose-50 text-rose-600 border-rose-100 hover:bg-rose-100'}`}
                                title="Отклонить"
                              >
                                <X size={14} />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteStudy(study.id); }}
                                className="p-1.5 bg-slate-50 text-slate-500 rounded-lg transition-all shadow-sm border border-slate-200 hover:bg-slate-100"
                                title="Удалить исследование"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          {/* Vertical transition button */}
                          <button 
                            onClick={(e) => { e.stopPropagation(); setActiveStudyId(study.id); setActiveTab('current'); }}
                            className="self-stretch w-10 -my-4 -mr-4 bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 transition-all rounded-r-2xl group-hover:w-14 duration-300"
                            title="Перейти к снимку"
                          >
                            <ChevronRight size={24} />
                          </button>
                        </div>
                      );
                    })}
                  </motion.div>
                )}

                {activeTab === 'additional' && (
                  <motion.div 
                    key="additional"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="max-w-6xl mx-auto space-y-6"
                  >
                    <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
                      <h2 className="text-2xl font-bold text-slate-800 mb-2">Дополнительные исследования</h2>
                      <p className="text-slate-500 text-sm mb-8">Здесь отображаются все исследования, кроме OCT (Периметрия, Фундус-снимки и др.)</p>
                      
                      <div className="space-y-4">
                        {activePatient.studies?.filter(s => s.type !== 'OCT').map((study, i) => (
                          <div key={study.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-white rounded-xl border border-slate-200 flex items-center justify-center text-slate-400">
                                {study.type === 'PERIMETRY' ? <Activity size={24} /> : <Eye size={24} />}
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-800">{study.name || `Исслед. #${study.id.slice(-4)}`}</h4>
                                <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">{study.type} • {new Date(study.timestamp).toLocaleDateString()}</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => {
                                setActiveStudyId(study.id);
                                setActiveTab('current');
                              }}
                              className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-sm"
                            >
                              Открыть
                            </button>
                          </div>
                        ))}
                        {activePatient.studies?.filter(s => s.type !== 'OCT').length === 0 && (
                          <div className="py-12 text-center text-slate-400 italic">Нет дополнительных исследований</div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'analysis' && (
                  <motion.div 
                    key="analysis"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="w-full px-0"
                  >
                    {/* Dataset Completeness Strip */}
                    {activePatient?.analysis && !isAnalyzing && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white border-b border-slate-200 p-4 mb-0 flex items-center gap-6 relative z-20 w-full"
                      >
                        <div className="flex items-center gap-3 shrink-0 px-4">
                          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Проверка полноты данных</h3>
                          <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                            (activePatient.analysis.completeness?.score || 0) > 70 ? 'bg-emerald-50 text-emerald-600' :
                            (activePatient.analysis.completeness?.score || 0) > 40 ? 'bg-amber-50 text-amber-600' :
                            'bg-rose-50 text-rose-600'
                          }`}>
                            {activePatient.analysis.completeness?.score || 0}%
                          </span>
                        </div>
                        
                        <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div 
                            className={`h-full ${(activePatient.analysis.completeness?.score || 0) > 70 ? 'bg-emerald-500' : (activePatient.analysis.completeness?.score || 0) > 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${activePatient.analysis.completeness?.score || 0}%` }}
                          />
                        </div>

                        <div className="px-4 shrink-0">
                          <button 
                            onClick={() => {
                              setClinicalFormData({
                                iop_od: activePatient.studies[0]?.clinical?.iop_od || 16,
                                iop_os: activePatient.studies[0]?.clinical?.iop_os || 16,
                                family_history: activePatient.studies[0]?.clinical?.family_history || false,
                                dob: activePatient.patient_meta?.dob || ''
                              });
                              setShowClinicalForm(true);
                            }}
                            className="px-8 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-indigo-700 transition-all shadow-md"
                          >
                            Уточнить клинические данные
                          </button>
                        </div>
                      </motion.div>
                    )}

                    <div className="w-full max-w-full">
                      <div className={activePatient?.analysis && !isAnalyzing ? "flex flex-col w-full" : "w-full"}>
                        {activePatient?.analysis && !isAnalyzing && (
                          <div className="w-full">
                            {/* Main Analysis Grid (Logical Report + AI Opinion Side by Side) */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border-b border-slate-200 min-h-[70vh]">
                              
                              {/* Left Column: Logical Agent Report (The "Report") */}
                              <div className="bg-white border-r border-slate-200">
                                <div className="p-6 md:p-10 space-y-10">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100">
                                        <FileText size={20} />
                                      </div>
                                      <div>
                                        <h2 className="text-xl font-bold text-slate-800">Заключение Агента</h2>
                                        <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest">Аналитическая логика v4.0</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button 
                                        onClick={handlePrintLogicalConclusion}
                                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-md active:scale-95"
                                      >
                                        <Printer size={14} />
                                        <span>Печать</span>
                                      </button>
                                      <button 
                                        onClick={() => {
                                          setPatients(prev => prev.map(p => {
                                            if (p.id !== activePatient.id) return p;
                                            const newAnalysis = { ...p.analysis };
                                            delete newAnalysis.conclusion;
                                            return { ...p, analysis: newAnalysis };
                                          }));
                                        }}
                                        className="p-2 text-slate-400 hover:text-rose-500 transition-all rounded-lg hover:bg-rose-50"
                                        title="Удалить заключение"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  </div>

                                  {activePatient.analysis.conclusion ? (
                                    <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-700">
                                      {/* 1. Detailed Report */}
                                      <div className="space-y-3">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Полный аналитический отчет</h4>
                                        <div className="text-sm text-slate-700 leading-[1.6] prose-clinical max-w-none prose-p:mb-3 bg-white p-6 rounded-2xl border border-slate-50 shadow-sm">
                                          <ReactMarkdown>{activePatient.analysis.conclusion.conclusion_text}</ReactMarkdown>
                                        </div>
                                      </div>

                                      {/* 3. Recommendations - Now Last */}
                                      <div className="bg-indigo-50/30 p-5 rounded-2xl border border-indigo-100">
                                        <div className="flex items-center gap-2 mb-2">
                                          <Target size={14} className="text-indigo-600" />
                                          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Рекомендации</h4>
                                        </div>
                                        <p className="text-sm text-slate-800 font-bold leading-relaxed pr-4">
                                          {activePatient.analysis.conclusion.recommendations}
                                        </p>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="py-20 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                                      <p className="text-slate-400 text-sm italic">Заключение еще не сформировано</p>
                                      <button 
                                        onClick={() => handleGenerateFinalConclusion()}
                                        className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all"
                                      >
                                        СФОРМИРОВАТЬ ОТЧЕТ
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Right Column: AI Opinion */}
                              <div className="bg-[#fdfcf5] p-6 md:p-10 border-l border-amber-100/30">
                                {isGeneratingAIConclusion ? (
                                  <div className="flex flex-col items-center justify-center py-24">
                                    <Loader2 size={40} className="text-amber-600 animate-spin mb-4" />
                                    <h3 className="text-lg font-bold text-amber-900">Анализ клинических признаков...</h3>
                                    <p className="text-amber-700/60 text-sm italic">Агент ИИ формирует независимое мнение</p>
                                  </div>
                                ) : activePatient.analysis?.aiOpinion ? (
                                  <div className="space-y-8 max-w-4xl mx-auto">
                                    <div className="flex items-center justify-between bg-white/40 p-4 rounded-2xl border border-white/60 shadow-sm">
                                      <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl shadow-sm border border-amber-200/50">
                                          <Zap size={20} />
                                        </div>
                                        <div>
                                          <h3 className="text-lg font-bold text-slate-800">Мнение ИИ</h3>
                                          <p className="text-[10px] text-amber-600 font-bold uppercase tracking-[0.2em]">Alpha Agent v2.5</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <button 
                                          onClick={handlePrintAIOpinion}
                                          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 transition-all shadow-md active:scale-95"
                                        >
                                          <Printer size={14} />
                                          <span>Печать</span>
                                        </button>
                                        <button 
                                          onClick={() => {
                                            setPatients(prev => prev.map(p => {
                                              if (p.id !== activePatient.id) return p;
                                              const newAnalysis = { ...p.analysis };
                                              delete newAnalysis.aiOpinion;
                                              return { ...p, analysis: newAnalysis };
                                            }));
                                          }}
                                          className="p-2.5 text-slate-400 hover:text-rose-500 transition-all rounded-lg hover:bg-rose-50 border border-transparent hover:border-rose-100"
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      </div>
                                    </div>

                                    {/* 2 Stacks: Report -> Recommendations */}
                                    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-700">
                                      {/* 1. Full Report */}
                                      <div className="bg-white p-8 lg:p-10 rounded-[2.5rem] border border-amber-200 shadow-xl shadow-amber-900/5 relative">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 mb-6 px-1">Обоснование ИИ</h4>
                                        <div className="text-[15px] text-slate-700 leading-[1.8] prose-clinical max-w-none prose-p:mb-5">
                                          <ReactMarkdown>{activePatient.analysis.aiOpinion.conclusion_text}</ReactMarkdown>
                                        </div>
                                      </div>

                                      {/* 2. Recommendations */}
                                      <div className="bg-amber-100/40 p-7 rounded-[2rem] border border-amber-200/60 shadow-inner">
                                        <div className="flex items-center gap-2 mb-4">
                                          <Target size={14} className="text-amber-700" />
                                          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">Тактика и рекомендации</h4>
                                        </div>
                                        <p className="text-[15px] text-amber-950 font-bold leading-relaxed">
                                          {activePatient.analysis.aiOpinion.recommendations}
                                        </p>
                                      </div>
                                    </div>
                                    
                                    <div className="bg-amber-100/20 p-4 rounded-2xl border border-amber-200/30 flex items-start gap-3 mt-8">
                                      <ShieldAlert size={16} className="text-amber-500 shrink-0 mt-0.5" />
                                      <p className="text-[10px] text-amber-800/60 font-medium italic">
                                        Данный анализ сформирован ИИ и требует верификации врачом. Glaucoma Lab v2.5 не несет ответственности за клинические решения.
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center justify-center py-20 bg-white/40 border-2 border-dashed border-amber-200 rounded-[2.5rem] mt-10">
                                    <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-8 border border-amber-100">
                                      <Zap size={40} className="text-amber-200" />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-400 mb-6">Мнение ИИ не сформировано</h3>
                                    <button 
                                      onClick={handleGenerateAIConclusion}
                                      className="px-10 py-4 bg-amber-600 text-white rounded-2xl font-bold hover:bg-amber-700 transition-all shadow-[0_10px_30px_-10px_rgba(217,119,6,0.5)] active:scale-95 flex items-center gap-3"
                                    >
                                      <Zap size={18} />
                                      СФОРМИРОВАТЬ МНЕНИЕ ИИ
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Summary clinical result (Legacy fallback) */}
                        <div className="hidden">
                          {isAnalyzing ? <div /> : <div />}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
                {activeTab === 'playground' && (
                  <motion.div
                    key="playground"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-8"
                  >
                    <div className="grid grid-cols-12 gap-8">
                      <div className="col-span-12 lg:col-span-4 space-y-6">
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Cpu size={16} className="text-indigo-600" />
                            Агенты ИИ
                          </h3>
                          <div className="space-y-2">
                            {[
                              { id: 'layout', name: 'Layout Classifier', icon: Layout, type: 'single' },
                              { id: 'extractor', name: 'Universal Extractor', icon: Table, type: 'single' },
                              { id: 'normalizer', name: 'Normalizer', icon: Hash, type: 'single' },
                              { id: 'quality', name: 'Quality Control (QC)', icon: ShieldCheck, type: 'single' },
                              { id: 'rnfl_analyzer', name: 'RNFL Analyzer', icon: Activity, type: 'single' },
                              { id: 'macula_analyzer', name: 'Macula Analyzer', icon: Activity, type: 'single' },
                              { id: 'onh_analyzer', name: 'ONH Analyzer', icon: Activity, type: 'single' },
                              { id: 'quality_analyzer', name: 'Data Quality Analyzer', icon: ShieldAlert, type: 'single' },
                              { id: 'clinical_analyzer', name: 'Clinical Analyzer (Scan)', icon: Activity, type: 'single' },
                              { id: 'master_aggregator', name: 'Master Aggregator', icon: GitMerge, type: 'patient' },
                              { id: 'clinical_analyzer_final', name: 'Clinical Core (Deterministic Rules)', icon: Zap, type: 'patient' },
                              { id: 'confidence', name: 'Confidence Analyzer', icon: Target, type: 'patient' },
                              { id: 'trust', name: 'Trust Layer', icon: Shield, type: 'patient' },
                              { id: 'conclusion', name: 'Conclusion Builder', icon: FileText, type: 'patient' },
                              { id: 'explain', name: 'Explain Agent', icon: MessageSquare, type: 'patient' },
                            ].map((agent) => (
                              <button
                                key={agent.id}
                                onClick={() => handleRunSingleAgent(agent.id)}
                                disabled={isAnalyzing || !activeStudy}
                                className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between group ${
                                  runningAgentId === agent.id 
                                    ? (agent.type === 'single' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-orange-50 border-orange-200 text-orange-700')
                                    : 'bg-slate-50 border-slate-100 text-slate-600 hover:border-slate-300'
                                } disabled:opacity-50 relative overflow-hidden`}
                              >
                                {agent.type === 'single' ? (
                                  <div className="absolute top-0 right-0 w-12 h-12 -mr-6 -mt-6 bg-emerald-500/5 rounded-full" />
                                ) : (
                                  <div className="absolute top-0 right-0 w-12 h-12 -mr-6 -mt-6 bg-orange-500/5 rounded-full" />
                                )}
                                <div className="flex items-center gap-3 relative z-10">
                                  <agent.icon size={16} className={
                                    runningAgentId === agent.id 
                                      ? (agent.type === 'single' ? 'text-emerald-600' : 'text-orange-600') 
                                      : (agent.type === 'single' ? 'text-emerald-400 group-hover:text-emerald-600' : 'text-orange-400 group-hover:text-orange-600')
                                  } />
                                  <span className="text-xs font-bold">{agent.name}</span>
                                </div>
                                {runningAgentId === agent.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${agent.type === 'single' ? 'text-emerald-600 bg-emerald-100/50' : 'text-orange-600 bg-orange-100/50'}`}>
                                      {agent.type === 'single' ? 'SCAN' : 'SERIES'}
                                    </span>
                                    <Play size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Cpu size={16} className="text-indigo-600" />
                            Параметры ИИ
                          </h3>
                          <div className="space-y-4">
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">
                                Модель ИИ
                              </label>
                              <select
                                value={selectedModel}
                                onChange={(e) => setSelectedModel(e.target.value)}
                                className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                              >
                                {AVAILABLE_MODELS.map(model => (
                                  <option key={model.id} value={model.id}>{model.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <RefreshCw size={16} className="text-indigo-600" />
                            Сброс данных
                          </h3>
                          <button
                            onClick={() => {
                              setDeleteConfirm({ type: 'all', id: 'all', title: 'Удалить ВСЕХ пациентов и все их данные?' });
                            }}
                            className="w-full py-3 px-4 bg-rose-50 text-rose-600 rounded-xl font-bold text-sm hover:bg-rose-100 transition-all flex items-center justify-center gap-2"
                          >
                            <Trash2 size={16} />
                            Очистить всё
                          </button>
                        </div>
                      </div>

                      <div className="col-span-12 lg:col-span-8">
                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm h-full flex flex-col">
                          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50">
                            <div className="flex flex-col gap-1">
                              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Результаты агентов (Raw JSON)</span>
                              {activeStudy && (
                                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                  <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">ID: {activeStudy.id}</span>
                                  <span>•</span>
                                  <span>{new Date(activeStudy.timestamp).toLocaleString()}</span>
                                  <span>•</span>
                                  <span className="text-indigo-600 font-bold">
                                    Total AI Time: {(activeStudy.agentResults?.reduce((sum, r) => sum + (r.duration || 0), 0) || 0)}ms
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              {activePatient && activePatient.studies.length > 1 && (
                                <select 
                                  value={activeStudyId || activePatient.studies[0]?.id}
                                  onChange={(e) => setActiveStudyId(e.target.value)}
                                  className="text-[10px] font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500/20"
                                >
                                  {activePatient.studies.map(s => (
                                    <option key={s.id} value={s.id}>
                                      {new Date(s.timestamp).toLocaleDateString()} - {s.id}
                                    </option>
                                  ))}
                                </select>
                              )}
                              <div className="flex gap-2">
                                {activeStudy?.agentResults && activeStudy.agentResults.length > 0 && (
                                  <>
                                    <button 
                                      onClick={() => {
                                        if (!activeStudy || !activePatientId) return;
                                        setPatients(prev => prev.map(p => 
                                          p.id === activePatientId 
                                            ? { 
                                                ...p, 
                                                studies: p.studies.map(s => s.id === activeStudy.id 
                                                  ? { ...s, agentResults: [] } 
                                                  : s) 
                                              } 
                                            : p
                                        ));
                                        addLog('Результаты агентов очищены', 0, 'info');
                                      }}
                                      className="px-2 py-1 text-rose-400 hover:text-rose-600 transition-all flex items-center gap-1 border border-rose-100 rounded-lg hover:bg-rose-50"
                                      title="Очистить результаты"
                                    >
                                      <Trash2 size={14} />
                                      <span className="text-[9px] font-bold">CLEAR</span>
                                    </button>
                                    <button 
                                      onClick={downloadReadableReport}
                                      className="px-2 py-1 text-slate-400 hover:text-indigo-600 transition-all flex items-center gap-1 border border-slate-200 rounded-lg hover:bg-indigo-50"
                                      title="Скачать полный отчет (Readable)"
                                    >
                                      <Download size={14} />
                                      <span className="text-[9px] font-bold">REPORT</span>
                                    </button>
                                    <button 
                                      onClick={() => {
                                        const blob = new Blob([JSON.stringify(activeStudy.agentResults, null, 2)], { type: 'application/json' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `agent_results_${activeStudy.id}.json`;
                                        a.click();
                                      }}
                                      className="px-2 py-1 text-slate-400 hover:text-indigo-600 transition-all flex items-center gap-1 border border-slate-200 rounded-lg hover:bg-indigo-50"
                                      title="Скачать JSON"
                                    >
                                      <Download size={14} />
                                      <span className="text-[9px] font-bold">JSON</span>
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div 
                            ref={jsonResultsRef}
                            className="flex-1 p-6 overflow-y-auto font-mono text-[10px] bg-slate-900 text-slate-300 relative scroll-smooth"
                          >
                            {isAnalyzing && (
                              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center z-10">
                                <div className="flex flex-col items-center gap-3">
                                  <Loader2 size={32} className="animate-spin text-indigo-500" />
                                  <span className="text-xs font-bold text-indigo-400 animate-pulse">Агент работает...</span>
                                </div>
                              </div>
                            )}
                            {(() => {
                              const patientLevelAgents = [
                                'conclusion', 
                                'explain', 
                                'reasoning', 
                                'dataset_completeness_agent',
                                'master_aggregator',
                                'clinical_analyzer',
                                'clinical_analyzer_final',
                                'confidence',
                                'trust',
                                'orchestrate_patient_analysis'
                              ];
                              const scanResults = activeStudy?.agentResults || [];
                              const seriesResults = activePatient?.analysis?.agentResults || [];
                              
                              // 🔧 ФИКС: Оставляем только ПОСЛЕДНИЙ результат для каждого уникального агента
                              const latestAgents = new Map<string, any>();
                              [...scanResults, ...seriesResults].forEach(r => {
                                const current = latestAgents.get(r.agentName);
                                if (!current || r.timestamp > current.timestamp) {
                                  latestAgents.set(r.agentName, r);
                                }
                              });

                              const allResults = Array.from(latestAgents.values()).sort((a, b) => b.timestamp - a.timestamp);
                              
                              if (allResults.length > 0) {
                                return (
                                  <div className="space-y-8">
                                    {allResults.map((result, idx) => (
                                      <div key={`${result.agentName}-${idx}`} className={`border-l-2 pl-4 py-2 ${
                                        patientLevelAgents.includes(result.agentName) 
                                          ? 'border-orange-500/50 bg-orange-500/5' 
                                          : 'border-emerald-500/50 bg-emerald-500/5'
                                      }`}>
                                        <div className="flex justify-between items-center mb-4">
                                          <div className="flex items-center gap-3">
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                              result.status === 'success' 
                                                ? (patientLevelAgents.includes(result.agentName) ? 'bg-orange-500/20 text-orange-400' : 'bg-emerald-500/20 text-emerald-400')
                                                : 'bg-rose-500/20 text-rose-400'
                                            }`}>
                                              {result.agentName} {patientLevelAgents.includes(result.agentName) ? '(SERIES)' : '(SCAN)'}
                                            </span>
                                            <span className="text-slate-500 text-[9px]">
                                              {new Date(result.timestamp).toLocaleTimeString()}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <button
                                              onClick={() => {
                                                navigator.clipboard.writeText(JSON.stringify(result.output, null, 2));
                                                addLog(`JSON агента ${result.agentName} скопирован`, 0, 'info');
                                              }}
                                              className="p-1 text-slate-500 hover:text-indigo-400 transition-all"
                                              title="Копировать JSON"
                                            >
                                              <Copy size={12} />
                                            </button>
                                            <span className="text-indigo-400 text-[9px] font-bold">{result.duration}ms</span>
                                          </div>
                                        </div>
                                        <pre className="whitespace-pre-wrap break-all leading-relaxed">
                                          {JSON.stringify(result.output, null, 2)}
                                        </pre>
                                      </div>
                                    ))}
                                  </div>
                                );
                              }
                              
                              return (
                                <div className="h-full flex flex-col items-center justify-center text-slate-600 italic">
                                  <Cpu size={48} className="mb-4 opacity-10" />
                                  Запустите агента, чтобы увидеть результат
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <div className="w-24 h-24 bg-slate-100 rounded-3xl flex items-center justify-center mb-6 border border-slate-200">
              <Users size={48} className="opacity-20" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Welcome to Glaucoma Lab</h2>
            <p className="max-w-md text-center text-slate-500">
              Select a patient from the sidebar or create a new record to begin OCT diagnostic analysis.
            </p>
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden"
            >
              <div className="p-6">
                <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4">
                  <AlertCircle size={24} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Подтверждение удаления</h3>
                <p className="text-slate-600">{deleteConfirm.title}</p>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-all"
                >
                  Отмена
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all shadow-lg shadow-rose-200"
                >
                  Удалить
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rename Patient Modal */}
      {editingPatientId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl border border-slate-100"
          >
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Переименовать пациента</h2>
            <p className="text-sm text-slate-500 mb-6">Введите новое имя или описание для пациента.</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Новое имя</label>
                <input 
                  type="text" 
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  placeholder="Напр. Иванов И.И."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                  autoFocus
                />
              </div>
              
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setEditingPatientId(null)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  Отмена
                </button>
                <button 
                  onClick={() => handleRenamePatient(editingPatientId, editNameValue)}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                >
                  Сохранить
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
      <AnimatePresence>
        {showNewPatientModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNewPatientModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8"
            >
              <h3 className="text-2xl font-bold text-slate-800 mb-6">Регистрация пациента</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">ID пациента / Номер карты</label>
                  <input 
                    type="text" 
                    value={newPatientId}
                    onChange={(e) => setNewPatientId(e.target.value)}
                    placeholder="напр. PAT-2024-001"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono"
                    autoFocus
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setShowNewPatientModal(false)}
                    className="flex-1 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all"
                  >
                    Отмена
                  </button>
                  <button 
                    onClick={handleCreatePatient}
                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                  >
                    Создать запись
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Report View (Modal) */}
      <AnimatePresence>
        {showReport && activePatient && activePatient.analysis && (
          <div id="report-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 lg:p-12">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md no-print"
            />
            <motion.div 
              id="report-modal-content"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="relative w-full max-w-5xl max-h-full bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-slate-100 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-800">Диагностический отчёт</h3>
                    <p className="text-sm text-slate-500 font-medium">Пациент: {activePatient.id} • Сформирован: {new Date().toLocaleDateString('ru-RU')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 no-print">
                  <button 
                    onClick={handlePrint}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-all"
                  >
                    <Download size={18} /> Печать / PDF
                  </button>
                  <button 
                    onClick={() => setShowReport(false)}
                    className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-all"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div id="report-scroll-container" className="flex-1 overflow-y-auto p-12 bg-slate-50/30">
                <div id="printable-report" className="max-w-3xl mx-auto bg-white p-12 rounded-none shadow-sm border border-slate-200 space-y-8 min-h-[1000px] flex flex-col">
                  {/* Report Header */}
                  <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6">
                    <div>
                      <h1 className="text-3xl font-serif font-bold tracking-tight text-slate-900 mb-1 uppercase">
                        {activePatient.analysis.explanationReport?.header?.title || 'Медицинское заключение'}
                      </h1>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        {activePatient.analysis.explanationReport?.header?.subtitle || 'Комплексный диагностический протокол • Glaucoma Lab'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono font-bold text-slate-800">№ {Math.floor(Math.random() * 1000000)}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-bold">{activePatient.analysis.explanationReport?.header?.date || new Date().toLocaleDateString('ru-RU')}</p>
                    </div>
                  </div>

                  {/* Patient Info */}
                  <section className="border-b border-slate-100 pb-3">
                    <div className="flex flex-wrap gap-x-8 gap-y-2 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-400 uppercase tracking-wider">ID Пациента:</span>
                        <p className="font-bold text-slate-900">{activePatient.id}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-400 uppercase tracking-wider">Пол:</span>
                        <p className="font-bold text-slate-900">{activePatient.patient_meta?.sex === 'M' ? 'Мужской' : activePatient.patient_meta?.sex === 'F' ? 'Женский' : 'Н/Д'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-400 uppercase tracking-wider">Дата рождения:</span>
                        <p className="font-bold text-slate-900">{activePatient.patient_meta?.dob || 'Н/Д'}</p>
                      </div>
                    </div>
                  </section>

                  {/* Detailed Analysis */}
                  <div className="space-y-10 flex-1">
                    {activePatient.analysis.explanationReport ? (
                      <>
                        {/* OD Section */}
                        <section>
                          <h2 className="text-lg font-serif font-bold text-slate-900 border-b-2 border-slate-900 pb-2 mb-6 flex justify-between items-center">
                            <span>OD (Правый глаз)</span>
                            <span className="text-xs font-sans font-normal text-slate-500 uppercase tracking-widest">
                              Качество: {activePatient.analysis.explanationReport.OD.quality}
                            </span>
                          </h2>
                          
                          <div className="grid grid-cols-1 gap-8">
                            <div className="space-y-6">
                              <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Описание</h3>
                                <p className="text-sm text-slate-700 leading-relaxed italic">{activePatient.analysis.explanationReport.OD.additional_description}</p>
                              </div>
                            </div>
                          </div>
                        </section>

                        {/* OS Section */}
                        <section>
                          <h2 className="text-lg font-serif font-bold text-slate-900 border-b-2 border-slate-900 pb-2 mb-6 flex justify-between items-center">
                            <span>OS (Левый глаз)</span>
                            <span className="text-xs font-sans font-normal text-slate-500 uppercase tracking-widest">
                              Качество: {activePatient.analysis.explanationReport.OS.quality}
                            </span>
                          </h2>
                          
                          <div className="grid grid-cols-1 gap-8">
                            <div className="space-y-6">
                              <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Описание</h3>
                                <p className="text-sm text-slate-700 leading-relaxed italic">{activePatient.analysis.explanationReport.OS.additional_description}</p>
                              </div>
                            </div>
                          </div>
                        </section>

                        {/* Conclusion Section */}
                        <section className="bg-white text-slate-900 p-8 rounded-2xl border-2 border-slate-100">
                          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-6 border-b border-slate-100 pb-2">Заключение</h2>
                          
                          {(activePatient.analysis.explanationReport.conclusion.OD_summary || activePatient.analysis.explanationReport.conclusion.OS_summary) && (
                            <div className="grid grid-cols-2 gap-10 mb-8">
                              {activePatient.analysis.explanationReport.conclusion.OD_summary && (
                                <div>
                                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-2">Резюме OD</p>
                                  <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">{activePatient.analysis.explanationReport.conclusion.OD_summary}</p>
                                </div>
                              )}
                              {activePatient.analysis.explanationReport.conclusion.OS_summary && (
                                <div>
                                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-2">Резюме OS</p>
                                  <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">{activePatient.analysis.explanationReport.conclusion.OS_summary}</p>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="border-t-2 border-slate-100 pt-6">
                            <p className="text-[9px] font-bold text-indigo-500 uppercase mb-3">Интерпретация и протокол</p>
                            <div className="text-base font-sans prose-clinical max-w-none text-slate-900">
                              <ReactMarkdown>{activePatient.analysis.explanationReport.conclusion.interpretation}</ReactMarkdown>
                            </div>
                          </div>
                        </section>
                      </>
                    ) : null}

                    <section>
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-1">Рекомендации</h4>
                      <div className="grid grid-cols-1 gap-2">
                        {/* Try to get recommendations from various sources */}
                        {activePatient.analysis.explanationReport?.recommendation ? (
                          <div className="text-sm text-slate-700 leading-relaxed">
                            {renderSafeString(activePatient.analysis.explanationReport.recommendation)}
                          </div>
                        ) : activePatient.analysis.recommendations?.length ? (
                          activePatient.analysis.recommendations.map((r, i) => (
                            <div key={i} className="flex gap-3 text-sm text-slate-700 leading-relaxed">
                              <span className="text-slate-300 font-serif font-bold italic">{i + 1}.</span>
                              <span>{renderSafeString(r)}</span>
                            </div>
                          ))
                        ) : activePatient.analysis.results?.recommendation ? (
                          <div className="text-sm text-slate-700 leading-relaxed">
                            {activePatient.analysis.results.recommendation}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-400 italic">Рекомендации не сформированы</p>
                        )}
                      </div>
                    </section>
                  </div>

                  {/* Footer */}
                  <div className="pt-12 border-t border-slate-200 flex justify-between items-end mt-auto">
                    <div className="max-w-md">
                      <p className="text-[9px] text-slate-400 leading-relaxed uppercase tracking-tight">
                        {reportLanguage === 'ru'
                          ? 'Примечание: Данное заключение не является диагнозом и должно быть интерпретировано с учетом всех клинических данных лечащим врачом-офтальмологом. На достоверность данных значительное влияние оказывают любые изменения морфологии зрительного нерва, сетчатки, переднего отрезка глаза и глазного яблока в целом.'
                          : 'Note: This conclusion is not a diagnosis and must be interpreted taking into account all clinical data by the treating ophthalmologist. The reliability of the data is significantly influenced by any changes in the morphology of the optic nerve, retina, anterior segment of the eye, and the eyeball as a whole.'}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="w-32 h-1 bg-slate-900 mb-2 ml-auto"></div>
                      <p className="text-[10px] font-bold text-slate-900 uppercase tracking-widest italic">Glaucoma Lab AI Engine v2.5</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Clinical Data Modal */}
      <AnimatePresence>
        {showClinicalForm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="text-lg font-bold text-slate-800">Клинические данные</h3>
                <button onClick={() => setShowClinicalForm(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-all">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ВГД (IOP) OD</label>
                    <input 
                      type="number" 
                      value={clinicalFormData.iop_od}
                      onChange={(e) => setClinicalFormData(prev => ({ ...prev, iop_od: parseInt(e.target.value) || 0 }))}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ВГД (IOP) OS</label>
                    <input 
                      type="number" 
                      value={clinicalFormData.iop_os}
                      onChange={(e) => setClinicalFormData(prev => ({ ...prev, iop_os: parseInt(e.target.value) || 0 }))}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Дата рождения (ДД.ММ.ГГГГ)</label>
                  <input 
                    type="text" 
                    placeholder="01.01.1970"
                    value={clinicalFormData.dob}
                    onChange={(e) => setClinicalFormData(prev => ({ ...prev, dob: e.target.value }))}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div>
                    <p className="text-xs font-bold text-slate-700">Наследственность</p>
                    <p className="text-[10px] text-slate-500">Глаукома у близких родственников</p>
                  </div>
                  <button 
                    onClick={() => setClinicalFormData(prev => ({ ...prev, family_history: !prev.family_history }))}
                    className={`w-12 h-6 rounded-full transition-all relative ${clinicalFormData.family_history ? 'bg-indigo-600' : 'bg-slate-300'}`}
                  >
                    <motion.div 
                      className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm"
                      animate={{ x: clinicalFormData.family_history ? 24 : 0 }}
                    />
                  </button>
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                <button 
                  onClick={() => setShowClinicalForm(false)}
                  className="flex-1 py-3 text-slate-600 font-bold text-xs uppercase tracking-widest hover:bg-slate-100 rounded-xl transition-all"
                >
                  Отмена
                </button>
                <button 
                  onClick={handleSaveClinicalData}
                  className="flex-1 py-3 bg-indigo-600 text-white font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 rounded-xl transition-all shadow-md"
                >
                  Сохранить
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Study Review Gallery Overlay */}
      <AnimatePresence>
        {isReviewing && lastUploadedStudyIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 lg:p-8"
          >
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-5xl h-full max-h-[90vh] overflow-hidden flex flex-col border border-white/20">
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                    <BookOpen className="text-indigo-600" size={24} />
                    Проверка загруженных снимков
                  </h2>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
                    Снимок {reviewIndex + 1} из {lastUploadedStudyIds.length}
                  </p>
                </div>
                <button 
                  onClick={() => setIsReviewing(false)}
                  className="p-2 hover:bg-slate-200 rounded-full transition-all text-slate-400 hover:text-slate-600"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Content - Book/Stacked Cards View */}
              <div className="flex-1 relative overflow-hidden bg-slate-100/50 flex items-center justify-center p-4 lg:p-12">
                <AnimatePresence mode="wait">
                  {(() => {
                    const studyId = lastUploadedStudyIds[reviewIndex];
                    const study = activePatient?.studies.find(s => s.id === studyId);
                    if (!study) return null;

                    const isGoodQuality = (study.layout?.image_quality || 0) >= 70;

                    return (
                      <motion.div
                        key={studyId}
                        initial={{ x: 300, opacity: 0, rotate: 5 }}
                        animate={{ x: 0, opacity: 1, rotate: 0 }}
                        exit={{ x: -300, opacity: 0, rotate: -5 }}
                        transition={{ type: "spring", damping: 20, stiffness: 100 }}
                        className="w-full h-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col lg:flex-row"
                      >
                        {/* Image Section */}
                          <div className="lg:w-2/3 bg-slate-950 relative group flex items-center justify-center overflow-hidden">
                            <img 
                              src={study.imageUrl} 
                              alt="OCT Review" 
                              className="max-w-full max-h-full object-contain transition-all duration-300"
                              referrerPolicy="no-referrer"
                            />
                          <div className="absolute top-4 left-4 flex gap-2">
                            <span className="px-3 py-1 bg-black/50 backdrop-blur-md text-white rounded-full text-[10px] font-bold uppercase tracking-widest border border-white/20">
                              {study.layout?.eye || 'unknown'}
                            </span>
                            <span className={`px-3 py-1 backdrop-blur-md rounded-full text-[10px] font-bold uppercase tracking-widest border ${
                              isGoodQuality ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                            }`}>
                              Качество: {study.layout?.image_quality || 0}%
                            </span>
                          </div>
                        </div>

                        {/* Info & Actions Section */}
                        <div className="lg:w-1/3 p-8 flex flex-col justify-between bg-white">
                          <div className="space-y-6">
                            <div>
                              <h3 className="text-lg font-bold text-slate-800 mb-1">{study.name}</h3>
                              <p className="text-xs text-slate-500 font-medium">{study.layout?.study_type} • {study.layout?.report_type}</p>
                            </div>

                            <div className="space-y-4">
                              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Автоматическая оценка</h4>
                                <div className="flex items-center gap-3">
                                  {isGoodQuality ? (
                                    <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                                      <CheckCircle2 size={20} />
                                    </div>
                                  ) : (
                                    <div className="w-8 h-8 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center">
                                      <AlertTriangle size={20} />
                                    </div>
                                  )}
                                  <div>
                                    <p className="text-xs font-bold text-slate-700">
                                      {isGoodQuality ? 'Качество хорошее' : 'Требуется проверка'}
                                    </p>
                                    <p className="text-[10px] text-slate-500">
                                      {study.layout?.quality_explanation || 'Снимок пригоден для анализа'}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Ваше решение</h4>
                                <div className="grid grid-cols-2 gap-3">
                                  <button 
                                    onClick={() => {
                                      handleUpdateStudyStatus(study.id, 'accepted');
                                      if (reviewIndex < lastUploadedStudyIds.length - 1) {
                                        setReviewIndex(prev => prev + 1);
                                      } else {
                                        setIsReviewing(false);
                                        addLog('Все снимки проверены', 0, 'success');
                                      }
                                    }}
                                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                                      study.status === 'accepted' 
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm' 
                                        : 'bg-white border-slate-200 text-slate-400 hover:border-emerald-200 hover:text-emerald-600'
                                    }`}
                                  >
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${study.status === 'accepted' ? 'bg-emerald-500 text-white' : 'bg-slate-100'}`}>
                                      <Check size={20} />
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Принять</span>
                                  </button>
                                  <button 
                                    onClick={() => {
                                      handleUpdateStudyStatus(study.id, 'rejected');
                                      if (reviewIndex < lastUploadedStudyIds.length - 1) {
                                        setReviewIndex(prev => prev + 1);
                                      } else {
                                        setIsReviewing(false);
                                        addLog('Все снимки проверены', 0, 'success');
                                      }
                                    }}
                                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                                      study.status === 'rejected' 
                                        ? 'bg-rose-50 border-rose-200 text-rose-700 shadow-sm' 
                                        : 'bg-white border-slate-200 text-slate-400 hover:border-rose-200 hover:text-rose-600'
                                    }`}
                                  >
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${study.status === 'rejected' ? 'bg-rose-500 text-white' : 'bg-slate-100'}`}>
                                      <X size={20} />
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Отклонить</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-6 border-t border-slate-100">
                            <button 
                              onClick={() => setReviewIndex(prev => Math.max(0, prev - 1))}
                              disabled={reviewIndex === 0}
                              className="p-3 bg-slate-100 text-slate-600 rounded-xl disabled:opacity-30 hover:bg-slate-200 transition-all"
                            >
                              <ChevronRight size={20} className="rotate-180" />
                            </button>
                            <div className="flex gap-1">
                              {lastUploadedStudyIds.map((_, idx) => (
                                <div 
                                  key={idx} 
                                  className={`w-1.5 h-1.5 rounded-full transition-all ${idx === reviewIndex ? 'w-4 bg-indigo-600' : 'bg-slate-300'}`}
                                />
                              ))}
                            </div>
                            <button 
                              onClick={() => {
                                if (reviewIndex < lastUploadedStudyIds.length - 1) {
                                  setReviewIndex(prev => prev + 1);
                                } else {
                                  setIsReviewing(false);
                                  addLog('Все снимки проверены', 0, 'success');
                                }
                              }}
                              className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all"
                            >
                              <ChevronRight size={20} />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })()}
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-500">
                  <Clock size={16} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Режим быстрой проверки</span>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      // Accept all remaining
                      lastUploadedStudyIds.forEach(id => {
                        const study = activePatient?.studies.find(s => s.id === id);
                        if (study && study.status === 'pending_review') {
                          handleUpdateStudyStatus(id, 'accepted');
                        }
                      });
                      setIsReviewing(false);
                      addLog('Все снимки приняты', 0, 'success');
                    }}
                    className="px-6 py-3 bg-emerald-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                  >
                    Принять все
                  </button>
                  <button 
                    onClick={() => setIsReviewing(false)}
                    className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-100"
                  >
                    Завершить
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress Overlay */}
      <AnimatePresence>
        {isAnalyzing && currentStage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"
          >
            <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full mx-4 text-center space-y-6 border border-slate-100">
              <div className="relative w-20 h-20 mx-auto">
                <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                <motion.div 
                  className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Activity className="text-indigo-600 animate-pulse" size={32} />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">Анализ в процессе</h3>
                <p className="text-sm text-slate-500 font-medium animate-pulse">
                  {currentStage}
                </p>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-indigo-600"
                  initial={{ width: "0%" }}
                  animate={{ width: `${analysisProgress}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">
                Пожалуйста, не закрывайте вкладку
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image Fullscreen Modal */}
      <AnimatePresence>
        {showImageModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 lg:p-12"
            onClick={() => setShowImageModal(null)}
          >
            <button 
              onClick={() => setShowImageModal(null)}
              className="absolute top-6 right-6 p-3 bg-white/10 text-white rounded-full hover:bg-white/20 transition-all z-[120]"
            >
              <X size={24} />
            </button>
            
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full h-full flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img 
                src={showImageModal} 
                alt="Full OCT Scan" 
                className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
                referrerPolicy="no-referrer"
                style={{ 
                  transform: activeStudy ? `rotate(${activeStudy.rotation || 0}deg)` : 'none' 
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
