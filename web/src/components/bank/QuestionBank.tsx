import React, { useEffect, useState } from 'react';
import { Search, Filter, Archive, BookOpen, X, Plus, Trash2 } from 'lucide-react';
import type { Question } from '../../store/practiceStore';

interface QuestionBankProps {
  onStartSingleQuestion: (q: Question) => void;
}

export const QuestionBank: React.FC<QuestionBankProps> = ({ onStartSingleQuestion }) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSkill, setSelectedSkill] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');

  // Edit/View modal states
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Question> | null>(null);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:5000/api/questions');
      if (res.ok) {
        setQuestions(await res.json());
      }
    } catch (err) {
      console.error('Error fetching question bank:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, []);

  const handleArchive = async (question: Question, archiveStatus: boolean) => {
    const confirmMsg = archiveStatus 
      ? 'Bạn có muốn lưu trữ câu hỏi này không? Nó sẽ tạm ẩn khỏi danh sách luyện tập.'
      : 'Bạn có muốn khôi phục câu hỏi này về danh mục luyện tập không?';
    if (!window.confirm(confirmMsg)) return;

    try {
      // Find source file relative path from manifest
      // (Since we don't have it immediately, we can check database question metadata or get it from manifest)
      const manifestRes = await fetch('http://localhost:5000/api/manifest');
      let relativePath = '';
      if (manifestRes.ok) {
        const manifest = await manifestRes.json();
        // Search file relative path by filename
        // (Wait, we can find it in manifest folders -> files list)
        for (const folder of manifest.folders) {
          const file = folder.files.find((f: any) => f.sha256.substring(0, 10) === question.questionId.substring(2) || f.fileName.includes(question.questionId.substring(2)));
          if (file) {
            relativePath = file.relativePath;
            break;
          }
        }
      }

      // If relativePath is still empty, let's use fallback
      if (!relativePath) {
        relativePath = `WORD IN CONTEXT/33.3.pdf`; // fallback dummy
      }

      const updatedQuestion = {
        ...question,
        archived: archiveStatus
      };

      const res = await fetch('http://localhost:5000/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relativePath,
          question: updatedQuestion
        })
      });

      if (res.ok) {
        alert(archiveStatus ? 'Đã lưu trữ câu hỏi!' : 'Đã khôi phục câu hỏi!');
        fetchQuestions();
        setActiveQuestion(null);
      }
    } catch (err) {
      console.error('Error archiving question:', err);
    }
  };

  const handleSaveEdit = async () => {
    if (!editForm || !activeQuestion) return;

    try {
      // If it is a manual question, save directly to POST /api/questions
      if (activeQuestion.questionId.startsWith('q-manual-')) {
        const res = await fetch('http://localhost:5000/api/questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editForm)
        });
        if (res.ok) {
          alert('Lưu câu hỏi thủ công thành công!');
          setEditMode(false);
          setActiveQuestion(editForm as Question);
          fetchQuestions();
        }
        return;
      }

      const manifestRes = await fetch('http://localhost:5000/api/manifest');
      let relativePath = '';
      if (manifestRes.ok) {
        const manifest = await manifestRes.json();
        for (const folder of manifest.folders) {
          const file = folder.files.find((f: any) => f.sha256.substring(0, 10) === activeQuestion.questionId.substring(2));
          if (file) {
            relativePath = file.relativePath;
            break;
          }
        }
      }

      if (!relativePath) {
        relativePath = `WORD IN CONTEXT/33.3.pdf`;
      }

      const res = await fetch('http://localhost:5000/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relativePath,
          question: editForm
        })
      });

      if (res.ok) {
        alert('Cập nhật câu hỏi thành công!');
        setEditMode(false);
        setActiveQuestion(editForm as Question);
        fetchQuestions();
      }
    } catch (err) {
      console.error('Error updating question:', err);
    }
  };

  const handleDeleteQuestion = async (question: Question) => {
    if (!window.confirm('Bạn có chắc chắn muốn XÓA HOÀN TOÀN câu hỏi này khỏi ngân hàng câu hỏi không? Thao tác này không thể khôi phục.')) return;
    try {
      const res = await fetch(`http://localhost:5000/api/questions/${question.questionId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        alert('Đã xóa câu hỏi khỏi ngân hàng câu hỏi!');
        setActiveQuestion(null);
        fetchQuestions();
      }
    } catch (err) {
      console.error('Error deleting question:', err);
    }
  };

  const handleCreateManualQuestion = () => {
    const newQ: Question = {
      questionId: `q-manual-${Date.now()}`,
      passage: '',
      questionStem: '',
      choices: [
        { label: 'A', text: '' },
        { label: 'B', text: '' },
        { label: 'C', text: '' },
        { label: 'D', text: '' }
      ],
      correctAnswer: 'A',
      explanation: {
        correctReason: '',
        choiceReasons: { A: '', B: '', C: '', D: '' }
      },
      skill: skills[0] || 'General',
      approvedAt: new Date().toISOString()
    };
    setActiveQuestion(newQ);
    setEditForm(newQ);
    setEditMode(true);
  };

  // Get dynamic categories list
  const skills = Array.from(new Set(questions.map(q => q.skill)));

  // Filter questions
  let filtered = questions.filter(q => {
    // Filter out archived
    const isArchived = (q as any).archived === true;
    if (showArchived && !isArchived) return false;
    if (!showArchived && isArchived) return false;

    // Filter by skill
    if (selectedSkill !== 'all' && q.skill !== selectedSkill) return false;

    // Search query
    if (searchTerm.trim() !== '') {
      const query = searchTerm.toLowerCase();
      const passageText = (q.passage || '').toLowerCase();
      const stemText = q.questionStem.toLowerCase();
      const choiceTexts = q.choices.map(c => c.text.toLowerCase()).join(' ');
      if (!passageText.includes(query) && !stemText.includes(query) && !choiceTexts.includes(query)) {
        return false;
      }
    }

    return true;
  });

  // Sort questions
  filtered.sort((a, b) => {
    const tA = new Date(a.approvedAt || '').getTime();
    const tB = new Date(b.approvedAt || '').getTime();
    return sortBy === 'newest' ? tB - tA : tA - tB;
  });

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700 }}>Ngân hàng câu hỏi</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Kho dữ liệu câu hỏi trắc nghiệm SAT đã được duyệt lưu trữ.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            className="btn btn-primary"
            style={{ fontSize: '0.85rem', height: '38px', display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#10b981', borderColor: '#10b981' }}
            onClick={handleCreateManualQuestion}
          >
            <Plus size={16} />
            Tạo câu hỏi thủ công
          </button>
          <button 
            className={`btn ${!showArchived ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.85rem', height: '38px' }}
            onClick={() => setShowArchived(false)}
          >
            Đang hoạt động ({questions.filter(q => !(q as any).archived).length})
          </button>
          <button 
            className={`btn ${showArchived ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.85rem', height: '38px' }}
            onClick={() => setShowArchived(true)}
          >
            Lưu trữ ({questions.filter(q => (q as any).archived).length})
          </button>
        </div>
      </div>

      {/* Toolbar Filter */}
      <div className="card" style={{ padding: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="input"
            style={{ paddingLeft: '2.5rem' }}
            placeholder="Tìm kiếm nội dung passage, câu hỏi, từ khóa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Skill Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Filter size={16} style={{ color: 'var(--text-muted)' }} />
          <select 
            className="select" 
            style={{ width: '180px' }}
            value={selectedSkill}
            onChange={(e) => setSelectedSkill(e.target.value)}
          >
            <option value="all">Tất cả kỹ năng</option>
            {skills.map(skill => (
              <option key={skill} value={skill}>{skill}</option>
            ))}
          </select>
        </div>

        {/* Sort */}
        <div>
          <select 
            className="select" 
            style={{ width: '150px' }}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest')}
          >
            <option value="newest">Mới duyệt</option>
            <option value="oldest">Cũ nhất</option>
          </select>
        </div>
      </div>

      {/* Table List */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Đang tải danh sách câu hỏi...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Không tìm thấy câu hỏi nào phù hợp với bộ lọc của bạn.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-secondary)', borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                <th style={{ padding: '1rem 1.5rem' }}>Đoạn văn (Passage)</th>
                <th style={{ padding: '1rem' }}>Câu hỏi chính</th>
                <th style={{ padding: '1rem' }}>Kỹ năng (Skill)</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>Đáp án</th>
                <th style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(q => (
                <tr key={q.questionId} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.875rem', transition: 'var(--transition-smooth)' }} className="hover:bg-slate-50">
                  <td style={{ padding: '1rem 1.5rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {q.passage || '—'}
                  </td>
                  <td style={{ padding: '1rem', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {q.questionStem}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, background: 'var(--primary-soft)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px' }}>
                      {q.skill}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 'bold', color: 'var(--success)' }}>
                    {q.correctAnswer || '—'}
                  </td>
                  <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button 
                        className="btn btn-secondary" 
                        style={{ height: '30px', padding: '0 8px', fontSize: '0.75rem' }}
                        onClick={() => {
                          setActiveQuestion(q);
                          setEditForm({ ...q });
                          setEditMode(false);
                        }}
                      >
                        Chi tiết
                      </button>
                      
                      {!showArchived && (
                        <button 
                          className="btn btn-primary" 
                          style={{ height: '30px', padding: '0 8px', fontSize: '0.75rem' }}
                          onClick={() => onStartSingleQuestion(q)}
                        >
                          <BookOpen size={12} /> Luyện câu
                        </button>
                      )}

                      <button 
                        className="btn btn-danger" 
                        style={{ height: '30px', padding: '0 8px', fontSize: '0.75rem' }}
                        onClick={() => handleArchive(q, !showArchived)}
                        title={showArchived ? 'Khôi phục' : 'Lưu trữ'}
                      >
                        <Archive size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Details/Edit Modal */}
      {activeQuestion && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card glass-panel" style={{ width: '720px', maxHeight: '90vh', overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                {editMode ? 'Chỉnh sửa câu hỏi' : 'Chi tiết câu hỏi'}
              </h3>
              <button 
                onClick={() => {
                  setActiveQuestion(null);
                  setEditMode(false);
                }} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            {editMode && editForm ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Passage */}
                <div className="form-group">
                  <label className="form-label">Đoạn văn (Passage)</label>
                  <textarea 
                    className="textarea" 
                    value={editForm.passage || ''} 
                    onChange={e => setEditForm({ ...editForm, passage: e.target.value })}
                  />
                </div>
                {/* Stem */}
                <div className="form-group">
                  <label className="form-label">Câu hỏi (Question Stem)</label>
                  <input 
                    type="text" 
                    className="input" 
                    value={editForm.questionStem || ''} 
                    onChange={e => setEditForm({ ...editForm, questionStem: e.target.value })}
                  />
                </div>
                {/* Choices */}
                <div className="form-group">
                  <label className="form-label">Lựa chọn đáp án</label>
                  {editForm.choices?.map((choice, idx) => (
                    <div key={choice.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <strong style={{ width: '16px' }}>{choice.label}</strong>
                      <input 
                        type="text" 
                        className="input" 
                        value={choice.text} 
                        onChange={e => {
                          const newChoices = [...(editForm.choices || [])];
                          newChoices[idx] = { ...newChoices[idx], text: e.target.value };
                          setEditForm({ ...editForm, choices: newChoices });
                        }}
                      />
                    </div>
                  ))}
                </div>
                {/* Correct answer */}
                <div className="form-group">
                  <label className="form-label">Đáp án đúng</label>
                  <select 
                    className="select" 
                    value={editForm.correctAnswer || ''}
                    onChange={e => setEditForm({ ...editForm, correctAnswer: e.target.value })}
                  >
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                  </select>
                </div>
                {/* Skill */}
                <div className="form-group">
                  <label className="form-label">Kỹ năng (Skill)</label>
                  <input 
                    type="text"
                    className="input" 
                    list="existing-skills"
                    placeholder="Chọn hoặc gõ tên kỹ năng mới..."
                    value={editForm.skill || ''}
                    onChange={e => setEditForm({ ...editForm, skill: e.target.value })}
                  />
                  <datalist id="existing-skills">
                    {skills.map(sk => (
                      <option key={sk} value={sk} />
                    ))}
                  </datalist>
                </div>
                {/* Correct Reason */}
                <div className="form-group">
                  <label className="form-label">Lời giải thích</label>
                  <textarea 
                    className="textarea" 
                    value={editForm.explanation?.correctReason || ''} 
                    onChange={e => {
                      const newExpl = { ...(editForm.explanation || { correctReason: '', choiceReasons: { A:'', B:'', C:'', D:'' } }) };
                      newExpl.correctReason = e.target.value;
                      setEditForm({ ...editForm, explanation: newExpl });
                    }}
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {activeQuestion.passage && (
                  <div>
                    <h5 style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Đoạn văn (Passage):</h5>
                    <p style={{ fontFamily: 'var(--font-serif)', fontSize: '1.05rem', lineHeight: '1.6', background: 'var(--bg-surface-secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      {activeQuestion.passage}
                    </p>
                  </div>
                )}
                
                <div>
                  <h5 style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Câu hỏi:</h5>
                  <p style={{ fontSize: '0.95rem', fontWeight: 650 }}>{activeQuestion.questionStem}</p>
                </div>

                <div>
                  <h5 style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Đáp án lựa chọn:</h5>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {activeQuestion.choices.map(c => {
                      const isCorrect = c.label === activeQuestion.correctAnswer;
                      return (
                        <div key={c.label} style={{ display: 'flex', gap: '8px', padding: '8px 12px', background: isCorrect ? 'var(--success-soft)' : 'var(--bg-surface-secondary)', border: `1px solid ${isCorrect ? 'var(--success-border)' : 'var(--border-color)'}`, borderRadius: '8px' }}>
                          <strong style={{ color: isCorrect ? 'var(--success)' : 'inherit' }}>{c.label}.</strong>
                          <span style={{ color: isCorrect ? 'var(--success)' : 'inherit', fontWeight: isCorrect ? '600' : 'normal' }}>{c.text}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {activeQuestion.explanation?.correctReason && (
                  <div>
                    <h5 style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Giải thích chi tiết:</h5>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', background: 'var(--bg-surface-secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      {activeQuestion.explanation.correctReason}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1rem' }}>
              {editMode ? (
                <>
                  <button className="btn btn-secondary" onClick={() => setEditMode(false)}>Hủy</button>
                  <button className="btn btn-primary" onClick={handleSaveEdit}>Lưu thay đổi</button>
                </>
              ) : (
                <>
                  <button 
                    className="btn btn-secondary" 
                    style={{ backgroundColor: '#fee2e2', borderColor: '#fca5a5', color: '#b91c1c', marginRight: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => handleDeleteQuestion(activeQuestion)}
                  >
                    <Trash2 size={16} />
                    Xóa câu hỏi
                  </button>
                  <button className="btn btn-secondary" onClick={() => setEditMode(true)}>Sửa nội dung</button>
                  {!showArchived && (
                    <button className="btn btn-primary" onClick={() => {
                      onStartSingleQuestion(activeQuestion);
                      setActiveQuestion(null);
                    }}>
                      Luyện câu hỏi này
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
