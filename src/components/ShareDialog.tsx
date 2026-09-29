import TextInput from './ValidatedTextInput';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  ButtonVariant,
  Divider,
  Form,
  FormGroup,
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
import { calendarAPI } from '../api/client';
import { publicLinkUrl } from '../utils/publicLink';
import ConfirmDialog from './ConfirmDialog';
import InlineAlert from './InlineAlert';
import './ShareDialog.css';

interface ShareDialogProps {
  onClose: () => void;
}

const ShareDialog = ({ onClose }: ShareDialogProps) => {
  const { t } = useTranslation();
  const { syncMode, calendarId, userId, sessionToken, grantAccess, revokeAccess, listPrivileges } = useCalendar();

  // Legacy URL-based sharing
  const [url, setUrl] = useState('');
  const [shareUrl, setShareUrl] = useState('');

  // Server-based sharing
  const [targetUserId, setTargetUserId] = useState('');
  const [privilegeLevel, setPrivilegeLevel] = useState<'read' | 'write' | 'owner'>('read');
  const [isGranting, setIsGranting] = useState(false);
  const [privileges, setPrivileges] = useState<Array<{userId: string; level: string; grantedAt: number; grantedBy: string}>>([]);
  const [isLoadingPrivileges, setIsLoadingPrivileges] = useState(false);
  const [feedback, setFeedback] = useState<{ title: string; variant: 'danger' | 'success' | 'info' } | null>(null);
  const [pendingRevokeUserId, setPendingRevokeUserId] = useState<string | null>(null);
  const modalTitle = syncMode === 'server' ? t('shareDialog.serverMode.title') : t('share.title');

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

  const [urlError, setUrlError] = useState<string>();
  const [targetSubmitted, setTargetSubmitted] = useState(false);
  const invalidUrl = (key: string) => { setUrlError(key); document.getElementById('calendar-url')?.focus(); };

  const handleGenerateLegacy = () => {
    setUrlError(undefined);
    if (!url.trim()) {
      invalidUrl('share.enterUrl');
      return;
    }

    try {
      // Validate URL
      const testUrl = new URL(url.trim());
      if (!['http:', 'https:'].includes(testUrl.protocol)) {
        invalidUrl('share.invalidProtocol');
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
      invalidUrl('share.invalidFormat');
    }
  };

  const handleGrantAccess = async () => {
    setTargetSubmitted(true);
    if (!targetUserId.trim()) {
      document.getElementById('target-user-id')?.focus();
      return;
    }

    setIsGranting(true);
    try {
      const success = await grantAccess(targetUserId.trim(), privilegeLevel);
      if (success) {
        setFeedback({ title: t('shareDialog.serverMode.grantSuccess', { userId: targetUserId.substring(0, 8) }), variant: 'success' });
        setTargetUserId('');
        await loadPrivileges();
      } else {
        setFeedback({ title: t('shareDialog.serverMode.grantFailed'), variant: 'danger' });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setFeedback({ title: t('shareDialog.serverMode.error', { error: errorMessage }), variant: 'danger' });
    } finally {
      setIsGranting(false);
    }
  };

  const handleRevokeAccess = async (targetUserId: string) => {
    const isSelfRevoke = targetUserId === userId;

    try {
      const result = await revokeAccess(targetUserId);
      if (result.success) {
        if (isSelfRevoke) {
          setFeedback({ title: t('shareDialog.serverMode.leaveSuccess'), variant: 'success' });
          onClose();
        } else {
          setFeedback({ title: t('shareDialog.serverMode.revokeSuccess'), variant: 'success' });
          await loadPrivileges();
        }
      } else {
        setFeedback({ title: result.message || t('shareDialog.serverMode.revokeFailed'), variant: 'danger' });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setFeedback({ title: t('shareDialog.serverMode.error', { error: errorMessage }), variant: 'danger' });
    }
  };

  const getCalendarShareUrl = () => {
    if (!calendarId) return '';
    const currentOrigin = window.location.origin;
    const currentPath = window.location.pathname.replace(/\/index\.html$/, '');
    const basePath = currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;
    return `${currentOrigin}${basePath}/?calendar=${calendarId}`;
  };

  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [publicId, setPublicId] = useState<string | null>(null);
  const [publicBusy, setPublicBusy] = useState(false);
  const isOwner = privileges.some((priv) => priv.userId === userId && priv.level === 'owner');
  const publicUrl = publicToken && publicId ? publicLinkUrl(publicId, publicToken) : '';
  const publicAction = async (action: 'status' | 'create' | 'revoke' | 'purge') => {
    if (!calendarId || !userId || !sessionToken) return;
    setPublicBusy(true);
    try {
      const result = await calendarAPI.managePublicLink(calendarId, userId, sessionToken, action);
      setPublicToken(result.token);
      setPublicId(result.publicId);
      setFeedback({ title: t(`shareDialog.public.${action}Success`), variant: 'success' });
    } catch {
      setFeedback({ title: t('shareDialog.public.error'), variant: 'danger' });
    } finally { setPublicBusy(false); }
  };
  useEffect(() => {
    if (!isOwner || !calendarId || !userId || !sessionToken) return;
    let active = true;
    calendarAPI.managePublicLink(calendarId, userId, sessionToken, 'status')
      .then((result) => {
        if (active) { setPublicToken(result.token); setPublicId(result.publicId); }
      })
      .catch(() => { /* Status is best-effort; owner can create a fresh link. */ });
    return () => { active = false; };
  }, [calendarId, isOwner, sessionToken, userId]);

  return (
    <Modal
      variant={ModalVariant.large}
      aria-labelledby="share-dialog-title"
      isOpen={true}
      onClose={onClose}
    >
      <ModalHeader title={modalTitle} labelId="share-dialog-title" />
      <ModalBody>
        {syncMode === 'server' && calendarId ? (
        <Form className="share-dialog-form">
          {feedback && <InlineAlert onClose={() => setFeedback(null)} title={feedback.title} variant={feedback.variant} />}
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
              <CopyableId id={calendarId} label={t('shareDialog.serverMode.calendarId')} displayLength={0} />
            </div>
            {isOwner && <>
               <Divider className="share-dialog-divider" />
               <FormSection title={t('shareDialog.public.title')} className="share-dialog-subsection">
                <p className="share-dialog-section__description">{t('shareDialog.public.description')}</p>
                {publicUrl && <ClipboardCopy isReadOnly isCode variant="inline-compact" hoverTip={t('share.copy')} clickTip={t('share.copied')}>{publicUrl}</ClipboardCopy>}
                <div className="share-dialog-public-actions">
                  <Button variant={ButtonVariant.primary} onClick={() => publicAction(publicToken ? 'revoke' : 'create')} isDisabled={publicBusy} isLoading={publicBusy}>
                    {publicToken ? t('shareDialog.public.revoke') : t('shareDialog.public.create')}
                  </Button>
                   {publicToken && <Button variant={ButtonVariant.secondary} onClick={() => publicAction('purge')} isDisabled={publicBusy}>{t('shareDialog.public.purge')}</Button>}
                </div>
              </FormSection>
            </>}
          </FormSection>

           <Divider className="share-dialog-divider" />

          <FormSection title={t('shareDialog.serverMode.grantAccess')} className="share-dialog-section">
            <p className="share-dialog-section__description">
              {t('shareDialog.serverMode.grantAccessDescription')}
            </p>
            <div className="share-dialog-grant-form">
              <FormGroup label={t('shareDialog.serverMode.userId')} isRequired fieldId="target-user-id">
                <TextInput
                  error={targetSubmitted && !targetUserId.trim() ? t('shareDialog.serverMode.enterUserId') : undefined} id="target-user-id"
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
                isDisabled={isGranting}
                isLoading={isGranting}
              >
                {isGranting ? t('shareDialog.serverMode.granting') : t('shareDialog.serverMode.grantButton')}
              </Button>
            </div>
          </FormSection>

           <Divider className="share-dialog-divider" />

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
              <Alert variantLabel={t("notifications.info")} variant="info" isInline title={t('shareDialog.serverMode.noAccess')} />
            ) : (
              <div className="share-dialog-access-list">
                {privileges.map((priv) => (
                  <div key={priv.userId} className="share-dialog-access-row">
                    <div className="share-dialog-user-cell">
                      <CopyableId id={priv.userId} label={t('shareDialog.serverMode.userLabel')} displayLength={0} />
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
                      onClick={() => setPendingRevokeUserId(priv.userId)}
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

           <Form className="share-dialog-form share-dialog-legacy-form" noValidate onSubmit={(event) => { event.preventDefault(); handleGenerateLegacy(); }}>
            <FormGroup
              label={t('share.calendarUrl')}
              isRequired
              fieldId="calendar-url"
            >
              <TextInput
                error={urlError ? t(urlError) : undefined} id="calendar-url"
                type="text"
                placeholder={t('share.urlPlaceholder')}
                value={url}
                onChange={(_event, value) => { setUrl(value); setUrlError(undefined); }}

              />
            </FormGroup>

            <Button variant={ButtonVariant.primary} type="submit">
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
            <Alert variantLabel={t("notifications.info")} variant="info" isInline title={t('shareDialog.tip.title')} className="pf-v6-u-mt-md">
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
      {pendingRevokeUserId && (
        <ConfirmDialog
          title={pendingRevokeUserId === userId ? t('shareDialog.serverMode.leaveButton') : t('shareDialog.serverMode.revokeButton')}
          message={pendingRevokeUserId === userId
            ? t('shareDialog.serverMode.leaveConfirm')
            : t('shareDialog.serverMode.revokeConfirm', { userId: pendingRevokeUserId.substring(0, 8) + '...' })}
          confirmText={pendingRevokeUserId === userId ? t('shareDialog.serverMode.leaveButton') : t('shareDialog.serverMode.revokeButton')}
          cancelText={t('share.close')}
          confirmVariant={ButtonVariant.danger}
          onConfirm={async () => {
            const targetUserId = pendingRevokeUserId;
            setPendingRevokeUserId(null);
            await handleRevokeAccess(targetUserId);
          }}
          onCancel={() => setPendingRevokeUserId(null)}
        />
      )}
    </Modal>
  );
};

export default ShareDialog;
