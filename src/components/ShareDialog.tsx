import { useState } from 'react';
import './ShareDialog.css';

interface ShareDialogProps {
  onClose: () => void;
}

const ShareDialog = ({ onClose }: ShareDialogProps) => {
  const [url, setUrl] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    if (!url.trim()) {
      alert('Please enter a URL');
      return;
    }

    try {
      // Validate URL
      const testUrl = new URL(url.trim());
      if (!['http:', 'https:'].includes(testUrl.protocol)) {
        alert('Invalid URL protocol. Only HTTP and HTTPS are allowed.');
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
      alert('Invalid URL format');
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
          <h2>Share Calendar</h2>
          <button className="close-button" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="share-body">
          <p className="share-description">
            Enter the URL of your calendar JSON file to generate a shareable link.
          </p>

          <div className="form-group">
            <label htmlFor="calendar-url">
              Calendar JSON URL <span className="required">*</span>
            </label>
            <input
              id="calendar-url"
              type="text"
              placeholder="https://example.com/calendar.json"
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
            Generate Share Link
          </button>

          {shareUrl && (
            <div className="share-result">
              <label>Share Link:</label>
              <div className="share-url-container">
                <input
                  type="text"
                  value={shareUrl}
                  readOnly
                  className="share-url-input"
                />
                <button className="copy-button" onClick={handleCopy}>
                  {copied ? '✓ Copied' : '📋 Copy'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="share-footer">
          <button className="cancel-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareDialog;
