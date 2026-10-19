import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Label, Spinner } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import { calendarAPI, WORKER_URL } from '../api/client';
import type { ReadCalendarResponse } from '../api/types';
import { PublicCalendarProvider, useCalendar } from '../context/CalendarContext';
import { parsePublicLink } from '../utils/publicLink';
import WeekCalendar from './WeekCalendar';
import { MoonIcon, SunIcon } from '@patternfly/react-icons';
import './Toolbar.css';
import OpenCalendarDialog from './OpenCalendarDialog';
import { clearRemoteCache, isRemoteUnavailable, readRemoteCache, remoteCacheIdentity, writeRemoteCache } from '../utils/remoteCalendar';
import { rememberCalendar } from '../utils/calendarHistory';

function PublicCalendarHeader({ title }: { title: string }) {
  const { t } = useTranslation();
  const { darkMode, toggleDarkMode } = useCalendar();
  const [openLink, setOpenLink] = useState(false);
  return <>
  <header className="calendrier-toolbar public-calendar-header">
    <div className="calendrier-toolbar__brand public-calendar-heading">
      <h1 className="calendrier-title">{title}</h1>
      <Label color="grey">{t('publicShare.readOnly')}</Label>
    </div>
    <div className="calendrier-toolbar__actions public-calendar-actions">
      <div className="calendrier-toolbar__primary-actions">
        <Button variant="secondary" onClick={() => window.location.assign(window.location.pathname)}>{t('publicShare.return')}</Button>
        <Button variant="secondary" onClick={() => setOpenLink(true)}>{t('remoteCalendar.open')}</Button>
      </div>
      <div className="calendrier-toolbar__utility-actions">
        <Button variant="plain" icon={darkMode ? <SunIcon /> : <MoonIcon />} onClick={toggleDarkMode} aria-label={t('toolbar.darkModeTitle')} />
      </div>
    </div>
  </header>
  {openLink && <OpenCalendarDialog onClose={() => setOpenLink(false)} />}
  </>;
}

function PublicCalendarContent({ title, offline, retry }: { title: string; offline: boolean; retry: () => void }) {
  const { t } = useTranslation();
  return <div className="calendrier-app public-calendar-app">
    <main className="calendrier-main">
      <PublicCalendarHeader title={title} />
      {offline && <Alert isInline variant="warning" title={t('remoteCalendar.offline')}>
        <p>{t('remoteCalendar.cached')}</p><Button variant="link" onClick={retry}>{t('remoteCalendar.retry')}</Button>
      </Alert>}
      <WeekCalendar readOnly onEditCourse={() => {}} onDragCreate={() => {}} />
    </main>
  </div>;
}

export default function PublicCalendarView({ hash }: { hash: string }) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<ReadCalendarResponse | null>(null);
  const snapshotRef = useRef<ReadCalendarResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [offline, setOffline] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const link = parsePublicLink(hash);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let recorded = false;
    const refresh = async () => {
      let identity: string | null = null;
      try {
        if (!link) throw new Error('Invalid link');
        identity = await remoteCacheIdentity([WORKER_URL, link.publicId, link.token]);
        if (controller.signal.aborted) return;
        if (!navigator.onLine) throw new TypeError('Offline');
        const result = await calendarAPI.readPublicCalendar(link.publicId, link.token, controller.signal);
        if (!controller.signal.aborted) {
          writeRemoteCache('public', identity, result);
          if (!recorded) {
            rememberCalendar(`${window.location.origin}${window.location.pathname}${hash}`, window.location.href, result.data.title);
            recorded = true;
          }
          snapshotRef.current = result;
          setSnapshot(result); setFailed(false); setOffline(false);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          const cached = identity && isRemoteUnavailable(error) ? snapshotRef.current ?? readRemoteCache('public', identity) : null;
          if (cached) { setSnapshot(cached); setOffline(true); setFailed(false); }
          else {
            if (!isRemoteUnavailable(error)) clearRemoteCache('public');
            snapshotRef.current = null;
            setSnapshot(null); setFailed(true);
          }
        }
      } finally {
        if (link && !controller.signal.aborted) { clearTimeout(timer); timer = setTimeout(refresh, 60_000); }
      }
    };
    void refresh();
    const reconnect = () => setAttempt(current => current + 1);
    window.addEventListener('online', reconnect);
    window.addEventListener('offline', reconnect);
    return () => { controller.abort(); clearTimeout(timer); window.removeEventListener('online', reconnect); window.removeEventListener('offline', reconnect); };
  }, [hash, attempt]);

  if (failed) {
    return <PublicCalendarProvider data={{ courses: [] }} version={0}><div className="calendrier-app public-calendar-app"><main className="calendrier-main"><PublicCalendarHeader title={t('publicShare.viewTitle')} /><div className="public-calendar-state"><Alert isInline variant="danger" title={t('publicShare.unavailable')} /><Button onClick={() => setAttempt(current => current + 1)}>{t('remoteCalendar.retry')}</Button></div></main></div></PublicCalendarProvider>;
  }
  if (!snapshot) {
    return <div className="calendrier-app public-calendar-app"><main className="calendrier-main"><div className="public-calendar-state"><Spinner aria-label={t('urlHandler.loadingCalendar')} /></div></main></div>;
  }
  return <PublicCalendarProvider data={snapshot.data} version={snapshot.version}>
    <PublicCalendarContent title={snapshot.data.title ?? t('publicShare.viewTitle')} offline={offline} retry={() => setAttempt(current => current + 1)} />
  </PublicCalendarProvider>;
}
