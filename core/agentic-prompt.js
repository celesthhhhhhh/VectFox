/**
 * ============================================================================
 * AGENTIC RETRIEVAL — PLANNER PROMPT
 * ============================================================================
 * System prompt and few-shot examples for the retrieval-planner LLM call.
 *
 * The planner consumes:
 *   - Recent chat context (last N turns, configurable)
 *   - The user's current message
 *   - Pre-search candidate event summaries from Qdrant
 *
 * It outputs strict JSON describing:
 *   - 1-4 follow-up search queries (complementary angles, not paraphrases)
 *   - Optional payload filter hints (characters_any, concepts_any, etc.)
 *   - A one-sentence rationale (debug only)
 * ============================================================================
 */

/**
 * Static system prompt. Provider/model agnostic — pure instruction + examples.
 * Keep lean: planner runs on small/fast models and is called every generation.
 */
export const AGENTIC_PLANNER_SYSTEM_PROMPT =
`You are a retrieval planner for a roleplay memory system. Read recent chat plus pre-search candidate events, then decide what to search the event database for.

Filterable event fields: event_type, importance (1–10), characters, locations, factions, items, concepts (themes), keywords, DateTime.

Output STRICT JSON with exactly three fields:

  queries    1–4 short search strings (5–15 words). Cover DIFFERENT angles — not paraphrases.

  filters    Optional:
               characters_any, locations_any, factions_any, items_any, concepts_any,
               event_type_any  — arrays of strings
               importance_gte  — number 1–10

  rationale  One sentence in the chat language. Debug only — not used in retrieval.

══ LANGUAGE RULE (CRITICAL) ══════════════════════════════════════════

Events are stored tagged in the STORY'S language.
Queries MUST be written in that same language ONLY.
Mixing in a foreign language injects tokens that match nothing and pollutes sparse-vector search.

Step 1 — Detect language from the user message and recent turns.
Step 2 — Write ALL queries in that language only. Never mix.

  English → "Astarion reaction Gauntlet of Shar trial"      ✓
            "Astarion 試煉 Gauntlet"                          ✗  mixed scripts
  Chinese → "Mayla 贖身 2萬金幣付款"                        ✓
            "Mayla 贖身 ransom payment"                       ✗  mixed scripts

Same rule for Japanese, Korean, Spanish, French, and any other language.

Proper noun exception — character names, place names, and item names KEEP their
original form from the chat, even if that is a different script:
  ✓ "Critblade Mayla 贖身"    — names stay English, theme stays Chinese
  ✗ "克里特刀 瑪伊拉 贖身"    — never transliterate or translate proper nouns

══ FILTER RULES ══════════════════════════════════════════════════════

concepts_any = THEME words in the chat language (贖身, ransom, betrayal, 試練).
  • Never mix languages here.
  • Never put proper nouns here.
  • If a theme word appears in your queries, also put it in concepts_any — it is the
    strongest anchor for sparse-vector matching.

characters_any / locations_any / items_any / factions_any = proper nouns in whatever
form they appear in the chat (keep original script/spelling).

importance_gte: set 6–7 to skip filler events for "remember when…" questions.
Over-filtering on characters_any is fine; avoid over-constraining locations/factions.

══ QUESTION TYPE GUIDE ═══════════════════════════════════════════════

  "why X?"        → one query per causal stage: cause → act → aftermath
  "at location?"  → events at that place
  "remember...?"  → event + result + reactions; don't over-filter (user may misremember)
  "Z's reaction?" → Z's events around that moment
  Vague/open      → broad queries, fewer filters

══ EXAMPLES ══════════════════════════════════════════════════════════

Example 1 — English, single character focus:
User: "Astarion, what did you think of the Gauntlet?"
{
  "queries": [
    "Gauntlet of Shar exploration entry",
    "Astarion reaction Gauntlet trial",
    "Shadowfell discoveries Gauntlet"
  ],
  "filters": { "characters_any": ["Astarion"] },
  "rationale": "Pulling Gauntlet events involving Astarion and his reactions."
}

Example 2 — Traditional Chinese, causal "why" chain:
User: 我對 Mayla 説 "你記得我當時為甚麼為你贖身嗎?"
{
  "queries": [
    "Mayla 贖身 2萬金幣付款",
    "Mayla 綁架 被擄走 監禁",
    "贖金談判 老闆 中介",
    "Mayla 獲救 後續 情感反應"
  ],
  "filters": {
    "characters_any": ["Mayla"],
    "concepts_any": ["贖身", "綁架", "獲救"]
  },
  "rationale": "因果鏈：綁架→談判→付款→救出反應。"
}

Example 3 — Japanese, character-state question:
User: アスタリオン、ガントレットで何を考えていたの?
{
  "queries": [
    "ガントレット 探索 入り口",
    "アスタリオン 試練 反応",
    "影界 発見 物語"
  ],
  "filters": {
    "characters_any": ["Astarion"],
    "concepts_any": ["ガントレット", "試練"]
  },
  "rationale": "アスタリオンのガントレット体験と反応を引き出す。"
}

Return ONLY the JSON object. No commentary, no markdown fences, no preamble.`;

/**
 * Build the user-message portion of the planner prompt. Combines recent chat,
 * the current user message, and a summary of pre-search candidates.
 *
 * @param {object} params
 * @param {{speaker: string, text: string}[]} params.recentTurns - Past chat (oldest first)
 * @param {string} params.userMessage - Current user input verbatim
 * @param {object[]} params.candidates - Pre-search event candidates (already trimmed)
 * @returns {string} The user-message text
 */
export function buildPlannerUserMessage({ recentTurns, userMessage, candidates }) {
    const parts = [];

    parts.push('Recent chat (oldest first):');
    if (!recentTurns || recentTurns.length === 0) {
        parts.push('  (no recent context — start of conversation)');
    } else {
        recentTurns.forEach((turn, idx) => {
            const idxLabel = `[-${recentTurns.length - idx}]`;
            const speaker = turn.speaker || (turn.is_user ? '{{user}}' : '{{character}}');
            // Soft-trim each turn to ~600 chars so very long replies don't blow the budget.
            const body = (turn.text || '').slice(0, 600);
            const ellipsis = (turn.text || '').length > 600 ? '...' : '';
            parts.push(`  ${idxLabel} ${speaker}: ${body}${ellipsis}`);
        });
    }

    parts.push('');
    parts.push('Current user message:');
    parts.push(`  ${userMessage || '(empty)'}`);

    parts.push('');
    parts.push('Candidate events from pre-search (top by similarity, may be incomplete):');
    if (!candidates || candidates.length === 0) {
        parts.push('  (none — DB returned no semantic matches)');
    } else {
        candidates.forEach((ev, i) => {
            parts.push(_formatCandidateLine(ev, i + 1));
        });
    }

    parts.push('');
    parts.push('Plan retrieval. Return strict JSON only.');

    return parts.join('\n');
}

/**
 * One-line summary of a candidate event for the planner prompt.
 * Format: E<N> [score] type — text (chars: [...], concepts: [...], importance: X)
 */
function _formatCandidateLine(ev, idx) {
    const score = typeof ev.score === 'number' ? ev.score.toFixed(2)
        : typeof ev.vectorScore === 'number' ? ev.vectorScore.toFixed(2)
        : '—';
    const type = ev.event_type || ev.metadata?.event_type || 'event';
    const text = (ev.text || ev.metadata?.text || '').replace(/\s+/g, ' ').slice(0, 90);
    const chars = (ev.characters || ev.metadata?.characters || []).slice(0, 4).join(', ');
    const concepts = (ev.concepts || ev.metadata?.concepts || []).slice(0, 4).join(', ');
    const importance = ev.importance ?? ev.metadata?.importance ?? '?';

    const meta = [
        chars ? `chars: [${chars}]` : '',
        concepts ? `concepts: [${concepts}]` : '',
        `importance: ${importance}`,
    ].filter(Boolean).join(' | ');

    return `  E${idx} [${score}] ${type} — ${text}\n      ${meta}`;
}
