import React, { useState } from 'react';
import { Study, AgentResult } from '../types';
import { FIELD_MAP, normalizeLabel } from '../services/collectorNormalizer';
import { Search, ChevronDown, ChevronUp, Info, AlertCircle, CheckCircle2, Filter } from 'lucide-react';

interface NormalizerDebugViewProps {
  studies: Study[];
}

export const NormalizerDebugView: React.FC<NormalizerDebugViewProps> = ({ studies }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedStudy, setExpandedStudy] = useState<string | null>(studies.length > 0 ? studies[0].id : null);
  const [showOnlyUnmapped, setShowOnlyUnmapped] = useState(false);

  // Reverse map to see what keys are used for what
  const reverseMap: Record<string, string[]> = {};
  Object.entries(FIELD_MAP).forEach(([label, [section, key]]) => {
    const fullKey = `${section}.${key}`;
    if (!reverseMap[fullKey]) reverseMap[fullKey] = [];
    reverseMap[fullKey].push(label);
  });

  const filteredFieldMap = Object.entries(FIELD_MAP).filter(([label, [section, key]]) => 
    label.toLowerCase().includes(searchTerm.toLowerCase()) || 
    section.toLowerCase().includes(searchTerm.toLowerCase()) || 
    key.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-20">
      {/* 1. Header & Search */}
      <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Справочник Нормализатора</h2>
            <p className="text-slate-500 text-sm">Список поддерживаемых меток и их соответствие внутренним параметрам системы.</p>
          </div>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Поиск по метке или параметру..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 pr-6 py-3 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 w-full md:w-80 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="pb-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-4">Метка (Label)</th>
                <th className="pb-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Раздел</th>
                <th className="pb-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Внутренний Ключ</th>
                <th className="pb-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest pr-4">Синонимы</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredFieldMap.slice(0, 50).map(([label, [section, key]]) => (
                <tr key={label} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="py-2 pl-4">
                    <span className="text-sm font-medium text-slate-700">{label}</span>
                  </td>
                  <td className="py-2">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider ${
                      section === 'rnfl' ? 'bg-indigo-50 text-indigo-600' :
                      section === 'onh' ? 'bg-emerald-50 text-emerald-600' :
                      section === 'macula' ? 'bg-amber-50 text-amber-600' :
                      'bg-slate-100 text-slate-500'
                    }`}>
                      {section}
                    </span>
                  </td>
                  <td className="py-2">
                    <code className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-md">{key}</code>
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap gap-1">
                      {reverseMap[`${section}.${key}`]?.filter(l => l !== label).slice(0, 3).map(syn => (
                        <span key={syn} className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{syn}</span>
                      ))}
                      {(reverseMap[`${section}.${key}`]?.length || 0) > 4 && (
                        <span className="text-[10px] text-slate-400">+{reverseMap[`${section}.${key}`].length - 4}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredFieldMap.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-400 italic">Ничего не найдено</td>
                </tr>
              )}
            </tbody>
          </table>
          {filteredFieldMap.length > 50 && (
            <div className="mt-4 text-center">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">Показано 50 из {filteredFieldMap.length} записей. Используйте поиск для уточнения.</p>
            </div>
          )}
        </div>
      </div>

      {/* 2. Study Extraction Analysis */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-4">
          <h2 className="text-xl font-bold text-slate-800">Результаты распознавания</h2>
          <button 
            onClick={() => setShowOnlyUnmapped(!showOnlyUnmapped)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              showOnlyUnmapped ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Filter size={14} />
            {showOnlyUnmapped ? 'Только нераспознанные' : 'Все поля'}
          </button>
        </div>

        {studies.map(study => {
          const extractorResult = study.agentResults?.find(r => r.agentName === 'universal_extractor');
          if (!extractorResult || extractorResult.status !== 'success') return null;

          const rawData = extractorResult.output;
          const isExpanded = expandedStudy === study.id;

          // Flatten parameters for display
          const allParams: { eye: string; label: string; value: any; unit?: string; mapped: boolean; section?: string; key?: string }[] = [];
          
          ['OD', 'OS'].forEach(eye => {
            const eyeParams = rawData[eye]?.parameters || [];
            eyeParams.forEach((p: any) => {
              const label = normalizeLabel(p.label || p.name || "");
              const mapping = FIELD_MAP[label];
              allParams.push({
                eye,
                label: p.label || p.name,
                value: p.value,
                unit: p.unit,
                mapped: !!mapping,
                section: mapping?.[0],
                key: mapping?.[1]
              });
            });
          });

          const filteredParams = showOnlyUnmapped ? allParams.filter(p => !p.mapped) : allParams;

          return (
            <div key={study.id} className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm transition-all hover:shadow-md">
              <button 
                onClick={() => setExpandedStudy(isExpanded ? null : study.id)}
                className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Info size={20} />
                  </div>
                  <div className="text-left">
                    <h4 className="font-bold text-slate-800">Исследование: {study.subtype || study.type}</h4>
                    <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">ID: {study.id.slice(0, 8)} • {new Date(study.timestamp).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="hidden md:flex gap-4">
                    <div className="text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Всего полей</p>
                      <p className="text-sm font-bold text-slate-700">{allParams.length}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Распознано</p>
                      <p className="text-sm font-bold text-emerald-600">{allParams.filter(p => p.mapped).length}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Пропущено</p>
                      <p className="text-sm font-bold text-rose-500">{allParams.filter(p => !p.mapped).length}</p>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="text-slate-400" /> : <ChevronDown className="text-slate-400" />}
                </div>
              </button>

              {isExpanded && (
                <div className="p-6 pt-0 border-t border-slate-50">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-2">Глаз</th>
                          <th className="py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Оригинальная Метка</th>
                          <th className="py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Значение</th>
                          <th className="py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Статус</th>
                          <th className="py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest pr-2">Маппинг</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredParams.map((p, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-1.5 pl-2">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.eye === 'OD' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                                {p.eye}
                              </span>
                            </td>
                            <td className="py-1.5">
                              <span className="text-sm text-slate-700">{p.label}</span>
                            </td>
                            <td className="py-1.5">
                              <span className="text-sm font-bold text-slate-800">{p.value} {p.unit}</span>
                            </td>
                            <td className="py-1.5">
                              {p.mapped ? (
                                <div className="flex items-center gap-1.5 text-emerald-600">
                                  <CheckCircle2 size={14} />
                                  <span className="text-[10px] font-bold uppercase tracking-wider">OK</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 text-rose-500">
                                  <AlertCircle size={14} />
                                  <span className="text-[10px] font-bold uppercase tracking-wider">MISSING</span>
                                </div>
                              )}
                            </td>
                            <td className="py-1.5 pr-2">
                              {p.mapped ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded uppercase">{p.section}</span>
                                  <code className="text-[10px] text-slate-500">{p.key}</code>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">Не сопоставлено</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {filteredParams.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-400 italic">Нет данных для отображения</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  
                  {!showOnlyUnmapped && allParams.filter(p => !p.mapped).length > 0 && (
                    <div className="mt-6 p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-4">
                      <div className="text-amber-500 shrink-0">
                        <AlertCircle size={20} />
                      </div>
                      <div>
                        <h5 className="text-sm font-bold text-amber-800 mb-1">Обнаружены нераспознанные поля</h5>
                        <p className="text-xs text-amber-700 leading-relaxed">
                          Некоторые метки из этого отчета отсутствуют в нашем справочнике. 
                          Пожалуйста, сообщите нам об этих полях (например, <b>{allParams.filter(p => !p.mapped).slice(0, 3).map(p => `"${p.label}"`).join(', ')}</b>), 
                          чтобы мы могли добавить их в следующем обновлении.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
