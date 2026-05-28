import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  ModalVariant,
  ModalBody,
  ModalFooter,
  Button,
  ButtonVariant,
  Form,
  FormGroup,
  TextInput,
  FormSection,
  FormSelect,
  FormSelectOption,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Divider
} from '@patternfly/react-core';
import { TrashIcon, PlusCircleIcon } from '@patternfly/react-icons';
import type { Session, Weekday } from '../types/Course';
import { WEEKDAYS } from '../utils/timeUtils';
import { getNextColor } from '../utils/colors';
import { useCalendar } from '../context/CalendarContext';

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
  const { courses, addCourse, updateCourse, deleteCourse } = useCalendar();

  const existingCourse = courseId ? courses.find(c => c.id === courseId) : null;

  const [title, setTitle] = useState(existingCourse?.title || '');
  const [color, setColor] = useState(
    existingCourse?.color || getNextColor(courses.map(c => c.color))
  );
  const [sessions, setSessions] = useState<Omit<Session, 'id'>[]>(
    existingCourse?.sessions || [
      {
        meetDay: initialData?.day || 'Monday',
        startTime: initialData?.startTime || '09:00',
        endTime: initialData?.endTime || '10:00',
        sessionType: '',
        instructor: '',
        location: '',
      },
    ]
  );

  const handleAddSession = () => {
    setSessions([
      ...sessions,
      {
        meetDay: 'Monday',
        startTime: '09:00',
        endTime: '10:00',
        sessionType: '',
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

  const handleSessionChange = (index: number, field: keyof Omit<Session, 'id'>, value: string) => {
    const newSessions = [...sessions];
    newSessions[index] = { ...newSessions[index], [field]: value };
    setSessions(newSessions);
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      alert(t('courseForm.titleRequired'));
      return;
    }

    const courseData = {
      title: title.trim(),
      color,
      sessions: sessions.map(s => ({ ...s, id: crypto.randomUUID() })) as Session[],
    };

    if (courseId) {
      updateCourse(courseId, courseData);
    } else {
      addCourse(courseData);
    }
    onClose();
  };

  const handleDelete = () => {
    if (courseId && window.confirm(t('courseForm.deleteConfirm'))) {
      deleteCourse(courseId);
      onClose();
    }
  };

  return (
    <Modal
      variant={ModalVariant.large}
      title={courseId ? t('courseForm.titleEdit') : t('courseForm.titleAdd')}
      isOpen={true}
      onClose={onClose}
    >
      <ModalBody>
        <Form>
        <div className="course-form-grid course-form-grid--title">
          <FormGroup
            label={t('courseForm.courseTitle')}
            isRequired
            fieldId="course-title"
          >
            <TextInput
              id="course-title"
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
        </div>

        <Divider className="pf-v6-u-my-lg" />

        <FormSection title={t('courseForm.sessions')}>
          {sessions.map((session, index) => (
            <Card key={index} className="pf-v6-u-mb-md">
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
                    id={`session-${index}-start`}
                    type="time"
                    value={session.startTime}
                    onChange={(_event, value) => handleSessionChange(index, 'startTime', value)}
                    isRequired
                  />
                </FormGroup>

                <FormGroup label={t('courseForm.endTime')} isRequired fieldId={`session-${index}-end`}>
                  <TextInput
                    id={`session-${index}-end`}
                    type="time"
                    value={session.endTime}
                    onChange={(_event, value) => handleSessionChange(index, 'endTime', value)}
                    isRequired
                  />
                </FormGroup>
              </div>

              <div className="course-form-grid course-form-grid--three">
                <FormGroup label={t('courseForm.sessionType')} fieldId={`session-${index}-type`}>
                  <TextInput
                    id={`session-${index}-type`}
                    type="text"
                    value={session.sessionType || ''}
                    onChange={(_event, value) => handleSessionChange(index, 'sessionType', value)}
                    placeholder={t('courseForm.sessionTypePlaceholder')}
                  />
                </FormGroup>

                <FormGroup label={t('courseForm.location')} fieldId={`session-${index}-location`}>
                  <TextInput
                    id={`session-${index}-location`}
                    type="text"
                    value={session.location || ''}
                    onChange={(_event, value) => handleSessionChange(index, 'location', value)}
                    placeholder={t('courseForm.locationPlaceholder')}
                  />
                </FormGroup>

                <FormGroup label={t('courseForm.instructor')} fieldId={`session-${index}-instructor`}>
                  <TextInput
                    id={`session-${index}-instructor`}
                    type="text"
                    value={session.instructor || ''}
                    onChange={(_event, value) => handleSessionChange(index, 'instructor', value)}
                    placeholder={t('courseForm.instructorPlaceholder')}
                  />
                </FormGroup>
              </div>
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
        <Button key="submit" variant={ButtonVariant.primary} onClick={handleSubmit}>
          {courseId ? t('courseForm.update') : t('courseForm.add')} {t('courseForm.course')}
        </Button>
        <Button key="cancel" variant={ButtonVariant.link} onClick={onClose}>
          {t('courseForm.cancel')}
        </Button>
        {courseId && (
          <Button key="delete" variant={ButtonVariant.danger} onClick={handleDelete} style={{ marginLeft: 'auto' }}>
            {t('courseForm.deleteCourse')}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
};

export default CourseForm;
