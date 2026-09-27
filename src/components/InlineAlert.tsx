import { Alert, AlertActionCloseButton, AlertVariant } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';

interface InlineAlertProps {
  title: string;
  onClose: () => void;
  variant?: 'custom' | 'danger' | 'info' | 'success' | 'warning';
}

const variantMap: Record<NonNullable<InlineAlertProps['variant']>, AlertVariant> = {
  custom: AlertVariant.custom,
  danger: AlertVariant.danger,
  info: AlertVariant.info,
  success: AlertVariant.success,
  warning: AlertVariant.warning,
};

const InlineAlert = ({ title, variant = 'info', onClose }: InlineAlertProps) => {
  const { t } = useTranslation();
  return <Alert isInline title={title} variant={variantMap[variant]} variantLabel={t(`notifications.${variant}`)} actionClose={<AlertActionCloseButton aria-label={t('notifications.close')} onClose={onClose} />} />;
};

export default InlineAlert;
