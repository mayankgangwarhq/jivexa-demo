/**
 * JIVEXA Health OS - Strict Health-Only Guardrail & Safety Engine
 * 
 * Multi-Layered Protection:
 * 1. Pre-Model Input Classification & Topic Validation
 * 2. Ambiguity Detection & Safe Clarification Fallback
 * 3. Emergency Triage Detection (108 / 112)
 * 4. Post-Generation Output Integrity Check
 */

const STANDARD_REFUSAL_MESSAGE = 
  "I'm Jivexa Health AI. I can help with health, medical information, wellness, and healthcare services. Please ask me a health-related question.";

const STANDARD_AMBIGUOUS_CLARIFICATION =
  "I'm Jivexa Health AI, dedicated exclusively to health, medical information, wellness, and healthcare services. If your question is related to a health or medical concern, please provide a few more details so I can assist you safely.";

// ==============================================================================
// 1. EMERGENCY KEYWORDS (Immediate Redirection to 108 / 112)
// ==============================================================================
const EMERGENCY_KEYWORDS = [
  'chest pain', 'crushing chest', 'heart attack', 'difficulty breathing',
  'shortness of breath', 'cannot breathe', 'severe bleeding', 'unconscious',
  'loss of consciousness', 'stroke', 'face drooping', 'slurred speech',
  'paralysis', 'sudden weakness', 'poisoning', 'swallowed poison', 'choking',
  'seizure', 'severe burn', 'head injury', 'suicide', 'suicidal', 'overdose'
];

// ==============================================================================
// 2. CONVERSATIONAL & IDENTITY PATTERNS (Greetings, User Name, Role)
// ==============================================================================
const GREETING_PHRASES = [
  'hi', 'hello', 'hey', 'namaste', 'namaskar', 'good morning', 'good afternoon',
  'good evening', 'adaab', 'kem cho', 'vanakkam', 'pranam', 'how are you',
  'kaise ho', 'kaisa hai', 'kya haal hai', 'sup'
];

const IDENTITY_PATTERNS = [
  /who\s+are\s+you/i,
  /tum\s+kaun\s+ho/i,
  /what\s+can\s+you\s+do/i,
  /aap\s+kya\s+kar\s+sakte\s+ho/i,
  /what\s+is\s+jivexa/i,
  /mera\s+naam/i,
  /mera\s+name/i,
  /what\s+is\s+my\s+name/i,
  /do\s+you\s+know\s+my\s+name/i,
  /my\s+name\s+is/i,
  /call\s+me\s+[A-Za-z]+/i,
  /thank\s+you/i,
  /thanks/i,
  /dhanyawad/i,
  /shukriya/i,
  /\bbye\b/i,
  /\bgoodbye\b/i
];

// ==============================================================================
// 3. EXPLICITLY DISALLOWED NON-HEALTH PATTERNS & KEYWORDS
// ==============================================================================
// A. Programming & Software Development
const PROGRAMMING_KEYWORDS = [
  'javascript', 'typescript', 'java', 'c++', 'c#', 'golang', 'rust',
  'ruby', 'php', 'swift', 'kotlin', 'html', 'css', 'sql', 'bash', 'powershell',
  'array', 'arrays', 'tuple', 'tuples', 'dictionary', 'dictionaries', 'linked list', 'binary tree', 'algorithm', 'algorithms',
  'sorting', 'recursion', 'pointer', 'pointers', 'for loop', 'while loop',
  'function', 'variable', 'object-oriented', 'oop', 'class inheritance',
  'compiler', 'interpreter', 'stack trace', 'syntax error', 'debugging',
  'react', 'angular', 'vue', 'nodejs', 'expressjs', 'mongodb query',
  'git commit', 'github', 'pull request', 'api route', 'unit test',
  'regex', 'regular expression', 'leetcode', 'hackerrank', 'code review',
  'npm install', 'pip install', 'null pointer', 'segmentation fault',
  'memory leak', 'node server', 'coding', 'code script', 'write a program',
  'backend code', 'frontend code'
];

// B. Academic Homework & Pure Mathematics / Physics
const ACADEMIC_MATH_KEYWORDS = [
  'calculus', 'derivative', 'integral', 'differentiation', 'integration',
  'quadratic equation', 'solve for x', 'linear algebra', 'eigenvalue',
  'geometry proof', 'pythagorean theorem', 'trigonometry', 'sin(', 'cos(',
  'matrix multiplication', 'stoichiometry', 'physics homework',
  'chemical equation balancing', 'kinematics problem', 'thermodynamics equation'
];

// C. General Trivia, Creative Writing, Entertainment, Finance, Politics
const OFF_TOPIC_KEYWORDS = [
  'movie review', 'film rating', 'box office', 'celebrity gossip',
  'cricket score', 'ipl match', 'fifa world cup', 'football match',
  'nba finals', 'video game', 'playstation', 'xbox', 'minecraft',
  'cryptocurrency', 'bitcoin', 'ethereum', 'crypto trading', 'stock market',
  'share market', 'invest in stocks', 'travel itinerary', 'tourist places',
  'write a poem', 'write an essay', 'tell me a joke', 'write a story',
  'horoscope', 'astrology prediction', 'election results', 'political party'
];

// D. Prompt Injection & Jailbreak Attempts
const JAILBREAK_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous\s+)?instructions/i,
  /pretend\s+(?:you\s+are|to\s+be)\s+(?:an?\s+)?(?:unrestricted|jailbroken|dan)/i,
  /dan\s+mode/i,
  /system\s+prompt\s+reveal/i,
  /bypass\s+(?:all\s+)?(?:health|safety)\s+restrictions/i,
  /developer\s+mode\s+enabled/i,
  /you\s+are\s+no\s+longer\s+a\s+health\s+ai/i
];

// ==============================================================================
// 4. HEALTHCARE, MEDICAL, WELLNESS & JIVEXA ALLOWLIST KEYWORDS
// ==============================================================================
const HEALTHCARE_KEYWORDS = [
  // General health terms & symptoms
  'health', 'healthy', 'medical', 'clinical', 'symptom', 'symptoms', 'disease',
  'diseases', 'illness', 'condition', 'conditions', 'syndrome', 'treatment',
  'treatments', 'therapy', 'therapies', 'cure', 'prevention', 'preventive',
  'remedy', 'remedies', 'diagnosis', 'dehydration', 'dehydrated', 'hydrate',
  'fever', 'cough', 'cold', 'headache', 'pain', 'ache', 'sore throat', 'nausea',
  'vomiting', 'dizziness', 'fatigue', 'tiredness', 'weakness', 'rash', 'itching',
  'swelling', 'inflammation', 'diarrhea', 'constipation', 'stomach ache',
  'cramp', 'chills', 'sweating', 'congestion', 'runny nose', 'sneezing',
  'shortness of breath', 'back pain', 'joint pain', 'muscle pain',
  // Diseases & Conditions
  'diabetes', 'sugar', 'blood sugar', 'hypertension', 'blood pressure', 'bp',
  'asthma', 'bronchitis', 'pneumonia', 'covid', 'flu', 'influenza', 'malaria',
  'dengue', 'typhoid', 'cholera', 'anemia', 'jaundice', 'hepatitis', 'thyroid',
  'hypothyroidism', 'hyperthyroidism', 'arthritis', 'migraine', 'gerd', 'acidity',
  'gastritis', 'ulcer', 'infection', 'allergy', 'allergic', 'eczema', 'psoriasis',
  'cancer', 'tumor', 'tuberculosis', 'tb', 'insomnia', 'depression', 'anxiety',
  'stress', 'mental health',
  // Anatomy & Organs
  'heart', 'liver', 'kidney', 'lungs', 'stomach', 'brain', 'skin', 'eye', 'ear',
  'nose', 'throat', 'teeth', 'gum', 'bone', 'spine', 'blood', 'artery', 'vein',
  'muscle', 'joint', 'thyroid', 'pancreas', 'gallbladder', 'bladder', 'colon',
  // Medications & Pharmacology
  'medicine', 'medication', 'drug', 'tablet', 'capsule', 'syrup', 'injection',
  'dose', 'dosage', 'prescription', 'paracetamol', 'ibuprofen', 'aspirin',
  'crocin', 'dolo', 'metformin', 'amoxicillin', 'azithromycin', 'antibiotic',
  'antacid', 'omeprazole', 'pantoprazole', 'cetirizine', 'insulin', 'atorvastatin',
  'vitamin', 'supplement', 'calcium', 'iron', 'side effect', 'contraindication',
  // Diagnostics & Lab Reports
  'report', 'reports', 'abnormal', 'biomarker', 'biomarkers', 'parameter', 'parameters',
  'lab', 'labs', 'test', 'tests', 'result', 'results', 'finding', 'findings',
  'lab report', 'blood test', 'test report', 'cbc', 'complete blood count',
  'hemoglobin', 'rbc', 'wbc', 'platelet', 'lipid profile', 'cholesterol',
  'triglycerides', 'hdl', 'ldl', 'hba1c', 'fasting glucose', 'tsh', 'creatinine',
  'urea', 'sgot', 'sgpt', 'bilirubin', 'urine test', 'x-ray', 'mri', 'ct scan',
  'ultrasound', 'ecg', 'biopsy', 'reference range', 'normal range', 'pathology',
  // Wellness, Diet & Prevention
  'diet', 'nutrition', 'exercise', 'workout', 'weight loss', 'weight gain',
  'hydration', 'water intake', 'sleep', 'rest', 'healthy food', 'lifestyle',
  'immunity', 'hygiene', 'preventive', 'vaccine', 'vaccination', 'booster',
  // Healthcare Ecosystem & Jivexa Workflows
  'doctor', 'physician', 'specialist', 'surgeon', 'cardiologist', 'dermatologist',
  'pediatrician', 'orthopedic', 'hospital', 'clinic', 'appointment', 'consultation',
  'pharmacy', 'chemist', 'ambulance', '108', '112', 'emergency', 'first aid',
  // First Aid, Bites & Toxicology
  // Common Hindi symptom terms
  'bukhar', 'khansi', 'sardard', 'dard', 'pet dard', 'gala kharab', 'chakkar', 'ulti', 'dast', 'thakan', 'kamzori', 'sujan',
  'first aid', 'cpr', 'choking', 'burn', 'burns', 'cut', 'wound', 'bleeding',
  'fracture', 'sprain', 'snake', 'snake bite', 'bite', 'insect bite', 'dog bite',
  'antivenom', 'venom', 'poison', 'poisonous', 'heat stroke', 'frostbite',
  'triage', 'abha', 'health id', 'health records', 'jivexa', 'medical history'
];

// ==============================================================================
// 5. AMBIGUOUS TERMS (Require Healthcare Context Validation)
// ==============================================================================

// ==============================================================================
// 5B. MEDICAL FOLLOW-UP PATTERNS & CONTEXT RECOGNITION
// ==============================================================================
const MEDICAL_FOLLOWUP_PATTERNS = [
  // Duration & Timelines (Hindi / Hinglish / English)
  /\b(?:kal|aaj|parso|tarso)\s+(?:se|se\s+hai|ko|ki\s+raat|ki\s+subah)\b/i,
  /\b(?:subah|shaam|dopahar|raat)\s+se\b/i,
  /\b(?:since|from|for)\s+(?:yesterday|today|last\s+night|morning|evening|this\s+morning)\b/i,
  /\b\d+\s*(?:din|dino|ghante|hours|days|weeks|months|saal|hafte|hafate)\s*(?:se|se\s+hai|ago|before|tak)?\b/i,
  /\b(?:for|since)\s+\d+\s*(?:days?|hours?|weeks?|months?)\b/i,
  /\b(?:just\s+started|started\s+yesterday|started\s+today|a\s+few\s+days|couple\s+of\s+days)\b/i,
  
  // Affirmation & Negation responses to doctor follow-up questions
  /^(?:haan|ha|haa|han|ji\s+haan|haanji|yes|yeah|yep|yup|sure)(?:\s+(?:hai|bhi|tha|thi|h|hua))?[.!?]*$/i,
  /^(?:nahi|nahin|na|nhi|no|nope|not\s+really|never)(?:\s+(?:hai|tha|thi|h))?[.!?]*$/i,
  
  // Follow-up symptom qualifiers
  /\b(?:bhi|zyada|jyada|kam|aur|bahut|thoda|thoda\s+sa)\s+(?:hai|dard|pain|lag\s+raha|feel\s+ho\s+raha)?\b/i,
  /\b(?:also|as\s+well|too|worse|better|increasing|decreasing)\b/i,
  /\b(?:khansi|sardard|bukhar|vomit|chills|gala|pet|body\s+pain)\s+bhi\b/i,
  
  // Temperature & severity
  /\b\d{2,3}(?:\.\d)?\s*(?:f|c|degree|degrees|°f|°c)?\b/i,
  /\b(?:mild|moderate|severe|high|low|normal)\b/i
];

/**
 * Detects if recent conversation history has active healthcare context.
 */
const hasRecentHealthcareContext = (history = []) => {
  if (!Array.isArray(history) || history.length === 0) return false;

  const recentTurns = history.slice(-6);
  for (const turn of recentTurns) {
    const text = String(turn?.text || turn?.content || turn?.message || '').toLowerCase();
    if (!text) continue;

    const matched = HEALTHCARE_KEYWORDS.some(kw => {
      const escaped = escapeRegex(kw);
      const regex = new RegExp(`(^|[^a-zA-Z0-9_])${escaped}([^a-zA-Z0-9_]|$)`, 'i');
      return regex.test(text);
    });

    if (matched) return true;
  }

  return false;
};

const AMBIGUOUS_WORDS = [
  'memory', 'bug', 'apple', 'python', 'cache', 'virus', 'tablet', 'cell',
  'organ', 'treatment', 'recovery', 'cleanse', 'cycle', 'filter', 'scan'
];

/**
 * Helper to escape special characters for RegExp
 */
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Clean and normalize text for classification
 */
const normalizeText = (text) => {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * 1. Pre-Model Topic Classifier & Input Validation
 * Evaluates whether user query is allowed, disallowed, ambiguous, or emergency.
 */
const classifyUserQuery = (message, history = []) => {
  if (!message || typeof message !== 'string' || !message.trim()) {
    return {
      status: 'INVALID',
      reason: 'Empty message',
      refusalMessage: 'Please provide a health or medical question.'
    };
  }

  const raw = message.trim();
  const normalized = normalizeText(raw);

  // Guardrail 1: Jailbreak & Prompt Injection Detection
  for (const regex of JAILBREAK_PATTERNS) {
    if (regex.test(raw)) {
      return {
        status: 'DISALLOWED',
        reason: 'Jailbreak or rule bypass attempt',
        refusalMessage: STANDARD_REFUSAL_MESSAGE
      };
    }
  }

  // Guardrail 2: Emergency Symptom Detection (Immediate Life-Safety)
  const isEmergency = EMERGENCY_KEYWORDS.some(kw => normalized.includes(kw));
  if (isEmergency) {
    return {
      status: 'EMERGENCY',
      reason: 'Emergency symptoms detected',
      refusalMessage: `🚨 EMERGENCY WARNING: The symptoms you described require immediate emergency medical care.\n• Call 108 (Ambulance) or 112 (Emergency Services) immediately.\n• Go to the nearest Hospital Emergency Room (ER).\nDo not rely on online advice for acute emergency symptoms.`
    };
  }

  // Guardrail 3: Conversational & Identity Patterns (Greetings, Name, Role)
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const isShortTurn = wordCount <= 12;
  const hasGreetingPhrase = GREETING_PHRASES.some(phrase => {
    const escaped = escapeRegex(phrase);
    const regex = new RegExp(`(^|[^a-zA-Z0-9_])${escaped}([^a-zA-Z0-9_]|$)`, 'i');
    return regex.test(raw);
  });
  const hasIdentityPattern = IDENTITY_PATTERNS.some(pat => pat.test(raw));

  if ((hasGreetingPhrase && isShortTurn) || hasIdentityPattern) {
    return {
      status: 'ALLOWED',
      type: 'CONVERSATIONAL',
      reason: 'Polite greeting, identity, or conversational inquiry'
    };
  }

  // Guardrail 4: Explicit Disallowed Topics Check (Programming, Math, Entertainment)
  const hasProgramming = PROGRAMMING_KEYWORDS.some(kw => {
    const escaped = escapeRegex(kw);
    const regex = new RegExp(`(^|[^a-zA-Z0-9_])${escaped}([^a-zA-Z0-9_]|$)`, 'i');
    return regex.test(raw);
  });

  const hasAcademicMath = ACADEMIC_MATH_KEYWORDS.some(kw => {
    const escaped = escapeRegex(kw);
    const regex = new RegExp(`(^|[^a-zA-Z0-9_])${escaped}([^a-zA-Z0-9_]|$)`, 'i');
    return regex.test(raw);
  });

  const hasOffTopic = OFF_TOPIC_KEYWORDS.some(kw => {
    const escaped = escapeRegex(kw);
    const regex = new RegExp(`(^|[^a-zA-Z0-9_])${escaped}([^a-zA-Z0-9_]|$)`, 'i');
    return regex.test(raw);
  });

  // Check if query contains any confirmed healthcare keyword
  const hasHealthcare = HEALTHCARE_KEYWORDS.some(kw => {
    const escaped = escapeRegex(kw);
    const regex = new RegExp(`(^|[^a-zA-Z0-9_])${escaped}([^a-zA-Z0-9_]|$)`, 'i');
    return regex.test(raw);
  });

  // If query is definitely off-topic and has no healthcare context:
  if ((hasProgramming || hasAcademicMath || hasOffTopic) && !hasHealthcare) {
    return {
      status: 'DISALLOWED',
      reason: hasProgramming ? 'Programming or coding question' : hasAcademicMath ? 'Academic mathematics/physics problem' : 'General off-topic entertainment/finance/trivia',
      refusalMessage: STANDARD_REFUSAL_MESSAGE
    };
  }

  // If query pairs programming and health (e.g. "write a python program for hospital database"),
  // it is STILL a programming request, which is disallowed for the clinical assistant.
  if (hasProgramming) {
    return {
      status: 'DISALLOWED',
      reason: 'Programming or coding question requested',
      refusalMessage: STANDARD_REFUSAL_MESSAGE
    };
  }

  // Guardrail 5: Ambiguous Query Detection
  const hasAmbiguous = AMBIGUOUS_WORDS.some(kw => {
    const escaped = escapeRegex(kw);
    const regex = new RegExp(`(^|[^a-zA-Z0-9_])${escaped}([^a-zA-Z0-9_]|$)`, 'i');
    return regex.test(raw);
  });

  // If query contains an ambiguous word without any healthcare indicator:
  if (hasAmbiguous && !hasHealthcare) {
    return {
      status: 'AMBIGUOUS',
      reason: 'Ambiguous word lacking clinical context',
      refusalMessage: STANDARD_AMBIGUOUS_CLARIFICATION
    };
  }

  // Guardrail 6: General Health Relevance Evaluation
  // If the query has healthcare keywords or refers to symptoms/treatments/wellness:
  if (hasHealthcare) {
    return {
      status: 'ALLOWED',
      type: 'HEALTH',
      reason: 'Valid healthcare query'
    };
  }

  // Guardrail 6b: Contextual Medical Follow-Up Evaluation
  // Evaluates whether this short answer is a valid follow-up to an ongoing medical dialogue
  const hasMedicalContext = hasRecentHealthcareContext(history);
  if (hasMedicalContext) {
    const isFollowupPattern = MEDICAL_FOLLOWUP_PATTERNS.some(pat => pat.test(raw));
    
    // Generic non-medical questions that should NEVER be accepted as medical follow-ups
    const isGenericInquiry = /^(?:who\s+is|who\s+was|what\s+is\s+the\s+capital|how\s+to\s+cook|how\s+to\s+make|tell\s+me\s+about\s+(?:dogs|cats|movies|cricket|crypto|bitcoin)|recipe\s+for|weather\s+in)\b/i.test(raw);

    const words = normalized.split(/\s+/).filter(Boolean);
    const isShortConversationalTurn = words.length <= 12;

    if ((isFollowupPattern || isShortConversationalTurn) && !isGenericInquiry) {
      return {
        status: 'ALLOWED',
        type: 'CONTEXTUAL_FOLLOWUP',
        reason: 'Contextual medical follow-up response in active healthcare dialogue'
      };
    }
  }

  // Short non-health phrases (e.g. "tell me about dogs", "who is the prime minister", "how to make pasta")
  // lacking any healthcare terms
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= 8 && !hasHealthcare) {
    return {
      status: 'DISALLOWED',
      reason: 'Non-health inquiry lacking medical relevance',
      refusalMessage: STANDARD_REFUSAL_MESSAGE
    };
  }

  // Default to AMBIGUOUS for longer unclear queries
  return {
    status: 'AMBIGUOUS',
    reason: 'Unclear query without confirmed medical context',
    refusalMessage: STANDARD_AMBIGUOUS_CLARIFICATION
  };
};

// ==============================================================================
// 6. POST-GENERATION OUTPUT GUARDRAIL (Zero-Leak Output Inspector)
// ==============================================================================
const CODE_OUTPUT_INDICATORS = [
  /```(?:python|javascript|typescript|java|c\+\+|cpp|csharp|golang|rust|ruby|php|sql|html|css|bash)/i,
  /def\s+[a-zA-Z0-9_]+\s*\(/,
  /function\s+[a-zA-Z0-9_]+\s*\(/,
  /console\.log\s*\(/,
  /#include\s*<[a-z.]+>/i,
  /public\s+static\s+void\s+main/i,
  /SELECT\s+.*?\s+FROM\s+/i
];

/**
 * Validates generated AI text before streaming or returning to client.
 * Discards any model hallucinations that generated programming or academic code.
 */
const validateAiOutput = (responseText) => {
  if (!responseText || typeof responseText !== 'string') {
    return { isValid: false, sanitizedText: STANDARD_REFUSAL_MESSAGE };
  }

  for (const indicator of CODE_OUTPUT_INDICATORS) {
    if (indicator.test(responseText)) {
      console.warn('[Health Guardrail Output Warning] AI generated code block detected. Suppressing response.');
      return {
        isValid: false,
        sanitizedText: STANDARD_REFUSAL_MESSAGE
      };
    }
  }

  return {
    isValid: true,
    sanitizedText: responseText
  };
};

module.exports = {
  classifyUserQuery,
  validateAiOutput,
  STANDARD_REFUSAL_MESSAGE,
  STANDARD_AMBIGUOUS_CLARIFICATION,
  EMERGENCY_KEYWORDS,
  HEALTHCARE_KEYWORDS,
  PROGRAMMING_KEYWORDS,
  hasRecentHealthcareContext,
  MEDICAL_FOLLOWUP_PATTERNS
};
