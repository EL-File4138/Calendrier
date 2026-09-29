import TextInput from './ValidatedTextInput';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Form,
  FormGroup,
  Button,
  ButtonVariant,
  Label,
  Spinner,
  Popover,
  PopoverPosition,
} from '@patternfly/react-core';
import { UserIcon } from '@patternfly/react-icons';
import { useCalendar } from '../context/CalendarContext';
import { calendarAPI, WORKER_URL } from '../api/client';
import { MAX_CREDENTIAL_FILE_BYTES, parseCredentials, type CredentialBackup } from '../utils/credentials';
import { CopyableId } from './CopyableId';
import InlineAlert from './InlineAlert';
import ConfirmDialog from './ConfirmDialog';
import './UserPanel.css';

export const UserPanel = () => {
  const { t } = useTranslation();
  const {
    userId,
    sessionToken,
    syncMode,
    isSyncing,
    lastSyncError,
    dismissSyncError,
    registerUserSession,
    workOffline,
    logout,
  } = useCalendar();

  const [tokenSubmitted, setTokenSubmitted] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [activationToken, setActivationToken] = useState('');
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [feedback, setFeedback] = useState<{ title: string; variant: 'danger' | 'success' } | null>(null);
  const credentialInput = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [confirmation, setConfirmation] = useState<'exportCredentials' | 'importCredentials' | 'workOffline' | 'logout' | null>(null);
  const confirmAction = (action: NonNullable<typeof confirmation>) => {
    setShowPanel(false);
    setConfirmation(action);
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      setFeedback({ title: t('userPanel.loggedOut'), variant: 'success' });
    } catch {
      setFeedback({ title: t('userPanel.logoutFailed'), variant: 'danger' });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const exportCredentials = () => {
    if (!userId || !sessionToken) return;
    const backup: CredentialBackup = { format: 'calendrier-credentials', version: 1, serverUrl: WORKER_URL, userId, sessionToken };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'calendrier-credentials.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importCredentials = async (file: File) => {
    setIsImporting(true);
    try {
      if (file.size > MAX_CREDENTIAL_FILE_BYTES) throw new Error('File too large');
      const backup = parseCredentials(await file.text(), WORKER_URL);
      await registerUserSession(backup.userId, backup.sessionToken);
      setFeedback({ title: t('userPanel.credentialsImported'), variant: 'success' });
    } catch {
      setFeedback({ title: t('userPanel.credentialsImportFailed'), variant: 'danger' });
    } finally {
      setIsImporting(false);
    }
  };

  const handleCreateUser = async () => {
    setTokenSubmitted(true);
    if (!activationToken.trim()) {
      document.getElementById('account-activation-token')?.focus();
      return;
    }

    setIsCreatingUser(true);
    try {
        const result = await calendarAPI.createUser(
          activationToken.trim(),
          displayName || undefined
        );

        if (result.success && result.userId && result.sessionToken) {
          await registerUserSession(result.userId, result.sessionToken);
          setDisplayName('');
          setActivationToken('');
          setFeedback({ title: t('userPanel.accountCreated'), variant: 'success' });
          setShowPanel(false);
        }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setFeedback({ title: t('userPanel.createFailed', { error: errorMessage }), variant: 'danger' });
    } finally {
      setIsCreatingUser(false);
    }
  };

  const getStatusColor = () => {
    if (!userId) return 'grey';
    if (syncMode === 'server') return 'green';
    return 'blue';
  };

  const getStatusText = () => {
    if (!userId) return t('userPanel.statusNoUser');
    if (syncMode === 'server') return t('userPanel.statusSynced');
    return t('userPanel.statusRegistered');
  };

  return (
    <>
    <Popover
      isVisible={showPanel}
      shouldClose={() => setShowPanel(false)}
      aria-label={t('userPanel.userStatus')}
      headerContent={!userId ? t('userPanel.createAccount') : getStatusText()}
      headerIcon={<UserIcon aria-hidden="true" />}
      closeBtnAriaLabel={t('share.close')}
      bodyContent={
        <div className="user-section">
          {feedback && <InlineAlert onClose={() => setFeedback(null)} title={feedback.title} variant={feedback.variant} />}
          {!userId ? (
            <>
              <p>{t('userPanel.createAccountHelp')}</p>
              <Form className="user-panel-form" noValidate onSubmit={(event) => { event.preventDefault(); void handleCreateUser(); }}>
                <FormGroup label={t('userPanel.tokenPlaceholder')} fieldId="account-activation-token" isRequired>
                  <TextInput
                    error={tokenSubmitted && !activationToken.trim() ? t('userPanel.enterToken') : undefined} id="account-activation-token"
                    isRequired
                    type="text"
                    value={activationToken}
                    onChange={(_event, value) => setActivationToken(value)}
                    placeholder={t('userPanel.tokenPlaceholder')}
                  />
                </FormGroup>
                <FormGroup label={t('userPanel.displayNamePlaceholder')} fieldId="account-display-name">
                  <TextInput
                    id="account-display-name"
                    type="text"
                    value={displayName}
                    onChange={(_event, value) => setDisplayName(value)}
                    placeholder={t('userPanel.displayNamePlaceholder')}
                  />
                </FormGroup>
                <Button
                  variant="primary"
                  type="submit"
                   isDisabled={isCreatingUser || isImporting || isLoggingOut}
                  isLoading={isCreatingUser}
                >
                  {isCreatingUser ? t('userPanel.creating') : t('userPanel.createAccount')}
                </Button>
              </Form>
            </>
          ) : (
            <>
              <div className="user-panel-meta-list">
                <div className="user-panel-meta-row">
                  <span>{t('userPanel.statusLabel')}</span>
                  <Label color="green">{t('userPanel.statusRegistered')}</Label>
                </div>
                <div className="user-panel-meta-row">
                  <span>{t('userPanel.modeLabel')}</span>
                  <Label color={syncMode === 'server' ? 'blue' : 'grey'}>
                    {syncMode === 'server' ? t('userPanel.modeServer') : t('userPanel.modeLocal')}
                  </Label>
                </div>
                <CopyableId id={userId} label={t('userPanel.userIdLabel')} displayLength={0} className="user-panel-copyable" />
              </div>

              {isSyncing && (
                <div className="user-panel-syncing">
                  <Spinner size="sm" />
                  <span>{t('userPanel.syncing')}</span>
                </div>
              )}
              {lastSyncError && (
                <InlineAlert onClose={dismissSyncError} variant="danger" title={t('userPanel.syncError', { error: lastSyncError })} />
              )}
            </>
          )}
          <div className="user-panel-form">
            <div className="user-panel-credential-actions">
              {userId && sessionToken && <Button variant="secondary" onClick={() => confirmAction('exportCredentials')}>{t('userPanel.exportCredentials')}</Button>}
              <Button variant="secondary" isDisabled={syncMode === 'server' || isImporting || isCreatingUser || isLoggingOut} isLoading={isImporting} onClick={() => confirmAction('importCredentials')}>{t('userPanel.importCredentials')}</Button>
            </div>
            {syncMode === 'server' && <p>{t('userPanel.credentialsLocalOnly')}</p>}
            {syncMode === 'server' && <>
              <Button className="user-panel-account-action" variant="secondary" onClick={() => confirmAction('workOffline')}>{t('userPanel.workOffline')}</Button>
            </>}
            {userId && <>
              <Button className="user-panel-account-action" variant="danger" isDisabled={isLoggingOut || isImporting} isLoading={isLoggingOut} onClick={() => confirmAction('logout')}>{t('userPanel.logout')}</Button>
            </>}
          </div>
        </div>
      }
      position={PopoverPosition.bottomEnd}
      flipBehavior={['bottom-end', 'bottom-start', 'top-end', 'top-start', 'bottom', 'top']}
      className="user-panel-popover"
    >
      <Button
        variant="plain"
        className="user-panel-toggle"
        onClick={() => setShowPanel((value) => !value)}
        aria-label={t('userPanel.userStatus')}
        aria-expanded={showPanel}
      >
        <span className="user-panel-toggle__content">
        <span className={`user-panel-status user-panel-status--${getStatusColor()}`} aria-hidden="true" />
        <UserIcon className="user-panel-toggle__icon" />
        <span className="user-panel-toggle__text">{getStatusText()}</span>
        </span>
      </Button>
    </Popover>
    <input ref={credentialInput} type="file" accept=".json,application/json" hidden onChange={(event) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      if (file) { setShowPanel(true); void importCredentials(file); }
    }} />
    {confirmation && <ConfirmDialog
      title={t(`userPanel.${confirmation}`)}
      message={t(`userPanel.${confirmation === 'workOffline' ? 'offlineHelp' : confirmation === 'logout' ? 'logoutHelp' : `${confirmation}Confirm`}`)}
      confirmText={t(`userPanel.${confirmation}`)}
      confirmVariant={confirmation === 'logout' ? ButtonVariant.danger : ButtonVariant.primary}
      cancelText={t('settings.cancel')}
      onCancel={() => { setConfirmation(null); setShowPanel(true); }}
      onConfirm={() => {
        const action = confirmation;
        setConfirmation(null);
        setShowPanel(true);
        if (action === 'exportCredentials') exportCredentials();
        else if (action === 'importCredentials') credentialInput.current?.click();
        else if (action === 'workOffline') workOffline();
        else void handleLogout();
      }}
    />}
    </>
  );
};
