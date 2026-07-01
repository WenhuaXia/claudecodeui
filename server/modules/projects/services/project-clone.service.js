import { spawn } from 'node:child_process';
import { access, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { githubTokensDb } from '../../../modules/database/index.js';
import { createProject } from '../../../modules/projects/services/project-management.service.js';
import { AppError, validateWorkspacePath } from '../../../shared/utils.js';
async function defaultPathExists(targetPath) {
    try {
        await access(targetPath);
        return true;
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}
function sanitizeGitError(message, token) {
    if (!message || !token) {
        return message;
    }
    const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return message.replace(new RegExp(escapedToken, 'g'), '***');
}
function resolveCloneFailureMessage(lastError, sanitizedError) {
    if (lastError.includes('Authentication failed') || lastError.includes('could not read Username')) {
        return 'Authentication failed. Please check your credentials.';
    }
    if (lastError.includes('Repository not found')) {
        return 'Repository not found. Please check the URL and ensure you have access.';
    }
    if (lastError.includes('already exists')) {
        return 'Directory already exists';
    }
    if (sanitizedError) {
        return sanitizedError;
    }
    return 'Git clone failed';
}
function resolveErrorMessage(error) {
    if (error instanceof AppError) {
        return error.message;
    }
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return 'Unexpected error';
}
const defaultDependencies = {
    validatePath: validateWorkspacePath,
    ensureDirectory: async (directoryPath) => {
        await mkdir(directoryPath, { recursive: true });
    },
    pathExists: defaultPathExists,
    removePath: async (targetPath) => {
        await rm(targetPath, { recursive: true, force: true });
    },
    getGithubTokenById: async (tokenId, userId) => {
        const tokenRow = githubTokensDb.getGithubTokenById(userId, tokenId);
        return tokenRow;
    },
    spawnGitClone: (cloneUrl, clonePath) => spawn('git', ['clone', '--progress', '--', cloneUrl, clonePath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: '0',
        },
    }),
    registerProject: async (projectPath, customName) => createProject({
        projectPath,
        customName,
    }),
    logError: (message, error) => {
        console.error(message, error);
    },
};
export async function startCloneProject(input, handlers, dependencies = defaultDependencies) {
    const normalizedWorkspacePath = input.workspacePath.trim();
    const normalizedGithubUrl = input.githubUrl.trim();
    if (!normalizedWorkspacePath) {
        throw new AppError('workspacePath and githubUrl are required', {
            code: 'WORKSPACE_PATH_REQUIRED',
            statusCode: 400,
        });
    }
    if (!normalizedGithubUrl) {
        throw new AppError('workspacePath and githubUrl are required', {
            code: 'GITHUB_URL_REQUIRED',
            statusCode: 400,
        });
    }
    if (normalizedGithubUrl.startsWith('-')) {
        throw new AppError('Invalid githubUrl', {
            code: 'INVALID_GITHUB_URL',
            statusCode: 400,
        });
    }
    const pathValidation = await dependencies.validatePath(normalizedWorkspacePath);
    if (!pathValidation.valid || !pathValidation.resolvedPath) {
        throw new AppError(pathValidation.error || 'Invalid workspace path', {
            code: 'INVALID_PROJECT_PATH',
            statusCode: 400,
        });
    }
    const absolutePath = pathValidation.resolvedPath;
    await dependencies.ensureDirectory(absolutePath);
    let githubToken = null;
    if (typeof input.githubTokenId === 'number') {
        const numericUserId = typeof input.userId === 'number' ? input.userId : Number.parseInt(String(input.userId), 10);
        if (Number.isNaN(numericUserId)) {
            throw new AppError('Authenticated user is required', {
                code: 'AUTHENTICATION_REQUIRED',
                statusCode: 401,
            });
        }
        const token = await dependencies.getGithubTokenById(input.githubTokenId, numericUserId);
        if (!token) {
            throw new AppError('GitHub token not found', {
                code: 'GITHUB_TOKEN_NOT_FOUND',
                statusCode: 404,
            });
        }
        githubToken = token.github_token;
    }
    else if (input.newGithubToken && input.newGithubToken.trim().length > 0) {
        githubToken = input.newGithubToken.trim();
    }
    const sanitizedGithubUrl = normalizedGithubUrl.replace(/\/+$/, '').replace(/\.git$/, '');
    const repoName = sanitizedGithubUrl.split('/').pop() || 'repository';
    const clonePath = path.join(absolutePath, repoName);
    if (await dependencies.pathExists(clonePath)) {
        throw new AppError(`Directory "${repoName}" already exists. Please choose a different location or remove the existing directory.`, {
            code: 'CLONE_TARGET_ALREADY_EXISTS',
            statusCode: 409,
        });
    }
    let cloneUrl = normalizedGithubUrl;
    if (githubToken) {
        try {
            const url = new URL(normalizedGithubUrl);
            url.username = githubToken;
            url.password = '';
            cloneUrl = url.toString();
        }
        catch {
            // SSH URLs cannot be represented by URL constructor and are used as-is.
        }
    }
    handlers.onProgress(`Cloning into '${repoName}'...`);
    const gitProcess = dependencies.spawnGitClone(cloneUrl, clonePath);
    let lastError = '';
    gitProcess.stdout?.on('data', (data) => {
        const message = data.toString().trim();
        if (message) {
            handlers.onProgress(message);
        }
    });
    gitProcess.stderr?.on('data', (data) => {
        const message = data.toString().trim();
        lastError = message;
        if (message) {
            handlers.onProgress(message);
        }
    });
    const waitForCompletion = new Promise((resolve, reject) => {
        gitProcess.on('close', async (code) => {
            if (code === 0) {
                try {
                    const createdProject = await dependencies.registerProject(clonePath, repoName);
                    handlers.onComplete({
                        project: createdProject.project,
                        message: 'Repository cloned successfully',
                    });
                    resolve();
                }
                catch (error) {
                    reject(new AppError(`Clone succeeded but failed to add project: ${resolveErrorMessage(error)}`, {
                        code: 'CLONE_PROJECT_REGISTRATION_FAILED',
                        statusCode: 500,
                    }));
                }
                return;
            }
            const sanitizedError = sanitizeGitError(lastError, githubToken);
            const errorMessage = resolveCloneFailureMessage(lastError, sanitizedError);
            try {
                await dependencies.removePath(clonePath);
            }
            catch (cleanupError) {
                dependencies.logError('Failed to clean up after clone failure:', cleanupError);
            }
            reject(new AppError(errorMessage, {
                code: 'GIT_CLONE_FAILED',
                statusCode: 500,
            }));
        });
        gitProcess.on('error', (error) => {
            if (error.code === 'ENOENT') {
                reject(new AppError('Git is not installed or not in PATH', {
                    code: 'GIT_NOT_FOUND',
                    statusCode: 500,
                }));
                return;
            }
            reject(new AppError(error.message, {
                code: 'GIT_EXECUTION_FAILED',
                statusCode: 500,
            }));
        });
    });
    return {
        waitForCompletion,
        cancel: () => {
            gitProcess.kill();
        },
    };
}
//# sourceMappingURL=project-clone.service.js.map