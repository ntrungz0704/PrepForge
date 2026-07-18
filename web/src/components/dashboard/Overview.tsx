import React, { useEffect, useState } from 'react';
import { 
  FileText, CheckCircle2, TrendingUp, 
  ArrowRight, UploadCloud, FileEdit, GraduationCap, Play
} from 'lucide-react';
import type { Question } from '../../store/practiceStore';

interface Attempt {
  id: string;
  category: string;
  totalQuestions: number;
  score: number;
  mode: 'practice' | 'test';
  timeSpent: number;
  createdAt: string;
}

interface Manifest {
  summary: {
    totalPdfFiles: number;
    totalFolders: number;
  };
  folders: any[];
}

interface OverviewProps {
  onViewChange: (view: string) => void;
}

export const Overview: React.FC<OverviewProps> = ({ onViewChange }) => {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      // Fetch manifest
      const mRes = await fetch('http://localhost:5000/api/manifest');
      if (mRes.ok) {
        setManifest(await mRes.ok ? await mRes.json() : null);
      }
      
      // Fetch questions
      const qRes = await fetch('http://localhost:5000/api/questions');
      if (qRes.ok) {
        setQuestions(await qRes.json());
      }
      
      // Fetch attempts
      const aRes = await fetch('http://localhost:5000/api/attempts');
      if (aRes.ok) {
        setAttempts(await aRes.json());
      }
    } catch (err) {
      console.error('Error loading overview statistics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return <div className="text-center mt-4">Đang tải dữ liệu tổng quan...</div>;
  }

  // Calculate statistics
  const filesList = manifest ? manifest.folders.flatMap(f => f.files) : [];
  const totalPdf = filesList.length;
  const totalApproved = questions.length;
  
  // Pending review: status = normalized
  const totalPending = filesList.filter(f => f.status === 'normalized').length;

  const totalNormalized = totalPending;
  const totalApprovedFiles = filesList.filter(f => f.status === 'approved').length;
  const totalFailed = filesList.filter(f => f.status === 'failed').length;

  // Total processed by AI Normalization (normalized + approved + failed)
  const totalProcessed = totalNormalized + totalApprovedFiles + totalFailed;
  const progressPercentage = totalPdf > 0 ? Math.round((totalProcessed / totalPdf) * 100) : 0;

  // Average accuracy
  let avgAccuracy = 0;
  if (attempts.length > 0) {
    const totalScore = attempts.reduce((sum, a) => sum + (a.score / a.totalQuestions), 0);
    avgAccuracy = Math.round((totalScore / attempts.length) * 100);
  }

  const statCards = [
    { label: 'Tài liệu PDF gốc', value: totalPdf, desc: 'Tài liệu SAT đã quét', icon: FileText, color: 'var(--primary)' },
    { label: 'Câu hỏi đã duyệt', value: totalApproved, desc: 'Sẵn sàng trong kho đề', icon: CheckCircle2, color: 'var(--success)' },
    { label: 'Câu hỏi chờ duyệt', value: totalPending, desc: 'Cần AI chuẩn hóa & duyệt', icon: FileEdit, color: 'var(--warning)' },
    { label: 'Độ chính xác luyện tập', value: attempts.length > 0 ? `${avgAccuracy}%` : '—', desc: 'Trung bình các phiên', icon: TrendingUp, color: 'var(--accent-cyan)' }
  ];

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Welcome Header */}
      <div className="glass-panel" style={{ padding: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            Chào mừng bạn đến với PrepForge!
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            {totalApproved === 0 
              ? 'Bắt đầu bằng việc nhập file PDF SAT thô của bạn ở phần Nhập PDF.' 
              : `Hệ thống đã sẵn sàng với ${totalApproved} câu hỏi SAT chất lượng.`
            }
          </p>
        </div>
        <div>
          {totalApproved === 0 ? (
            <button className="btn btn-primary" onClick={() => onViewChange('importer')}>
              <UploadCloud size={16} /> Nhập tài liệu PDF đầu tiên
            </button>
          ) : totalPending > 0 ? (
            <button className="btn btn-primary animate-pulse" onClick={() => onViewChange('review')}>
              <FileEdit size={16} /> Duyệt {totalPending} câu chờ duyệt
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => onViewChange('practice')}>
              <Play size={16} fill="white" /> Bắt đầu luyện tập ngay
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar Card for AI Normalization */}
      {totalProcessed < totalPdf && totalPdf > 0 && (
        <div className="card" style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', borderColor: 'var(--primary)', background: 'var(--primary-soft)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="animate-spin" style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px dashed var(--primary)', borderRadius: '50%' }}></span>
              Đang chuẩn hóa câu hỏi bằng AI...
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)' }}>
              {totalProcessed}/{totalPdf} file ({progressPercentage}%)
            </span>
          </div>
          <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${progressPercentage}%`, height: '100%', backgroundColor: 'var(--primary)', transition: 'width 0.5s ease-in-out' }}></div>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Hệ thống đang tự động bóc tách và chuyển đổi các đề đọc hiểu SAT thô sang định dạng trắc nghiệm. Bạn có thể bắt đầu duyệt đề ngay khi các câu hỏi xuất hiện ở mục "Duyệt câu hỏi".
          </span>
        </div>
      )}

      {/* Grid of Summary Stats */}
      <div className="grid-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div key={idx} className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', padding: '1.25rem 1.5rem' }}>
              <div style={{ 
                width: '46px', 
                height: '46px', 
                borderRadius: '12px', 
                backgroundColor: `${card.color}15`, 
                color: card.color,
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <Icon size={24} />
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block' }}>{card.label}</span>
                <strong style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)' }}>{card.value}</strong>
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', display: 'block' }}>{card.desc}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Process Workflow Steps */}
      <div className="card">
        <h3 className="card-title">Quy trình làm việc PrepForge</h3>
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          
          {/* Step 1 */}
          <div style={{ flex: 1, minWidth: '220px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', padding: '1.25rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative' }}>
            <span style={{ position: 'absolute', top: '12px', right: '12px', fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-muted)', opacity: 0.15 }}>01</span>
            <strong style={{ fontSize: '0.95rem' }}>1. Nhập tài liệu PDF</strong>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Kéo thả hoặc quét thư mục chứa các file đề PDF SAT.</p>
            <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Tài liệu đã quét: <span style={{ color: 'var(--primary)' }}>{totalPdf} PDF</span></div>
            <button className="btn btn-secondary" style={{ height: '32px', fontSize: '0.8rem', width: '100%', marginTop: 'auto' }} onClick={() => onViewChange('importer')}>
              Nhập tài liệu
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
            <ArrowRight size={20} />
          </div>

          {/* Step 2 */}
          <div style={{ flex: 1, minWidth: '220px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', padding: '1.25rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative' }}>
            <span style={{ position: 'absolute', top: '12px', right: '12px', fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-muted)', opacity: 0.15 }}>02</span>
            <strong style={{ fontSize: '0.95rem' }}>2. Trích xuất text thô</strong>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Đọc và bóc tách chữ từ các file PDF thô đã tải lên.</p>
            <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Trạng thái: <span style={{ color: 'var(--accent-cyan)' }}>Đã trích xuất</span></div>
            <button className="btn btn-secondary" style={{ height: '32px', fontSize: '0.8rem', width: '100%', marginTop: 'auto' }} onClick={() => onViewChange('importer')}>
              Quản lý trích xuất
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
            <ArrowRight size={20} />
          </div>

          {/* Step 3 */}
          <div style={{ flex: 1, minWidth: '220px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', padding: '1.25rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative' }}>
            <span style={{ position: 'absolute', top: '12px', right: '12px', fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-muted)', opacity: 0.15 }}>03</span>
            <strong style={{ fontSize: '0.95rem' }}>3. Duyệt câu hỏi</strong>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Đối chiếu dữ liệu đã tách với file gốc để duyệt lưu đề.</p>
            <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Chờ kiểm tra: <span style={{ color: 'var(--warning)' }}>{totalPending} câu hỏi</span></div>
            <button className="btn btn-secondary" style={{ height: '32px', fontSize: '0.8rem', width: '100%', marginTop: 'auto' }} onClick={() => onViewChange('review')}>
              Duyệt ngay
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
            <ArrowRight size={20} />
          </div>

          {/* Step 4 */}
          <div style={{ flex: 1, minWidth: '220px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', padding: '1.25rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative' }}>
            <span style={{ position: 'absolute', top: '12px', right: '12px', fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-muted)', opacity: 0.15 }}>04</span>
            <strong style={{ fontSize: '0.95rem' }}>4. Luyện tập</strong>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Làm bài trắc nghiệm tương tác chuẩn cấu trúc SAT.</p>
            <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Trong kho: <span style={{ color: 'var(--success)' }}>{totalApproved} câu đã duyệt</span></div>
            <button className="btn btn-primary" style={{ height: '32px', fontSize: '0.8rem', width: '100%', marginTop: 'auto' }} onClick={() => onViewChange('practice')}>
              Luyện tập
            </button>
          </div>

        </div>
      </div>

      {/* Two Column details: Recent Attempts & Quick Practice */}
      <div className="grid-2">
        {/* Recent attempts history */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Lịch sử luyện tập gần đây</span>
            <button 
              onClick={() => onViewChange('attempts')} 
              style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
            >
              Xem tất cả
            </button>
          </h3>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '1rem' }}>
            {attempts.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '180px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                <GraduationCap size={36} style={{ marginBottom: '8px', opacity: 0.3 }} />
                Chưa làm bài thi thử hoặc luyện tập nào.
              </div>
            ) : (
              attempts.slice(0, 4).map((attempt) => {
                const percentage = Math.round((attempt.score / attempt.totalQuestions) * 100);
                const scoreColor = percentage >= 80 ? 'var(--success)' : percentage >= 50 ? 'var(--warning)' : 'var(--danger)';
                return (
                  <div key={attempt.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                    <div>
                      <strong style={{ fontSize: '0.9rem', display: 'block' }}>{attempt.category === 'all' ? 'Tất cả kỹ năng' : attempt.category}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {attempt.mode === 'practice' ? 'Luyện tập' : 'Thi thử'} • {new Date(attempt.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ color: scoreColor, fontSize: '1rem', fontFamily: 'monospace' }}>{attempt.score}/{attempt.totalQuestions}</strong>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{percentage}% đúng</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Quick actions for skills */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 className="card-title">Kho kỹ năng luyện đề</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>Các nhóm câu hỏi SAT được duyệt phân chia theo skill:</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {questions.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '180px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Không có dữ liệu kỹ năng. Hãy duyệt câu hỏi trước.
              </div>
            ) : (
              Object.entries(
                questions.reduce((acc: Record<string, number>, q) => {
                  acc[q.skill] = (acc[q.skill] || 0) + 1;
                  return acc;
                }, {})
              ).slice(0, 4).map(([skillName, count]) => (
                <div key={skillName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary)' }}></div>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{skillName}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{count} câu hỏi</span>
                    <button 
                      className="btn btn-secondary" 
                      style={{ height: '28px', padding: '0 8px', fontSize: '0.75rem' }}
                      onClick={() => onViewChange('practice')}
                    >
                      Luyện đề
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
