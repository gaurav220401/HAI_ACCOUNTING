# Website Knowledge Base Chatbot — Development Plan
### Stack: Gemini API (LLM + Embeddings) + MongoDB Atlas Vector Search (Vector DB)

---

## 1. Architecture Overview

```
Website Content
      │
      ▼
Content Ingestion Script (scrape/parse pages)
      │
      ▼
Chunking (split into paragraphs/sections)
      │
      ▼
Embedding via Gemini Embedding API (text-embedding-004)
      │
      ▼
Store vectors + text in MongoDB Atlas (Vector Search index)
      │
      ▼
User asks question on website widget
      │
      ▼
Backend embeds question → MongoDB Atlas vector search
→ retrieves top-K relevant chunks
      │
      ▼
Chunks + question sent to Gemini LLM (generateContent)
      │
      ▼
Answer returned → shown in chat widget
```

**Core components:**
- **LLM:** Gemini API (e.g. `gemini-2.0-flash` or latest available flash/pro model)
- **Embeddings:** Gemini `text-embedding-004` (or latest embedding model)
- **Vector DB:** MongoDB Atlas (Vector Search feature, free M0 cluster tier)
- **Backend:** Node.js (Express) or Python (FastAPI) — REST API
- **Frontend:** Lightweight chat widget (HTML/JS or React component) embedded via script tag

---

## 2. Two-Phase Development Plan

### **Phase 1 — Data Ingestion & Vector Database Setup**

**Goal:** Get your website content properly collected, chunked, embedded, and stored in MongoDB Atlas as a searchable vector store. By the end of this phase, your knowledge base "exists" and can be queried directly (e.g. via a script or MongoDB Atlas UI/Compass), even without a chat interface yet.

**Tasks:**
1. Set up Gemini API access and MongoDB Atlas cluster (see Setup section below).
2. Write a **content collection script**:
   - Scrape live URLs, or accept exported/pasted text/HTML from your website pages.
   - Clean the raw text (strip nav bars, footers, ads, boilerplate — keep only real content).
3. Write a **chunking script**:
   - Split cleaned content into chunks (e.g. 300–500 tokens, slight overlap between chunks).
   - Attach metadata to each chunk: source URL, page title, section heading, timestamp.
4. Write an **embedding script**:
   - Call the Gemini embedding API (`text-embedding-004` or latest) for every chunk.
   - Store each result as a document in MongoDB Atlas: `{ text, embedding, source_url, title, metadata }`.
5. Create the **MongoDB Atlas Vector Search index**:
   - Index the embedding field, matching Gemini's embedding vector dimensions.
   - Choose similarity metric (cosine similarity is the standard default).
6. Verify the data manually:
   - Run a raw `$vectorSearch` query directly (script or Atlas UI) with a sample embedding.
   - Confirm the right chunks come back for a few known questions.
7. Build a small re-ingestion/update process — so when website content changes, chunks get re-embedded and updated (not duplicated).

**Deliverable:** A populated, indexed MongoDB Atlas vector store containing your website's knowledge, confirmed to return correct results on direct vector search queries — no chat/LLM/UI involved yet.

---

### **Phase 2 — Query Pipeline, LLM Integration & Chat Interface**

**Goal:** Build the retrieval + generation logic on top of your Phase 1 vector store, and give users a real chat interface to interact with it — on your website.

**Tasks:**
1. Build the backend **query pipeline**:
   - Accept a user's question via an API endpoint (e.g. `POST /api/chat`).
   - Embed the question using the same Gemini embedding model used in Phase 1.
   - Run `$vectorSearch` on MongoDB Atlas to fetch the top-K most relevant chunks.
   - Construct a prompt combining retrieved chunks + the user's question.
   - Call Gemini's `generateContent` to produce a grounded natural-language answer.
   - Return the answer (plus optionally the source URLs used) as the API response.
2. Add guardrails to the query pipeline:
   - Fallback message when no chunk is relevant enough (avoid hallucinated answers).
   - Basic rate limiting / abuse protection.
   - Logging of incoming questions and which chunks were retrieved (for future tuning).
3. Build the **chat interface (widget)**:
   - Floating chat bubble → expandable chat window, in HTML/JS or React.
   - Handles sending questions to `/api/chat`, showing loading state, displaying the answer, keeping in-session chat history.
   - Embeddable via a single `<script>` tag so it can drop into any page on your website.
4. Deploy the backend (Render/Railway/Fly.io free tier) and point the widget at the deployed API URL.
5. Embed the widget into your live website pages.
6. Polish: branding/styling, mobile responsiveness, typing indicators, error states.
7. (Optional) Add simple analytics — most-asked questions, low-confidence/no-match queries — to identify gaps to fill back in Phase 1's knowledge base.

**Deliverable:** A fully working, embedded chat widget on your website that takes user questions, retrieves relevant content from your Phase 1 vector store, and returns grounded answers via Gemini.

---

## 3. Test Cases

### Phase 1 Test Cases (Data Ingestion & Vector Database)

| # | Test Case | Expected Result |
|---|---|---|
| 1 | Run content collection script on a sample page/URL | Clean text extracted, boilerplate (nav/footer/ads) excluded |
| 2 | Run chunking script on cleaned content | Chunks are reasonably sized (e.g. 300–500 tokens), with slight overlap, and metadata (source URL, title) attached correctly |
| 3 | Run embedding script on chunks | Each chunk gets a valid embedding vector matching Gemini's expected output dimensions |
| 4 | Check MongoDB Atlas collection after ingestion | Documents exist with correct fields: `text`, `embedding`, `source_url`, `metadata` |
| 5 | Confirm Vector Search index is active in Atlas | Index status shows "Active"/ready, dimensions and similarity metric match embedding config |
| 6 | Run a raw `$vectorSearch` query using a known sample question's embedding | Correct/expected chunk(s) returned, ranked at or near the top |
| 7 | Re-run ingestion after editing a source page's content | Old chunk is updated/replaced in MongoDB, not duplicated |
| 8 | Ingest a page with little/no real content (e.g. mostly images) | Script handles gracefully — skips or logs it, doesn't crash or store empty embeddings |
| 9 | Check embedding/storage cost or quota usage after a batch ingestion run | Usage stays within Gemini free-tier and MongoDB Atlas free-tier limits for prototype scale |

### Phase 2 Test Cases (Query Pipeline & Chat Interface)

| # | Test Case | Expected Result |
|---|---|---|
| 1 | Send a question to `/api/chat` that directly matches ingested content | Correct, grounded answer returned, based on the actual retrieved chunk |
| 2 | Send a question with different wording, same meaning as ingested content | Same correct chunk retrieved and answered correctly (tests semantic search, not just keywords) |
| 3 | Send a question unrelated to any website content | Bot responds that it doesn't have relevant info, does not hallucinate an answer |
| 4 | Send a malformed/empty request to `/api/chat` | API returns a clean error response, doesn't crash |
| 5 | Check end-to-end response latency | Answer returned within acceptable time for prototype use (e.g. under ~3–5 seconds) |
| 6 | Load the chat widget on a test page | Chat bubble renders correctly, opens/closes as expected |
| 7 | Ask a question through the widget UI | Answer displays correctly in the chat window, matching the API-level test result |
| 8 | Ask multiple questions in one session | Each answered independently; chat history displays correctly in order |
| 9 | Test widget on a mobile viewport | Widget is responsive and fully usable on small screens |
| 10 | Simulate backend API downtime while using the widget | Widget shows a graceful error message, not a broken/frozen UI |
| 11 | Spam multiple rapid requests through the widget | Rate limiting kicks in server-side, no crash, reasonable error shown to user |
| 12 | Embed widget on multiple different website pages | Loads and behaves consistently everywhere it's placed |
| 13 | Review server-side logs after a test session | Questions and retrieved chunks are logged correctly for future analysis |

---

## 4. Setup Instructions

### Step 1: Gemini API Setup
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Sign in with a Google account and generate an API key (free tier available).
3. Note the key — you'll store it as an environment variable, never hard-code it.
4. Confirm access to:
   - A chat/generation model (e.g. `gemini-2.0-flash` or latest available).
   - The embedding model (e.g. `text-embedding-004` or latest available).

*(Model names change over time — check Google's current Gemini API docs for the latest available model IDs before building.)*

### Step 2: MongoDB Atlas Setup
1. Create a free account at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas).
2. Create a new **free M0 cluster** (no cost).
3. Create a database (e.g. `chatbot_db`) and a collection (e.g. `kb_chunks`).
4. In Atlas, go to **Search → Create Search Index → Vector Search** on the `kb_chunks` collection:
   - Define the index on your embedding field (set correct vector dimensions matching Gemini's embedding output size).
   - Choose cosine similarity (or dot product) as the similarity metric.
5. Get your connection string (URI) from Atlas — you'll use this in your backend, stored as an environment variable.
6. Whitelist your IP (or `0.0.0.0/0` temporarily for prototype-only testing).

### Step 3: Backend Project Setup
1. Choose Node.js or Python (either works fine with Gemini + MongoDB).
2. Install dependencies:
   - Node: `express`, `mongodb`, `@google/generative-ai` (or equivalent Gemini SDK), `dotenv`, `cors`
   - Python: `fastapi`, `uvicorn`, `pymongo`, `google-generativeai`, `python-dotenv`
3. Create a `.env` file (never commit this) with:
   ```
   GEMINI_API_KEY=your_key_here
   MONGODB_URI=your_connection_string_here
   ```
4. Set up the basic project structure:
   ```
   /ingest        → scripts to chunk + embed + store content
   /server        → API server (chat endpoint, vector search logic)
   /widget        → frontend chat widget files
   .env
   ```

### Step 4: Local Development Testing
1. Run ingestion script locally against a few sample pages first (per Phase 1).
2. Start the backend server locally.
3. Test `/api/chat` with curl or Postman before building any UI.

### Step 5: Hosting (Free Tier, for Phase 2)
1. Push backend code to GitHub.
2. Deploy on **Render** or **Railway** free tier, adding the same environment variables (`GEMINI_API_KEY`, `MONGODB_URI`) in their dashboard.
3. Update the widget's API URL to point to the deployed backend.
4. Embed the widget script tag into your website's HTML/CMS.

---

## 5. Notes for the Prototype Stage
- Start with a **small subset** of website content (e.g. 5–10 key pages) for Phase 1 — don't ingest the whole site until the pipeline is proven.
- Keep chunk sizes moderate; too large hurts retrieval precision, too small loses context.
- Track your Gemini API and MongoDB Atlas free-tier usage limits as you scale content and traffic.
- Log failed/low-confidence retrievals during testing — these reveal gaps in your knowledge base content.
