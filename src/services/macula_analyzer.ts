/**
 * MACULA Analyzer
 * Detects thinning and structured features.
 */

function analyzeMacula(center: number | null) {
  if (center === null) {
    return {
      macula_data_missing: true,
      macula_status: null,
      features: [] as string[]
    };
  }

  let macula_status = "normal";
  const features: string[] = [];

  if (center < 230) {
    macula_status = "thinning";
    features.push("macula_thinning");
  }

  return {
    macula_data_missing: false,
    macula_status,
    features,
    center
  };
}

export function macula_analyzer(input: any) {
  return {
    OD: analyzeMacula(input.OD?.macula?.central_thickness ?? null),
    OS: analyzeMacula(input.OS?.macula?.central_thickness ?? null),
    global: {
      note: "Macula features"
    }
  };
}
