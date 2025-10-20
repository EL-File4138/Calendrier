import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './ShareDialog.css';

interface ShareDialogProps {
  onClose: () => void;
}

const ShareDialog = ({ onClose }: ShareDialogProps) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
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

      // Get current location with pathname (to handle subdirectory deployments)
      const currentOrigin = window.location.origin;
      const currentPath = window.location.pathname.replace(/\/index\.html$/, '');
      const basePath = currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;

      // Generate share URL
      const generatedUrl = `${currentOrigin}${basePath}/?import=${base64Url}`;
      setShareUrl(generatedUrl);
      setCopied(false);
    } catch (error) {
      alert(t('share.invalidFormat'));
    }
  };

  const handleCopy = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content share-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('share.title')}</h2>
          <button className="close-button" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="share-body">
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
                  handleGenerate();
                }
              }}
            />
          </div>

          <button className="generate-button" onClick={handleGenerate}>
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
                <button className="copy-button" onClick={handleCopy}>
                  {copied ? `✓ ${t('share.copied')}` : `📋 ${t('share.copy')}`}
                </button>
              </div>
            </div>
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
