# JIVEXA HEALTH OS — API INTEGRATION GUIDE

This document provides a comprehensive inventory and configuration guide for every external and internal API service integrated into the **Jivexa Health OS** architecture.

---

## 1. External & Internal API Inventory

### Integration 1: Google Gemini AI (Health Assistant Chatbot & Lab Report Analyzer)

- **Provider Name:** Google Generative AI / Google Gemini
- **SDK & Package:** `@google/generative-ai` (`^0.24.1`)
- **Backend Service Path:** [`backend/src/services/aiService.js`](file:///d:/Jivexa/backend/src/services/aiService.js)
- **Backend Controller Path:** [`backend/src/controllers/aiController.js`](file:///d:/Jivexa/backend/src/controllers/aiController.js)
- **Backend Guardrail Path:** [`backend/src/services/healthGuardrail.js`](file:///d:/Jivexa/backend/src/services/healthGuardrail.js)
- **Backend Routes Involved:**
  - `POST /api/ai/chat` (Real-time SSE token-by-token streaming with multi-layered health guardrail)
  - `POST /api/ai/analyze-report` (Structured clinical document analysis in JSON mode with spam/non-medical document rejection)
  - `GET /api/ai/usage` (Token usage and subscription tier tracking)
  - `POST /api/ai/upgrade` (User tier upgrade endpoint)
  - `GET /api/ai/metrics` (System AI health metrics and error logs)
  - `GET /api/ai/conversations` (Cross-session chat history retrieval)
- **Frontend Client Path:**
  - [`Frontend/src/services/ai.ts`](file:///d:/Jivexa/Frontend/src/services/ai.ts) (`streamAIHealthAssistant`, `fetchBackendConversations`)
  - [`Frontend/src/services/ai/reportAnalyzer.ts`](file:///d:/Jivexa/Frontend/src/services/ai/reportAnalyzer.ts) (`processAndAnalyzeReport`)
- **Required Environment Variables:**
  - `GEMINI_API_KEY`: Google AI Studio API key (Required for live AI responses).
  - `GEMINI_MODEL`: Model name (Default: `gemini-2.5-flash`; automatic fallback cascade to `gemini-1.5-flash`, `gemini-2.0-flash`, `gemini-3.8-flash`).
- **Current Integration Status:** **INTEGRATED & VERIFIED WITH GUARDRAILS (Key Unset by Default)**
  - When `GEMINI_API_KEY` is not provided, the service enters graceful degradation, returning a user-friendly configuration message without server crashes.
  - Health guardrails (108/112 emergency redirect, off-topic refusal, ambiguous clarification) execute locally with 0 token consumption.
- **Environment Configuration:**
  - **Local Development:** Configure in `backend/.env`.
  - **Production Deployment (Render):** Set `GEMINI_API_KEY` and `GEMINI_MODEL` under Render Environment Variables.
- **MVP Requirement:** **CRITICAL CORE FEATURE (MVP)**.

---

### Integration 2: MongoDB Atlas Database (Mongoose ODM)

- **Provider Name:** MongoDB Atlas / Mongoose
- **SDK & Package:** `mongoose` (`^9.11.2`)
- **Backend Config Path:** [`backend/src/config/db.js`](file:///d:/Jivexa/backend/src/config/db.js)
- **Backend Service Path:** [`backend/src/services/mongoDbService.js`](file:///d:/Jivexa/backend/src/services/mongoDbService.js)
- **Backend Models:**
  - [`User.js`](file:///d:/Jivexa/backend/src/models/User.js) (Multi-role authentication, accounts, profiles, usage)
  - [`HealthId.js`](file:///d:/Jivexa/backend/src/models/HealthId.js) (Digital Health IDs and emergency clinical profiles)
  - [`Appointment.js`](file:///d:/Jivexa/backend/src/models/Appointment.js) (Consultation bookings and notes)
  - [`Prescription.js`](file:///d:/Jivexa/backend/src/models/Prescription.js) (Digital e-prescriptions and medication plans)
  - [`PharmacyOrder.js`](file:///d:/Jivexa/backend/src/models/PharmacyOrder.js) (Medicine delivery orders)
  - [`AmbulanceRequest.js`](file:///d:/Jivexa/backend/src/models/AmbulanceRequest.js) (108 emergency GPS dispatches)
  - [`Conversation.js`](file:///d:/Jivexa/backend/src/models/Conversation.js) (Persistent AI chat histories)
- **Required Environment Variables:**
  - `MONGO_URI`: MongoDB connection string (`mongodb+srv://<username>:<password>@<cluster>.mongodb.net/jivexa?retryWrites=true&w=majority`).
- **Current Integration Status:** **INTEGRATED & VERIFIED (Degraded Mode Supported)**
  - When unconfigured, backend boots into `DEGRADED` mode without crashing, reporting `DISCONNECTED` on `/api/health`.
  - Demo Health IDs and guardrails remain functional.
- **Environment Configuration:**
  - **Local Development:** Configure in `backend/.env`.
  - **Production Deployment (Render):** Set `MONGO_URI` under Render Environment Variables.
- **MVP Requirement:** **CRITICAL CORE FEATURE (MVP)**.

---

### Integration 3: SMTP Email Verification & Notifications (Nodemailer)

- **Provider Name:** Nodemailer (SMTP / Gmail / SendGrid / Custom Mail Server)
- **SDK & Package:** `nodemailer` (`^9.0.5`)
- **Backend Service Path:** [`backend/src/services/emailService.js`](file:///d:/Jivexa/backend/src/services/emailService.js)
- **Backend Controller Path:** [`backend/src/controllers/authController.js`](file:///d:/Jivexa/backend/src/controllers/authController.js)
- **Backend Routes Involved:**
  - `POST /api/auth/send-otp`
  - `POST /api/auth/resend-verification`
- **Required Environment Variables (Optional):**
  - `SMTP_HOST`: e.g. `smtp.gmail.com`
  - `SMTP_PORT`: e.g. `587`
  - `SMTP_SECURE`: `false` (or `true` for port 465)
  - `SMTP_USER`: SMTP username or Gmail address
  - `SMTP_PASS`: SMTP password or Gmail App Password
  - `SMTP_FROM`: Sender string, e.g. `"JIVEXA Health" <support@jivexa.com>`
- **Current Integration Status:** **CONFIGURED WITH ZERO-CRASH LOCAL FALLBACK**
  - If SMTP credentials are not configured, the service logs verification URLs directly to the server terminal.
- **Environment Configuration:**
  - **Local Development:** Optional in `backend/.env`.
  - **Production Deployment (Render):** Recommended for live email delivery.
- **MVP Requirement:** **OPTIONAL (Local fallback sufficient for launch)**.

---

### Integration 4: Digital Health ID (JHID / ABHA Lookup)

- **Provider Name:** Native JIVEXA Health ID Subsystem
- **Backend Controller Path:** [`backend/src/controllers/healthIdController.js`](file:///d:/Jivexa/backend/src/controllers/healthIdController.js)
- **Backend Routes Involved:**
  - `POST /api/health-id` (Create unique digital Health ID for patient)
  - `GET /api/health-id/me` (Retrieve authenticated patient's Health ID)
  - `GET /api/health-id/search?healthId=:id` (Emergency badge public/authenticated lookup)
- **Frontend Client Path:** [`Frontend/src/services/healthIdService.ts`](file:///d:/Jivexa/Frontend/src/services/healthIdService.ts)
- **Required Environment Variables:** Handled via `MONGO_URI`.
- **Current Integration Status:** **WORKING & VERIFIED**
  - Instant demo sample lookups (e.g. `JXV-STVAZREW`) work out of the box even without active DB connection.
- **MVP Requirement:** **CRITICAL CORE FEATURE (MVP)**.

---

### Integration 5: Clinical Appointments, Prescriptions, Pharmacy & Ambulance APIs

- **Provider Name:** Native JIVEXA Multi-Role Endpoints
- **Backend Controllers:**
  - [`appointmentController.js`](file:///d:/Jivexa/backend/src/controllers/appointmentController.js) (`/api/appointments`)
  - [`prescriptionController.js`](file:///d:/Jivexa/backend/src/controllers/prescriptionController.js) (`/api/prescriptions`)
  - [`pharmacyController.js`](file:///d:/Jivexa/backend/src/controllers/pharmacyController.js) (`/api/pharmacy/orders`)
  - [`ambulanceController.js`](file:///d:/Jivexa/backend/src/controllers/ambulanceController.js) (`/api/ambulance/requests`)
- **Frontend Clients:**
  - [`clinicalService.ts`](file:///d:/Jivexa/Frontend/src/services/clinicalService.ts)
  - [`pharmacyService.ts`](file:///d:/Jivexa/Frontend/src/services/pharmacyService.ts)
  - [`ambulanceService.ts`](file:///d:/Jivexa/Frontend/src/services/ambulanceService.ts)
- **Current Integration Status:** **WORKING & PROTECTED BY JWT AUTHENTICATION**.
- **MVP Requirement:** Integrated and active.

---

## 2. Environment Variables Matrix

| Variable Name | Location | Required for MVP? | Purpose & Description |
|---|---|---|---|
| `PORT` | `backend/.env` | Optional (Default: 4000) | Express server listening port |
| `HOST` | `backend/.env` | Optional (Default: 0.0.0.0) | Host binding interface |
| `NODE_ENV` | `backend/.env` | Recommended (`development`/`production`) | Node environment mode |
| `FRONTEND_URL` | `backend/.env` | Recommended | URL of the frontend app for CORS & email links |
| `MONGO_URI` | `backend/.env` | **Required for DB persistence** | MongoDB Atlas connection string |
| `JWT_SECRET` | `backend/.env` | **Required for Production** | 256-bit secret for signing user auth tokens |
| `GEMINI_API_KEY` | `backend/.env` | **Required for Live AI** | Google AI Studio API key |
| `GEMINI_MODEL` | `backend/.env` | Optional (Default: `gemini-2.5-flash`) | Preferred Gemini model name |
| `OTP_ENABLED` | `backend/.env` | Optional (Default: `false`) | Enables mandatory OTP verification on login/signup |
| `PATIENT_MVP_ONLY` | `backend/.env` | Optional (Default: `true`) | Restricts launch surface to patient modules |
| `SMTP_USER` / `SMTP_PASS` | `backend/.env` | Optional | SMTP credentials for real email delivery |
| `VITE_BACKEND_URL` | `Frontend/.env` | **Required for Frontend** | Backend base URL (e.g. `http://localhost:4000` or Render URL) |
| `VITE_API_BASE_URL` | `Frontend/.env` | Optional | Alias for backend base URL |
| `VITE_API_URL` | `Frontend/.env` | Optional | Alias for backend base URL |

---

## 3. Local Setup Instructions

### Adding Google Gemini API Key:
1. Visit [Google AI Studio](https://aistudio.google.com/) and generate an API key.
2. In the `backend` folder, create `.env` by copying `.env.example`:
   ```bash
   cp backend/.env.example backend/.env
   ```
3. Set your key:
   ```env
   GEMINI_API_KEY=AIzaSyYourRealKeyHere
   GEMINI_MODEL=gemini-2.5-flash
   ```
4. Restart the backend server. The AI Chatbot and Lab Report Analyzer will immediately begin answering live queries.

---

## 4. Deployment Configuration Instructions

### Render (Backend):
1. Open your Web Service dashboard on [Render](https://render.com).
2. Go to **Environment** tab.
3. Add the following environment variables:
   - `NODE_ENV`: `production`
   - `PORT`: `4000`
   - `FRONTEND_URL`: `https://jivexa-one.vercel.app` (or your active Vercel domain)
   - `MONGO_URI`: `mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/jivexa?retryWrites=true&w=majority`
   - `JWT_SECRET`: `<generated-secure-random-string>`
   - `GEMINI_API_KEY`: `<your-google-ai-studio-api-key>`
   - `GEMINI_MODEL`: `gemini-2.5-flash`
   - `OTP_ENABLED`: `false`
   - `PATIENT_MVP_ONLY`: `true`
4. Build Command: `npm install`
5. Start Command: `node src/server.js`

### Vercel (Frontend):
1. Open your Project on [Vercel](https://vercel.com).
2. Go to **Settings** → **Environment Variables**.
3. Add:
   - `VITE_BACKEND_URL`: `https://jivexa-main.onrender.com` (your Render backend URL)
   - `VITE_API_BASE_URL`: `https://jivexa-main.onrender.com`
   - `VITE_PATIENT_MVP_ONLY`: `true`
4. Re-deploy the frontend.
