const mongoose = require('mongoose');

const parameterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
    numericValue: { type: Number },
    unit: { type: String, default: '', trim: true },
    referenceRange: { type: String, default: '', trim: true },
    refMin: { type: Number },
    refMax: { type: Number },
    status: {
      type: String,
      enum: [
        'Normal',
        'Abnormal',
        'Attention',
        'Within Reference Range',
        'Above Range',
        'Below Range',
        'Needs Review'
      ],
      default: 'Within Reference Range'
    },
    flag: {
      type: String,
      enum: ['NORMAL', 'HIGH', 'LOW', 'NEEDS_REVIEW'],
      default: 'NORMAL'
    },
    category: { type: String, default: 'General', trim: true },
    isVerified: { type: Boolean, default: true },
    sourcePage: { type: Number, default: 1 },
    reportDate: { type: String, default: '', trim: true },
    simpleExplanation: { type: String, default: '', trim: true }
  },
  { _id: false }
);

const sharedDoctorSchema = new mongoose.Schema(
  {
    doctorId: { type: String, required: true },
    doctorName: { type: String, default: '' },
    sharedAt: { type: Date, default: Date.now },
    reviewStatus: {
      type: String,
      enum: ['Pending Review', 'Reviewed', 'Discussed'],
      default: 'Pending Review'
    },
    doctorNotes: { type: String, default: '' }
  },
  { _id: false }
);

const medicalReportSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    },
    patientId: {
      type: String,
      required: [true, 'Patient ID is required for medical report records'],
      index: true
    },
    patientName: {
      type: String,
      default: 'Patient',
      trim: true
    },
    fileName: {
      type: String,
      required: [true, 'File name is required'],
      trim: true
    },
    fileSize: {
      type: String,
      default: ''
    },
    reportTitle: {
      type: String,
      default: 'Medical Lab Report',
      trim: true
    },
    reportDate: {
      type: String,
      default: '',
      trim: true
    },
    // Deterministic Informational Biomarker Index (null when unanalyzed or insufficient data)
    healthScore: {
      type: Number,
      default: null,
      min: 0,
      max: 100
    },
    scoreStatus: {
      type: String,
      default: 'Pending Review'
    },
    scoreFormula: {
      type: String,
      default: ''
    },
    scoreMethodology: {
      type: String,
      default: ''
    },
    dataCompleteness: {
      analyzed: { type: Number, default: 0 },
      expected: { type: Number, default: 0 },
      percentage: { type: Number, default: 0 },
      statusText: { type: String, default: '' }
    },
    summaryCounts: {
      total: { type: Number, default: 0 },
      inRange: { type: Number, default: 0 },
      aboveRange: { type: Number, default: 0 },
      belowRange: { type: Number, default: 0 },
      needsReview: { type: Number, default: 0 },
      verifiedCount: { type: Number, default: 0 }
    },
    summary: {
      type: String,
      default: ''
    },
    parameters: [parameterSchema],
    normalFindings: [parameterSchema],
    abnormalFindings: [parameterSchema],
    attentionParameters: [parameterSchema],
    unverifiedParameters: [parameterSchema],
    possibleFactors: [{ type: String, trim: true }],
    questionsForDoctor: [{ type: String, trim: true }],
    lifestyleRecommendations: [{ type: String, trim: true }],
    disclaimer: {
      type: String,
      default: 'Educational healthcare information only. Not a medical diagnosis or substitute for physician evaluation.'
    },
    extractionStatus: {
      type: String,
      enum: [
        'REPORT_UPLOADED',
        'REPORT_EXTRACTION_COMPLETE',
        'REPORT_EXTRACTION_FAILED',
        'REPORT_INTERPRETATION_COMPLETE',
        'REPORT_REQUIRES_REVIEW',
        'EXTRACTION_ATTEMPTED',
        'EXTRACTION_PARTIALLY_SUCCESSFUL',
        'EXTRACTION_SUCCESSFUL',
        'EXTRACTION_FAILED'
      ],
      default: 'EXTRACTION_ATTEMPTED'
    },
    aiStatus: {
      type: String,
      enum: ['AI_READY', 'AI_SUCCESS', 'AI_NOT_CONFIGURED', 'AI_ERROR', 'AI_DETERMINISTIC_FALLBACK', 'AI_TEMPORARILY_UNAVAILABLE'],
      default: 'AI_NOT_CONFIGURED'
    },
    sharedWithDoctors: [sharedDoctorSchema]
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for fast, secure patient and doctor lookups
medicalReportSchema.index({ patientId: 1, createdAt: -1 });
medicalReportSchema.index({ 'sharedWithDoctors.doctorId': 1 });

module.exports = mongoose.model('MedicalReport', medicalReportSchema);
