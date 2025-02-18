#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';

export async function searchTasks(api, query, options = {}) {
    const tasks = await api.getTasks();
    const matches = tasks.filter(t => {
        const contentMatch = t.content.toLowerCase().includes(query.toLowerCase());
        if (options.exactMatch) {
            return t.content.toLowerCase() === query.toLowerCase();
        }
        return contentMatch;
    });

    return matches.map(t => ({
        id: t.id,
        content: t.content,
        projectId: t.projectId,
        sectionId: t.sectionId,
        parentId: t.parentId,
        url: t.url
    }));
}

export async function searchProjects(api, query, options = {}) {
    const projects = await api.getProjects();
    const matches = projects.filter(p => {
        const nameMatch = p.name.toLowerCase().includes(query.toLowerCase());
        if (options.exactMatch) {
            return p.name.toLowerCase() === query.toLowerCase();
        }
        return nameMatch;
    });

    return matches.map(p => ({
        id: p.id,
        name: p.name,
        parentId: p.parentId,
        url: p.url
    }));
}

export async function searchSections(api, query, options = {}) {
    const sections = await api.getSections();
    const matches = sections.filter(s => {
        const nameMatch = s.name.toLowerCase().includes(query.toLowerCase());
        if (options.exactMatch) {
            return s.name.toLowerCase() === query.toLowerCase();
        }
        return nameMatch;
    });

    return matches.map(s => ({
        id: s.id,
        name: s.name,
        projectId: s.projectId
    }));
}

export async function getFullProjectPath(api, projectId) {
    const projects = await api.getProjects();
    const projectMap = new Map(projects.map(p => [p.id, p]));
    const project = projectMap.get(projectId);
    
    if (!project) return null;

    const path = [project.name];
    let current = project;
    
    while (current.parentId) {
        const parent = projectMap.get(current.parentId);
        if (!parent) break;
        path.unshift(parent.name);
        current = parent;
    }
    
    return {
        path: path.join(' » '),
        segments: path,
        ids: path.map(name => {
            const proj = projects.find(p => p.name === name);
            return proj ? proj.id : null;
        })
    };
}

export async function resolveTaskId(api, idOrQuery) {
    // First try to parse as ID
    const numericId = parseInt(idOrQuery);
    if (!isNaN(numericId)) {
        const task = (await api.getTasks()).find(t => t.id === numericId.toString());
        if (task) return task.id;
    }

    // If not found or not numeric, search by content
    const matches = await searchTasks(api, idOrQuery, { exactMatch: true });
    if (matches.length === 1) {
        return matches[0].id;
    } else if (matches.length > 1) {
        console.error('Multiple matching tasks found:');
        matches.forEach(t => console.error(`  ${t.id}: ${t.content}`));
        throw new Error('Please specify task by ID to avoid ambiguity');
    }

    throw new Error(`Task not found: ${idOrQuery}`);
}

export async function resolveProjectId(api, idOrQuery) {
    const projects = await api.getProjects();

    // First try to parse as ID
    const numericId = parseInt(idOrQuery);
    if (!isNaN(numericId)) {
        const project = projects.find(p => p.id === numericId.toString());
        if (project) return project.id;
    }

    // If not found or not numeric, try to match by path
    const projectMap = new Map(projects.map(p => [p.id, p]));
    const getProjectPath = (project) => {
        const path = [project.name];
        let current = project;
        
        while (current.parentId) {
            const parent = projectMap.get(current.parentId);
            if (!parent) break;
            path.unshift(parent.name);
            current = parent;
        }
        
        return path.join(' » ');
    };

    // Try exact path match first
    const projectByPath = projects.find(p => 
        getProjectPath(p).toLowerCase() === idOrQuery.toLowerCase()
    );
    if (projectByPath) return projectByPath.id;

    // Then try partial path match
    const projectByPartialPath = projects.find(p => 
        getProjectPath(p).toLowerCase().includes(idOrQuery.toLowerCase())
    );
    if (projectByPartialPath) return projectByPartialPath.id;

    // Finally try exact name match
    const matches = await searchProjects(api, idOrQuery, { exactMatch: true });
    if (matches.length === 1) {
        return matches[0].id;
    } else if (matches.length > 1) {
        console.error('Multiple matching projects found:');
        matches.forEach(p => console.error(`  ${p.id}: ${p.name}`));
        throw new Error('Please specify project by ID to avoid ambiguity');
    }

    throw new Error(`Project not found: ${idOrQuery}`);
}

export async function resolveSectionId(api, idOrQuery, projectId = null) {
    // First try to parse as ID
    const numericId = parseInt(idOrQuery);
    if (!isNaN(numericId)) {
        const section = (await api.getSections()).find(s => s.id === numericId);
        if (section && (!projectId || section.projectId === projectId)) return section.id;
    }

    // If not found or not numeric, search by name
    const matches = await searchSections(api, idOrQuery, { exactMatch: true });
    const projectMatches = projectId ? matches.filter(s => s.projectId === projectId) : matches;

    if (projectMatches.length === 1) {
        return projectMatches[0].id;
    } else if (projectMatches.length > 1) {
        console.error('Multiple matching sections found:');
        projectMatches.forEach(s => console.error(`  ${s.id}: ${s.name}`));
        throw new Error('Please specify section by ID to avoid ambiguity');
    }

    throw new Error(`Section not found: ${idOrQuery}`);
}

export function formatTaskList(tasks, showParents = false) {
    return tasks.map(task => {
        let output = `${task.id.toString().padEnd(12)} ${task.content}`;
        if (showParents && task.parentId) {
            output += `\n${' '.repeat(12)} ↳ Parent: ${task.parentId}`;
        }
        if (task.projectId) {
            output += `\n${' '.repeat(12)} ↳ Project: ${task.projectId}`;
        }
        if (task.sectionId) {
            output += `\n${' '.repeat(12)} ↳ Section: ${task.sectionId}`;
        }
        return output;
    }).join('\n\n');
}

export function formatProjectList(projects, showPaths = false) {
    return projects.map(project => {
        let output = `${project.id.toString().padEnd(12)} ${project.name}`;
        if (showPaths && project.parentId) {
            output += `\n${' '.repeat(12)} ↳ Parent: ${project.parentId}`;
        }
        return output;
    }).join('\n\n');
}

export function formatSectionList(sections) {
    return sections.map(section => 
        `${section.id.toString().padEnd(12)} ${section.name}\n${' '.repeat(12)} ↳ Project: ${section.projectId}`
    ).join('\n\n');
} 