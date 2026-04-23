/**
 * SERIES Processor
 * Orchestrates multiple scans to produce a single, high-quality patient state.
 * Logic: Analyzes all scans, picks the BEST scan per anatomical layer (RNFL, Macula),
 * and normalizes the output for the clinical aggregator.
 */
import { RNFL_analyzer } from "./RNFL_analyzer";
import { macula_analyzer } from "./macula_analyzer";
import { quality_analyzer } from "./quality_analyzer";
import { master_aggregator } from "./master_aggregator";
import { clinical_analyzer } from "./clinical_analyzer";
import { clinicalAnalyzerScan } from "./clinicalAnalyzerScan";
import { onhAnalyzer } from "./onhAnalyzer";

export interface SeriesOutput {
  OD: EyeData;
  OS: EyeData;
  scans: any[];
  global: {
    scan_count: number;
    interpretation_allowed: boolean;
  };
}

interface EyeData {
  RNFL: any;
  MACULA: any;
  ONH: any;
  QUALITY: any;
}

function getQualityScore(qualityOutput: any): number {
  return qualityOutput?.quality_score || 0;
}

function pickBest(enrichedScans: any[], eye: 'OD' | 'OS', type: 'RNFL' | 'MACULA' | 'ONH'): any {
  return enrichedScans
    .filter(s => {
      if (type === 'RNFL') return !!s.rnfl_analysis?.[eye]?.avg;
      if (type === 'MACULA') return !!s.macula_analysis?.[eye]?.center;
      if (type === 'ONH') return !s.onh_analysis?.[eye]?.onh_data_missing;
      return false;
    })
    .sort((a, b) => {
      const scoreA = getQualityScore(a.quality_analysis?.[eye]);
      const scoreB = getQualityScore(b.quality_analysis?.[eye]);
      
      if (scoreB !== scoreA) return scoreB - scoreA;
      
      // Secondary sort: timestamp (prefer newer)
      return (b.timestamp || 0) - (a.timestamp || 0);
    })[0] || null;
}

export function series_processor(scans: any[]): SeriesOutput {
  if (!scans || scans.length === 0) {
    return {
      OD: { RNFL: null, MACULA: null, ONH: null, QUALITY: null },
      OS: { RNFL: null, MACULA: null, ONH: null, QUALITY: null },
      scans: [],
      global: { scan_count: 0, interpretation_allowed: false }
    };
  }

  // 1. Pass 1: Extract features and anatomical data from each scan
  const scans_with_anatomy = scans.map(scan => {
    const norm = scan.normalized || scan;
    return {
      ...scan,
      id: scan.id || Math.random().toString(36).substr(2, 9),
      timestamp: scan.timestamp || Date.now(),
      normalized: norm,
      rnfl_analysis: RNFL_analyzer(norm),
      macula_analysis: macula_analyzer(norm),
      onh_analysis: {
        OD: onhAnalyzer(norm.OD?.onh || norm.OD?.RNFL || norm.OD),
        OS: onhAnalyzer(norm.OS?.onh || norm.OS?.RNFL || norm.OS)
      }
    };
  });

  // 2. Pass 2: Aggregate to get SERIES-LEVEL availability
  const series_summary = master_aggregator({
    scans: scans_with_anatomy
  });

  // 3. Pass 3: Enrich with SERIES-AWARE quality analyzer and SCAN-LEVEL clinical analyzer
  const enriched_scans = scans_with_anatomy.map(scan => {
    const quality = quality_analyzer(scan.normalized, series_summary);
    
    // 🔑 SCAN-LEVEL clinical input construction
    const scan_clinical_input = {
      OD: {
        rnfl: scan.rnfl_analysis?.OD,
        disc: scan.onh_analysis?.OD,
        macula: scan.macula_analysis?.OD,
        confidence: quality.OD?.confidence || "low"
      },
      OS: {
        rnfl: scan.rnfl_analysis?.OS,
        disc: scan.onh_analysis?.OS,
        macula: scan.macula_analysis?.OS,
        confidence: quality.OS?.confidence || "low"
      },
      global: {
        confidence: quality.global?.confidence || "low"
      }
    };

    return {
      ...scan,
      quality_analysis: quality,
      clinical_analysis: clinicalAnalyzerScan(scan_clinical_input)
    };
  });

  // 4. Build Eye Data by picking the BEST data from the whole series
  const buildEyeData = (eye: 'OD' | 'OS'): EyeData => {
    const bestRNFLScan = pickBest(enriched_scans, eye, 'RNFL');
    const bestMaculaScan = pickBest(enriched_scans, eye, 'MACULA');
    const bestONHScan = pickBest(enriched_scans, eye, 'ONH');
    
    // Choose the best overall quality for the eye
    const bestQualityScan = [...enriched_scans].sort((a, b) => 
      getQualityScore(b.quality_analysis?.[eye]) - getQualityScore(a.quality_analysis?.[eye])
    )[0];

    return {
      RNFL: bestRNFLScan ? bestRNFLScan.rnfl_analysis?.[eye] : { avg: null, quadrant_status: { S: "normal", I: "normal", N: "normal", T: "normal" }, features: [], rnfl_data_missing: true },
      MACULA: bestMaculaScan ? bestMaculaScan.macula_analysis?.[eye] : { center: null, macula_data_missing: true, features: [], macula_status: null },
      ONH: bestONHScan ? bestONHScan.onh_analysis?.[eye] : { onh_data_missing: true, features: [] },
      QUALITY: bestQualityScan ? bestQualityScan.quality_analysis?.[eye] : { confidence: "low", issues: ["No quality data"] }
    };
  };

  const OD = buildEyeData('OD');
  const OS = buildEyeData('OS');

  return {
    OD,
    OS,
    scans: enriched_scans,
    global: {
      scan_count: scans.length,
      interpretation_allowed: (OD.QUALITY?.interpretation_permission ?? false) || (OS.QUALITY?.interpretation_permission ?? false)
    }
  };
}
