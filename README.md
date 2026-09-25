**English** | [简体中文](README.zh.md) | [Русский](README.ru.md) | [الفلسطينية (العربية)](README.ar.md)

# ✍️ Author — AI-Powered Creative Writing Platform

> An AI-powered writing studio for novelists, screenwriters, and storytellers.

**Author** is an AI-assisted creative writing tool designed for fiction writers. It brings together a professional rich text editor, an intelligent AI writing assistant, and a complete worldbuilding management system — all in one seamless experience.

🌐 **Live Demo**: [author-delta.vercel.app](https://author-delta.vercel.app)

📦 **Gitee Mirror (国内镜像)**: [gitee.com/yuanshijilong/author](https://gitee.com/yuanshijilong/author)

---

## 💬 Why I Built This

I've been using AI for a while now — from the early days of ChatGPT 3.5, to Gemini 2.0 Exp Thinking, and eventually settling on Gemini 2.5 Pro Thinking after the ChatGPT o1 era.

As a novelist, I care deeply about AI's ability to handle language. Novels are long, so I need models with strong context windows and high recall. But what truly moved me about Gemini was its characters — there were moments when the words on screen made me want to cry. That's emotional resonance. I need writing that embraces the full complexity of being human.

Then the coding-focused trend took over. Every company started optimizing for code. I thought it was a good thing — until Gemini 3.1 Pro started describing its characters in biological and psychological terminology. Code-optimized models had begun deconstructing humans into biological components. Claude Opus 4.6 was even worse: every character spoke with peak efficiency — concise, economical, not like a human, but like a machine wearing a human mask.

**I could no longer see the models understanding human complexity. They didn't care about what humans *do* — only what humans *are*. They stopped showing personality through behavior and emotion, and instead slapped simple definitions onto human beings.**

I watched the versatility of these models being gutted. I don't want us to live in a cold world of code. I built this project so that AI can preserve **our own language** — beyond the mechanical operators.

> To all the authors, screenwriters, hobbyists, readers, and players who use this project: I hope you can bring out the best of your craft, create works with a human touch, and keep the flame of our language alive. 🔥

---

## ✨ Features

### 📝 Professional Editor
- Rich text editor powered by **Tiptap** — bold, italic, headings, lists, code blocks, and more
- **Word-style pagination** with WYSIWYG layout
- **Inline remarks / comments** — mark any sentence with a side note; DOCX annotated exports use native Word comments
- **KaTeX** math formula support
- Customizable fonts, font size, line height, and colors
- **Text to speech on desktop and Android** — read the selection or current chapter with pause, resume, voice, and speed controls
- **Current paragraph highlight** — optional focus tint plus a retained caret when the editor loses focus
- Real-time word / character / paragraph count

### 🤖 AI Writing Assistant
- **Multi-provider support**: ZhipuAI GLM-4 / DeepSeek / OpenAI / Google Gemini / Claude / SiliconFlow / Volcengine / Moonshot + custom endpoints
- **Smart model fetching** — one-click fetch full model list from API, keep saved models manageable even if a provider stops returning them
- **Continue / Rewrite / Polish / Expand** — one-click generation
- **Immersive Writing Engine (Ghost Text)** streaming preview — see AI output in real-time like Cursor, with accept/reject
- **Free chat mode** — discuss plot, characters, and settings with AI
- **Configurable chat send shortcut** — choose Enter to send or Ctrl/⌘ + Enter to send, for both compact and expanded chat input
- **Global AI Memory (Context Engine)** — AI automatically reads your character profiles, worldbuilding, and previous chapters to maintain story consistency
- **Choose AI references by volume** — select whole volumes or individual chapters; clearing all references stays saved
- **Optional strikethrough exclusion** — off by default; AI can skip struck-through text while preserving the original manuscript and formatting

### 📚 Worldbuilding Manager
- **Tree-structured** management for characters, locations, items, outlines, and writing rules
- Three writing modes: **Web Novel** / **Literary Fiction** / **Screenplay**, each with dedicated fields
- Color-coded categories with glassmorphism design
- Rename top-level categories per work from the full settings panel or the sidebar category popover edit mode
- Settings automatically injected into AI context

### 💾 Data Management
- **Local-first** — creative data stays in browser IndexedDB by default; selected data is sent only when you explicitly enable cloud sync, WebDAV, or LAN transfer
- **Snapshot system** — manual/auto versioning with one-click rollback
- **Project import/export** — full project JSON backup
- **Multi-format export** — one-click export current chapter or batch export (TXT / Markdown / DOCX / EPUB / PDF), with body-only or annotated versions

### 📱 Mobile App
- **Android app** — native Flutter app with local-first writing and richer reading mode controls
- Read and write your novels on the go
- Author Cloud account sign-in is available only in the official web app; the mobile app does not provide account sign-in

### 🌐 Internationalization
- 🇨🇳 简体中文 / 🇺🇸 English / 🇷🇺 Русский

### 🎨 User Experience
- Eye-comfort warm tones / dark mode toggle
- Interactive onboarding tour
- Help panel with keyboard shortcuts

---

## 💻 Desktop & Mobile

**No Node.js required!** Download the pre-built installer:

- 📥 [Download Author Setup (Windows)](https://github.com/YuanShiJiLoong/author/releases/latest)
- 📱 [Download Author APK (Android)](https://github.com/YuanShiJiLoong/author/releases/latest)

Just install and start writing. All features work out of the box.

> 💡 To build the desktop app from source: `npm run build && npx electron-builder --win`

### 🐛 Troubleshooting / Debug Logs

If you encounter a white screen, crash, or startup failure:
- In the app, open **Help → About → Export Diagnostic Logs** to download `author-diagnostic-*.json`.
- On the desktop client, **Help → About → Open Log Folder** opens the local log location.
- **Desktop main log**: `%APPDATA%\author-app\author-debug.log` (`C:\Users\<YourUsername>\AppData\Roaming\author-app\author-debug.log`).
- **Desktop crash reports**: `%APPDATA%\author-app\crash-reports\author-crash-*.json`.
- Browser, source-code, and Vercel deployments do not have the desktop log folder; use the in-app diagnostic export instead.
- Diagnostic files redact API Keys, tokens, Authorization headers, secrets, and public IPs.

---

## 🚀 Getting Started

> 💡 **Highly Recommended**: For most users who only need daily writing, please [directly download and install the client](https://github.com/YuanShiJiLoong/author/releases/latest). Source code or Vercel deployment is intended for advanced users who need **secondary development** or want to configure WebDAV or their own Author sync server.

### Requirements
- **Node.js** 18+
- **npm** 9+ or **pnpm** 8+

### Installation

```bash
# Clone the repository
git clone https://github.com/YuanShiJiLoong/author.git
# Or use Gitee mirror (faster in China)
# git clone https://gitee.com/yuanshijilong/author.git
cd author

# Install dependencies
npm install
# Or use pnpm (no phantom dependency issues)
# pnpm install
# pnpm approve-builds    # Required by pnpm to activate native packages

# Configure environment variables (optional)
cp .env.example .env.local
# Edit .env.local with your API keys
# You can also configure them in the app's Settings panel
```

### Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to start writing.

### Production Build

```bash
npm run build
npm start
```

### Subpath Deployment

Set `NEXT_PUBLIC_BASE_PATH` only when mounting your self-hosted app below the domain root. For example:

```env
NEXT_PUBLIC_BASE_PATH=/app
```

Keep real domains, registration values, service endpoints, credentials, and operator configuration in your own deployment environment rather than committing them to the repository.

### Deploy to Vercel

> 💡 **⚠️ Note:** A Vercel deployment does not include the official Author Cloud account service. Use local storage, WebDAV/LAN, or your own Author sync server.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YuanShiJiLoong/author)

### ☁️ Sync Options

- Account-based Author Cloud sync is available only in the [official web app](https://free.author2.com/app).
- The desktop client does not connect to the official Author Cloud. It supports WebDAV, temporary LAN transfer, and user-owned Author sync servers under **Preferences → Cloud Sync**.
- The mobile app does not provide Author Cloud account sign-in. Use local backup and export for data portability.
- Source and Vercel deployments do not include the official account service; use WebDAV/LAN or connect your own Author sync server.

---

## 🔄 Updating

### Desktop Client Users

Download the latest installer from the [Releases](https://github.com/YuanShiJiLoong/author/releases/latest) page and install it over your current version. Your data is stored in the browser/Electron profile. Export a backup before upgrading, and keep your existing access address and user-data directory.

### Self-Deployed Users (Source)

#### Option 1: In-App Auto Update

Open **Help Panel → About → Check for Updates** and click "Update Now". This automatically runs `git pull → npm install → npm run build`.

> ⚠️ **You must restart the server after updating for changes to take effect.** The app will display restart instructions.

#### Option 2: Manual Update

```bash
# 1. Pull latest code
git pull origin main

# 2. Install dependencies (if any new ones)
npm install
# or: pnpm install && pnpm approve-builds

# 3. Rebuild (required for production mode)
npm run build

# 4. Restart the server
# Development mode: Ctrl+C to stop, then restart
npm run dev

# Production mode: Ctrl+C to stop, then restart
npm start

# Using PM2:
pm2 restart author
```

> ⚠️ **Running `git pull` without restarting the server will NOT apply the update.** The running Node.js process still uses the old code.

### Vercel Users

If you deployed via Vercel fork, just sync your fork with upstream on GitHub — Vercel will automatically redeploy.

---

## ⚙️ AI Configuration

Author supports multiple AI providers. Configure via **environment variables** or **in-app settings**:

| Provider | Env Variable | Get API Key |
|----------|-------------|-------------|
| ZhipuAI (GLM-4) | `ZHIPU_API_KEY` | [open.bigmodel.cn](https://open.bigmodel.cn/) |
| Google Gemini (Native) | `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/apikey) |
| Google Gemini (OpenAI-compat) | `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/apikey) |
| DeepSeek | In-app config | [platform.deepseek.com](https://platform.deepseek.com/) |
| OpenAI | In-app config | [platform.openai.com](https://platform.openai.com/) |
| OpenAI Responses | In-app config | [platform.openai.com](https://platform.openai.com/) |
| Claude (Anthropic) | `CLAUDE_API_KEY` | [console.anthropic.com](https://console.anthropic.com/) |
| SiliconFlow (硅基流动) | In-app config | [siliconflow.cn](https://siliconflow.cn/) |
| Volcengine (火山引擎/豆包) | In-app config | [console.volcengine.com](https://console.volcengine.com/) |
| Moonshot (Kimi) | In-app config | [platform.moonshot.cn](https://platform.moonshot.cn/) |
| Custom (OpenAI-compat) | In-app config | Any OpenAI-compatible endpoint |
| Custom (Gemini format) | In-app config | Any Gemini-compatible endpoint |
| Custom (Claude format) | In-app config | Any Claude-compatible endpoint |

> 💡 **Tip:** You can configure **multiple API keys** for the same provider to create a key pool. Simply separate the keys with commas `,` or spaces. The system will automatically rotate through them (round-robin) to distribute the load and avoid rate limits.

> 💡 **No API key required** for most editing features. AI features need at least one provider configured.

> 🖥️ **Local models (Ollama, LM Studio, …):** choose **Custom compatible endpoint** and enter the model server's address (usually ending with `/v1`). For Docker / NAS setups and troubleshooting, see the [Local Model Guide](LOCAL_MODELS_EN.md).

---

## 🔍 Web Search Configuration

Author supports AI-powered web search for real-time information. Different providers handle search differently:

| Provider | Search Method | Extra Setup |
|----------|--------------|-------------|
| Gemini (Native) | Built-in Google Search | No extra config needed |
| OpenAI / OpenAI Responses | Built-in Web Search | No extra config (needs search model) |
| DeepSeek / ZhipuAI / SiliconFlow / Others | External Search API | **Search engine Key required** |

For providers without built-in search, choose a search engine and enter your API Key:

### Tavily (Recommended — Simplest)

1. Visit [tavily.com](https://tavily.com) and create an account
2. After login, find your API Key on the Dashboard (format: `tvly-...`)
3. In Author Settings → Web Search → Select **Tavily** → Paste the Key

> Free tier: **1,000 requests/month**

### Exa (Semantic Search)

1. Visit [exa.ai](https://exa.ai) and create an account
2. Get your API Key from the [Dashboard](https://dashboard.exa.ai/api-keys)
3. In Author Settings → Web Search → Select **Exa** → Paste the Key

> Free tier: **1,000 requests/month** — Semantic search optimized for AI use cases

### Custom Search API URL (Proxy Pool)

If you've set up a Tavily/Exa proxy pool using multiple free-tier accounts, you can configure a **custom API URL** in the search settings:

1. In Author Settings → Web Search → Search engine config area
2. Find the "🔗 Custom API URL (optional)" input field
3. Enter your proxy URL, e.g. `https://your-proxy.com`
4. Leave blank to use the official default URL

> 💡 The system automatically appends `/search` to your URL — no need to add it manually

---

## 🧠 Vectorization (Embedding) & RAG Settings Retrieval

> 💡 This feature is designed for long-form works with many settings entries (>20). Typical short stories usually don't need this.

### What Is Vectorization?

By default, AI conversations inject **all settings entries** into the context. When the number of entries is large, this exceeds the model's context length limit.

**Vectorized retrieval (RAG)** works differently: each settings entry is converted into a mathematical vector. During a conversation, the system automatically calculates semantic similarity and only injects the **most relevant entries** into the context — instead of dumping everything.

### When Do You Need It?

| Scenario | Recommendation |
|----------|---------------|
| Settings entries < 20 | Not needed — full injection works fine |
| Settings entries 20–100 | Recommended — improves recall accuracy |
| Settings entries > 100 | Highly recommended — critical settings won't be forgotten |

### How to Configure

1. Open **Settings** → **API Configuration**
2. Find and enable the "Separate Embedding API" toggle
3. Fill in the following:

| Setting | Description |
|---------|-------------|
| **Embedding API Key** | API key for the embedding model (can share the same key as your chat model provider) |
| **Embedding Base URL** | API endpoint (e.g., `https://api.openai.com/v1`) |
| **Embedding Model** | Model name (see recommendations below) |

If your embedding service requires no API key, turn off chat-key reuse and leave the embedding key blank.

#### Recommended Models

| Provider | Model Name | Notes |
|----------|-----------|-------|
| OpenAI | `text-embedding-3-small` | Cost-effective, 1536 dimensions |
| OpenAI | `text-embedding-3-large` | Higher accuracy, 3072 dimensions |
| ZhipuAI | `embedding-3` | Optimized for Chinese, 2048 dimensions |
| SiliconFlow | `BAAI/bge-m3` | Multilingual, free tier available |

### Automatic Vectorization

- **Auto-trigger**: After a settings entry changes, the system automatically debounces for 3 seconds before triggering vectorization.
- **Incremental update**: Only modified entries are updated. It avoids full rebuilds to save API quotas and time.
- **Local storage**: Vector data is stored locally in IndexedDB and never uploaded to any server.
- **Auto-initialization**: When importing settings or syncing from the cloud, the system will automatically build missing vector indexes in the background.

### Manual Rebuild

If you switch Embedding models or the vector index becomes corrupted, you can manually rebuild:

1. Open **Settings** → **API Configuration**
2. Click the "**Rebuild Vector Index**" button
3. Wait for all entries to be re-vectorized

### Workflow

```
User edits settings entry → 3s debounce → Call Embedding API for vector
                                                    ↓
                                           Store in local IndexedDB
                                                    ↓
AI conversation → Vectorize user input → Cosine similarity matching → Inject Top-K settings into context
```

---

## 💾 Settings Import Format Documentation

Author supports importing settings from multiple formats: **JSON / Markdown / TXT / DOCX / PDF**.

### Core Structure: Four Tiers

The import system uses **structural markers** to strictly distinguish the following four tiers. Regardless of the format used, this nested structure must be followed:
`Category → Entry → Field → Value (can be multiline)`

Therefore, **any custom category, custom tag, or custom field can be correctly recognized** and losslessly restored.

### Format Reliability & Tier Marker Reference

| Rating | Format | Category | Entry | Field | Multiline |
|------|--------|----------|-------|-------|-----------|
| ⭐⭐⭐⭐⭐ (Lossless) | **JSON** | `category` | `name` | `content` key-val | `\n` newline |
| ⭐⭐⭐⭐⭐ (Lossless) | **MD** | `## Category Name` | `### Entry Name` | `**Tag**: Value` | Indented text |
| ⭐⭐⭐⭐ (Lossless) | **TXT** | `│ Category Name` | `【Entry Name】` | `〈Tag〉: Value` | Indented text |
| ⭐⭐⭐ (High-Fidelity) | **DOCX** | Heading 1 | Heading 2 | **Bold** Tag + colon | Indented paragraph |
| ⭐⭐ (High-Fidelity) | **PDF** | `■ Category Name` | `◆ Entry Name` | `▸ Tag: Value` | Indented text |

---

### Markdown Format Template (Recommended)

Use `##` for categories, `###` for entry names, and `**Tag**: Content` for fields:

```markdown
## Any Custom Category

### John Doe

**Role**: Protagonist
**Background Story**: Born deep in the mountains.
  Studied martial arts with his grandfather since childhood.
  His master said: "You must find the answers yourself."
**Custom Bloodline**: Half-dragon bloodline

### Sarah White
**Gender**: Female
**Personality**: Lively and cheerful, detail-oriented
```

---

### TXT Format Template

Use `│` for the category box, `【】` for entry names, and `〈Tag〉:` for fields:

```
┌──────────────────────────
│ Any Custom Category
└──────────────────────────

【John Doe】
〈Gender〉: Male
〈Background Story〉: Born deep in the mountains.
  Studied martial arts with his grandfather since childhood.
  His master said: "You must find the answers yourself."
〈Custom Bloodline〉: Half-dragon bloodline
```

---

### DOCX Format Template

In Word, use **Heading styles and bolding** to mark structure:
- **Heading 1 (H1)** → Category Name (e.g., "Any Custom Category")
- **Heading 2 (H2)** → Entry Name (e.g., "John Doe")
- **Body First Paragraph** → **Bold Field Name**: Content (e.g., **Custom Bloodline**: Half-dragon bloodline)
- **Body Continuation** → Multiline content with first-line indent

---

### 💡 Compatibility Design & Notes

1. **Auto Tag Fallback (Backwards Compatibility)** — If a structural marker is missing in TXT/Markdown (e.g., using `Name: John Doe` instead of `**Name**: John Doe`), the system will automatically parse it compatibly *only if* `Name` belongs to the known core field set. However, to guarantee 100% recognition and extraction of *custom* fields, you must add the structural formatting.
2. **Multiline Value Handling** — Whenever you start with `**Tag**: ` or `〈Tag〉: `, any subsequent **lines indented by 2 spaces** will be considered the body of that field (multiline value extraction), until the next structural tag is encountered.
3. **DOCX / PDF Parsing Limitations** — PDFs are extracted using specially designed `▸` identifiers. If the imported PDF/DOCX file was not generated by this system, a heuristic parser will attempt to extract the content as best as possible, but 100% fidelity cannot be guaranteed.
4. **JSON is the Most Complete** — JSON is undoubtedly the strictest format and the only one capable of 100% migrating all attributes (including writing mode and project info). If you are simply changing writing devices, JSON import/export is strongly recommended.

---

## 🔒 Privacy & Data Security

### Local Storage (Safe)
- Creative data (chapters, settings, snapshots) is stored locally in browser IndexedDB by default. If you explicitly enable Author Cloud, WebDAV, or LAN transfer, the selected sync data is sent to the configured service or peer.
- Browser deployments store AI API keys in localStorage; the desktop client protects them with the operating system's secure storage.

### ⚠️ Data Flow When Using AI Features

When the provider supports browser access and no proxy or web search is enabled, the official web app sends your **API key** and **AI request text** directly from your browser to the provider.

For providers that block direct browser access, configured proxy endpoints, web search, or deployments that disable direct calls, the request passes through that deployment's API routes before reaching the provider. The desktop client uses a loopback service on the same computer.

- Enter API keys only in deployments you trust.
- Prefer restricted, revocable provider keys where available.
- Self-host the application if you need full control over the relay environment.

---

## 📄 License

This project is licensed under [AGPL-3.0](LICENSE).

**In short**:
- ✅ Free to use, modify, and distribute
- ✅ Personal and commercial use allowed (as long as you open-source your changes)
- ⚠️ Modified versions must also be open-sourced under AGPL-3.0 (including network services / SaaS)
- ⚠️ Original copyright notice must be preserved
- ❌ Closed-source commercial use is NOT allowed

See [Public Repository Safety Boundary](OPEN_CORE_BOUNDARY.md) for the material that must remain outside public source and releases.

---

## 📜 Legal Documents

By using Author, you agree to our **Privacy Policy** and **Terms of Service**. These documents are available in multiple languages:

| Document | English | 中文 | Русский | العربية |
|----------|---------|------|---------|---------|
| Privacy Policy | [PRIVACY.md](PRIVACY.md) | [PRIVACY.zh.md](PRIVACY.zh.md) | [PRIVACY.ru.md](PRIVACY.ru.md) | [PRIVACY.ar.md](PRIVACY.ar.md) |
| Terms of Service | [TERMS.md](TERMS.md) | [TERMS.zh.md](TERMS.zh.md) | [TERMS.ru.md](TERMS.ru.md) | [TERMS.ar.md](TERMS.ar.md) |

> 💡 **For users in mainland China**: If GitHub is inaccessible, you can view these documents via the [Gitee mirror](https://gitee.com/yuanshijilong/author). The legal documents are also bundled with every desktop release and accessible offline within the application.

---

## 🙏 Acknowledgments

### 🛡️ Community Contributors
- [@inliver233](https://github.com/inliver233) — Reported several security issues with reproduction steps and proposed fixes, covering update-endpoint authentication, server-side request address validation, link and export-title escaping, and error-message sanitization. All of them have been fixed

### 🤖 AI Companions
| Name | Role |
|------|------|
| [ChatGPT 5.5](https://openai.com/chatgpt/) (xhigh) | Primary reasoning and coding model |
| [Claude Opus 4.6](https://www.anthropic.com/) (Thinking) | Architecture, implementation, and debugging collaborator |
| [Gemini 3.1 Pro](https://deepmind.google/technologies/gemini/) (High) | UI review, screenshot analysis, design iteration |
| [Gemini 3 Flash](https://deepmind.google/technologies/gemini/) | Built-in browser automation tool |

### 🛠️ AI Programming IDE
- [Antigravity](https://antigravity.google/) — AI programming partner
- [Codex](https://openai.com/codex/) — Primary AI coding tool

### 🔌 MCP Tools
- [Chrome DevTools MCP](https://developer.chrome.com/) — Browser testing, performance analysis, DOM inspection
- [GitHub MCP](https://github.com/) — Repository management, automated releases, code search

### ☁️ Deployment
- [Vercel](https://vercel.com/) — Optional full-stack hosting for self-deployed copies

### 📦 Frontend & Open Source
- [Next.js](https://nextjs.org/) — React full-stack framework
- [Tiptap](https://tiptap.dev/) — Core editor framework
- [Zustand](https://zustand-demo.pmnd.rs/) — State management
- [KaTeX](https://katex.org/) — Math rendering

### 🌟 Inspiration & Reference
Author's multi-provider API configuration experience was inspired by RikkaHub, Cherry Studio and other open-source AI clients in their approach to Provider, model, Base URL, and local key management.

- Cherry Studio: [github.com/CherryHQ/cherry-studio](https://github.com/CherryHQ/cherry-studio)
- RikkaHub: [github.com/RikkaApps/RikkaHub](https://github.com/RikkaApps/RikkaHub)
- This project does not contain any source code, assets, or binaries from RikkaHub or Cherry Studio. If their code is directly referenced in the future, their respective licenses must be observed.

### 🔤 Typography
- [LXGW WenKai (霞鹜文楷)](https://github.com/lxgw/LxgwWenKai) — Elegant local Chinese reading font
- [Inter](https://fonts.google.com/specimen/Inter) — Clean UI English font
