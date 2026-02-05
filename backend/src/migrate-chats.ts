#!/usr/bin/env node

import db from './db.js';
import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const chatsDir = join(__dirname, '..', 'data', 'chats');

interface ChatRecord {
  id: string;
  folder: string;
  session_id: string;
  session_log_path: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
}

async function migrateChatsToFiles() {
  console.log('Starting chats migration from database to JSON files...');

  try {
    // Get all chats that have session IDs
    const chats: ChatRecord[] = db.prepare(`
      SELECT * FROM chats
      WHERE session_id IS NOT NULL
      ORDER BY created_at ASC
    `).all() as ChatRecord[];

    console.log(`Found ${chats.length} chats with session IDs to migrate`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const chat of chats) {
      const filename = `${chat.session_id}.json`;
      const filepath = join(chatsDir, filename);

      // Check if file already exists
      if (existsSync(filepath)) {
        console.log(`Skipping ${chat.session_id} - file already exists`);
        skippedCount++;
        continue;
      }

      // Write chat to JSON file
      writeFileSync(filepath, JSON.stringify(chat, null, 2));
      migratedCount++;

      console.log(`Migrated chat ${chat.id} -> ${chat.session_id}.json (folder: ${chat.folder})`);
    }

    console.log(`Migration completed!`);
    console.log(`- Migrated: ${migratedCount} chats`);
    console.log(`- Skipped: ${skippedCount} chats (files already exist)`);
    console.log(`- Ignored: ${await getChatsWithoutSessionId()} chats without session IDs`);

    // Show what's in the chats directory now
    console.log(`\nFiles in chats directory (${chatsDir}):`);
    const { readdirSync } = await import('fs');
    const files = readdirSync(chatsDir).filter(f => f.endsWith('.json'));
    files.forEach(file => console.log(`  ${file}`));

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

async function getChatsWithoutSessionId(): Promise<number> {
  try {
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM chats WHERE session_id IS NULL
    `).get() as { count: number };
    return result.count;
  } catch (error) {
    return 0;
  }
}

// Run migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateChatsToFiles();
}

export { migrateChatsToFiles };