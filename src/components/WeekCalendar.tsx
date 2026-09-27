import TextInput from './ValidatedTextInput';
import { isValidDate, focusFirstError } from '../utils/formValidation';
import { useMemo, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpenIcon, CoffeeIcon, CalendarAltIcon, ClipboardCheckIcon, RedoIcon, QuestionCircleIcon } from '@patternfly/react-icons';
import { Modal, ModalVariant, ModalHeader, ModalBody, ModalFooter, Button, ButtonVariant, Form, FormGroup, FormSelect, FormSelectOption } from '@patternfly/react-core';
import { useCalendar } from '../context/CalendarContext';
import { getOrderedWeekdays, timeToMinutes, minutesToTime, calculateTimeRange, formatTime } from '../utils/timeUtils';
import type { Weekday, Course, Session, AcademicPeriod, AcademicPeriodKind } from '../types/Course';
import { consolidateSession, dateKey, formatWeekRange, resolveSessionForDate, weekStartDate } from '../utils/sessionSchedule';
import { academicPeriodsForDate, academicWeekNumber, academicSpecialDateLabel } from '../utils/academicCalendar';
import CourseBlock from './CourseBlock';
import SessionDetailDialog from './SessionDetailDialog';
import WeekDatePicker from './WeekDatePicker';
import './WeekCalendar.css';

const periodIcons = {
  semester: BookOpenIcon,
  break: CoffeeIcon,
  holiday: CalendarAltIcon,
  exams: ClipboardCheckIcon,
  retakeExams: RedoIcon,
  other: QuestionCircleIcon,
};

interface WeekCalendarProps {
  onEditCourse: (courseId: string) => void;
  onDragCreate: (day: Weekday, startTime: string, endTime: string) => void;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  courseId: string | null;
}

interface SessionDetailState {
  visible: boolean;
  course: Course | null;
  session: Session | null;
}

interface PositionedSession {
  course: Course;
  session: Session;
  start: number;
  end: number;
  column: number;
  columns: number;
}

const WeekCalendar = ({ onEditCourse, onDragCreate }: WeekCalendarProps) => {
  const TIME_LABEL_WIDTH = 80;
  const { t, i18n } = useTranslation();
  const { courses, settings, updateSettings, duplicateCourse, deleteCourse, title } = useCalendar();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    courseId: null,
  });
  const [sessionDetail, setSessionDetail] = useState<SessionDetailState>({
    visible: false,
    course: null,
    session: null,
  });
  const [academicDialog, setAcademicDialog] = useState<{
    periodId?: string;
    label: string;
    kind: AcademicPeriodKind;
    startDate: string;
    endDate: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ day: Weekday; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ day: Weekday; y: number } | null>(null);
  const [displayedWeek, setDisplayedWeek] = useState(() => weekStartDate(new Date(), settings.weekStart));
  const [displayMode, setDisplayMode] = useState<'week' | 'consolidated'>('week');
  const consolidated = displayMode === 'consolidated';
  const displayedSessions = useMemo(() => courses.flatMap(course => course.sessions.flatMap(session =>
    (consolidated ? consolidateSession(session) : [session]).map(session => ({ course, session }))
  )), [courses, consolidated]);
  const calendarRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const allSessions = useMemo(
    () => displayedSessions.map(({ session }) => session),
    [displayedSessions]
  );

  const { start: startMinutes, end: endMinutes } = useMemo(
    () => calculateTimeRange(allSessions),
    [allSessions]
  );

  const orderedWeekdays = useMemo(
    () => getOrderedWeekdays(settings.weekStart),
    [settings.weekStart]
  );

  useEffect(() => {
    setDisplayedWeek((current) => weekStartDate(current, settings.weekStart));
  }, [settings.weekStart]);

  const datesByDay = useMemo(() => new Map(orderedWeekdays.map((day, index) => {
    const date = new Date(displayedWeek.getFullYear(), displayedWeek.getMonth(), displayedWeek.getDate() + index);
    return [day, date] as const;
  })), [displayedWeek, orderedWeekdays]);

  const visibleSemesters = (settings.academicCalendar?.periods ?? []).filter((period) =>
    period.kind === 'semester' && [...datesByDay.values()].some((date) =>
      dateKey(date) >= period.startDate && dateKey(date) <= period.endDate
    )
  );

  // Check if there are any sessions on Saturday or Sunday
  const hasWeekendSessions = useMemo(() => {
    return orderedWeekdays.some((day) => {
      if (day !== 'Saturday' && day !== 'Sunday') return false;
      if (consolidated) return displayedSessions.some(({ session }) => session.meetDay === day);
      const date = datesByDay.get(day);
      return date ? courses.some((course) => course.sessions.some((session) => resolveSessionForDate(session, date))) : false;
    });
  }, [courses, datesByDay, orderedWeekdays, consolidated, displayedSessions]);

  // Filter weekdays to hide Saturday/Sunday if no sessions
  const visibleWeekdays = useMemo(() => {
    if (settings.weekView === 'full' || hasWeekendSessions) {
      return orderedWeekdays;
    }
    return orderedWeekdays.filter(day => day !== 'Saturday' && day !== 'Sunday');
  }, [orderedWeekdays, hasWeekendSessions, settings.weekView]);

  const timeSlots = useMemo(() => {
    const slots: number[] = [];
    for (let i = startMinutes; i < endMinutes; i += 60) {
      slots.push(i);
    }
    return slots;
  }, [startMinutes, endMinutes]);

  const sessionsByDay = useMemo(() => {
    const layouts = new Map<Weekday, PositionedSession[]>();

    visibleWeekdays.forEach((day) => {
      const date = datesByDay.get(day);
      const daySessions = displayedSessions
        .map(({ course, session }) => ({ course, session: consolidated ? (session.meetDay === day ? session : null) : date ? resolveSessionForDate(session, date) : null }))
        .filter((item): item is { course: Course; session: Session } => item.session !== null)
        .map(({ course, session }) => ({ course, session, start: timeToMinutes(session.startTime), end: timeToMinutes(session.endTime), column: 0, columns: 1 }))
        .sort((a, b) => a.start - b.start || b.end - a.end);

      const positioned: PositionedSession[] = [];
      let group: PositionedSession[] = [];
      let groupEnd = -Infinity;

      const flushGroup = () => {
        if (group.length === 0) return;

        const columnEnds: number[] = [];
        group.forEach((item) => {
          const column = columnEnds.findIndex((end) => end <= item.start);
          item.column = column === -1 ? columnEnds.length : column;
          columnEnds[item.column] = item.end;
        });

        const columns = columnEnds.length || 1;
        group.forEach((item) => {
          item.columns = columns;
          positioned.push(item);
        });

        group = [];
        groupEnd = -Infinity;
      };

      daySessions.forEach((item) => {
        if (group.length > 0 && item.start >= groupEnd) {
          flushGroup();
        }

        group.push(item);
        groupEnd = Math.max(groupEnd, item.end);
      });
      flushGroup();

      layouts.set(day, positioned);
    });

    return layouts;
  }, [displayedSessions, consolidated, datesByDay, visibleWeekdays]);

  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu({ visible: false, x: 0, y: 0, courseId: null });
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu({ visible: false, x: 0, y: 0, courseId: null });
      }
    };
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    if (contextMenu.visible) {
      contextMenuRef.current?.focus();
    }
  }, [contextMenu.visible]);

  const handleContextMenu = (e: React.MouseEvent, courseId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 140;
    const menuHeight = 120;
    setContextMenu({
      visible: true,
      x: Math.min(e.clientX, window.innerWidth - menuWidth),
      y: Math.min(e.clientY, window.innerHeight - menuHeight),
      courseId,
    });
  };

  const handleSessionClick = (course: Course, session: Session) => {
    setSessionDetail({
      visible: true,
      course,
      session,
    });
  };

  const handleDuplicate = () => {
    if (contextMenu.courseId) {
      duplicateCourse(contextMenu.courseId);
      setContextMenu({ visible: false, x: 0, y: 0, courseId: null });
    }
  };

  const handleDelete = () => {
    if (contextMenu.courseId) {
      deleteCourse(contextMenu.courseId);
      setContextMenu({ visible: false, x: 0, y: 0, courseId: null });
    }
  };

  const handleAcademicContextMenu = (event: React.MouseEvent, date: Date, period?: AcademicPeriod) => {
    event.preventDefault();
    event.stopPropagation();
    const key = dateKey(date);
    setAcademicSubmitted(false);
    setAcademicDialog({
      periodId: period?.id,
      label: period?.label ?? '',
      kind: period?.kind ?? 'other',
      startDate: period?.startDate ?? key,
      endDate: period?.endDate ?? key,
    });
  };

  const [academicSubmitted, setAcademicSubmitted] = useState(false);
  const academicErrors: Record<string, string> = {};
  if (academicDialog) {
    if (!academicDialog.label.trim()) academicErrors['period-name'] = t('validation.required');
    if (!isValidDate(academicDialog.startDate)) academicErrors['period-start'] = t('validation.date');
    if (!isValidDate(academicDialog.endDate)) academicErrors['period-end'] = t('validation.date');
    else if (isValidDate(academicDialog.startDate) && academicDialog.endDate < academicDialog.startDate) academicErrors['period-end'] = t('validation.dateOrder');
  }

  const saveAcademicPeriod = () => {
    if (!academicDialog) return;
    setAcademicSubmitted(true);
    if (Object.keys(academicErrors).length) { focusFirstError(academicErrors); return; }
    const nextCalendar = settings.academicCalendar ?? { yearLabel: '', startDate: academicDialog.startDate, endDate: academicDialog.endDate, periods: [] };
    const periods = academicDialog.periodId
      ? nextCalendar.periods.map((period) => period.id === academicDialog.periodId ? { ...period, label: academicDialog.label.trim(), kind: academicDialog.kind, startDate: academicDialog.startDate, endDate: academicDialog.endDate } : period)
      : [...nextCalendar.periods, { id: crypto.randomUUID(), label: academicDialog.label.trim(), kind: academicDialog.kind, startDate: academicDialog.startDate, endDate: academicDialog.endDate }];
    updateSettings({ academicCalendar: { ...nextCalendar, startDate: nextCalendar.startDate || academicDialog.startDate, endDate: nextCalendar.endDate || academicDialog.endDate, periods } });
    setAcademicDialog(null);
  };

  const getPositionForSession = (startTime: string, endTime: string) => {
    const startMins = timeToMinutes(startTime);
    const endMins = timeToMinutes(endTime);
    const totalMinutes = endMinutes - startMinutes;
    const topPercent = ((startMins - startMinutes) / totalMinutes) * 100;
    const heightPercent = ((endMins - startMins) / totalMinutes) * 100;
    return { top: topPercent, height: heightPercent };
  };

  const getTimeFromY = (y: number): number => {
    const rect = calendarRef.current?.getBoundingClientRect();
    if (!rect) return startMinutes;

    // Find the calendar-body element to get its bounds
    const calendarBody = calendarRef.current?.querySelector('.calendar-time-grid');
    const bodyRect = calendarBody?.getBoundingClientRect();
    if (!bodyRect) return startMinutes;

    const relativeY = y - bodyRect.top;
    const bodyHeight = bodyRect.height;
    const totalMinutes = endMinutes - startMinutes;

    // Calculate percentage and convert to minutes
    const percent = relativeY / bodyHeight;
    const minutes = Math.round((startMinutes + (percent * totalMinutes)) / 15) * 15;
    return Math.max(startMinutes, Math.min(endMinutes, minutes));
  };

  const getDayFromX = (x: number): Weekday | null => {
    const rect = calendarRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const relativeX = x - rect.left - TIME_LABEL_WIDTH;
    const dayWidth = (rect.width - TIME_LABEL_WIDTH) / visibleWeekdays.length;
    const dayIndex = Math.floor(relativeX / dayWidth);

    if (dayIndex >= 0 && dayIndex < visibleWeekdays.length) {
      return visibleWeekdays[dayIndex];
    }
    return null;
  };

  const resetDragState = () => {
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const day = getDayFromX(e.clientX);
    if (!day) return;

    const time = getTimeFromY(e.clientY);
    setIsDragging(true);
    setDragStart({ day, y: time });
    setDragEnd({ day, y: time });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStart) return;
    const time = getTimeFromY(e.clientY);
    setDragEnd({ day: dragStart.day, y: time });
  };

  const handleMouseUp = () => {
    if (isDragging && dragStart && dragEnd && dragStart.day === dragEnd.day) {
      const startTime = Math.min(dragStart.y, dragEnd.y);
      const endTime = Math.max(dragStart.y, dragEnd.y);

      if (endTime - startTime >= 15) {
        onDragCreate(dragStart.day, minutesToTime(startTime), minutesToTime(endTime));
      }
    }
    resetDragState();
  };

  const renderDragPreview = () => {
    if (!isDragging || !dragStart || !dragEnd || dragStart.day !== dragEnd.day) return null;

    const startTime = Math.min(dragStart.y, dragEnd.y);
    const endTime = Math.max(dragStart.y, dragEnd.y);
    const { top, height } = getPositionForSession(minutesToTime(startTime), minutesToTime(endTime));

    return (
      <div
        className="drag-preview"
        style={{
          top: `${top}%`,
          height: `${height}%`,
        }}
      />
    );
  };

  return (
    <div className="week-calendar" ref={calendarRef} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={resetDragState}>
      <h2 className="calendar-title print-only">{title}</h2>
      <div className="calendar-week-toolbar" aria-label={t('calendar.weekNavigation')}>
        <FormSelect className="calendar-display-mode" aria-label={t('calendar.displayMode')} value={displayMode} onChange={(_event, value) => setDisplayMode(value as 'week' | 'consolidated')}>
          <FormSelectOption value="week" label={t('calendar.weekView')} />
          <FormSelectOption value="consolidated" label={t('calendar.consolidatedView')} />
        </FormSelect>
        {!consolidated && <div className="calendar-week-navigation">
        <div className="calendar-week-controls" role="group" aria-label={t('calendar.weekNavigation')}>
        <Button variant="secondary" onClick={() => setDisplayedWeek((date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7))} aria-label={t('calendar.previousWeek')}>←</Button>
        <Button variant="secondary" onClick={() => setDisplayedWeek(weekStartDate(new Date(), settings.weekStart))}>{t('calendar.today')}</Button>
        <Button variant="secondary" onClick={() => setDisplayedWeek((date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7))} aria-label={t('calendar.nextWeek')}>→</Button>
        </div>
        <div className="calendar-week-heading">
          <WeekDatePicker date={displayedWeek} label={formatWeekRange(displayedWeek, i18n.resolvedLanguage)} weekStart={settings.weekStart} onSelect={(date) => setDisplayedWeek(weekStartDate(date, settings.weekStart))} />
          {visibleSemesters.map((period) => (
            <button type="button" key={period.id} className="academic-period academic-period-semester" onClick={(event) => handleAcademicContextMenu(event, displayedWeek, period)} onContextMenu={(event) => handleAcademicContextMenu(event, displayedWeek, period)} title={`${t('settings.periodKinds.semester')}: ${period.label}`}>
              <BookOpenIcon aria-hidden="true" /><span>{period.label}</span>
            </button>
          ))}
        </div>
        </div>}
      </div>
      <div className="calendar-grid">
        <div className="calendar-header">
          <div className="time-label-header"></div>
          {visibleWeekdays.map(day => (
            <div key={day} className="day-header">
              <span>{t(`weekdays.${day.toLowerCase()}`)}</span>
              {!consolidated && <small>{datesByDay.get(day) ? new Intl.DateTimeFormat(i18n.resolvedLanguage, { month: 'short', day: 'numeric' }).format(datesByDay.get(day)!) : ''}</small>}
            </div>
          ))}
         </div>

         {!consolidated && <div className="all-day-row" aria-label={t('calendar.academicSchedule')}>
           <div className="all-day-label">
             <span>{t('calendar.allDay')}</span>
             {visibleSemesters.map((period) => (
               <span key={period.id} title={period.label}>
                 {t('calendar.academicWeek', { week: academicWeekNumber(period, displayedWeek, settings.weekStart) })}
               </span>
             ))}
           </div>
           {visibleWeekdays.map((day) => {
             const date = datesByDay.get(day);
              const periods = date ? academicPeriodsForDate(settings.academicCalendar, date).filter((period) => period.kind !== 'semester') : [];
              const special = date ? academicSpecialDateLabel(settings.academicCalendar, date) : undefined;
              return (
                <div key={day} className="all-day-cell" onContextMenu={(event) => date && handleAcademicContextMenu(event, date)} title={t('calendar.addPeriod')}>
                  {periods.map((period) => {
                    const PeriodIcon = periodIcons[period.kind];
                    return <button type="button" key={period.id} className={`academic-period academic-period-${period.kind}`} onClick={(event) => date && handleAcademicContextMenu(event, date, period)} onContextMenu={(event) => date && handleAcademicContextMenu(event, date, period)} title={`${t(`settings.periodKinds.${period.kind}`)}: ${period.label}`}><PeriodIcon aria-hidden="true" /><span>{period.label}</span></button>;
                  })}
                  {special && <span className="academic-special-date">{special}</span>}
                  <button type="button" className="all-day-add" aria-label={`${t('calendar.addPeriod')} ${date ? dateKey(date) : ''}`} title={t('calendar.addPeriod')} onClick={(event) => date && handleAcademicContextMenu(event, date)} onContextMenu={(event) => date && handleAcademicContextMenu(event, date)}><span aria-hidden="true">+</span></button>
                </div>
             );
           })}
         </div>}

         <div className="calendar-body">
          <div className="calendar-time-grid" style={{ minHeight: `${timeSlots.length * 60}px` }}>
          <div className="time-labels">
            {timeSlots.map(minutes => (
              <div key={minutes} className="time-label">
                {formatTime(minutesToTime(minutes), settings.timeFormat)}
              </div>
            ))}
          </div>

          <div className="days-grid">
            {visibleWeekdays.map(day => (
                <div
                  key={day}
                  className="day-column"
                   onMouseDown={handleMouseDown}
                 >
                 {!consolidated && academicPeriodsForDate(settings.academicCalendar, datesByDay.get(day)!).filter((period) => ['break', 'holiday', 'exams', 'retakeExams'].includes(period.kind)).map((period) => (
                   <span key={period.id} aria-hidden="true" className={`day-period-mask day-period-mask-${period.kind}`} />
                 ))}
                 {timeSlots.map(minutes => (
                  <div key={minutes} className="time-slot" />
                ))}

                {(sessionsByDay.get(day) || []).map(({ course, session, column, columns }) => {
                      const { top, height } = getPositionForSession(
                        session.startTime,
                        session.endTime
                      );
                      const width = 100 / columns;
                      const left = column * width;

                      return (
                        <div
                          key={JSON.stringify([course.id, session.id, session.meetDay, session.startTime, session.endTime, session.location, session.instructor])}
                          className="course-block-wrapper"
                          style={{
                            top: `${top}%`,
                            height: `${height}%`,
                            left: `calc(${left}% + 2px)`,
                            right: 'auto',
                            width: `calc(${width}% - 4px)`,
                          }}
                        >
                          <CourseBlock
                            course={course}
                            session={session}
                            onContextMenu={handleContextMenu}
                            onClick={() => handleSessionClick(course, session)}
                            timeFormat={settings.timeFormat}
                          />
                        </div>
                      );
                    })}

                {isDragging && dragStart?.day === day && renderDragPreview()}
              </div>
            ))}
          </div>
          </div>
        </div>
      </div>

      {contextMenu.visible && (
        <div
          className="context-menu"
          ref={contextMenuRef}
          role="menu"
          tabIndex={-1}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button role="menuitem" onClick={handleDuplicate}>{t('contextMenu.duplicate')}</button>
          <button role="menuitem" onClick={() => {
            if (contextMenu.courseId) onEditCourse(contextMenu.courseId);
            setContextMenu({ visible: false, x: 0, y: 0, courseId: null });
          }}>{t('contextMenu.edit')}</button>
          <button role="menuitem" onClick={handleDelete}>{t('contextMenu.delete')}</button>
        </div>
      )}

      {sessionDetail.visible && sessionDetail.course && sessionDetail.session && (
        <SessionDetailDialog
          course={sessionDetail.course}
          session={sessionDetail.session}
          timeFormat={settings.timeFormat}
          onClose={() => setSessionDetail({ visible: false, course: null, session: null })}
          onEdit={() => {
            if (sessionDetail.course) {
              onEditCourse(sessionDetail.course.id);
              setSessionDetail({ visible: false, course: null, session: null });
            }
          }}
        />
      )}

      {academicDialog && (
        <Modal variant={ModalVariant.small} isOpen onClose={() => setAcademicDialog(null)} aria-labelledby="academic-period-dialog-title">
          <ModalHeader title={academicDialog.periodId ? t('calendar.editPeriod') : t('calendar.addPeriod')} labelId="academic-period-dialog-title" />
          <ModalBody>
            <Form noValidate id="academic-period-form" onSubmit={(event) => { event.preventDefault(); saveAcademicPeriod(); }}>
              <FormGroup fieldId="period-name" label={t('calendar.periodName')} isRequired>
                <TextInput error={academicSubmitted ? academicErrors['period-name'] : undefined} id="period-name" isRequired value={academicDialog.label} onChange={(_event, value) => setAcademicDialog((current) => current && { ...current, label: value })} />
              </FormGroup>
              <FormGroup fieldId="period-type" label={t('calendar.periodType')}>
                <FormSelect id="period-type" value={academicDialog.kind} onChange={(_event, value) => setAcademicDialog((current) => current && { ...current, kind: value as AcademicPeriodKind })}>
                  {(['semester', 'break', 'holiday', 'exams', 'retakeExams', 'other'] as AcademicPeriodKind[]).map((kind) => <FormSelectOption key={kind} value={kind} label={t(`settings.periodKinds.${kind}`)} />)}
                </FormSelect>
              </FormGroup>
              <FormGroup fieldId="period-start" label={t('calendar.startDate')} isRequired><TextInput error={academicSubmitted ? academicErrors['period-start'] : undefined} id="period-start" isRequired type="date" value={academicDialog.startDate} onChange={(_event, value) => setAcademicDialog((current) => current && { ...current, startDate: value })} /></FormGroup>
              <FormGroup fieldId="period-end" label={t('calendar.endDate')} isRequired><TextInput error={academicSubmitted ? academicErrors['period-end'] : undefined} id="period-end" isRequired type="date" min={academicDialog.startDate} value={academicDialog.endDate} onChange={(_event, value) => setAcademicDialog((current) => current && { ...current, endDate: value })} /></FormGroup>
            </Form>
          </ModalBody>
          <ModalFooter>
            <Button variant={ButtonVariant.primary} type="submit" form="academic-period-form">{t('calendar.savePeriod')}</Button>
            <Button variant={ButtonVariant.link} onClick={() => setAcademicDialog(null)}>{t('settings.cancel')}</Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
};

export default WeekCalendar;
