import type { Course, Session, TimeFormat } from '../types/Course';
import { useCalendar } from '../context/CalendarContext';
import { EventTypeIcon } from '../utils/EventTypeIcon';
import { DEFAULT_EVENT_TYPE_ICONS } from '../utils/eventIcons';
import { formatTime } from '../utils/timeUtils';
import './CourseBlock.css';

interface CourseBlockProps {
  course: Course;
  session: Session;
  onContextMenu: (e: React.MouseEvent, courseId: string) => void;
  onClick: () => void;
  timeFormat: TimeFormat;
}

const CourseBlock = ({ course, session, onContextMenu, onClick, timeFormat }: CourseBlockProps) => {
  const { settings } = useCalendar();
  const typeKey = session.sessionType?.trim().toLocaleLowerCase();
  const icon = session.icon || course.icon || (typeKey ? settings.eventTypeIcons?.[typeKey] || DEFAULT_EVENT_TYPE_ICONS[typeKey] || 'question' : undefined);
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, course.id);
  };

  return (
    <button
      type="button"
      className="course-block"
      style={{ backgroundColor: course.color }}
      onContextMenu={handleContextMenu}
      onClick={onClick}
    >
      <div className="course-title">{icon && <span className="course-type-icon" aria-hidden="true"><EventTypeIcon id={icon} /></span>}{course.title}</div>
      <div className="course-time">
        {formatTime(session.startTime, timeFormat)} - {formatTime(session.endTime, timeFormat)}
      </div>
      {session.sessionType && (
        <div className="course-session-type">{session.sessionType}</div>
      )}
      {session.location && (
        <div className="course-location">{session.location}</div>
      )}
      {session.instructor && (
        <div className="course-instructor">{session.instructor}</div>
      )}
    </button>
  );
};

export default CourseBlock;
