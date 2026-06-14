/**
 * Summarizer Injection (Feature B) — runSummarizerInjection contract.
 *
 * Locks in the part most prone to silent breakage: sort by source_window_end
 * desc → slice top N → render chronologically inside <VectFoxSummarizer> tags →
 * strip [EVENT_TYPE] prefixes, plus the self-clearing early-exits.
 *
 * All host/sibling modules are mocked (same pattern as backend-manager.test.js).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.hoisted lifts these so the (also-hoisted) vi.mock factories can reference them.
const mocks = vi.hoisted(() => ({
    setExtensionPrompt: vi.fn(),
    listChunks: vi.fn(),
    getChatUUID: vi.fn(() => 'uuid-1'),
    resolveActive: vi.fn(() => ({ collectionId: 'c', registryKey: 'k' })),
}));

vi.mock('../../../../../script.js', () => ({ setExtensionPrompt: mocks.setExtensionPrompt }));
vi.mock('../backends/backend-manager.js', () => ({ getBackend: vi.fn(async () => ({ listChunks: mocks.listChunks })) }));
vi.mock('../core/collection-ids.js', () => ({ getChatUUID: mocks.getChatUUID }));
vi.mock('../core/eventbase-store.js', () => ({ resolveActiveEventBaseCollection: mocks.resolveActive }));
vi.mock('../core/constants.js', () => ({ EXTENSION_PROMPT_TAG: '3_vectfox' }));
vi.mock('../core/log.js', () => ({ log: { warn() {}, error() {}, domain() {}, trace() {}, verbose() {}, lifecycle() {}, enabled: () => false } }));

import { runSummarizerInjection, buildSummarizerInjection } from '../core/summarizer-injection.js';

const SETTINGS = (over = {}) => ({
    summarizer_injection_enabled: true,
    summarizer_injection_count: 30,
    position: 1,
    depth: 4,
    vector_backend: 'qdrant',
    ...over,
});
const ev = (swe, text) => ({ text, metadata: { eventbase: true, source_window_end: swe } });
const lastInjected = () => mocks.setExtensionPrompt.mock.calls.at(-1);

beforeEach(() => {
    mocks.setExtensionPrompt.mockClear();
    mocks.listChunks.mockReset();
    mocks.getChatUUID.mockReturnValue('uuid-1');
    mocks.resolveActive.mockReturnValue({ collectionId: 'c', registryKey: 'k' });
});

describe('runSummarizerInjection', () => {
    it('clears the slot and no-ops when disabled', async () => {
        const r = await runSummarizerInjection(SETTINGS({ summarizer_injection_enabled: false }));
        expect(r.injected).toBe(0);
        expect(mocks.setExtensionPrompt).toHaveBeenCalledWith('3_vectfox_summarizer', '', 1, 4, false);
        expect(mocks.listChunks).not.toHaveBeenCalled();
    });

    it('clears the slot when no chat is open', async () => {
        mocks.getChatUUID.mockReturnValue(null);
        const r = await runSummarizerInjection(SETTINGS());
        expect(r.injected).toBe(0);
        expect(lastInjected()).toEqual(['3_vectfox_summarizer', '', 1, 4, false]);
    });

    it('clears the slot when no active collection resolves', async () => {
        mocks.resolveActive.mockReturnValue(null);
        const r = await runSummarizerInjection(SETTINGS());
        expect(r.injected).toBe(0);
        expect(lastInjected()[1]).toBe('');
    });

    it('clears when the collection has no events', async () => {
        mocks.listChunks.mockResolvedValue({ items: [] });
        const r = await runSummarizerInjection(SETTINGS());
        expect(r.injected).toBe(0);
        expect(lastInjected()[1]).toBe('');
    });

    it('injects top-N by source_window_end desc, chronological, in <VectFoxSummarizer>, prefixes stripped', async () => {
        mocks.listChunks.mockResolvedValue({ items: [
            ev(2, '[MOVE] A'), ev(8, '[TALK] D'), ev(4, '[MOVE] B'), ev(6, 'C'),
        ] });
        const r = await runSummarizerInjection(SETTINGS({ summarizer_injection_count: 3 }));
        expect(r.injected).toBe(3);
        const [tag, text] = lastInjected();
        expect(tag).toBe('3_vectfox_summarizer');
        // top-3 by swe desc = D(8), C(6), B(4); rendered chronological = B, C, D
        expect(text).toBe('<VectFoxSummarizer>\nB\nC\nD\n</VectFoxSummarizer>');
    });

    it('injects all when fewer events than N exist (no padding)', async () => {
        mocks.listChunks.mockResolvedValue({ items: [ev(2, 'X'), ev(4, 'Y')] });
        const r = await runSummarizerInjection(SETTINGS({ summarizer_injection_count: 10 }));
        expect(r.injected).toBe(2);
        expect(lastInjected()[1]).toBe('<VectFoxSummarizer>\nX\nY\n</VectFoxSummarizer>');
    });

    it('clamps count to 50', async () => {
        mocks.listChunks.mockResolvedValue({ items: Array.from({ length: 60 }, (_, i) => ev(i, 'e' + i)) });
        const r = await runSummarizerInjection(SETTINGS({ summarizer_injection_count: 999 }));
        expect(r.injected).toBe(50);
        // open tag + 50 summary lines + close tag
        expect(lastInjected()[1].split('\n').length).toBe(52);
    });

    it('ignores non-eventbase items (e.g. metadata:{} from standard+no-plugin)', async () => {
        mocks.listChunks.mockResolvedValue({ items: [{ text: 'hash-only', metadata: {} }, ev(2, 'real')] });
        const r = await runSummarizerInjection(SETTINGS());
        expect(r.injected).toBe(1);
        expect(lastInjected()[1]).toBe('<VectFoxSummarizer>\nreal\n</VectFoxSummarizer>');
    });
});

describe('buildSummarizerInjection (Debug Summarizer preview path)', () => {
    it('computes the would-be content even when the feature is DISABLED (never injects)', async () => {
        mocks.listChunks.mockResolvedValue({ items: [ev(4, 'Y'), ev(2, 'X')] });
        const out = await buildSummarizerInjection(SETTINGS({ summarizer_injection_enabled: false, summarizer_injection_count: 5 }));
        expect(out.count).toBe(2);
        expect(out.text).toBe('<VectFoxSummarizer>\nX\nY\n</VectFoxSummarizer>');
        // Preview must NOT touch the prompt slot.
        expect(mocks.setExtensionPrompt).not.toHaveBeenCalled();
    });

    it('reports a reason on empty outcomes', async () => {
        mocks.resolveActive.mockReturnValue(null);
        const out = await buildSummarizerInjection(SETTINGS());
        expect(out).toMatchObject({ count: 0, text: '', reason: 'no-collection' });
    });
});
