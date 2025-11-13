import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Session, Weekday } from '../types/Course';
import { WEEKDAYS } from '../utils/timeUtils';
import { getNextColor } from '../utils/colors';
import { useCalendar } from '../context/CalendarContext';
import './CourseForm.css';

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{courseId ? t('courseForm.titleEdit') : t('courseForm.titleAdd')}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>
              {t('courseForm.courseTitle')} <span className="required">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('courseForm.courseTitlePlaceholder')}
              required
            />
          </div>

          <div className="form-group">
            <label>{t('courseForm.color')}</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </div>

          <div className="sessions-section">
            <h3>{t('courseForm.sessions')}</h3>
            {sessions.map((session, index) => (
              <div key={index} className="session-group">
                <div className="session-header">
                  <h4>{t('courseForm.sessionNumber', { number: index + 1 })}</h4>
                  {sessions.length > 1 && (
                    <button
                      type="button"
                      className="remove-session-button"
                      onClick={() => handleRemoveSession(index)}
                    >
                      {t('courseForm.removeSession')}
                    </button>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>
                      {t('courseForm.day')} <span className="required">*</span>
                    </label>
                    <select
                      value={session.meetDay}
                      onChange={(e) =>
                        handleSessionChange(index, 'meetDay', e.target.value)
                      }
                      required
                    >
                      {WEEKDAYS.map(day => (
                        <option key={day} value={day}>
                          {t(`weekdays.${day.toLowerCase()}`)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>
                      {t('courseForm.startTime')} <span className="required">*</span>
                    </label>
                    <input
                      type="time"
                      value={session.startTime}
                      onChange={(e) =>
                        handleSessionChange(index, 'startTime', e.target.value)
                      }
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      {t('courseForm.endTime')} <span className="required">*</span>
                    </label>
                    <input
                      type="time"
                      value={session.endTime}
                      onChange={(e) =>
                        handleSessionChange(index, 'endTime', e.target.value)
                      }
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>{t('courseForm.sessionType')}</label>
                    <input
                      type="text"
                      value={session.sessionType || ''}
                      onChange={(e) =>
                        handleSessionChange(index, 'sessionType', e.target.value)
                      }
                      placeholder={t('courseForm.sessionTypePlaceholder')}
                    />
                  </div>

                  <div className="form-group">
                    <label>{t('courseForm.location')}</label>
                    <input
                      type="text"
                      value={session.location || ''}
                      onChange={(e) =>
                        handleSessionChange(index, 'location', e.target.value)
                      }
                      placeholder={t('courseForm.locationPlaceholder')}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>{t('courseForm.instructor')}</label>
                  <input
                    type="text"
                    value={session.instructor || ''}
                    onChange={(e) =>
                      handleSessionChange(index, 'instructor', e.target.value)
                    }
                    placeholder={t('courseForm.instructorPlaceholder')}
                  />
                </div>
              </div>
            ))}

            <button type="button" className="add-session-button" onClick={handleAddSession}>
              {t('courseForm.addSession')}
            </button>
          </div>

          <div className="form-actions">
            <div>
              {courseId && (
                <button type="button" className="delete-button" onClick={handleDelete}>
                  {t('courseForm.deleteCourse')}
                </button>
              )}
            </div>
            <div>
              <button type="button" className="cancel-button" onClick={onClose}>
                {t('courseForm.cancel')}
              </button>
              <button type="submit" className="submit-button">
                {courseId ? t('courseForm.update') : t('courseForm.add')} {t('courseForm.course')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CourseForm;
