import { useTranslation } from 'react-i18next';
import { TextInput, FormHelperText, HelperText, HelperTextItem } from '@patternfly/react-core';
import type { TextInputProps } from '@patternfly/react-core';

type Props = TextInputProps & { id: string; error?: string };

export default function ValidatedTextInput({ error, id, ...props }: Props) {
  const { t } = useTranslation();
  return <>
    <TextInput {...props} id={id} validated={error ? 'error' : 'default'} aria-invalid={!!error}
      aria-describedby={[props['aria-describedby'], error ? `${id}-error` : undefined].filter(Boolean).join(' ') || undefined} />
    {error && <FormHelperText><HelperText><HelperTextItem id={`${id}-error`} variant="error" screenReaderText={t('notifications.danger')} role="alert">{error}</HelperTextItem></HelperText></FormHelperText>}
  </>;
}
