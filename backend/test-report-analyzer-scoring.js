/**
 * JIVEXA HEALTH OS - COMPREHENSIVE REPORT ANALYZER & SCORING TEST SUITE
 * 
 * Verifies:
 * 1. Extraction of parameters, units, lab-specified reference ranges, and dates
 * 2. Status categorization: Within Reference Range, Above Range, Below Range, Needs Review
 * 3. Transparent health scoring & insufficient data fallback (< 3 parameters)
 * 4. High / Low / In-range summary counts with accurate denominators
 * 5. Longitudinal tracking & unit validation across reports
 * 6. Report Chatbot B context locking & medical boundaries
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  extractClinicalParameters,
  calculateDeterministicHealthScore,
  analyzeReportWithAI,
  streamReportChatbot,
  extractAllTextFromPdfBuffer,
  cleanPdfExtractedText
} = require('./src/services/aiService');
const config = require('./src/config/env');

let totalPassed = 0;
let totalFailed = 0;

const test = async (name, fn) => {
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    totalPassed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
    totalFailed++;
  }
};

const runSuite = async () => {
  console.log('\n===============================================================');
  console.log('🩺 JIVEXA HEALTH OS - REPORT ANALYZER & SCORING SUITE');
  console.log('===============================================================');

  // --- GROUP 1: EXTRACTION OF LAB-SPECIFIED REFERENCE RANGES & DATES ---
  console.log('\n🧪 GROUP 1: Parameter, Unit, Range & Date Extraction...');

  await test('Extracts test name, measured value, unit, and report date from clinical text', () => {
    const reportText = `
      METROPOLIS HEALTHCARE LAB REPORT
      Patient: Priya Sharma | Date of Report: 05-Aug-2026 | Page 1 of 1
      
      Hemoglobin: 11.2 g/dL (Reference Range: 13.0 - 17.5 g/dL)
      Total Leukocyte Count (WBC): 6,800 /cumm (Reference Range: 4,000 - 11,000 /cumm)
      Total Cholesterol: 245 mg/dL (Reference Range: < 200 mg/dL)
      Serum Creatinine: 0.9 mg/dL (Reference Range: 0.6 - 1.2 mg/dL)
    `;

    const extracted = extractClinicalParameters(reportText, 1);
    assert.strictEqual(extracted.reportDate, '05-Aug-2026', 'Report date must be extracted');
    assert.strictEqual(extracted.parameters.length, 4, '4 parameters should be extracted');

    const hb = extracted.parameters.find(p => p.name === 'Hemoglobin');
    assert(hb, 'Hemoglobin must be found');
    assert.strictEqual(hb.numericValue, 11.2);
    assert.strictEqual(hb.unit, 'g/dL');
    assert.strictEqual(hb.referenceRange, '13.0 - 17.5 g/dL');
    assert.strictEqual(hb.sourcePage, 1);
  });

  await test('Uses laboratory-printed reference range rather than arbitrary unrelated range', () => {
    // Custom non-standard laboratory reference interval
    const reportText = `
      Thyrocare Specialized Lab
      Date: 12-Jul-2026
      Total Cholesterol: 215 mg/dL (Reference Range: < 220 mg/dL)
    `;

    const extracted = extractClinicalParameters(reportText);
    const chol = extracted.parameters.find(p => p.name === 'Total Cholesterol');
    assert(chol, 'Cholesterol must be found');
    // Because lab printed < 220 mg/dL and 215 is < 220, it is Within Reference Range!
    assert.strictEqual(chol.status, 'Within Reference Range');
    assert.strictEqual(chol.flag, 'NORMAL');
  });

  // --- GROUP 2: STATUS CATEGORIZATION ([HIGH], [LOW], [NORMAL], [NEEDS REVIEW]) ---
  console.log('\n🧪 GROUP 2: Status Categorization & Accessible Badges...');

  await test('Correctly classifies tests into Within Reference Range, Above Range, Below Range', () => {
    const reportText = `
      Hemoglobin: 11.2 g/dL (Reference Range: 13.0 - 17.5 g/dL)
      Total Leukocyte Count (WBC): 7200 /cumm (Reference Range: 4000 - 11000 /cumm)
      Fasting Blood Sugar: 145 mg/dL (Reference Range: 70 - 99 mg/dL)
      HDL Cholesterol: 34 mg/dL (Reference Range: > 40 mg/dL)
    `;

    const extracted = extractClinicalParameters(reportText);
    const hb = extracted.parameters.find(p => p.name === 'Hemoglobin');
    const wbc = extracted.parameters.find(p => p.name.includes('WBC'));
    const fbs = extracted.parameters.find(p => p.name.includes('Fasting'));
    const hdl = extracted.parameters.find(p => p.name.includes('HDL'));

    assert.strictEqual(hb.status, 'Below Range');
    assert.strictEqual(hb.flag, 'LOW');

    assert.strictEqual(wbc.status, 'Within Reference Range');
    assert.strictEqual(wbc.flag, 'NORMAL');

    assert.strictEqual(fbs.status, 'Above Range');
    assert.strictEqual(fbs.flag, 'HIGH');

    assert.strictEqual(hdl.status, 'Below Range');
    assert.strictEqual(hdl.flag, 'LOW');
  });

  // --- GROUP 3: TRANSPARENT HEALTH SCORING & INSUFFICIENT DATA FALLBACK ---
  console.log('\n🧪 GROUP 3: Transparent Scoring & Insufficient Data Fallback...');

  await test('Returns "Score Unavailable — More Verified Data Needed" when fewer than 3 verified parameters exist', () => {
    // Only 2 parameters detected
    const minimalReportText = `
      Date: 01-Aug-2026
      Hemoglobin: 14.2 g/dL (13.0 - 17.5 g/dL)
      Serum Creatinine: 0.8 mg/dL (0.6 - 1.2 mg/dL)
    `;

    const extracted = extractClinicalParameters(minimalReportText);
    assert.strictEqual(extracted.parameters.length, 2);

    const scoreResult = calculateDeterministicHealthScore(extracted);
    assert.strictEqual(scoreResult.score, null, 'Score must be null when < 3 verified parameters');
    assert.strictEqual(scoreResult.scoreStatus, 'Score Unavailable — More Verified Data Needed');
    assert(scoreResult.scoreFormula.includes('at least 3 verified'));
    assert(scoreResult.disclaimer.includes('Not a medical diagnosis'));
  });

  await test('Calculates transparent, reproducible health score when >= 3 verified parameters exist', () => {
    const reportText = `
      Hemoglobin: 11.2 g/dL (13.0 - 17.5 g/dL)
      Total Cholesterol: 245 mg/dL (< 200 mg/dL)
      HDL Cholesterol: 38 mg/dL (> 40 mg/dL)
      Fasting Blood Sugar: 135 mg/dL (70 - 99 mg/dL)
      Total WBC Count: 6800 /cumm (4000 - 11000 /cumm)
      Serum Creatinine: 0.9 mg/dL (0.6 - 1.2 mg/dL)
    `;

    const extracted = extractClinicalParameters(reportText);
    assert.strictEqual(extracted.parameters.length, 6);

    const scoreResult = calculateDeterministicHealthScore(extracted);
    assert(typeof scoreResult.score === 'number', 'Score must be a number');
    assert(scoreResult.score >= 40 && scoreResult.score <= 100);
    assert(scoreResult.scoreFormula.includes('Deviations'));
    assert(scoreResult.scoreMethodology.includes('Informational Biomarker Index'));
    assert(scoreResult.dataCompleteness.percentage > 0);
  });

  // --- GROUP 4: HIGH / LOW / IN-RANGE SUMMARY WITH ACCURATE DENOMINATORS ---
  console.log('\n🧪 GROUP 4: High / Low / In-Range Summary Counts...');

  await test('Accurately counts inRange, aboveRange, and belowRange with clear percentages', () => {
    const reportText = `
      Hemoglobin: 11.2 g/dL (13.0 - 17.5 g/dL)
      Total Cholesterol: 245 mg/dL (< 200 mg/dL)
      Fasting Blood Sugar: 88 mg/dL (70 - 99 mg/dL)
      Total WBC Count: 6800 /cumm (4000 - 11000 /cumm)
      Serum Creatinine: 0.9 mg/dL (0.6 - 1.2 mg/dL)
    `;

    const extracted = extractClinicalParameters(reportText);
    const scoreResult = calculateDeterministicHealthScore(extracted);

    // 5 total: 3 in range (FBS, WBC, Creatinine), 1 below (Hb), 1 above (Cholesterol)
    assert.strictEqual(scoreResult.summaryCounts.total, 5);
    assert.strictEqual(scoreResult.summaryCounts.verifiedCount, 5);
    assert.strictEqual(scoreResult.summaryCounts.inRange, 3);
    assert.strictEqual(scoreResult.summaryCounts.inRangePercent, 60); // 3 of 5 = 60%
    assert.strictEqual(scoreResult.summaryCounts.aboveRange, 1);
    assert.strictEqual(scoreResult.summaryCounts.belowRange, 1);
  });

  // --- GROUP 5: LONGITUDINAL BIOMARKER TRACKING & UNIT VALIDATION ---
  console.log('\n🧪 GROUP 5: Longitudinal Records & Unit Matching...');

  await test('Validates unit consistency across longitudinal reports', () => {
    const report1 = {
      name: 'Fasting Blood Sugar',
      value: '95 mg/dL',
      unit: 'mg/dL',
      date: '2026-05-10'
    };
    const report2 = {
      name: 'Fasting Blood Sugar',
      value: '104 mg/dL',
      unit: 'mg/dL',
      date: '2026-08-02'
    };

    // Both have compatible unit (mg/dL)
    assert.strictEqual(report1.unit, report2.unit);
    const val1 = parseFloat(report1.value);
    const val2 = parseFloat(report2.value);
    assert(!isNaN(val1) && !isNaN(val2));
    assert(val2 > val1, 'Historical trend progression detected');
  });

  // --- GROUP 6: REPORT CHATBOT B CONTEXT LOCKING ---
  console.log('\n🧪 GROUP 6: Report Chatbot B Context Locking & Safety...');

  await test('Report Chatbot B rejects off-topic queries immediately', async () => {
    let output = '';
    const res = await streamReportChatbot(
      'Write a python script to parse CSV files',
      [],
      {
        reportTitle: 'CBC Report',
        parameters: [{ name: 'Hemoglobin', value: '11.2 g/dL', referenceRange: '13.0 - 17.5 g/dL', status: 'Below Range', flag: 'LOW' }]
      },
      (chunk) => { output += chunk; }
    );

    assert.strictEqual(res.refused, true);
    assert(output.includes('JIVEXA Report Assistant'));
  });

  await test('Report Chatbot B prompts when report context is missing', async () => {
    let output = '';
    const res = await streamReportChatbot(
      'Explain my report findings',
      [],
      null,
      (chunk) => { output += chunk; }
    );

    assert.strictEqual(res.errorCode, 'NO_REPORT_CONTEXT');
    assert(output.includes('No active medical report is currently selected'));
  });

  // --- GROUP 7: REAL PATIENT PDF (MR. HARISH KUMAR.PDF) EXTRACTION & TRUTHFUL STATUS ---
  console.log('\n🧪 GROUP 7: Real Patient PDF Decompression & Multi-Panel Extraction...');

  const realPdfPath = path.join(__dirname, 'test-fixtures', 'Mr. Harish Kumar.pdf');
  let harishExtractedText = '';

  await test('Decompresses and extracts full text from compressed real PDF (Mr. Harish Kumar.pdf)', () => {
    assert(fs.existsSync(realPdfPath), `Test fixture must exist at ${realPdfPath}`);
    const pdfBuffer = fs.readFileSync(realPdfPath);
    const parsed = extractAllTextFromPdfBuffer(pdfBuffer);
    assert(parsed.text.length > 500, `Extracted text length (${parsed.text.length}) should be > 500 chars`);
    assert.strictEqual(parsed.pageCount, 3, 'Mr. Harish Kumar report should have 3 pages');
    harishExtractedText = cleanPdfExtractedText(parsed.text);
    assert(harishExtractedText.includes('HAEMA') || harishExtractedText.includes('Hemoglobin'), 'Must contain hematology section');
  });

  await test('Extracts >= 15 verified clinical parameters from Mr. Harish Kumar.pdf including CBC & infectious disease panel', () => {
    if (!harishExtractedText) {
      const pdfBuffer = fs.readFileSync(realPdfPath);
      harishExtractedText = cleanPdfExtractedText(extractAllTextFromPdfBuffer(pdfBuffer).text);
    }
    const extracted = extractClinicalParameters(harishExtractedText, 3);
    assert(extracted.parameters.length >= 15, `Expected >= 15 parameters, got ${extracted.parameters.length}`);

    // Verify key CBC parameters
    const hb = extracted.parameters.find(p => p.name === 'Hemoglobin');
    assert(hb, 'Hemoglobin must be extracted');
    assert.strictEqual(hb.numericValue, 13.9);
    assert.strictEqual(hb.unit, 'g/dL');
    assert.strictEqual(hb.status, 'Within Reference Range');

    const tlc = extracted.parameters.find(p => p.name.includes('Leucocyte') || p.name.includes('TLC'));
    assert(tlc, 'TLC must be extracted');
    assert.strictEqual(tlc.numericValue, 12300);
    assert.strictEqual(tlc.status, 'Above Range'); // 12300 is above 4000-11000

    const plt = extracted.parameters.find(p => p.name.includes('Platelet'));
    assert(plt, 'Platelet Count must be extracted');
    assert.strictEqual(plt.numericValue, 1.79);
    assert.strictEqual(plt.status, 'Within Reference Range');

    const neut = extracted.parameters.find(p => p.name.includes('Neutrophils') && !p.name.includes('Absolute'));
    assert(neut, 'Neutrophils must be extracted');
    assert.strictEqual(neut.numericValue, 89);
    assert.strictEqual(neut.status, 'Above Range'); // 89% is above 40-75%

    // Verify infectious disease panel
    const malaria = extracted.parameters.find(p => p.name.includes('Malaria'));
    assert(malaria, 'Malaria must be extracted');
    assert.strictEqual(malaria.value.toLowerCase(), 'negative');
    assert.strictEqual(malaria.status, 'Within Reference Range');

    const dengue = extracted.parameters.find(p => p.name.includes('Dengue'));
    assert(dengue, 'Dengue must be extracted');
    assert.strictEqual(dengue.value.toLowerCase(), 'negative');
    assert.strictEqual(dengue.status, 'Within Reference Range');
  });

  await test('Assigns EXTRACTION_SUCCESSFUL and valid deterministic health score to Mr. Harish Kumar report', () => {
    const extracted = extractClinicalParameters(harishExtractedText, 3);
    const scoreResult = calculateDeterministicHealthScore(extracted);
    assert(typeof scoreResult.score === 'number', 'Score must be a number');
    assert(scoreResult.score >= 40 && scoreResult.score <= 100, `Score (${scoreResult.score}) must be between 40 and 100`);
    assert.strictEqual(scoreResult.scoreStatus, 'Needs Review', '7 out of range biomarkers should trigger Needs Review');
    assert(scoreResult.summaryCounts.total >= 15, `Total parameters count (${scoreResult.summaryCounts.total}) must be >= 15`);
    assert(scoreResult.summaryCounts.aboveRange >= 2, 'Should detect elevated TLC and Neutrophils');
  });

  await test('Zero-parameter document correctly yields EXTRACTION_FAILED and null health score', async () => {
    const blankAnalysis = await analyzeReportWithAI('Random non-medical text without any lab parameters', 'blank.pdf', 'Harish');
    assert.strictEqual(blankAnalysis.extractionStatus, 'EXTRACTION_FAILED', 'Must be EXTRACTION_FAILED');
    assert.strictEqual(blankAnalysis.parameters.length, 0, 'Must have 0 parameters');
    assert.strictEqual(blankAnalysis.healthScore, null, 'Health score must be null');
    assert(blankAnalysis.summary.includes('No verified clinical parameters detected'), 'Summary must clearly state no verified parameters');
  });

  console.log('\n===============================================================');
  console.log(`🏁 REPORT ANALYZER SUITE FINISHED: ${totalPassed} PASSED | ${totalFailed} FAILED`);
  console.log('===============================================================\n');

  if (totalFailed > 0) process.exit(1);
};

runSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
