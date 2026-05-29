import { Alert, AlertVariant } from '@patternfly/react-core';

interface InlineAlertProps {
  title: string;
  variant?: 'custom' | 'danger' | 'info' | 'success' | 'warning';
}

const variantMap: Record<NonNullable<InlineAlertProps['variant']>, AlertVariant> = {
  custom: AlertVariant.custom,
  danger: AlertVariant.danger,
  info: AlertVariant.info,
  success: AlertVariant.success,
  warning: AlertVariant.warning,
};

const InlineAlert = ({ title, variant = 'info' }: InlineAlertProps) => (
  <Alert isInline title={title} variant={variantMap[variant]} />
);

export default InlineAlert;
