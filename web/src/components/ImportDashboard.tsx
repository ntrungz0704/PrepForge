import React, { useEffect, useState } from 'react';
import { 
  Play, Edit3, Folder, FileText, ChevronRight, ChevronDown, Check, AlertTriangle, CheckSquare,
  UploadCloud, FileUp, FolderPlus, Trash2
} from 'lucide-react';
import type { Question } from '../store/practiceStore';

interface FileInfo {
  fileName: string;
  relativePath: string;
  sizeBytes: number;
  sha256: string;
  status: 'pending' | 'extracted' | 'normalized' | 'approved' | 'failed';
  error?: string;
}

interface FolderInfo {
  folderId: string;
  folderName: string;
  relativePath: string;
  suggestedSkill: string;
  files: FileInfo[];
}

interface Manifest {
  importId: string;
  sourceRoot: string;
  summary: {
    totalFolders: number;
    totalPdfFiles: number;
    totalBytes: number;
    duplicateCount: number;
  };
  folders: FolderInfo[];
}

export const ImportDashboard: React.FC = () => {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  
  // Loading & Action States
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [rawText, setRawText] = useState<string>('');
  
  // Form editing state for normalized question
  const [editQuestion, setEditQuestion] = useState<Partial<Question> | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // New File Upload & Incremental Scan States
  const [filesQueue, setFilesQueue] = useState<File[]>([]);
  const [inventorySummary, setInventorySummary] = useState<any | null>(null);
  const [classifiedFiles, setClassifiedFiles] = useState<any[]>([]);
  const [forceReProcess, setForceReProcess] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');

  const fetchManifest = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/manifest');
      if (res.ok) {
        const data = await res.json();
        setManifest(data);
        if (data.folders.length > 0 && !selectedFolderId) {
          setSelectedFolderId(data.folders[0].folderId);
        }
      }
    } catch (err) {
      console.error('Error fetching manifest:', err);
    }
  };

  useEffect(() => {
    fetchManifest();
    const interval = setInterval(fetchManifest, 5000); // Poll manifest every 5 seconds for status updates
    return () => clearInterval(interval);
  }, []);

  const toggleFolderExpand = (folderId: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  const handleSelectFile = async (folderId: string, file: FileInfo) => {
    setSelectedFile(file);
    setEditQuestion(null);
    setRawText('');
    setValidationError(null);

    try {
      // 1. Fetch raw extracted text
      const extractedRes = await fetch(`http://localhost:5000/api/extracted/${folderId}/${file.fileName.replace('.pdf', '.extracted.json')}`);
      if (extractedRes.ok) {
        const extractedData = await extractedRes.json();
        const combinedRaw = extractedData.pages.map((p: any) => p.rawText).join('\n');
        setRawText(combinedRaw);
      }

      // 2. Fetch normalized JSON (if available)
      if (file.status === 'normalized' || file.status === 'approved') {
        const normalizedRes = await fetch(`http://localhost:5000/api/normalized/${folderId}/${file.fileName.replace('.pdf', '.normalized.json')}`);
        if (normalizedRes.ok) {
          const normalizedData = await normalizedRes.json();
          if (normalizedData.questions && normalizedData.questions.length > 0) {
            const q = normalizedData.questions[0];
            setEditQuestion({
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
              skill: normalizedData.classification?.detectedSkill || folderId,
              confidence: q.confidence !== undefined ? q.confidence : (normalizedData.normalizationMethod === 'local_regex' ? 0.8 : 0.0),
              parserName: q.parserName || normalizedData.normalizationMethod || 'unknown'
            });
          }
        }
      }
    } catch (err) {
      console.error('Error loading file details:', err);
    }
  };

  const handleDeleteFile = async (folderId: string, file: FileInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Bạn có chắc chắn muốn loại bỏ tệp tin này khỏi hệ thống không?\n${file.fileName}`)) return;
    
    try {
      setLoading(true);
      setActionMessage(`Đang xóa tệp ${file.fileName}...`);
      
      const res = await fetch('http://localhost:5000/api/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relativePath: file.relativePath,
          folderId,
          fileName: file.fileName
        })
      });
      
      if (res.ok) {
        setActionMessage(`Đã xóa tệp ${file.fileName} thành công!`);
        await fetchManifest();
        if (selectedFile?.sha256 === file.sha256) {
          setSelectedFile(null);
          setRawText('');
          setEditQuestion(null);
        }
      } else {
        const errData = await res.json();
        setActionMessage(`Lỗi khi xóa tệp: ${errData.error}`);
      }
    } catch (err) {
      console.error(err);
      setActionMessage('Lỗi kết nối khi xóa tệp.');
    } finally {
      setLoading(false);
    }
  };

  const calculateFileHash = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const handleFilesSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLoading(true);
    setActionMessage('Đang tính mã băm SHA-256 cho các tệp PDF...');
    
    try {
      const pdfFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
      if (pdfFiles.length === 0) {
        setActionMessage('Lỗi: Vui lòng chọn tệp tin định dạng PDF.');
        setLoading(false);
        return;
      }

      const fileMetaPromises = pdfFiles.map(async (file) => {
        const hash = await calculateFileHash(file);
        const relativePath = file.webkitRelativePath || file.name;
        return {
          fileName: file.name,
          sizeBytes: file.size,
          relativePath: relativePath.replace(/\\/g, '/'),
          sha256: hash
        };
      });

      const filesMeta = await Promise.all(fileMetaPromises);
      
      const res = await fetch('http://localhost:5000/api/import-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: filesMeta })
      });

      if (res.ok) {
        const data = await res.json();
        setInventorySummary(data.summary);
        setClassifiedFiles(data.files);
        setFilesQueue(pdfFiles);
        setActionMessage('Đã lập danh sách kiểm kê! Xem bảng thống kê và bấm "Bắt đầu xử lý"');
      } else {
        setActionMessage('Lỗi đối chiếu thông tin kiểm kê.');
      }
    } catch (err: any) {
      console.error(err);
      setActionMessage(`Lỗi đọc tệp: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadAndProcess = async () => {
    if (filesQueue.length === 0) return;
    setLoading(true);
    setUploadProgress('Bắt đầu tải các tệp lên server...');

    try {
      const uploadQueueMeta = classifiedFiles.filter(f => f.decision === 'NEW' || f.decision === 'CHANGED' || forceReProcess);
      
      if (uploadQueueMeta.length === 0) {
        setUploadProgress('Đang quét trích xuất chữ từ PDF (chạy Python)...');
        const scanRes = await fetch('http://localhost:5000/api/scan', { method: 'POST' });
        if (scanRes.ok) {
          setActionMessage('Tất cả các tệp đều trùng khớp hoặc đã xử lý. Đã cập nhật lại văn bản trích xuất.');
          fetchManifest();
          setInventorySummary(null);
          setFilesQueue([]);
        } else {
          setActionMessage('Lỗi chạy tác vụ trích xuất.');
        }
        setLoading(false);
        setUploadProgress('');
        return;
      }

      const fileMap = new Map(filesQueue.map(f => [f.webkitRelativePath || f.name, f]));
      let uploadedCount = 0;

      for (const meta of uploadQueueMeta) {
        const file = fileMap.get(meta.relativePath);
        if (!file) continue;

        setUploadProgress(`Đang tải tệp [${uploadedCount + 1}/${uploadQueueMeta.length}]: ${file.name}...`);
        
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const resVal = reader.result as string;
            resolve(resVal.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const uploadRes = await fetch('http://localhost:5000/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            relativePath: (file.webkitRelativePath || file.name).replace(/\\/g, '/'),
            sha256: meta.sha256,
            fileData: base64Data
          })
        });

        if (!uploadRes.ok) {
          throw new Error(`Lỗi tải lên tệp: ${file.name}`);
        }
        uploadedCount++;
      }

      setUploadProgress('Đang chạy Python trích xuất văn bản thô từ PDF...');
      const scanRes = await fetch('http://localhost:5000/api/scan', { method: 'POST' });
      if (scanRes.ok) {
        setActionMessage(`Đã tải lên và trích xuất chữ thành công cho ${uploadedCount} file mới!`);
        fetchManifest();
        setInventorySummary(null);
        setFilesQueue([]);
      } else {
        setActionMessage('Lỗi trích xuất chữ sau khi tải lên.');
      }
    } catch (err: any) {
      console.error(err);
      setActionMessage(`Lỗi tải lên: ${err.message}`);
    } finally {
      setLoading(false);
      setUploadProgress('');
    }
  };



  const handleTriggerNormalize = async () => {
    setLoading(true);
    setActionMessage('Đang chạy tiến trình AI Chuẩn hóa câu hỏi ở background...');
    try {
      const res = await fetch('http://localhost:5000/api/normalize', { method: 'POST' });
      if (res.ok) {
        setActionMessage('AI Chuẩn hóa đang chạy. Tiến độ các file sẽ được cập nhật liên tục.');
        fetchManifest();
      } else {
        setActionMessage('Lỗi: Không thể kích hoạt AI Chuẩn hóa.');
      }
    } catch (err: any) {
      setActionMessage(`Lỗi kết nối: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveAll = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn duyệt nhanh tất cả các câu hỏi đã chuẩn hóa không?')) {
      return;
    }
    setLoading(true);
    setActionMessage('Đang duyệt nhanh tất cả câu hỏi...');
    try {
      const res = await fetch('http://localhost:5000/api/approve-all', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setActionMessage(`Đã duyệt thành công ${data.approvedCount} câu hỏi và đưa vào ngân hàng đề!`);
        fetchManifest();
      } else {
        setActionMessage('Lỗi: Không thể duyệt tất cả câu hỏi.');
      }
    } catch (err: any) {
      setActionMessage(`Lỗi kết nối: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedFile || !editQuestion) return;

    // Validate editor content
    if (!editQuestion.questionStem || editQuestion.questionStem.trim() === '') {
      setValidationError('Không thể duyệt: Câu hỏi chính (Question Stem) không được bỏ trống.');
      return;
    }
    if (!editQuestion.correctAnswer || editQuestion.correctAnswer.trim() === '') {
      setValidationError('Không thể duyệt: Bạn phải chọn đáp án đúng.');
      return;
    }
    const emptyChoices = editQuestion.choices?.some(c => !c.text || c.text.trim() === '');
    if (emptyChoices) {
      setValidationError('Không thể duyệt: Các đáp án A, B, C, D không được để trống.');
      return;
    }

    setValidationError(null);

    try {
      const res = await fetch('http://localhost:5000/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relativePath: selectedFile.relativePath,
          question: editQuestion
        })
      });

      if (res.ok) {
        alert('Duyệt câu hỏi và lưu vào ngân hàng đề thành công!');
        // Update local file status in state
        if (manifest) {
          const updatedFolders = manifest.folders.map(f => {
            const file = f.files.find(fi => fi.sha256 === selectedFile.sha256);
            if (file) {
              file.status = 'approved';
            }
            return f;
          });
          setManifest({ ...manifest, folders: updatedFolders });
        }
        setSelectedFile(prev => prev ? { ...prev, status: 'approved' } : null);
      } else {
        alert('Lỗi duyệt câu hỏi.');
      }
    } catch (err) {
      console.error('Error approving question:', err);
    }
  };

  const updateQuestionField = (key: keyof Question, value: any) => {
    if (!editQuestion) return;
    setEditQuestion({ ...editQuestion, [key]: value });
  };

  const updateChoiceText = (index: number, text: string) => {
    if (!editQuestion || !editQuestion.choices) return;
    const newChoices = [...editQuestion.choices];
    newChoices[index] = { ...newChoices[index], text };
    setEditQuestion({ ...editQuestion, choices: newChoices });
  };

  const updateExplanationField = (_key: string, value: string, option?: string) => {
    if (!editQuestion || !editQuestion.explanation) return;
    const newExpl = { ...editQuestion.explanation };
    if (option) {
      newExpl.choiceReasons = {
        ...newExpl.choiceReasons,
        [option]: value
      };
    } else {
      newExpl.correctReason = value;
    }
    setEditQuestion({ ...editQuestion, explanation: newExpl });
  };

  // Calculate totals
  const stats = manifest ? {
    total: manifest.summary.totalPdfFiles,
    pending: manifest.folders.flatMap(f => f.files).filter(f => f.status === 'pending').length,
    extracted: manifest.folders.flatMap(f => f.files).filter(f => f.status === 'extracted').length,
    normalized: manifest.folders.flatMap(f => f.files).filter(f => f.status === 'normalized').length,
    approved: manifest.folders.flatMap(f => f.files).filter(f => f.status === 'approved').length,
    failed: manifest.folders.flatMap(f => f.files).filter(f => f.status === 'failed').length,
  } : null;

  // Stepper active step determination
  const getActiveStep = () => {
    if (!stats) return 1;
    if (stats.total === 0) return 1;
    if (stats.pending > 0) return 2; // Scanning / Inventory stage
    if (stats.extracted > 0) return 3; // Text extraction stage
    if (stats.normalized > 0) return 4; // AI normalization / Review stage
    return 5; // Ready / Completed
  };

  const currentStep = getActiveStep();

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Page Header */}
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700 }}>Nhập đề & Xử lý tài liệu PDF</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Quét thư mục local để nhập file PDF, trích xuất text và dùng AI chuẩn hóa dữ liệu câu hỏi.</p>
      </div>

      {/* Stepper progress indicator */}
      <div className="card" style={{ padding: '1.25rem 2rem' }}>
        <div className="stepper" style={{ marginBottom: 0 }}>
          <div className="stepper-line"></div>
          
          <div className={`stepper-step ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}>
            <div className="stepper-circle">{currentStep > 1 ? <Check size={16} /> : '1'}</div>
            <span className="stepper-label">Chọn nguồn</span>
          </div>

          <div className={`stepper-step ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}>
            <div className="stepper-circle">{currentStep > 2 ? <Check size={16} /> : '2'}</div>
            <span className="stepper-label">Kiểm kê thư mục</span>
          </div>

          <div className={`stepper-step ${currentStep >= 3 ? 'active' : ''} ${currentStep > 3 ? 'completed' : ''}`}>
            <div className="stepper-circle">{currentStep > 3 ? <Check size={16} /> : '3'}</div>
            <span className="stepper-label">Trích xuất thô</span>
          </div>

          <div className={`stepper-step ${currentStep >= 4 ? 'active' : ''} ${currentStep > 4 ? 'completed' : ''}`}>
            <div className="stepper-circle">{currentStep > 4 ? <Check size={16} /> : '4'}</div>
            <span className="stepper-label">AI Chuẩn hóa</span>
          </div>

          <div className={`stepper-step ${currentStep >= 5 ? 'active' : ''}`}>
            <div className="stepper-circle">5</div>
            <span className="stepper-label">Hoàn tất duyệt</span>
          </div>
        </div>
      </div>

      {/* Control Actions & Batch Statistics */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem' }}>
        {/* Left Side: Actions & Upload */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <strong style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Nhập tài liệu PDF</strong>
          
          {/* Real Input Selectors */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label className="btn btn-secondary w-full" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}>
              <FolderPlus size={16} />
              Chọn thư mục (Folder)
              <input 
                type="file" 
                multiple 
                style={{ display: 'none' }} 
                onChange={(e) => handleFilesSelect(e.target.files)}
                disabled={loading}
                {...({ webkitdirectory: "", directory: "" } as any)}
              />
            </label>
            
            <label className="btn btn-secondary w-full" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}>
              <FileUp size={16} />
              Chọn nhiều file PDF
              <input 
                type="file" 
                multiple 
                accept=".pdf" 
                style={{ display: 'none' }} 
                onChange={(e) => handleFilesSelect(e.target.files)}
                disabled={loading}
              />
            </label>
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', margin: '0.25rem 0' }}></div>

          <strong style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Tiến trình xử lý</strong>
          <button className="btn btn-primary w-full" onClick={handleTriggerNormalize} disabled={loading}>
            <Play size={16} fill="white" />
            AI Chuẩn hóa câu hỏi
          </button>
          
          {stats && stats.normalized > 0 && (
            <button 
              className="btn btn-secondary w-full" 
              onClick={handleApproveAll} 
              disabled={loading}
              style={{ borderColor: 'var(--success)', color: 'var(--success)', backgroundColor: 'var(--success-soft)', display: 'flex', gap: '6px' }}
            >
              <CheckSquare size={16} />
              Duyệt nhanh tất cả ({stats.normalized})
            </button>
          )}

          {actionMessage && (
            <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--primary)' }}>
              {actionMessage}
            </div>
          )}

          {uploadProgress && (
            <div style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary)', padding: '10px', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600 }}>
              {uploadProgress}
            </div>
          )}
        </div>

        {/* Right Side: Inventory Preview OR Stats indicators */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {inventorySummary ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '0.95rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <UploadCloud size={18} /> BẢNG KIỂM KÊ TÀI LIỆU NHẬP MỚI
                </strong>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '4px 10px', fontSize: '0.75rem', height: 'auto' }}
                  onClick={() => { setInventorySummary(null); setFilesQueue([]); }}
                >
                  Hủy bỏ
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
                <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block' }}>Tổng số tệp</span>
                  <strong style={{ fontSize: '1.25rem' }}>{inventorySummary.total}</strong>
                </div>
                <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block' }}>Đã xử lý (Bỏ qua)</span>
                  <strong style={{ fontSize: '1.25rem', color: 'var(--success)' }}>{inventorySummary.unchangedFiles}</strong>
                </div>
                <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block' }}>File mới cần quét</span>
                  <strong style={{ fontSize: '1.25rem', color: 'var(--primary)' }}>{inventorySummary.newFiles}</strong>
                </div>
                <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block' }}>File thay đổi</span>
                  <strong style={{ fontSize: '1.25rem', color: 'var(--warning)' }}>{inventorySummary.changedFiles}</strong>
                </div>
                <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block' }}>File trùng</span>
                  <strong style={{ fontSize: '1.25rem', color: 'var(--text-muted)' }}>{inventorySummary.duplicateFiles}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input 
                    type="checkbox" 
                    checked={forceReProcess} 
                    onChange={(e) => setForceReProcess(e.target.checked)} 
                  />
                  <span>Bắt buộc xử lý lại các file đã hoàn thành (Ghi đè manifest)</span>
                  <span style={{ color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 600 }}>* Có cảnh báo</span>
                </label>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button 
                    className="btn btn-primary" 
                    onClick={handleUploadAndProcess}
                    disabled={loading || (inventorySummary.newFiles + inventorySummary.changedFiles === 0 && !forceReProcess)}
                  >
                    Xử lý {forceReProcess ? inventorySummary.total : (inventorySummary.newFiles + inventorySummary.changedFiles)} file mới
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <strong style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Trạng thái xử lý tệp tin</strong>
              {stats ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }}>
                    <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block' }}>Tổng số tệp</span>
                      <strong style={{ fontSize: '1.25rem' }}>{stats.total}</strong>
                    </div>
                    <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block' }}>Đã duyệt</span>
                      <strong style={{ fontSize: '1.25rem', color: 'var(--success)' }}>{stats.approved}</strong>
                    </div>
                    <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block' }}>Chờ duyệt</span>
                      <strong style={{ fontSize: '1.25rem', color: 'var(--warning)' }}>{stats.normalized}</strong>
                    </div>
                    <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block' }}>Đã trích xuất</span>
                      <strong style={{ fontSize: '1.25rem', color: 'var(--primary)' }}>{stats.extracted}</strong>
                    </div>
                    <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block' }}>Chưa xử lý</span>
                      <strong style={{ fontSize: '1.25rem', color: 'var(--text-muted)' }}>{stats.pending}</strong>
                    </div>
                    <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block' }}>Thất bại</span>
                      <strong style={{ fontSize: '1.25rem', color: 'var(--danger)' }}>{stats.failed}</strong>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {stats.normalized + stats.approved + stats.failed < stats.total ? (
                          <>
                            <span className="animate-spin" style={{ display: 'inline-block', width: '10px', height: '10px', border: '2px dashed var(--primary)', borderRadius: '50%' }}></span>
                            Đang chuẩn hóa câu hỏi bằng AI...
                          </>
                        ) : (
                          <span>Hoàn tất chuẩn hóa AI!</span>
                        )}
                      </span>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        {stats.normalized + stats.approved + stats.failed}/{stats.total} file ({stats.total > 0 ? Math.round(((stats.normalized + stats.approved + stats.failed) / stats.total) * 100) : 0}%)
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--bg-surface-secondary)', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                      <div style={{ 
                        width: `${stats.total > 0 ? Math.round(((stats.normalized + stats.approved + stats.failed) / stats.total) * 100) : 0}%`, 
                        height: '100%', 
                        backgroundColor: 'var(--primary)', 
                        transition: 'width 0.5s ease-in-out' 
                      }}></div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Đang tải bảng thống kê...</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3-Panel Workspace: Files Tree | Source Preview | Editor Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 1fr', gap: '1.5rem', height: 'calc(100vh - 350px)', minHeight: '500px' }}>
        
        {/* Panel 1: File Trees (Manifest list) */}
        <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <strong style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Folder size={16} /> Thư mục tài liệu SAT
          </strong>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {manifest?.folders.map(folder => {
              const isExpanded = !!expandedFolders[folder.folderId];
              return (
                <div key={folder.folderId} style={{ display: 'flex', flexDirection: 'column' }}>
                  {/* Folder row */}
                  <button 
                    onClick={() => toggleFolderExpand(folder.folderId)}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '6px', 
                      background: 'none', 
                      border: 'none', 
                      cursor: 'pointer', 
                      padding: '6px 4px', 
                      width: '100%', 
                      textAlign: 'left', 
                      fontWeight: 600, 
                      fontSize: '0.85rem',
                      color: 'var(--text-primary)'
                    }}
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <Folder size={14} style={{ color: 'var(--primary)' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.suggestedSkill}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>({folder.files.length})</span>
                  </button>

                  {/* Files inside folder */}
                  {isExpanded && (
                    <div style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px', borderLeft: '1px solid var(--border-color)', marginLeft: '10px', marginTop: '2px' }}>
                      {folder.files.map(file => {
                        const isFileSelected = selectedFile?.sha256 === file.sha256;
                        let statusColor = 'var(--text-muted)';
                        if (file.status === 'approved') statusColor = 'var(--success)';
                        else if (file.status === 'normalized') statusColor = 'var(--warning)';
                        else if (file.status === 'extracted') statusColor = 'var(--primary)';
                        else if (file.status === 'failed') statusColor = 'var(--danger)';

                        return (
                          <div
                            key={file.sha256}
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '6px', 
                              background: isFileSelected ? 'var(--primary-soft)' : 'none', 
                              borderRadius: '6px',
                              padding: '2px 6px',
                              color: isFileSelected ? 'var(--primary)' : 'var(--text-secondary)',
                              justifyContent: 'space-between'
                            }}
                          >
                            <button
                              onClick={() => handleSelectFile(folder.folderId, file)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '4px 0',
                                textAlign: 'left',
                                fontSize: '0.8rem',
                                color: 'inherit',
                                flex: 1,
                                overflow: 'hidden'
                              }}
                            >
                              <FileText size={12} style={{ flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>{file.fileName}</span>
                              <span style={{ 
                                marginLeft: '6px', 
                                width: '6px', 
                                height: '6px', 
                                borderRadius: '50%', 
                                backgroundColor: statusColor,
                                flexShrink: 0
                              }} title={file.status}></span>
                            </button>
                            <button
                              onClick={(e) => handleDeleteFile(folder.folderId, file, e)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                padding: '4px',
                                color: '#f87171',
                                borderRadius: '4px',
                              }}
                              title="Loại bỏ tệp"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Panel 2: Source Preview */}
        <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ height: '44px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', padding: '0 1rem', background: 'var(--bg-surface-secondary)' }}>
            <strong style={{ fontSize: '0.85rem' }}>Raw PDF Extracted Text</strong>
            {selectedFile && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>{selectedFile.fileName}</span>}
          </div>
          <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre-wrap', background: 'var(--bg-surface-secondary)', color: 'var(--text-secondary)' }}>
            {rawText || (selectedFile ? 'Đang tải text...' : 'Vui lòng chọn một file PDF ở cột bên trái.')}
          </div>
        </div>

        {/* Panel 3: Editor Panel */}
        <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ height: '44px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', padding: '0 1rem', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <strong style={{ fontSize: '0.85rem' }}>AI Structured Question Editor</strong>
              {editQuestion?.confidence !== undefined && (
                <span style={{ 
                  fontSize: '0.675rem', 
                  padding: '2px 8px', 
                  borderRadius: '12px', 
                  fontWeight: 'bold',
                  backgroundColor: editQuestion.confidence >= 0.75 ? '#dcfce7' : editQuestion.confidence >= 0.5 ? '#fef9c3' : '#fee2e2',
                  color: editQuestion.confidence >= 0.75 ? '#15803d' : editQuestion.confidence >= 0.5 ? '#a16207' : '#b91c1c',
                  border: '1px solid currentColor'
                }}>
                  Độ tin cậy: {Math.round(editQuestion.confidence * 100)}% ({editQuestion.parserName})
                </span>
              )}
            </div>
            {editQuestion && (
              <button className="btn btn-primary" style={{ padding: '0 10px', height: '28px', fontSize: '0.75rem' }} onClick={handleApprove}>
                Duyệt & Lưu đề
              </button>
            )}
          </div>

          <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {validationError && (
              <div style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: '0.8rem', padding: '8px 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={14} />
                <span>{validationError}</span>
              </div>
            )}

            {editQuestion && editQuestion.confidence !== undefined && editQuestion.confidence < 0.75 && (
              <div style={{ 
                background: '#fdf8e2', 
                border: '1px solid #f5e0a0', 
                color: '#8a6d3b', 
                fontSize: '0.8rem', 
                padding: '10px 14px', 
                borderRadius: '8px', 
                display: 'flex', 
                flexDirection: 'column',
                gap: '4px' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                  <AlertTriangle size={14} />
                  <span>Cảnh báo: Độ tin cậy nhận diện thấp ({Math.round(editQuestion.confidence * 100)}%)</span>
                </div>
                <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                  Hệ thống tự động phát hiện cấu trúc câu hỏi có thể chưa hoàn chỉnh hoặc sai lệch. Vui lòng kiểm tra, điền nốt các ô trống hoặc chỉnh sửa trực tiếp bên dưới.
                </span>
              </div>
            )}

            {editQuestion ? (
              <>
                {/* Passage */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Đoạn văn (Passage / Reading Context)</label>
                  <textarea
                    className="textarea"
                    style={{ minHeight: '120px', fontSize: '0.875rem' }}
                    value={editQuestion.passage || ''}
                    onChange={(e) => updateQuestionField('passage', e.target.value)}
                  />
                </div>

                {/* Question Stem */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Câu hỏi (Question Stem)</label>
                  <input
                    type="text"
                    className="input"
                    style={{ fontSize: '0.875rem' }}
                    value={editQuestion.questionStem || ''}
                    onChange={(e) => updateQuestionField('questionStem', e.target.value)}
                  />
                </div>

                {/* Choices */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Lựa chọn (A-D)</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {editQuestion.choices?.map((choice, idx) => (
                      <div key={choice.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong style={{ width: '16px', fontSize: '0.85rem' }}>{choice.label}</strong>
                        <input
                          type="text"
                          className="input"
                          style={{ fontSize: '0.85rem', height: '36px' }}
                          value={choice.text}
                          onChange={(e) => updateChoiceText(idx, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Correct Answer */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Đáp án đúng</label>
                  <select
                    className="select"
                    style={{ fontWeight: 'bold' }}
                    value={editQuestion.correctAnswer || ''}
                    onChange={(e) => updateQuestionField('correctAnswer', e.target.value)}
                  >
                    <option value="">-- Chọn đáp án đúng --</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                  </select>
                </div>

                {/* Correct Explanation */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Lời giải thích đáp án đúng</label>
                  <textarea
                    className="textarea"
                    style={{ minHeight: '80px', fontSize: '0.85rem' }}
                    value={editQuestion.explanation?.correctReason || ''}
                    onChange={(e) => updateExplanationField('', e.target.value)}
                  />
                </div>

                {/* Skill category */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Phân nhóm kỹ năng SAT (Skill)</label>
                  <input
                    type="text"
                    className="input"
                    value={editQuestion.skill || ''}
                    onChange={(e) => updateQuestionField('skill', e.target.value)}
                  />
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                <Edit3 size={40} style={{ marginBottom: '1rem', opacity: 0.4 }} />
                <p style={{ fontSize: '0.85rem' }}>Hãy chọn một file có chấm trạng thái <span style={{ color: 'var(--warning)', fontWeight: 'bold' }}>vàng (normalized)</span> ở cột bên trái để chỉnh sửa và duyệt câu hỏi lưu vào kho đề.</p>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
