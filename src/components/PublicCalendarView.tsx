import { useEffect, useState } from 'react';
import { Alert, Button, Label, Spinner } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import { calendarAPI } from '../api/client';
import type { ReadCalendarResponse } from '../api/types';
import { PublicCalendarProvider, useCalendar } from '../context/CalendarContext';
import { parsePublicLink } from '../utils/publicLink';
import WeekCalendar from './WeekCalendar';
import { MoonIcon, SunIcon } from '@patternfly/react-icons';
import './Toolbar.css';

function PublicCalendarHeader({ title }: { title: string }) {
  const { t } = useTranslation();
  const { darkMode, toggleDarkMode } = useCalendar();
  return <>
  <header className="calendrier-toolbar public-calendar-header">
    <div className="calendrier-toolbar__brand public-calendar-heading">
      <h1 className="calendrier-title">{title}</h1>
      <Label color="grey">{t('publicShare.readOnly')}</Label>
    </div>
    <div className="calendrier-toolbar__actions public-calendar-actions">
      <div className="calendrier-toolbar__primary-actions">
        <Button variant="secondary" onClick={() => window.location.assign(window.location.pathname)}>{t('publicShare.return')}</Button>
      </div>
      <div className="calendrier-toolbar__utility-actions">
        <Button variant="plain" icon={darkMode ? <SunIcon /> : <MoonIcon />} onClick={toggleDarkMode} aria-label={t('toolbar.darkModeTitle')} />
      </div>
    </div>
  </header>
  </>;
}

function PublicCalendarContent({ title }: { title: string }) {
  return <div className="calendrier-app public-calendar-app">
    <main className="calendrier-main">
      <PublicCalendarHeader title={title} />
      <WeekCalendar readOnly onEditCourse={() => {}} onDragCreate={() => {}} />
    </main>
  </div>;
}

export default function PublicCalendarView({ hash }: { hash: string }) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<ReadCalendarResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const link = parsePublicLink(hash);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        if (!link) throw new Error('Invalid link');
        const result = await calendarAPI.readPublicCalendar(link.publicId, link.token, controller.signal);
        if (!controller.signal.aborted) { setSnapshot(result); setFailed(false); }
      } catch {
        if (!controller.signal.aborted) { setSnapshot(null); setFailed(true); }
      } finally {
        if (link && !controller.signal.aborted) timer = setTimeout(refresh, 60_000);
      }
    };
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [hash]);

  if (failed) {
    return <div className="calendrier-app public-calendar-app"><main className="calendrier-main"><div className="public-calendar-state"><Alert isInline variant="danger" title={t('publicShare.unavailable')} /></div></main></div>;
  }
  if (!snapshot) {
    return <div className="calendrier-app public-calendar-app"><main className="calendrier-main"><div className="public-calendar-state"><Spinner aria-label={t('urlHandler.loadingCalendar')} /></div></main></div>;
  }
  return <PublicCalendarProvider data={snapshot.data} version={snapshot.version}>
    <PublicCalendarContent title={snapshot.data.title ?? t('publicShare.viewTitle')} />
  </PublicCalendarProvider>;
}
