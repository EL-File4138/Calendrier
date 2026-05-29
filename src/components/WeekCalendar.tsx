import { useMemo, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
  const contextMenuRef = useRef<HTMLDivElement>(null);

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

  const sessionsByDay = useMemo(() => {
    const layouts = new Map<Weekday, PositionedSession[]>();

    visibleWeekdays.forEach((day) => {
      const daySessions = courses
        .flatMap((course) => course.sessions
          .filter((session) => session.meetDay === day)
          .map((session) => ({
            course,
            session,
            start: timeToMinutes(session.startTime),
            end: timeToMinutes(session.endTime),
            column: 0,
            columns: 1,
          })))
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
  }, [courses, visibleWeekdays]);

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
    const calendarBody = calendarRef.current?.querySelector('.calendar-body');
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
      <div className="calendar-grid">
        <div className="calendar-header">
          <div className="time-label-header"></div>
          {visibleWeekdays.map(day => (
            <div key={day} className="day-header">
              {t(`weekdays.${day.toLowerCase()}`)}
            </div>
          ))}
        </div>

        <div className="calendar-body">
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
                          key={session.id}
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
    </div>
  );
};

export default WeekCalendar;
