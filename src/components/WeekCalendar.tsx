import { useMemo, useState, useRef, useEffect } from 'react';
import { useCalendar } from '../context/CalendarContext';
import { getOrderedWeekdays, timeToMinutes, minutesToTime, calculateTimeRange, formatTime } from '../utils/timeUtils';
import type { Weekday, Course, Session } from '../types/Course';
import CourseBlock from './CourseBlock';
import SessionDetailDialog from './SessionDetailDialog';
import './WeekCalendar.css';

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

const WeekCalendar = ({ onEditCourse, onDragCreate }: WeekCalendarProps) => {
  const { courses, settings, duplicateCourse, deleteCourse, title } = useCalendar();
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
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ day: Weekday; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ day: Weekday; y: number } | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  const allSessions = useMemo(
    () => courses.flatMap(course => course.sessions),
    [courses]
  );

  const { start: startMinutes, end: endMinutes } = useMemo(
    () => calculateTimeRange(allSessions),
    [allSessions]
  );

  const orderedWeekdays = useMemo(
    () => getOrderedWeekdays(settings.weekStart),
    [settings.weekStart]
  );

  // Check if there are any sessions on Saturday or Sunday
  const hasWeekendSessions = useMemo(() => {
    return allSessions.some(
      session => session.meetDay === 'Saturday' || session.meetDay === 'Sunday'
    );
  }, [allSessions]);

  // Filter weekdays to hide Saturday/Sunday if no sessions
  const visibleWeekdays = useMemo(() => {
    if (hasWeekendSessions) {
      return orderedWeekdays;
    }
    return orderedWeekdays.filter(day => day !== 'Saturday' && day !== 'Sunday');
  }, [orderedWeekdays, hasWeekendSessions]);

  const timeSlots = useMemo(() => {
    const slots: number[] = [];
    for (let i = startMinutes; i <= endMinutes; i += 60) {
      slots.push(i);
    }
    return slots;
  }, [startMinutes, endMinutes]);

  const pixelsPerMinute = 80 / 60; // 80px per hour

  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu({ visible: false, x: 0, y: 0, courseId: null });
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, courseId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
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

  const getPositionForSession = (startTime: string, endTime: string) => {
    const startMins = timeToMinutes(startTime);
    const endMins = timeToMinutes(endTime);
    const top = (startMins - startMinutes) * pixelsPerMinute;
    const height = (endMins - startMins) * pixelsPerMinute;
    return { top, height };
  };

  const getTimeFromY = (y: number): number => {
    const rect = calendarRef.current?.getBoundingClientRect();
    if (!rect) return startMinutes;

    const relativeY = y - rect.top - 50; // 50px for header
    const minutes = Math.round((relativeY / pixelsPerMinute) / 15) * 15;
    return Math.max(startMinutes, Math.min(endMinutes, startMinutes + minutes));
  };

  const getDayFromX = (x: number): Weekday | null => {
    const rect = calendarRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const relativeX = x - rect.left - 80; // 80px for time labels
    const dayWidth = (rect.width - 80) / visibleWeekdays.length;
    const dayIndex = Math.floor(relativeX / dayWidth);

    if (dayIndex >= 0 && dayIndex < visibleWeekdays.length) {
      return visibleWeekdays[dayIndex];
    }
    return null;
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
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
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
          top: `${top}px`,
          height: `${height}px`,
        }}
      />
    );
  };

  return (
    <div className="week-calendar" ref={calendarRef}>
      <h2 className="calendar-title print-only">{title}</h2>
      <div className="calendar-grid">
        <div className="calendar-header">
          <div className="time-label-header"></div>
          {visibleWeekdays.map(day => (
            <div key={day} className="day-header">
              {day}
            </div>
          ))}
        </div>

        <div className="calendar-body">
          <div className="time-labels">
            {timeSlots.map(minutes => (
              <div key={minutes} className="time-label" style={{ height: '80px' }}>
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
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              >
                {timeSlots.map(minutes => (
                  <div key={minutes} className="time-slot" style={{ height: '80px' }} />
                ))}

                {courses.map(course =>
                  course.sessions
                    .filter(session => session.meetDay === day)
                    .map(session => {
                      const { top, height } = getPositionForSession(
                        session.startTime,
                        session.endTime
                      );
                      return (
                        <div
                          key={session.id}
                          className="course-block-wrapper"
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
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
                    })
                )}

                {isDragging && dragStart?.day === day && renderDragPreview()}
              </div>
            ))}
          </div>
        </div>
      </div>

      {contextMenu.visible && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={handleDuplicate}>Duplicate</button>
          <button onClick={() => {
            if (contextMenu.courseId) onEditCourse(contextMenu.courseId);
            setContextMenu({ visible: false, x: 0, y: 0, courseId: null });
          }}>Edit</button>
          <button onClick={handleDelete}>Delete</button>
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
    </div>
  );
};

export default WeekCalendar;
