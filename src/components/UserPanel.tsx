import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendar } from '../context/CalendarContext';
import { calendarAPI } from '../api/client';
import { CopyableId } from './CopyableId';
import './UserPanel.css';

export const UserPanel = () => {
  const { t } = useTranslation();
  const {
    userId,
    syncMode,
    isSyncing,
    lastSyncError,
  } = useCalendar();

  const [showPanel, setShowPanel] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [activationToken, setActivationToken] = useState('');
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  const handleCreateUser = async () => {
    if (!activationToken.trim()) {
      alert(t('userPanel.enterToken'));
      return;
    }

    setIsCreatingUser(true);
    try {
      const result = await calendarAPI.createUser(
        activationToken.trim(),
        displayName || undefined
      );

      if (result.success && result.userId) {
        // Store user ID and mark as registered
        localStorage.setItem('calendrier-user-id', result.userId);
        localStorage.setItem('calendrier-user-registered', 'true');
        setDisplayName('');
        setActivationToken('');
        alert(t('userPanel.accountCreated'));
        // Reload to update context
        window.location.reload();
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(t('userPanel.createFailed', { error: errorMessage }));
    } finally {
      setIsCreatingUser(false);
    }
  };

  const getStatusColor = () => {
    if (!userId) return 'gray';
    if (syncMode === 'server') return 'green';
    return 'blue';
  };

  const getStatusText = () => {
    if (!userId) return t('userPanel.statusNoUser');
    if (syncMode === 'server') return t('userPanel.statusSynced');
    return t('userPanel.statusRegistered');
  };

  return (
    <div className="user-panel">
      <button
        className="user-panel-toggle"
        onClick={() => setShowPanel(!showPanel)}
        title={t('userPanel.userStatus')}
      >
        <span className={`status-indicator status-${getStatusColor()}`} />
        <span className="status-text">{getStatusText()}</span>
      </button>

      {showPanel && (
        <div className="user-panel-dropdown">
          <div className="user-panel-header">
            <h3>{t('userPanel.userStatus')}</h3>
            <button
              className="close-button"
              onClick={() => setShowPanel(false)}
              aria-label={t('userPanel.close')}
            >
              ×
            </button>
          </div>

          <div className="user-panel-content">
            {!userId ? (
              <div className="user-section">
                <h4>{t('userPanel.createAccount')}</h4>
                <p className="help-text">
                  {t('userPanel.createAccountHelp')}
                </p>
                <input
                  type="text"
                  placeholder={t('userPanel.tokenPlaceholder')}
                  value={activationToken}
                  onChange={(e) => setActivationToken(e.target.value)}
                  className="user-input"
                />
                <input
                  type="text"
                  placeholder={t('userPanel.displayNamePlaceholder')}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="user-input"
                />
                <button
                  onClick={handleCreateUser}
                  disabled={isCreatingUser || !activationToken.trim()}
                  className="user-button primary"
                >
                  {isCreatingUser ? t('userPanel.creating') : t('userPanel.createAccount')}
                </button>
              </div>
            ) : (
              <div className="user-section">
                <div className="user-info">
                  <CopyableId id={userId} label={t('userPanel.userIdLabel')} displayLength={8} />
                </div>
                <div className="user-info">
                  <strong>{t('userPanel.statusLabel')}</strong>
                  <span className="status-badge registered">{t('userPanel.statusRegistered')}</span>
                </div>
                <div className="user-info">
                  <strong>{t('userPanel.modeLabel')}</strong>
                  <span className="status-badge">
                    {syncMode === 'server' ? t('userPanel.modeServer') : t('userPanel.modeLocal')}
                  </span>
                </div>
                {isSyncing && (
                  <div className="sync-status syncing">
                    <span className="spinner" />
                    {t('userPanel.syncing')}
                  </div>
                )}
                {lastSyncError && (
                  <div className="sync-status error">
                    {t('userPanel.syncError', { error: lastSyncError })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="user-panel-footer">
            <p className="help-text small">
              {!userId ? t('userPanel.footerNoUser') : t('userPanel.footerHasUser')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
