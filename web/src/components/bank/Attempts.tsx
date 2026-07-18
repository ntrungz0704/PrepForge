import React, { useEffect, useState } from 'react';
import { History, Clock, Calendar, Award } from 'lucide-react';

interface Attempt {
  id: string;
  category: string;
  totalQuestions: number;
  score: number;
  mode: 'practice' | 'test';
  timeSpent: number;
  createdAt: string;
}

export const Attempts: React.FC = () => {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAttempts = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:5000/api/attempts');
      if (res.ok) {
        const data = await res.json();
        // Sort newest first
        data.sort((a: Attempt, b: Attempt) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setAttempts(data);
      }
    } catch (err) {
      console.error('Error fetching attempts history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttempts();
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}p ${s}s`;
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Header */}
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <History size={24} style={{ color: 'var(--primary)' }} />
          Lịch sử làm đề & Thi thử
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Xem lại tất cả kết quả ôn luyện và thi thử của bạn theo thời gian.
        </p>
      </div>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center' }}>Đang tải lịch sử...</div>
      ) : attempts.length === 0 ? (
        <div className="card text-center" style={{ padding: '4rem' }}>
          <Award size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem', opacity: 0.3 }} />
          <h3 style={{ fontWeight: 650 }}>Chưa làm phiên nào</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Bạn chưa thực hiện phiên luyện tập hoặc thi thử nào.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-secondary)', borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                <th style={{ padding: '1rem 1.5rem' }}>Kỹ năng / Danh mục</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>Chế độ</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>Số câu hỏi</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>Điểm số</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>Độ chính xác</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>Thời gian</th>
                <th style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>Ngày hoàn thành</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map(attempt => {
                const percentage = Math.round((attempt.score / attempt.totalQuestions) * 100);
                const scoreColor = percentage >= 80 ? 'var(--success)' : percentage >= 50 ? 'var(--warning)' : 'var(--danger)';
                
                return (
                  <tr key={attempt.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.875rem' }}>
                    <td style={{ padding: '1rem 1.5rem', fontWeight: 600 }}>
                      {attempt.category === 'all' ? 'Tất cả kỹ năng' : attempt.category}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <span style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: 600, 
                        background: attempt.mode === 'practice' ? 'var(--primary-soft)' : 'var(--warning-soft)', 
                        color: attempt.mode === 'practice' ? 'var(--primary)' : 'var(--warning)', 
                        padding: '2px 8px', 
                        borderRadius: '4px',
                        textTransform: 'uppercase'
                      }}>
                        {attempt.mode === 'practice' ? 'Luyện tập' : 'Thi thử'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      {attempt.totalQuestions}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 'bold', color: scoreColor }}>
                      {attempt.score} / {attempt.totalQuestions}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 'bold', color: scoreColor }}>
                      {percentage}%
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} />
                        {formatTime(attempt.timeSpent)}
                      </span>
                    </td>
                    <td style={{ padding: '1rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={12} />
                        {new Date(attempt.createdAt).toLocaleString('vi-VN')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
