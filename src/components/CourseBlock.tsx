import type { Course, Session, TimeFormat } from '../types/Course';
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
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, course.id);
  };

  return (
    <div
      className="course-block"
      style={{ backgroundColor: course.color }}
      onContextMenu={handleContextMenu}
      onClick={onClick}
    >
      <div className="course-title">{course.title}</div>
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
    </div>
  );
};

export default CourseBlock;
