import { ClipboardCopy } from '@patternfly/react-core';

interface CopyableIdProps {
  id: string;
  label?: string;
  displayLength?: number;
  className?: string;
  isCompact?: boolean;
}

export const CopyableId = ({ id, label, displayLength = 16, className = '', isCompact = false }: CopyableIdProps) => {
  const maxWidth = displayLength > 0 ? `${displayLength + 1}ch` : undefined;

  return (
    <div className={`copyable-id ${className}`.trim()}>
      {label && <span className="copyable-id__label"><strong>{label}</strong></span>}
      <ClipboardCopy
        isReadOnly
        hoverTip="Click to copy"
        clickTip="Copied!"
        variant="inline-compact"
        isCode
        className="copyable-id__value"
        style={isCompact && maxWidth ? {
          maxWidth,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        } : undefined}
      >
        {id}
      </ClipboardCopy>
    </div>
  );
};
