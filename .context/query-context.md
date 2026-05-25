# SigMap Query Context
Generated: 2026-05-25T16:03:57.500Z

## core\hybrid-search.js
```
export async function hybridSearch(collectionId, searchText, topK, settings, options = {}) → Promise<{hashes: number[]
export function reciprocalRankFusion(resultLists, k = DEFAULT_RRF_K) → Array
export function weightedCombination(vectorResults, textResults, alpha = 0.5, beta = 0.5) → Array
function resolveCollectionBackend(collectionId)
async function clientSideHybridSearch(backend, collectionId, searchText, topK, settings, options) → Promise<{hashes: number[]
function normalizeScores(results, scoreField = 'score') → Array
function performBM25Search(results, query, options = {}) → Array
function vectorResultsToRanked(vectorResults)
function vectorResultsToScored(vectorResults)
```

## core\tokenizer-lock.js
```
export async function fetchCollectionMetadata(actualCollectionId) → Promise<object|null>
export function invalidateCollectionMetadata(actualCollectionId)
export async function detectTokenizerMismatch(settings, actualCollectionId) → Promise<{saved: string, c
export async function showTokenizerMismatchModal(mismatch, actualCollectionId) → Promise<'revert'|'setting
export async function applyTokenizerRevert(savedMode, settings)
export async function openCjkTokenizerSetting()
async function getRequestHeadersImport()
function escapeHtml(s)
async function waitForPopupsClosed(maxWaitMs = 1500)
```

## ui\database-browser.js
```
export function initializeDatabaseBrowser(settings)
export async function openDatabaseBrowser()
export function closeDatabaseBrowser()
export function renderCollections()
function updatePluginWarningBanner()
function resetEventFlags()
function createBrowserModal()
function bindBrowserEvents()
function switchTab(tabName)
function _extractHandleFromCollectionId(collectionId)
function _filterCollectionsByCurrentPersona(collections) → string
async function refreshCollections(withScan = false)
function renderCollectionCard(collection, isActiveById = null) → string
function findCollectionByKey(key)
async function performPngExport(imageFile)
function formatBytes(bytes) → string
function escapeHtml(text) → string
async function openChunkVisualizer(collection)
function bindCollectionCardEvents()
function updateStats(collectionCount, chunkCount)
```

## core\eventbase-retrieval.js
```
export async function retrieveEvents({ searchText, keywordQuery, chatLength, settings, liveCollectionIds, additionalCandidates, skipLiveQuery, skipContextDedup = false }) → Promise<{ events: object[
function _characterOverlap(a, b) → number
function _recencyBonus(event, chatLength) → number
function _normalizeWeights(w) → object
function _resolveAnchorBoostAmount(settings)
function _anchorBoostFor(meta, anchorText, anchorAmount)
function _jsFinalScore(meta, weights, chatLength, anchorText, anchorAmount)
async function _runOneLiveQuery({ colId, queryText, topK, ebSettings, settings, useNativeRerank, rerankParams, compareMode, comparisonLog, chatLength, anchorText, anchorBoostAmount, rerankWeights, }) → Promise<Array<object>>
function _logRerankComparison(colId, queryText, native, js, nativeMs, jsMs, settings, comparisonLog)
```

## core\eventbase-extractor.js
```
export async function extractEvents({ messages, windowStart, windowEnd, settings, windowIndex = 0 }) → Promise<object[]>
function _getOpenRouterApiKey(settings) → string
function _buildBody(prompt, model, maxTokens, temperature) → object
function _extractReply(data) → string|null
function _parseJsonArray(raw, debugLog = false, windowIndex = -1, msgRange = '') → unknown[]
function _detectScript(text) → 'cjk'|'latin'|'mixed'|'em
function _inferLanguageHint(text)
async function _callOpenRouter(prompt, settings, windowIndex)
async function _callVLLM(prompt, settings, windowIndex)
function _simpleHash(str) → number
```
