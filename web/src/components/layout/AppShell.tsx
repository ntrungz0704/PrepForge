import React, { useEffect, useState } from 'react';
import { 
  Home, Target, Database, XCircle, Clock, 
  UploadCloud, ListTodo, CheckSquare, Folder, Settings,
  Sun, Moon, ChevronDown, Search, Menu
} from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
  currentView: string;
  onViewChange: (view: string) => void;
  isExamMode: boolean;
}

export const AppShell: React.FC<AppShellProps> = ({ 
  children, 
  currentView, 
  onViewChange,
  isExamMode
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });
  
  const [pendingCount, setPendingCount] = useState(0);
  const [extractedCount, setExtractedCount] = useState(0);

  // Sync theme with DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Load manifest details to get counts
  const fetchCounts = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/manifest');
      if (res.ok) {
        const data = await res.json();
        const filesList = data.folders.flatMap((f: any) => f.files);
        
        // normalized files = waiting for manual approval
        const normalizedFiles = filesList.filter((file: any) => file.status === 'normalized').length;
        
        // extracted files = waiting for AI normalization
        const extractedFiles = filesList.filter((file: any) => file.status === 'extracted').length;

        setPendingCount(normalizedFiles);
        setExtractedCount(extractedFiles);
      }
    } catch (err) {
      console.error('Error fetching manifest for app shell:', err);
    }
  };

  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, 8000);
    return () => clearInterval(interval);
  }, []);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  if (isExamMode) {
    return <div className="exam-layout w-full h-screen">{children}</div>;
  }

  const mainNavItems = [
    { id: 'dashboard', label: 'Tổng quan', icon: Home },
    { id: 'practice', label: 'Luyện tập', icon: Target },
    { id: 'questions', label: 'Ngân hàng câu hỏi', icon: Database },
    { id: 'error-bank', label: 'Câu sai', icon: XCircle },
    { id: 'attempts', label: 'Lịch sử', icon: Clock }
  ];

  const dataNavItems = [
    { id: 'importer', label: 'Nhập PDF', icon: UploadCloud },
    { id: 'queue', label: 'Hàng chờ xử lý', icon: ListTodo, badge: extractedCount > 0 ? extractedCount : undefined },
    { id: 'review', label: 'Duyệt câu hỏi', icon: CheckSquare, badge: pendingCount > 0 ? pendingCount : undefined, greenDot: pendingCount > 0 },
    { id: 'resources', label: 'Nguồn tài liệu', icon: Folder }
  ];

  const getPageTitle = () => {
    const allItems = [...mainNavItems, ...dataNavItems];
    const found = allItems.find(item => item.id === currentView);
    return found ? found.label : 'PrepForge';
  };

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header" style={{ borderBottom: 'none', padding: '1.5rem 1.25rem 0.5rem 1.25rem' }}>
          <div className="sidebar-logo">
            <Target size={20} />
          </div>
          {!collapsed && (
            <div>
              <h1 className="sidebar-title" style={{ fontSize: '1.25rem' }}>PrepForge</h1>
              <span className="sidebar-subtitle">SAT Practice Studio</span>
            </div>
          )}
        </div>

        <nav className="sidebar-menu" style={{ gap: '1rem', paddingTop: '1rem' }}>
          {/* Main Group (no label) */}
          <div className="flex flex-col gap-1">
            {mainNavItems.map(item => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onViewChange(item.id)}
                  className={`menu-item ${isActive ? 'active' : ''}`}
                  title={collapsed ? item.label : undefined}
                  style={{
                    backgroundColor: isActive ? 'var(--primary-soft)' : 'transparent',
                    color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                    fontWeight: isActive ? '600' : '500'
                  }}
                >
                  <Icon size={18} />
                  {!collapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </div>

          {/* DỮ LIỆU Group */}
          <div className="menu-group">
            {!collapsed && <div className="menu-group-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>DỮ LIỆU</div>}
            <div className="flex flex-col gap-1">
              {dataNavItems.map(item => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onViewChange(item.id)}
                    className={`menu-item ${isActive ? 'active' : ''}`}
                    title={collapsed ? item.label : undefined}
                    style={{
                      backgroundColor: isActive ? 'var(--primary-soft)' : 'transparent',
                      color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                      fontWeight: isActive ? '600' : '500'
                    }}
                  >
                    <Icon size={18} />
                    {!collapsed && <span>{item.label}</span>}
                    
                    {!collapsed && item.badge !== undefined && (
                      <span className="menu-item-badge" style={{ backgroundColor: item.greenDot ? 'var(--success)' : 'var(--primary-soft)', color: item.greenDot ? 'white' : 'var(--primary)', padding: item.greenDot ? '2px 6px' : '2px 8px', borderRadius: '10px' }}>
                        {item.badge}
                      </span>
                    )}

                    {!collapsed && item.greenDot && !item.badge && (
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--success)', marginLeft: 'auto' }}></span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cài đặt bottom */}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button 
              onClick={() => onViewChange('settings')}
              className={`menu-item ${currentView === 'settings' ? 'active' : ''}`}
              title={collapsed ? 'Cài đặt' : undefined}
            >
              <Settings size={18} />
              {!collapsed && <span>Cài đặt</span>}
            </button>
          </div>
        </nav>
      </aside>

      {/* Main Layout Area */}
      <div className="main-layout">
        {/* Topbar */}
        <header className="topbar" style={{ borderBottom: '1px solid var(--border-color)', height: '68px', padding: '0 2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button 
              className="btn btn-secondary" 
              style={{ width: '36px', height: '36px', padding: 0, border: 'none', background: 'none' }}
              onClick={() => setCollapsed(!collapsed)}
            >
              <Menu size={20} />
            </button>
            <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {getPageTitle()} <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
            </span>
          </div>

          {/* Global Search Bar */}
          <div style={{ position: 'relative', width: '380px', display: 'flex', alignItems: 'center' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              className="input" 
              placeholder="Tìm kiếm kỹ năng, chủ đề, câu hỏi..." 
              style={{ height: '38px', paddingLeft: '2.5rem', paddingRight: '3rem', borderRadius: '10px', fontSize: '0.85rem', backgroundColor: 'var(--bg-app)', border: 'none' }}
            />
            <span style={{ position: 'absolute', right: '12px', fontSize: '0.75rem', color: 'var(--text-muted)', border: '1px solid var(--border-color)', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-surface)' }}>⌘K</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Quick Action */}
            <button 
              className="btn btn-secondary" 
              style={{ height: '38px', padding: '0 1rem', fontSize: '0.85rem', color: 'var(--primary)', borderColor: 'var(--primary)', borderRadius: '10px' }}
              onClick={() => onViewChange('importer')}
            >
              <UploadCloud size={16} /> Nhập PDF
            </button>

            {/* Theme Toggle */}
            <button 
              onClick={toggleTheme} 
              className="btn btn-secondary" 
              style={{ width: '36px', height: '36px', padding: 0, borderRadius: '50%', border: 'none', background: 'none' }}
            >
              {theme === 'light' ? <Moon size={18} style={{ color: 'var(--text-secondary)' }} /> : <Sun size={18} style={{ color: 'var(--text-secondary)' }} />}
            </button>

            {/* Avatar Profile */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <div style={{ 
                width: '32px', 
                height: '32px', 
                borderRadius: '50%', 
                backgroundColor: '#cbd5e1', 
                color: '#334155',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '0.85rem'
              }}>
                N
              </div>
              <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
            </div>
          </div>
        </header>

        {/* Content Wrapper */}
        <div className="page-content-wrapper" style={{ padding: '2rem 3rem' }}>
          {children}
        </div>
      </div>
    </div>
  );
};
