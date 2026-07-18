import React, { useEffect, useState } from 'react';
import { 
  Play, BookOpen, Clock, 
  RotateCcw, FileText, TrendingUp, Check, ChevronRight, ChevronDown, Folder,
  Grid, Lightbulb, User, Link, Scale
} from 'lucide-react';
import { usePracticeStore } from '../store/practiceStore';
import type { Question } from '../store/practiceStore';

interface Attempt {
  id: string;
  category: string;
  totalQuestions: number;
  score: number;
  mode: 'practice' | 'test';
  timeSpent: number;
  createdAt: string;
  questionDetails?: any[];
}

interface PracticeHubProps {
  onStartSession: () => void;
  onViewChange: (view: string) => void;
}

export const PracticeHub: React.FC<PracticeHubProps> = ({ onStartSession, onViewChange }) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  
  // Builder configuration states
  const [scope, setScope] = useState<'skill' | 'folder'>('skill');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // Folder tree states
  const [manifest, setManifest] = useState<any | null>(null);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  
  // Strategy states
  const [strategy, setStrategy] = useState<'random' | 'balanced' | 'custom'>('random');
  const [customQuantities, setCustomQuantities] = useState<Record<string, number>>({});
  
  // Settings states
  const [isPracticeMode, setIsPracticeMode] = useState<boolean>(true);
  const [numQuestions, setNumQuestions] = useState<number>(10);
  const [questionOrder, setQuestionOrder] = useState<'random' | 'sequential'>('random');
  const [practiceFilter, setPracticeFilter] = useState<'all' | 'unanswered' | 'wrong'>('all');
  const [avoidRecentQuestions, setAvoidRecentQuestions] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  
  const setStoreQuestions = usePracticeStore((state) => state.setQuestions);
  const setStorePracticeMode = usePracticeStore((state) => state.setPracticeMode);

  const loadData = async () => {
    try {
      setLoading(true);
      const qRes = await fetch('http://localhost:5000/api/questions');
      if (qRes.ok) {
        const qData = await qRes.json();
        const activeQuestions = qData.filter((q: any) => !q.archived);
        setQuestions(activeQuestions);
      }
      
      const aRes = await fetch('http://localhost:5000/api/attempts');
      if (aRes.ok) {
        const aData = await aRes.json();
        aData.sort((x: Attempt, y: Attempt) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime());
        setAttempts(aData);
      }

      const mRes = await fetch('http://localhost:5000/api/manifest');
      if (mRes.ok) {
        const mData = await mRes.json();
        setManifest(mData);
        // Expand all folders by default in practice hub
        const initialExpanded: Record<string, boolean> = {};
        mData.folders.forEach((f: any) => {
          initialExpanded[f.folderId] = false;
        });
        setExpandedFolders(initialExpanded);
      }
    } catch (err) {
      console.error('Error loading hub data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute active pool based on current settings
  const getActivePool = () => {
    let pool = [...questions];
    if (scope === 'skill') {
      if (selectedCategory !== 'all') {
        pool = pool.filter(q => q.skill === selectedCategory);
      }
    } else {
      pool = pool.filter(q => {
        const inFolder = selectedFolderIds.includes((q as any).folderId || '');
        const inFile = selectedFileIds.includes((q as any).sourceFileId?.replace('file-', '') || '');
        return inFolder || inFile;
      });
    }
    return pool;
  };

  const activePool = getActivePool();

  useEffect(() => {
    if (activePool.length > 0 && numQuestions > activePool.length) {
      setNumQuestions(activePool.length);
    }
  }, [scope, selectedCategory, selectedFolderIds, selectedFileIds, activePool.length]);

  const handleStart = () => {
    if (activePool.length === 0) return;

    let pool = [...activePool];

    // Filter by answered/unanswered/wrong
    const answeredIds = new Set(attempts.flatMap(a => a.questionDetails || []).map(d => d.questionId));
    const wrongIds = new Set(
      attempts
        .flatMap(a => a.questionDetails || [])
        .filter(d => !d.isCorrect)
        .map(d => d.questionId)
    );

    if (practiceFilter === 'unanswered') {
      pool = pool.filter(q => !answeredIds.has(q.questionId));
    } else if (practiceFilter === 'wrong') {
      pool = pool.filter(q => wrongIds.has(q.questionId));
    }

    // Avoid recent questions (7 days)
    if (avoidRecentQuestions) {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recentAnsweredIds = new Set(
        attempts
          .filter(a => new Date(a.createdAt).getTime() > sevenDaysAgo)
          .flatMap(a => a.questionDetails || [])
          .map(d => d.questionId)
      );
      const freshPool = pool.filter(q => !recentAnsweredIds.has(q.questionId));
      if (freshPool.length > 0) {
        pool = freshPool;
      }
    }

    let selectedQuestions: Question[] = [];

    if (scope === 'folder' && strategy === 'balanced') {
      // Balanced selection across selected folders
      const activeFolders = selectedFolderIds.filter(fId => 
        pool.some(q => (q as any).folderId === fId)
      );

      if (activeFolders.length > 0) {
        const folderPools: Record<string, Question[]> = {};
        activeFolders.forEach(fId => {
          folderPools[fId] = pool.filter(q => (q as any).folderId === fId);
          if (questionOrder === 'random') {
            folderPools[fId].sort(() => Math.random() - 0.5);
          }
        });

        const targetPerFolder = Math.floor(numQuestions / activeFolders.length);

        activeFolders.forEach(fId => {
          const taken = folderPools[fId].splice(0, targetPerFolder);
          selectedQuestions.push(...taken);
        });

        if (selectedQuestions.length < numQuestions) {
          const leftovers = activeFolders.flatMap(fId => folderPools[fId]);
          if (questionOrder === 'random') {
            leftovers.sort(() => Math.random() - 0.5);
          }
          selectedQuestions.push(...leftovers.slice(0, numQuestions - selectedQuestions.length));
        }
      } else {
        selectedQuestions = pool.slice(0, numQuestions);
      }
    } else if (scope === 'folder' && strategy === 'custom') {
      // Custom quantities per folder
      selectedFolderIds.forEach(fId => {
        const qty = customQuantities[fId] || 0;
        const folderPool = pool.filter(q => (q as any).folderId === fId);
        if (questionOrder === 'random') {
          folderPool.sort(() => Math.random() - 0.5);
        }
        selectedQuestions.push(...folderPool.slice(0, qty));
      });
    } else {
      // Default: Random or Sequential slicing
      if (questionOrder === 'random') {
        pool.sort(() => Math.random() - 0.5);
      }
      selectedQuestions = pool.slice(0, numQuestions);
    }

    if (selectedQuestions.length === 0) {
      alert('Không tìm thấy câu hỏi nào thỏa mãn các bộ lọc hiện tại.');
      return;
    }

    setStorePracticeMode(isPracticeMode);
    setStoreQuestions(selectedQuestions);
    onStartSession();
  };

  // Group questions by skill
  const skillGroupCounts = questions.reduce((acc: Record<string, number>, q) => {
    acc[q.skill] = (acc[q.skill] || 0) + 1;
    return acc;
  }, {});

  // Calculate dynamic stats
  const totalApproved = questions.length;
  
  const answeredIds = new Set(attempts.flatMap(a => a.questionDetails || []).map(d => d.questionId));
  const unansweredCount = questions.filter(q => !answeredIds.has(q.questionId)).length;
  const unansweredPercentage = totalApproved > 0 ? Math.round((unansweredCount / totalApproved) * 100) : 0;

  const errorMap: Record<string, number> = {};
  const sortedAttempts = [...attempts].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  sortedAttempts.forEach(attempt => {
    if (attempt.questionDetails) {
      attempt.questionDetails.forEach(detail => {
        if (!detail.isCorrect) {
          errorMap[detail.questionId] = (errorMap[detail.questionId] || 0) + 1;
        } else {
          errorMap[detail.questionId] = 0;
        }
      });
    }
  });
  const activeErrorsCount = questions.filter(q => (errorMap[q.questionId] || 0) > 0).length;
  const errorPercentage = totalApproved > 0 ? Math.round((activeErrorsCount / totalApproved) * 100) : 0;

  let recentAccuracy = 78;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentAttempts = attempts.filter(a => new Date(a.createdAt) >= sevenDaysAgo);
  if (recentAttempts.length > 0) {
    const sum = recentAttempts.reduce((acc, curr) => acc + (curr.score / curr.totalQuestions), 0);
    recentAccuracy = Math.round((sum / recentAttempts.length) * 100);
  }

  const getSkillIcon = (skillName: string) => {
    const lower = skillName.toLowerCase();
    if (lower.includes('word')) return <strong style={{ fontSize: '1rem', color: 'var(--primary)' }}>Aa</strong>;
    if (lower.includes('main') || lower.includes('idea')) return <Lightbulb size={18} style={{ color: '#eab308' }} />;
    if (lower.includes('inference')) return <User size={18} style={{ color: '#a855f7' }} />;
    if (lower.includes('cross')) return <Link size={18} style={{ color: '#06b6d4' }} />;
    if (lower.includes('evidence')) return <Scale size={18} style={{ color: '#f97316' }} />;
    return <BookOpen size={18} style={{ color: 'var(--primary)' }} />;
  };


  if (loading) {
    return <div className="text-center mt-4">Đang tải cấu hình luyện tập...</div>;
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Luyện tập SAT</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>Luyện tập có mục tiêu. Cải thiện điểm số từng ngày.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" style={{ borderRadius: '10px', height: '40px', gap: '6px', fontSize: '0.85rem' }} onClick={() => onViewChange('error-bank')}>
            <RotateCcw size={16} /> Luyện lại câu sai
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid-4">
        {/* Card 1 */}
        <div className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
            <FileText size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 500 }}>Câu khả dụng</span>
            <strong style={{ fontSize: '1.5rem', fontWeight: 700, display: 'block', lineHeight: 1.1 }}>{totalApproved}</strong>
            <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 600 }}>Tích lũy từ tệp nhập</span>
          </div>
        </div>

        {/* Card 2 */}
        <div className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b45309' }}>
            <Clock size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 500 }}>Chưa làm</span>
            <strong style={{ fontSize: '1.5rem', fontWeight: 700, display: 'block', lineHeight: 1.1 }}>{unansweredCount}</strong>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{unansweredPercentage}% tổng số</span>
          </div>
        </div>

        {/* Card 3 */}
        <div className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)' }}>
            <RotateCcw size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 500 }}>Cần ôn lại</span>
            <strong style={{ fontSize: '1.5rem', fontWeight: 700, display: 'block', lineHeight: 1.1 }}>{activeErrorsCount}</strong>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{errorPercentage}% tổng số</span>
          </div>
        </div>

        {/* Card 4 */}
        <div className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)' }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 500 }}>Độ chính xác</span>
            <strong style={{ fontSize: '1.5rem', fontWeight: 700, display: 'block', lineHeight: 1.1 }}>{recentAccuracy}%</strong>
            <span style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: 600 }}>Trong 7 ngày gần nhất</span>
          </div>
        </div>
      </div>

      {/* Main Grid Section */}
      <div className="grid-12">
        {/* Left 8 columns: Tạo phiên luyện */}
        <div className="card" style={{ gridColumn: 'span 8', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Tạo phiên luyện</h3>
            {/* Scope Toggle Control */}
            <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-surface-secondary)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <button 
                onClick={() => setScope('skill')} 
                style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, border: 'none', cursor: 'pointer', backgroundColor: scope === 'skill' ? 'white' : 'transparent', color: scope === 'skill' ? 'var(--primary)' : 'var(--text-secondary)', boxShadow: scope === 'skill' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none' }}
              >
                Theo kỹ năng
              </button>
              <button 
                onClick={() => setScope('folder')} 
                style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, border: 'none', cursor: 'pointer', backgroundColor: scope === 'folder' ? 'white' : 'transparent', color: scope === 'folder' ? 'var(--primary)' : 'var(--text-secondary)', boxShadow: scope === 'folder' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none' }}
              >
                Theo thư mục
              </button>
            </div>
          </div>
          
          {/* Step 1: Chọn nguồn câu hỏi */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>1</div>
              <strong style={{ fontSize: '0.9rem' }}>Chọn nguồn câu hỏi</strong>
            </div>

            {scope === 'skill' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                <div 
                  onClick={() => setSelectedCategory('all')}
                  style={{ 
                    border: `1.5px solid ${selectedCategory === 'all' ? 'var(--primary)' : 'var(--border-color)'}`,
                    borderRadius: '10px', padding: '12px 6px', textAlign: 'center', cursor: 'pointer',
                    backgroundColor: selectedCategory === 'all' ? 'var(--primary-soft)' : 'var(--bg-surface)',
                    position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}
                >
                  {selectedCategory === 'all' && (
                    <span style={{ position: 'absolute', top: '6px', right: '6px', width: '14px', height: '14px', borderRadius: '50%', backgroundColor: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem' }}><Check size={10} /></span>
                  )}
                  <Grid size={18} style={{ color: 'var(--text-secondary)' }} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Tất cả câu hỏi</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{questions.length}</span>
                </div>

                {Object.keys(skillGroupCounts).map(skillName => {
                  const isSel = selectedCategory === skillName;
                  return (
                    <div
                      key={skillName}
                      onClick={() => setSelectedCategory(skillName)}
                      style={{
                        border: `1.5px solid ${isSel ? 'var(--primary)' : 'var(--border-color)'}`,
                        borderRadius: '10px', padding: '12px 6px', textAlign: 'center', cursor: 'pointer',
                        backgroundColor: isSel ? 'var(--primary-soft)' : 'var(--bg-surface)',
                        position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px'
                      }}
                    >
                      {isSel && (
                        <span style={{ position: 'absolute', top: '6px', right: '6px', width: '14px', height: '14px', borderRadius: '50%', backgroundColor: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem' }}><Check size={10} /></span>
                      )}
                      {getSkillIcon(skillName)}
                      <span style={{ fontSize: '0.725rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }} title={skillName}>
                        {skillName}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{skillGroupCounts[skillName]}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Scope Folder View: Folder Tree with checkbox */
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1rem', maxHeight: '250px', overflowY: 'auto' }}>
                {manifest?.folders.map((folder: any) => {
                  const isFolderChecked = selectedFolderIds.includes(folder.folderId);
                  const isExpanded = !!expandedFolders[folder.folderId];
                  const folderQuestions = questions.filter(q => (q as any).folderId === folder.folderId);
                  
                  return (
                    <div key={folder.folderId} style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button 
                          onClick={() => setExpandedFolders({ ...expandedFolders, [folder.folderId]: !isExpanded })}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        <input 
                          type="checkbox" 
                          checked={isFolderChecked}
                          onChange={() => {
                            const fileHashes = folder.files.map((f: any) => f.sha256);
                            if (isFolderChecked) {
                              setSelectedFolderIds(selectedFolderIds.filter(id => id !== folder.folderId));
                              setSelectedFileIds(selectedFileIds.filter(hash => !fileHashes.includes(hash)));
                            } else {
                              setSelectedFolderIds([...selectedFolderIds, folder.folderId]);
                              setSelectedFileIds([...new Set([...selectedFileIds, ...fileHashes])]);
                            }
                          }}
                        />
                        <Folder size={14} style={{ color: 'var(--primary)' }} />
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{folder.suggestedSkill}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>({folderQuestions.length} câu đã duyệt)</span>
                      </div>

                      {isExpanded && (
                        <div style={{ paddingLeft: '32px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px', borderLeft: '1px solid var(--border-color)', marginLeft: '16px' }}>
                          {folder.files.map((file: any) => {
                            const isFileChecked = selectedFileIds.includes(file.sha256);
                            const fileQuestions = questions.filter(q => (q as any).sourceFileId === `file-${file.sha256}`);
                            
                            return (
                              <div key={file.sha256} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 0' }}>
                                <input 
                                  type="checkbox" 
                                  checked={isFileChecked}
                                  onChange={() => {
                                    let nextFiles = [];
                                    if (isFileChecked) {
                                      nextFiles = selectedFileIds.filter(id => id !== file.sha256);
                                    } else {
                                      nextFiles = [...selectedFileIds, file.sha256];
                                    }
                                    setSelectedFileIds(nextFiles);
                                    
                                    const folderFiles = folder.files.map((f: any) => f.sha256);
                                    const allSelected = folderFiles.every((h: string) => nextFiles.includes(h));
                                    if (allSelected && !selectedFolderIds.includes(folder.folderId)) {
                                      setSelectedFolderIds([...selectedFolderIds, folder.folderId]);
                                    } else if (!allSelected && selectedFolderIds.includes(folder.folderId)) {
                                      setSelectedFolderIds(selectedFolderIds.filter(id => id !== folder.folderId));
                                    }
                                  }}
                                />
                                <FileText size={12} style={{ color: 'var(--text-muted)' }} />
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{file.fileName}</span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>({fileQuestions.length} câu)</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 2: Chọn chiến lược chọn câu hỏi (chỉ cho Thư mục) */}
          {scope === 'folder' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>2</div>
                <strong style={{ fontSize: '0.9rem' }}>Chiến lược phân phối</strong>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <button 
                  className={`btn ${strategy === 'random' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '10px' }}
                  onClick={() => setStrategy('random')}
                >
                  Ngẫu nhiên toàn bộ
                </button>
                <button 
                  className={`btn ${strategy === 'balanced' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '10px' }}
                  onClick={() => setStrategy('balanced')}
                >
                  Chia đều theo folder
                </button>
                <button 
                  className={`btn ${strategy === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '10px' }}
                  onClick={() => setStrategy('custom')}
                >
                  Tùy chỉnh số lượng
                </button>
              </div>

              {strategy === 'custom' && selectedFolderIds.length > 0 && (
                <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Cấu hình số câu cho từng folder đã chọn:</span>
                  {selectedFolderIds.map(fId => {
                    const folder = manifest?.folders.find((f: any) => f.folderId === fId);
                    const qty = customQuantities[fId] || 0;
                    const maxQty = questions.filter(q => (q as any).folderId === fId).length;

                    return (
                      <div key={fId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem' }}>{folder?.suggestedSkill || fId}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '2px 8px', height: '24px', fontSize: '0.8rem' }}
                            onClick={() => setCustomQuantities({ ...customQuantities, [fId]: Math.max(0, qty - 1) })}
                          >-</button>
                          <strong style={{ fontSize: '0.85rem', minWidth: '20px', textAlign: 'center' }}>{qty}</strong>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '2px 8px', height: '24px', fontSize: '0.8rem' }}
                            onClick={() => setCustomQuantities({ ...customQuantities, [fId]: Math.min(maxQty, qty + 1) })}
                          >+</button>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>/ {maxQty}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Chọn chế độ làm bài */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>{scope === 'folder' ? 3 : 2}</div>
              <strong style={{ fontSize: '0.9rem' }}>Chọn chế độ</strong>
            </div>

            <div className="grid-2">
              <div
                onClick={() => setIsPracticeMode(true)}
                style={{
                  border: `1.5px solid ${isPracticeMode ? 'var(--primary)' : 'var(--border-color)'}`,
                  borderRadius: '12px', padding: '1rem 1.25rem', cursor: 'pointer',
                  backgroundColor: isPracticeMode ? 'var(--primary-soft)' : 'var(--bg-surface)',
                  display: 'flex', alignItems: 'center', gap: '12px'
                }}
              >
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: isPracticeMode ? 'white' : 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                  <Play size={16} fill={isPracticeMode ? 'var(--primary)' : 'none'} />
                </div>
                <div>
                  <strong style={{ fontSize: '0.875rem', display: 'block' }}>Luyện tập</strong>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>Không áp lực thời gian, hiển thị giải thích tức thì.</span>
                </div>
              </div>

              <div
                onClick={() => setIsPracticeMode(false)}
                style={{
                  border: `1.5px solid ${!isPracticeMode ? 'var(--primary)' : 'var(--border-color)'}`,
                  borderRadius: '12px', padding: '1rem 1.25rem', cursor: 'pointer',
                  backgroundColor: !isPracticeMode ? 'var(--primary-soft)' : 'var(--bg-surface)',
                  display: 'flex', alignItems: 'center', gap: '12px'
                }}
              >
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: !isPracticeMode ? 'white' : 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                  <Clock size={16} />
                </div>
                <div>
                  <strong style={{ fontSize: '0.875rem', display: 'block' }}>Thi thử</strong>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>Có đồng hồ đếm ngược, nộp bài mới chấm điểm.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Step 4: Thiết lập phiên luyện */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>{scope === 'folder' ? 4 : 3}</div>
              <strong style={{ fontSize: '0.9rem' }}>Thiết lập chi tiết</strong>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              {/* Question Count Select */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Số câu hỏi</span>
                <select 
                  className="select" 
                  style={{ fontSize: '0.85rem' }} 
                  value={numQuestions} 
                  onChange={e => setNumQuestions(Number(e.target.value))}
                  disabled={scope === 'folder' && strategy === 'custom'}
                >
                  {[5, 10, 15, 20, 25, 30, 40, 50].filter(n => n <= activePool.length).map(n => (
                    <option key={n} value={n}>{n} câu</option>
                  ))}
                  {activePool.length > 0 && ![5, 10, 15, 20, 25, 30, 40, 50].includes(activePool.length) && (
                    <option value={activePool.length}>{activePool.length} câu (Tối đa)</option>
                  )}
                  {activePool.length === 0 && <option value="0">0 câu</option>}
                </select>
              </div>

              {/* Order Select */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Thứ tự</span>
                <select className="select" style={{ fontSize: '0.85rem' }} value={questionOrder} onChange={e => setQuestionOrder(e.target.value as 'random' | 'sequential')}>
                  <option value="random">Trộn ngẫu nhiên</option>
                  <option value="sequential">Theo thứ tự tệp nguồn</option>
                </select>
              </div>

              {/* Filtering Select */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Bộ lọc câu</span>
                <select className="select" style={{ fontSize: '0.85rem' }} value={practiceFilter} onChange={e => setPracticeFilter(e.target.value as any)}>
                  <option value="all">Bao gồm câu đã làm</option>
                  <option value="unanswered">Chỉ câu chưa làm</option>
                  <option value="wrong">Chỉ câu trả lời sai</option>
                </select>
              </div>
            </div>

            {/* Avoid recent check */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', marginTop: '4px' }}>
              <input 
                type="checkbox" 
                checked={avoidRecentQuestions} 
                onChange={(e) => setAvoidRecentQuestions(e.target.checked)} 
              />
              <span>Tránh các câu hỏi đã làm trong vòng 7 ngày gần đây</span>
            </label>
          </div>

          {/* Start CTA Button */}
          <button 
            className="btn btn-primary"
            style={{ width: '100%', height: '48px', fontSize: '1rem', borderRadius: '10px', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            onClick={handleStart}
            disabled={activePool.length === 0}
          >
            Bắt đầu luyện tập · {scope === 'folder' && strategy === 'custom' ? Object.values(customQuantities).reduce((a, b) => a + b, 0) : numQuestions} câu <ChevronRight size={18} />
          </button>
        </div>

        {/* Right 4 columns: Tiếp tục học & Hoạt động gần đây */}
        <div style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Card 1: Tiếp tục học */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <strong style={{ fontSize: '0.9rem', fontWeight: 700 }}>Tiếp tục học</strong>
              <button style={{ border: 'none', background: 'none', color: 'var(--primary)', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }} onClick={() => onViewChange('attempts')}>Xem tất cả</button>
            </div>
            
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px', background: 'var(--bg-surface-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)', background: 'var(--primary-soft)', padding: '2px 6px', borderRadius: '4px' }}>Aa</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Word in Context - Luyện tập</span>
              </div>
              <strong style={{ fontSize: '0.85rem', display: 'block', marginBottom: '8px' }}>Phiên luyện - 10 câu</strong>
              
              {/* Progress bar */}
              <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
                <div style={{ width: '70%', height: '100%', backgroundColor: 'var(--primary)' }}></div>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <span>Độ chính xác: <strong style={{ color: 'var(--success)' }}>70%</strong></span>
                <span>Cập nhật: 20/05/2024</span>
              </div>
            </div>
          </div>

          {/* Card 2: Hoạt động gần đây */}
          <div className="card" style={{ padding: '1.25rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <strong style={{ fontSize: '0.9rem', fontWeight: 700 }}>Hoạt động gần đây</strong>
              <button style={{ border: 'none', background: 'none', color: 'var(--primary)', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }} onClick={() => onViewChange('attempts')}>Xem tất cả</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
              {attempts.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Chưa có hoạt động.</div>
              ) : (
                attempts.slice(0, 5).map(attempt => {
                  const percentage = Math.round((attempt.score / attempt.totalQuestions) * 100);
                  return (
                    <div key={attempt.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--primary-soft)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>
                        {getSkillIcon(attempt.category)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>{attempt.category === 'all' ? 'Tất cả câu hỏi' : attempt.category} - {attempt.mode === 'practice' ? 'Luyện tập' : 'Thi thử'}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{attempt.totalQuestions} câu · {percentage}%</span>
                      </div>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        {new Date(attempt.createdAt).toLocaleDateString('vi-VN')}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Skill Library Section */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Thư viện kỹ năng</h3>
          <button style={{ border: 'none', background: 'none', color: 'var(--primary)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>Xem tất cả</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem' }}>
          {Object.entries(skillGroupCounts).map(([skillName, count]) => {
            const skillAttempts = attempts.filter(a => a.category === skillName);
            let accuracy = 72; // default like mockup
            if (skillAttempts.length > 0) {
              const totalScore = skillAttempts.reduce((sum, a) => sum + (a.score / a.totalQuestions), 0);
              accuracy = Math.round((totalScore / skillAttempts.length) * 100);
            }
            return (
              <div key={skillName} style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1rem', background: 'var(--bg-surface-secondary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {getSkillIcon(skillName)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: '0.8rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={skillName}>{skillName}</strong>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{count} câu</span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', borderTop: '1px solid var(--border-color)', paddingTop: '6px', marginTop: '4px' }}>
                  <span style={{ color: 'var(--success)' }}>Chính xác {accuracy}%</span>
                  <span style={{ color: 'var(--warning)' }}>Cần ôn 6</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
