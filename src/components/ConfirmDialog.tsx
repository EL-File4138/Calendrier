import './ConfirmDialog.css';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  showSecondaryAction?: boolean;
  secondaryActionText?: string;
  onSecondaryAction?: () => void;
}

const ConfirmDialog = ({
  title,
  message,
  confirmText = 'OK',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  showSecondaryAction = false,
  secondaryActionText = '',
  onSecondaryAction,
}: ConfirmDialogProps) => {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
        </div>

        <div className="confirm-body">
          <p>{message}</p>
        </div>

        <div className="confirm-footer">
          <button className="cancel-button" onClick={onCancel}>
            {cancelText}
          </button>
          {showSecondaryAction && onSecondaryAction && (
            <button className="secondary-button" onClick={onSecondaryAction}>
              {secondaryActionText}
            </button>
          )}
          <button className="submit-button" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
