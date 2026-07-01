/**
 * GitHub tokens repository.
 *
 * Backward-compatible helper layer over generic credentials storage.
 * Tokens are stored in `user_credentials` with `credential_type = 'github_token'`.
 */
import { getConnection } from '../../../modules/database/connection.js';
import { credentialsDb } from '../../../modules/database/repositories/credentials.js';
const GITHUB_TOKEN_TYPE = 'github_token';
export const githubTokensDb = {
    /** Creates a GitHub token credential entry. */
    createGithubToken(userId, tokenName, githubToken, description = null) {
        return credentialsDb.createCredential(userId, tokenName, GITHUB_TOKEN_TYPE, githubToken, description);
    },
    /** Returns all GitHub tokens (safe shape: no credential value). */
    getGithubTokens(userId) {
        return credentialsDb.getCredentials(userId, GITHUB_TOKEN_TYPE);
    },
    /** Returns the most recent active GitHub token value for a user. */
    getActiveGithubToken(userId) {
        return credentialsDb.getActiveCredential(userId, GITHUB_TOKEN_TYPE);
    },
    /**
     * Returns a specific active GitHub token row by id/user, including
     * a `github_token` compatibility field.
     */
    getGithubTokenById(userId, tokenId) {
        const db = getConnection();
        const row = db
            .prepare(`SELECT *
         FROM user_credentials
         WHERE id = ? AND user_id = ? AND credential_type = ? AND is_active = 1`)
            .get(tokenId, userId, GITHUB_TOKEN_TYPE);
        if (!row)
            return null;
        return {
            ...row,
            github_token: row.credential_value,
        };
    },
    /** Updates active state for a GitHub token. */
    updateGithubToken(userId, tokenId, isActive) {
        return credentialsDb.toggleCredential(userId, tokenId, isActive);
    },
    /** Deletes a GitHub token. */
    deleteGithubToken(userId, tokenId) {
        return credentialsDb.deleteCredential(userId, tokenId);
    },
    // Legacy alias used by existing routes
    toggleGithubToken(userId, tokenId, isActive) {
        return githubTokensDb.updateGithubToken(userId, tokenId, isActive);
    },
};
//# sourceMappingURL=github-tokens.js.map