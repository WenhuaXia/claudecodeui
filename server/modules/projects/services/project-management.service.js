import fs from 'node:fs/promises';
import path from 'node:path';
import { projectsDb } from '../../../modules/database/index.js';
import { AppError, normalizeProjectPath, validateWorkspacePath } from '../../../shared/utils.js';
const defaultDependencies = {
    validatePath: validateWorkspacePath,
    ensureWorkspaceDirectory: async (projectPath) => {
        await fs.mkdir(projectPath, { recursive: true });
        const directoryStats = await fs.stat(projectPath);
        if (!directoryStats.isDirectory()) {
            throw new AppError('Path exists but is not a directory', {
                code: 'PROJECT_PATH_NOT_DIRECTORY',
                statusCode: 400,
            });
        }
    },
    persistProjectPath: (projectPath, customName) => projectsDb.createProjectPath(projectPath, customName),
    getProjectByPath: (projectPath) => projectsDb.getProjectPath(projectPath),
};
function resolveDisplayName(customName, projectPath) {
    const trimmedCustomName = typeof customName === 'string' ? customName.trim() : '';
    if (trimmedCustomName.length > 0) {
        return trimmedCustomName;
    }
    return path.basename(projectPath) || projectPath;
}
function mapProjectRowToApiView(projectRow) {
    return {
        projectId: projectRow.project_id,
        path: projectRow.project_path,
        fullPath: projectRow.project_path,
        displayName: resolveDisplayName(projectRow.custom_project_name, projectRow.project_path),
        customName: projectRow.custom_project_name,
        isArchived: Boolean(projectRow.isArchived),
        isStarred: Boolean(projectRow.isStarred),
        sessions: [],
        sessionMeta: {
            hasMore: false,
            total: 0,
        },
    };
}
export async function createProject(input, dependencies = defaultDependencies) {
    const normalizedPath = normalizeProjectPath(input.projectPath || '');
    if (!normalizedPath) {
        throw new AppError('path is required', {
            code: 'PROJECT_PATH_REQUIRED',
            statusCode: 400,
        });
    }
    const pathValidation = await dependencies.validatePath(normalizedPath);
    if (!pathValidation.valid || !pathValidation.resolvedPath) {
        throw new AppError('Invalid project path', {
            code: 'INVALID_PROJECT_PATH',
            statusCode: 400,
            details: pathValidation.error ?? 'Path validation failed',
        });
    }
    const resolvedProjectPath = normalizeProjectPath(pathValidation.resolvedPath);
    await dependencies.ensureWorkspaceDirectory(resolvedProjectPath);
    const normalizedCustomName = resolveDisplayName(input.customName ?? null, resolvedProjectPath);
    const persistedProject = dependencies.persistProjectPath(resolvedProjectPath, normalizedCustomName);
    if (persistedProject.outcome === 'active_conflict') {
        throw new AppError('Project path already exists and is active', {
            code: 'PROJECT_ALREADY_EXISTS',
            statusCode: 409,
            details: `Project path already exists: ${resolvedProjectPath}`,
        });
    }
    const projectRow = persistedProject.project ?? dependencies.getProjectByPath(resolvedProjectPath);
    if (!projectRow) {
        throw new AppError('Failed to resolve project after creation', {
            code: 'PROJECT_CREATE_FAILED',
            statusCode: 500,
        });
    }
    // Archived rows intentionally remain archived when reused, as requested.
    return {
        outcome: persistedProject.outcome,
        project: mapProjectRowToApiView(projectRow),
    };
}
/**
 * Sets `projects.custom_project_name` for the given `projectId` (or clears it when empty).
 */
export function updateProjectDisplayName(projectId, newDisplayName) {
    const trimmed = typeof newDisplayName === 'string' ? newDisplayName.trim() : '';
    projectsDb.updateCustomProjectNameById(projectId, trimmed.length > 0 ? trimmed : null);
}
//# sourceMappingURL=project-management.service.js.map