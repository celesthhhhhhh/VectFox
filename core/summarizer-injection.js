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
    const n = Math.max(1, Math.min(50, settings.summarizer_injection_count ?? 20));
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
        // Fetch the WHOLE collection, then sort client-side for the true most-recent N.
        // listChunks applies its limit at the Qdrant-scroll level (point-ID order, i.e.
        // random vs recency) BEFORE the plugin sorts the page by index — so any limit
        // SMALLER than the collection returns an arbitrary sample and "sort + top-N"
        // misses recent events (the database browser sidesteps this by fetching with
        // NO limit, see ui/database-browser.js doLoad(null)). 50000 is a ceiling that
        // never truncates a realistic per-chat EventBase collection (O(hundreds–low
        // thousands)). Cost scales with ACTUAL collection size, not this ceiling.
        // Without the Similharity plugin the Standard backend returns hashes only
        // (metadata: {}) → filter yields 0, which is why the UI hides this on
        // standard+no-plugin.
        const result = await backendInstance.listChunks(active.collectionId, settings, { limit: 50000 });
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
    const maxChars = Number.isFinite(settings.summarizer_injection_max_chars) ? settings.summarizer_injection_max_chars : 10000;
    const { text, count } = _format(events, fullDetail, maxChars);
    if (count < events.length) {
        log.domain('injection', 'trace', `[Summarizer] Char budget (${maxChars}) trimmed ${events.length - count} oldest of ${events.length} events`);
    }
    return { text, count, collectionId: active.collectionId, requested: n };
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
function _format(events, fullDetail = false, maxChars = 0) {
    // Recency rank by DISTINCT source_window_end (events is newest-first). A turn /
    // window can yield multiple events (Max Events per Window), all sharing one
    // source_window_end — they must share one label ("latest turn"), not be split
    // into "latest", "2 turns ago", … by array position.
    const rankByEvent = new Map();
    let rank = 0;
    let prevSwe;
    for (const evt of events) { // newest-first
        const swe = evt.metadata?.source_window_end;
        if (rank === 0 || swe !== prevSwe) { rank++; prevSwe = swe; }
        rankByEvent.set(evt, rank);
    }

    // Build per-event blocks newest-first so the character budget keeps the MOST
    // recent events and drops the oldest overflow. The latest event is always
    // included (even if it alone exceeds the cap) so the block is never empty.
    const blocksNewestFirst = [];
    let used = 0;
    for (const evt of events) { // newest-first
        const summary = _stripEventTypePrefix(evt.text || evt.metadata?.summary || '');
        if (!summary) continue;
        const r = rankByEvent.get(evt);
        const label = r === 1 ? 'latest turn' : `${r} turns ago`;
        const blockLines = [`(${label}) ${summary}`];
        if (fullDetail) {
            for (const d of _detailLines(evt.metadata || {})) blockLines.push(`  ${d}`);
        }
        const block = blockLines.join('\n');
        if (maxChars > 0 && blocksNewestFirst.length > 0 && used + 1 + block.length > maxChars) break;
        blocksNewestFirst.push(block);
        used += block.length + 1;
    }

    const body = blocksNewestFirst.slice().reverse().join('\n'); // render oldest→newest
    return { text: `<VectFoxSummarizer>\n${body}\n</VectFoxSummarizer>`, count: blocksNewestFirst.length };
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
    if (arr(meta.characters).length) out.push(`Characters: ${arr(meta.characters).join(', ')}`);
    if (arr(meta.locations).length) out.push(`Locations: ${arr(meta.locations).join(', ')}`);
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
