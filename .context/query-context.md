# SigMap Query Context
Generated: 2026-05-23T23:14:28.604Z

## core\collection-export.js
```
export async function exportCollection(collectionId, settings, collectionInfo = {}) → Promise<object>
export async function exportMultipleCollections(collectionIds, settings) → Promise<object>
export function downloadExport(exportData, filename = null)
export function validateImportData(data, currentSettings = {}) → { valid: boolean, errors:
export async function importCollection(exportData, settings, options = {}) → Promise<{ success: boolea
export async function importMultipleCollections(multiExportData, settings, options = {}) → Promise<{ success: boolea
export async function readImportFile(file) → Promise<object>
export function getExportInfo(data) → object
function _inferScope(storedScope, collectionId)
async function fetchChunksWithVectors(collectionId, settings) → Promise<Array>
async function insertChunksWithVectors(collectionId, chunks, settings, onBatchProgress, abortSignal = null)
async function importCollectionSilent(exportData, settings, options = {})
function detectContentType(collectionId) → string
```

## core\collection-metadata.js
```
export function getCollectionMeta(collectionId) → object
export function setCollectionMeta(collectionId, data)
export function deleteCollectionMeta(collectionId)
export function getAllCollectionMeta() → object
export function setCollectionEnabled(collectionId, enabled)
export function isCollectionEnabled(collectionId) → boolean
export function setCollectionAutoSync(collectionId, autoSync)
export function isCollectionAutoSyncEnabled(collectionId) → boolean
export function getChunkMetadata(hash) → object|null
export function saveChunkMetadata(hash, metadata)
export function deleteChunkMetadata(hash)
export function getAllChunkMetadata() → object
export function migrateOldEnabledKeys()
export function cleanupOrphanedMeta(actualCollectionIds) → object
export function getChatLockedCollections(chatId) → string[]
export function setCollectionLock(collectionId, chatId)
export function removeCollectionLock(collectionId, chatId)
export function clearCollectionLock(collectionId)
export function getCollectionLocks(collectionId) → string[]
export function getCollectionLock(collectionId) → string|null
```

## core\core-vector-api.js
```
class DynamicRateLimiter
constructor()
async execute(fn, settings) → Promise<any>
if(maxCalls <= 0)
if(this.timestamps.length >= maxCalls)
if(waitTime > 0)
export function getVectorsRequestBody(args = {}, settings) → object
export async function getAdditionalArgs(items, settings, onProgress = null) → Promise<object>
export function throwIfSourceInvalid(settings)
export async function getSavedHashes(collectionId, settings, includeMetadata = false) → Promise<number[]|{hashes:
export async function insertVectorItems(collectionId, items, settings, onProgress = null, abortSignal = null) → Promise<void>
export async function deleteVectorItems(collectionId, hashes, settings) → Promise<void>
export async function queryCollection(collectionId, searchText, topK, settings, filters = {}) → Promise<{ hashes: number[
export async function queryMultipleCollections(collectionIds, searchText, topK, threshold, settings) → Promise<Record<string, {
export async function queryActiveCollections(collectionIds, searchText, topK, threshold, settings, context) → Promise<Record<string, {
export async function purgeVectorIndex(collectionId, settings) → Promise<boolean>
export async function purgeFileVectorIndex(collectionId, settings) → Promise<void>
export async function purgeAllVectorIndexes(settings) → Promise<void>
export async function listChunks(collectionId, settings, options = {}) → Promise<{items: Array<{ha
export async function updateChunkText(collectionId, hash, newText, settings)
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

## ui\chunk-visualizer.js
```
export function openVisualizer(results, collectionId, settings, onReload = null)
export function closeVisualizer()
export function initializeVisualizer()
function getCollectionIcon()
function isEventBaseCollection()
function normalizeKeywords(keywords)
function getChunkData(chunk)
function updateChunkData(hash, updates)
async function saveAllChanges()
function discardAllChanges()
async function _loadAndRenderCollectionMetaFooter(collectionId, settings)
function applyFilters()
function createModal()
function renderChunkList()
function renderChunkItem(chunk, listIndex)
function updateStatusBar()
function renderDetailPanel()
function formatConditionRule(rule)
function bindEvents()
function bindDetailEvents()
```
