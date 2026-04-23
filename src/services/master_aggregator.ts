/**
 * MASTER Aggregator
 * Consolidates pre-analyzed features and data statuses from all specialized analyzers.
 * Updated: Now loops through ALL scans to collect unique features.
 */

export function master_aggregator(input: {
  RNFL?: any;
  MACULA?: any;
  QUALITY?: any;
  scans?: any[];
}) {
  const scans = input.scans || [];

  function mergeEye(eye: 'OD' | 'OS') {
    const featureSet = new Set<string>();
    
    // 🧪 1. Collect features from individual scan results (if provided in scans array)
    scans.forEach(scan => {
      // Find analyzer results in the scan object if they exist
      const results = scan.agentResults || [];
      results.forEach((r: any) => {
        if (r.status === 'success' && r.output && r.output[eye]?.features) {
          r.output[eye].features.forEach((f: string) => featureSet.add(f));
        }
      });

      // Special check for deterministic results stored directly on scan
      if (scan.rnfl_analysis?.[eye]?.features) 
        scan.rnfl_analysis[eye].features.forEach((f: string) => featureSet.add(f));
      if (scan.macula_analysis?.[eye]?.features) 
        scan.macula_analysis[eye].features.forEach((f: string) => featureSet.add(f));
      if (scan.onh_analysis?.[eye]?.features)
        scan.onh_analysis[eye].features.forEach((f: string) => featureSet.add(f));
    });

    // 🧪 2. Also check the explicit inputs (for backward compatibility / override)
    if (input.RNFL?.[eye]?.features) input.RNFL[eye].features.forEach((f: string) => featureSet.add(f));
    if (input.MACULA?.[eye]?.features) input.MACULA[eye].features.forEach((f: string) => featureSet.add(f));

    const rnflFromScan = scans
      .map(s => s.rnfl_analysis?.[eye])
      .find(r => r && !r.rnfl_data_missing);

    const maculaFromScan = scans
      .map(s => s.macula_analysis?.[eye])
      .find(r => r && !r.macula_data_missing);

    const onhFromScan = scans
      .map(s => s.onh_analysis?.[eye])
      .find(r => r && !r.onh_data_missing);

    let rnfl_data_missing = !(rnflFromScan || input.RNFL?.[eye]);

    if (featureSet.has("rnfl_thinning") || featureSet.has("rnfl_sector_loss")) {
      rnfl_data_missing = false;
    }

    let macula_data_missing = !(maculaFromScan || input.MACULA?.[eye]);

    if (featureSet.has("macula_thinning")) {
      macula_data_missing = false;
    }

    let onh_data_missing = !(onhFromScan);

    return {
      rnfl: rnflFromScan || input.RNFL?.[eye] || {},
      macula: maculaFromScan || input.MACULA?.[eye] || {},
      disc: onhFromScan || {},
      quality: input.QUALITY?.[eye] || {},

      // 🔑 ГЛАВНОЕ — ОБЪЕДИНЕНИЕ ВСЕХ ПРИЗНАКОВ
      features: Array.from(featureSet),

      // 🔑 ФЛАГИ ДАННЫХ
      rnfl_data_missing: rnfl_data_missing,
      macula_data_missing: macula_data_missing,
      onh_data_missing: onh_data_missing,

      // 🔑 confidence только как метаданные
      confidence: input.QUALITY?.[eye]?.confidence ?? "low"
    };
  }

  const OD = mergeEye('OD');
  const OS = mergeEye('OS');

  return {
    OD,
    OS,
    global: {
      // есть ли вообще данные
      has_any_data: !(
        (OD.rnfl_data_missing && OD.macula_data_missing) &&
        (OS.rnfl_data_missing && OS.macula_data_missing)
      ),

      // хотя бы что-то можно анализировать
      partial_data: true,

      // агрегированная уверенность
      confidence: (
        OD.confidence === "low" && OS.confidence === "low"
      ) ? "low" : "high",

      note: "Feature-level aggregated data for clinical analysis"
    }
  };
}
