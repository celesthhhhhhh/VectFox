/**
 * ============================================================================
 * VectFox MASTER SWITCH
 * ============================================================================
 * Single source of truth for the global on/off toggle. VectFox does all of its
 * automatic runtime work — semantic retrieval injection, EventBase auto-sync,
 * and Lorebook World Info injection — only when this returns true.
 *
 * Default ON: the flag is treated as enabled unless it is *explicitly* set to
 * false, so existing installs (which have no `enabled` key) keep working
 * untouched. Every runtime gate must read this helper, never `settings.enabled`
 * inline, so the default-ON semantics live in exactly one place.
 *
 * Scope: only the automatic generation-time paths are gated. Explicit,
 * user-initiated actions (manual vectorization, Database Browser, the dry-run
 * query tester) stay usable so the user can still inspect and manage data while
 * VectFox is switched off.
 * ============================================================================
 */

import { extension_settings } from '../../../../extensions.js';

/**
 * @param {object} [settings] - extension_settings.vectfox (defaults to the live store)
 * @returns {boolean} true when VectFox's automatic runtime work is enabled
 */
export function isVectFoxEnabled(settings) {
    const store = settings || extension_settings?.vectfox;
    return store?.enabled !== false;
}
