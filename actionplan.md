# Project Title: Proactive Bearing Health Dashboard

**Overall Goal:** Develop and deploy a dashboard that provides real-time RUL predictions and actionable insights for monitored bearings, leveraging a CNN-LSTM model.

---

## Phase 0: Foundation & Setup (Week 0-1)

**Goal:** Establish project structure, version control, and initial environment setup.

**Tasks & Milestones:**

*   [x] **Project Scaffolding:**
    *   [x] Initialize Git repository (consider a monorepo structure with `apps/frontend`, `apps/backend-api`, `apps/model-service` or separate repos).
    *   [x] Set up basic `README.md` with project overview and goals.

*   [ ] **Environment Setup (Local):**
    *   Install Node.js (v20+), Python (ensure matching version with model training).
    *   Set up virtual environments for Python projects.
    *   Install Vite, Docker.

*   [x] **Frontend Project Initialization (React + Vite + TypeScript + Tailwind + shadcn/ui):**
    *   [x] Create React project using Vite: `npm create vite@latest frontend -- --template react-ts`.
    *   [x] Install Tailwind CSS: Follow official Tailwind CSS guide for Vite.
    *   [x] Initialize shadcn/ui: `npx shadcn-ui@latest init`.
    *   [x] Install Recharts (or Victory) and Framer Motion.
    *   [x] Set up basic routing (e.g., using `react-router-dom`).
    *   [x] **Milestone:** Basic frontend app running locally with placeholder pages.

*   [ ] **Backend - Model Service (Python + FastAPI):**
    *   Create FastAPI project structure.
    *   Set up `requirements.txt` (`tensorflow`, `scikit-learn`, `pandas`, `numpy`, `fastapi`, `uvicorn`).
    *   Create a placeholder `/health` endpoint.
    *   **Milestone:** Basic FastAPI service running locally.

*   [ ] **Backend - Main API (Node.js/Express OR another FastAPI instance):**
    *   Choose between Node.js/Express or another FastAPI. Set up the basic project.
    *   Create a placeholder `/health` endpoint.
    *   **Milestone:** Basic main API service running locally.

*   [ ] **Database Setup (Supabase):**
    *   Create a new project on Supabase.
    *   Define initial table schemas (e.g., `assets`, `rul_predictions`, `users` if auth needed early).
    *   **Milestone:** Supabase project created, connection strings obtained.

*   [ ] **Essential Model Artifacts Preparation:**
    *   Locate your best trained Keras model file (e.g., `best_cnnlstm_model_ultimate_pipeline.keras`).
    *   Save your `feature_scaler` and `rul_scaler` objects (e.g., using `joblib.dump`).
    *   Document the exact `feature_cols` list and `sequence_length` used for the model.
    *   **Milestone:** Model and scalers are accessible and documented.

*   [ ] **Version Control:**
    *   Commit initial project structures to Git.

---

## Phase 1: Backend - Model Inference & Core API (Week 2-4)

**Goal:** Get the model making predictions via an API and establish core data handling.

**Tasks & Milestones:**

*   [ ] **Model Service - Inference Endpoint (FastAPI):**
    *   Implement logic to load the trained Keras model.
    *   Implement logic to load the `feature_scaler` and `rul_scaler`.
    *   Create a `/predict` endpoint that:
        *   Accepts a sequence of sensor data.
        *   Performs the exact preprocessing (outlier capping based on saved training stats if applicable, feature engineering, scaling with loaded `feature_scaler`).
        *   Makes a prediction using the loaded model.
        *   Performs post-processing (inverse scaling of RUL with loaded `rul_scaler`).
        *   Returns the predicted RUL.
    *   Thoroughly test this endpoint with sample data (manually or with simple scripts).
    *   **Milestone:** Model service can successfully predict RUL from input sequences.

*   [ ] **Model Service - Dockerization:**
    *   Create a `Dockerfile` for the FastAPI model service.
    *   Ensure model files and scalers are included in the Docker image.
    *   **Milestone:** Model service can be built and run as a Docker container.

*   [ ] **Main API - Asset Management:**
    *   Implement CRUD (Create, Read, Update, Delete) endpoints for assets (e.g., `/assets`, `/assets/:id`).
    *   Connect to Supabase to store/retrieve asset metadata.
    *   **Milestone:** Asset information can be managed via the API.

*   [ ] **Main API - RUL Prediction Handling & Storage:**
    *   Create an endpoint (e.g., `/assets/:id/predict_rul`) that:
        *   Accepts new raw sensor data for a specific asset.
        *   Prepares the data (fetches recent history to form a sequence if needed).
        *   Calls the Model Service's `/predict` endpoint.
        *   Stores the predicted RUL along with a timestamp and asset ID in the `rul_predictions` table in Supabase.
    *   **Milestone:** New sensor data can trigger RUL prediction and storage.

*   [ ] **Main API - Data Retrieval Endpoints for Frontend:**
    *   Endpoint to get a list of all assets with their latest RUL.
    *   Endpoint to get historical RUL trend for a specific asset.
    *   Endpoint to get historical input feature trends for a specific asset.
    *   **Milestone:** Frontend has necessary API endpoints to fetch data for display.

*   [ ] **Authentication (Optional - Supabase/Clerk.dev):**
    *   Integrate basic user authentication if required early.
    *   Protect relevant main API endpoints.
    *   **Milestone (if applicable):** Users can register/login, API endpoints are secured.

---

## Phase 2: Frontend - Core Dashboard Implementation (Week 5-8)

**Goal:** Build the main views of the dashboard and connect to the backend API.

**Tasks & Milestones:**

*   [ ] **State Management & Data Fetching (React Query / Zustand):**
    *   Set up React Query for fetching data from the Main API.
    *   Set up Zustand (or preferred state manager) for global UI state if needed.

*   [ ] **Overview / Fleet Health Summary Page:**
    *   Display KPIs (Total Assets, Critical, Warning).
    *   Implement Asset Health List/Table using shadcn/ui Table and Recharts for sparklines (if desired). Make it sortable and clickable.
    *   Implement RUL Distribution Plot using Recharts.
    *   **Milestone:** Overview page displays dynamic data from the backend.

*   [ ] **Asset-Specific Deep Dive Page:**
    *   Implement routing to this page (e.g., `/assets/:id`).
    *   Display Asset Identifiers and prominently show current Predicted RUL.
    *   Implement RUL Trend Plot (Recharts line chart).
    *   Implement Input Feature Trend Plots (multiple Recharts line charts).
    *   Display Current Feature Values Table.
    *   **Milestone:** Asset-specific page shows detailed information and trends for a selected asset.

*   [ ] **Basic Alert Display (if alerts logic started in backend):**
    *   Simple list or table of critical alerts.

*   [ ] **Styling and Responsiveness:**
    *   Ensure all pages are well-styled using Tailwind CSS and shadcn/ui components.
    *   Test for responsiveness on different screen sizes.
    *   **Milestone:** Core dashboard UI is functional, responsive, and visually appealing.

*   [ ] **Interactivity & User Experience:**
    *   Implement smooth navigation.
    *   Add loading states and error handling for API calls (React Query helps a lot here).
    *   Use Framer Motion for subtle animations.
    *   **Milestone:** Dashboard feels polished and user-friendly.

---

## Phase 3: Advanced Features & Refinements (Week 9-11)

**Goal:** Add more sophisticated features, improve diagnostics, and prepare for deployment.

**Tasks & Milestones:**

*   [ ] **Alert & Notification System Enhancement:**
    *   Implement more detailed alert generation logic in the backend (based on RUL thresholds, feature anomalies).
    *   Enhance frontend Alert Center with severity, acknowledgement, etc.
    *   (Optional) Integrate email/SMS notification service if required.

*   [ ] **Model Performance & Diagnostics View (Frontend):**
    *   If you have a mechanism to collect actual failure data and retrain:
        *   Display historical R² / MAE / RMSE.
        *   Plot Actual vs. Predicted RUL for past failures.
    *   Implement Data Drift Monitoring visualization (if backend provides drift metrics).

*   [ ] **Feature Importance Visualization (Advanced - Optional):**
    *   If SHAP/LIME integration is feasible in the model service, create a component to display feature contributions for an asset's RUL prediction.

*   [ ] **User Feedback Mechanism (Optional):**
    *   Simple way for users to report issues or suggest improvements.

*   [ ] **Comprehensive Testing:**
    *   Unit tests for backend logic.
    *   Integration tests for API endpoints.
    *   End-to-end tests for critical frontend user flows (e.g., using Cypress or Playwright).
    *   **Milestone:** Key functionalities are covered by tests.

*   [ ] **Documentation:**
    *   API documentation (FastAPI Swagger UI is a good start).
    *   Basic user guide for the dashboard.
    *   Deployment instructions.

---

## Phase 4: Deployment & Iteration (Week 12+)

**Goal:** Deploy the application and establish a cycle for monitoring and improvement.

**Tasks & Milestones:**

*   [ ] **Frontend Deployment (Vercel/Netlify):**
    *   Configure CI/CD pipeline for the frontend.
    *   **Milestone:** Frontend is live and accessible.

*   [ ] **Backend & Model Service Deployment (Render/Fly.io using Docker):**
    *   Configure CI/CD pipeline for backend services.
    *   Set up environment variables, database connections.
    *   **Milestone:** Backend and model service are live and connected.

*   [ ] **Full System Testing in Staging/Production Environment.**

*   [ ] **Monitoring & Logging:**
    *   Set up basic logging for backend services.
    *   Monitor application performance and errors (e.g., Sentry, New Relic, or platform-specific tools).

*   [ ] **Gather User Feedback.**

*   [ ] **Plan for Model Retraining & Updates:**
    *   Define a strategy for how and when the RUL model will be retrained with new data.

*   [ ] **Iteration:**
    *   Based on feedback and monitoring, plan for V1.1, V1.2, etc.
    *   **Milestone:** Version 1.0 of the dashboard is deployed and operational.
