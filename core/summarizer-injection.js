/**
 * ============================================================================
 * SUMMARIZER INJECTION (Feature B)
 * ============================================================================
 * Injects the most recent N EventBase events into the prompt every turn,
 * independent of the semantic-retrieval injection. Sorted by source_window_end
 * descending, sliced to N, rendered chronologically, and wrapped in
 * <VectFoxSummarizer> tags. Provides "word-for-word-ish" memory of the last few
 * turns to complement (not replace) semantic retrieval.
 *
 * Only meaningful when auto-sync is active (otherwise the EventBase collection
 * goes stale and "recent N" injects old data) — hence it lives on the AutoSync
 * tab and forces the auto-sync window to 1 turn while enabled.
 *
 * Uses its OWN extension-prompt tag so it stacks cleanly with the semantic
 * EventBase injection (`*_eventbase`) instead of clobbering it.
 * ============================================================================
 */

import { setExtensionPrompt } from '../../../../../script.js';
import { getBackend } from '../backends/backend-manager.js';
import { getChatUUID } from './collection-ids.js';
import { resolveActiveEventBaseCollection } from './eventbase-store.js';
import { EXTENSION_PROMPT_TAG } from './constants.js';
import { log } from './log.js';

const SUMMARIZER_PROMPT_TAG = `${EXTENSION_PROMPT_TAG}_summarizer`; // '3_vectfox_summarizer'

/**
 * Resolve recent events, format them, and inject (or clear) the summarizer slot.
 * Self-clears when disabled / no chat / no collection / no events, so calling it
 * unconditionally every turn is safe and keeps stale injections from lingering.
 *
 * @param {object} settings - extension_settings.vectfox
 * @returns {Promise<{ injected: number, error?: string }>}
 */
export async function runSummarizerInjection(settings) {
    const clear = () => setExtensionPrompt(SUMMARIZER_PROMPT_TAG, '', settings.position, settings.depth, false);

    if (!settings?.summarizer_injection_enabled) { clear(); return { injected: 0 }; }

    const { text, count } = await buildSummarizerInjection(settings);
    setExtensionPrompt(SUMMARIZER_PROMPT_TAG, text, settings.position, settings.depth, false);
    if (count > 0) log.domain('injection', 'trace', `[Summarizer] Injected ${count} event(s) under ${SUMMARIZER_PROMPT_TAG}`);
    return { injected: count };
}

/**
 * Compute the would-be summarizer injection content WITHOUT injecting it. This is
 * the exact path runSummarizerInjection uses (resolve → listChunks → filter → sort
 * → slice → format) minus the `setExtensionPrompt` and the `enabled` gate, so the
 * "Debug Summarizer" preview shows the real result even while the feature is off.
 *
 * @param {object} settings - extension_settings.vectfox
 * @returns {Promise<{ text: string, count: number, reason?: string, collectionId?: string, requested?: number, error?: string }>}
 *   `reason` is set on a 0-count outcome (disabled handled by the caller).
 */
export async function buildSummarizerInjection(settings) {
    const n = Math.max(1, Math.min(50, settings.summarizer_injection_count ?? 30));
    const uuid = getChatUUID();
    if (!uuid) return { text: '', count: 0, reason: 'no-chat', requested: n };

    // Lock-aware, ownership-filtered active collection (same source of truth as
    // the auto-sync marker and the LED).
    const active = resolveActiveEventBaseCollection(settings, uuid);
    if (!active) return { text: '', count: 0, reason: 'no-collection', requested: n };

    let backendInstance;
    try {
        backendInstance = await getBackend(settings);
    } catch (err) {
        log.warn('[Summarizer] Backend init failed:', err?.message || err);
        return { text: '', count: 0, reason: 'backend-error', error: err?.message, collectionId: active.collectionId, requested: n };
    }

    let items = [];
    try {
        // Overfetch — listChunks order is not guaranteed across backends; we sort
        // client-side. Without the Similharity plugin the Standard backend returns
        // hashes only (metadata: {}), so the filter below yields 0 — which is why
        // the UI hides this feature on standard+no-plugin.
        const limit = Math.max(n * 2, 100);
        const result = await backendInstance.listChunks(active.collectionId, settings, { limit });
        items = Array.isArray(result?.items) ? result.items : [];
    } catch (err) {
        log.warn('[Summarizer] listChunks failed:', err?.message || err);
        return { text: '', count: 0, reason: 'listchunks-error', error: err?.message, collectionId: active.collectionId, requested: n };
    }

    const events = items
        .filter(it => it?.metadata?.eventbase === true)
        .sort((a, b) => (b.metadata.source_window_end ?? 0) - (a.metadata.source_window_end ?? 0))
        .slice(0, n);

    if (!events.length) return { text: '', count: 0, reason: 'no-events', collectionId: active.collectionId, requested: n };

    const fullDetail = settings.summarizer_injection_full_detail !== false; // default on
    return { text: _format(events, fullDetail), count: events.length, collectionId: active.collectionId, requested: n };
}

/**
 * Render events oldest→newest inside <VectFoxSummarizer> tags, one summary per
 * line, each tagged with its recency so the model knows how far back it is:
 * the most recent extracted turn is "(latest turn)", older ones "(N turns ago)".
 * When `fullDetail` is on, each event's structured fields are listed (indented)
 * beneath its summary — only the fields that actually have content.
 * @param {Array<{text?: string, metadata?: object}>} events - newest-first (sorted desc)
 * @param {boolean} [fullDetail=false]
 * @returns {string}
 */
function _format(events, fullDetail = false) {
    const lines = [];
    // Walk oldest→newest. `events[0]` is the most recent (rank 1), so event at
    // index i is "i+1" turns back; i === 0 is the latest.
    for (let i = events.length - 1; i >= 0; i--) {
        const evt = events[i];
        const summary = _stripEventTypePrefix(evt.text || evt.metadata?.summary || '');
        if (!summary) continue;
        const label = i === 0 ? 'latest turn' : `${i + 1} turns ago`;
        lines.push(`(${label}) ${summary}`);
        if (fullDetail) {
            for (const d of _detailLines(evt.metadata || {})) lines.push(`  ${d}`);
        }
    }
    return `<VectFoxSummarizer>\n${lines.join('\n')}\n</VectFoxSummarizer>`;
}

/**
 * Build the indented structured-field lines for one event's metadata. Only fields
 * with content are emitted, so sparse events stay compact. `summary` is omitted
 * (already the headline line) and lives in the embed text, not metadata.
 * @param {object} meta
 * @returns {string[]}
 */
function _detailLines(meta) {
    const out = [];
    const arr = (v) => (Array.isArray(v) ? v.filter(x => x != null && String(x).trim() !== '') : []);
    const str = (v) => (typeof v === 'string' ? v.trim() : '');

    if (str(meta.cause)) out.push(`Cause: ${str(meta.cause)}`);
    if (str(meta.result)) out.push(`Result: ${str(meta.result)}`);
    if (arr(meta.items).length) out.push(`Items: ${arr(meta.items).join(', ')}`);
    if (str(meta.DateTime)) out.push(`When: ${str(meta.DateTime)}`);
    if (arr(meta.concepts).length) out.push(`Concepts: ${arr(meta.concepts).join(', ')}`);
    if (arr(meta.keywords).length) out.push(`Keywords: ${arr(meta.keywords).join(', ')}`);
    if (arr(meta.open_threads).length) out.push(`Open threads: ${arr(meta.open_threads).join(', ')}`);
    if (meta.source_window_end != null) out.push(`Message index: ${meta.source_window_end}`);
    return out;
}

/** Strip a leading "[EVENT_TYPE] " prefix from the first line of an event's text. */
function _stripEventTypePrefix(text) {
    const first = String(text).split('\n')[0];
    const m = first.match(/^\[[^\]]+\]\s*(.*)$/);
    return m ? m[1] : first;
}
