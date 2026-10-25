/**
 * Centralized Application TypeScript Type Definitions
 */

export type UserRole = 'PATIENT' | 'DOCTOR' | 'PHARMACY' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  dob?: string;
  onboarded?: boolean;
  avatarUrl?: string;
}

export interface PatientProfile {
  bloodGroup: string;
  allergies: string;
  conditions: string;
  emergencyContact: string;
  configuredAt?: string;
  updatedAt?: string;
  avatarUrl?: string;
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  rating: number;
  location: string;
  availability: string;
  consultationType: 'Video' | 'In-Person' | 'Both';
  fee: number;
  about: string;
}

export interface Pharmacy {
  id: string;
  name: string;
  address: string;
  rating: number;
  deliveryAvailable: boolean;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  doctorSpecialty: string;
  date: string;
  time: string;
  status: 'Pending' | 'Confirmed' | 'In Consultation' | 'Completed' | 'Cancelled' | 'Upcoming';
  notes?: string;
  consultationSummary?: string;
}

export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

export interface Prescription {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  date: string;
  medications: Medication[];
  notes?: string;
  followUpDate?: string;
  status?: 'Draft' | 'Issued' | 'Active' | 'Fulfilled';
}

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  patientId: string;
  patientName: string;
  pharmacyId: string;
  pharmacyName: string;
  items: OrderItem[];
  totalPrice: number;
  status: 'Pending' | 'Confirmed' | 'Processing' | 'Ready' | 'Completed' | 'Cancelled';
  date: string;
  prescriptionId?: string;
}

export interface HealthRecord {
  id: string;
  patientId: string;
  name: string;
  type: 'Lab Report' | 'Prescription' | 'Vaccination' | 'Other';
  date: string;
  fileName: string;
  fileSize: string;
  uploadedBy: 'Patient' | 'Doctor' | 'Lab';
  fileUrl?: string;
}

export interface HealthGoal {
  id: string;
  type: string;
  target: number;
  current: number;
  unit: string;
}

// --- AI MEDICAL REPORT ANALYZER TYPES ---

export interface ReportParameter {
  name: string;
  value: string;
  referenceRange: string;
  unit?: string;
  numericValue?: number | null;
  refMin?: number | null;
  refMax?: number | null;
  status: 'Normal' | 'Abnormal' | 'Attention' | 'Within Reference Range' | 'Above Range' | 'Below Range' | 'Needs Review';
  flag?: 'NORMAL' | 'HIGH' | 'LOW' | 'NEEDS_REVIEW';
  category?: string;
  isVerified?: boolean;
  sourcePage?: number;
  reportDate?: string;
  simpleExplanation: string;
}

export interface AIReportAnalysisResult {
  id: string;
  reportId: string;
  reportTitle: string;
  reportDate?: string;
  healthScore: number | null; // 0 - 100 or null when unanalyzed or insufficient data
  scoreStatus: string;
  scoreFormula?: string;
  scoreMethodology?: string;
  dataCompleteness?: {
    analyzed: number;
    expected: number;
    percentage: number;
    statusText: string;
  };
  summaryCounts?: {
    total: number;
    verifiedCount: number;
    inRange: number;
    inRangePercent: number;
    aboveRange: number;
    aboveRangePercent: number;
    belowRange: number;
    belowRangePercent: number;
    needsReview: number;
    needsReviewPercent: number;
  };
  aiStatus?: string;
  extractionStatus?: string;
  summary: string;
  parameters?: ReportParameter[];
  normalFindings: ReportParameter[];
  abnormalFindings: ReportParameter[];
  attentionParameters: ReportParameter[];
  withinRange?: ReportParameter[];
  aboveRange?: ReportParameter[];
  belowRange?: ReportParameter[];
  needsReview?: ReportParameter[];
  possibleFactors: string[];
  questionsForDoctor: string[];
  lifestyleSuggestions: string[];
  disclaimer: string;
  analyzedAt: string;
}

export interface MedicalReportRecord {
  id: string;
  patientId: string;
  fileName: string;
  fileType: string;
  fileSize: string;
  fileUrl: string;
  uploadedAt: string;
  analysis?: AIReportAnalysisResult;
}

export interface SharedReportRecord {
  id: string;
  reportId: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  sharedAt: string;
  reviewStatus: 'Pending Review' | 'Reviewed' | 'Action Suggested';
  doctorNotes?: string;
  reportTitle: string;
  analysisSummary: string;
  healthScore: number;
}
