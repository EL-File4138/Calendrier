import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  ButtonVariant,
  Form,
  FormGroup,
  FormSection,
  FormSelect,
  FormSelectOption,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Divider
  ,Checkbox
} from '@patternfly/react-core';
import { TrashIcon, PlusCircleIcon } from '@patternfly/react-icons';
import type { EditableSession, Session, SessionOverride, SessionSchedule, Weekday } from '../types/Course';
import { WEEKDAYS } from '../utils/timeUtils';
import { getNextColor } from '../utils/colors';
import { useCalendar } from '../context/CalendarContext';
import IconPicker from './IconPicker';
import { DEFAULT_EVENT_TYPE_ICONS } from '../utils/eventIcons';
import ConfirmDialog from './ConfirmDialog';
import TextInput from './ValidatedTextInput';
import { isValidDate, isValidTime, focusFirstError } from '../utils/formValidation';

interface CourseFormProps {
  courseId?: string;
  initialData?: {
    day?: Weekday;
    startTime?: string;
    endTime?: string;
  };
  onClose: () => void;
}

const CourseForm = ({ courseId, initialData, onClose }: CourseFormProps) => {
  const { t } = useTranslation();
  const { courses, settings, addCourse, updateCourse, deleteCourse } = useCalendar();

  const existingCourse = courseId ? courses.find(c => c.id === courseId) : null;

  const [title, setTitle] = useState(existingCourse?.title || '');
  const [color, setColor] = useState(
    existingCourse?.color || getNextColor(courses.map(c => c.color))
  );
  const [icon, setIcon] = useState(existingCourse?.icon ?? '');
  const createEditableSession = (session?: Partial<Session>): EditableSession => ({
    localId: crypto.randomUUID(),
    meetDay: session?.meetDay || initialData?.day || 'Monday',
    startTime: session?.startTime || initialData?.startTime || '09:00',
    endTime: session?.endTime || initialData?.endTime || '10:00',
    sessionType: session?.sessionType || '',
    icon: session?.icon || '',
    instructor: session?.instructor || '',
    location: session?.location || '',
    schedule: session?.schedule ? {
      ...session.schedule,
      overrides: { ...session.schedule.overrides },
      excludedDates: [...(session.schedule.excludedDates ?? [])],
    } : undefined,
  });
  const [sessions, setSessions] = useState<EditableSession[]>(
    existingCourse?.sessions.map((session) => createEditableSession(session)) || [createEditableSession()]
  );
  const [submitted, setSubmitted] = useState(false);
  const [intervalDrafts, setIntervalDrafts] = useState<Record<string, string>>({});
  const errors: Record<string, string> = {};
  if (!title.trim()) errors['course-title'] = t('validation.required');
  sessions.forEach((session, index) => {
    const prefix = `session-${index}`;
    if (!isValidTime(session.startTime)) errors[`${prefix}-start`] = t('validation.time');
    if (!isValidTime(session.endTime)) errors[`${prefix}-end`] = t('validation.time');
    else if (isValidTime(session.startTime) && session.endTime <= session.startTime) errors[`${prefix}-end`] = t('courseForm.invalidTimeRange');
    const schedule = session.schedule;
    if (!schedule) return;
    if (!isValidDate(schedule.startDate ?? '')) errors[`${prefix}-start-date`] = t('validation.date');
    if (schedule.endDate && !isValidDate(schedule.endDate)) errors[`${prefix}-end-date`] = t('validation.date');
    else if (schedule.endDate && schedule.startDate && schedule.endDate < schedule.startDate) errors[`${prefix}-end-date`] = t('validation.dateOrder');
    const interval = Number(intervalDrafts[session.localId] ?? schedule.intervalWeeks ?? 1);
    if (!Number.isSafeInteger(interval) || interval < 1) errors[`${prefix}-interval`] = t('validation.interval');
    if (schedule.excludedDates?.some((date) => !isValidDate(date))) errors[`${prefix}-excluded-dates`] = t('validation.dateList');
    Object.entries(schedule.overrides ?? {}).forEach(([sourceDate, override]) => {
      if (!isValidDate(sourceDate)) errors[`${prefix}-override-${sourceDate}`] = t('validation.date');
      if (override.cancelled) return;
      if (override.moveToDate && !isValidDate(override.moveToDate)) errors[`${prefix}-move-${sourceDate}`] = t('validation.date');
      if (override.startTime && !isValidTime(override.startTime)) errors[`${prefix}-start-${sourceDate}`] = t('validation.time');
      if (override.endTime && !isValidTime(override.endTime)) errors[`${prefix}-end-${sourceDate}`] = t('validation.time');
      const start = override.startTime || session.startTime;
      const end = override.endTime || session.endTime;
      if (isValidTime(start) && isValidTime(end) && end <= start) errors[`${prefix}-end-${sourceDate}`] = t('courseForm.invalidTimeRange');
    });
  });
  const fieldError = (id: string) => submitted ? errors[id] : undefined;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const modalTitle = courseId ? t('courseForm.titleEdit') : t('courseForm.titleAdd');

  const handleAddSession = () => {
    setSessions([
      ...sessions,
      {
        localId: crypto.randomUUID(),
        meetDay: 'Monday',
        startTime: '09:00',
        endTime: '10:00',
        sessionType: '',
        icon: '',
        instructor: '',
        location: '',
      },
    ]);
  };

  const handleRemoveSession = (index: number) => {
    if (sessions.length > 1) {
      setSessions(sessions.filter((_, i) => i !== index));
    }
  };

  const handleSessionChange = (index: number, field: keyof Omit<EditableSession, 'localId'>, value: string) => {
    const newSessions = [...sessions];
    newSessions[index] = { ...newSessions[index], [field]: value };
    setSessions(newSessions);
  };

  const updateSchedule = (index: number, schedule: SessionSchedule | undefined) => {
    setSessions((current) => {
      const next = [...current];
      next[index] = { ...next[index], schedule };
      return next;
    });
  };

  const updateOverride = (index: number, sourceDate: string, override: SessionOverride | null) => {
    setSessions((current) => {
      const session = current[index];
      const schedule = session.schedule ?? { mode: 'weekly' as const, startDate: '' };
      const overrides = { ...(schedule.overrides ?? {}) };
      if (override) overrides[sourceDate] = override;
      else delete overrides[sourceDate];
      const next = [...current];
      next[index] = { ...session, schedule: { ...schedule, overrides } };
      return next;
    });
  };

  const handleSubmit = () => {
    setSubmitted(true);
    if (Object.keys(errors).length) { focusFirstError(errors); return; }
    const courseData = {
      title: title.trim(),
      color,
      icon: icon || undefined,
      sessions: sessions.map((session) => ({
        meetDay: session.meetDay,
        startTime: session.startTime,
        endTime: session.endTime,
        sessionType: session.sessionType,
        icon: session.icon || undefined,
        instructor: session.instructor,
        location: session.location,
        schedule: session.schedule,
        id: crypto.randomUUID(),
      })) as Session[],
    };

    if (courseId) {
      updateCourse(courseId, courseData);
    } else {
      addCourse(courseData);
    }
    onClose();
  };

  const handleDelete = () => {
    if (courseId) {
      setShowDeleteConfirm(true);
    }
  };

  const handleConfirmDelete = () => {
    if (courseId) {
      deleteCourse(courseId);
      onClose();
    }
  };

  return (
    <>
      <Modal
        variant={ModalVariant.large}
        aria-labelledby="course-form-title"
        isOpen={true}
        onClose={onClose}
      >
        <ModalHeader title={modalTitle} labelId="course-form-title" />
        <ModalBody>
          <Form id="course-edit-form" noValidate onSubmit={(event) => { event.preventDefault(); handleSubmit(); }}>
          <div className="course-form-grid course-form-grid--title">
          <FormGroup
            label={t('courseForm.courseTitle')}
            isRequired
            fieldId="course-title"
          >
            <TextInput
              error={fieldError("course-title")} id="course-title"
              type="text"
              value={title}
              onChange={(_event, value) => setTitle(value)}
              placeholder={t('courseForm.courseTitlePlaceholder')}
              isRequired
            />
          </FormGroup>

          <FormGroup
            label={t('courseForm.color')}
            fieldId="course-color"
          >
            <input
              id="course-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="course-color-picker"
            />
          </FormGroup>
          <FormGroup label={t('courseForm.icon')} fieldId="course-icon">
            <IconPicker value={icon || undefined} onChange={setIcon} automaticLabel={t('courseForm.iconAutomatic')} ariaLabel={t('courseForm.icon')} />
          </FormGroup>
        </div>

        <Divider className="pf-v6-u-my-lg" />

        <FormSection title={t('courseForm.sessions')}>
          {sessions.map((session, index) => (
            <Card key={session.localId} className="pf-v6-u-mb-md">
              <CardHeader>
                <CardTitle>
                  <div className="pf-v6-u-display-flex pf-v6-u-justify-content-space-between pf-v6-u-align-items-center">
                    <span>{t('courseForm.sessionNumber', { number: index + 1 })}</span>
                    {sessions.length > 1 && (
                      <Button
                        variant={ButtonVariant.plain}
                        isDanger
                        icon={<TrashIcon />}
                        onClick={() => handleRemoveSession(index)}
                        aria-label={t('courseForm.removeSession')}
                      />
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardBody>

              <div className="course-form-grid course-form-grid--three pf-v6-u-mb-md">
                <FormGroup label={t('courseForm.day')} isRequired fieldId={`session-${index}-day`}>
                  <FormSelect
                    id={`session-${index}-day`}
                    value={session.meetDay}
                    onChange={(_event, value) => handleSessionChange(index, 'meetDay', value as string)}
                    isRequired
                  >
                    {WEEKDAYS.map(day => (
                      <FormSelectOption key={day} value={day} label={t(`weekdays.${day.toLowerCase()}`)} />
                    ))}
                  </FormSelect>
                </FormGroup>

                <FormGroup label={t('courseForm.startTime')} isRequired fieldId={`session-${index}-start`}>
                  <TextInput
                    error={fieldError(`session-${index}-start`)} id={`session-${index}-start`}
                    type="time"
                    value={session.startTime}
                    onChange={(_event, value) => handleSessionChange(index, 'startTime', value)}
                    isRequired
                  />
                </FormGroup>

                <FormGroup label={t('courseForm.endTime')} isRequired fieldId={`session-${index}-end`}>
                  <TextInput
                    error={fieldError(`session-${index}-end`)} id={`session-${index}-end`}
                    type="time"
                    value={session.endTime}
                    onChange={(_event, value) => handleSessionChange(index, 'endTime', value)}
                    isRequired
                  />
                </FormGroup>
              </div>

              <div className="course-form-grid course-form-grid--three">
                <FormGroup label={t('courseForm.sessionType')} fieldId={`session-${index}-type`}>
                  <div className="session-type-field">
                  <IconPicker value={session.icon || undefined} fallbackIcon={icon || settings.eventTypeIcons?.[session.sessionType?.trim().toLowerCase() ?? ''] || DEFAULT_EVENT_TYPE_ICONS[session.sessionType?.trim().toLowerCase() ?? ''] || 'question'} onChange={(value) => handleSessionChange(index, 'icon', value)} automaticLabel={t('courseForm.iconCourseDefault')} ariaLabel={t('courseForm.icon')} />
                  <TextInput
                    error={fieldError(`session-${index}-type`)} id={`session-${index}-type`}
                    type="text"
                    value={session.sessionType || ''}
                    onChange={(_event, value) => handleSessionChange(index, 'sessionType', value)}
                    placeholder={t('courseForm.sessionTypePlaceholder')}
                  />
                  </div>
                </FormGroup>

                <FormGroup label={t('courseForm.location')} fieldId={`session-${index}-location`}>
                  <TextInput
                    error={fieldError(`session-${index}-location`)} id={`session-${index}-location`}
                    type="text"
                    value={session.location || ''}
                    onChange={(_event, value) => handleSessionChange(index, 'location', value)}
                    placeholder={t('courseForm.locationPlaceholder')}
                  />
                </FormGroup>

                <FormGroup label={t('courseForm.instructor')} fieldId={`session-${index}-instructor`}>
                  <TextInput
                    error={fieldError(`session-${index}-instructor`)} id={`session-${index}-instructor`}
                    type="text"
                    value={session.instructor || ''}
                    onChange={(_event, value) => handleSessionChange(index, 'instructor', value)}
                    placeholder={t('courseForm.instructorPlaceholder')}
                  />
                </FormGroup>
              </div>
              <Divider className="pf-v6-u-my-md" />
              <FormSection title={t('courseForm.scheduleAndExceptions')}>
                <div className="course-form-grid course-form-grid--three">
                  <FormGroup label={t('courseForm.pattern')} fieldId={`session-${index}-pattern`}>
                    <FormSelect
                      id={`session-${index}-pattern`}
                      value={session.schedule?.mode ?? 'weekly'}
                      onChange={(_event, value) => updateSchedule(index, value === 'weekly' ? undefined : {
                        mode: value as SessionSchedule['mode'],
                        startDate: session.schedule?.startDate ?? new Date().toISOString().slice(0, 10),
                        endDate: session.schedule?.endDate,
                        intervalWeeks: session.schedule?.intervalWeeks ?? 1,
                        excludedDates: session.schedule?.excludedDates ?? [],
                        overrides: session.schedule?.overrides ?? {},
                      })}
                    >
                      <FormSelectOption value="weekly" label={t('courseForm.everyWeek')} />
                      <FormSelectOption value="bounded" label={t('courseForm.betweenDates')} />
                      <FormSelectOption value="once" label={t('courseForm.oneDate')} />
                    </FormSelect>
                  </FormGroup>
                  {session.schedule && (
                    <>
                      <FormGroup label={t('courseForm.starts')} fieldId={`session-${index}-start-date`}>
                        <TextInput error={fieldError(`session-${index}-start-date`)} id={`session-${index}-start-date`} type="date" value={session.schedule.startDate ?? ''} onChange={(_event, value) => updateSchedule(index, { ...session.schedule!, startDate: value })} />
                      </FormGroup>
                      <FormGroup label={t('courseForm.endsOptional')} fieldId={`session-${index}-end-date`}>
                        <TextInput error={fieldError(`session-${index}-end-date`)} id={`session-${index}-end-date`} type="date" value={session.schedule.endDate ?? ''} onChange={(_event, value) => updateSchedule(index, { ...session.schedule!, endDate: value || undefined })} />
                      </FormGroup>
                    </>
                  )}
                </div>
                {session.schedule && (
                  <>
                    <FormGroup label={t('courseForm.repeatEveryWeeks')} fieldId={`session-${index}-interval`}>
                      <TextInput error={fieldError(`session-${index}-interval`)} id={`session-${index}-interval`} type="number" min={1} value={intervalDrafts[session.localId] ?? String(session.schedule.intervalWeeks ?? 1)} onChange={(_event, value) => { setIntervalDrafts((current) => ({ ...current, [session.localId]: value })); updateSchedule(index, { ...session.schedule!, intervalWeeks: Number(value) }); }} />
                    </FormGroup>
                    <FormGroup label={t('courseForm.excludedDates')} fieldId={`session-${index}-excluded-dates`}>
                      <TextInput error={fieldError(`session-${index}-excluded-dates`)} id={`session-${index}-excluded-dates`} value={(session.schedule.excludedDates ?? []).join(', ')} placeholder="YYYY-MM-DD, YYYY-MM-DD" onChange={(_event, value) => updateSchedule(index, { ...session.schedule!, excludedDates: value ? value.split(',').map((item) => item.trim()) : [] })} />
                    </FormGroup>
                    <div className="session-overrides">
                      <strong>{t('courseForm.occurrenceChanges')}</strong>
                      {Object.entries(session.schedule.overrides ?? {}).map(([sourceDate, override]) => (
                        <div className="session-override-row" key={sourceDate}>
                          <FormGroup label={t('courseForm.originalDate')} fieldId={`session-${index}-override-${sourceDate}`}>
                            <TextInput error={fieldError(`session-${index}-override-${sourceDate}`)} id={`session-${index}-override-${sourceDate}`} type="date" value={sourceDate} onChange={(_event, value) => { updateOverride(index, sourceDate, null); updateOverride(index, value, override); }} />
                          </FormGroup>
                          <FormGroup label={t('courseForm.moveToDate')} fieldId={`session-${index}-move-${sourceDate}`}>
                            <TextInput error={fieldError(`session-${index}-move-${sourceDate}`)} id={`session-${index}-move-${sourceDate}`} type="date" value={override.moveToDate ?? ''} onChange={(_event, value) => updateOverride(index, sourceDate, { ...override, moveToDate: value || undefined })} />
                          </FormGroup>
                          <FormGroup label={t('courseForm.overrideStart')} fieldId={`session-${index}-start-${sourceDate}`}>
                            <TextInput error={fieldError(`session-${index}-start-${sourceDate}`)} id={`session-${index}-start-${sourceDate}`} type="time" value={override.startTime ?? ''} onChange={(_event, value) => updateOverride(index, sourceDate, { ...override, startTime: value || undefined })} />
                          </FormGroup>
                          <FormGroup label={t('courseForm.overrideEnd')} fieldId={`session-${index}-end-${sourceDate}`}>
                            <TextInput error={fieldError(`session-${index}-end-${sourceDate}`)} id={`session-${index}-end-${sourceDate}`} type="time" value={override.endTime ?? ''} onChange={(_event, value) => updateOverride(index, sourceDate, { ...override, endTime: value || undefined })} />
                          </FormGroup>
                          <FormGroup label={t('courseForm.overrideRoom')} fieldId={`session-${index}-room-${sourceDate}`}>
                            <TextInput error={fieldError(`session-${index}-room-${sourceDate}`)} id={`session-${index}-room-${sourceDate}`} value={override.location ?? ''} onChange={(_event, value) => updateOverride(index, sourceDate, { ...override, location: value || undefined })} />
                          </FormGroup>
                          <div className="session-override-actions">
                            <Checkbox id={`session-${index}-cancel-${sourceDate}`} label={t('courseForm.cancelOccurrence')} isChecked={override.cancelled === true} onChange={(_event, checked) => updateOverride(index, sourceDate, { ...override, cancelled: checked || undefined })} />
                            <Button variant={ButtonVariant.link} onClick={() => updateOverride(index, sourceDate, null)}>{t('courseForm.removeOccurrenceChange')}</Button>
                          </div>
                        </div>
                      ))}
                      <Button variant={ButtonVariant.secondary} onClick={() => updateOverride(index, new Date().toISOString().slice(0, 10), {})}>{t('courseForm.addOccurrenceChange')}</Button>
                    </div>
                  </>
                )}
              </FormSection>
              </CardBody>
            </Card>
          ))}

          <Button
            variant={ButtonVariant.secondary}
            icon={<PlusCircleIcon />}
            onClick={handleAddSession}
            className="pf-v6-u-mt-md"
          >
            {t('courseForm.addSession')}
          </Button>
        </FormSection>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button key="submit" variant={ButtonVariant.primary} type="submit" form="course-edit-form">
            {courseId ? t('courseForm.update') : t('courseForm.add')} {t('courseForm.course')}
          </Button>
          <Button key="cancel" variant={ButtonVariant.link} onClick={onClose}>
            {t('courseForm.cancel')}
          </Button>
          {courseId && (
            <Button key="delete" variant={ButtonVariant.danger} onClick={handleDelete} className="course-form-delete-button">
              {t('courseForm.deleteCourse')}
            </Button>
          )}
        </ModalFooter>
      </Modal>
      {showDeleteConfirm && (
        <ConfirmDialog
          title={t('courseForm.deleteCourse')}
          message={t('courseForm.deleteConfirm')}
          confirmText={t('courseForm.deleteCourse')}
          cancelText={t('courseForm.cancel')}
          confirmVariant={ButtonVariant.danger}
          onConfirm={handleConfirmDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
};

export default CourseForm;
