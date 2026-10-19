import { useState } from 'react';
import { Button, Form, FormGroup, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import ValidatedTextInput from './ValidatedTextInput';
import { calendarLinkTarget } from '../utils/remoteCalendar';
import { readCalendarHistory, removeCalendarHistory } from '../utils/calendarHistory';
import './OpenCalendarDialog.css';

export default function OpenCalendarDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);
  const [history, setHistory] = useState(() => readCalendarHistory(window.location.href));
  const remove = (target?: string) => {
    removeCalendarHistory(target, window.location.href);
    setHistory(readCalendarHistory(window.location.href));
  };
  const open = () => {
    const target = calendarLinkTarget(url, window.location.href);
    if (!target) { setError(true); document.getElementById('remote-calendar-url')?.focus(); return; }
    window.location.assign(target);
  };
  return <Modal isOpen onClose={onClose} variant="small" aria-labelledby="open-calendar-title">
    <ModalHeader title={t('remoteCalendar.open')} labelId="open-calendar-title" />
    <ModalBody><Form noValidate onSubmit={event => { event.preventDefault(); open(); }} id="open-calendar-form">
      <p>{t('remoteCalendar.urlHelp')}</p>
      <FormGroup label={t('remoteCalendar.url')} fieldId="remote-calendar-url">
        <ValidatedTextInput id="remote-calendar-url" type="url" autoComplete="off" value={url}
          onChange={(_event, value) => { setUrl(value); setError(false); }} error={error ? t('remoteCalendar.invalidUrl') : undefined} />
      </FormGroup>
    </Form>
      <section aria-labelledby="recent-calendars-title">
        <h2 id="recent-calendars-title">{t('remoteCalendar.history')}</h2>
        <p>{t('remoteCalendar.historyPrivacy')}</p>
        {history.length === 0 ? <p>{t('remoteCalendar.historyEmpty')}</p> : <>
          <ul className="recent-calendars">
            {history.map(entry => <li key={entry.target}>
              <Button variant="link" onClick={() => window.location.assign(entry.target)}>
                {entry.title || t(entry.target.includes('#public=') ? 'remoteCalendar.publicCalendar' : 'remoteCalendar.privateCalendar')}
              </Button>
              <Button variant="link" onClick={() => remove(entry.target)} aria-label={t('remoteCalendar.removeHistory', { title: entry.title || t('remoteCalendar.history') })}>{t('remoteCalendar.remove')}</Button>
            </li>)}
          </ul>
          <Button variant="link" onClick={() => remove()}>{t('remoteCalendar.clearHistory')}</Button>
        </>}
      </section>
    </ModalBody>
    <ModalFooter><Button type="submit" form="open-calendar-form">{t('remoteCalendar.open')}</Button><Button variant="link" onClick={onClose}>{t('confirmDialog.cancel')}</Button></ModalFooter>
  </Modal>;
}
