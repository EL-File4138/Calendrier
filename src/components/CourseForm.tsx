import { useState } from 'react';
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
    (newSessions[index] as any)[field] = value;
    setSessions(newSessions);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Course title is required');
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
    if (courseId && window.confirm('Are you sure you want to delete this course?')) {
      deleteCourse(courseId);
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{courseId ? 'Edit Course' : 'Add Course'}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>
              Course Title <span className="required">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Introduction to Computer Science"
              required
            />
          </div>

          <div className="form-group">
            <label>Color</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </div>

          <div className="sessions-section">
            <h3>Sessions</h3>
            {sessions.map((session, index) => (
              <div key={index} className="session-group">
                <div className="session-header">
                  <h4>Session {index + 1}</h4>
                  {sessions.length > 1 && (
                    <button
                      type="button"
                      className="remove-session-button"
                      onClick={() => handleRemoveSession(index)}
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>
                      Day <span className="required">*</span>
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
                          {day}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>
                      Start Time <span className="required">*</span>
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
                      End Time <span className="required">*</span>
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
                    <label>Session Type</label>
                    <input
                      type="text"
                      value={session.sessionType || ''}
                      onChange={(e) =>
                        handleSessionChange(index, 'sessionType', e.target.value)
                      }
                      placeholder="e.g., Lecture, Lab, Tutorial"
                    />
                  </div>

                  <div className="form-group">
                    <label>Location</label>
                    <input
                      type="text"
                      value={session.location || ''}
                      onChange={(e) =>
                        handleSessionChange(index, 'location', e.target.value)
                      }
                      placeholder="e.g., Room 101"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Instructor</label>
                  <input
                    type="text"
                    value={session.instructor || ''}
                    onChange={(e) =>
                      handleSessionChange(index, 'instructor', e.target.value)
                    }
                    placeholder="e.g., Dr. Smith"
                  />
                </div>
              </div>
            ))}

            <button type="button" className="add-session-button" onClick={handleAddSession}>
              + Add Session
            </button>
          </div>

          <div className="form-actions">
            <div>
              {courseId && (
                <button type="button" className="delete-button" onClick={handleDelete}>
                  Delete Course
                </button>
              )}
            </div>
            <div>
              <button type="button" className="cancel-button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="submit-button">
                {courseId ? 'Update' : 'Add'} Course
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CourseForm;
