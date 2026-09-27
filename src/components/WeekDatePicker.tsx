import { useRef, useState } from 'react';
import { Button, CalendarMonth, Popover } from '@patternfly/react-core';
import { CalendarAltIcon } from '@patternfly/react-icons';
import { useTranslation } from 'react-i18next';
import type { WeekStart } from '../types/Course';
import './WeekDatePicker.css';

export default function WeekDatePicker({ date, label, weekStart, onSelect }: {
  date: Date;
  label: string;
  weekStart: WeekStart;
  onSelect: (date: Date) => void;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <Popover
    aria-label={t('calendar.jumpToDate')}
    isVisible={open}
    shouldClose={() => setOpen(false)}
    className="week-date-popover"
    position="bottom"
    flipBehavior={['bottom', 'bottom-end', 'bottom-start', 'top', 'top-end', 'top-start']}
    hasAutoWidth
    hasNoPadding
    showClose={false}
    bodyContent={open && <CalendarMonth
      date={date}
      locale={i18n.resolvedLanguage}
      weekStart={weekStart === 'Monday' ? 1 : 0}
      isDateFocused
      prevMonthAriaLabel={t('calendar.previousMonth')}
      nextMonthAriaLabel={t('calendar.nextMonth')}
      yearInputAriaLabel={t('calendar.selectYear')}
      onChange={(_event, selected) => { onSelect(selected); setOpen(false); trigger.current?.focus(); }}
    />}
  >
    <span className="week-date-display">
      <strong>{label}</strong>
      <Button ref={trigger} variant="plain" icon={<CalendarAltIcon />} aria-label={t('calendar.jumpToDate')} title={t('calendar.jumpToDate')} aria-expanded={open} onClick={() => setOpen((current) => !current)} />
    </span>
  </Popover>;
}
