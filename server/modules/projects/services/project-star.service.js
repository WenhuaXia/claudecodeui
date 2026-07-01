import { projectsDb } from '../../../modules/database/index.js';
import { AppError } from '../../../shared/utils.js';
function normalizeProjectId(projectId) {
    return projectId.trim();
}
function uniqueProjectIds(projectIds) {
    const uniqueIds = new Set();
    for (const projectId of projectIds) {
        const normalizedProjectId = normalizeProjectId(projectId);
        if (!normalizedProjectId) {
            continue;
        }
        uniqueIds.add(normalizedProjectId);
    }
    return [...uniqueIds];
}
/**
 * Applies legacy `localStorage` stars keyed by DB `projectId` onto `projects.isStarred`.
 *
 * The operation is idempotent: already-starred projects are ignored, unknown ids are skipped.
 */
export function applyLegacyStarredProjectIds(projectIds) {
    const normalizedProjectIds = uniqueProjectIds(projectIds);
    let updated = 0;
    for (const projectId of normalizedProjectIds) {
        const project = projectsDb.getProjectById(projectId);
        if (!project) {
            continue;
        }
        if (Boolean(project.isStarred)) {
            continue;
        }
        projectsDb.updateProjectIsStarredById(projectId, true);
        updated += 1;
    }
    return { updated };
}
/**
 * Flips `projects.isStarred` for one project and returns the new state.
 */
export function toggleProjectStar(projectId) {
    const normalizedProjectId = normalizeProjectId(projectId);
    if (!normalizedProjectId) {
        throw new AppError('projectId is required', {
            code: 'PROJECT_ID_REQUIRED',
            statusCode: 400,
        });
    }
    const project = projectsDb.getProjectById(normalizedProjectId);
    if (!project) {
        throw new AppError('Project not found', {
            code: 'PROJECT_NOT_FOUND',
            statusCode: 404,
        });
    }
    const nextStarredState = !Boolean(project.isStarred);
    projectsDb.updateProjectIsStarredById(normalizedProjectId, nextStarredState);
    return { isStarred: nextStarredState };
}
//# sourceMappingURL=project-star.service.js.map