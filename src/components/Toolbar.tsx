import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { useCalendar } from '../context/CalendarContext';
import ConfirmDialog from './ConfirmDialog';
import ShareDialog from './ShareDialog';
import './Toolbar.css';

interface ToolbarProps {
  onAddCourse: () => void;
  onOpenSettings: () => void;
}

type DialogType = 'new-calendar' | 'import-warning' | 'share' | null;

const Toolbar = ({ onAddCourse, onOpenSettings }: ToolbarProps) => {
  const { title, exportData, importData, newCalendar, updateTitle, darkMode, toggleDarkMode } = useCalendar();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImportRef = useRef<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(title);
  const [dialog, setDialog] = useState<DialogType>(null);

  const handleExport = () => {
    const jsonString = exportData();
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Create a safe filename from the title
    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'calendar';
    a.download = `${safeTitle}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const jsonString = event.target?.result as string;
        pendingImportRef.current = jsonString;
        setDialog('import-warning');
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  const handleConfirmImport = () => {
    if (pendingImportRef.current) {
      importData(pendingImportRef.current);
      pendingImportRef.current = null;
    }
    setDialog(null);
  };

  const handleNewCalendar = () => {
    setDialog('new-calendar');
  };

  const handleConfirmNewCalendar = () => {
    newCalendar();
    setDialog(null);
  };

  const handleSaveBeforeNew = () => {
    handleExport();
    setTimeout(() => {
      newCalendar();
      setDialog(null);
    }, 100);
  };

  const handleSaveAsImage = async () => {
    const calendarElement = document.querySelector('.week-calendar') as HTMLElement;
    const toolbarElement = document.querySelector('.toolbar') as HTMLElement;

    if (!calendarElement) {
      alert('Calendar not found');
      return;
    }

    try {
      // Temporarily hide toolbar
      if (toolbarElement) {
        toolbarElement.style.display = 'none';
      }

      // Show calendar title for image
      const titleElement = calendarElement.querySelector('.calendar-title') as HTMLElement;
      if (titleElement) {
        titleElement.style.display = 'block';
      }

      // Capture the entire calendar with scrolling content
      const dataUrl = await toPng(calendarElement, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: darkMode ? '#121212' : '#ffffff',
        cacheBust: true,
        width: calendarElement.scrollWidth,
        height: calendarElement.scrollHeight,
      });

      // Restore
      if (toolbarElement) {
        toolbarElement.style.display = '';
      }
      if (titleElement) {
        titleElement.style.display = '';
      }

      const link = document.createElement('a');
      // Create a safe filename from the title
      const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'calendar';
      link.download = `${safeTitle}-${new Date().toISOString().split('T')[0]}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Failed to save image:', error);
      alert('Failed to save image');

      // Restore on error
      if (toolbarElement) {
        toolbarElement.style.display = '';
      }
      const titleElement = calendarElement.querySelector('.calendar-title') as HTMLElement;
      if (titleElement) {
        titleElement.style.display = '';
      }
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleTitleClick = () => {
    setIsEditingTitle(true);
    setTempTitle(title);
  };

  const handleTitleSave = () => {
    if (tempTitle.trim()) {
      updateTitle(tempTitle.trim());
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false);
      setTempTitle(title);
    }
  };

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-section">
          {isEditingTitle ? (
            <input
              type="text"
              className="title-input"
              value={tempTitle}
              onChange={(e) => setTempTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              autoFocus
            />
          ) : (
            <h1 className="app-title" onClick={handleTitleClick} title="Click to edit title">
              {title}
            </h1>
          )}
        </div>

        <div className="toolbar-section toolbar-actions">
          <button className="toolbar-button primary" onClick={onAddCourse} title="Add Course">
            ➕ Add
          </button>
          <button className="toolbar-button btn-export" onClick={handleExport} title="Export JSON">
            💾
          </button>
          <button className="toolbar-button btn-import" onClick={handleImport} title="Import JSON">
            📥
          </button>
          <button className="toolbar-button btn-share" onClick={() => setDialog('share')} title="Share Calendar">
            <span role="img" aria-label="Share">🔗</span>
          </button>
          <button className="toolbar-button btn-image" onClick={handleSaveAsImage} title="Save as Image">
            🖼️
          </button>
          <button className="toolbar-button btn-print" onClick={handlePrint} title="Print">
            🖨️
          </button>
          <button className="toolbar-button btn-new" onClick={handleNewCalendar} title="New Calendar">
            📄
          </button>
          <button className="toolbar-button btn-settings" onClick={onOpenSettings} title="Settings">
            ⚙️
          </button>
          <button className="toolbar-button btn-darkmode" onClick={toggleDarkMode} title="Toggle dark mode">
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      {dialog === 'new-calendar' && (
        <ConfirmDialog
          title="Create New Calendar"
          message="Are you sure you want to create a new calendar? All current data will be cleared."
          confirmText="Clear & Create New"
          cancelText="Cancel"
          showSecondaryAction
          secondaryActionText="Save & Create New"
          onConfirm={handleConfirmNewCalendar}
          onSecondaryAction={handleSaveBeforeNew}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog === 'import-warning' && (
        <ConfirmDialog
          title="Import Calendar"
          message="Importing will replace all current calendar data. Do you want to continue?"
          confirmText="Import"
          cancelText="Cancel"
          onConfirm={handleConfirmImport}
          onCancel={() => {
            pendingImportRef.current = null;
            setDialog(null);
          }}
        />
      )}

      {dialog === 'share' && (
        <ShareDialog onClose={() => setDialog(null)} />
      )}
    </>
  );
};

export default Toolbar;
