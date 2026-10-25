import { AIReportAnalysisResult, ReportParameter } from '../../types';
import { getBackendUrl } from '../nodeAuthService';

export const getSampleLabReports = (userName?: string) => {
  let activeName = userName || 'Patient';
  try {
    if (!userName && typeof localStorage !== 'undefined') {
      const activeUserJSON = localStorage.getItem('jivexa_session_user');
      if (activeUserJSON) {
        const u = JSON.parse(activeUserJSON);
        if (u?.name) activeName = u.name;
      }
    }
  } catch (e) {}

  return [
    {
      id: 'sample_cbc_lipid',
      title: 'Complete Blood Count (CBC) & Lipid Profile',
      fileName: `${activeName.replace(/\s+/g, '_')}_CBC_Lipid_Panel.pdf`,
      fileSize: '1.4 MB',
      fileType: 'application/pdf',
      rawText: `
PATIENT LAB REPORT - METROPOLIS HEALTHCARE
Patient Name: ${activeName} | Date of Report: 05-Aug-2026 | Page 1 of 1

HAEMATOLOGY (CBC)
Hemoglobin: 11.2 g/dL (Reference Range: 13.0 - 17.5 g/dL) [LOW]
Total RBC Count: 4.8 mill/cumm (Reference Range: 4.3 - 5.9 mill/cumm) [NORMAL]
Total Leukocyte Count (WBC): 6,800 /cumm (Reference Range: 4,000 - 11,000 /cumm) [NORMAL]
Platelet Count: 240,000 /cumm (Reference Range: 150,000 - 450,000 /cumm) [NORMAL]
Packed Cell Volume (PCV): 38.5 % (Reference Range: 36.0 - 50.0 %) [NORMAL]
Erythrocyte Sedimentation Rate (ESR): 14 mm/hr (Reference Range: 0 - 20 mm/hr) [NORMAL]

LIPID PROFILE
Total Cholesterol: 245 mg/dL (Reference Range: < 200 mg/dL) [HIGH]
Triglycerides: 145 mg/dL (Reference Range: < 150 mg/dL) [NORMAL]
HDL Cholesterol: 38 mg/dL (Reference Range: > 40 mg/dL) [LOW]
LDL Cholesterol: 144 mg/dL (Reference Range: < 100 mg/dL) [HIGH]
      `
    },
    {
      id: 'sample_diabetes_thyroid',
      title: 'HbA1c Diabetes & Thyroid Profile (TSH)',
      fileName: `${activeName.replace(/\s+/g, '_')}_Diabetes_Thyroid_Screening.pdf`,
      fileSize: '980 KB',
      fileType: 'application/pdf',
      rawText: `
DIABETES & ENDOCRINE LAB REPORT - THYROCARE
Patient Name: ${activeName} | Date: 02-Aug-2026 | Page 1 of 1

GLUCOSE & HBA1C PANEL
Fasting Blood Sugar: 135 mg/dL (Reference Range: 70 - 99 mg/dL) [HIGH]
HbA1c (Glycated Hemoglobin): 6.8 % (Reference Range: < 5.7 %) [HIGH]

THYROID & RENAL PANEL
TSH (Thyroid Stimulating Hormone): 3.2 uIU/mL (Reference Range: 0.4 - 4.5 uIU/mL) [NORMAL]
Serum Creatinine: 0.9 mg/dL (Reference Range: 0.6 - 1.2 mg/dL) [NORMAL]
Blood Urea Nitrogen (BUN): 14 mg/dL (Reference Range: 7 - 20 mg/dL) [NORMAL]
Serum Calcium: 9.4 mg/dL (Reference Range: 8.5 - 10.5 mg/dL) [NORMAL]
      `
    }
  ];
};

export const SAMPLE_LAB_REPORTS = getSampleLabReports();

/**
 * Dynamic parser for printed laboratory reference ranges
 */
const parseReferenceRange = (text: string) => {
  if (!text) return null;

  const rangeMatch = text.match(/(?:ref(?:erence)?[:\s]*)?\(?\s*([0-9,]+(?:\.[0-9]+)?)\s*(?:-|–|—|to)\s*([0-9,]+(?:\.[0-9]+)?)\s*([a-zA-Z\/%]+)?\)?/i);
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1].replace(/,/g, ''));
    const max = parseFloat(rangeMatch[2].replace(/,/g, ''));
    if (!isNaN(min) && !isNaN(max)) {
      return { min, max, unit: rangeMatch[3] || '', type: 'range' };
    }
  }

  const lessMatch = text.match(/(?:ref(?:erence)?[:\s]*)?\(?\s*(?:<|<=|less\s*than|up\s*to)\s*([0-9,]+(?:\.[0-9]+)?)\s*([a-zA-Z\/%]+)?\)?/i);
  if (lessMatch) {
    const max = parseFloat(lessMatch[1].replace(/,/g, ''));
    if (!isNaN(max)) return { min: 0, max, unit: lessMatch[2] || '', type: 'lessThan' };
  }

  const greaterMatch = text.match(/(?:ref(?:erence)?[:\s]*)?\(?\s*(?:>|>=|greater\s*than)\s*([0-9,]+(?:\.[0-9]+)?)\s*([a-zA-Z\/%]+)?\)?/i);
  if (greaterMatch) {
    const min = parseFloat(greaterMatch[1].replace(/,/g, ''));
    if (!isNaN(min)) return { min, max: Infinity, unit: greaterMatch[2] || '', type: 'greaterThan' };
  }

  return null;
};

const extractDateFromText = (text: string): string => {
  if (!text) return '';
  const dateMatch = text.match(/(?:date\s*of\s*(?:collection|reporting|report)|report\s*date|collected\s*on|registered\s*on|sample\s*date|date)\s*[:=]?\s*([0-9]{1,2}[-\/\.][0-9]{1,2}[-\/\.][0-9]{2,4}|[0-9]{1,2}\s+[a-zA-Z]{3,9}\s+[0-9]{2,4}|[0-9]{4}[-\/\.][0-9]{1,2}[-\/\.][0-9]{1,2})/i);
  return dateMatch ? dateMatch[1].trim() : '';
};

// Parameter extraction rules for local parsing fallback
interface ParameterRule {
  name: string;
  category: string;
  unit: string;
  defaultRef: string;
  pattern: RegExp;
  evaluate: (val: string, ref: string) => {
    status: 'Within Reference Range' | 'Above Range' | 'Below Range' | 'Needs Review';
    flag: 'NORMAL' | 'HIGH' | 'LOW' | 'NEEDS_REVIEW';
    legacyStatus: 'Normal' | 'Abnormal' | 'Attention';
    refRange: string;
    refMin: number | null;
    refMax: number | null;
    explanation: string;
  };
}

const makeTabularOrLinePattern = (nameTokens: string[], unitTokens?: string[]): RegExp => {
  const names = nameTokens.join('|');
  const units = unitTokens && unitTokens.length > 0 ? unitTokens.join('|') : '[a-zA-Z/%³µ]+';
  return new RegExp(
    `(?:${names})(?:[^\\n\\r]*?\\n*|\\s*[:=]?\\s*)(?:(?:method|calculated|measured|automated|rapid)[^\\n\\r]*\\n*)?((?:negative|positive|non\\-reactive|reactive)|\\b[0-9\\.,]+\\b)(?:\\s*(?:${units}))?\\s*(?:([0-9\\.,]+\\s*-\\s*[0-9\\.,]+|[<>]=?\\s*[0-9\\.,]+|negative|normal))?`,
    'i'
  );
};

const PARAMETER_RULES: ParameterRule[] = [
  // --- 1. HEMATOLOGY / CBC ---
  {
    name: 'Hemoglobin',
    category: 'Hematology',
    unit: 'g/dL',
    defaultRef: '13.0 - 17.5 g/dL',
    pattern: makeTabularOrLinePattern(['hemoglobin', 'haemoglobin', '\\bhb\\b'], ['g\\/dl']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 13.0;
      const max = parsed?.max ?? 17.5;
      const activeRange = ref || `${min} - ${max} g/dL`;
      if (isNaN(num)) return { status: 'Needs Review', flag: 'NEEDS_REVIEW', legacyStatus: 'Attention', refRange: activeRange, refMin: min, refMax: max, explanation: 'Unclear reading, requires manual review.' };
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num < min) { status = 'Below Range'; flag = 'LOW'; legacyStatus = 'Abnormal'; }
      else if (num > max) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      return {
        status, flag, legacyStatus, refRange: activeRange, refMin: min, refMax: max,
        explanation: status === 'Below Range' ? `Hemoglobin (${num} g/dL) is below reference target (${activeRange}). May indicate mild anemia.` : status === 'Above Range' ? `Hemoglobin (${num} g/dL) is elevated above laboratory target (${activeRange}).` : `Hemoglobin (${num} g/dL) is in the healthy range.`
      };
    }
  },
  {
    name: 'Total Leucocyte Count (TLC)',
    category: 'Hematology',
    unit: 'Cells/cu.mm',
    defaultRef: '4,000 - 10,000 Cells/cu.mm',
    pattern: makeTabularOrLinePattern(['total\\s*leucocyte\\s*count', 'total\\s*wbc', '\\btlc\\b', 'white\\s*blood\\s*cell', 'leukocyte'], ['cells?\\/cu\\.mm', '\\/cumm', '\\/uL']),
    evaluate: (val, ref) => {
      const num = parseFloat(String(val).replace(/,/g, ''));
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 4000;
      const max = parsed?.max ?? 10000;
      const activeRange = ref || '4,000 - 10,000 Cells/cu.mm';
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num < min) { status = 'Below Range'; flag = 'LOW'; legacyStatus = 'Abnormal'; }
      else if (num > max) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      return {
        status, flag, legacyStatus, refRange: activeRange, refMin: min, refMax: max,
        explanation: status === 'Above Range' ? `Total WBC (${num} Cells/cu.mm) is elevated above reference (${activeRange}); common in immune response, minor infection, or inflammation.` : status === 'Below Range' ? `Total WBC (${num} Cells/cu.mm) is below laboratory target (${activeRange}).` : `White blood cell count is within healthy reference limits.`
      };
    }
  },
  {
    name: 'Neutrophils',
    category: 'Hematology',
    unit: '%',
    defaultRef: '40 - 80 %',
    pattern: makeTabularOrLinePattern(['neutrophils?'], ['%']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 40;
      const max = parsed?.max ?? 80;
      const activeRange = ref || `${min} - ${max} %`;
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num < min) { status = 'Below Range'; flag = 'LOW'; legacyStatus = 'Abnormal'; }
      else if (num > max) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      return { status, flag, legacyStatus, refRange: activeRange, refMin: min, refMax: max, explanation: `Neutrophils (${num}%) are ${status === 'Within Reference Range' ? 'normal' : status.toLowerCase()}.` };
    }
  },
  {
    name: 'Lymphocytes',
    category: 'Hematology',
    unit: '%',
    defaultRef: '20 - 40 %',
    pattern: makeTabularOrLinePattern(['lymphocytes?'], ['%']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 20;
      const max = parsed?.max ?? 40;
      const activeRange = ref || `${min} - ${max} %`;
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num < min) { status = 'Below Range'; flag = 'LOW'; legacyStatus = 'Abnormal'; }
      else if (num > max) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      return { status, flag, legacyStatus, refRange: activeRange, refMin: min, refMax: max, explanation: `Lymphocytes (${num}%) are ${status === 'Within Reference Range' ? 'normal' : status.toLowerCase()}.` };
    }
  },
  {
    name: 'Eosinophils',
    category: 'Hematology',
    unit: '%',
    defaultRef: '1 - 6 %',
    pattern: makeTabularOrLinePattern(['eosinophils?'], ['%']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 1;
      const max = parsed?.max ?? 6;
      const activeRange = ref || `${min} - ${max} %`;
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num < min) { status = 'Below Range'; flag = 'LOW'; legacyStatus = 'Abnormal'; }
      else if (num > max) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      return { status, flag, legacyStatus, refRange: activeRange, refMin: min, refMax: max, explanation: `Eosinophils (${num}%) are ${status === 'Within Reference Range' ? 'normal' : status.toLowerCase()}.` };
    }
  },
  {
    name: 'Platelet Count',
    category: 'Hematology',
    unit: 'Lac cells/mm³',
    defaultRef: '1.5 - 4.5 Lac cells/mm³',
    pattern: makeTabularOrLinePattern(['platelet\\s*count', 'total\\s*platelets?'], ['lac\\s*cells?\\/mm³', '\\/cumm', '\\/uL']),
    evaluate: (val, ref) => {
      const num = parseFloat(String(val).replace(/,/g, ''));
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 1.5;
      const max = parsed?.max ?? 4.5;
      const activeRange = ref || `${min} - ${max} Lac cells/mm³`;
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num < min) { status = 'Below Range'; flag = 'LOW'; legacyStatus = 'Abnormal'; }
      else if (num > max) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      return {
        status, flag, legacyStatus, refRange: activeRange, refMin: min, refMax: max,
        explanation: status === 'Below Range' ? `Platelet count (${num}) is below target (${activeRange}); consult your physician.` : `Platelet count (${num}) is within safe limits.`
      };
    }
  },
  {
    name: 'Mean Platelet Volume (MPV)',
    category: 'Hematology',
    unit: 'fL',
    defaultRef: '7.4 - 12.0 fL',
    pattern: makeTabularOrLinePattern(['mean\\s*platelet\\s*volume', 'mpv'], ['fl']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 7.4;
      const max = parsed?.max ?? 12.0;
      const activeRange = ref || `${min} - ${max} fL`;
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num < min) { status = 'Below Range'; flag = 'LOW'; legacyStatus = 'Abnormal'; }
      else if (num > max) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      return { status, flag, legacyStatus, refRange: activeRange, refMin: min, refMax: max, explanation: `Mean platelet volume (${num} fL) is ${status.toLowerCase()}.` };
    }
  },
  {
    name: 'Total RBC Count',
    category: 'Hematology',
    unit: 'Million cells/µL',
    defaultRef: '3.8 - 4.8 Million cells/µL',
    pattern: makeTabularOrLinePattern(['red\\s*blood\\s*cell.*?count', 'total\\s*rbc', '\\brbc\\b'], ['million\\s*cells?\\/µl', 'mill\\/cumm']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 3.8;
      const max = parsed?.max ?? 4.8;
      const activeRange = ref || `${min} - ${max} Million cells/µL`;
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num < min) { status = 'Below Range'; flag = 'LOW'; legacyStatus = 'Abnormal'; }
      else if (num > max) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      return { status, flag, legacyStatus, refRange: activeRange, refMin: min, refMax: max, explanation: `Red blood cell count (${num} Million cells/µL) is ${status.toLowerCase()}.` };
    }
  },
  {
    name: 'Packed Cell Volume (PCV)',
    category: 'Hematology',
    unit: '%',
    defaultRef: '36.0 - 46.0 %',
    pattern: makeTabularOrLinePattern(['packed\\s*cell\\s*volume', 'hematocrit', '\\bpcv\\b'], ['%']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 36.0;
      const max = parsed?.max ?? 46.0;
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num < min) { status = 'Below Range'; flag = 'LOW'; legacyStatus = 'Abnormal'; }
      else if (num > max) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      return { status, flag, legacyStatus, refRange: ref || `${min} - ${max} %`, refMin: min, refMax: max, explanation: `Packed cell volume (${num}%) is ${status.toLowerCase()}.` };
    }
  },
  {
    name: 'Mean Corpuscular Volume (MCV)',
    category: 'Hematology',
    unit: 'fL',
    defaultRef: '80 - 100 fL',
    pattern: makeTabularOrLinePattern(['mean\\s*corpuscular\\s*volume', '\\bmcv\\b'], ['fl']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 80;
      const max = parsed?.max ?? 100;
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num < min) { status = 'Below Range'; flag = 'LOW'; legacyStatus = 'Abnormal'; }
      else if (num > max) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      return { status, flag, legacyStatus, refRange: ref || `${min} - ${max} fL`, refMin: min, refMax: max, explanation: `MCV (${num} fL) is ${status.toLowerCase()}.` };
    }
  },
  {
    name: 'Mean Corpuscular Hemoglobin (MCH)',
    category: 'Hematology',
    unit: 'pg',
    defaultRef: '27 - 32 pg',
    pattern: makeTabularOrLinePattern(['mean\\s*corpuscular\\s*hemoglobin(?!\\s*concentration)', '\\bmch\\b(?!c)'], ['pg']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 27;
      const max = parsed?.max ?? 32;
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num < min) { status = 'Below Range'; flag = 'LOW'; legacyStatus = 'Abnormal'; }
      else if (num > max) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      return { status, flag, legacyStatus, refRange: ref || `${min} - ${max} pg`, refMin: min, refMax: max, explanation: `MCH (${num} pg) is ${status.toLowerCase()}.` };
    }
  },
  {
    name: 'Mean Corpuscular Hb Concentration (MCHC)',
    category: 'Hematology',
    unit: 'g/dL',
    defaultRef: '32 - 35 g/dL',
    pattern: makeTabularOrLinePattern(['mean\\s*corpuscular\\s*hb\\s*concentration', '\\bmchc\\b'], ['g\\/dl']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 32;
      const max = parsed?.max ?? 35;
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num < min) { status = 'Below Range'; flag = 'LOW'; legacyStatus = 'Abnormal'; }
      else if (num > max) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      return { status, flag, legacyStatus, refRange: ref || `${min} - ${max} g/dL`, refMin: min, refMax: max, explanation: `MCHC (${num} g/dL) is ${status.toLowerCase()}.` };
    }
  },
  {
    name: 'Red Cell Distribution Width (RDW)',
    category: 'Hematology',
    unit: '%',
    defaultRef: '11.5 - 14.5 %',
    pattern: makeTabularOrLinePattern(['red\\s*cell\\s*distribution\\s*width', '\\brdw\\b'], ['%']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 11.5;
      const max = parsed?.max ?? 14.5;
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num < min) { status = 'Below Range'; flag = 'LOW'; legacyStatus = 'Abnormal'; }
      else if (num > max) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      return { status, flag, legacyStatus, refRange: ref || `${min} - ${max} %`, refMin: min, refMax: max, explanation: `RDW (${num}%) is ${status.toLowerCase()}.` };
    }
  },
  {
    name: 'Absolute Neutrophil Count',
    category: 'Hematology',
    unit: 'Cells/cu.mm',
    defaultRef: '2.0 - 7.0 Cells/cu.mm',
    pattern: makeTabularOrLinePattern(['absolute\\s*neutrophil\\s*count'], ['cells?\\/cu\\.mm', '\\/cumm']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 2.0;
      const max = parsed?.max ?? 7.0;
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num < min) { status = 'Below Range'; flag = 'LOW'; legacyStatus = 'Abnormal'; }
      else if (num > max) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      return { status, flag, legacyStatus, refRange: ref || `${min} - ${max} Cells/cu.mm`, refMin: min, refMax: max, explanation: `Absolute Neutrophil Count (${num} Cells/cu.mm) is ${status.toLowerCase()}.` };
    }
  },
  {
    name: 'Absolute Lymphocyte Count',
    category: 'Hematology',
    unit: 'Cells/cu.mm',
    defaultRef: '1.0 - 3.0 Cells/cu.mm',
    pattern: makeTabularOrLinePattern(['absolute\\s*lymphocytes?\\s*count'], ['cells?\\/cu\\.mm', '\\/cumm']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 1.0;
      const max = parsed?.max ?? 3.0;
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num < min) { status = 'Below Range'; flag = 'LOW'; legacyStatus = 'Abnormal'; }
      else if (num > max) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      return { status, flag, legacyStatus, refRange: ref || `${min} - ${max} Cells/cu.mm`, refMin: min, refMax: max, explanation: `Absolute Lymphocyte Count (${num} Cells/cu.mm) is ${status.toLowerCase()}.` };
    }
  },
  {
    name: 'Absolute Eosinophil Count',
    category: 'Hematology',
    unit: 'Cells/cu.mm',
    defaultRef: '0.02 - 0.5 Cells/cu.mm',
    pattern: makeTabularOrLinePattern(['absolute\\s*eosinophil\\s*count'], ['cells?\\/cu\\.mm', '\\/cumm']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 0.02;
      const max = parsed?.max ?? 0.5;
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num < min) { status = 'Below Range'; flag = 'LOW'; legacyStatus = 'Abnormal'; }
      else if (num > max) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      return { status, flag, legacyStatus, refRange: ref || `${min} - ${max} Cells/cu.mm`, refMin: min, refMax: max, explanation: `Absolute Eosinophil Count (${num} Cells/cu.mm) is ${status.toLowerCase()}.` };
    }
  },

  // --- 2. MICROBIOLOGY & RAPID TESTS ---
  {
    name: 'Malaria Parasite (MP)',
    category: 'Microbiology',
    unit: '',
    defaultRef: 'Negative',
    pattern: makeTabularOrLinePattern(['malaria\\s*parasite(?:\\s*\\(mp\\))?'], []),
    evaluate: (val) => {
      const isNeg = String(val).toLowerCase().includes('neg');
      return {
        status: isNeg ? 'Within Reference Range' : 'Above Range',
        flag: isNeg ? 'NORMAL' : 'HIGH',
        legacyStatus: isNeg ? 'Normal' : 'Abnormal',
        refRange: 'Negative',
        refMin: null,
        refMax: null,
        explanation: `Malaria Parasite test result is ${val}.`
      };
    }
  },
  {
    name: 'Typhoid (Widal) Test',
    category: 'Microbiology',
    unit: '',
    defaultRef: 'Negative',
    pattern: makeTabularOrLinePattern(['typhoid\\s*\\(widal\\)\\s*test', 'widal\\s*test'], []),
    evaluate: (val) => {
      const isNeg = String(val).toLowerCase().includes('neg');
      return {
        status: isNeg ? 'Within Reference Range' : 'Above Range',
        flag: isNeg ? 'NORMAL' : 'HIGH',
        legacyStatus: isNeg ? 'Normal' : 'Abnormal',
        refRange: 'Negative',
        refMin: null,
        refMax: null,
        explanation: `Typhoid Widal test result is ${val}.`
      };
    }
  },
  {
    name: 'Dengue Rapid Card (NS1 / IgG / IgM)',
    category: 'Microbiology',
    unit: '',
    defaultRef: 'Negative',
    pattern: makeTabularOrLinePattern(['dengue\\s*(?:ns1|igg|igm|rapid\\s*card)'], []),
    evaluate: (val) => {
      const isNeg = String(val).toLowerCase().includes('neg');
      return {
        status: isNeg ? 'Within Reference Range' : 'Above Range',
        flag: isNeg ? 'NORMAL' : 'HIGH',
        legacyStatus: isNeg ? 'Normal' : 'Abnormal',
        refRange: 'Negative',
        refMin: null,
        refMax: null,
        explanation: `Dengue screen result is ${val}.`
      };
    }
  },

  // --- 3. LIPID PROFILE ---
  {
    name: 'Total Cholesterol',
    category: 'Lipid Profile',
    unit: 'mg/dL',
    defaultRef: '< 200 mg/dL',
    pattern: makeTabularOrLinePattern(['total\\s*cholesterol'], ['mg\\/dl']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const max = parsed?.max ?? 200;
      const activeRange = ref || '< 200 mg/dL';
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num >= 240) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Abnormal'; }
      else if (num >= max) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      return {
        status, flag, legacyStatus, refRange: activeRange, refMin: 0, refMax: max,
        explanation: status !== 'Within Reference Range' ? `Total cholesterol (${num} mg/dL) is higher than recommended (${activeRange}).` : `Total cholesterol is optimal.`
      };
    }
  },
  {
    name: 'Triglycerides',
    category: 'Lipid Profile',
    unit: 'mg/dL',
    defaultRef: '< 150 mg/dL',
    pattern: makeTabularOrLinePattern(['triglycerides?', 'tg'], ['mg\\/dl']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const max = parsed?.max ?? 150;
      const activeRange = ref || '< 150 mg/dL';
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num >= 200) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Abnormal'; }
      else if (num >= max) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      return {
        status, flag, legacyStatus, refRange: activeRange, refMin: 0, refMax: max,
        explanation: status !== 'Within Reference Range' ? `Triglycerides (${num} mg/dL) are elevated (${activeRange}).` : `Triglycerides are normal.`
      };
    }
  },
  {
    name: 'HDL Cholesterol',
    category: 'Lipid Profile',
    unit: 'mg/dL',
    defaultRef: '> 40 mg/dL',
    pattern: makeTabularOrLinePattern(['\\bhdl\\b', 'high\\s*density'], ['mg\\/dl']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 40;
      const activeRange = ref || '> 40 mg/dL';
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num < min) { status = 'Below Range'; flag = 'LOW'; legacyStatus = 'Attention'; }
      return {
        status, flag, legacyStatus, refRange: activeRange, refMin: min, refMax: null,
        explanation: status === 'Below Range' ? `HDL (${num} mg/dL) is below optimal (${activeRange}). Regular exercise helps boost protective HDL.` : `HDL cholesterol is protective and healthy.`
      };
    }
  },
  {
    name: 'LDL Cholesterol',
    category: 'Lipid Profile',
    unit: 'mg/dL',
    defaultRef: '< 100 mg/dL',
    pattern: makeTabularOrLinePattern(['\\bldl\\b', 'low\\s*density'], ['mg\\/dl']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const max = parsed?.max ?? 100;
      const activeRange = ref || '< 100 mg/dL';
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num >= 130) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Abnormal'; }
      else if (num >= max) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      return {
        status, flag, legacyStatus, refRange: activeRange, refMin: 0, refMax: max,
        explanation: status !== 'Within Reference Range' ? `LDL (${num} mg/dL) exceeds optimal target (${activeRange}).` : `LDL cholesterol is optimal.`
      };
    }
  },

  // --- 4. METABOLIC & DIABETES ---
  {
    name: 'Fasting Blood Sugar',
    category: 'Metabolic & Diabetes',
    unit: 'mg/dL',
    defaultRef: '70 - 99 mg/dL',
    pattern: makeTabularOrLinePattern(['fasting\\s*(?:blood\\s*)?sugar', 'glucose\\s*fasting', '\\bfbs\\b'], ['mg\\/dl']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 70;
      const max = parsed?.max ?? 99;
      const activeRange = ref || '70 - 99 mg/dL';
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num >= 126) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Abnormal'; }
      else if (num > max) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      else if (num < min) { status = 'Below Range'; flag = 'LOW'; legacyStatus = 'Attention'; }
      return {
        status, flag, legacyStatus, refRange: activeRange, refMin: min, refMax: max,
        explanation: num >= 126 ? `Fasting blood sugar (${num} mg/dL) indicates hyperglycemia (≥ 126 mg/dL).` : status === 'Above Range' ? `Fasting sugar (${num} mg/dL) is in the impaired/prediabetic range (${activeRange}).` : `Fasting blood sugar is in the normal target range.`
      };
    }
  },
  {
    name: 'HbA1c',
    category: 'Metabolic & Diabetes',
    unit: '%',
    defaultRef: '< 5.7 %',
    pattern: makeTabularOrLinePattern(['\\bhba1c\\b', 'glycated'], ['%']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const max = parsed?.max ?? 5.7;
      const activeRange = ref || '< 5.7 %';
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num >= 6.5) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Abnormal'; }
      else if (num >= 5.7) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      return {
        status, flag, legacyStatus, refRange: activeRange, refMin: 0, refMax: max,
        explanation: num >= 6.5 ? `HbA1c (${num}%) indicates diabetic range (≥ 6.5%). Consult your doctor.` : status === 'Above Range' ? `HbA1c (${num}%) indicates prediabetes range (5.7 - 6.4%).` : `HbA1c (${num}%) is normal.`
      };
    }
  },

  // --- 5. THYROID, RENAL, MINERALS & VITAMINS ---
  {
    name: 'TSH',
    category: 'Thyroid',
    unit: 'uIU/mL',
    defaultRef: '0.4 - 4.5 uIU/mL',
    pattern: makeTabularOrLinePattern(['\\btsh\\b', 'thyroid\\s*stimulating'], ['uiu\\/ml', 'mIU\\/L']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 0.4;
      const max = parsed?.max ?? 4.5;
      const activeRange = ref || '0.4 - 4.5 uIU/mL';
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num > max) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      else if (num < min) { status = 'Below Range'; flag = 'LOW'; legacyStatus = 'Attention'; }
      return {
        status, flag, legacyStatus, refRange: activeRange, refMin: min, refMax: max,
        explanation: status !== 'Within Reference Range' ? `TSH (${num} uIU/mL) is outside typical reference targets (${activeRange}); discuss thyroid function with your physician.` : `Thyroid stimulating hormone (${num} uIU/mL) is within target range.`
      };
    }
  },
  {
    name: 'Serum Creatinine',
    category: 'Kidney Function',
    unit: 'mg/dL',
    defaultRef: '0.6 - 1.2 mg/dL',
    pattern: makeTabularOrLinePattern(['creatinine', 'serum\\s*creatinine'], ['mg\\/dl']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 0.6;
      const max = parsed?.max ?? 1.2;
      const activeRange = ref || '0.6 - 1.2 mg/dL';
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = 'Normal';
      if (num > 1.3) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Abnormal'; }
      else if (num > max) { status = 'Above Range'; flag = 'HIGH'; legacyStatus = 'Attention'; }
      else if (num < min) { status = 'Below Range'; flag = 'LOW'; legacyStatus = 'Attention'; }
      return {
        status, flag, legacyStatus, refRange: activeRange, refMin: min, refMax: max,
        explanation: status === 'Above Range' ? `Creatinine (${num} mg/dL) is elevated above standard reference (${activeRange}); kidney evaluation advised.` : `Serum creatinine (${num} mg/dL) is within normal kidney targets.`
      };
    }
  },
  {
    name: 'Serum Calcium',
    category: 'Electrolytes & Minerals',
    unit: 'mg/dL',
    defaultRef: '8.5 - 10.5 mg/dL',
    pattern: makeTabularOrLinePattern(['calcium', 'serum\\s*calcium'], ['mg\\/dl']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 8.5;
      const max = parsed?.max ?? 10.5;
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = num > max ? 'Above Range' : num < min ? 'Below Range' : 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = num > max ? 'HIGH' : num < min ? 'LOW' : 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = status === 'Within Reference Range' ? 'Normal' : 'Attention';
      return { status, flag, legacyStatus, refRange: ref || '8.5 - 10.5 mg/dL', refMin: min, refMax: max, explanation: `Serum calcium (${num} mg/dL) is ${status.toLowerCase()}.` };
    }
  },
  {
    name: 'Erythrocyte Sedimentation Rate (ESR)',
    category: 'Hematology',
    unit: 'mm/hr',
    defaultRef: '0 - 20 mm/hr',
    pattern: makeTabularOrLinePattern(['\\besr\\b', 'erythrocyte\\s*sedimentation'], ['mm\\/hr']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const max = parsed?.max ?? 20;
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = num > max ? 'Above Range' : 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = num > max ? 'HIGH' : 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = num > max ? 'Attention' : 'Normal';
      return { status, flag, legacyStatus, refRange: ref || '0 - 20 mm/hr', refMin: 0, refMax: max, explanation: `ESR (${num} mm/hr) is ${status === 'Above Range' ? 'elevated, indicating potential inflammation' : 'normal'}.` };
    }
  },
  {
    name: 'Vitamin D (25-OH)',
    category: 'Micronutrients',
    unit: 'ng/mL',
    defaultRef: '30 - 100 ng/mL',
    pattern: makeTabularOrLinePattern(['vitamin\\s*d', '25\\s*hydroxy'], ['ng\\/ml']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 30;
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = num < min ? 'Below Range' : 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = num < min ? 'LOW' : 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = num < 20 ? 'Abnormal' : num < min ? 'Attention' : 'Normal';
      return { status, flag, legacyStatus, refRange: ref || '30 - 100 ng/mL', refMin: min, refMax: 100, explanation: `Vitamin D (${num} ng/mL) indicates ${status === 'Below Range' ? 'deficiency/insufficiency' : 'adequate levels'}.` };
    }
  },
  {
    name: 'Vitamin B12',
    category: 'Micronutrients',
    unit: 'pg/mL',
    defaultRef: '211 - 911 pg/mL',
    pattern: makeTabularOrLinePattern(['vitamin\\s*b12', 'b12'], ['pg\\/ml']),
    evaluate: (val, ref) => {
      const num = parseFloat(val);
      const parsed = parseReferenceRange(ref);
      const min = parsed?.min ?? 211;
      let status: 'Within Reference Range' | 'Above Range' | 'Below Range' = num < min ? 'Below Range' : 'Within Reference Range';
      let flag: 'NORMAL' | 'HIGH' | 'LOW' = num < min ? 'LOW' : 'NORMAL';
      let legacyStatus: 'Normal' | 'Abnormal' | 'Attention' = num < min ? 'Attention' : 'Normal';
      return { status, flag, legacyStatus, refRange: ref || '211 - 911 pg/mL', refMin: min, refMax: 911, explanation: `Vitamin B12 (${num} pg/mL) is ${status === 'Below Range' ? 'lower than standard target' : 'normal'}.` };
    }
  }
];

/**
 * Recomputes summary counts and deterministic health score based on user verification or parameter updates
 */
export const recomputeReportScores = (parameters: ReportParameter[]) => {
  const total = parameters.length;
  const verified = parameters.filter(p => p.isVerified !== false && p.status !== 'Needs Review');
  const verifiedCount = verified.length;

  const inRange = verified.filter(p => p.status === 'Within Reference Range' || p.flag === 'NORMAL');
  const aboveRange = verified.filter(p => p.status === 'Above Range' || p.flag === 'HIGH');
  const belowRange = verified.filter(p => p.status === 'Below Range' || p.flag === 'LOW');
  const needsReview = parameters.filter(p => p.status === 'Needs Review' || p.flag === 'NEEDS_REVIEW' || p.isVerified === false);

  const expectedPanelBreadth = Math.max(8, total);
  const completenessPercent = Math.min(100, Math.round((verifiedCount / expectedPanelBreadth) * 100));

  const dataCompleteness = {
    analyzed: verifiedCount,
    expected: expectedPanelBreadth,
    percentage: completenessPercent,
    statusText: `${completenessPercent}% Data Completeness (${verifiedCount} of ${expectedPanelBreadth} panel biomarkers verified)`
  };

  const summaryCounts = {
    total,
    verifiedCount,
    inRange: inRange.length,
    inRangePercent: verifiedCount > 0 ? Math.round((inRange.length / verifiedCount) * 100) : 0,
    aboveRange: aboveRange.length,
    aboveRangePercent: verifiedCount > 0 ? Math.round((aboveRange.length / verifiedCount) * 100) : 0,
    belowRange: belowRange.length,
    belowRangePercent: verifiedCount > 0 ? Math.round((belowRange.length / verifiedCount) * 100) : 0,
    needsReview: needsReview.length,
    needsReviewPercent: total > 0 ? Math.round((needsReview.length / total) * 100) : 0
  };

  if (verifiedCount < 3) {
    return {
      healthScore: null,
      scoreStatus: 'Score Unavailable — More Verified Data Needed',
      scoreFormula: 'Calculation requires at least 3 verified clinical parameters to establish a reliable baseline.',
      scoreMethodology: 'To prevent clinical misinterpretation, Jivexa Health OS requires a minimum of 3 verified laboratory parameters before computing an informational index.',
      dataCompleteness,
      summaryCounts
    };
  }

  const outOfRangeCount = aboveRange.length + belowRange.length;
  const deductions = (outOfRangeCount * 14) + (needsReview.length * 4);
  const healthScore = Math.max(40, Math.min(100, 100 - deductions));

  let scoreStatus = 'Optimal';
  if (healthScore < 65) scoreStatus = 'Needs Review';
  else if (healthScore < 85) scoreStatus = 'Requires Attention';

  const scoreFormula = `Base (100) - (${outOfRangeCount} Deviations × 14) - (${needsReview.length} Uncertain × 4) = ${healthScore}/100`;
  const scoreMethodology = `Informational Biomarker Index: Computed deterministically from ${verifiedCount} verified laboratory parameters evaluated directly against laboratory reference intervals. ${inRange.length} of ${verifiedCount} parameters are within target range (${summaryCounts.inRangePercent}%).`;

  return {
    healthScore,
    scoreStatus,
    scoreFormula,
    scoreMethodology,
    dataCompleteness,
    summaryCounts
  };
};

/**
 * Deep Clinical Document Analyzer with Real-Time LLM & Local Deterministic Extraction
 */
export const processAndAnalyzeReport = async (
  fileName: string,
  rawContentText: string
): Promise<AIReportAnalysisResult> => {
  const textToAnalyze = (rawContentText || '').trim();
  const detectedDate = extractDateFromText(textToAnalyze);

  // 1. Try Backend LLM Document Analyzer API
  try {
    const backendBase = getBackendUrl();
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('jivexa_node_jwt_token') : null;
    const res = await fetch(`${backendBase}/api/ai/analyze-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      credentials: 'include',
      body: JSON.stringify({ fileName, documentText: textToAnalyze })
    });

    if (res.ok) {
      const data = await res.json();
      
      // Fake / Non-Clinical Document Warning Guardrail
      if (data.isValidReport === false) {
        return {
          id: `rep_${Date.now()}`,
          reportId: `rep_${Date.now()}`,
          reportTitle: fileName,
          reportDate: detectedDate,
          healthScore: null,
          scoreStatus: 'Needs Review',
          summary: `⚠️ Fake / Non-Clinical Document Warning: ${data.invalidReason || 'The uploaded file does not contain valid clinical lab parameters. Please upload an authentic medical lab report (PDF/Image) to receive 100% accurate health analysis.'}`,
          normalFindings: [],
          abnormalFindings: [],
          attentionParameters: [],
          withinRange: [],
          aboveRange: [],
          belowRange: [],
          needsReview: [],
          possibleFactors: ['Document is non-medical, blurry, or downloaded from an unverified source.'],
          questionsForDoctor: ['Obtain an official clinical lab report from a certified lab.'],
          lifestyleSuggestions: ['Upload a valid clinical PDF or high-res image report.'],
          disclaimer: 'JIVEXA AI invalid document detection guardrail.',
          analyzedAt: new Date().toLocaleDateString()
        };
      }

      return {
        id: data.reportId || `rep_${Date.now()}`,
        reportId: data.reportId || `rep_${Date.now()}`,
        reportTitle: data.reportTitle || fileName,
        reportDate: data.reportDate || detectedDate,
        healthScore: typeof data.healthScore === 'number' ? data.healthScore : null,
        scoreStatus: data.scoreStatus || (data.aiStatus === 'AI_NOT_CONFIGURED' ? 'Pending AI Configuration' : 'Unanalyzed'),
        scoreFormula: data.scoreFormula || '',
        scoreMethodology: data.scoreMethodology || '',
        dataCompleteness: data.dataCompleteness,
        summaryCounts: data.summaryCounts,
        aiStatus: data.aiStatus || 'AI_NOT_CONFIGURED',
        extractionStatus: data.extractionStatus || 'REPORT_EXTRACTION_COMPLETE',
        summary: data.summary || '',
        parameters: data.parameters || [],
        normalFindings: data.normalFindings || [],
        abnormalFindings: data.abnormalFindings || [],
        attentionParameters: data.attentionParameters || [],
        withinRange: data.withinRange || [],
        aboveRange: data.aboveRange || [],
        belowRange: data.belowRange || [],
        needsReview: data.needsReview || [],
        possibleFactors: Array.isArray(data.possibleFactors) ? data.possibleFactors : [],
        questionsForDoctor: Array.isArray(data.questionsForDoctor) ? data.questionsForDoctor : [],
        lifestyleSuggestions: Array.isArray(data.lifestyleRecommendations) ? data.lifestyleRecommendations : [],
        disclaimer: data.disclaimer || 'Educational healthcare information only.',
        analyzedAt: new Date().toLocaleDateString()
      };
    }
  } catch (e) {
    console.warn('[Report Analyzer] Backend AI endpoint unavailable, using local deterministic engine:', e);
  }

  // 2. Local Deterministic Extraction Fallback
  const reportId = `rep_analysis_${Date.now()}`;
  const analyzedAt = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  const disclaimer =
    'AI-generated information is for educational purposes and should be reviewed with a qualified healthcare professional. This analysis is not a formal medical diagnosis or prescription.';

  const parameters: ReportParameter[] = [];
  const normalFindings: ReportParameter[] = [];
  const abnormalFindings: ReportParameter[] = [];
  const attentionParameters: ReportParameter[] = [];
  const withinRange: ReportParameter[] = [];
  const aboveRange: ReportParameter[] = [];
  const belowRange: ReportParameter[] = [];
  const needsReview: ReportParameter[] = [];

  let normalizedText = textToAnalyze;
  normalizedText = normalizedText.replace(/\bT\s+est\b/gi, 'Test');
  normalizedText = normalizedText.replace(/\bT\s+otal\b/gi, 'Total');
  normalizedText = normalizedText.replace(/\bL\s+ymphocytes?\b/gi, 'Lymphocytes');
  normalizedText = normalizedText.replace(/\bV\s+olume\b/gi, 'Volume');
  normalizedText = normalizedText.replace(/\bW\s+idal\b/gi, 'Widal');
  normalizedText = normalizedText.replace(/\bHAEMA\s+T\s+OLOGY\b/gi, 'HAEMATOLOGY');
  normalizedText = normalizedText.replace(/(\d)[ \t]+(\d(?:\.\d+)?)/g, '$1$2');

  if (normalizedText.length > 20) {
    for (const rule of PARAMETER_RULES) {
      const match = normalizedText.match(rule.pattern);
      if (match && match[1]) {
        const rawVal = match[1].trim();
        const rawRef = (match[2] && /[0-9\-–—<>]|negative|normal/i.test(match[2])) ? match[2].trim() : (match[4] ? match[4].trim() : '');
        const evalResult = rule.evaluate(rawVal, rawRef);
        const numericVal = parseFloat(rawVal.replace(/,/g, ''));
        const isQualitative = /negative|positive|non-reactive|reactive/i.test(rawVal);
        const isVerified = (isQualitative || !isNaN(numericVal)) && evalResult.status !== 'Needs Review';

        const paramObj: ReportParameter = {
          name: rule.name,
          value: rule.unit ? `${rawVal} ${rule.unit}` : rawVal,
          numericValue: isNaN(numericVal) ? null : numericVal,
          unit: rule.unit,
          referenceRange: evalResult.refRange || rawRef || rule.defaultRef,
          refMin: evalResult.refMin,
          refMax: evalResult.refMax,
          status: evalResult.status,
          flag: evalResult.flag,
          category: rule.category,
          isVerified,
          sourcePage: 1,
          reportDate: detectedDate,
          simpleExplanation: evalResult.explanation
        };

        parameters.push(paramObj);

        if (evalResult.legacyStatus === 'Abnormal') abnormalFindings.push(paramObj);
        else if (evalResult.legacyStatus === 'Attention') attentionParameters.push(paramObj);
        else normalFindings.push(paramObj);

        if (evalResult.status === 'Within Reference Range') withinRange.push(paramObj);
        else if (evalResult.status === 'Above Range') aboveRange.push(paramObj);
        else if (evalResult.status === 'Below Range') belowRange.push(paramObj);
        else needsReview.push(paramObj);
      }
    }
  }

  const totalDetected = parameters.length;

  if (totalDetected === 0) {
    return {
      id: reportId,
      reportId: `rep_${Date.now()}`,
      reportTitle: fileName,
      reportDate: detectedDate,
      healthScore: null,
      scoreStatus: 'Needs Review',
      extractionStatus: 'EXTRACTION_FAILED',
      aiStatus: 'AI_TEMPORARILY_UNAVAILABLE',
      summary:
        '⚠️ OCR Confidence Low / Unreadable Document: No valid laboratory test parameters were detected in the uploaded file text. Please upload a clearer digital PDF or high-resolution image report to ensure accurate medical parsing.',
      parameters: [],
      normalFindings: [],
      abnormalFindings: [],
      attentionParameters: [],
      withinRange: [],
      aboveRange: [],
      belowRange: [],
      needsReview: [],
      possibleFactors: [
        'OCR text confidence is too low to extract laboratory values.',
        'The document may be blurred, low-resolution, or non-medical.'
      ],
      questionsForDoctor: [
        'Can I obtain a digital PDF copy of my lab results directly from the laboratory portal?'
      ],
      lifestyleSuggestions: [
        'Re-upload a clear high-resolution digital PDF or uncompressed photo of your medical report.'
      ],
      disclaimer,
      analyzedAt
    };
  }

  const scores = recomputeReportScores(parameters);
  const extractionStatus = totalDetected >= 3 ? 'EXTRACTION_SUCCESSFUL' : 'EXTRACTION_PARTIALLY_SUCCESSFUL';

  return {
    id: reportId,
    reportId: `rep_${Date.now()}`,
    reportTitle: fileName,
    reportDate: detectedDate,
    healthScore: scores.healthScore,
    scoreStatus: scores.scoreStatus,
    scoreFormula: scores.scoreFormula,
    scoreMethodology: scores.scoreMethodology,
    dataCompleteness: scores.dataCompleteness,
    summaryCounts: scores.summaryCounts,
    aiStatus: 'AI_TEMPORARILY_UNAVAILABLE',
    extractionStatus,
    summary: `Verified ${scores.summaryCounts.verifiedCount} of ${totalDetected} laboratory parameters from document text. ${scores.summaryCounts.inRange} within target range (${scores.summaryCounts.inRangePercent}%). AI clinical interpretation is unavailable because the backend service could not be reached.`,
    parameters,
    normalFindings,
    abnormalFindings,
    attentionParameters,
    withinRange,
    aboveRange,
    belowRange,
    needsReview,
    possibleFactors: [],
    questionsForDoctor: [],
    lifestyleSuggestions: [],
    disclaimer: 'Extracted raw laboratory parameters only. AI clinical interpretation is unavailable.',
    analyzedAt
  };
};
