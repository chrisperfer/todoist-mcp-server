import { TodoistApi } from '@doist/todoist-api-typescript';
import fs from 'fs';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, '..', '..', 'config', 'todoist.json');

export async function getApi() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return new TodoistApi(config.apiToken);
  } catch (error) {
    console.error('Error initializing Todoist API:', error.message);
    process.exit(1);
  }
} 