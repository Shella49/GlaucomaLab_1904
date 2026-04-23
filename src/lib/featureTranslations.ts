// featureTranslations.ts

export const FEATURE_TRANSLATIONS: Record<string, string> = {
  // RNFL
  rnfl_thinning: "Истончение RNFL",
  diffuse_loss: "Диффузное истончение RNFL",
  significant_rnfl_loss: "Значимая потеря RNFL",
  severe_rnfl_loss: "Выраженная потеря RNFL",

  // локальные дефекты
  local_defect: "Локальный дефект RNFL",
  focal_defect: "Фокальный дефект RNFL",
  notch: "Нотч нейроретинального пояска",

  // ранние
  early_structural_loss: "Ранние структурные изменения",
  borderline_loss: "Пограничные изменения RNFL",

  // продвинутые
  advanced_loss: "Выраженные структурные изменения",
  atrophy: "Атрофия RNFL",
  global_loss: "Глобальное истончение RNFL",

  // ONH
  increased_cdr: "Увеличение C/D",
  extreme_cdr: "Резко увеличенное C/D",
  cupping: "Экскавация ДЗН",
  moderate_cupping: "Умеренная экскавация",
  advanced_cupping: "Выраженная экскавация",
  early_cupping: "Начальное расширение экскавации",
  rim_loss: "Истончение нейроретинального пояска",
  rim_thinning: "Снижение толщины нейроретинального пояска",
  v_cd_ratio: "V-C/D отношение",
  h_cd_ratio: "H-C/D отношение",
  rim_area: "Rim Area (площадь пояска)",
  disc_area: "Disc Area (площадь диска)",
  cup_volume: "Cup Volume (объем экскавации)",
  rim_volume: "Rim Volume (объем пояска)",
  cup_area: "Cup Area (площадь экскавации)",
  ddls_advanced: "Терминальная стадия (DDLS)",
  ddls_moderate: "Развитая стадия (DDLS)",
  ddls_early: "Начальные изменения (DDLS)",

  // макула
  macular_thinning: "Истончение макулы",
  macula_thinning: "Истончение макулы",
  central_thinning: "Снижение центральной толщины макулы",
  ganglion_cell_thinning: "Истончение ганглиозного комплекса",
  gcl_thinning: "Истончение GCL",

  // прочее
  profile_deformation: "Деформация профиля RNFL",
  rnfl_sector_loss: "Секторальная потеря RNFL",
  rnfl_asymmetry: "Асимметрия RNFL",
  macula_asymmetry: "Асимметрия макулы",

  // общее
  asymmetry: "Межглазная асимметрия",
  progression: "Прогрессирование изменений"
};

export function translateFeature(feature: string): string {
  return FEATURE_TRANSLATIONS[feature] || feature.replace(/_/g, ' ').toUpperCase();
}

export function translateFeatures(features: string[]): string[] {
  return (features || []).map(f => translateFeature(f));
}

export function formatFeatures(features: string[]): string[] {
  const translated = translateFeatures(features);
  // убираем дубликаты
  return Array.from(new Set(translated));
}

export function featuresToText(features: string[]): string {
  return formatFeatures(features).join("; ");
}
