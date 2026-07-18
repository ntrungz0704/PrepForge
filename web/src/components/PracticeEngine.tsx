import React, { useRef, useState, useEffect } from 'react';
import { 
  ChevronLeft, ChevronRight, Flag, EyeOff, Check, X, HelpCircle, Eye, Info
} from 'lucide-react';
import { usePracticeStore } from '../store/practiceStore';
import type { Highlight } from '../store/practiceStore';

interface PracticeEngineProps {
  onBackToHub: () => void;
}

export const PracticeEngine: React.FC<PracticeEngineProps> = ({ onBackToHub }) => {
  const {
    questions,
    currentQuestionIndex,
    selectedAnswers,
    eliminatedChoices,
    markedForReview,
    highlights,
    elapsedTimes,
    timerSeconds,
    isPracticeMode,
    showResults,
    checkedQuestions,
    setCurrentQuestionIndex,
    selectAnswer,
    toggleEliminateChoice,
    toggleMarkForReview,
    addHighlight,
    updateHighlightNote,
    incrementTime,
    checkAnswer,
    submitTest
  } = usePracticeStore();

  const passageRef = useRef<HTMLDivElement>(null);
  
  // Custom timer states
  const [showTimer, setShowTimer] = useState(true);
  
  // Selection Toolbar State
  const [selectionMenu, setSelectionMenu] = useState<{
    x: number;
    y: number;
    startOffset: number;
    endOffset: number;
    text: string;
  } | null>(null);

  // Active Highlight Note Modal State
  const [activeHighlightNote, setActiveHighlightNote] = useState<{
    id: string;
    note: string;
  } | null>(null);

  // Show Navigator popover state
  const [showNavPopover, setShowNavPopover] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  const currentQuestion = questions[currentQuestionIndex];
  const questionId = currentQuestion?.questionId;

  // Handle timer increment
  useEffect(() => {
    if (!questionId || showResults) return;
    const interval = setInterval(() => {
      incrementTime(questionId);
    }, 1000);
    return () => clearInterval(interval);
  }, [questionId, showResults]);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in a textarea or input
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.isContentEditable
      ) {
        return; // Don't trigger shortcuts when typing notes or edits
      }

      const key = e.key.toUpperCase();

      // Selection shortcuts: A, B, C, D
      if (['A', 'B', 'C', 'D'].includes(key) && !showResults) {
        const choice = currentQuestion?.choices.find(c => c.label === key);
        const isElim = (eliminatedChoices[questionId] || []).includes(key);
        
        // If question check isn't complete and choice isn't eliminated
        if (choice && !isElim && !(isPracticeMode && checkedQuestions[questionId])) {
          selectAnswer(questionId, key);
        }
      }

      // Arrow keys for Next / Prev
      if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }

      // M for Mark for Review
      if (key === 'M') {
        toggleMarkForReview(questionId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [questionId, currentQuestionIndex, selectedAnswers, eliminatedChoices, showResults]);

  // Sync annotations (highlights/notes) with local backend
  const saveAnnotationsToBackend = async (qId: string, qHighlights: Highlight[]) => {
    try {
      await fetch(`http://localhost:5000/api/annotations/${qId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ highlights: qHighlights })
      });
    } catch (err) {
      console.error('Error saving annotations:', err);
    }
  };

  const loadAnnotationsFromBackend = async (qId: string) => {
    try {
      const res = await fetch(`http://localhost:5000/api/annotations/${qId}`);
      if (res.ok) {
        const qHighlights = await res.json();
        // Load into Zustand store
        const currentHl = highlights[qId] || [];
        if (currentHl.length === 0 && qHighlights.length > 0) {
          qHighlights.forEach((hl: Highlight) => {
            usePracticeStore.setState((state) => ({
              highlights: {
                ...state.highlights,
                [qId]: [...(state.highlights[qId] || []), hl]
              }
            }));
          });
        }
      }
    } catch (err) {
      console.error('Error loading annotations:', err);
    }
  };

  useEffect(() => {
    if (questionId) {
      loadAnnotationsFromBackend(questionId);
    }
  }, [questionId]);

  // Handle text selection in Passage
  const handlePassageMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setSelectionMenu(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const passageElement = passageRef.current;
    if (!passageElement || !passageElement.contains(range.commonAncestorContainer)) {
      setSelectionMenu(null);
      return;
    }

    const selectedText = selection.toString().trim();
    if (selectedText.length === 0) {
      setSelectionMenu(null);
      return;
    }

    // Get position of selection
    const rect = range.getBoundingClientRect();
    const paneRect = passageElement.getBoundingClientRect();

    // Calculate offsets
    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(passageElement);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = preSelectionRange.toString().length;
    const endOffset = startOffset + selectedText.length;

    setSelectionMenu({
      x: rect.left - paneRect.left + (rect.width / 2) + passageElement.scrollLeft,
      y: rect.top - paneRect.top - 50 + passageElement.scrollTop,
      startOffset,
      endOffset,
      text: selectedText
    });
  };

  const handleApplyHighlight = (color: 'yellow' | 'green' | 'blue' | 'pink') => {
    if (!selectionMenu || !questionId) return;
    
    const newHighlight = {
      text: selectionMenu.text,
      startOffset: selectionMenu.startOffset,
      endOffset: selectionMenu.endOffset,
      color,
      note: ''
    };

    addHighlight(questionId, newHighlight);
    
    // Save to backend
    const updatedHighlights = [...(highlights[questionId] || []), { ...newHighlight, id: `hl-temp` }];
    saveAnnotationsToBackend(questionId, updatedHighlights);

    // Clear selection
    window.getSelection()?.removeAllRanges();
    setSelectionMenu(null);
  };

  const handleClearHighlight = () => {
    if (!selectionMenu || !questionId) return;
    
    const currentHl = highlights[questionId] || [];
    const filtered = currentHl.filter(
      hl => !(hl.startOffset >= selectionMenu.startOffset && hl.endOffset <= selectionMenu.endOffset)
    );
    
    usePracticeStore.setState((state) => ({
      highlights: {
        ...state.highlights,
        [questionId]: filtered
      }
    }));
    
    saveAnnotationsToBackend(questionId, filtered);
    window.getSelection()?.removeAllRanges();
    setSelectionMenu(null);
  };

  const handleSaveHighlightNote = () => {
    if (!activeHighlightNote || !questionId) return;
    updateHighlightNote(questionId, activeHighlightNote.id, activeHighlightNote.note);
    
    const updated = (highlights[questionId] || []).map(hl => 
      hl.id === activeHighlightNote.id ? { ...hl, note: activeHighlightNote.note } : hl
    );
    saveAnnotationsToBackend(questionId, updated);
    
    setActiveHighlightNote(null);
  };

  // Render passage with highlights overlaid
  const renderPassageWithHighlights = () => {
    if (!currentQuestion || !currentQuestion.passage) return null;
    const text = currentQuestion.passage;
    const qHighlights = highlights[questionId] || [];

    if (qHighlights.length === 0) return text;

    const sorted = [...qHighlights].sort((a, b) => a.startOffset - b.startOffset);
    const result: React.ReactNode[] = [];
    let lastIndex = 0;

    sorted.forEach((hl) => {
      if (hl.startOffset < lastIndex) return;

      if (hl.startOffset > lastIndex) {
        result.push(text.substring(lastIndex, hl.startOffset));
      }

      result.push(
        <span
          key={hl.id}
          className={`highlight-${hl.color}`}
          style={{ cursor: 'pointer', position: 'relative' }}
          onClick={() => setActiveHighlightNote({ id: hl.id, note: hl.note || '' })}
        >
          {text.substring(hl.startOffset, hl.endOffset)}
          {hl.note && (
            <span style={{ 
              position: 'absolute', 
              bottom: '100%', 
              left: '50%', 
              transform: 'translateX(-50%)', 
              backgroundColor: '#1e293b', 
              color: '#f8fafc', 
              fontSize: '0.7rem', 
              padding: '2px 6px', 
              borderRadius: '4px',
              whiteSpace: 'nowrap',
              zIndex: 20
            }}>
              Ghi chú: {hl.note}
            </span>
          )}
        </span>
      );

      lastIndex = hl.endOffset;
    });

    if (lastIndex < text.length) {
      result.push(text.substring(lastIndex));
    }

    return result;
  };

  // Navigation handlers
  const handlePrev = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      setShowNavPopover(false);
    }
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setShowNavPopover(false);
    }
  };

  const handleSaveAttempt = async (finalScore: number) => {
    const totalTime = questions.reduce((sum, q) => sum + (elapsedTimes[q.questionId] || 0), 0);
    // Package details of wrong questions
    const questionDetails = questions.map(q => ({
      questionId: q.questionId,
      selectedAnswer: selectedAnswers[q.questionId] || '',
      correctAnswer: q.correctAnswer || '',
      isCorrect: selectedAnswers[q.questionId] === q.correctAnswer
    }));

    try {
      await fetch('http://localhost:5000/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: questions[0]?.skill || 'all',
          totalQuestions: questions.length,
          score: finalScore,
          mode: isPracticeMode ? 'practice' : 'test',
          timeSpent: totalTime,
          questionDetails
        })
      });
    } catch (err) {
      console.error('Error saving practice attempt:', err);
    }
  };

  const handleSubmit = () => {
    const unansweredCount = questions.filter(q => !selectedAnswers[q.questionId]).length;
    let confirmMsg = 'Bạn có chắc chắn muốn nộp bài làm này không?';
    if (unansweredCount > 0) {
      confirmMsg = `Bạn còn ${unansweredCount} câu chưa trả lời. Bạn vẫn muốn nộp bài?`;
    }

    const confirmSubmit = window.confirm(confirmMsg);
    if (!confirmSubmit) return;
    
    let score = 0;
    questions.forEach((q) => {
      if (selectedAnswers[q.questionId] === q.correctAnswer) {
        score += 1;
      }
    });

    submitTest();
    handleSaveAttempt(score);
    alert(`Hoàn thành! Bạn đạt điểm số: ${score}/${questions.length}`);
    onBackToHub();
  };

  const handleExit = () => {
    if (window.confirm('Bạn có chắc chắn muốn thoát khỏi phiên làm bài này? Tiến trình chưa lưu sẽ bị mất.')) {
      onBackToHub();
    }
  };

  if (!currentQuestion) {
    return <div className="text-center mt-4">Không có câu hỏi nào được tải.</div>;
  }

  const selectedAnswer = selectedAnswers[questionId] || '';
  const isEliminated = (label: string) => (eliminatedChoices[questionId] || []).includes(label);
  const isChecked = checkedQuestions[questionId] || false;
  const showFeedback = isPracticeMode ? isChecked : showResults;

  // Format timer
  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="exam-shell">
      {/* Topbar Navigation */}
      <header className="exam-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <strong style={{ fontSize: '0.95rem', fontWeight: 700 }}>PrepForge SAT</strong>
          <span style={{ fontSize: '0.75rem', background: 'var(--primary-soft)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
            {currentQuestion.skill}
          </span>
        </div>

        {/* Timer middle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {showTimer && (
            <div style={{ fontSize: '1.25rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)' }}>
              {formatTimer(timerSeconds)}
            </div>
          )}
          <button 
            className="btn btn-secondary" 
            style={{ height: '30px', padding: '0 8px', fontSize: '0.75rem' }}
            onClick={() => setShowTimer(!showTimer)}
          >
            {showTimer ? 'Ẩn đồng hồ' : 'Hiện đồng hồ'}
          </button>
        </div>

        {/* Action Right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            className="btn btn-secondary" 
            style={{ width: '32px', height: '32px', padding: 0 }}
            onClick={() => setShowShortcutsHelp(!showShortcutsHelp)}
            title="Xem phím tắt làm bài"
          >
            <Info size={16} />
          </button>
          
          <button className="btn btn-danger" style={{ height: '36px', fontSize: '0.85rem' }} onClick={handleExit}>
            Thoát
          </button>
        </div>
      </header>

      {/* Shortcuts Helper Panel */}
      {showShortcutsHelp && (
        <div style={{ position: 'fixed', top: '70px', right: '2rem', width: '280px', zIndex: 100, background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1rem', boxShadow: 'var(--shadow-lg)' }}>
          <h4 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', fontWeight: 700, borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '8px' }}>
            <span>Phím tắt hỗ trợ</span>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowShortcutsHelp(false)}><X size={14} /></button>
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <div><strong style={{ color: 'var(--primary)' }}>A, B, C, D</strong>: Chọn đáp án tương ứng</div>
            <div><strong style={{ color: 'var(--primary)' }}>M</strong>: Đánh dấu câu hỏi cần xem lại (Mark)</div>
            <div><strong style={{ color: 'var(--primary)' }}>← / →</strong>: Chuyển sang câu trước / câu sau</div>
          </div>
        </div>
      )}

      {/* Main Two-Column Panel Body */}
      <div className="exam-body">
        
        {/* Left Panel: Reading Context Passage (only renders if passage text exists) */}
        {currentQuestion.passage ? (
          <div className="exam-panel exam-panel-left">
            <div className="exam-panel-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
              <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="exam-panel-title">Đoạn văn đọc hiểu (Passage)</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Bôi chọn văn bản để highlight/thêm ghi chú</span>
              </div>
              {((currentQuestion as any).title || (currentQuestion as any).breadcrumb) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderLeft: '3px solid var(--primary)', paddingLeft: '8px', marginTop: '4px', width: '100%' }}>
                  {(currentQuestion as any).title && (
                    <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)', display: 'block' }}>
                      {(currentQuestion as any).title}
                    </strong>
                  )}
                  {(currentQuestion as any).breadcrumb && (
                    <span style={{ fontSize: '0.725rem', color: '#b91c1c', fontWeight: 600 }}>
                      {(currentQuestion as any).breadcrumb}
                    </span>
                  )}
                </div>
              )}
            </div>
            
            <div 
              ref={passageRef} 
              className="exam-panel-content exam-passage"
              onMouseUp={handlePassageMouseUp}
              style={{ position: 'relative', outline: 'none' }}
            >
              {renderPassageWithHighlights()}

              {/* Selection floating colors menu */}
              {selectionMenu && (
                <div 
                  className="highlight-menu"
                  style={{ left: `${selectionMenu.x}px`, top: `${selectionMenu.y}px` }}
                >
                  <button className="highlight-color-btn" style={{ backgroundColor: 'var(--highlight-yellow)' }} onClick={() => handleApplyHighlight('yellow')}></button>
                  <button className="highlight-color-btn" style={{ backgroundColor: 'var(--highlight-green)' }} onClick={() => handleApplyHighlight('green')}></button>
                  <button className="highlight-color-btn" style={{ backgroundColor: 'var(--highlight-blue)' }} onClick={() => handleApplyHighlight('blue')}></button>
                  <button className="highlight-color-btn" style={{ backgroundColor: 'var(--highlight-pink)' }} onClick={() => handleApplyHighlight('pink')}></button>
                  <button className="choice-action-btn" style={{ padding: '0 4px' }} onClick={handleClearHighlight} title="Xóa highlight"><X size={14} /></button>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Right Panel: Questions and Choices */}
        <div className="exam-panel">
          <div className="exam-panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="exam-panel-title">Câu hỏi {currentQuestionIndex + 1}</span>
              <button 
                className={`btn ${markedForReview[questionId] ? 'btn-primary' : 'btn-secondary'}`}
                style={{ height: '28px', padding: '0 8px', fontSize: '0.75rem', gap: '4px' }}
                onClick={() => toggleMarkForReview(questionId)}
              >
                <Flag size={12} fill={markedForReview[questionId] ? 'white' : 'none'} />
                Mark for Review
              </button>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mã câu hỏi: {questionId}</span>
          </div>

          <div className="exam-panel-content" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Question Stem text */}
            <p className="exam-question-stem">{currentQuestion.questionStem}</p>

            {/* Answer Options */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {currentQuestion.choices.map(choice => {
                const isSel = selectedAnswer === choice.label;
                const isElim = isEliminated(choice.label);
                
                if (showFeedback) {
                  if (choice.label === currentQuestion.correctAnswer) {
                    // Green outline by CSS mapping
                  } else if (isSel) {
                    // Red outline mapping
                  }
                }

                return (
                  <div
                    key={choice.label}
                    className={`exam-choice ${isSel ? 'selected' : ''} ${isElim ? 'eliminated' : ''}`}
                    onClick={() => {
                      if (!isElim && !showFeedback) {
                        selectAnswer(questionId, choice.label);
                      }
                    }}
                    style={
                      showFeedback && choice.label === currentQuestion.correctAnswer 
                        ? { borderColor: 'var(--success)', backgroundColor: 'var(--success-soft)' }
                        : showFeedback && isSel && choice.label !== currentQuestion.correctAnswer
                        ? { borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)' }
                        : {}
                    }
                  >
                    <span className="exam-choice-letter">{choice.label}</span>
                    <span className="exam-choice-text">{choice.text}</span>
                    
                    {/* Elimination cross-out button */}
                    {!showFeedback && (
                      <button 
                        className="choice-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleEliminateChoice(questionId, choice.label);
                        }}
                        title={isElim ? 'Undo eliminate' : 'Eliminate choice'}
                      >
                        {isElim ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                    )}

                    {showFeedback && choice.label === currentQuestion.correctAnswer && (
                      <Check size={16} style={{ color: 'var(--success)', marginLeft: 'auto' }} />
                    )}
                    {showFeedback && isSel && choice.label !== currentQuestion.correctAnswer && (
                      <X size={16} style={{ color: 'var(--danger)', marginLeft: 'auto' }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Check answer button (Practice Mode) */}
            {isPracticeMode && !isChecked && (
              <button 
                className="btn btn-primary"
                style={{ alignSelf: 'flex-start', marginTop: '1rem', width: '160px' }}
                onClick={() => checkAnswer(questionId)}
                disabled={!selectedAnswer}
              >
                Kiểm tra đáp án
              </button>
            )}

            {/* Feedback Explanation panel */}
            {showFeedback && (
              <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.95rem', fontWeight: 700, color: 'var(--primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                  <HelpCircle size={16} /> Lời giải thích đáp án
                </h4>
                <div>
                  <strong style={{ display: 'block', fontSize: '0.85rem', color: 'var(--success)', marginBottom: '4px' }}>Tại sao chọn đúng:</strong>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{currentQuestion.explanation?.correctReason || 'Chưa cập nhật lời giải.'}</p>
                </div>

                {currentQuestion.explanation?.choiceReasons && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                    {Object.entries(currentQuestion.explanation.choiceReasons).map(([opt, reason]) => (
                      <div key={opt} style={{ fontSize: '0.825rem' }}>
                        <strong style={{ color: opt === currentQuestion.correctAnswer ? 'var(--success)' : 'var(--text-muted)' }}>Đáp án {opt}:</strong>{' '}
                        <span style={{ color: 'var(--text-secondary)' }}>{reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

      </div>

      {/* Floating Note Edit Dialog */}
      {activeHighlightNote && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card glass-panel" style={{ width: '400px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Ghi chú bôi đen</h4>
            <textarea
              className="textarea"
              style={{ minHeight: '100px' }}
              value={activeHighlightNote.note}
              onChange={(e) => setActiveHighlightNote({ ...activeHighlightNote, note: e.target.value })}
              placeholder="Nhập ghi chú cá nhân của bạn tại đây..."
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="btn btn-secondary" onClick={() => setActiveHighlightNote(null)}>Hủy bỏ</button>
              <button className="btn btn-primary" onClick={handleSaveHighlightNote}>Lưu ghi chú</button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Bar Footer (Pagination & Question Nav) */}
      <footer className="exam-footer">
        {/* Back */}
        <button
          className="btn btn-secondary"
          style={{ visibility: currentQuestionIndex === 0 ? 'hidden' : 'visible' }}
          onClick={handlePrev}
        >
          <ChevronLeft size={16} /> Quay lại
        </button>

        {/* Question Selector Navigator dropdown */}
        <div style={{ position: 'relative' }}>
          <button 
            className="btn btn-secondary" 
            style={{ fontWeight: 700, gap: '4px' }}
            onClick={() => setShowNavPopover(!showNavPopover)}
          >
            Câu {currentQuestionIndex + 1} / {questions.length}
          </button>

          {showNavPopover && (
            <div style={{ position: 'absolute', bottom: '50px', left: '50%', transform: 'translateX(-50%)', width: '320px', zIndex: 200, background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.25rem', boxShadow: 'var(--shadow-lg)' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 700, borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', marginBottom: '8px' }}>Bộ điều hướng câu hỏi</h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', maxHeight: '150px', overflowY: 'auto', padding: '4px 0' }}>
                {questions.map((q, idx) => {
                  const isCur = idx === currentQuestionIndex;
                  const isAns = !!selectedAnswers[q.questionId];
                  const isFlag = !!markedForReview[q.questionId];
                  
                  let borderStyle = '1px solid var(--border-color)';
                  let bgStyle = 'var(--bg-surface)';
                  let textColor = 'var(--text-primary)';

                  if (isCur) {
                    borderStyle = '2px solid var(--primary)';
                    bgStyle = 'var(--primary-soft)';
                    textColor = 'var(--primary)';
                  } else if (isAns) {
                    bgStyle = 'var(--primary)';
                    textColor = 'white';
                    borderStyle = '1px solid var(--primary)';
                  } else if (isFlag) {
                    bgStyle = 'var(--warning-soft)';
                    textColor = 'var(--warning)';
                    borderStyle = '1px solid var(--warning-border)';
                  }

                  return (
                    <button
                      key={q.questionId}
                      onClick={() => {
                        setCurrentQuestionIndex(idx);
                        setShowNavPopover(false);
                      }}
                      style={{ 
                        width: '42px', 
                        height: '42px', 
                        borderRadius: '8px', 
                        border: borderStyle,
                        backgroundColor: bgStyle,
                        color: textColor,
                        fontWeight: 'bold', 
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              {/* Quick Submit inside nav dropdown */}
              <button className="btn btn-danger w-full" style={{ marginTop: '1rem', fontSize: '0.85rem' }} onClick={handleSubmit}>
                Nộp bài thi
              </button>
            </div>
          )}
        </div>

        {/* Next / Submit */}
        {currentQuestionIndex < questions.length - 1 ? (
          <button className="btn btn-primary" onClick={handleNext}>
            Tiếp theo <ChevronRight size={16} />
          </button>
        ) : (
          <button className="btn btn-danger" onClick={handleSubmit}>
            Nộp bài
          </button>
        )}
      </footer>

    </div>
  );
};
