import React, { useState, useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { Overview } from './components/dashboard/Overview';
import { PracticeHub } from './components/PracticeHub';
import { PracticeEngine } from './components/PracticeEngine';
import { QuestionBank } from './components/bank/QuestionBank';
import { ErrorBank } from './components/bank/ErrorBank';
import { Attempts } from './components/bank/Attempts';
import { ImportDashboard } from './components/ImportDashboard';
import { usePracticeStore } from './store/practiceStore';
import type { Question } from './store/practiceStore';

type ViewMode = 'dashboard' | 'practice' | 'practice-session' | 'questions' | 'error-bank' | 'attempts' | 'importer';

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const hash = window.location.hash.substring(1) as ViewMode;
    const validViews: ViewMode[] = ['dashboard', 'practice', 'practice-session', 'questions', 'error-bank', 'attempts', 'importer'];
    return validViews.includes(hash) ? hash : 'dashboard';
  });

  const setStoreQuestions = usePracticeStore((state) => state.setQuestions);
  const setStorePracticeMode = usePracticeStore((state) => state.setPracticeMode);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.substring(1) as ViewMode;
      const validViews: ViewMode[] = ['dashboard', 'practice', 'practice-session', 'questions', 'error-bank', 'attempts', 'importer'];
      if (validViews.includes(hash)) {
        setViewMode(hash);
      } else {
        setViewMode('dashboard');
      }
    };

    window.addEventListener('hashchange', handleHashChange);

    // Initial sync
    if (!window.location.hash) {
      window.location.hash = 'dashboard';
    }

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateTo = (view: ViewMode) => {
    window.location.hash = view;
  };

  // Quick single question practice trigger
  const handleStartSingleQuestion = (question: Question) => {
    setStorePracticeMode(true);
    setStoreQuestions([question]);
    navigateTo('practice-session');
  };

  // Quick multiple questions practice trigger
  const handleStartMultipleQuestions = (qs: Question[]) => {
    setStorePracticeMode(true);
    // Shuffle
    const shuffled = [...qs].sort(() => Math.random() - 0.5);
    setStoreQuestions(shuffled);
    navigateTo('practice-session');
  };

  const renderContent = () => {
    switch (viewMode) {
      case 'dashboard':
        return <Overview onViewChange={(view) => navigateTo(view as ViewMode)} />;
      case 'practice':
        return (
          <PracticeHub 
            onStartSession={() => navigateTo('practice-session')} 
            onViewChange={(view) => navigateTo(view as ViewMode)}
          />
        );
      case 'practice-session':
        return <PracticeEngine onBackToHub={() => navigateTo('practice')} />;
      case 'questions':
        return (
          <QuestionBank 
            onStartSingleQuestion={handleStartSingleQuestion}
          />
        );
      case 'error-bank':
        return (
          <ErrorBank 
            onViewChange={(view) => navigateTo(view as ViewMode)}
            onStartErrorPractice={handleStartMultipleQuestions}
            onStartSingleQuestion={handleStartSingleQuestion}
          />
        );
      case 'attempts':
        return <Attempts />;
      case 'importer':
        return <ImportDashboard />;
      default:
        return <Overview onViewChange={(view) => navigateTo(view as ViewMode)} />;
    }
  };

  const isExamMode = viewMode === 'practice-session';

  return (
    <AppShell 
      currentView={viewMode === 'practice-session' ? 'practice' : viewMode} 
      onViewChange={(view) => navigateTo(view as ViewMode)}
      isExamMode={isExamMode}
    >
      {renderContent()}
    </AppShell>
  );
};

export default App;
