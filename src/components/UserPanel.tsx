import TextInput from './ValidatedTextInput';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Form,
  FormGroup,
  Button,
  Label,
  Spinner,
  Popover,
  PopoverPosition,
} from '@patternfly/react-core';
import { UserIcon } from '@patternfly/react-icons';
import { useCalendar } from '../context/CalendarContext';
import { calendarAPI } from '../api/client';
import { CopyableId } from './CopyableId';
import InlineAlert from './InlineAlert';
import './UserPanel.css';

export const UserPanel = () => {
  const { t } = useTranslation();
  const {
    userId,
    syncMode,
    isSyncing,
    lastSyncError,
    dismissSyncError,
    registerUserSession,
  } = useCalendar();

  const [tokenSubmitted, setTokenSubmitted] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [activationToken, setActivationToken] = useState('');
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [feedback, setFeedback] = useState<{ title: string; variant: 'danger' | 'success' } | null>(null);

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
    <Popover
      isVisible={showPanel}
      shouldClose={() => setShowPanel(false)}
      aria-label={t('userPanel.userStatus')}
      headerContent={!userId ? t('userPanel.createAccount') : getStatusText()}
      headerIcon={<UserIcon aria-hidden="true" />}
      closeBtnAriaLabel={t('share.close')}
      footerContent={t(userId ? 'userPanel.footerHasUser' : 'userPanel.footerNoUser')}
      bodyContent={
        <div className="user-section">
          {!userId ? (
            <>
              <p>{t('userPanel.createAccountHelp')}</p>
              {feedback && <InlineAlert onClose={() => setFeedback(null)} title={feedback.title} variant={feedback.variant} />}
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
                  isDisabled={isCreatingUser}
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
  );
};
