# Dev Helper

## 1) Pipeline Architecture — Strict Path Separation

EventBase is the **exclusive** retrieval path for chat content. The legacy `eventbase_enabled` toggle has been removed — chat history (live and uploaded archive `.jsonl`) is hard-routed through EventBase ingestion + retrieval. Legacy chunking for chat is no longer supported.

### Two pipelines, strict ownership

| Pipeline | Content scope | Owned collections | Code entry point |
|---|---|---|---|
| **EventBase pipeline** | Chat history only (live chat + archive `.jsonl`) | `vecthare_eventbase_*`, `vecthare_archiveevent_*` | `eventbase-workflow.js` → `eventbase-retrieval.js` |
| **Standard (Chunk) pipeline** | Non-chat content only — Lorebook / World Info, Character Cards, URLs / web pages, custom documents, wiki pages, YouTube transcripts | `vecthare_lorebook_*`, `vecthare_document_*`, user collections | `chat-vectorization.js` → `queryAndMergeCollections` |

The two paths never see each other's content. There is no overlap in collection prefixes or content types.

### Key isolation rule (`core/chat-vectorization.js` → `gatherCollectionsToQuery`)

- `vecthare_eventbase_*` → **always** skipped by the standard pipeline (EventBase pipeline owns them exclusively)
- `vecthare_archiveevent_*` → **always** skipped by the standard pipeline (EventBase pipeline owns them exclusively)
- `vecthare_chat_*` → **always** skipped by the standard pipeline (legacy chunk-based chat collections; no longer created since the EventBase toggle was removed, but pre-existing ones are excluded unconditionally)

### Archive Chat History — Two content paths

| Path | Content Type in UI | Collection prefix | Storage format | Retrieval |
|---|---|---|---|---|
| **A — EventBase** | `Chat → Upload` tab | `vecthare_archiveevent_*` | Event-shaped (same schema as live EventBase) | Phase A (EventBase re-ranker) |
| **B — Chunk** | `Document` content type | `vecthare_document_*` | Chunk-shaped | Phase B (standard pipeline) |

Archive event collections are **not** auto-locked to any chat after ingestion. Users must manually check "Active for current chat" on the collection card to activate retrieval for a given chat.

### Why this matters

Before the toggle removal, `vecthare_eventbase_*` collections could be included in the standard pipeline when EventBase was OFF, causing them to be queried twice per generation: once by the EventBase pipeline (structured event retrieval with dedup-depth) and once by the standard pipeline (raw chunk retrieval). The standard pipeline query was always redundant and could inject duplicate content. With the toggle gone, this class of bug is structurally impossible.

---

## 2) Extraction Level Location
Extraction levels are defined in: `core/keyword-boost.js`

Exact export name:
`EXTRACTION_LEVELS`

```javascript
export const EXTRACTION_LEVELS = {
    off: {
        label: 'Off',
        description: 'No auto-extraction, only WI trigger keys',
        enabled: false,
    },
    minimal: {
        label: 'Minimal',
        description: 'First 1500 chars, max 5 keywords',
        enabled: true,
        headerSize: 1500,
        minFrequency: 1,
        maxKeywords: 5,
    },
    balanced: {
        label: 'Balanced',
        description: 'First 5000 chars, max 12 keywords',
        enabled: true,
        headerSize: 5000,
        minFrequency: 1,
        maxKeywords: 12,
    },
    aggressive: {
        label: 'Aggressive',
        description: 'Full text scan, max 15 keywords',
        enabled: true,
        headerSize: null, // null = full text
        minFrequency: 1,
        maxKeywords: 15,
    },
};
```

## 3) Default Summarizer Token/Timeout Constants 
Located in: `core/summarizer.js`

Exact constant names:
- `DEFAULT_MAX_TOKENS`
- `DEFAULT_TIMEOUT_MS`

## 4) Group Batch Message Settings (going to demise as this is chunk based logic)
Located in: `core/summarizer.js`

Exact variable names used in grouped summarize flow:
- `groupMaxTokens`
- `groupTimeoutMs`

Notes:
- `groupMaxTokens` is computed from per-item budget and count, capped at 8192.
- `groupTimeoutMs` is computed as base timeout + per-item scaling, capped at 180000 ms.

## 5) Collection Active State — Two Separate Controls

There are **two independent toggles** for collection activity. They store data in different fields and must be checked separately.

### A) Card Pause/Resume Button (`enabled` flag)
- **UI:** Play/pause icon button on each collection card in the Database Browser
- **Writes:** `setCollectionEnabled(registryKey, false)` → stores `{ enabled: false }` under `extension_settings.vecthareplus.collections[registryKey]`
- **Key format:** `collection.registryKey || collection.id` — for EventBase collections registered via `eventbase-store.js`, this is the **plain collection ID** (no `backend:source:` prefix) because `registerCollection(collectionId)` is called with the raw ID
- **Read:** `isCollectionEnabled(collectionId)` in `core/collection-metadata.js` line 318
- **Default:** `true` (enabled) when no metadata exists

### B) "Active for current chat" Checkbox (lock system)
- **UI:** Checkbox in the Collection Settings panel (gear icon → "Active for current chat")
- **Writes:** `setCollectionLock(collectionId, chatId)` / `removeCollectionLock(collectionId, chatId)` → stores chat IDs in `{ lockedToChatIds: [...] }` under the **plain collection ID** entry in metadata
- **Key format:** Plain collection ID (`state.collectionId` which is `collection.id`, not `collection.registryKey`)
- **Read:** `isCollectionLockedToChat(collectionId, chatId)` in `core/collection-metadata.js` line 626
- **Role:** This is a **fallback activation** — not a gate. A collection locked to the current chat activates even with no triggers/conditions. A collection NOT locked can still activate if its triggers or conditions match.

### Activation Priority (in `shouldCollectionActivate`, `core/collection-metadata.js`)

```
1. Pause button (enabled=false)     → BLOCKED always, nothing else checked
2. Activation Triggers match        → ACTIVE  (regardless of lock state)
3. Advanced Conditions pass         → ACTIVE  (regardless of lock state)
4. "Active for current chat" locked → ACTIVE  (manual always-on fallback)
5. Nothing matched                  → BLOCKED
```

Behaviour matrix:

| Checkbox | Triggers/Conditions | Result |
|---|---|---|
| ✗ unchecked | keywords match | ✓ ACTIVE (triggers win) |
| ✓ checked | empty | ✓ ACTIVE (lock fallback) |
| ✓ checked | keywords match | ✓ ACTIVE (triggers win) |
| ✓ checked | set but no match | ✓ ACTIVE (lock fallback) |
| ✗ unchecked | set but no match | ✗ BLOCKED |
| ✗ unchecked | empty | ✗ BLOCKED |
| any | Pause button on | ✗ BLOCKED always |

> **Old Priority 1.3 is removed.** Previously there was a blocking gate (`NOT_LOCKED_TO_CURRENT_CHAT`) that prevented collections with a `lockedToChatIds` field from activating in other chats. This gate is gone — the lock is now purely additive (activation fallback), not restrictive.

### Key files
- `core/collection-metadata.js` — `shouldCollectionActivate`, `isCollectionEnabled`, `setCollectionEnabled`, `isCollectionLockedToChat`, `setCollectionLock`, `removeCollectionLock`, `getCollectionLocks`
- `ui/database-browser.js` line ~1055 — card toggle handler (`vecthare-action-toggle`)
- `ui/database-browser.js` function `saveActivation` — "Active for current chat" save handler
- `ui/database-browser.js` function `openActivationEditor` — reads lock state to populate checkbox

---

## 6) EventBase Window Dedup — chat_metadata Fingerprint Cache

### Problem with old approach
`isWindowAlreadyExtracted` used a semantic DB query (`queryCollection(..., 50, ...)`) to check if a window was already extracted. This was:
- Capped at 50 results → missed already-extracted windows if >50 events in DB
- Slow — requires embedding a dummy query + ANN search on every window

### Current approach (O(1), no DB query)
Window fingerprints are stored in `extension_settings.vecthareplus.eventbase_extracted_windows[chatUUID]` as a flat string array. Using `extension_settings` (not `chat_metadata`) ensures they survive page reloads — `saveSettingsDebounced()` is called after each window so the cache is immediately persisted.

- **Fingerprint format:** sorted source hashes joined by comma, e.g. `"123,456,789"`
- **On extraction:** `markWindowExtracted(sourceHashes, uuid)` appends the fingerprint (called in `eventbase-workflow.js` after successful insert)
- **On dedup check:** `isWindowAlreadyExtracted(sourceHashes, ...)` does `array.includes(fingerprint)` — synchronous, instant
- **Why NOT chat_metadata:** `chat_metadata` is only saved to disk when ST saves the chat (e.g. when a message is generated). Stopping mid-vectorization and reloading Chrome would lose all fingerprints written during that run.

### Key files
- `core/eventbase-store.js` — `isWindowAlreadyExtracted`, `markWindowExtracted`, `EXTRACTED_WINDOWS_KEY`
- `core/eventbase-workflow.js` — calls `markWindowExtracted(sourceHashes)` after `insertEvents` succeeds

### Migration note
Windows extracted before this fix have no fingerprint in cache. First run after update will attempt to re-insert them — Qdrant silently overwrites same hash-keyed points (no duplicates). All future runs use the cache correctly.

---

## 7) GUI Settings — Tab Placement & EventBase Relevance

After the Phase 2 GUI reorg, settings are grouped by which path consumes them:

| Setting | UI tab | EventBase relevant? | What it actually does |
|---|---|---|---|
| **Insert Batch Size** (default 50) | ChunkBase → Ingestion | **No** | Controls chunks-per-API-call during chunk vectorization. EventBase inserts tiny batches (2–10 events per window) so this has no meaningful effect on EventBase. |
| **Dedup Depth** (default 50 messages) | Core | **Yes** | Used in `eventbase-retrieval.js` as `settings.deduplication_depth`. Filters out retrieved events whose source window falls within the last N messages of the current chat — avoids injecting content already visible in context. 0 = disabled. Also used by chunk-path retrieval in `chat-vectorization.js`. |
| **Hybrid Search & BM25 block** (Keyword Scoring Method, BM25 k1/b, Fusion Method, RRF K, Prefer Native Backend Hybrid) | Core → Hybrid Search & BM25 | **Partial** | `keyword_scoring_method` (A1 vs A2 path selector) does **not** affect EventBase — EventBase callers inject `ebSettings` with `keyword_scoring_method` overridden from `eventbase_keyword_scoring_method` (internal, defaults `'bm25'`, not in UI). All other BM25 params (k1, b, fusion method, RRF K) are still shared via `ebSettings` spread. See §13 for the full matrix. |
| **Query Keyword Budget** (`hybrid_keyword_level`) | ChunkBase → Keyword Budget | **No** | Read only by `scoreResults()` (A1) and `hybridSearch()` (A2) inside `queryCollection()`. EventBase's `ebSettings` forces `keyword_scoring_method='bm25'`, so it always takes A1 on Standard — but `hybrid_keyword_level` is still read in that A1 path. In practice the chunk re-ranker is its primary consumer; EventBase has its own importance/persist/recency re-ranker that dominates, so the effect is negligible. |

---

## 8) Similharity Plugin Speedup (Simultaneous Embedding Requests)
Plugin file changed: `../similharity/index.js`

What we changed:
- In `getVectorsForSource(...)`, API/network providers now run embedding calls in parallel using `Promise.all(...)`.
- Parallel provider set:
  - `openai`
  - `togetherai`
  - `mistral`
  - `electronhub`
  - `openrouter`
  - `nomicai`
  - `cohere`
- Local GPU providers remain sequential to avoid contention/queueing/OOM behavior:
  - `transformers`
  - `ollama`
  - `llamacpp`
  - `koboldcpp`

Why this speeds up:
- Before: one request embedding N items sequentially, total about N x T.
- After (API providers): N requests fired concurrently inside one batch, total about T (subject to upstream limits).

Related client-side behavior (VectHare):
- In `core/core-vector-api.js`, local GPU sources default to small batch behavior unless user explicitly overrides `insert_batch_size`.

---

## 9) Module Integration Analysis — EventBase Compatibility

Analysis of whether non-EventBase modules should be integrated into the EventBase pipeline.

### temporal-decay.js — NOT compatible

**Module:** [`core/temporal-decay.js`](core/temporal-decay.js)
**Decision:** ❌ Do not add to EventBase.

`applyDecayToResults` checks `chunk.metadata.source === 'chat'` and `chunk.metadata.messageId`. EventBase [`EventBase`](core/eventbase-schema.js) events do not carry `source: 'chat'` or a `messageId` field — they use `source_window_end`. Every event would be skipped with `decayApplied: false`.

Additionally, EventBase already has its own `_recencyBonus` — an exponential decay term computed from `source_window_end` and `chatLength` — baked into the 4-weight re-ranker formula in [`eventbase-store.js`](core/eventbase-store.js). Applying `temporal-decay.js` would be redundant and silently do nothing.

### hybrid-search.js — Used indirectly (do not wire directly)

**Module:** [`core/hybrid-search.js`](core/hybrid-search.js)
**Decision:** ✅ EventBase benefits from it — but through `queryCollection()`, not by direct call.

EventBase calls `queryEvents()` → `queryCollection()` (via an `ebSettings` shim that pins `keyword_scoring_method` to `eventbase_keyword_scoring_method || 'bm25'`). Inside `queryCollection()`, the A1/A2/A3 routing decides whether to invoke `clientSideHybridSearch()` (A2) or the backend's native hybrid (A3) from `hybrid-search.js`. On Standard backend, EventBase is always A1 unless `eventbase_keyword_scoring_method` is explicitly set to `'hybrid'`. On Qdrant with `hybrid_native_prefer=true`, A3 takes over regardless.

Do **not** call `hybridSearch()` directly from `eventbase-retrieval.js` or `eventbase-workflow.js`. It operates at the backend/collection layer — returns raw `{ hashes, metadata }` and bypasses `queryEvents()`, the store schema hydration, and EventBase-specific field population (`score`, `importance`, etc.).

### Summary table

| Module | Add directly to EventBase? | Reason |
|---|---|---|
| [`temporal-decay.js`](core/temporal-decay.js) | No | Already covered by `_recencyBonus` in the 4-weight formula; `applyDecayToResults` would silently skip all events due to missing `source: 'chat'` / `messageId` fields |
| [`hybrid-search.js`](core/hybrid-search.js) | No (used indirectly) | EventBase inherits A2/A3 hybrid automatically via `queryCollection()`. Direct calls would bypass `queryEvents()` and the store layer. |

---

## 10) EventBase Settings Impact Table

Three retrieval paths exist after the keyword-level simplification. All paths are chosen inside `queryCollection()` — EventBase inherits whichever applies to the active backend.

| Path | When | Loads all chunks? | Keyword scoring | Fusion |
|---|---|---|---|---|
| A1 — BM25 re-rank | Default for standard backend; or Qdrant with `hybrid_native_prefer=false` and `keyword_scoring_method=bm25` | No | Okapi BM25 over ANN top-K only | Weighted linear: `α·vectorScore + β·bm25Score` (no RRF, no dual-signal bonus) |
| A2 — client-side hybrid (ANN-bound) | `keyword_scoring_method=hybrid` (non-native) | No | Okapi BM25 over the ANN candidate set only — vector top-K × 3, capped at 100 (`hybrid-search.js` line 100) | **RRF** (default) or weighted; **min-max normalization** per batch; **dual-signal bonus** (up to +8% for docs matching both signals); single-signal penalty (×0.55 vector-only, ×0.60 text-only) |
| A3 — server-side hybrid | Qdrant with `hybrid_native_prefer=true` (default) | No | Okapi BM25 (k1/b configurable) over the full corpus of keyword-matching candidates via Qdrant scroll (no candidate cap; scroll continues until exhausted; IDF, avgdl, and N computed over every doc matching ≥1 query keyword) | **RRF** (default) or weighted; **saturation normalization** (`score/(score+3.0)`); **dual-signal bonus** (up to +8% for docs matching both signals); single-signal penalty (×0.55 vector-only, ×0.60 keyword-only) |

**Fusion method detail:**

| Feature | A1 | A2 | A3 |
|---|---|---|---|
| RRF | ✗ | ✓ | ✓ |
| Weighted linear | ✓ (always) | ✓ (opt-in) | ✓ (opt-in) |
| Min-max normalization (batch-relative) | ✗ | ✓ | ✗ |
| Saturation normalization `score/(score+k)` | ✗ | ✓ (BM25 side) | ✓ (BM25 side, k=3.0) |
| Dual-signal bonus (explicit ×1.0–1.08) | ✗ | ✓ | ✓ |
| Single-signal penalty | ✗ | ✓ | ✓ (×0.55 vector-only, ×0.60 keyword-only) |
| BM25 corpus scope | ANN top-K (≤100, `topK*2`) | ANN top-K × 3 (≤100) | All keyword-matching candidates (full corpus, no cap) |
| BM25 IDF accuracy | Biased (ANN subset) | Biased (ANN subset, same scope as A1) | Full set of docs matching ≥1 query keyword (broader than A1/A2; narrower than true full-corpus only because non-matching docs are excluded by definition) |

| Setting | Affects EventBase? | Notes |
|---|---|---|
| `keyword_scoring_method` (`bm25` \| `hybrid`) | **No** | ChunkBase path only. EventBase callers override this to `eventbase_keyword_scoring_method \|\| 'bm25'` before passing settings to `queryCollection()`, so the ChunkBase setting never reaches EventBase queries. |
| `eventbase_keyword_scoring_method` | **Yes** | EventBase-only internal key. Defaults to `'bm25'`; not exposed in UI. Override in browser console if needed. `bm25` = A1 fast re-rank; `hybrid` = A2 (but A3 still takes precedence when `hybrid_native_prefer=true`). |
| `hybrid_keyword_level` (`minimal` / `balance` / `maximum`) | Negligible | Controls keywords extracted for BM25 (30/50/70). EventBase is pinned to A1 on Standard — `scoreResults()` reads this — but EventBase's own 4-weight re-ranker dominates final ordering so the effect is minimal. Ignored under A3. |
| `hybrid_native_prefer` | Yes | `true` (default for Qdrant) → A3 server-side path. `false` → falls back to A1/A2 by `keyword_scoring_method`. |
| `hybrid_fusion_method` (`rrf` / `weighted`) | Yes (A2 and A3) | Fusion strategy. Both A2 and A3 apply explicit dual-signal bonus and single-signal penalty after the raw fusion score. A2 uses min-max normalization; A3 uses saturation normalization on the BM25 side. Not used in A1. |
| `hybrid_vector_weight`, `hybrid_text_weight` | Yes (A2/A3 weighted mode) | Used only when `hybrid_fusion_method = weighted`. |
| `hybrid_rrf_k` | Yes (A2/A3 RRF mode) | RRF constant k (default 60). Higher k flattens rank differences; lower k amplifies top-rank advantage. Used only when `hybrid_fusion_method = rrf`. |
| `bm25_k1`, `bm25_b` | Yes (A1 and A2) | BM25 TF saturation (k1, default 1.5) and length normalization (b, default 0.75) for A1 and A2. A3 also accepts these via `options.bm25k1` / `options.bm25b` passed through `hybridQuery`. |
| `keyword_extraction_level`, `keyword_boost_base_weight` | No | Ingestion-only settings. No longer used in any retrieval path. |
| `hybrid_search_enabled` | Removed | Setting deleted. Hybrid is now always available; path chosen by `keyword_scoring_method` + `hybrid_native_prefer`. |
| `deduplication_depth` | Yes | EventBase context deduplication — suppress events already visible in recent chat window. |
| `eventbase_retrieval_top_k`, `eventbase_retrieval_min_importance`, EventBase rerank weights | Yes | Active for all three retrieval paths. |

---

## 11) Mirrored Function — `extractQueryKeywords`

| Item | Value |
|---|---|
| Origin | `similharity/index.js` lines 54–146 |
| VectHare copy | `core/query-keyword-extractor.js` |
| Exports | `extractQueryKeywords(text, maxKeywords)`, `isCJKToken(token)`, `RETRIEVAL_KEYWORD_LEVELS`, `DEFAULT_RETRIEVAL_KEYWORD_LEVEL` |
| Stop-word source | Imports `DEFAULT_STOP_WORD_SET` from `./stop-words.js` (full multi-language list, English + CJK; mirrored from `similharity/stop-words.js`) |

**Keep-in-sync note:** if the extraction algorithm changes in `similharity/index.js` (e.g. anchor budget, bigram fallback, Latin regex), update `core/query-keyword-extractor.js` to match. The console log prefix was changed from `[Qdrant]` to `[VectHare]` — that difference is intentional.


## Scene summary field — intentionally kept

The `summary` field on scene chunks is a **user-editable search hint** (not AI-generated). It is unrelated to the EventBase `summary` that was removed.

`ui/chunk-visualizer.js` line ~642 reads `meta.summary || ''` — correct, no change needed.

**Storage split for scene chunks:**
- Scene metadata (title, summary, keywords, sceneStart/End, containedHashes) → **vector DB payload** (read back via `scene.metadata`)
- Operational flags (disabledByScene, temporallyBlind) → **extension settings** via `saveChunkMetadata` (fast access without DB query)
- User edits to title/summary/keywords → extension settings via `updateSceneChunkMetadata` (overrides vector DB value in the merge)

Read path in `renderSceneDetailPanel`: `{ ...scene.metadata, ...getChunkMetadata(hash) }` — vector DB base, extension settings overlay.

`similharity/qdrant-backend.js` explicitly stores `summary: item.metadata?.summary ?? null` in the Qdrant payload. EventBase items have no `summary` in metadata (dropped in `eventbase-store.js`), so they get `null`. Scene chunks carry it correctly.

---

## 12) javascript to get these variables in chrome console
const ctx = SillyTavern.getContext();
const chatUUID = ctx.chatMetadata?.integrity || ctx.chatId;
const handleId = (ctx.name1 || 'user').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '').substring(0, 30) || 'user';
const charName = (ctx.name2 || 'chat').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '').substring(0, 30) || 'chat';
console.log({ chatUUID, handleId, charName });

// Check current chat's integrity and which EventBase collection it WOULD map to
(() => {
  const md = SillyTavern.getContext().chatMetadata;
  return {
    integrity: md?.integrity || '(missing — using chatId fallback)',
    chatFile: SillyTavern.getContext().chatId,
  };
})()

---

## 13) Hybrid Search & BM25 — GUI Placement Matrix (Phase 2)

Content type determines path; path determines which setting key controls A1/A2 routing:

- **ChunkBase** owns non-chat content only: Lorebook / World Info, Character Cards, URLs / web pages, custom documents, wiki pages, YouTube transcripts. Uses `keyword_scoring_method`.
- **EventBase** owns chat content only: Current Chat history and uploaded Archive Chat history (`.jsonl`). Uses `eventbase_keyword_scoring_method` (internal, not in UI, defaults `'bm25'`).

Both paths call `queryCollection()` but EventBase callers (`eventbase-retrieval.js`, `eventbase-workflow.js`, `eventbase-store.js`) always inject an `ebSettings` shim:
```js
const ebSettings = { ...settings, keyword_scoring_method: settings.eventbase_keyword_scoring_method || 'bm25' };
```
This ensures ChunkBase's `keyword_scoring_method` never leaks into EventBase queries.

### Settings × routing case

| Setting | Storage key | Applies to | **A1** — Standard + BM25 | **A2** — Standard + Hybrid | **A3** — Qdrant native |
|---|---|---|---|---|---|
| Keyword Scoring Method | `keyword_scoring_method` | **ChunkBase only** | ✅ selects A1 path | ✅ selects A2 path | ❌ ignored (server decides) |
| EventBase Scoring Method | `eventbase_keyword_scoring_method` | **EventBase only** | ✅ selects A1 path | ✅ selects A2 path | ❌ ignored (A3 takes precedence) |
| BM25 k1 | `bm25_k1` | Both | ✅ used | ✅ used | ❌ server-internal |
| BM25 b | `bm25_b` | Both | ✅ used | ✅ used | ❌ server-internal |
| Query Keyword Budget | `hybrid_keyword_level` | ChunkBase (dominant); EventBase negligible | ✅ used | ❌ not used | ❌ not used |
| Fusion Method (RRF / Weighted) | `hybrid_fusion_method` | Both | ❌ not used | ✅ used | ✅ passed to server |
| RRF K | `hybrid_rrf_k` | Both | ❌ not used | ✅ used | ✅ passed to server |
| Prefer Native Backend Hybrid | `hybrid_native_prefer` | Both | n/a | n/a | toggles A3 vs falls back to A1/A2 |

### Key observations

1. **Path routing is now content-type-scoped.** ChunkBase's `keyword_scoring_method` no longer affects EventBase. Changing to "Hybrid" in ChunkBase tab will not switch lorebook queries AND event queries to A2 — only lorebook queries switch.
2. **`eventbase_keyword_scoring_method` is internal.** It defaults to `'bm25'` and is not exposed in the GUI. There is no need for a dropdown in the EventBase tab — the routing is determined by content type (chat vs non-chat), not a user choice.
3. **BM25 tuning params (k1, b, fusion, RRF K) remain shared** via the `ebSettings` spread. Only the path-selector key (`keyword_scoring_method`) is isolated.
4. **`hybrid_keyword_level` is the only ChunkBase-tab setting.** EventBase is pinned to A1 on Standard — `scoreResults()` reads `hybrid_keyword_level` — but EventBase's own 4-weight re-ranker dominates final ordering so the practical effect is negligible.

### GUI hide/show rules (consequence of the above)

| Mode | Visible in Core | Visible in ChunkBase |
|---|---|---|
| **Qdrant native** (A3, `hybrid_native_prefer=true`) | Prefer Native toggle, Native-active notice, Fusion Method, RRF K | *(no hybrid controls)* |
| **Standard + BM25** (A1) | Keyword Scoring Method, BM25 k1, BM25 b | Query Keyword Budget |
| **Standard + Hybrid** (A2) | Keyword Scoring Method, BM25 k1, BM25 b, Fusion Method, RRF K | *(no hybrid controls)* |

Notes:
- `Prefer Native Backend Hybrid` is rendered only when `vector_backend === 'qdrant'`.
- When toggled off on Qdrant, the UI falls back to A2 visibility (Standard + Hybrid), but the routing layer still talks to Qdrant as the backend.
- Visibility is driven by the helper [`updateNativeHybridUI()` at ui-manager.js:~2097](ui/ui-manager.js#L2097), which fires on changes to `vector_backend`, `keyword_scoring_method`, and `hybrid_native_prefer`. The cross-tab toggle of `#vecthare_hybrid_keyword_budget_wrapper` (in ChunkBase) works because the helper is global, not tab-scoped.

### Cross-reference

- Implementation plan: [plans/GUI_reorganize.md](plans/GUI_reorganize.md) §13–§22 (Phase 2).
- Routing code: `queryCollection()` at [core-vector-api.js:834](core/core-vector-api.js#L834).
- EventBase invocation: `queryEvents()` at [eventbase-store.js:139](core/eventbase-store.js#L139) and direct `queryCollection` calls in [eventbase-retrieval.js:139](core/eventbase-retrieval.js#L139), [eventbase-workflow.js:413](core/eventbase-workflow.js#L413).
