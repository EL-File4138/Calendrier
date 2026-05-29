import { Modal, ModalVariant, Button, ButtonVariant, ModalHeader, ModalBody, ModalFooter } from '@patternfly/react-core';

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
  confirmVariant?: ButtonVariant;
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
  confirmVariant = ButtonVariant.primary,
}: ConfirmDialogProps) => {
  return (
    <Modal
      variant={ModalVariant.small}
      aria-labelledby="confirm-dialog-title"
      isOpen={true}
      onClose={onCancel}
    >
      <ModalHeader title={title} labelId="confirm-dialog-title" />
      <ModalBody>
        <p>{message}</p>
      </ModalBody>
      <ModalFooter>
        <Button key="confirm" variant={confirmVariant} onClick={onConfirm}>
          {confirmText}
        </Button>
        {showSecondaryAction && onSecondaryAction && (
          <Button key="secondary" variant={ButtonVariant.secondary} onClick={onSecondaryAction}>
            {secondaryActionText}
          </Button>
        )}
        <Button key="cancel" variant={ButtonVariant.link} onClick={onCancel}>
          {cancelText}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default ConfirmDialog;
