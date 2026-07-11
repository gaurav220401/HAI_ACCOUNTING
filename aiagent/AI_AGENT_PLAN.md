# HAI Accounting — Full AI Agent & Agentic Workflow Master Plan
> **Project Root**: `c:\Users\somes\Desktop\Haldar\HAI_Accounting`
> **Created**: 2026-07-09
> **Status**: PLANNING — Do NOT implement until a phase is explicitly triggered
> **Purpose**: This document is the single source of truth for all AI Agent features. Every coding agent working on this project MUST read this file before implementing any phase. After completing a phase, update the status field for that phase.

---

## Project Architecture Overview

```
HAI_Accounting/
├── client/                  ← Next.js 14 App Router (TypeScript, Tailwind)
│   ├── app/                 ← Pages (each folder = route)
│   ├── components/          ← Shared UI components
│   ├── lib/api/             ← API client functions (typed fetch wrappers)
│   ├── contexts/            ← React Contexts (Auth, Org, etc.)
│   ├── hooks/               ← Custom React hooks
│   └── stores/              ← State stores
├── backend/                 ← Express + TypeScript API server
│   └── src/
│       ├── app.ts           ← Express app setup
│       ├── routes/          ← Route files (one per domain)
│       │   └── index.ts     ← Central router (registers all routes)
│       ├── controllers/     ← Business logic handlers
│       ├── models/          ← Mongoose models
│       ├── middlewares/     ← Auth, error, etc.
│       ├── chatbot/         ← Gemini embedding + ingest pipeline
│       └── config/          ← DB, Firebase config
└── aiagent/                 ← THIS FOLDER — planning & memory only
    ├── AI_AGENT_PLAN.md     ← This file
    └── PHASE_STATUS.md      ← Updated after each phase completes
```

---

## Technology Stack (Important for implementation)

| Layer | Technology |
|---|---|
| Frontend framework | Next.js 14 (App Router) |
| Frontend language | TypeScript + TSX |
| Styling | Tailwind CSS (utility-first) |
| UI components | shadcn/ui (Radix-based) |
| Icons | lucide-react |
| State | React useState/useEffect, context |
| Backend framework | Express.js (TypeScript) |
| Database | MongoDB with Mongoose |
| AI / LLM | Google Gemini API (`@google/genai`) |
| Auth | Firebase Auth (token in Authorization header) |
| API pattern | REST, all routes under `/api/` |
| Auth middleware | `authenticate` from `src/middlewares/auth` |

---

## Critical Existing Files (Read Before Implementing)

### Frontend
- `client/components/page-header.tsx` — Current header with chatbot bot button (lines 56–68). Chatbot opens here.
- `client/components/chatbot-panel.tsx` — Full chat panel UI (422 lines). Has RAG chat, no memory persistence.
- `client/components/app-sidebar.tsx` — Sidebar nav. Has `navItems[]` array and user footer dropdown.
- `client/lib/api/chatbot.ts` — 45-line API wrapper for `/chat` endpoint.
- `client/lib/api/client.ts` — `apiFetch` and `apiFetchBlob` with Firebase auth token injection.
- `client/lib/api/items.ts` — Full `CreateItemInput` TypeScript interface (reference for item form fields).

### Backend
- `backend/src/routes/index.ts` — Central router. Add new routes here.
- `backend/src/controllers/chat.controller.ts` — 1031-line RAG pipeline. Uses Gemini embeddings + MongoDB vector search. **Do NOT modify the core handleChat logic — only add session persistence around it.**
- `backend/src/routes/chat.routes.ts` — Only has `POST /` for chat. New session routes go in a separate file.
- `backend/src/chatbot/gemini-embeddings.ts` — `getEmbedding(text)` helper.

---

## Complete Feature List

### A. Header & Chatbot UI
1. Remove chatbot bot button from `page-header.tsx`
2. Add HAI logo (`/hailogo.png`) in the header
3. Floating AI button (bottom-right, fixed) opens/closes chatbot
4. Chatbot panel has session open/close toggle for all sections
5. New Chat button in chatbot panel

### B. Chat Memory & RAG History
6. Chat sessions stored in MongoDB (ChatSession model)
7. Session list visible in chatbot panel
8. When session is opened — previous messages loaded and shown
9. Conversation history (last 10 messages) sent to Gemini as context
10. Session auto-named by first user message (first 50 chars)

### C. Sidebar AI Assistant Section
11. New "AI Assistant" sidebar section (above Settings, below Reports)
12. Expandable sub-items: Chat, Agentic Tasks, Agent History
13. Section shows bot icon + "AI Assistant" label
14. Clicking opens `/ai-agent` page

### D. AI Agent Full Page (/ai-agent)
15. Tab: Agent Chat (full chat with history)
16. Tab: Agentic Tasks (5 task types)
17. Tab: Document Automation (visual workflow)
18. Tab: Item Analysis (AI reads items data)
19. Tab: Export / Import (AI-assisted)

### E. Agentic Task: Create Item
20. AI asks user questions → fills item form fields
21. Shows form auto-populating in real-time
22. If data insufficient → AI alerts which fields are missing
23. User previews completed form → confirms → item created via API

### F. Agentic Task: Document Workflow Automation
24. AI chains: Sales Order → Invoice → Bill → Credit → Payment
25. User sees each step's status (pending / in-progress / done / error)
26. AI shows what it is doing at each step in plain English
27. On error: AI tells user what happened + manual steps to fix
28. Server slow: shows "Waiting for server..." spinner

### G. AI Agent reads Item Section
29. AI agent fetches all items for current org via API
30. Analyzes: stock levels, pricing, categories
31. Can answer questions about items from live data
32. Can export item analysis as CSV/Excel

### H. Agentic Task History
33. All past agent tasks stored in DB (AIAgentTask model)
34. History page shows: task type, status, timestamp, summary
35. Can view details of past task (phases, errors, results)
36. Can re-run any past task

### I. Backend Agent Orchestration
37. New `AIAgentTask` Mongoose model with phases array
38. New routes: `POST /ai-agent/task`, `GET /ai-agent/tasks`, `GET /ai-agent/task/:id`
39. Workflow routes: `POST /ai-agent/workflow/create-item`, `POST /ai-agent/workflow/sales-to-payment`
40. Item analysis route: `GET /ai-agent/items/analysis`

---

# PHASE 1 — Header & Floating Chatbot UI

**Status**: COMPLETED
**Depends on**: Nothing (start here)
**Files to modify**: 4 files
**Files to create**: 1 file

---

## Phase 1 Overview

Currently the chatbot bot button is in `page-header.tsx` (lines 56–68). The user wants:
- Button removed from header
- HAI logo shown in header
- Chatbot opened via a floating button (bottom-right)
- All chatbot sections show open/close toggle

---

## Phase 1 — File 1: `client/components/page-header.tsx`

**Action**: MODIFY
**What to change**:
- Remove the import for `ChatbotPanel` from `@/components/chatbot-panel`
- Remove the `[chatOpen, setChatOpen]` state
- Remove the Bot button (lines 56–68) — the one with `<Bot className="h-4 w-4" />`
- Remove the `<ChatbotPanel isOpen={chatOpen} onClose={...} />` render at bottom
- Add `Image` import from `next/image`
- Add HAI logo between `SidebarTrigger` and the separator:
  ```tsx
  <Image src="/hailogo.png" alt="HAI" width={28} height={28} className="h-7 w-7 rounded-md object-contain shrink-0" />
  ```
- Keep the Bell notification button, `HeaderOrgSwitcher`, `Separator` as-is
- Remove imports no longer needed: `Bot`, `Sparkles` from lucide-react

**Result**: Header shows logo + org switcher + bell. No chatbot button.

---

## Phase 1 — File 2: `client/components/floating-ai-button.tsx`

**Action**: CREATE NEW
**Path**: `client/components/floating-ai-button.tsx`
**Purpose**: Floating action button fixed at bottom-right. Controls chatbot open/close. Exports `FloatingAIButton` component.

**Component specification**:
- Fixed position: `bottom-6 right-6 z-50`
- Main button: circular, 56×56px, gradient from `teal-600` to `teal-700`
- Icon: `Bot` from lucide-react, 24×24, white
- Has a small pulsing `Sparkles` badge on top-right corner of the button
- On click: toggles `isOpen` state → calls `onToggle` prop
- When `isOpen=true`: button shows `X` icon (to close)
- When AI is processing (prop: `isProcessing`): show a spinning ring around the button
- Tooltip: "HAI AI Assistant" on hover
- Animation: entrance animation (scale up from 0 on mount using CSS transition)

**Props interface**:
```ts
interface FloatingAIButtonProps {
  isOpen: boolean;
  onToggle: () => void;
  isProcessing?: boolean;
}
```

**Where it will be used**: In `client/components/page-header.tsx` or the root layout — it wraps `ChatbotPanel`.

---

## Phase 1 — File 3: `client/components/chatbot-panel.tsx`

**Action**: MODIFY (significant additions)
**Current state**: 422 lines, has basic chat UI with no memory persistence.
**What to add**:

### A. New "New Chat" button in the panel header
- Add a `RefreshCw` icon button next to the close button in the header
- On click: clears `messages` state, sets `sessionId` to undefined
- Tooltip: "New conversation"

### B. Session History toggle section
- Add a small "History" button (clock icon) in the header
- When clicked: shows a slide-down panel listing past sessions (session title + date)
- Each session: clicking it loads that session's messages
- Sessions fetched from `GET /chat/sessions` API
- Show max 10 recent sessions
- Sessions sorted by `updatedAt` descending

### C. New Props (from parent — floating button will pass these)
- The component already has `isOpen` and `onClose` props — no change needed to interface

### D. State additions
```ts
const [showHistory, setShowHistory] = useState(false);
const [sessions, setSessions] = useState<ChatSession[]>([]);
const [sessionsLoading, setSessionsLoading] = useState(false);
```

### E. Session loading logic
- On mount (when `isOpen` becomes true): call `getSessions()` API
- When user clicks a session: call `getSessionMessages(sessionId)` API, populate `messages` state
- When user sends a message with no `sessionId`: the first response will return a `sessionId` — save it and persist

### F. Visual sections open/close
- In the WelcomeState component: wrap the starter questions in a collapsible `<details>` or add a toggle arrow
- Messages area: always visible
- Input area: always visible

---

## Phase 1 — File 4: `client/components/app-sidebar.tsx`

**Action**: MODIFY
**What to add**:

### New nav entry in `navItems[]` array
Add this before or after "Reports":
```ts
{
  title: "AI Assistant",
  url: "/ai-agent",
  icon: Bot,    // import Bot from lucide-react
  items: [
    { title: "Chat", url: "/ai-agent?tab=chat", icon: MessageSquare },
    { title: "Agentic Tasks", url: "/ai-agent?tab=tasks", icon: Sparkles },
    { title: "Agent History", url: "/ai-agent?tab=history", icon: Clock },
  ],
},
```

### Import additions
Add to existing lucide-react imports: `Bot`, `MessageSquare`, `Sparkles` (Clock already imported).

### Visual distinction
The AI Assistant nav item should have a special gradient indicator:
- Active state: `bg-gradient-to-r from-teal-50 to-purple-50 text-purple-700`
- Icon color when active: `text-purple-600`
- This makes it visually distinct from regular nav items

---

# PHASE 2 — Chat Memory & RAG Session Persistence

**Status**: COMPLETED
**Depends on**: Phase 1 (chatbot-panel.tsx must have session state hooks ready)
**Files to create**: 4 files
**Files to modify**: 2 files

---

## Phase 2 Overview

Currently chat is stateless — every page reload loses all history. Goal: store sessions in MongoDB, fetch history in chatbot panel, pass last N messages as context to Gemini.

---

## Phase 2 — File 1: `backend/src/models/chat-session.model.ts`

**Action**: CREATE NEW
**Purpose**: Mongoose model for storing chat conversations.

**Schema definition**:
```ts
{
  organizationId: ObjectId (ref: Organization, required),
  userId: String (required — Firebase UID),
  title: String (default: "New Chat", max 80 chars),
  messages: [{
    role: "user" | "assistant",
    content: String (required),
    sources: [{ title: String, url: String }],
    isError: Boolean (default: false),
    timestamp: Date (default: Date.now),
  }],
  lastActivity: Date (default: Date.now),
  createdAt: Date (auto),
  updatedAt: Date (auto),
}
```

**Indexes**:
- `{ organizationId: 1, userId: 1, lastActivity: -1 }` — for listing sessions by user
- `{ organizationId: 1, userId: 1, createdAt: -1 }`

**Model name**: `ChatSession`
**Collection name**: `chatsessions`

**Export**: `export default model<IChatSession>('ChatSession', chatSessionSchema)`

---

## Phase 2 — File 2: `backend/src/controllers/chat-session.controller.ts`

**Action**: CREATE NEW
**Purpose**: CRUD handlers for chat sessions.

**Functions to implement**:

### `listSessions`
- Route: `GET /chat-sessions`
- Auth: required
- Query: `organizationId` from `req.user.activeOrganization._id`
- Filter: `{ organizationId, userId: req.user._id || req.firebaseUser.uid }`
- Sort: `{ lastActivity: -1 }`
- Limit: 20
- Return: `{ success: true, data: sessions }` (exclude `messages` array to keep response small — use `.select('-messages')`)

### `getSession`
- Route: `GET /chat-sessions/:id`
- Auth: required
- Validate: session belongs to this user + org
- Return: full session including all messages
- Return: `{ success: true, data: session }`

### `createSession`
- Route: `POST /chat-sessions`
- Auth: required
- Body: `{ title?: string }`
- Creates empty session with `organizationId`, `userId`, `title`
- Return: `{ success: true, data: session }`

### `appendMessage`
- Route: `PATCH /chat-sessions/:id/append`
- Auth: required
- Body: `{ role, content, sources?, isError?, timestamp? }`
- Validates session ownership
- Pushes message to `session.messages[]`
- Updates `session.lastActivity`
- If `title === "New Chat"` and `role === "user"`: auto-set title to first 60 chars of content
- Return: `{ success: true, data: session }`

### `deleteSession`
- Route: `DELETE /chat-sessions/:id`
- Auth: required
- Validates session ownership
- Deletes session
- Return: `{ success: true, message: "Session deleted" }`

---

## Phase 2 — File 3: `backend/src/routes/chat-session.routes.ts`

**Action**: CREATE NEW

**Routes**:
```
GET    /                    → listSessions
POST   /                    → createSession
GET    /:id                 → getSession
PATCH  /:id/append          → appendMessage
DELETE /:id                 → deleteSession
```

All routes require `authenticate` middleware.
Import: `authenticate` from `../middlewares/auth`
Import all handlers from `../controllers/chat-session.controller`

---

## Phase 2 — File 4: `backend/src/routes/index.ts`

**Action**: MODIFY
**What to add**:
```ts
import chatSessionRoutes from "./chat-session.routes";
// ... in router.use() section:
router.use("/chat-sessions", chatSessionRoutes);
```

---

## Phase 2 — File 5: `backend/src/controllers/chat.controller.ts`

**Action**: MODIFY (minimal, non-breaking)
**What to change**:

In the `handleChat` function, AFTER successfully generating an answer:
- If `req.body.sessionId` is provided: call `ChatSession.findOneAndUpdate` to append both the user message and bot message to that session
- If no `sessionId`: do nothing (session creation is handled by client)
- Do NOT change the core RAG logic, vector search, or Gemini call
- Import `ChatSession` model at top of file

**Key constraint**: The existing `handleChat` function is 1031 lines. Only modify the response-building section at the very end (after `res.json(...)` is called or right before it) to add session persistence.

---

## Phase 2 — File 6: `client/lib/api/chatbot.ts`

**Action**: MODIFY
**Current**: 45 lines with `sendChatMessage()` only.
**What to add**:

```ts
export interface ChatSession {
  _id: string;
  title: string;
  lastActivity: number;
  createdAt: number;
}

export interface ChatSessionDetail extends ChatSession {
  messages: ChatMessage[];
}

// New API functions:
export async function getSessions(): Promise<{ success: boolean; data?: ChatSession[] }>

export async function getSession(sessionId: string): Promise<{ success: boolean; data?: ChatSessionDetail }>

export async function createSession(title?: string): Promise<{ success: boolean; data?: ChatSession }>

export async function appendMessage(sessionId: string, message: Omit<ChatMessage, 'timestamp'> & { timestamp?: number }): Promise<{ success: boolean }>

export async function deleteSession(sessionId: string): Promise<{ success: boolean }>
```

All functions use `apiFetch` from `../api`.

**Also modify `sendChatMessage`**:
- Add optional `conversationHistory?: Array<{ role: string; content: string }>` parameter
- Pass it in the POST body as `history`

---

# PHASE 3 — AI Agent Backend Orchestration

**Status**: PENDING
**Depends on**: Phase 2 (chat sessions working)
**Files to create**: 4 files
**Files to modify**: 1 file

---

## Phase 3 Overview

Create a new backend domain (`/api/ai-agent`) that handles multi-step agentic workflows. This is separate from the RAG chatbot — it uses Gemini to perform structured tasks (create items, chain documents).

---

## Phase 3 — File 1: `backend/src/models/ai-agent-task.model.ts`

**Action**: CREATE NEW
**Purpose**: Stores each AI agent task with its phases and status.

**Schema definition**:
```ts
{
  organizationId: ObjectId (ref: Organization, required),
  userId: String (required — Firebase UID),
  taskType: String enum [
    "create_item",
    "document_workflow",
    "item_analysis",
    "data_export",
    "report_generation"
  ],
  status: String enum ["pending", "in_progress", "completed", "failed", "partial"] default "pending",
  title: String (human-readable task name),
  description: String (what the user asked),
  phases: [{
    phaseIndex: Number,
    name: String,
    description: String,
    status: String enum ["pending", "in_progress", "completed", "failed", "skipped"],
    startedAt: Date,
    completedAt: Date,
    result: Mixed (any JSON),
    errorMessage: String,
    manualSteps: [String],   ← If failed: list of manual steps user can take
  }],
  input: Mixed,         ← The raw user input / AI-collected data
  output: Mixed,        ← Final result (created IDs, exported data, etc.)
  errorMessage: String, ← Top-level error if task completely failed
  createdAt: Date (auto),
  updatedAt: Date (auto),
}
```

**Indexes**: `{ organizationId: 1, userId: 1, createdAt: -1 }`
**Model name**: `AIAgentTask`

---

## Phase 3 — File 2: `backend/src/controllers/ai-agent.controller.ts`

**Action**: CREATE NEW
**Purpose**: All agent orchestration logic.

### Function 1: `listTasks`
- `GET /ai-agent/tasks`
- Returns last 50 tasks for current org+user, sorted by `createdAt: -1`
- Excludes `phases[].result` from list view (too large) — use `.select('-phases.result -output')`
- Response: `{ success: true, data: tasks[] }`

### Function 2: `getTask`
- `GET /ai-agent/tasks/:id`
- Returns full task including all phases and results
- Validates org ownership
- Response: `{ success: true, data: task }`

### Function 3: `createItemWorkflow`
- `POST /ai-agent/workflow/create-item`
- Body: `{ conversationHistory: [{role, content}][], collectedData: { name?, sku?, itemType?, sellingPrice?, costPrice?, ... } }`
- Phase 1 "Validate Data": Check required fields (name is required). If missing: return what's missing as structured response for AI to ask user.
- Phase 2 "Create Item": Call `Item.create({...})` using `collectedData`, scoped to `organizationId`.
- Phase 3 "Confirm": Return created item data.
- Save task to DB. Update phase statuses in real-time (save after each phase).
- On any error: set phase status to "failed", add `manualSteps` like ["Go to Items > New Item", "Fill in the form manually"].
- Response: `{ success: true, data: { taskId, phases, createdItem } }`

**Item creation validation** — Required fields: `name`. Optional but important: `itemType` (default "Goods"), `sellingPrice` (default 0), `costPrice` (default 0), `unit`, `description`.

### Function 4: `salesToPaymentWorkflow`
- `POST /ai-agent/workflow/sales-to-payment`
- Body: `{ workflowType: "full" | "so_to_invoice" | "invoice_to_payment", input: { customerId, items[], ... } }`
- Phases for `full`:
  - Phase 1 "Create Sales Order": Call SalesOrder.create with scoped org
  - Phase 2 "Convert to Invoice": Call Invoice.create from the sales order
  - Phase 3 "Create Bill" (if purchase items involved): optional
  - Phase 4 "Record Payment": Call PaymentReceived.create linked to invoice
- Each phase: save to DB, update status before and after
- On error at any phase: stop, mark task as "partial", add manual steps
- **IMPORTANT**: Do not directly call the controller functions — use Mongoose models directly in a transaction-safe way
- Response: streaming-friendly — use Server-Sent Events (SSE) OR polling (use polling for simplicity — client polls `GET /ai-agent/tasks/:id`)

### Function 5: `analyzeItems`
- `GET /ai-agent/items/analysis`
- Fetches all items for org: `Item.find({ organizationId, isActive: true })`
- Builds analysis object:
  ```ts
  {
    totalItems: number,
    totalInventoryValue: number,
    lowStockItems: Item[],      // stockOnHand < reorderPoint
    zeroStockItems: Item[],     // stockOnHand === 0
    topValueItems: Item[],      // top 10 by inventoryValue
    categorySummary: { [unit: string]: count }
  }
  ```
- Passes analysis to Gemini with prompt: "You are an inventory analyst. Given this data, provide a 3-paragraph business summary with actionable insights."
- Response: `{ success: true, data: { analysis, aiSummary, items: lowStockItems } }`

### Function 6: `askAgentQuestion`
- `POST /ai-agent/ask`
- Body: `{ question: string, context?: string, taskType?: string }`
- Uses Gemini to answer agent-specific questions (separate from RAG chatbot)
- System prompt: "You are HAI Accounting's AI Agent. You help users complete accounting tasks step by step. Be concise and structured."
- Response: `{ success: true, data: { answer, suggestedAction? } }`

---

## Phase 3 — File 3: `backend/src/routes/ai-agent.routes.ts`

**Action**: CREATE NEW

**Routes**:
```
GET    /tasks                         → listTasks
GET    /tasks/:id                     → getTask
POST   /workflow/create-item          → createItemWorkflow
POST   /workflow/sales-to-payment     → salesToPaymentWorkflow
GET    /items/analysis                → analyzeItems
POST   /ask                           → askAgentQuestion
```

All routes require `authenticate` middleware.

---

## Phase 3 — File 4: `backend/src/routes/index.ts`

**Action**: MODIFY
**Add**:
```ts
import aiAgentRoutes from "./ai-agent.routes";
router.use("/ai-agent", aiAgentRoutes);
```

---

## Phase 3 — File 5: `client/lib/api/ai-agent.ts`

**Action**: CREATE NEW
**Purpose**: All client-side API calls for the AI agent.

**Functions**:
```ts
// Task management
export async function listAgentTasks(): Promise<AgentTaskListResponse>
export async function getAgentTask(taskId: string): Promise<AgentTaskResponse>

// Workflows
export async function createItemWorkflow(data: CreateItemWorkflowInput): Promise<WorkflowResponse>
export async function salesToPaymentWorkflow(data: SalesWorkflowInput): Promise<WorkflowResponse>

// Analysis
export async function getItemsAnalysis(): Promise<ItemsAnalysisResponse>

// Agent chat
export async function askAgent(question: string, context?: string, taskType?: string): Promise<AgentAnswerResponse>
```

**TypeScript interfaces to export**:
```ts
export interface AgentTask {
  _id: string;
  taskType: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "partial";
  title: string;
  description: string;
  phases: AgentPhase[];
  input: any;
  output: any;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentPhase {
  phaseIndex: number;
  name: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  result?: any;
  errorMessage?: string;
  manualSteps?: string[];
}
```

---

# PHASE 4 — AI Agent UI Components

**Status**: PENDING
**Depends on**: Phase 3 (backend routes must exist)
**Files to create**: 7 files
**Files to modify**: 0

---

## Phase 4 Overview

Create a full `/ai-agent` page with a tab-based layout. The page is a premium, dark-mode-capable dashboard with real-time task progress visualization.

---

## Phase 4 — Design System for AI Agent Page

**Color palette** (specific to AI agent UI — distinct from main app):
- Background gradient: `from-slate-950 via-slate-900 to-teal-950` (dark)
- Card background: `bg-slate-800/50 backdrop-blur-md border border-slate-700/50`
- Accent: teal-400 / teal-500
- AI/agent accent: purple-400 / purple-500
- Success: emerald-400
- Error: rose-400
- Pending: amber-400
- Font: inherit from app (Geist)
- Animations: use Tailwind `animate-pulse`, `animate-spin`, custom CSS for phase transitions

**Tab layout**: Horizontal tabs at top, content below. Tabs:
1. 🤖 Chat
2. ⚡ Tasks
3. 🔄 Automation
4. 📊 Item Analysis
5. 📤 Export / Import

---

## Phase 4 — File 1: `client/components/ai-agent/agent-chat.tsx`

**Action**: CREATE NEW (folder `client/components/ai-agent/` needs to be created)
**Purpose**: Full-featured chat component for the AI Agent page (different from floating chatbot).

**Specification**:
- Reuses the same message bubble styling from `chatbot-panel.tsx`
- Has a wider layout (full page width minus sidebar)
- Shows session history in a left sidebar panel (200px wide)
- Sessions listed with title + relative date
- "New Chat" button at top of session list
- Delete session button on each session (trash icon, appears on hover)
- Main chat area: messages + input
- Input: textarea (multi-line, auto-resize), not single-line input
- Send button: `Ctrl+Enter` or button click
- Shows conversation history count in session list item
- Agent-specific starter prompts:
  - "Analyze my inventory and tell me what's running low"
  - "Help me create a new item step by step"
  - "Walk me through creating a sales order"
  - "What are my top 5 customers by revenue?"
  - "Export my items data to Excel"

---

## Phase 4 — File 2: `client/components/ai-agent/agent-task-panel.tsx`

**Action**: CREATE NEW
**Purpose**: Shows 5 task type cards. User clicks a task → opens a guided task flow.

**Task cards** (5 cards in a 2-3 grid):

### Card 1: Create Item
- Icon: Package (teal)
- Title: "Create Item with AI"
- Description: "AI will ask you questions and automatically fill in the item form"
- Button: "Start" → opens `AgentItemCreator` component

### Card 2: Document Workflow
- Icon: GitBranch (purple)
- Title: "Document Automation"
- Description: "Automatically chain Sales Order → Invoice → Payment with AI"
- Button: "Start" → opens `AgentWorkflowVisualizer` in create mode

### Card 3: Item Analysis
- Icon: BarChart3 (emerald)
- Title: "Analyze Items"
- Description: "AI reads your inventory and provides actionable insights"
- Button: "Analyze" → calls `getItemsAnalysis()` API, shows results

### Card 4: Data Export
- Icon: Download (amber)
- Title: "Export with AI"
- Description: "AI helps you export the right data in the right format"
- Button: "Export" → opens export section

### Card 5: Report Generation
- Icon: FileText (blue)
- Title: "Generate Report"
- Description: "Ask AI to generate financial reports from your data"
- Button: "Generate" → opens report section

**State**: Which task is active (one at a time). When task is active, show task-specific sub-component below the cards.

---

## Phase 4 — File 3: `client/components/ai-agent/agent-workflow-visualizer.tsx`

**Action**: CREATE NEW
**Purpose**: Visual pipeline showing document workflow steps with real-time status.

**Visual design**:
- Horizontal pipeline with nodes connected by arrows
- Nodes: Sales Order → Invoice → Bill (optional) → Credit Note (optional) → Payment
- Each node is a rounded card with:
  - Step number
  - Document name
  - Status indicator (color-coded dot)
  - Created document ID when completed
- Below the pipeline: a live activity log (scrollable list of agent actions)
- Above the pipeline: a form to collect initial data (customer, items, amount)

**Node states**:
- Pending: gray ring, gray icon
- In Progress: amber ring, pulsing animation, spinning gear icon
- Completed: teal ring, checkmark icon, shows document ID link
- Failed: rose ring, X icon, shows error + manual steps
- Skipped: dashed ring, dash icon

**Activity log entries** (appear as each step progresses):
```
[10:42:01] 🔵 Starting document workflow...
[10:42:02] ⚡ Creating Sales Order for Customer: ACME Corp
[10:42:04] ✅ Sales Order SO-2024-001 created
[10:42:05] ⚡ Converting to Invoice...
[10:42:08] ✅ Invoice INV-2024-056 created
[10:42:09] ⚡ Recording payment...
[10:42:11] ✅ Payment PMT-001 recorded. Workflow complete!
```

**Error handling display**:
When a phase fails, show an alert box with:
- Red border card
- Error message from API
- "Manual Steps" section: numbered list of what user can do manually
- "Retry Step" button

**Polling logic**: After starting workflow, poll `GET /ai-agent/tasks/:id` every 2 seconds until `status === "completed" || "failed"`. Show "Waiting for server..." if no response in 5 seconds.

---

## Phase 4 — File 4: `client/components/ai-agent/agent-item-creator.tsx`

**Action**: CREATE NEW
**Purpose**: Guided item creation through AI conversation.

**Flow**:
1. AI sends first message: "Let's create a new item! What's the name of the item?"
2. User replies: "Widget Pro 3000"
3. AI confirms name, asks next: "What type is it — Goods or Service?"
4. User replies → AI fills that field on the visible form
5. Continue for: SKU, selling price, cost price, unit, description
6. If user says something vague → AI asks for clarification
7. When AI has enough (name + at least one price): shows "Ready to create" state
8. User clicks "Create Item" → form is submitted via `createItemWorkflow` API

**Two-panel layout**:
- Left panel (60%): Chat conversation (same bubble style)
- Right panel (40%): Live item form preview (read-only, fields auto-fill as AI collects data)

**Form fields shown on right panel** (mirrors `CreateItemInput` from `client/lib/api/items.ts`):
- Name (required, highlighted)
- SKU (optional)
- Item Type (Goods/Service toggle)
- Selling Price
- Cost Price
- Unit
- Description
- HSN/SAC Code (optional)
- Inventory Tracked (toggle)
- Opening Stock (if inventory tracked)

**Field states**:
- Empty: gray placeholder
- AI-collected: teal highlight with ✓ icon
- Insufficient: red highlight with warning

**Submit flow**: When user clicks "Create Item":
1. Shows loading state on button
2. Calls `POST /ai-agent/workflow/create-item`
3. On success: shows "✅ Item Created!" with link to item
4. On error: shows error + manual form link

---

## Phase 4 — File 5: `client/components/ai-agent/agent-history.tsx`

**Action**: CREATE NEW
**Purpose**: List of all past AI agent tasks.

**Layout**:
- Full-width table/list with columns: Task Type, Title, Status, Created At, Actions
- Status badge: colored pill (green=completed, red=failed, amber=partial, blue=in_progress, gray=pending)
- Actions: "View Details" button, "Re-run" button (for completed/failed tasks)

**Task Detail Drawer**:
- Clicking "View Details" opens a right-side drawer (800px wide)
- Shows:
  - Task info header (type, status, timestamps)
  - Phases accordion: each phase expandable, shows result/error
  - For failed phases: shows `manualSteps` as a numbered guide
  - Output data (if any) in a formatted JSON viewer
  - "Copy Result" button to copy output as JSON

**Error display**: Failed tasks show a warning banner: "This task failed. Here's what happened and how to fix it manually:" followed by the manual steps.

---

## Phase 4 — File 6: `client/components/ai-agent/agent-item-analysis.tsx`

**Action**: CREATE NEW
**Purpose**: Shows AI analysis of current org's items.

**Layout**:
- "Run Analysis" button at top
- Loading state: skeleton cards with "AI is reading your inventory..."
- Results sections:
  1. Summary stats: 4 metric cards (Total Items, Total Value, Low Stock Count, Zero Stock Count)
  2. AI Narrative: paragraph summary from Gemini (displayed in a teal-bordered blockquote)
  3. Low Stock Table: items below reorder point (Name, Stock, Reorder Point, Action link)
  4. Zero Stock Table: items with no stock
  5. Top 10 by Value table
- Export button: "Export Analysis to Excel" — calls existing export patterns from items page

**Refresh**: "Re-analyze" button (top-right) to re-fetch and rerun analysis.

---

## Phase 4 — File 7: `client/app/ai-agent/page.tsx`

**Action**: CREATE NEW (create folder `client/app/ai-agent/`)
**Purpose**: Main AI Agent page. Tab-based layout.

**Page structure**:
```tsx
<div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950">
  {/* Page Header */}
  <PageHeader breadcrumb={...} />
  
  {/* Hero section */}
  <div className="px-6 py-8">
    <h1>HAI AI Agent</h1>
    <p>Your intelligent accounting assistant</p>
  </div>

  {/* Tabs */}
  <Tabs defaultValue="chat">
    <TabsList>
      <TabsTrigger value="chat">🤖 Chat</TabsTrigger>
      <TabsTrigger value="tasks">⚡ Tasks</TabsTrigger>
      <TabsTrigger value="automation">🔄 Automation</TabsTrigger>
      <TabsTrigger value="analysis">📊 Item Analysis</TabsTrigger>
      <TabsTrigger value="history">📋 History</TabsTrigger>
    </TabsList>
    <TabsContent value="chat"><AgentChat /></TabsContent>
    <TabsContent value="tasks"><AgentTaskPanel /></TabsContent>
    <TabsContent value="automation"><AgentWorkflowVisualizer /></TabsContent>
    <TabsContent value="analysis"><AgentItemAnalysis /></TabsContent>
    <TabsContent value="history"><AgentHistory /></TabsContent>
  </Tabs>
</div>
```

**URL param handling**: If URL has `?tab=tasks`, auto-switch to that tab on mount using `useSearchParams()`.

**Metadata** (Next.js):
```ts
export const metadata = {
  title: "AI Agent | HAI Accounting",
  description: "Intelligent AI agent for automated accounting tasks"
}
```

**Imports needed**: `PageHeader`, all 5 agent components, shadcn Tabs, shadcn Card.

---

# PHASE 5 — Memory & Documentation Files

**Status**: PENDING (create alongside Phase 1 implementation)
**Files to create**: 2 files
**Files to modify**: 0

---

## Phase 5 — File 1: `aiagent/PHASE_STATUS.md`

**Action**: CREATE NEW (in this `aiagent/` folder)
**Purpose**: Updated after each phase completes. Coding agents must update this after each phase.

**Initial content**:
```md
# Phase Implementation Status

| Phase | Status | Completed By | Notes |
|---|---|---|---|
| Phase 1 — Header & Floating UI | PENDING | — | — |
| Phase 2 — Chat Memory | PENDING | — | — |
| Phase 3 — Agent Backend | PENDING | — | — |
| Phase 4 — Agent UI | PENDING | — | — |
| Phase 5 — Docs | IN PROGRESS | — | — |

## What Each Phase Implements
- Phase 1: Removes chatbot from header, adds floating button, adds session UI to chatbot panel, adds AI Assistant to sidebar
- Phase 2: ChatSession MongoDB model, session CRUD API, chat history in client, conversation context to Gemini
- Phase 3: AIAgentTask model, workflow controllers, AI agent routes, client API library
- Phase 4: 7 new UI component files + /ai-agent page
- Phase 5: This document + AI_AGENT_PLAN.md
```

---

## Phase 5 — File 2: `aiagent/AI_AGENT_PLAN.md`

**Action**: THIS FILE (already created)
**Purpose**: The master plan document. Do not delete or overwrite. Append notes at bottom if needed.

---

# Implementation Rules for Coding Agents

## MUST FOLLOW
1. **Read this entire file** before starting any phase
2. **Do NOT skip phases** — each phase builds on the previous
3. **Do NOT modify existing routes or controllers** — only add new things
4. **Scope all DB queries** to `organizationId` from `req.user.activeOrganization._id`
5. **Use `authenticate` middleware** on all new backend routes
6. **Test TypeScript compilation** after each backend file: `cd backend && npx tsc --noEmit`
7. **Do NOT create global state** for agent tasks — use component-level state + API polling
8. **Use existing patterns**: 
   - `apiFetch` (not raw fetch) for all client API calls
   - `asyncHandler` (not try/catch) for backend controller functions
   - Mongoose model pattern matching existing models like `chat-log.model.ts`

## FILE NAMING CONVENTIONS
- Client components: `kebab-case.tsx` (e.g., `agent-task-panel.tsx`)
- Client API: `kebab-case.ts` (e.g., `ai-agent.ts`)
- Backend controllers: `kebab-case.controller.ts`
- Backend models: `kebab-case.model.ts`
- Backend routes: `kebab-case.routes.ts`

## ERROR HANDLING PATTERN (Backend)
```ts
// Use asyncHandler wrapper — no try/catch needed in controllers
export const myFunction = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // logic
  res.json({ success: true, data: result });
});
```

## ERROR HANDLING PATTERN (Frontend)
Show errors gracefully — never crash. For agent tasks:
- Network error: "Could not connect to AI agent. Please check your connection."
- Server error (500): Show the error message from API + manual steps if available
- Timeout (>10s): "The server is taking longer than expected. Your task is still running — check History in a few moments."

## WHEN A PHASE IS COMPLETE
Update `aiagent/PHASE_STATUS.md`:
- Change status from PENDING → COMPLETED
- Add notes about anything different from plan

---

# Additional Extensions for Complete Accounting Coverage

To ensure the AI Agent can interact with **all** sections of the HAI Accounting system (Invoices, Bills, Expenses, Payments, Credits, Journals, etc.), the following global infrastructure must be implemented.

## 1. Schema & Form Field Registry (For All Sections)
To prevent hardcoding form schemas, we will implement a centralized schema registry file that translates Mongoose validation rules and React UI fields into JSON Schemas that Gemini can consume.

### [NEW] `client/lib/api/schema-registry.ts`
- Exports structured field definitions for:
  - **Item**: `name`, `sku`, `sellingPrice`, `costPrice`, `itemType`, `inventoryTracked`, etc.
  - **Invoice / Sales Order**: `customerId`, `invoiceDate`, `dueDate`, `items: [{ itemId, quantity, rate, discount }]`, `notes`
  - **Bill / Purchase Order**: `vendorId`, `billDate`, `dueDate`, `items: [{ itemId, quantity, rate }]`, `notes`
  - **Expense**: `expenseAccountId`, `paidThroughAccountId`, `amount`, `date`, `vendorId`, `reference`
  - **Manual Journal**: `date`, `reference`, `notes`, `journalLines: [{ accountId, debit, credit, narration }]`
- Provides validation flags (e.g. `required`, `type`, `description`, `options`) for each property.
- When the AI Agent runs, it queries this registry dynamically to construct its prompting instructions and UI validation lists.

## 2. Global Memory Store (`AIAgentMemoryProvider`)
To satisfy the requirement of reading the "Item section" and caching it globally for cross-section work (like autofilling Sales Orders or Invoices without spamming queries):

### [NEW] `client/contexts/ai-agent-memory-context.tsx`
- React Context wrapping the root layout of the `/ai-agent` page.
- State properties:
  - `cachedItems: Item[]` (fetched once on mount or when refreshed)
  - `cachedContacts: Contact[]` (separated into Customers and Vendors)
  - `cachedAccounts: Account[]` (chart of accounts list)
  - `cachedTaxes: Tax[]` (tax codes list)
- Methods:
  - `refreshCache(section: 'items' | 'contacts' | 'accounts' | 'taxes' | 'all')`
  - `getItemById(id: string)`, `getContactById(id: string)`
  - `searchItemsLocal(query: string)` — fuzzy search within pre-cached item details
- **AI Access**: When starting an agentic task (like "Create Sales Order"), the UI passes this cached inventory and contact list directly to the agent context as reference data.

## 3. AI-Assisted Import/Export Mapper Engine
To allow importing and exporting data across *all* accounting sections:

### [NEW] `client/components/ai-agent/agent-import-mapper.tsx`
- UI step-by-step import wizard managed by the AI agent:
  - **Step 1: Upload file** (CSV, XLS, XLSX)
  - **Step 2: Choose target model** (Items, Customers, Vendors, Bills, Invoices, Journals)
  - **Step 3: AI-generated Auto-Mapping**: Send sheet headers and the selected target model schema to Gemini. Gemini returns a key-value mapping (e.g., `"Item Title" -> "name"`, `"Selling Cost" -> "sellingPrice"`).
  - **Step 4: Resolve Errors**: AI highlights rows with invalid field types (e.g., text in price column) and suggests fixes.
  - **Step 5: Import Confirmation**: Sends payload to a new backend `/api/ai-agent/import-mapped` endpoint.

### [NEW] Backend controller method: `importMappedRecords`
- Scoped to `/api/ai-agent/import-mapped`
- Body: `{ modelType: string, records: any[] }`
- Resolves relationships: maps contact names to Contact IDs, account names to Account IDs.
- Performs bulk insert inside a database transaction to prevent partial state errors.

## 4. Form Auto-Fill Injection Hook (`useAgentFormFiller`)
Instead of building completely separate AI UI pages, we should allow the AI Agent to fill out the *existing* client forms directly:

### [NEW] `client/hooks/use-agent-form-filler.ts`
- A React hook that any existing form page (e.g., `credit-note-form.tsx`, `bill-form.tsx`, `invoice-form.tsx`) can import.
- Subscribes to a broadcast channel or context event: `window.addEventListener('ai-agent:fill-form', (e) => { ... })`
- When the floating AI Chatbot gathers data, it can dispatch this event with form values.
- The hook listens and calls React Hook Form's `setValue(key, value)` for each matching field, highlight-flashing the filled fields in teal to show the user what was auto-populated.

## 5. Modular Section Data Services (Backend Decoupling — ALL SECTIONS)

To ensure the AI Agent can access and operate on **every** section of HAI Accounting, backend logic is split into **13 independent service files**. Each file maps to one domain and can be changed without breaking others. If any service has a problem, only that file needs to be fixed.

### [NEW] `backend/src/services/ai-agent/` (Directory)

> **RULE**: The main `ai-agent.controller.ts` ONLY imports and orchestrates these services. No direct Mongoose queries in the controller.

> **NOTE**: Time Tracking (Projects/Timesheet) is NOT included — that section is not working yet. When it's ready, add `time-tracking.service.ts` as Service 14.

---

### Service 1: `items.service.ts` — Items & Inventory
**Models used**: `Item`, `ItemGroup`, `Unit`, `Warehouse`
**Covers sidebar section**: Items
**Capabilities**:
- `listItems(orgId)` — fetch all active items with pagination
- `getItemById(orgId, itemId)` — single item detail
- `createItem(orgId, data: CreateItemInput)` — validated item creation with defaults
- `updateItem(orgId, itemId, data)` — update an existing item
- `analyzeInventory(orgId)` — low stock, zero stock, top value, category summary
- `searchItems(orgId, query)` — fuzzy search by name/sku
- `getItemFormSchema()` — returns JSON schema of all item fields for AI prompting
- `exportItemsToExcel(orgId)` — generates XLSX buffer of all items
- `listItemGroups(orgId)` — item groups/categories
- `listUnits(orgId)` — units of measurement

---

### Service 2: `sales.service.ts` — Full Sales Domain
**Models used**: `Quote`, `SalesOrder`, `Invoice`, `RecurringInvoice`, `RetainerInvoice`, `DeliveryChallan`, `PaymentReceived`, `CreditNote`, `CreditNoteApplication`, `PaymentInvoiceMap`
**Covers sidebar sections**: Customers, Quotes, Sales Orders, Invoices, Retainer Invoices, Recurring Invoices, Delivery Challans, Payments Received, Credit Notes
**Capabilities**:
- `createQuote(orgId, data)` — create estimate/quote
- `createSalesOrder(orgId, data)` — create sales order from scratch or from quote
- `convertSalesOrderToInvoice(orgId, salesOrderId)` — chain: SO → Invoice
- `createInvoice(orgId, data)` — create standalone invoice
- `recordPaymentReceived(orgId, data)` — record payment against invoice
- `createCreditNote(orgId, data)` — issue credit note
- `applyCreditNoteToInvoice(orgId, creditNoteId, invoiceId, amount)` — apply credit
- `createDeliveryChallan(orgId, data)` — create delivery challan
- `createRetainerInvoice(orgId, data)` — create retainer invoice
- `createRecurringInvoice(orgId, data)` — set up recurring invoice profile
- `listOverdueInvoices(orgId)` — invoices past due date
- `listUnpaidInvoices(orgId)` — invoices with balanceDue > 0
- `getCustomerOutstanding(orgId, customerId)` — total receivable from one customer
- `sendInvoiceEmail(orgId, invoiceId, to[], cc[], bcc[], subject, body)` — sends invoice PDF to customer via SMTP (uses email.service.ts)
- `sendQuoteEmail(orgId, quoteId, to[], cc[], bcc[], subject, body)` — sends quote PDF to customer (uses email.service.ts)
- `getSalesFormSchemas()` — returns JSON schema for each sales document type

---

### Service 3: `purchases.service.ts` — Full Purchases Domain
**Models used**: `PurchaseOrder`, `PurchaseReceive`, `Bill`, `RecurringBill`, `Expense`, `RecurringExpense`, `PaymentMade`, `VendorCredit`, `VendorCreditApplication`, `PaymentBillMap`, `ExpenseCategory`
**Covers sidebar sections**: Vendors, Purchase Orders, Purchase Receives, Bills, Recurring Bills, Expenses, Recurring Expenses, Payments Made, Vendor Credits
**Capabilities**:
- `createPurchaseOrder(orgId, data)` — create PO
- `receivePurchaseOrder(orgId, poId, data)` — create purchase receive from PO
- `convertPOToBill(orgId, poId)` — chain: PO → Bill
- `createBill(orgId, data)` — create standalone bill with automatic duplicate check (warn if bill number + vendor + amount matches an existing bill within past 90 days)
- `createRecurringBill(orgId, data)` — set up recurring bill profile
- `recordPaymentMade(orgId, data)` — pay a bill
- `createExpense(orgId, data) ` — create expense record with automatic duplicate check (warn if amount + date + expense category matches an existing expense)
- `createRecurringExpense(orgId, data)` — set up recurring expense profile
- `createVendorCredit(orgId, data)` — issue vendor credit
- `applyVendorCreditToBill(orgId, vendorCreditId, billId, amount)` — apply credit
- `listUnpaidBills(orgId)` — bills with balanceDue > 0
- `listOverdueBills(orgId)` — bills past due date
- `getVendorOutstanding(orgId, vendorId)` — total payable to one vendor
- `listExpenseCategories(orgId)` — expense categories
- `sendPurchaseOrderEmail(orgId, poId, to[], cc[], bcc[], subject, body)` — sends PO PDF to vendor via SMTP (uses email.service.ts)
- `getPurchaseFormSchemas()` — returns JSON schema for each purchase document type

---

### Service 4: `contacts.service.ts` — Customers & Vendors
**Models used**: `Contact`
**Covers sidebar sections**: Customers (under Sales), Vendors (under Purchases)
**Capabilities**:
- `listCustomers(orgId)` — filter `contactType: "Customer"` or `"Both"`
- `listVendors(orgId)` — filter `contactType: "Vendor"` or `"Both"`
- `getContactById(orgId, id)` — single contact detail
- `searchContacts(orgId, query, type?)` — fuzzy search by displayName/companyName
- `createContact(orgId, data)` — create customer or vendor
- `updateContact(orgId, id, data)` — update existing contact
- `getContactBalance(orgId, contactId)` — receivable or payable balance
- `verifyGSTIN(gstin)` — computes GSTIN checksum and validates status/legal name (queries the GST API and parses taxpayer details, matching existing gstin.controller.ts logic)
- `getContactFormSchema()` — JSON schema for contact creation fields

---

### Service 5: `accounts.service.ts` — Chart of Accounts & GL
**Models used**: `Account`, `GLEntry`
**Covers sidebar section**: Accountant > Chart of Accounts
**Capabilities**:
- `listAccounts(orgId)` — full chart of accounts
- `getAccountById(orgId, id)` — single account with GL summary
- `searchAccounts(orgId, query)` — search by name/code/accountNumber
- `getAccountBalance(orgId, accountId, startDate?, endDate?)` — computed balance from GL entries
- `createAccount(orgId, data)` — create new account
- `getTrialBalance(orgId, asOfDate)` — all account balances for trial balance report
- `getAccountFormSchema()` — JSON schema for account fields

---

### Service 6: `journals.service.ts` — Manual Journals & Ledger
**Models used**: `Journal`, `GLEntry`, `JournalNumberingPreference`
**Covers sidebar section**: Accountant > Manual Journals
**Capabilities**:
- `createJournal(orgId, data)` — create manual journal with double-entry validation
- `listJournals(orgId, filters?)` — list journals with pagination
- `postJournalToGL(orgId, journalId)` — post journal entries to general ledger
- `reverseJournal(orgId, journalId)` — reverse a posted journal (creates GL reversal entries)
- `validateDoubleEntry(lines)` — ensure total debits === total credits, min 2 lines
- `getJournalFormSchema()` — JSON schema for journal fields

---

### Service 7: `accountant.service.ts` — Bulk Update, Currency Adjustments, Transaction Locking
**Models used**: `CurrencyAdjustment`, `Account`, `GLEntry`, `Organization`
**Covers sidebar sections**: Accountant > Bulk Update, Accountant > Currency Adjustments, Accountant > Transaction Locking
**Capabilities**:
- `bulkUpdateRecords(orgId, modelType, updates[])` — batch update fields on Items, Contacts, Invoices, etc. (uses the same logic as the existing bulk-update controller)
- `createCurrencyAdjustment(orgId, data)` — create currency adjustment entry to revalue foreign-currency balances
- `listCurrencyAdjustments(orgId)` — list all past adjustments
- `getTransactionLockDate(orgId)` — read the current lock date for the org
- `isDateLocked(orgId, date)` — check if a given date is locked (AI must call this before creating any backdated document)
- `getAccountantFormSchemas()` — JSON schemas for bulk update, currency adjustment fields

---

### Service 8: `fixed-assets.service.ts` — Fixed Assets & Depreciation
**Models used**: `FixedAsset`, `FixedAssetType`, `GLEntry`
**Covers sidebar section**: Accountant > Fixed Assets
**Capabilities**:
- `listFixedAssets(orgId)` — all fixed assets
- `getFixedAssetById(orgId, id)` — single asset detail with depreciation schedule
- `createFixedAsset(orgId, data)` — register new fixed asset
- `updateFixedAsset(orgId, id, data)` — update asset details
- `getDepreciationSchedule(orgId, assetId)` — computed depreciation timeline
- `listFixedAssetTypes(orgId)` — asset type categories
- `createFixedAssetType(orgId, data)` — create new asset type
- `getFixedAssetFormSchema()` — JSON schema for fixed asset fields
- **NOTE**: AI can READ depreciation schedules but CANNOT trigger auto-depreciation — that is a batch/admin job

---

### Service 9: `taxes.service.ts` — Tax Configuration (Tax, TDS, TCS)
**Models used**: `Tax`, `TDSTax`, `TCSTax`
**Covers sidebar section**: Settings > Taxes
**Capabilities**:
- `listTaxes(orgId)` — all regular tax codes
- `listTDSTaxes(orgId)` — all TDS tax codes
- `listTCSTaxes(orgId)` — all TCS tax codes
- `getTaxById(orgId, id)` — single tax detail
- `createTax(orgId, data)` — create new tax entry
- `createTDSTax(orgId, data)` — create TDS tax entry
- `createTCSTax(orgId, data)` — create TCS tax entry
- `searchTaxes(orgId, query)` — search by name
- `getTaxFormSchema()` — JSON schema for tax fields (regular, TDS, TCS)

---

### Service 10: `inventory.service.ts` — Inventory Operations & Warehouses
**Models used**: `InventoryAdjustment`, `Package`, `MoveOrder`, `Putaway`, `Warehouse`
**Covers sidebar sections**: Inventory > Adjustments, Inventory > Packages, Inventory > Move Orders, Inventory > Putaways, Settings > Warehouses
**Capabilities**:
- `createInventoryAdjustment(orgId, data)` — adjust stock quantities
- `listAdjustments(orgId)` — list adjustments
- `createPackage(orgId, data)` — create shipment package
- `listPackages(orgId)` — list packages
- `createMoveOrder(orgId, data)` — create warehouse move order
- `listMoveOrders(orgId)` — list move orders
- `createPutaway(orgId, data)` — create putaway record
- `listPutaways(orgId)` — list putaways
- `listWarehouses(orgId)` — list warehouses
- `createWarehouse(orgId, data)` — create new warehouse
- `getInventoryFormSchemas()` — JSON schemas for all inventory types

---

### Service 11: `settings.service.ts` — Organization Settings, Opening Balances, Currencies, Reminders, Customer Portal, Gateway (PayU), Email Settings
**Models used**: `Organization`, `Currency`, `ExchangeRate`, `PaymentTerms`, `PaymentMode`, `PriceList`, `ReportingTag`, `SalesPerson`
**Covers sidebar sections**: Settings > General, Settings > Currencies, Settings > Opening Balances, Settings > Warehouses (delegated to inventory.service.ts), Settings > Reminders, Settings > Customer Portal, Settings > PayU (Payment Gateway), Settings > Email
**Capabilities**:
- `getOrgSettings(orgId)` — full org settings (fiscal year, address, tax preferences, GST info, industry, date format, etc.)
- `updateOrgSettings(orgId, data)` — update org settings
- `listCurrencies(orgId)` — all currencies for the org
- `createCurrency(orgId, data)` — add a new currency
- `getExchangeRate(orgId, fromCurrency, toCurrency)` — latest exchange rate
- `setExchangeRate(orgId, data)` — set/update an exchange rate
- `listPaymentTerms(orgId)` — Net 30, Net 60, Due on Receipt, etc.
- `createPaymentTerm(orgId, data)` — create new payment term
- `listPaymentModes(orgId)` — Cash, Bank Transfer, Cheque, UPI, etc.
- `createPaymentMode(orgId, data)` — create new payment mode
- `getOpeningBalances(orgId)` — all account opening balances (used for first-time setup)
- `setOpeningBalance(orgId, accountId, amount)` — set/update opening balance for one account
- `bulkSetOpeningBalances(orgId, data: [{accountId, debit, credit}])` — set all opening balances at once
- `getReminderSettings(orgId)` — get automated payment reminder configuration
- `updateReminderSettings(orgId, data)` — update reminder schedules, templates, enabled/disabled state
- `getCustomerPortalSettings(orgId)` — get customer portal configuration (branding, permissions, enabled)
- `updateCustomerPortalSettings(orgId, data)` — update customer portal settings
- `getGatewaySettings(orgId)` — get payment gateway config (PayU merchant key, salt, environment)
- `updateGatewaySettings(orgId, data)` — update payment gateway settings
- `getEmailSettings(orgId)` — SMTP server host, port, username, secure options
- `updateEmailSettings(orgId, data)` — update SMTP server configuration
- `listSalesPersons(orgId)` — list all sales persons
- `listPriceLists(orgId)` — list all price lists
- `listReportingTags(orgId)` — list all reporting tags
- `getSettingsFormSchemas()` — JSON schemas for all settings forms

---

### Service 12: `documents.service.ts` — Document Management
**Models used**: `Document`, `DocumentFolder`, `DocumentMailbox`
**Covers sidebar section**: Documents
**Capabilities**:
- `listDocuments(orgId, folderId?)` — list uploaded documents
- `uploadDocument(orgId, file, metadata)` — store a document (receipt, contract, etc.)
- `getDocumentById(orgId, docId)` — retrieve document details
- `deleteDocument(orgId, docId)` — remove document
- `listFolders(orgId)` — document folder tree
- `createFolder(orgId, data)` — create document folder

---

### Service 13: `reports.service.ts` — Financial Reports
**Models used**: Reads from `GLEntry`, `Invoice`, `Bill`, `Account`, `Contact`, `Item`
**Covers sidebar section**: Reports
**Capabilities**:
- `getProfitAndLoss(orgId, startDate, endDate)` — P&L report data
- `getBalanceSheet(orgId, asOfDate)` — balance sheet data
- `getCashFlowStatement(orgId, startDate, endDate)` — cash flow data
- `getAgedReceivables(orgId)` — aging buckets for customer receivables
- `getAgedPayables(orgId)` — aging buckets for vendor payables
- `getSalesByCustomer(orgId, startDate?, endDate?)` — top customers by revenue
- `getPurchasesByVendor(orgId, startDate?, endDate?)` — top vendors by spend
- `getItemSalesSummary(orgId, startDate?, endDate?)` — sales per item
- `getTaxReport(orgId, startDate, endDate)` — tax collected vs paid

*These services directly query the existing Mongoose models and compose the data. They do NOT call existing controller functions — they are independent query layers.*

### Future Service (NOT implemented now):
- **Service 14: `time-tracking.service.ts`** — Projects & Timesheets. This section is not working yet in the application. When it's ready, add this service file. Models: `Project`, `TimeLog`, `TimesheetEntry`.

---

## Section-to-Service Cross-Reference Table

This table maps every sidebar section to its backend service file:

| Sidebar Section | Service File | Status |
|---|---|---|
| Items | `items.service.ts` | ✅ Planned |
| **Sales > Customers** | `contacts.service.ts` | ✅ Planned |
| **Sales > Quotes** | `sales.service.ts` | ✅ Planned |
| **Sales > Sales Orders** | `sales.service.ts` | ✅ Planned |
| **Sales > Invoices** | `sales.service.ts` | ✅ Planned |
| **Sales > Retainer Invoices** | `sales.service.ts` | ✅ Planned |
| **Sales > Recurring Invoices** | `sales.service.ts` | ✅ Planned |
| **Sales > Delivery Challans** | `sales.service.ts` | ✅ Planned |
| **Sales > Payments Received** | `sales.service.ts` | ✅ Planned |
| **Sales > Credit Notes** | `sales.service.ts` | ✅ Planned |
| **Purchases > Vendors** | `contacts.service.ts` | ✅ Planned |
| **Purchases > Expenses** | `purchases.service.ts` | ✅ Planned |
| **Purchases > Recurring Expenses** | `purchases.service.ts` | ✅ Planned |
| **Purchases > Purchase Orders** | `purchases.service.ts` | ✅ Planned |
| **Purchases > Purchase Receives** | `purchases.service.ts` | ✅ Planned |
| **Purchases > Bills** | `purchases.service.ts` | ✅ Planned |
| **Purchases > Recurring Bills** | `purchases.service.ts` | ✅ Planned |
| **Purchases > Payments Made** | `purchases.service.ts` | ✅ Planned |
| **Purchases > Vendor Credits** | `purchases.service.ts` | ✅ Planned |
| **Accountant > Manual Journals** | `journals.service.ts` | ✅ Planned |
| **Accountant > Bulk Update** | `accountant.service.ts` | ✅ Planned |
| **Accountant > Currency Adjustments** | `accountant.service.ts` | ✅ Planned |
| **Accountant > Chart of Accounts** | `accounts.service.ts` | ✅ Planned |
| **Accountant > Fixed Assets** | `fixed-assets.service.ts` | ✅ Planned |
| **Accountant > Transaction Locking** | `accountant.service.ts` | ✅ Planned |
| **Inventory > Adjustments** | `inventory.service.ts` | ✅ Planned |
| **Inventory > Packages** | `inventory.service.ts` | ✅ Planned |
| **Inventory > Move Orders** | `inventory.service.ts` | ✅ Planned |
| **Inventory > Putaways** | `inventory.service.ts` | ✅ Planned |
| **Banking** | `accounts.service.ts` (read-only) | ✅ Planned |
| **Reports** | `reports.service.ts` | ✅ Planned |
| **Documents** | `documents.service.ts` | ✅ Planned |
| **Settings > General** | `settings.service.ts` | ✅ Planned |
| **Settings > Taxes** | `taxes.service.ts` | ✅ Planned |
| **Settings > Currencies** | `settings.service.ts` | ✅ Planned |
| **Settings > Opening Balances** | `settings.service.ts` | ✅ Planned |
| **Settings > Warehouses** | `inventory.service.ts` | ✅ Planned |
| **Settings > Reminders** | `settings.service.ts` | ✅ Planned |
| **Settings > Customer Portal** | `settings.service.ts` | ✅ Planned |
| **Time Tracking** | *Future — not implemented* | ⏸️ Deferred |

---

## 6. Phase-by-Phase Task Resumption (Replay/Retry Engine)
To handle recovery when a multi-step workflow fails (e.g. Sales Order created, but Invoice creation fails due to validation errors):

### [NEW] Route: `POST /ai-agent/tasks/:id/retry`
- Reads the existing `AIAgentTask` document by ID.
- Identifies the first phase index where `status === "failed"`.
- Resumes execution *from that index* using outputs from successful prior phases stored in `phases[i].result` (e.g., uses `phases[0].result.salesOrderId` to proceed with Invoice creation).
- Avoids duplicate records by not re-running successfully completed phases.
- Shows live resumption status in `agent-workflow-visualizer.tsx`.

---

## 7. File Upload in AI Chat (Image, PDF, XLSX)
The AI Chatbot and AI Agent should support file uploads directly in the chat input.

### What the user can upload:
- **Images** (JPG, PNG, WEBP) — receipt photos, screenshots, scanned documents
- **PDF** — invoices, bills, statements from external systems
- **Excel/CSV** (XLSX, XLS, CSV) — data sheets, item lists, bulk records

### How it works:

#### Frontend: `chatbot-panel.tsx` + `agent-chat.tsx`
- Add a paperclip/attachment icon button next to the send button in chat input
- On click: opens file picker accepting `image/*,.pdf,.xlsx,.xls,.csv`
- When file is selected:
  1. Show file preview in chat (image thumbnail or filename+size badge)
  2. User can add an optional text message alongside
  3. On send: upload file first via `POST /ai-agent/upload-and-extract`, then send the extracted text + user question to the chat/agent endpoint
- Show processing indicator: "📄 Reading your file..."

#### Backend: New route `POST /api/ai-agent/upload-and-extract`
- Accepts `multipart/form-data` with a single `file` field
- Logic by file type:
  - **Image/PDF**: Uses existing `ocrApi` / Gemini Vision API to extract text (the `ocr.service.ts` already does this via `/ocr/extract`)
  - **Excel/CSV**: Uses `xlsx` library to parse sheets, extract headers + first 100 rows as structured JSON, convert to readable text
- Returns: `{ success: true, data: { extractedText: string, fileType: string, metadata: { pages?, rows?, headers? } } }`
- The extracted text is then injected into the chat/agent message as context

#### New backend controller method in `ai-agent.controller.ts`:
```
uploadAndExtract(req, res):
  1. Read file from multer
  2. Detect type (image, pdf, excel, csv)
  3. If image/pdf → call Gemini Vision with: "Extract all text, numbers, and structured data from this document"
  4. If excel/csv → parse with xlsx library, stringify rows
  5. Return extracted text + metadata
```

#### State in chatbot panel:
```ts
const [attachedFile, setAttachedFile] = useState<File | null>(null);
const [extractedFileText, setExtractedFileText] = useState<string>("");
const [isExtracting, setIsExtracting] = useState(false);
```

When sending a message with an attachment:
1. Upload and extract first
2. Then send combined message: `{question: userText, fileContext: extractedText, sessionId}`
3. The chat handler receives `fileContext` and includes it in the Gemini prompt as additional context

---

## 8. Full Workflow Types (All Document Chains the AI Can Automate)

The `salesToPaymentWorkflow` in Phase 3 only covered one chain. Here are ALL automation chains:

### Chain 1: Sales Full Cycle
`Quote → Sales Order → Invoice → Payment Received`
- AI creates quote, converts to SO, converts to invoice, records payment
- Optional branches: Delivery Challan after SO, Credit Note after Invoice

### Chain 2: Purchase Full Cycle
`Purchase Order → Purchase Receive → Bill → Payment Made`
- AI creates PO, creates receive, converts to bill, records payment
- Optional branches: Vendor Credit after Bill

### Chain 3: Expense Quick Entry
`Expense → Payment Made` (if not paid through petty cash)
- AI creates expense, optionally records payment through a bank account

### Chain 4: Journal Entry Workflow
`Manual Journal → Post to GL → Verify Trial Balance`
- AI creates journal, posts to general ledger, checks trial balance is still balanced

### Chain 5: Opening Balance Setup
`List all Accounts → Set Opening Balances → Verify Trial Balance`
- AI helps user set up opening balances for all accounts during first-time setup
- Ensures total debits = total credits across all opening balances

### Chain 6: Inventory Adjustment
`Analyze Stock → Create Adjustment → Update Item Stock`
- AI identifies items with mismatched stock, creates inventory adjustments

### Chain 7: Recurring Document Generation
`Recurring Invoice → Generate Invoice` or `Recurring Bill → Generate Bill` or `Recurring Expense → Generate Expense`
- AI triggers scheduled recurring documents manually

### Backend support:
The `salesToPaymentWorkflow` function in `ai-agent.controller.ts` should accept a `chainType` parameter:
```ts
chainType: "sales_full" | "purchase_full" | "expense_quick" | "journal_entry" | "opening_balance" | "inventory_adjust" | "recurring_generate"
```
Each chain type maps to the corresponding service functions from the 12 services above.

---

## 9. Agent-Accessible Data Summary (What AI Can Read Per Section)

This is a complete mapping of what data the AI Agent can access for each section of the application:

| Section | Read Access | Write Access | Analysis |
|---|---|---|---|
| **Items** | All items, groups, units, warehouses | Create/update items | Inventory analysis, low stock alerts, value summary |
| **Sales > Customers** | All customers, balances | Create customers | Top customers, overdue receivables |
| **Sales > Quotes** | All quotes | Create quotes | Quote-to-order conversion rate |
| **Sales > Sales Orders** | All orders | Create orders, convert to invoice | Order fulfillment status |
| **Sales > Invoices** | All invoices | Create invoices | Revenue analysis, overdue aging |
| **Sales > Payments Received** | All payments | Record payments | Cash flow in |
| **Sales > Credit Notes** | All credit notes | Create, apply credits | Credit utilization |
| **Sales > Delivery Challans** | All challans | Create challans | Shipment tracking |
| **Sales > Recurring Invoices** | All recurring | Create recurring | — |
| **Sales > Retainer Invoices** | All retainers | Create retainers | Retainer utilization |
| **Purchases > Vendors** | All vendors, balances | Create vendors | Top vendors, overdue payables |
| **Purchases > Purchase Orders** | All POs | Create POs, convert to bill | PO fulfillment status |
| **Purchases > Purchase Receives** | All receives | Create receives | Goods receipt analysis |
| **Purchases > Bills** | All bills | Create bills | Payables aging |
| **Purchases > Payments Made** | All payments | Record payments | Cash flow out |
| **Purchases > Vendor Credits** | All credits | Create, apply credits | Credit utilization |
| **Purchases > Expenses** | All expenses | Create expenses | Expense category breakdown |
| **Purchases > Recurring Expenses** | All recurring | Create recurring | — |
| **Purchases > Recurring Bills** | All recurring | Create recurring | — |
| **Accountant > Chart of Accounts** | All accounts | Create accounts | Account tree, balance summary |
| **Accountant > Manual Journals** | All journals | Create, post, reverse | Journal analysis |
| **Accountant > Fixed Assets** | All assets | Create assets | Depreciation schedule |
| **Accountant > Currency Adjustments** | All adjustments | Create adjustments | Forex impact |
| **Accountant > Transaction Locking** | Lock status | — (read only for AI) | — |
| **Inventory > Overview** | Stock levels per warehouse | — | Stock valuation |
| **Inventory > Adjustments** | All adjustments | Create adjustments | Adjustment history |
| **Inventory > Packages** | All packages | Create packages | Package tracking |
| **Inventory > Move Orders** | All move orders | Create move orders | Warehouse transfer analysis |
| **Inventory > Putaways** | All putaways | Create putaways | — |
| **Banking** | All bank accounts | — (read only for AI) | Bank reconciliation status |
| **Time Tracking > Projects** | All projects | Create projects | Project profitability |
| **Time Tracking > Timesheet** | All time entries | Log time | Hours analysis |
| **Reports** | All report types | Generate reports | Full financial analysis |
| **Documents** | All documents, folders | Upload documents | — |
| **Settings > General** | Org settings | Update settings | — |
| **Settings > Opening Balances** | All opening balances | Set/update balances | Trial balance verification |
| **Settings > Taxes** | All tax codes (Tax, TDS, TCS) | Create taxes | Tax compliance summary |
| **Settings > Currencies** | All currencies, rates | — | Multi-currency analysis |
| **Settings > Warehouses** | All warehouses | Create warehouses | — |

---

# Known Constraints & Gotchas

1. **Next.js App Router**: Pages in `app/` are Server Components by default. Add `"use client"` at top for any component using useState, useEffect, browser APIs.

2. **shadcn/ui Tabs**: Import from `@/components/ui/tabs`. If not installed, run `npx shadcn@latest add tabs` in `/client`.

3. **Mongoose ObjectId vs String**: `organizationId` in models should be `Schema.Types.ObjectId`. The `req.user.activeOrganization._id` is an ObjectId — cast with `new Types.ObjectId(...)` when querying.

4. **Firebase UID**: `req.user._id` is the MongoDB user ID (string). `req.firebaseUser.uid` is the Firebase UID. Use `req.user._id` consistently for `userId` in new models since that's what existing models use.

5. **`AuthenticatedRequest` type**: Import from `../types`. It extends `Request` with `user` and `firebaseUser` properties.

6. **Polling vs SSE**: For workflow status updates, use polling (`setInterval` every 2 seconds) — NOT SSE/WebSockets. SSE requires extra Express setup. Polling is simpler and sufficient.

7. **Tailwind dark classes**: The AI Agent page uses dark-mode-style classes. Since the app doesn't have a dark mode toggle, use explicit dark color classes (e.g., `bg-slate-900` not `dark:bg-slate-900`).

8. **Rate limiting**: The existing `/chat` rate limit is 20 req/min. New `/api/ai-agent/ask` should have its own rate limit: 10 req/min (agent tasks are more expensive).

9. **Item creation**: `Item` model in backend is at `../models/item.model`. It requires `organizationId` which must match `req.user.activeOrganization._id`.

10. **Existing `handleChat` in chat.controller.ts**: This file is 1031 lines with complex RAG logic. When modifying for session persistence, only add code AFTER the `res.json()` call (or just before it) — do NOT touch vector search, embedding, or Gemini call sections.

11. **File uploads in chat**: Use `multer` middleware (already used in OCR routes) to handle `multipart/form-data`. Max file size: 10MB. Accepted types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `text/csv`.

12. **Opening Balances**: The opening balance system writes to `GLEntry` model with `type: "opening"`. When the AI sets opening balances, it must first check if an opening entry already exists for that account — if yes, update it (don't create duplicates).

13. **Fixed Assets**: Fixed asset depreciation is calculated. The AI Agent should be able to read asset data and depreciation schedules but NOT auto-depreciate — that's a batch job.

14. **Transaction Locking**: The AI Agent must check the transaction lock date before creating any backdated documents. If a date is locked, the AI must tell the user: "This date is locked. Please unlock it in Accountant > Transaction Locking or use a later date."

15. **Existing OCR service**: The backend already has `ocr.service.ts` at `backend/src/services/ocr.service.ts` which uses Gemini Vision for image/PDF extraction. The new `/ai-agent/upload-and-extract` route should reuse this service, NOT duplicate it. For Excel files, use the `xlsx` library which is already a project dependency.
