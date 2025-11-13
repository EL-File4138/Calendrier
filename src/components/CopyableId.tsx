import { useState } from 'react';
import './CopyableId.css';

interface CopyableIdProps {
  id: string;
  label?: string;
  displayLength?: number;
  className?: string;
}

export const CopyableId = ({ id, label, displayLength = 16, className = '' }: CopyableIdProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(id)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => {
        console.error('Failed to copy to clipboard:', err);
        // Fallback: show error message or use older API
      });
  };

  const displayId = displayLength > 0 ? `${id.substring(0, displayLength)}...` : id;

  return (
    <div className={`copyable-id ${className}`}>
      {label && <span className="copyable-id-label">{label}</span>}
      <code
        className="copyable-id-code"
        onClick={handleCopy}
        title={`Click to copy: ${id}`}
      >
        {displayId}
        <span className="copy-icon">{copied ? '✓' : '📋'}</span>
      </code>
      {copied && <span className="copied-message">Copied!</span>}
    </div>
  );
};
