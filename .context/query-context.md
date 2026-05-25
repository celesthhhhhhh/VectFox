# SigMap Query Context
Generated: 2026-05-25T20:37:11.254Z

## core\eventbase-store.js
```
export async function insertEvents(events, settings, abortSignal = null, collectionIdOverride = null) → Promise<void>
export async function queryEvents(searchText, topK, settings, chatUUID) → Promise<object[]>
export async function listEvents(settings, limit = 100, chatUUID) → Promise<object[]>
export async function deleteEventByHash(hash, settings, chatUUID) → Promise<void>
export function getAutoSyncMarker(chatUUID) → Promise<boolean>
export function clearAutoSyncMarker(chatUUID)
export async function stampAutoSyncMarker(chatUUID, settings) → Promise<number>
export function getLastUsedWindowSize(chatUUID) → number|undefined
export function setLastUsedWindowSize(chatUUID, windowSize)
export function windowFingerprint(sourceHashes) → string
export function markWindowExtracted(sourceHashes, chatUUID)
export function clearWindowCacheForChat(chatUUID)
export function isLastWindowExtracted(messages, windowSize, step, chatUUID, hashFn) → boolean
export async function isWindowAlreadyExtracted(sourceHashes, messageIds, settings, chatUUID) → Promise<boolean>
export function findEventBaseCollectionIdsForChat(uuid, preferredBackend) → { registryKey: string, co
export async function ensureEventBaseIndexes(settings) → Promise<void>
async function _resolveEventBaseCollectionIdForRead(settings, chatUUID) → Promise<string|null>
function _eventHash(id) → number
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

## core\providers.js
```
export function getValidProviderIds()
export function isValidProvider(providerId)
export function getProviderConfig(providerId)
export function getModelField(providerId)
export function getModelFromSettings(settings, fallback = '') → string
export function getSecretKey(providerId)
export function requiresApiKey(providerId)
export function requiresUrl(providerId)
export function getCloudProviders()
export function getUrlProviders()
```

## core\content-vectorization.js
```
export function resolveEffectiveSettings(callerSettings) → object
export async function vectorizeContent({ contentType, source, settings, abortSignal = null, continueMode = false, startFromMessage = 1 }) → Promise<{success: boolean
export async function resolveAndPrepareContent(contentType, source, settings) → Promise<{text: string, ..
export async function deleteContentCollection(collectionId, callerSettings = null)
async function resolveSource(contentType, source)
async function loadSelectedSource(contentType, sourceId)
async function loadLorebookContent(lorebookName, context)
async function loadCharacterContent(characterId, context)
async function prepareContent(contentType, rawContent, settings, startFromMessage = 1)
function prepareCharacterContent(rawContent, settings)
function prepareChatContent(rawContent, settings, startFromMessage = 1)
function prepareUrlContent(rawContent, settings)
function prepareDocumentContent(rawContent, settings)
function prepareWikiContent(rawContent, settings)
function prepareYouTubeContent(rawContent, settings)
function generateCollectionId(contentType, source, settings)
function enrichChunks(chunks, contentType, source, settings, preparedContent, VectFoxSettings)
```

## core\agentic-retrieval.js
```
export async function retrieveEventsWithAgent(params) → Promise<{events: object[]
export function _resolveAgenticLLMConfig(settings = {})
export function _validatePlannerFilters(raw, settings)
async function _callPlanner({ systemPrompt, userMessage, llmCfg, timeoutMs })
function _getRecentChatForPlanner(settings)
function _firstNWords(text, n)
function _validateAndTrimQueries(queries, maxQueries)
```
