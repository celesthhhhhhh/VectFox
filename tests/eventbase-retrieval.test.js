/**
 * EventBase Retrieval Tests
 *
 * Regression guard for the "log is not defined" class of bug: retrieveEvents
 * referenced `log` (via log.enabled) without importing it. That threw a
 * ReferenceError the moment the function ran — but only at message-send time,
 * never at import time and never in any existing unit test, so it shipped.
 *
 * These tests CALL retrieveEvents (with the backend mocked) so any missing
 * import / load-time reference error inside the function body surfaces here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// retrieveEvents transitively imports core/log.js -> ../../../../extensions.js
// (a SillyTavern host path that doesn't resolve under vitest). Mock it.
vi.mock('../../../../extensions.js', () => ({
    extension_settings: { vectfox: {} },
    getContext: vi.fn(() => ({ chat: [], characterId: null })),
}));

// Mock the live-query backend call so the test needs no Qdrant / plugin.
const queryCollectionMock = vi.fn();
vi.mock('../core/core-vector-api.js', () => ({
    queryCollection: (...args) => queryCollectionMock(...args),
}));

// checkPluginAvailable gates the cosine-weight coercion path. Default true so
// cosine weighting stays active; individual tests can override.
const checkPluginAvailableMock = vi.fn(async () => true);
vi.mock('../core/collection-loader.js', () => ({
    checkPluginAvailable: (...args) => checkPluginAvailableMock(...args),
}));

// Backend manager is only reached on the native-rerank path (Qdrant + opt-in),
// which these tests don't exercise — but it's imported at module top, so stub it.
vi.mock('../backends/backend-manager.js', () => ({
    getBackendForCollection: vi.fn(async () => null),
    getBackend: vi.fn(async () => null),
}));

import { retrieveEvents } from '../core/eventbase-retrieval.js';

const baseSettings = {
    vector_backend: 'standard',
    eventbase_retrieval_top_k: 8,
    eventbase_retrieval_min_importance: 1,
};

function makeEvent(i, overrides = {}) {
    return {
        event_id: `evt_${i}`,
        event_type: `type_${i}`,
        text: `Event number ${i} happened in the story.`,
        importance: 5,
        should_persist: false,
        source_window_end: i,
        score: 0.9 - i * 0.01,
        keywords: [`kw${i}`],
        ...overrides,
    };
}

beforeEach(() => {
    queryCollectionMock.mockReset();
    checkPluginAvailableMock.mockReset();
    checkPluginAvailableMock.mockResolvedValue(true);
});

describe('retrieveEvents', () => {
    it('runs without throwing and returns the {events, debug} shape', async () => {
        // The original missing-import bug threw ReferenceError on line 1 of the
        // function body. This call would have failed outright.
        queryCollectionMock.mockResolvedValue({ hashes: [], metadata: [] });

        const result = await retrieveEvents({
            searchText: 'what happened to the hero',
            keywordQuery: 'hero',
            chatLength: 50,
            settings: baseSettings,
            liveCollectionIds: ['standard:vf_eventbase_x'],
            additionalCandidates: [],
            skipLiveQuery: false,
        });

        expect(result).toBeTypeOf('object');
        expect(Array.isArray(result.events)).toBe(true);
        expect(result.debug).toBeTypeOf('object');
    });

    it('returns ranked events from the live query (non-empty path)', async () => {
        const metadata = [makeEvent(1), makeEvent(2), makeEvent(3)];
        queryCollectionMock.mockResolvedValue({
            hashes: metadata.map(m => m.event_id),
            metadata,
        });

        const { events, debug } = await retrieveEvents({
            searchText: 'story recap',
            keywordQuery: 'story',
            chatLength: 100,
            settings: baseSettings,
            liveCollectionIds: ['standard:vf_eventbase_x'],
            additionalCandidates: [],
            skipLiveQuery: false,
        });

        expect(queryCollectionMock).toHaveBeenCalled();
        expect(events.length).toBeGreaterThan(0);
        expect(debug.rawCount).toBeGreaterThan(0);
    });

    it('skips the live query but still returns archive candidates', async () => {
        const archive = [makeEvent(10), makeEvent(11)];

        const { events } = await retrieveEvents({
            searchText: 'recap',
            keywordQuery: 'recap',
            chatLength: 100,
            settings: baseSettings,
            liveCollectionIds: [],
            additionalCandidates: archive,
            skipLiveQuery: true,
        });

        // Live query must not be called when skipLiveQuery is true.
        expect(queryCollectionMock).not.toHaveBeenCalled();
        expect(events.length).toBeGreaterThan(0);
    });

    it('filters out events below minimum importance', async () => {
        const metadata = [
            makeEvent(1, { importance: 9 }),
            makeEvent(2, { importance: 1 }),
        ];
        queryCollectionMock.mockResolvedValue({
            hashes: metadata.map(m => m.event_id),
            metadata,
        });

        const { debug } = await retrieveEvents({
            searchText: 'q',
            keywordQuery: 'q',
            chatLength: 100,
            settings: { ...baseSettings, eventbase_retrieval_min_importance: 5 },
            liveCollectionIds: ['standard:vf_eventbase_x'],
            additionalCandidates: [],
            skipLiveQuery: false,
        });

        // Only the importance-9 event survives the >=5 filter.
        expect(debug.afterImportanceFilter).toBe(1);
    });
});
