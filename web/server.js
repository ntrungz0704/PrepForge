import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname); // D:\PrepForge

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const dbPath = path.join(rootDir, 'data', 'db.json');
const manifestPath = path.join(rootDir, 'data', 'manifests', 'import-manifest.json');

// Ensure db.json exists
function initDb() {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({
      questions: [],
      attempts: [],
      annotations: {} // questionId -> list of highlights/notes
    }, null, 2), 'utf-8');
  }
}

initDb();

function readDb() {
  initDb();
  const data = fs.readFileSync(dbPath, 'utf-8');
  return JSON.parse(data);
}

function writeDb(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
}

// GET manifest
app.get('/api/manifest', (req, res) => {
  if (!fs.existsSync(manifestPath)) {
    return res.status(404).json({ error: 'Manifest not found. Run inventory scan first.' });
  }
  try {
    const data = fs.readFileSync(manifestPath, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET normalized question file
app.get('/api/normalized/:folder/:filename', (req, res) => {
  const { folder, filename } = req.params;
  const filePath = path.join(rootDir, 'data', 'normalized', folder, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Normalized file not found.' });
  }
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET extracted text file
app.get('/api/extracted/:folder/:filename', (req, res) => {
  const { folder, filename } = req.params;
  const filePath = path.join(rootDir, 'data', 'extracted', folder, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Extracted file not found.' });
  }
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST approve question
app.post('/api/approve', (req, res) => {
  const { relativePath, question } = req.body;
  if (!relativePath || !question) {
    return res.status(400).json({ error: 'Missing relativePath or question data.' });
  }

  try {
    // 1. Save to db.json questions list
    const db = readDb();
    
    // Check if question exists (by SHA256 or ID)
    const existingIndex = db.questions.findIndex(q => q.questionId === question.questionId);
    if (existingIndex > -1) {
      db.questions[existingIndex] = { ...question, approvedAt: new Date().toISOString() };
    } else {
      db.questions.push({ ...question, approvedAt: new Date().toISOString() });
    }
    
    writeDb(db);

    // 2. Update status in manifest.json to 'approved'
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      let updated = false;
      for (const folder of manifest.folders) {
        const file = folder.files.find(f => f.relativePath === relativePath);
        if (file) {
          file.status = 'approved';
          updated = true;
          break;
        }
      }
      if (updated) {
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
      }
    }

    res.json({ success: true, question });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST approve all normalized questions
app.post('/api/approve-all', (req, res) => {
  try {
    if (!fs.existsSync(manifestPath)) {
      return res.status(400).json({ error: 'Manifest not found.' });
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const db = readDb();
    let approvedCount = 0;

    for (const folder of manifest.folders) {
      const folderId = folder.folderId;
      for (const file of folder.files) {
        if (file.status === 'normalized') {
          // Read corresponding normalized json
          const jsonName = file.fileName.replace('.pdf', '.normalized.json');
          const jsonPath = path.join(rootDir, 'data', 'normalized', folderId, jsonName);
          
          if (fs.existsSync(jsonPath)) {
            const normalizedData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            if (normalizedData.questions && normalizedData.questions.length > 0) {
              const q = normalizedData.questions[0];
              const questionData = {
                questionId: q.questionId || `q-${file.sha256.substring(0, 10)}`,
                passage: q.passage || '',
                questionStem: q.questionStem || '',
                choices: q.choices || [
                  { label: 'A', text: '' },
                  { label: 'B', text: '' },
                  { label: 'C', text: '' },
                  { label: 'D', text: '' }
                ],
                correctAnswer: q.correctAnswer || '',
                explanation: q.explanation || {
                  correctReason: '',
                  choiceReasons: { A: '', B: '', C: '', D: '' }
                },
                skill: normalizedData.classification?.detectedSkill || folder.suggestedSkill || 'General'
              };

              // Add/update to database questions list
              const existingIndex = db.questions.findIndex(eq => eq.questionId === questionData.questionId);
              if (existingIndex > -1) {
                db.questions[existingIndex] = { ...questionData, approvedAt: new Date().toISOString() };
              } else {
                db.questions.push({ ...questionData, approvedAt: new Date().toISOString() });
              }

              // Update status in manifest
              file.status = 'approved';
              approvedCount++;
            }
          }
        }
      }
    }

    if (approvedCount > 0) {
      writeDb(db);
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    }

    res.json({ success: true, approvedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all approved questions
app.get('/api/questions', (req, res) => {
  try {
    const db = readDb();
    res.json(db.questions || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST save practice attempt
app.post('/api/attempts', (req, res) => {
  const attempt = req.body;
  try {
    const db = readDb();
    db.attempts.push({
      ...attempt,
      id: `attempt-${Date.now()}`,
      createdAt: new Date().toISOString()
    });
    writeDb(db);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET attempts history
app.get('/api/attempts', (req, res) => {
  try {
    const db = readDb();
    res.json(db.attempts || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST save highlights and notes for a question
app.post('/api/annotations/:questionId', (req, res) => {
  const { questionId } = req.params;
  const { highlights } = req.body; // Array of highlights/notes
  try {
    const db = readDb();
    db.annotations[questionId] = highlights;
    writeDb(db);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET highlights and notes for a question
app.get('/api/annotations/:questionId', (req, res) => {
  const { questionId } = req.params;
  try {
    const db = readDb();
    res.json(db.annotations[questionId] || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST trigger scan
app.post('/api/scan', (req, res) => {
  const pythonPath = path.join(rootDir, '.venv', 'Scripts', 'python');
  
  exec(`"${pythonPath}" "${path.join(rootDir, 'scripts', 'inventory.py')}"`, (err, stdout, stderr) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Inventory scan failed', details: stderr });
    }
    
    // Automatically trigger text extraction
    exec(`"${pythonPath}" "${path.join(rootDir, 'scripts', 'extract_text.py')}"`, (errEx, stdoutEx, stderrEx) => {
      if (errEx) {
        console.error(errEx);
        return res.status(500).json({ error: 'Extraction failed', details: stderrEx });
      }
      
      res.json({ success: true, message: 'Scan and extraction complete. AI Normalization can be run next.' });
    });
  });
});

// POST import-preview
app.post('/api/import-preview', (req, res) => {
  const { files } = req.body;
  if (!files || !Array.isArray(files)) {
    return res.status(400).json({ error: 'Missing or invalid files array.' });
  }

  try {
    let manifest = { folders: [] };
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    }

    const manifestFiles = manifest.folders.flatMap(f => f.files);
    const manifestHashMap = new Map(manifestFiles.map(f => [f.sha256, f]));
    const manifestPathMap = new Map(manifestFiles.map(f => [f.relativePath, f]));

    const summary = {
      total: files.length,
      newFiles: 0,
      unchangedFiles: 0,
      changedFiles: 0,
      duplicateFiles: 0,
      invalidFiles: 0
    };

    const classifiedFiles = files.map(file => {
      const isPdf = file.fileName.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        summary.invalidFiles++;
        return { ...file, decision: 'INVALID' };
      }

      const existingByHash = manifestHashMap.get(file.sha256);
      const targetRelPath = `data/uploads/${file.relativePath}`;
      const existingByPath = manifestPathMap.get(targetRelPath) || manifestPathMap.get(file.relativePath);

      let decision = 'NEW';
      if (existingByHash && (existingByHash.status === 'approved' || existingByHash.status === 'normalized')) {
        decision = 'UNCHANGED';
        summary.unchangedFiles++;
      } else if (existingByPath && existingByPath.sha256 !== file.sha256) {
        decision = 'CHANGED';
        summary.changedFiles++;
      } else if (existingByHash && (existingByHash.relativePath !== file.relativePath && existingByHash.relativePath !== targetRelPath)) {
        decision = 'DUPLICATE';
        summary.duplicateFiles++;
      } else {
        decision = 'NEW';
        summary.newFiles++;
      }

      return { ...file, decision };
    });

    res.json({ summary, files: classifiedFiles });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST upload file (base64)
app.post('/api/upload', (req, res) => {
  const { fileName, relativePath, sha256, fileData } = req.body;
  if (!fileName || !relativePath || !sha256 || !fileData) {
    return res.status(400).json({ error: 'Missing required upload parameters.' });
  }

  try {
    const buffer = Buffer.from(fileData, 'base64');
    
    // Save to private storage data/uploads/
    const targetPath = path.join(rootDir, 'data', 'uploads', relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, buffer);

    // Update manifest
    let manifest = {
      importId: `prepforge-import-${Date.now()}`,
      sourceRoot: path.join(rootDir, 'data', 'uploads').replace(/\\/g, '/'),
      summary: {
        totalFolders: 0,
        totalPdfFiles: 0,
        totalBytes: 0,
        duplicateCount: 0,
        duplicates: []
      },
      folders: []
    };

    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    }

    // Parse folder details from relativePath
    const parts = relativePath.split('/');
    const folderName = parts.length > 1 ? parts[0] : 'General';
    const folderId = folderName.toLowerCase().replace(/\s+/g, '-');
    const suggestedSkill = folderName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    let folder = manifest.folders.find(f => f.folderId === folderId);
    if (!folder) {
      folder = {
        folderId,
        folderName,
        relativePath: `data/uploads/${folderName}`,
        suggestedSkill,
        files: []
      };
      manifest.folders.push(folder);
    }

    const relPathInManifest = `data/uploads/${relativePath}`;
    let fileInfo = folder.files.find(f => f.relativePath === relPathInManifest || f.fileName === fileName);
    
    if (fileInfo) {
      fileInfo.sha256 = sha256;
      fileInfo.sizeBytes = buffer.length;
      fileInfo.status = 'pending'; // Set to pending to trigger extraction
      fileInfo.relativePath = relPathInManifest;
    } else {
      fileInfo = {
        fileName,
        relativePath: relPathInManifest,
        sizeBytes: buffer.length,
        sha256,
        status: 'pending',
        extractedJsonPath: `data/extracted/${folderId}/${fileName.replace('.pdf', '.extracted.json')}`
      };
      folder.files.push(fileInfo);
    }

    // Recalculate manifest summary
    const allFiles = manifest.folders.flatMap(f => f.files);
    manifest.summary.totalPdfFiles = allFiles.length;
    manifest.summary.totalFolders = manifest.folders.length;
    manifest.summary.totalBytes = allFiles.reduce((acc, f) => acc + f.sizeBytes, 0);

    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    res.json({ success: true, relativePath: relPathInManifest });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST trigger AI normalization (async)
app.post('/api/normalize', (req, res) => {
  const pythonPath = path.join(rootDir, '.venv', 'Scripts', 'python');
  
  // Run normalization in background
  const child = exec(`"${pythonPath}" "${path.join(rootDir, 'scripts', 'normalize_ai.py')}"`);
  
  child.stdout.on('data', (data) => console.log('Normalize stdout:', data));
  child.stderr.on('data', (data) => console.error('Normalize stderr:', data));
  
  res.json({ success: true, message: 'AI Normalization started in background.' });
});

app.listen(PORT, () => {
  console.log(`PrepForge local backend running at http://localhost:${PORT}`);
});
