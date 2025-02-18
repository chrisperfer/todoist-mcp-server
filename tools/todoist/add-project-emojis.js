#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import url from 'url';

// Emoji mapping categories
const EMOJI_MAPPINGS = {
    // Work & Productivity
    work: ['💼', 'office', 'work', 'business', 'job', 'career', 'professional'],
    meetings: ['🤝', 'meeting', 'sync', 'catchup', 'discussion'],
    planning: ['📋', 'plan', 'strategy', 'roadmap', 'timeline'],
    deadlines: ['⏰', 'deadline', 'due', 'urgent'],
    writing: ['✍️', 'write', 'blog', 'article', 'document'],
    ideas: ['💡', 'idea', 'brainstorm', 'concept', 'innovation'],
    
    // Personal Development
    learning: ['📚', 'learn', 'study', 'course', 'education', 'training', 'book'],
    health: ['🏥', 'health', 'medical', 'doctor', 'wellness', 'fitness'],
    exercise: ['🏃', 'exercise', 'workout', 'gym', 'training', 'run'],
    
    // Home & Life
    home: ['🏠', 'home', 'house', 'apartment', 'living'],
    shopping: ['🛒', 'shop', 'buy', 'purchase', 'store'],
    finance: ['💰', 'money', 'finance', 'budget', 'invest'],
    food: ['🍽️', 'food', 'meal', 'cook', 'recipe', 'restaurant'],
    travel: ['✈️', 'travel', 'trip', 'vacation', 'journey'],
    
    // Technology
    tech: ['💻', 'tech', 'computer', 'software', 'hardware', 'digital'],
    coding: ['👨‍💻', 'code', 'programming', 'development', 'software'],
    research: ['🔍', 'research', 'investigate', 'analysis', 'study'],
    
    // Personal
    family: ['👨‍👩‍👧‍👦', 'family', 'kids', 'parents', 'relatives'],
    social: ['👥', 'social', 'friends', 'network', 'community'],
    entertainment: ['🎮', 'game', 'entertainment', 'fun', 'hobby'],
    music: ['🎵', 'music', 'song', 'playlist', 'concert'],
    art: ['🎨', 'art', 'creative', 'design', 'draw'],
    
    // Project Management
    projects: ['📊', 'project', 'initiative', 'program'],
    tasks: ['✅', 'task', 'todo', 'checklist'],
    inbox: ['📥', 'inbox', 'incoming', 'triage'],
    archive: ['📦', 'archive', 'storage', 'old'],
    
    // Default
    default: ['📌']
};

function findBestEmoji(projectName) {
    const nameLower = projectName.toLowerCase();
    
    // First, check if project already has an emoji
    if (/^[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/u.test(projectName)) {
        return projectName;
    }
    
    // Find the best matching category
    let bestMatch = null;
    let maxMatches = 0;
    
    for (const [category, [emoji, ...keywords]] of Object.entries(EMOJI_MAPPINGS)) {
        const matches = keywords.filter(keyword => nameLower.includes(keyword)).length;
        if (matches > maxMatches) {
            maxMatches = matches;
            bestMatch = emoji;
        }
    }
    
    return bestMatch || EMOJI_MAPPINGS.default[0];
}

async function updateProjectEmojis() {
    try {
        const token = process.env.TODOIST_API_TOKEN;
        if (!token) {
            console.error("Error: TODOIST_API_TOKEN environment variable is required");
            process.exit(1);
        }
        
        const api = new TodoistApi(token);

        try {
            // Get all projects
            const projects = await api.getProjects();
            console.log(`Found ${projects.length} projects to process...`);
            
            for (const project of projects) {
                const currentName = project.name;
                const emoji = findBestEmoji(currentName);
                
                // Skip if project already starts with this emoji
                if (currentName.startsWith(emoji)) {
                    console.log(`Skipping "${currentName}" (already has appropriate emoji)`);
                    continue;
                }
                
                // Remove any existing emoji and add new one
                const nameWithoutEmoji = currentName.replace(/^[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]\s*/u, '').trim();
                const newName = `${emoji} ${nameWithoutEmoji}`;
                
                try {
                    await api.updateProject(project.id, { name: newName });
                    console.log(`Updated "${currentName}" → "${newName}"`);
                } catch (updateError) {
                    console.error(`Failed to update "${currentName}":`, updateError.message);
                }
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 250));
            }
            
            console.log('\nProject emoji update complete! 🎉');
            
        } catch (apiError) {
            console.error("API Error:", apiError.message);
            process.exit(1);
        }
    } catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    updateProjectEmojis();
}

export { updateProjectEmojis }; 