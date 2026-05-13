/**
 * ============================================================================
 * COLLECTION MIGRATOR
 * ============================================================================
 * Utilities to migrate collections from vecthare_* to vf_* naming format.
 * Preserves all vector data and metadata while updating collection IDs.
 * ============================================================================
 */

import { loadCollectionChunks, getCollectionRegistry, registerCollection, unregisterCollection } from './collection-loader.js';
import { getSavedHashes, insertVectorItems, deleteVectorItems, purgeVectorIndex } from './core-vector-api.js';
import { COLLECTION_PREFIXES, parseCollectionId } from './collection-ids.js';
import { getCollectionMeta, setCollectionMeta, deleteCollectionMeta } from './collection-metadata.js';

/**
 * Converts a legacy vecthare_* collection ID to new vf_* format
 * @param {string} oldCollectionId - Original collection ID (e.g., vecthare_eventbase_...)
 * @returns {string|null} New collection ID (e.g., vf_eventbase_...) or null if not convertible
 */
export function convertCollectionId(oldCollectionId) {
    if (!oldCollectionId || typeof oldCollectionId !== 'string') {
        return null;
    }

    // Map old prefixes to new ones
    const prefixMap = {
        [COLLECTION_PREFIXES.VECTHARE_CHAT]: COLLECTION_PREFIXES.VECTFOX_CHAT,
        [COLLECTION_PREFIXES.VECTHARE_LOREBOOK]: COLLECTION_PREFIXES.VECTFOX_LOREBOOK,
        [COLLECTION_PREFIXES.VECTHARE_CHARACTER]: COLLECTION_PREFIXES.VECTFOX_CHARACTER,
        [COLLECTION_PREFIXES.VECTHARE_DOCUMENT]: COLLECTION_PREFIXES.VECTFOX_DOCUMENT,
        [COLLECTION_PREFIXES.VECTHARE_ARCHIVE_EVENT]: COLLECTION_PREFIXES.VECTFOX_ARCHIVE_EVENT,
        [COLLECTION_PREFIXES.VECTHARE_EVENTBASE]: COLLECTION_PREFIXES.VECTFOX_EVENTBASE,
    };

    for (const [oldPrefix, newPrefix] of Object.entries(prefixMap)) {
        if (oldCollectionId.startsWith(oldPrefix)) {
            return oldCollectionId.replace(oldPrefix, newPrefix);
        }
    }

    return null;
}

/**
 * Migrates a single collection from vecthare_* to vf_* format
 * @param {string} oldCollectionId - Original collection ID
 * @param {object} settings - VectFox settings
 * @param {Function} onProgress - Progress callback (current, total, message)
 * @returns {Promise<{success: boolean, newCollectionId: string|null, error: string|null, itemCount: number}>}
 */
export async function migrateCollection(oldCollectionId, settings, onProgress = null) {
    try {
        // Convert collection ID
        const newCollectionId = convertCollectionId(oldCollectionId);
        if (!newCollectionId) {
            return {
                success: false,
                newCollectionId: null,
                error: `Cannot convert collection ID: ${oldCollectionId}`,
                itemCount: 0,
            };
        }

        onProgress?.(0, 100, `Loading vectors from ${oldCollectionId}...`);

        // Load all chunks from old collection
        const chunks = await loadCollectionChunks(oldCollectionId, settings);
        if (!chunks || chunks.length === 0) {
            console.warn(`VectFox: Collection ${oldCollectionId} is empty, skipping migration`);
            return {
                success: true,
                newCollectionId,
                error: null,
                itemCount: 0,
            };
        }

        onProgress?.(30, 100, `Loaded ${chunks.length} vectors, creating new collection...`);

        // Get collection metadata
        const oldMeta = getCollectionMeta(oldCollectionId);

        // Prepare items for insertion (chunks already have all needed fields)
        const items = chunks.map((chunk) => ({
            hash: chunk.hash,
            text: chunk.text,
            index: chunk.index || 0,
            meta: chunk.meta || {},
        }));

        onProgress?.(50, 100, `Inserting ${items.length} vectors into ${newCollectionId}...`);

        // Insert all items into new collection
        await insertVectorItems(newCollectionId, items, settings);

        onProgress?.(80, 100, `Updating registry and metadata...`);

        // Register new collection and copy metadata
        registerCollection(newCollectionId);
        if (oldMeta) {
            setCollectionMeta(newCollectionId, oldMeta);
        }

        // Unregister old collection
        unregisterCollection(oldCollectionId);

        onProgress?.(100, 100, `Migration complete: ${chunks.length} vectors moved`);

        return {
            success: true,
            newCollectionId,
            error: null,
            itemCount: chunks.length,
        };
    } catch (error) {
        console.error(`VectFox: Failed to migrate collection ${oldCollectionId}:`, error);
        return {
            success: false,
            newCollectionId: null,
            error: error.message || String(error),
            itemCount: 0,
        };
    }
}

/**
 * Deletes the old collection after successful migration
 * @param {string} oldCollectionId - Collection ID to delete
 * @param {object} settings - VectFox settings
 * @returns {Promise<boolean>} Success
 */
export async function deleteOldCollection(oldCollectionId, settings) {
    try {
        await purgeVectorIndex(oldCollectionId, settings);
        deleteCollectionMeta(oldCollectionId);
        unregisterCollection(oldCollectionId);
        return true;
    } catch (error) {
        console.error(`VectFox: Failed to delete old collection ${oldCollectionId}:`, error);
        return false;
    }
}

/**
 * Finds all collections that need migration (vecthare_* prefix)
 * @returns {string[]} Array of collection IDs to migrate
 */
export function findCollectionsToMigrate() {
    const registry = getCollectionRegistry();
    const legacyPrefixes = [
        COLLECTION_PREFIXES.VECTHARE_CHAT,
        COLLECTION_PREFIXES.VECTHARE_LOREBOOK,
        COLLECTION_PREFIXES.VECTHARE_CHARACTER,
        COLLECTION_PREFIXES.VECTHARE_DOCUMENT,
        COLLECTION_PREFIXES.VECTHARE_ARCHIVE_EVENT,
        COLLECTION_PREFIXES.VECTHARE_EVENTBASE,
    ];

    return registry.filter((collectionId) =>
        legacyPrefixes.some((prefix) => collectionId.startsWith(prefix)),
    );
}

/**
 * Migrates all vecthare_* collections to vf_* format
 * @param {object} settings - VectFox settings
 * @param {Function} onProgress - Progress callback (current, total, message)
 * @param {boolean} deleteOld - Whether to delete old collections after migration
 * @returns {Promise<{totalMigrated: number, failed: string[], itemCount: number}>}
 */
export async function migrateAllCollections(settings, onProgress = null, deleteOld = false) {
    const collectionsToMigrate = findCollectionsToMigrate();
    const total = collectionsToMigrate.length;
    const failed = [];
    let totalItemCount = 0;
    let migrated = 0;

    console.log(`VectFox: Starting migration of ${total} collections...`);

    for (let i = 0; i < collectionsToMigrate.length; i++) {
        const oldCollectionId = collectionsToMigrate[i];
        const collectionNum = i + 1;

        onProgress?.(
            collectionNum,
            total,
            `Migrating collection ${collectionNum}/${total}: ${oldCollectionId}`,
        );

        const result = await migrateCollection(
            oldCollectionId,
            settings,
            (cur, max, msg) => {
                // Scale progress within this collection's range
                const baseProgress = ((collectionNum - 1) / total) * 100;
                const collectionProgress = (cur / max) * (100 / total);
                onProgress?.(baseProgress + collectionProgress, 100, msg);
            },
        );

        if (result.success) {
            migrated++;
            totalItemCount += result.itemCount;

            if (deleteOld && result.newCollectionId) {
                console.log(`VectFox: Deleting old collection ${oldCollectionId}...`);
                await deleteOldCollection(oldCollectionId, settings);
            }
        } else {
            failed.push(`${oldCollectionId}: ${result.error}`);
        }
    }

    console.log(
        `VectFox: Migration complete. ${migrated}/${total} collections migrated, ${totalItemCount} total vectors`,
    );

    return {
        totalMigrated: migrated,
        failed,
        itemCount: totalItemCount,
    };
}

/**
 * Migrates the multitenancy collection from vecthare_multitenancy to vectfox_multitenancy
 * Special handling for Qdrant-specific collection
 * @param {object} settings - VectFox settings
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export async function migrateMultitenancyCollection(settings) {
    // This is handled differently because it's a Qdrant-specific collection
    // For now, we'll keep using vecthare_multitenancy as per the plan
    // A future update can implement actual migration if needed
    return {
        success: true,
        error: 'Multitenancy collection migration not yet implemented (vecthare_multitenancy preserved for compatibility)',
    };
}
