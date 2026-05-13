/**
 * ============================================================================
 * EVENTBASE INJECTION
 * ============================================================================
 * Formats retrieved EventRecord objects into a prompt block for injection.
 * No hard character budget is enforced — Top-K and retrieval filters control
 * payload size.
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// JSON format
// ---------------------------------------------------------------------------

/**
 * Extract the summary line from an event's stored embed text.
 * The text is built by buildEmbedText() and starts with "[event_type] summary"
 * on its first line. Strips the bracketed event_type prefix.
 * @param {string} text
 * @returns {string}
 */
function _summaryFromText(text) {
    if (!text) return '';
    const firstLine = String(text).split('\n')[0];
    const match = firstLine.match(/^\[[^\]]+\]\s*(.*)$/);
    return match ? match[1] : firstLine;
}

/**
 * Strip internal scoring/ingestion fields that should not be injected.
 * Returns only the canonical EventRecord fields.
 * @param {object} event
 * @returns {object}
 */
function _cleanEventForInjection(event) {
    return {
        event_type: event.event_type,
        importance: event.importance,
        summary: _summaryFromText(event.text),
        DateTime: event.DateTime || null,
        cause: event.cause || '',
        result: event.result || '',
        characters: event.characters || [],
        locations: event.locations || [],
        factions: event.factions || [],
        items: event.items || [],
        concepts: event.concepts || [],
        keywords: event.keywords || [],
        open_threads: event.open_threads || [],
        should_persist: event.should_persist === true,
    };
}

/**
 * Format events as a JSON array string (canonical format).
 * @param {object[]} events
 * @returns {string}
 */
function _formatAsJson(events) {
    return JSON.stringify(events.map(_cleanEventForInjection), null, 2);
}

// ---------------------------------------------------------------------------
// Dense text format
// ---------------------------------------------------------------------------

/**
 * @param {unknown} value
 * @returns {string}
 */
function _stringifyList(value) {
    if (!Array.isArray(value) || value.length === 0) return '-';
    return value.map(v => String(v)).join(', ');
}

/**
 * Format events as compact dense text blocks.
 * @param {object[]} events
 * @returns {string}
 */
function _formatAsDenseText(events) {
    return events.map((rawEvent, idx) => {
        const event = _cleanEventForInjection(rawEvent);
        return [
            `# Event ${idx + 1}`,
            `event_type: ${event.event_type || '-'}`,
            `importance: ${event.importance ?? '-'}`,
            `summary: ${event.summary || '-'}`,
            `DateTime: ${event.DateTime || '-'}`,
            `cause: ${event.cause || '-'}`,
            `result: ${event.result || '-'}`,
            `characters: ${_stringifyList(event.characters)}`,
            `locations: ${_stringifyList(event.locations)}`,
            `factions: ${_stringifyList(event.factions)}`,
            `items: ${_stringifyList(event.items)}`,
            `concepts: ${_stringifyList(event.concepts)}`,
            `keywords: ${_stringifyList(event.keywords)}`,
            `open_threads: ${_stringifyList(event.open_threads)}`,
            `should_persist: ${event.should_persist ? 'true' : 'false'}`,
        ].join('\n');
    }).join('\n\n');
}

/**
 * Format events as summary + DateTime only — minimal prompt footprint.
 * @param {object[]} events
 * @returns {string}
 */
function _formatAsSummaryOnly(events) {
    return events.map((rawEvent, idx) => {
        const event = _cleanEventForInjection(rawEvent);
        return [
            `# Event ${idx + 1}`,
            `summary: ${event.summary || '-'}`,
            `DateTime: ${event.DateTime || '-'}`,
        ].join('\n');
    }).join('\n\n');
}

// ---------------------------------------------------------------------------
// Main formatter
// ---------------------------------------------------------------------------

/**
 * Format retrieved events into a prompt injection string.
 * No hard cap is applied here; Top-K and retrieval filters control payload size.
 *
 * @param {object[]} events   - Re-ranked EventRecord objects (highest score first)
 * @param {object}   settings - VectFox settings
 * @returns {string}          - Formatted string ready for injection (empty string if nothing fits)
 */
export function formatEventsForInjectionDetailed(events, _settings) {
    if (!events?.length) {
        return { text: '', includedCount: 0, requestedCount: 0 };
    }

    const format = String(_settings?.eventbase_injection_format || 'densetext').toLowerCase();
    const text = format === 'densetext'
        ? _formatAsDenseText(events)
        : format === 'summaryonly'
            ? _formatAsSummaryOnly(events)
            : _formatAsJson(events);

    return {
        text,
        includedCount: events.length,
        requestedCount: events.length,
    };
}

