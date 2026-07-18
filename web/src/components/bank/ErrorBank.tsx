import React, { useEffect, useState } from 'react';
import { AlertCircle, Play, Calendar, CheckCircle } from 'lucide-react';
import type { Question } from '../../store/practiceStore';

interface Attempt {
  id: string;
  category: string;
  totalQuestions: number;
  score: number;
  mode: 'practice' | 'test';
  timeSpent: number;
  createdAt: string;
  questionDetails?: Array<{
    questionId: string;
    selectedAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
  }>;
}

interface ErrorBankProps {
  onViewChange: (view: string) => void;
  onStartErrorPractice: (questions: Question[]) => void;
  onStartSingleQuestion: (q: Question) => void;
}

export const ErrorBank: React.FC<ErrorBankProps> = ({ 
  onViewChange, 
  onStartErrorPractice,
  onStartSingleQuestion
}) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [masteredIds, setMasteredIds] = useState<string[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      // Fetch approved questions
      const qRes = await fetch('http://localhost:5000/api/questions');
      if (qRes.ok) {
        setQuestions(await qRes.json());
      }
      
      // Fetch attempts
      const aRes = await fetch('http://localhost:5000/api/attempts');
      if (aRes.ok) {
        setAttempts(await aRes.json());
      }

      // Load mastered state from localStorage
      const mastered = localStorage.getItem('mastered_questions');
      if (mastered) {
        setMasteredIds(JSON.parse(mastered));
      }
    } catch (err) {
      console.error('Error loading error bank data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleMarkMastered = (qId: string) => {
    const newMastered = masteredIds.includes(qId)
      ? masteredIds.filter(id => id !== qId)
      : [...masteredIds, qId];
    
    setMasteredIds(newMastered);
    localStorage.setItem('mastered_questions', JSON.stringify(newMastered));
  };

  // Aggregate errors
  const errorMap: Record<string, { count: number; lastAttempt: string; selectedAnswer: string }> = {};

  // Sort attempts chronological to get the latest incorrect details
  const sortedAttempts = [...attempts].sort(
    (x, y) => new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime()
  );

  sortedAttempts.forEach(attempt => {
    if (attempt.questionDetails) {
      attempt.questionDetails.forEach(detail => {
        if (!detail.isCorrect) {
          // Question was wrong
          const current = errorMap[detail.questionId] || { count: 0, lastAttempt: '', selectedAnswer: '' };
          errorMap[detail.questionId] = {
            count: current.count + 1,
            lastAttempt: attempt.createdAt,
            selectedAnswer: detail.selectedAnswer
          };
        } else {
          // Question was correct, remove or decrement? 
          // For a true Error Bank, if they solved it correctly in the LATEST attempt, 
          // we can remove it from active errors, or mark it as resolved.
          // Let's mark it as resolved (count = 0) so it doesn't show up in active errors!
          errorMap[detail.questionId] = {
            count: 0,
            lastAttempt: attempt.createdAt,
            selectedAnswer: ''
          };
        }
      });
    }
  });

  // Filter questions that have active errors (count > 0) and not marked as mastered
  const errorQuestions = questions.filter(q => {
    const err = errorMap[q.questionId];
    return err && err.count > 0 && !masteredIds.includes(q.questionId);
  });

  const handlePracticeAllErrors = () => {
    if (errorQuestions.length === 0) return;
    onStartErrorPractice(errorQuestions);
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={24} style={{ color: 'var(--danger)' }} />
            Danh sách câu sai (Error Bank)
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Tổng hợp các câu hỏi bạn từng trả lời sai. Luyện tập lại giúp bạn khắc phục lỗ hổng kiến thức.
          </p>
        </div>
        <div>
          {errorQuestions.length > 0 && (
            <button className="btn btn-primary" onClick={handlePracticeAllErrors}>
              <Play size={16} fill="white" /> Ôn tập toàn bộ câu sai ({errorQuestions.length})
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center' }}>Đang tải danh sách câu sai...</div>
      ) : errorQuestions.length === 0 ? (
        <div className="card" style={{ padding: '4rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
          <CheckCircle size={48} style={{ color: 'var(--success)' }} />
          <div>
            <h3 style={{ fontWeight: 600, fontSize: '1.1rem' }}>Hộp thư mục sạch sẽ!</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Bạn chưa có câu hỏi sai nào cần khắc phục. Hãy tiếp tục duy trì kết quả tuyệt vời này!
            </p>
          </div>
          <button className="btn btn-primary" style={{ marginTop: '0.5rem' }} onClick={() => onViewChange('practice')}>
            Bắt đầu luyện tập
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-secondary)', borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '1rem 1.5rem' }}>Đoạn văn (Passage)</th>
                  <th style={{ padding: '1rem' }}>Câu hỏi chính</th>
                  <th style={{ padding: '1rem' }}>Kỹ năng (Skill)</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>Số lần sai</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>Lần sai cuối</th>
                  <th style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {errorQuestions.map(q => {
                  const errInfo = errorMap[q.questionId];
                  return (
                    <tr key={q.questionId} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.875rem' }}>
                      <td style={{ padding: '1rem 1.5rem', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {q.passage || '—'}
                      </td>
                      <td style={{ padding: '1rem', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {q.questionStem}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, background: 'var(--primary-soft)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px' }}>
                          {q.skill}
                        </span>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 'bold', color: 'var(--danger)' }}>
                        {errInfo.count}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Calendar size={12} />
                          {new Date(errInfo.lastAttempt).toLocaleDateString()}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button 
                            className="btn btn-secondary" 
                            style={{ height: '30px', padding: '0 8px', fontSize: '0.75rem' }}
                            onClick={() => onStartSingleQuestion(q)}
                          >
                            Luyện lại
                          </button>
                          <button 
                            className="btn btn-secondary" 
                            style={{ height: '30px', padding: '0 8px', fontSize: '0.75rem', color: 'var(--success)', borderColor: 'var(--success-border)', backgroundColor: 'var(--success-soft)' }}
                            onClick={() => handleMarkMastered(q.questionId)}
                            title="Đã hiểu dạng bài này"
                          >
                            Đã hiểu
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
