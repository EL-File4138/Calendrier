import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Dropdown,
  DropdownList,
  DropdownItem,
  MenuToggle,
  Form,
  FormGroup,
  TextInput,
  Button,
  Label,
  Spinner
} from '@patternfly/react-core';
import { UserIcon } from '@patternfly/react-icons';
import { useCalendar } from '../context/CalendarContext';
import { calendarAPI } from '../api/client';
import { CopyableId } from './CopyableId';
import './UserPanel.css';

export const UserPanel = () => {
  const { t } = useTranslation();
  const {
    userId,
    syncMode,
    isSyncing,
    lastSyncError,
  } = useCalendar();

  const [showPanel, setShowPanel] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [activationToken, setActivationToken] = useState('');
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  const handleCreateUser = async () => {
    if (!activationToken.trim()) {
      alert(t('userPanel.enterToken'));
      return;
    }

    setIsCreatingUser(true);
    try {
      const result = await calendarAPI.createUser(
        activationToken.trim(),
        displayName || undefined
      );

      if (result.success && result.userId && result.sessionToken) {
        // Store user ID and mark as registered
        localStorage.setItem('calendrier-user-id', result.userId);
        localStorage.setItem('calendrier-session-token', result.sessionToken);
        localStorage.setItem('calendrier-user-registered', 'true');
        setDisplayName('');
        setActivationToken('');
        alert(t('userPanel.accountCreated'));
        // Reload to update context
        window.location.reload();
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(t('userPanel.createFailed', { error: errorMessage }));
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
    <Dropdown
      isOpen={showPanel}
      onOpenChange={setShowPanel}
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          onClick={() => setShowPanel(!showPanel)}
          isExpanded={showPanel}
          title={t('userPanel.userStatus')}
          className="user-panel-toggle"
        >
          <span className={`user-panel-status user-panel-status--${getStatusColor()}`} aria-hidden="true" />
          <UserIcon className="user-panel-toggle__icon" />
          <span className="user-panel-toggle__text">{getStatusText()}</span>
        </MenuToggle>
      )}
      className="user-panel-dropdown"
      popperProps={{ position: 'right' }}
    >
      <DropdownList>
        <DropdownItem component="div" className="user-panel-content-item" isDisabled>
          {!userId ? (
            <div className="user-section">
              <div className="user-section__header">
                <UserIcon />
                <div>
                  <h4>{t('userPanel.createAccount')}</h4>
                  <p>
                    {t('userPanel.createAccountHelp')}
                  </p>
                </div>
              </div>
              <Form className="user-panel-form">
                <FormGroup label={t('userPanel.tokenPlaceholder')} isRequired>
                  <TextInput
                    type="text"
                    value={activationToken}
                    onChange={(_event, value) => setActivationToken(value)}
                    placeholder={t('userPanel.tokenPlaceholder')}
                  />
                </FormGroup>
                <FormGroup label={t('userPanel.displayNamePlaceholder')}>
                  <TextInput
                    type="text"
                    value={displayName}
                    onChange={(_event, value) => setDisplayName(value)}
                    placeholder={t('userPanel.displayNamePlaceholder')}
                  />
                </FormGroup>
                <Button
                  variant="primary"
                  onClick={handleCreateUser}
                  isDisabled={isCreatingUser || !activationToken.trim()}
                  isLoading={isCreatingUser}
                >
                  {isCreatingUser ? t('userPanel.creating') : t('userPanel.createAccount')}
                </Button>
              </Form>
              <p className="user-section__note">
                {t('userPanel.footerNoUser')}
              </p>
            </div>
          ) : (
            <div className="user-section">
              <div className="user-section__header">
                <UserIcon />
                <div>
                  <h4>{getStatusText()}</h4>
                  <p>
                    {syncMode === 'server' ? t('userPanel.modeServer') : t('userPanel.modeLocal')}
                  </p>
                </div>
              </div>

              <div className="user-panel-card">
                <CopyableId id={userId} label={t('userPanel.userIdLabel')} displayLength={0} />
              </div>

              <div className="user-panel-status-grid">
                <div className="user-panel-status-item">
                  <span>{t('userPanel.statusLabel')}</span>
                  <Label color="green">{t('userPanel.statusRegistered')}</Label>
                </div>
                <div className="user-panel-status-item">
                  <span>{t('userPanel.modeLabel')}</span>
                  <Label color={syncMode === 'server' ? 'blue' : 'grey'}>
                    {syncMode === 'server' ? t('userPanel.modeServer') : t('userPanel.modeLocal')}
                  </Label>
                </div>
              </div>

              {isSyncing && (
                <div className="user-panel-syncing">
                  <Spinner size="sm" />
                  <span>{t('userPanel.syncing')}</span>
                </div>
              )}
              {lastSyncError && (
                <Alert variant="danger" isInline title={t('userPanel.syncError', { error: lastSyncError })} />
              )}
              <p className="user-section__note">
                {t('userPanel.footerHasUser')}
              </p>
            </div>
          )}
        </DropdownItem>
      </DropdownList>
    </Dropdown>
  );
};
