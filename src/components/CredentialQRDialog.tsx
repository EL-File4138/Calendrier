import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ModalVariant, ModalHeader, ModalBody, ModalFooter, Button } from '@patternfly/react-core';
import { QRCodeSVG } from 'qrcode.react';
import type { IScannerControls } from '@zxing/browser';
import { parseCredentials, type CredentialBackup } from '../utils/credentials';
import InlineAlert from './InlineAlert';
import './CredentialQRDialog.css';

interface Props {
  credentials?: CredentialBackup;
  serverUrl: string;
  onImport: (credentials: CredentialBackup) => Promise<void>;
  onClose: () => void;
  onExportFile: () => void;
  onImportFile: () => void;
}

export default function CredentialQRDialog({ credentials, serverUrl, onImport, onClose, onExportFile, onImportFile }: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanned, setScanned] = useState<CredentialBackup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const exporting = Boolean(credentials);

  useEffect(() => {
    if (exporting || !scanning) return;
    let cancelled = false;
    let stream: MediaStream | undefined;
    let controls: IScannerControls | undefined;
    const stop = () => {
      controls?.stop();
      stream?.getTracks().forEach(track => track.stop());
    };
    const start = async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          setError('cameraUnavailable');
          return;
        }
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        if (cancelled) return;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (cancelled || !videoRef.current) { stop(); return; }
        const reader = new BrowserQRCodeReader();
        controls = await reader.decodeFromStream(stream, videoRef.current, (result, _error, scanner) => {
          if (cancelled || !result) return;
          try {
            const backup = parseCredentials(result.getText(), serverUrl);
            cancelled = true;
            scanner.stop();
            stop();
            setError(null);
            setScanned(backup);
          } catch {
            setError('invalidQR');
          }
        });
        if (cancelled) stop();
      } catch {
        stop();
        if (!cancelled) setError('cameraFailed');
      }
    };
    void start();
    return () => { cancelled = true; stop(); };
  }, [exporting, scanning, serverUrl]);

  const importScanned = async () => {
    if (!scanned) return;
    setImporting(true);
    try {
      await onImport(scanned);
      onClose();
    } catch {
      setError('credentialsImportFailed');
      setImporting(false);
    }
  };

  return <Modal variant={ModalVariant.small} isOpen onClose={importing ? undefined : onClose} aria-labelledby="credential-qr-title">
    <ModalHeader title={t(`userPanel.${exporting ? 'exportCredentials' : 'importCredentials'}`)} labelId="credential-qr-title" />
    <ModalBody>
      <p>{t(`userPanel.${exporting ? 'exportCredentialsConfirm' : 'importCredentialsConfirm'}`)}</p>
      {error && <div role="alert"><InlineAlert variant="danger" title={t(`userPanel.${error}`)} onClose={() => setError(null)} /></div>}
      {credentials ? showQRCode ? <div className="credential-qr-code"><QRCodeSVG value={JSON.stringify(credentials)} size={320} marginSize={4} level="M" title={t('userPanel.exportQR')} /></div> : <p>{t('userPanel.credentialExportMethods')}</p>
        : scanned ? <div>
          <p>{t('userPanel.scanConfirm')}</p>
          <p>{t('userPanel.userIdLabel')}: {scanned.userId}</p>
          <p>{scanned.serverUrl}</p>
        </div> : scanning ? <>
          <p>{t('userPanel.scanHelp')}</p>
          <video ref={videoRef} className="credential-qr-camera" autoPlay muted playsInline aria-label={t('userPanel.scanQR')} />
        </> : <p>{t('userPanel.credentialImportMethods')}</p>}
    </ModalBody>
    <ModalFooter>
      {scanned && <Button variant="primary" isLoading={importing} isDisabled={importing} onClick={() => void importScanned()}>{t('userPanel.importCredentials')}</Button>}
      {exporting && <Button variant="primary" onClick={onExportFile}>{t('userPanel.exportCredentialFile')}</Button>}
      {exporting && <Button variant="secondary" onClick={() => setShowQRCode(true)}>{t('userPanel.exportQR')}</Button>}
      {!exporting && !scanned && <Button variant="primary" onClick={onImportFile}>{t('userPanel.importCredentialFile')}</Button>}
      {!exporting && !scanned && <Button variant="secondary" onClick={() => { setError(null); setScanning(value => !value); }}>{t(`userPanel.${scanning ? 'stopScan' : 'scanQR'}`)}</Button>}
      <Button variant="link" isDisabled={importing} onClick={onClose}>{t('settings.cancel')}</Button>
    </ModalFooter>
  </Modal>;
}
