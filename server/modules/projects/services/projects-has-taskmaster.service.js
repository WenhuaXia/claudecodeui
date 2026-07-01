import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { projectsDb } from '../../../modules/database/index.js';
import { AppError } from '../../../shared/utils.js';
function extractTasksFromJson(tasksData) {
    if (!tasksData || typeof tasksData !== 'object') {
        return [];
    }
    const legacyTasks = tasksData.tasks;
    if (Array.isArray(legacyTasks)) {
        return legacyTasks;
    }
    const taggedTaskCollections = [];
    for (const tagValue of Object.values(tasksData)) {
        if (!tagValue || typeof tagValue !== 'object') {
            continue;
        }
        const tagTasks = tagValue.tasks;
        if (Array.isArray(tagTasks)) {
            taggedTaskCollections.push(...tagTasks);
        }
    }
    return taggedTaskCollections;
}
async function detectTaskMasterFolder(projectPath) {
    try {
        const taskMasterPath = path.join(projectPath, '.taskmaster');
        try {
            const taskMasterStats = await stat(taskMasterPath);
            if (!taskMasterStats.isDirectory()) {
                return {
                    hasTaskmaster: false,
                    reason: '.taskmaster exists but is not a directory',
                };
            }
        }
        catch (error) {
            const fileError = error;
            if (fileError.code === 'ENOENT') {
                return {
                    hasTaskmaster: false,
                    reason: '.taskmaster directory not found',
                };
            }
            throw fileError;
        }
        const keyFiles = ['tasks/tasks.json', 'config.json'];
        const fileStatus = {};
        let hasEssentialFiles = true;
        for (const fileName of keyFiles) {
            const absoluteFilePath = path.join(taskMasterPath, fileName);
            try {
                await access(absoluteFilePath);
                fileStatus[fileName] = true;
            }
            catch {
                fileStatus[fileName] = false;
                if (fileName === 'tasks/tasks.json') {
                    hasEssentialFiles = false;
                }
            }
        }
        let taskMetadata = null;
        if (fileStatus['tasks/tasks.json']) {
            const tasksPath = path.join(taskMasterPath, 'tasks/tasks.json');
            try {
                const tasksContent = await readFile(tasksPath, 'utf8');
                const parsedTasksJson = JSON.parse(tasksContent);
                const tasks = extractTasksFromJson(parsedTasksJson);
                const stats = tasks.reduce((accumulator, currentTask) => {
                    accumulator.total += 1;
                    const normalizedTaskStatus = currentTask.status || 'pending';
                    accumulator.byStatus[normalizedTaskStatus] = (accumulator.byStatus[normalizedTaskStatus] || 0) + 1;
                    if (Array.isArray(currentTask.subtasks)) {
                        for (const subtask of currentTask.subtasks) {
                            accumulator.subtotalTasks += 1;
                            const normalizedSubtaskStatus = subtask.status || 'pending';
                            accumulator.subtaskByStatus[normalizedSubtaskStatus] =
                                (accumulator.subtaskByStatus[normalizedSubtaskStatus] || 0) + 1;
                        }
                    }
                    return accumulator;
                }, {
                    total: 0,
                    subtotalTasks: 0,
                    byStatus: {},
                    subtaskByStatus: {},
                });
                const tasksStat = await stat(tasksPath);
                taskMetadata = {
                    taskCount: stats.total,
                    subtaskCount: stats.subtotalTasks,
                    completed: stats.byStatus.done || 0,
                    pending: stats.byStatus.pending || 0,
                    inProgress: stats.byStatus['in-progress'] || 0,
                    review: stats.byStatus.review || 0,
                    completionPercentage: stats.total > 0 ? Math.round(((stats.byStatus.done || 0) / stats.total) * 100) : 0,
                    lastModified: tasksStat.mtime.toISOString(),
                };
            }
            catch (parseError) {
                console.warn('Failed to parse tasks.json:', parseError.message);
                taskMetadata = {
                    error: 'Failed to parse tasks.json',
                };
            }
        }
        return {
            hasTaskmaster: true,
            hasEssentialFiles,
            files: fileStatus,
            metadata: taskMetadata,
            path: taskMasterPath,
        };
    }
    catch (error) {
        console.error('Error detecting TaskMaster folder:', error);
        return {
            hasTaskmaster: false,
            reason: `Error checking directory: ${error.message}`,
        };
    }
}
function normalizeTaskMasterInfo(taskMasterResult = null) {
    const hasTaskmaster = Boolean(taskMasterResult?.hasTaskmaster);
    const hasEssentialFiles = Boolean(taskMasterResult?.hasEssentialFiles);
    return {
        hasTaskmaster,
        hasEssentialFiles,
        metadata: taskMasterResult?.metadata ?? null,
        status: hasTaskmaster && hasEssentialFiles ? 'configured' : 'not-configured',
    };
}
const defaultDependencies = {
    resolveProjectPathById: (projectId) => projectsDb.getProjectPathById(projectId),
    detectTaskMasterFolder,
};
export async function getProjectTaskMasterById(projectId, dependencies = defaultDependencies) {
    const projectPath = dependencies.resolveProjectPathById(projectId);
    if (!projectPath) {
        return null;
    }
    const taskMasterResult = await dependencies.detectTaskMasterFolder(projectPath);
    return {
        projectId,
        projectPath,
        taskmaster: normalizeTaskMasterInfo(taskMasterResult),
    };
}
export async function getProjectTaskMaster(projectId, resolveById = getProjectTaskMasterById) {
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) {
        throw new AppError('projectId is required', {
            code: 'PROJECT_ID_REQUIRED',
            statusCode: 400,
        });
    }
    const taskMasterDetails = await resolveById(normalizedProjectId);
    if (!taskMasterDetails) {
        throw new AppError('Project not found', {
            code: 'PROJECT_NOT_FOUND',
            statusCode: 404,
        });
    }
    return taskMasterDetails;
}
//# sourceMappingURL=projects-has-taskmaster.service.js.map