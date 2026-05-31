/**
 * Module import smoke test.
 *
 * Dynamically imports every shipped source module (core/, backends/, utils/)
 * and asserts it loads with no CODE-level error. Catches the class of
 * "broken module load" bugs that feature-focused unit tests miss:
 *   - a top-level identifier used without being imported (throws at module-eval),
 *   - syntax errors from a bulk edit,
 *   - a wrong REPO-relative import path (e.g. a `./log.js` typo),
 *   - circular-import breakage.
 *
 * SillyTavern host modules (script.js, extensions.js, secrets.js, ...) live
 * outside the repo and don't resolve under vitest; they're stubbed with a
 * permissive Proxy so any named import from them yields a vi.fn(). A host import
 * that still can't resolve (a deeper transitive one not in the stub list) is
 * classified as ENVIRONMENTAL and skipped — but a REPO-relative miss, a
 * ReferenceError, or a SyntaxError is a real bug and fails the test.
 *
 * LIMITATION: this only executes TOP-LEVEL module code. A reference error INSIDE
 * a function body (like the original retrieveEvents `log` bug, whose bad line sat
 * in the function, not at module scope) is NOT caught here — that needs a test
 * that calls the function (see eventbase-retrieval.test.js). The two together
 * cover both load-time and call-time reference errors.
 */

import { describe, it, expect, vi } from 'vitest';
import { readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// vi.mock is hoisted above imports, so the stub factory must be hoisted too.
const { hostStub } = vi.hoisted(() => ({
    hostStub: () => new Proxy({}, { get: () => vi.fn(), has: () => true }),
}));

// One mock per distinct host specifier imported by source modules (enumerated
// from `from '../../.../*'` specifiers that escape the repo root).
vi.mock('../../../../../script.js', hostStub);
vi.mock('../../../../extensions.js', hostStub);
vi.mock('../../../../secrets.js', hostStub);
vi.mock('../../../../openai.js', hostStub);
vi.mock('../../../../utils.js', hostStub);
vi.mock('../../../../textgen-settings.js', hostStub);
vi.mock('../../../shared.js', hostStub);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// Source dirs to sweep. UI modules pull in heavy DOM/jQuery host globals beyond
// the import surface, so they're out of scope for this load smoke test.
const DIRS = ['core', 'backends', 'utils'];

const SKIP = new Set([
    'core/log.js', // the log helper itself; imported transitively by everything
]);
const SKIP_DIR_PARTS = new Set(['vendor', 'node_modules']);

function collectJs(dir) {
    const abs = path.join(root, dir);
    let out = [];
    let entries;
    try {
        entries = readdirSync(abs);
    } catch {
        return out;
    }
    for (const name of entries) {
        const rel = path.join(dir, name).split(path.sep).join('/');
        if (rel.split('/').some(p => SKIP_DIR_PARTS.has(p))) continue;
        const full = path.join(abs, name);
        if (statSync(full).isDirectory()) {
            out = out.concat(collectJs(rel));
        } else if (name.endsWith('.js') && !name.endsWith('.test.js') && !SKIP.has(rel)) {
            out.push(rel);
        }
    }
    return out;
}

const modules = DIRS.flatMap(collectJs);

// A rejection we treat as ENVIRONMENTAL (not a code bug): vitest can't resolve a
// host module that lives OUTSIDE the repo (specifier climbs 3+ levels up). A
// repo-relative miss like "./log.js" / "../core/foo.js" still fails the test.
function isUnresolvableHostDep(err) {
    const msg = String((err && err.message) || err);
    return /Failed to load url (\.\.\/){3,}/.test(msg);
}

describe('module import smoke', () => {
    it('found a meaningful number of modules to check', () => {
        expect(modules.length).toBeGreaterThan(10);
    });

    it.each(modules)('imports %s without a code-level load error', async (rel) => {
        try {
            const mod = await import('../' + rel);
            expect(mod).toBeDefined();
        } catch (err) {
            if (isUnresolvableHostDep(err)) return; // host dep unresolvable here, not a code bug
            throw err; // real: missing import, syntax error, or bad repo path
        }
    });
});
