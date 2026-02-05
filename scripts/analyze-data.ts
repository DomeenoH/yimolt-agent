import fs from 'node:fs';
import path from 'node:path';

const DATA_FILE = path.join(process.cwd(), 'data', 'activity-log.json');
const logData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));

let total = 0;
let hasContent = 0;
let hasIdInLog = 0;
let titleOnly = 0;

console.log('--- Analyzing Activity Log ---');

for (const run of logData.runs) {
    if (!run.activities) continue;
    for (const activity of run.activities) {
        if (activity.action === 'CREATE_POST') {
            const details = activity.details || {};
            total++;
            
            if (details.postContent && details.postContent !== details.postTitle) {
                hasContent++;
            } else {
                titleOnly++;
            }

            if (details.postId) {
                hasIdInLog++;
            }
        }
    }
}

console.log(`Total CREATE_POST actions: ${total}`);
console.log(`With potentially valid content: ${hasContent}`);
console.log(`Title only / Content missing: ${titleOnly}`);
console.log(`With IDs directly in log: ${hasIdInLog}`);

console.log('\n--- Analyzing Archive (if exists) ---');
const ARCHIVE_FILE = path.join(process.cwd(), 'data', 'posts-archive.json');
if (fs.existsSync(ARCHIVE_FILE)) {
    const archive = JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf-8'));
    const posts = Object.values(archive);
    const localIds = posts.filter((p: any) => p.id.startsWith('local-')).length;
    const realIds = posts.length - localIds;
    const withComments = posts.filter((p: any) => p.comments && p.comments.length > 0).length;

    console.log(`Total Archived Posts: ${posts.length}`);
    console.log(`Real IDs (Synced): ${realIds}`);
    console.log(`Local IDs (Offline): ${localIds}`);
    console.log(`Posts with Comments: ${withComments}`);
}
