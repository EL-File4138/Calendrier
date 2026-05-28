import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  ModalVariant,
  ModalBody,
  ModalFooter,
  Button,
  ButtonVariant,
  Divider,
  Form,
  FormGroup,
  TextInput,
  FormSection,
  FormSelect,
  FormSelectOption,
  Alert,
  Spinner,
  Label,
  ClipboardCopy,
} from '@patternfly/react-core';
import { useCalendar } from '../context/CalendarContext';
import { CopyableId } from './CopyableId';
import './ShareDialog.css';

interface ShareDialogProps {
  onClose: () => void;
}

const ShareDialog = ({ onClose }: ShareDialogProps) => {
  const { t } = useTranslation();
  const { syncMode, calendarId, userId, grantAccess, revokeAccess, listPrivileges } = useCalendar();

  // Legacy URL-based sharing
  const [url, setUrl] = useState('');
  const [shareUrl, setShareUrl] = useState('');

  // Server-based sharing
  const [targetUserId, setTargetUserId] = useState('');
  const [privilegeLevel, setPrivilegeLevel] = useState<'read' | 'write' | 'owner'>('read');
  const [isGranting, setIsGranting] = useState(false);
  const [privileges, setPrivileges] = useState<Array<{userId: string; level: string; grantedAt: number; grantedBy: string}>>([]);
  const [isLoadingPrivileges, setIsLoadingPrivileges] = useState(false);

  // Load privileges when dialog opens in server mode
  useEffect(() => {
    if (syncMode === 'server' && calendarId && userId) {
      loadPrivileges();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncMode, calendarId, userId]);

  const loadPrivileges = async () => {
    setIsLoadingPrivileges(true);
    try {
      const privs = await listPrivileges();
      setPrivileges(privs);
    } catch (error: unknown) {
      console.error('Failed to load privileges:', error);
    } finally {
      setIsLoadingPrivileges(false);
    }
  };

  const handleGenerateLegacy = () => {
    if (!url.trim()) {
      alert(t('share.enterUrl'));
      return;
    }

    try {
      // Validate URL
      const testUrl = new URL(url.trim());
      if (!['http:', 'https:'].includes(testUrl.protocol)) {
        alert(t('share.invalidProtocol'));
        return;
      }

      // Encode URL to base64
      const base64Url = btoa(url.trim());

      // Get current location with pathname
      const currentOrigin = window.location.origin;
      const currentPath = window.location.pathname.replace(/\/index\.html$/, '');
      const basePath = currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;

      // Generate share URL
      const generatedUrl = `${currentOrigin}${basePath}/?import=${base64Url}`;
      setShareUrl(generatedUrl);
    } catch {
      alert(t('share.invalidFormat'));
    }
  };

  const handleGrantAccess = async () => {
    if (!targetUserId.trim()) {
      alert(t('shareDialog.serverMode.enterUserId'));
      return;
    }

    setIsGranting(true);
    try {
      const success = await grantAccess(targetUserId.trim(), privilegeLevel);
      if (success) {
        alert(t('shareDialog.serverMode.grantSuccess', { userId: targetUserId.substring(0, 8) }));
        setTargetUserId('');
        await loadPrivileges();
      } else {
        alert(t('shareDialog.serverMode.grantFailed'));
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(t('shareDialog.serverMode.error', { error: errorMessage }));
    } finally {
      setIsGranting(false);
    }
  };

  const handleRevokeAccess = async (targetUserId: string) => {
    const isSelfRevoke = targetUserId === userId;
    const confirmMessage = isSelfRevoke
      ? t('shareDialog.serverMode.leaveConfirm')
      : t('shareDialog.serverMode.revokeConfirm', { userId: targetUserId.substring(0, 8) + '...' });

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const result = await revokeAccess(targetUserId);
      if (result.success) {
        if (isSelfRevoke) {
          alert(t('shareDialog.serverMode.leaveSuccess'));
          onClose();
        } else {
          alert(t('shareDialog.serverMode.revokeSuccess'));
          await loadPrivileges();
        }
      } else {
        alert(result.message || t('shareDialog.serverMode.revokeFailed'));
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(t('shareDialog.serverMode.error', { error: errorMessage }));
    }
  };

  const getCalendarShareUrl = () => {
    if (!calendarId) return '';
    const currentOrigin = window.location.origin;
    const currentPath = window.location.pathname.replace(/\/index\.html$/, '');
    const basePath = currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;
    return `${currentOrigin}${basePath}/?calendar=${calendarId}`;
  };

  return (
    <Modal
      variant={ModalVariant.large}
      title={syncMode === 'server' ? t('shareDialog.serverMode.title') : t('share.title')}
      isOpen={true}
      onClose={onClose}
    >
      <ModalBody>
        {syncMode === 'server' && calendarId ? (
        <Form className="share-dialog-form">
          {/* Server-based sharing */}
          <FormSection title={t('shareDialog.serverMode.calendarLink')} className="share-dialog-section">
            <p className="share-dialog-section__description">
              {t('shareDialog.serverMode.calendarLinkDescription')}
            </p>
            <div className="share-dialog-copy-row">
              <span className="share-dialog-copy-label">{t('shareDialog.serverMode.calendarLink')}</span>
              <ClipboardCopy
                isReadOnly
                isCode
                variant="inline-compact"
                hoverTip={t('share.copy')}
                clickTip={t('share.copied')}
                className="share-dialog-inline-copy"
              >
                {getCalendarShareUrl()}
              </ClipboardCopy>
            </div>
            <div className="share-dialog-copy-row">
              <CopyableId id={calendarId} label="Calendar ID:" displayLength={0} />
            </div>
          </FormSection>

          <Divider className="pf-v6-u-my-md" />

          <FormSection title={t('shareDialog.serverMode.grantAccess')} className="share-dialog-section">
            <p className="share-dialog-section__description">
              {t('shareDialog.serverMode.grantAccessDescription')}
            </p>
            <div className="share-dialog-grant-form">
              <FormGroup label={t('shareDialog.serverMode.userId')} isRequired fieldId="target-user-id">
                <TextInput
                  id="target-user-id"
                  type="text"
                  placeholder={t('shareDialog.serverMode.userIdPlaceholder')}
                  value={targetUserId}
                  onChange={(_event, value) => setTargetUserId(value)}
                />
              </FormGroup>
              <FormGroup label={t('shareDialog.serverMode.accessLevel')} fieldId="privilege-level">
                <FormSelect
                  id="privilege-level"
                  value={privilegeLevel}
                  onChange={(_event, value) => setPrivilegeLevel(value as 'read' | 'write' | 'owner')}
                >
                  <FormSelectOption value="read" label={t('shareDialog.serverMode.accessLevelRead')} />
                  <FormSelectOption value="write" label={t('shareDialog.serverMode.accessLevelWrite')} />
                  <FormSelectOption value="owner" label={t('shareDialog.serverMode.accessLevelOwner')} />
                </FormSelect>
              </FormGroup>
              <Button
                variant={ButtonVariant.primary}
                onClick={handleGrantAccess}
                isDisabled={isGranting || !targetUserId.trim()}
                isLoading={isGranting}
              >
                {isGranting ? t('shareDialog.serverMode.granting') : t('shareDialog.serverMode.grantButton')}
              </Button>
            </div>
          </FormSection>

          <Divider className="pf-v6-u-my-md" />

          <FormSection title={t('shareDialog.serverMode.currentAccess')} className="share-dialog-section">
            <p className="share-dialog-section__description">
              {t('shareDialog.serverMode.currentAccessDescription')}
            </p>
            {isLoadingPrivileges ? (
              <div className="pf-v6-u-display-flex pf-v6-u-align-items-center">
                <Spinner size="md" className="pf-v6-u-mr-sm" />
                <span>{t('shareDialog.serverMode.loading')}</span>
              </div>
            ) : privileges.length === 0 ? (
              <Alert variant="info" isInline title={t('shareDialog.serverMode.noAccess')} />
            ) : (
              <div className="share-dialog-access-list">
                {privileges.map((priv) => (
                  <div key={priv.userId} className="share-dialog-access-row">
                    <div className="share-dialog-user-cell">
                      <CopyableId id={priv.userId} label="User" displayLength={0} />
                      <div className="share-dialog-user-meta">
                        {priv.userId === userId && (
                          <Label color="blue">{t('shareDialog.serverMode.selfBadge')}</Label>
                        )}
                      </div>
                    </div>
                    <Label color={priv.level === 'owner' ? 'purple' : priv.level === 'write' ? 'green' : 'grey'}>
                      {priv.level}
                    </Label>
                    <Button
                      variant={priv.userId === userId ? ButtonVariant.secondary : ButtonVariant.danger}
                      isDanger={priv.userId !== userId}
                      onClick={() => handleRevokeAccess(priv.userId)}
                    >
                      {priv.userId === userId ? t('shareDialog.serverMode.leaveButton') : t('shareDialog.serverMode.revokeButton')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </FormSection>
        </Form>
      ) : (
        <>
          {/* Legacy URL-based sharing */}
          <p className="pf-v6-u-mb-md pf-v6-u-color-200">
            {t('share.description')}
          </p>

          <Form>
            <FormGroup
              label={t('share.calendarUrl')}
              isRequired
              fieldId="calendar-url"
            >
              <TextInput
                id="calendar-url"
                type="text"
                placeholder={t('share.urlPlaceholder')}
                value={url}
                onChange={(_event, value) => setUrl(value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleGenerateLegacy();
                  }
                }}
              />
            </FormGroup>

            <Button variant={ButtonVariant.primary} onClick={handleGenerateLegacy}>
              {t('share.generate')}
            </Button>
          </Form>

          {shareUrl && (
            <div className="pf-v6-u-mt-md">
              <FormGroup label={t('share.shareLink')} fieldId="share-link">
                <ClipboardCopy isReadOnly hoverTip={t('share.copy')} clickTip={t('share.copied')}>
                  {shareUrl}
                </ClipboardCopy>
              </FormGroup>
            </div>
          )}

          {!userId && (
            <Alert variant="info" isInline title={t('shareDialog.tip.title')} className="pf-v6-u-mt-md">
              {t('shareDialog.tip.message')}
            </Alert>
          )}
        </>
      )}
      </ModalBody>
      <ModalFooter>
        <Button key="close" variant={ButtonVariant.link} onClick={onClose}>
          {t('share.close')}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default ShareDialog;
