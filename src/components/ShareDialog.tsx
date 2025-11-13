import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendar } from '../context/CalendarContext';
import { CopyableId } from './CopyableId';
import './ShareDialog.css';

interface ShareDialogProps {
  onClose: () => void;
}

const ShareDialog = ({ onClose }: ShareDialogProps) => {
  const { t } = useTranslation();
  const { syncMode, calendarId, userId, grantAccess, revokeAccess, listPrivileges } = useCalendar();

  // Legacy URL-based sharing
  const [url, setUrl] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);

  // Server-based sharing
  const [targetUserId, setTargetUserId] = useState('');
  const [privilegeLevel, setPrivilegeLevel] = useState<'read' | 'write' | 'owner'>('read');
  const [isGranting, setIsGranting] = useState(false);
  const [privileges, setPrivileges] = useState<Array<{userId: string; level: string; grantedAt: number; grantedBy: string}>>([]);
  const [isLoadingPrivileges, setIsLoadingPrivileges] = useState(false);

  // Load privileges when dialog opens in server mode
  useEffect(() => {
    if (syncMode === 'server' && calendarId && userId) {
      loadPrivileges();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncMode, calendarId, userId]);

  const loadPrivileges = async () => {
    setIsLoadingPrivileges(true);
    try {
      const privs = await listPrivileges();
      setPrivileges(privs);
    } catch (error: unknown) {
      console.error('Failed to load privileges:', error);
    } finally {
      setIsLoadingPrivileges(false);
    }
  };

  const handleGenerateLegacy = () => {
    if (!url.trim()) {
      alert(t('share.enterUrl'));
      return;
    }

    try {
      // Validate URL
      const testUrl = new URL(url.trim());
      if (!['http:', 'https:'].includes(testUrl.protocol)) {
        alert(t('share.invalidProtocol'));
        return;
      }

      // Encode URL to base64
      const base64Url = btoa(url.trim());

      // Get current location with pathname
      const currentOrigin = window.location.origin;
      const currentPath = window.location.pathname.replace(/\/index\.html$/, '');
      const basePath = currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;

      // Generate share URL
      const generatedUrl = `${currentOrigin}${basePath}/?import=${base64Url}`;
      setShareUrl(generatedUrl);
      setCopied(false);
    } catch {
      alert(t('share.invalidFormat'));
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleGrantAccess = async () => {
    if (!targetUserId.trim()) {
      alert(t('shareDialog.serverMode.enterUserId'));
      return;
    }

    setIsGranting(true);
    try {
      const success = await grantAccess(targetUserId.trim(), privilegeLevel);
      if (success) {
        alert(t('shareDialog.serverMode.grantSuccess', { userId: targetUserId.substring(0, 8) }));
        setTargetUserId('');
        // Reload privileges list
        await loadPrivileges();
      } else {
        alert(t('shareDialog.serverMode.grantFailed'));
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(t('shareDialog.serverMode.error', { error: errorMessage }));
    } finally {
      setIsGranting(false);
    }
  };

  const handleRevokeAccess = async (targetUserId: string) => {
    const isSelfRevoke = targetUserId === userId;
    const confirmMessage = isSelfRevoke
      ? t('shareDialog.serverMode.leaveConfirm')
      : t('shareDialog.serverMode.revokeConfirm', { userId: targetUserId.substring(0, 8) + '...' });

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const success = await revokeAccess(targetUserId);
      if (success) {
        if (isSelfRevoke) {
          alert(t('shareDialog.serverMode.leaveSuccess'));
          onClose(); // Close the dialog after self-revoke
        } else {
          alert(t('shareDialog.serverMode.revokeSuccess'));
          // Reload privileges list
          await loadPrivileges();
        }
      } else {
        alert(t('shareDialog.serverMode.revokeFailed'));
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(t('shareDialog.serverMode.error', { error: errorMessage }));
    }
  };

  const getCalendarShareUrl = () => {
    if (!calendarId) return '';
    const currentOrigin = window.location.origin;
    const currentPath = window.location.pathname.replace(/\/index\.html$/, '');
    const basePath = currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;
    return `${currentOrigin}${basePath}/?calendar=${calendarId}`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content share-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{syncMode === 'server' ? t('shareDialog.serverMode.title') : t('share.title')}</h2>
          <button className="close-button" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="share-body">
          {syncMode === 'server' && calendarId ? (
            <>
              {/* Server-based sharing */}
              <div className="share-section">
                <h3>{t('shareDialog.serverMode.calendarLink')}</h3>
                <p className="share-description">
                  {t('shareDialog.serverMode.calendarLinkDescription')}
                </p>
                <div className="share-url-container">
                  <input
                    type="text"
                    value={getCalendarShareUrl()}
                    readOnly
                    className="share-url-input"
                  />
                  <button className="copy-button" onClick={() => handleCopy(getCalendarShareUrl())}>
                    {copied ? '✓ Copied' : '📋 Copy'}
                  </button>
                </div>
                <div className="calendar-id-display">
                  <CopyableId id={calendarId} label="Calendar ID:" displayLength={16} />
                </div>
              </div>

              <div className="share-section">
                <h3>{t('shareDialog.serverMode.grantAccess')}</h3>
                <p className="share-description">
                  {t('shareDialog.serverMode.grantAccessDescription')}
                </p>
                <div className="form-group">
                  <label htmlFor="target-user-id">{t('shareDialog.serverMode.userId')}</label>
                  <input
                    id="target-user-id"
                    type="text"
                    placeholder={t('shareDialog.serverMode.userIdPlaceholder')}
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="privilege-level">{t('shareDialog.serverMode.accessLevel')}</label>
                  <select
                    id="privilege-level"
                    value={privilegeLevel}
                    onChange={(e) => setPrivilegeLevel(e.target.value as 'read' | 'write' | 'owner')}
                  >
                    <option value="read">{t('shareDialog.serverMode.accessLevelRead')}</option>
                    <option value="write">{t('shareDialog.serverMode.accessLevelWrite')}</option>
                    <option value="owner">{t('shareDialog.serverMode.accessLevelOwner')}</option>
                  </select>
                </div>
                <button
                  className="generate-button"
                  onClick={handleGrantAccess}
                  disabled={isGranting || !targetUserId.trim()}
                >
                  {isGranting ? t('shareDialog.serverMode.granting') : t('shareDialog.serverMode.grantButton')}
                </button>
              </div>

              <div className="share-section">
                <h3>{t('shareDialog.serverMode.currentAccess')}</h3>
                <p className="share-description">
                  {t('shareDialog.serverMode.currentAccessDescription')}
                </p>
                {isLoadingPrivileges ? (
                  <p>{t('shareDialog.serverMode.loading')}</p>
                ) : privileges.length === 0 ? (
                  <p className="help-text">{t('shareDialog.serverMode.noAccess')}</p>
                ) : (
                  <div className="privileges-list">
                    {privileges.map((priv) => (
                      <div key={priv.userId} className="privilege-item">
                        <div className="privilege-info">
                          <div className="privilege-user-id">
                            <CopyableId id={priv.userId} label="User:" displayLength={16} />
                            {priv.userId === userId && (
                              <span className="badge badge-self">{t('shareDialog.serverMode.selfBadge')}</span>
                            )}
                          </div>
                          <div className="privilege-level">
                            <strong>{t('shareDialog.serverMode.accessLabel')}</strong> <span className={`badge badge-${priv.level}`}>{priv.level}</span>
                          </div>
                        </div>
                        <button
                          className={priv.userId === userId ? "leave-button" : "revoke-button"}
                          onClick={() => handleRevokeAccess(priv.userId)}
                        >
                          {priv.userId === userId ? t('shareDialog.serverMode.leaveButton') : t('shareDialog.serverMode.revokeButton')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Legacy URL-based sharing */}
              <p className="share-description">
                {t('share.description')}
              </p>

              <div className="form-group">
                <label htmlFor="calendar-url">
                  {t('share.calendarUrl')} <span className="required">*</span>
                </label>
                <input
                  id="calendar-url"
                  type="text"
                  placeholder={t('share.urlPlaceholder')}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleGenerateLegacy();
                    }
                  }}
                />
              </div>

              <button className="generate-button" onClick={handleGenerateLegacy}>
                {t('share.generate')}
              </button>

              {shareUrl && (
                <div className="share-result">
                  <label>{t('share.shareLink')}</label>
                  <div className="share-url-container">
                    <input
                      type="text"
                      value={shareUrl}
                      readOnly
                      className="share-url-input"
                    />
                    <button className="copy-button" onClick={() => handleCopy(shareUrl)}>
                      {copied ? `✓ ${t('share.copied')}` : `📋 ${t('share.copy')}`}
                    </button>
                  </div>
                </div>
              )}

              {!userId && (
                <div className="info-box">
                  <p>
                    💡 <strong>{t('shareDialog.tip.title')}</strong> {t('shareDialog.tip.message')}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="share-footer">
          <button className="cancel-button" onClick={onClose}>
            {t('share.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareDialog;
