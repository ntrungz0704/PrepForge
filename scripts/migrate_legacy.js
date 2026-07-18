import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);

const manifestPath = path.join(rootDir, 'data', 'manifests', 'import-manifest.json');
const dbPath = path.join(rootDir, 'data', 'db.json');

function calculateSha256(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

function calculateFingerprint(passage, stem, choices) {
  const normPassage = (passage || '').toLowerCase().replace(/\s+/g, '');
  const normStem = (stem || '').toLowerCase().replace(/\s+/g, '');
  const normChoices = (choices || [])
    .map(c => `${c.label}:${c.text.toLowerCase().replace(/\s+/g, '')}`)
    .sort()
    .join('|');
  const combined = `${normPassage}||${normStem}||${normChoices}`;
  return crypto.createHash('sha256').update(combined).digest('hex');
}

function migrate() {
  console.log('Starting PrepForge legacy data migration...');
  
  if (!fs.existsSync(manifestPath)) {
    console.error('No manifest found at:', manifestPath);
    return;
  }
  
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  let db = { questions: [], attempts: [], annotations: {} };
  
  if (fs.existsSync(dbPath)) {
    db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  }
  
  // 1. Calculate SHA-256 for all PDF files in manifest
  console.log('Calculating SHA-256 for all files in manifest...');
  const shaMap = new Map(); // sha10prefix -> fileInfo
  const fileHashMap = new Map(); // absolute path -> hash
  
  let totalFiles = 0;
  
  for (const folder of manifest.folders) {
    const folderId = folder.folderId;
    for (const file of folder.files) {
      const absPath = path.join(rootDir, file.relativePath);
      if (fs.existsSync(absPath)) {
        const hash = calculateSha256(absPath);
        if (hash) {
          file.sha256 = hash;
          const prefix10 = hash.substring(0, 10);
          shaMap.set(prefix10, {
            folder,
            file,
            sha256: hash
          });
          fileHashMap.set(absPath, hash);
          totalFiles++;
        }
      }
    }
  }
  
  console.log(`Calculated hashes for ${totalFiles} files.`);

  // 2. Map questions in db.json to files, add fingerprints, and sync manifest statuses
  console.log('Mapping questions in db.json to manifest and updating file statuses...');
  let migratedQuestionsCount = 0;
  let fileApprovedCount = 0;
  
  if (db.questions && db.questions.length > 0) {
    db.questions = db.questions.map(q => {
      // Find matching SHA-256 by questionId prefix (q-xxxxxxxxxx)
      const qPrefix = q.questionId.startsWith('q-') ? q.questionId.substring(2) : q.questionId;
      const match = shaMap.get(qPrefix);
      
      const fingerprint = calculateFingerprint(q.passage, q.questionStem, q.choices);
      
      const updatedQuestion = {
        ...q,
        fingerprint,
        reviewStatus: q.reviewStatus || 'approved'
      };
      
      if (match) {
        updatedQuestion.folderId = match.folder.folderId;
        updatedQuestion.sourceFileId = `file-${match.sha256}`;
        
        // Update manifest file status to approved since it exists in db.json
        if (match.file.status !== 'approved') {
          match.file.status = 'approved';
          fileApprovedCount++;
        }
        migratedQuestionsCount++;
      } else {
        // Legacy mapping fallback
        updatedQuestion.folderId = q.skill.toLowerCase().replace(/\s+/g, '-');
        updatedQuestion.sourceFileId = 'legacy_needs_mapping';
      }
      
      return updatedQuestion;
    });
  }
  
  // 3. Let's check for normalized JSON files that are not approved yet, and make sure their status is 'normalized'
  let normalizedCount = 0;
  for (const folder of manifest.folders) {
    const folderId = folder.folderId;
    for (const file of folder.files) {
      if (file.status === 'approved') continue;
      
      // Check if normalized JSON exists on disk
      const jsonName = file.fileName.replace('.pdf', '.normalized.json');
      const normalizedPath = path.join(rootDir, 'data', 'normalized', folderId, jsonName);
      if (fs.existsSync(normalizedPath)) {
        file.status = 'normalized';
        normalizedCount++;
      }
    }
  }
  
  // Save updated files
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');
  
  console.log(`Successfully migrated ${migratedQuestionsCount} questions in db.json.`);
  console.log(`Marked ${fileApprovedCount} files as 'approved' in manifest.`);
  console.log(`Marked ${normalizedCount} files as 'normalized' in manifest.`);
  console.log('Migration completed successfully.');
}

migrate();
