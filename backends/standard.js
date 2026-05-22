/**
 * ============================================================================
 * STANDARD BACKEND (Vectra - ST Native)
 * ============================================================================
 * Uses ST's native /api/vector/* endpoints exclusively.
 *
 * This is the default backend - no setup required.
 *
 * @author VectFox
 * @version 3.1.0
 * ============================================================================
 */

import { getRequestHeaders } from '../../../../../script.js';
import { VectorBackend } from './backend-interface.js';
import { getModelFromSettings } from '../core/providers.js';
import { VECTOR_LIST_LIMIT } from '../core/constants.js';
import { INTERNAL_COLLECTION_IDS } from '../core/collection-ids.js';
import { extension_settings } from '../../../../extensions.js';
import { textgen_types, textgenerationwebui_settings } from '../../../../textgen-settings.js';
import { oai_settings } from '../../../../openai.js';
import { secret_state } from '../../../../secrets.js';


/**
 * Build provider-specific parameters for API requests.
 * @param {object} settings - VectFox settings
 * @param {boolean} isQuery - Whether this is a query operation
 * @returns {object} Provider-specific parameters
 */
function getProviderSpecificParams(settings, isQuery = false) {
    const params = {};
    const source = settings.source;

    switch (source) {
        case 'extras':
            params.extrasUrl = extension_settings.apiUrl;
            params.extrasKey = extension_settings.apiKey;
            break;

        case 'cohere':
            params.input_type = isQuery ? 'search_query' : 'search_document';
            break;

        case 'ollama':
            params.apiUrl = settings.use_alt_endpoint
                ? settings.alt_endpoint_url
                : textgenerationwebui_settings.server_urls[textgen_types.OLLAMA];
            params.keep = !!settings.ollama_keep;
            break;

        case 'llamacpp':
            params.apiUrl = settings.use_alt_endpoint
                ? settings.alt_endpoint_url
                : textgenerationwebui_settings.server_urls[textgen_types.LLAMACPP];
            console.log(`VectFox DEBUG llamacpp: use_alt_endpoint=${settings.use_alt_endpoint}, alt_endpoint_url="${settings.alt_endpoint_url}", ST_url="${textgenerationwebui_settings.server_urls[textgen_types.LLAMACPP]}", final apiUrl="${params.apiUrl}"`);
            break;

        case 'vllm':
            params.apiUrl = settings.use_alt_endpoint
                ? settings.alt_endpoint_url
                : textgenerationwebui_settings.server_urls[textgen_types.VLLM];
            if (settings.vllm_api_key) params.apiKey = settings.vllm_api_key;
            break;

        case 'bananabread':
            params.apiUrl = settings.use_alt_endpoint
                ? settings.alt_endpoint_url
                : 'http://localhost:8008';
            if (secret_state['bananabread_api_key']) {
                const secrets = secret_state['bananabread_api_key'];
                const activeSecret = Array.isArray(secrets) ? (secrets.find(s => s.active) || secrets[0]) : null;
                if (activeSecret) {
                    params.apiKey = activeSecret.value;
                }
            }
            break;

        case 'palm':
            params.api = 'makersuite';
            break;

        case 'vertexai':
            params.api = 'vertexai';
            params.vertexai_auth_mode = oai_settings.vertexai_auth_mode;
            params.vertexai_region = oai_settings.vertexai_region;
            params.vertexai_express_project_id = oai_settings.vertexai_express_project_id;
            break;

        default:
            break;
    }

    return params;
}

export class StandardBackend extends VectorBackend {
    constructor() {
        super();
    }

    async initialize(settings) {
        console.log('VectFox: Standard backend initialized (native ST API)');
    }

    async healthCheck() {
        // Native ST API is always available if ST is running
        try {
            // Quick test: try to list a non-existent collection (should return empty array or error)
            const response = await fetch('/api/vector/list', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({
                    collectionId: INTERNAL_COLLECTION_IDS[0],
                    source: 'transformers'
                }),
            });
            // 200 = works (empty collection), 500 = syntax error (no collection), both are "working"
            return response.status === 200 || response.status === 500;
        } catch (error) {
            console.error('[Standard] Health check failed:', error);
            return false;
        }
    }

    /**
     * Get saved hashes for a collection
     * Uses native ST API
     */
    async getSavedHashes(collectionId, settings) {
        const providerParams = getProviderSpecificParams(settings, false);
        const model = getModelFromSettings(settings);

        const response = await fetch('/api/vector/list', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                collectionId: collectionId,
                source: settings.source || 'transformers',
                model: model,
                ...providerParams,
            }),
        });

        if (!response.ok) {
            // Collection doesn't exist or error
            if (response.status === 500) {
                // Likely collection doesn't exist
                return [];
            }
            const errorBody = await response.text().catch(() => 'No response body');
            throw new Error(`Failed to get saved hashes: ${response.status} ${response.statusText} - ${errorBody}`);
        }

        const data = await response.json();
        // Native API returns array of hashes directly
        return Array.isArray(data) ? data : [];
    }

    /**
     * Insert vector items into a collection
     * Uses native ST API
     */
    async insertVectorItems(collectionId, items, settings, abortSignal = null) {
        if (items.length === 0) return;

        const providerParams = getProviderSpecificParams(settings, false);
        const model = getModelFromSettings(settings);

        // Log chunk statistics for debugging OOM issues
        const textLengths = items.map(item => (item.text || '').length);
        const maxLen = Math.max(...textLengths);
        const avgLen = Math.round(textLengths.reduce((a, b) => a + b, 0) / textLengths.length);
        const longestChunkIndex = textLengths.indexOf(maxLen);

        // Count how many chunks have keywords
        const chunksWithKeywords = items.filter(item => item.keywords && item.keywords.length > 0).length;

        console.log(`VectFox: Embedding ${items.length} chunks (avg: ${avgLen} chars, max: ${maxLen} chars at index ${longestChunkIndex}) - ${chunksWithKeywords} chunks have keywords`);

        // Debug: Log first chunk's keywords if any
        if (chunksWithKeywords > 0) {
            const firstChunkWithKeywords = items.find(item => item.keywords && item.keywords.length > 0);
            console.log(`VectFox DEBUG: First chunk keywords:`, firstChunkWithKeywords.keywords);
        }

        // Warn if chunks are unusually large (potential OOM risk)
        if (maxLen > 2000) {
            console.warn(`VectFox: Large chunk detected (${maxLen} chars). If you see OOM errors, try reducing chunk size.`);
            console.warn(`VectFox: Problematic chunk preview: "${(items[longestChunkIndex]?.text || '').substring(0, 100)}..."`);
        }

        try {
            const payload = {
                collectionId: collectionId,
                items: items.map(item => ({
                    hash: item.hash,
                    text: item.text || '',
                    index: item.index ?? 0,
                })),
                source: settings.source || 'transformers',
                model: model,
                // Pass embeddings if pre-computed (for webllm, koboldcpp, bananabread)
                embeddings: items[0]?.vector ? Object.fromEntries(items.map(i => [
                    i.text || '',
                    i.vector
                ])) : undefined,
                ...providerParams,
            };

            // DEBUG: capture body size and per-field breakdown so we can pin
            // down where a runaway-large insert body is coming from.
            const bodyJson = JSON.stringify(payload);
            const sizeKB = (bodyJson.length / 1024).toFixed(1);
            const sizeMB = (bodyJson.length / (1024 * 1024)).toFixed(2);
            const firstItem = payload.items?.[0];
            const fieldSizes = firstItem
                ? Object.fromEntries(
                    Object.entries(firstItem).map(([k, v]) => [
                        k,
                        JSON.stringify(v ?? null).length,
                    ])
                )
                : {};
            const metadataFieldSizes = firstItem?.metadata
                ? Object.fromEntries(
                    Object.entries(firstItem.metadata).map(([k, v]) => [
                        k,
                        JSON.stringify(v ?? null).length,
                    ])
                )
                : {};
            console.log(
                `VectFox DEBUG: insert body = ${sizeKB} KB (${sizeMB} MB), ` +
                `source="${payload.source}", model="${payload.model}", ` +
                `backend="${payload.backend}", ` +
                `items=${payload.items?.length || 0}, ` +
                `first item field sizes:`, fieldSizes,
                `metadata field sizes:`, metadataFieldSizes
            );
            if (bodyJson.length > 500 * 1024) {
                console.warn(`VectFox DEBUG: ⚠️ insert body exceeds 500 KB — dumping first 1000 chars: ${bodyJson.slice(0, 1000)}`);
            }

            const response = await fetch('/api/vector/insert', {
                method: 'POST',
                headers: getRequestHeaders(),
                signal: abortSignal
                    ? AbortSignal.any([abortSignal, AbortSignal.timeout(120000)])
                    : AbortSignal.timeout(120000),
                body: bodyJson,
            });

            if (!response.ok) {
                const errorBody = await response.text().catch(() => 'No response body');
                throw new Error(`Failed to insert vectors: ${response.status} - ${errorBody} (sent body size: ${sizeKB} KB)`);
            }

            console.log(`VectFox Standard: Inserted ${items.length} vectors into ${collectionId}`);
        } catch (error) {
            // Enhanced error logging for OOM debugging
            const isOOM = error.message?.includes('OrtRun') || error.message?.includes('error code = 6');
            if (isOOM) {
                console.error(`VectFox: ONNX OOM Error while embedding. Diagnostics:`);
                console.error(`  - Provider: ${settings.source}`);
                console.error(`  - Model: ${model || '(default)'}`);
                console.error(`  - Batch size: ${items.length} chunks`);
                console.error(`  - Largest chunk: ${maxLen} chars (index ${longestChunkIndex})`);
                console.error(`  - Average chunk: ${avgLen} chars`);
                console.error(`  - Tip: Try reducing chunk size in settings, or use a smaller embedding model`);
            }
            throw error;
        }
    }

    /**
     * Delete vector items from a collection
     * Uses native ST API
     */
    async deleteVectorItems(collectionId, hashes, settings) {
        const model = getModelFromSettings(settings);
        const source = settings.source || 'transformers';

        // Strip backend prefix from registry keys (same as queryCollection)
        const knownBackends = ['standard', 'vectra', 'qdrant'];
        const parts = collectionId.split(':');
        let bareCollectionId = collectionId;
        if (parts.length >= 2 && knownBackends.includes(parts[0])) {
            bareCollectionId = parts.slice(1).join(':');
        }

        // Storage path is vectors/{source}/{collectionId}/{model}/. ST's native
        // /api/vector/delete honors `model` when it's in the body — mirror the
        // insertVectorItems/getSavedHashes payload shape so delete lands in the
        // same partition the insert wrote to.
        const providerParams = getProviderSpecificParams(settings, false);
        const response = await fetch('/api/vector/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                collectionId: bareCollectionId,
                hashes: hashes,
                source,
                model,
                ...providerParams,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text().catch(() => 'No response body');
            throw new Error(`Failed to delete vectors: ${response.status} ${response.statusText} - ${errorBody}`);
        }
    }

    /**
     * Query a collection for similar vectors
     * Uses native ST API
     */
    async queryCollection(collectionId, searchText, topK, settings, queryVector = null) {
        const model = getModelFromSettings(settings);
        const source = settings.source || 'transformers';
        const threshold = settings.score_threshold || 0.0;

        // Registry keys arrive as "backend:collectionId". Strip the backend prefix
        // to get the bare collection ID.
        const knownBackends = ['standard', 'vectra', 'qdrant'];
        const parts = collectionId.split(':');
        let bareCollectionId = collectionId;
        if (parts.length >= 2 && knownBackends.includes(parts[0])) {
            bareCollectionId = parts.slice(1).join(':');
        }

        const providerParams = getProviderSpecificParams(settings, true);
        const requestBody = {
            collectionId: bareCollectionId,
            searchText,
            topK,
            threshold,
            source,
            model,
            ...providerParams,
        };

        if (queryVector) {
            requestBody.embeddings = { [searchText]: queryVector };
        }

        const response = await fetch('/api/vector/query', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorBody = await response.text().catch(() => 'No response body');
            throw new Error(`Failed to query collection: ${response.status} ${response.statusText} - ${errorBody}`);
        }

        const data = await response.json();

        // Native API returns { hashes: [], metadata: [] }
        return {
            hashes: data.hashes || [],
            metadata: (data.metadata || []).map((m, idx) => ({
                hash: data.hashes?.[idx],
                text: m.text,
                score: m.score || 0,
                ...m,
            })),
        };
    }

    /**
     * Query multiple collections
     * Uses native ST API
     */
    async queryMultipleCollections(collectionIds, searchText, topK, threshold, settings, queryVector = null) {
        const providerParams = getProviderSpecificParams(settings, true);
        const model = getModelFromSettings(settings);

        const requestBody = {
            collectionIds: collectionIds,
            searchText: searchText,
            topK: topK,
            threshold: threshold,
            source: settings.source || 'transformers',
            model: model,
            ...providerParams,
        };

        if (queryVector) {
            requestBody.embeddings = { [searchText]: queryVector };
        }

        const response = await fetch('/api/vector/query-multi', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            // Fallback: query each collection individually
            console.warn('VectFox: query-multi failed, falling back to individual queries');
            const results = {};
            const errors = [];
            for (const collectionId of collectionIds) {
                try {
                    results[collectionId] = await this.queryCollection(collectionId, searchText, topK, settings, queryVector);
                } catch (e) {
                    console.error(`VectFox: Query failed for collection ${collectionId}:`, e.message);
                    errors.push(`${collectionId}: ${e.message}`);
                    results[collectionId] = { hashes: [], metadata: [], error: e.message };
                }
            }
            if (errors.length > 0) {
                console.error(`VectFox: ${errors.length} collection(s) failed to query:`, errors);
            }
            return results;
        }

        return await response.json();
    }

    /**
     * Purge (delete) a collection
     * Uses native ST API
     */
    async purgeVectorIndex(collectionId, settings) {
        const source = settings.source || 'transformers';
        const model = getModelFromSettings(settings);

        const knownBackends = ['standard', 'vectra', 'qdrant'];
        const parts = collectionId.split(':');
        let bareCollectionId = collectionId;
        if (parts.length >= 2 && knownBackends.includes(parts[0])) {
            bareCollectionId = parts.slice(1).join(':');
        }

        const response = await fetch('/api/vector/purge', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                collectionId: bareCollectionId,
                source,
                model,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text().catch(() => 'No response body');
            throw new Error(`Failed to purge collection: ${response.status} ${response.statusText} - ${errorBody}`);
        }
    }

    async purgeFileVectorIndex(collectionId, settings) {
        return this.purgeVectorIndex(collectionId, settings);
    }

    /**
     * Purge all vector indexes
     * Uses native ST API
     */
    async purgeAllVectorIndexes(settings) {
        const response = await fetch('/api/vector/purge-all', {
            method: 'POST',
            headers: getRequestHeaders(),
        });

        if (!response.ok) {
            const errorBody = await response.text().catch(() => 'No response body');
            throw new Error(`Failed to purge all: ${response.status} ${response.statusText} - ${errorBody}`);
        }
    }

    // ========================================================================
    // EXTENDED API METHODS (native ST API stubs)
    // ========================================================================

    /**
     * List chunks with their stored text.
     * Native /api/vector/list returns hashes only, so we use /api/vector/query
     * with threshold=0 and a large topK to retrieve all items including text.
     */
    async listChunks(collectionId, settings, options = {}) {
        const limit = options.limit || VECTOR_LIST_LIMIT;
        const model = getModelFromSettings(settings);
        const source = settings.source || 'transformers';
        const providerParams = getProviderSpecificParams(settings, true);

        // Strip backend prefix (same as queryCollection)
        const knownBackends = ['standard', 'vectra', 'qdrant'];
        const parts = collectionId.split(':');
        const bareCollectionId = (parts.length >= 2 && knownBackends.includes(parts[0]))
            ? parts.slice(1).join(':')
            : collectionId;

        try {
            const response = await fetch('/api/vector/query', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({
                    collectionId: bareCollectionId,
                    searchText: 'event',
                    topK: limit,
                    threshold: 0,
                    source,
                    model,
                    ...providerParams,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                if (data.hashes?.length) {
                    return {
                        items: (data.metadata || []).map((m, idx) => ({
                            hash: data.hashes[idx],
                            text: m.text || '',
                            metadata: m,
                        })),
                        total: data.hashes.length,
                    };
                }
            }
        } catch (_) {
            // fall through to hash-only
        }

        // Fallback: hashes only (query endpoint unavailable or empty collection)
        const hashes = await this.getSavedHashes(collectionId, settings);
        return {
            items: hashes.map(hash => ({ hash, text: '', metadata: {} })),
            total: hashes.length,
        };
    }

    /**
     * Get a single chunk by hash — no native ST API for this
     */
    async getChunk(collectionId, hash, settings) {
        return null;
    }

    /**
     * Update chunk text — no native ST API for this
     */
    async updateChunkText(collectionId, hash, newText, settings) {
        throw new Error('Chunk text editing is not supported by the native ST API');
    }

    /**
     * Update chunk metadata — no native ST API for this
     */
    async updateChunkMetadata(collectionId, hash, metadata, settings) {
        throw new Error('Chunk metadata editing is not supported by the native ST API');
    }

    /**
     * Get collection statistics
     * Native ST API: hash count only
     */
    async getStats(collectionId, settings) {
        const hashes = await this.getSavedHashes(collectionId, settings);
        return {
            count: hashes.length,
            source: 'native',
        };
    }

    /**
     * Discover all collections on disk — no native ST API for this
     */
    async discoverCollections(settings) {
        return null;
    }
}
