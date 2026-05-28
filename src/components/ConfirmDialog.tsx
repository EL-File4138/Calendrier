import { Modal, ModalVariant, Button, ButtonVariant, ModalBody, ModalFooter } from '@patternfly/react-core';

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
    <Modal
      variant={ModalVariant.small}
      title={title}
      isOpen={true}
      onClose={onCancel}
    >
      <ModalBody>
        <p>{message}</p>
      </ModalBody>
      <ModalFooter>
        <Button key="confirm" variant={ButtonVariant.primary} onClick={onConfirm}>
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
