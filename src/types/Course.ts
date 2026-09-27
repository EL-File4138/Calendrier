export type Weekday = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export type TimeFormat = '12h' | '24h';
export type WeekStart = 'Monday' | 'Sunday';

export type AcademicPeriodKind = 'semester' | 'break' | 'holiday' | 'exams' | 'retakeExams' | 'other';

export interface AcademicPeriod {
  id: string;
  label: string;
  kind: AcademicPeriodKind;
  startDate: string;
  endDate: string;
}

export interface AcademicCalendar {
  yearLabel: string;
  startDate: string;
  endDate: string;
  periods: AcademicPeriod[];
  specialDates?: Record<string, string>;
}

export interface Session {
  id: string;
  meetDay: Weekday;
  startTime: string; // Format: "HH:mm"
  endTime: string;   // Format: "HH:mm"
  sessionType?: string;
  icon?: string;
  instructor?: string;
  location?: string;
  schedule?: SessionSchedule;
}

export interface SessionOverride {
  cancelled?: boolean;
  moveToDate?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  instructor?: string;
}

export interface SessionSchedule {
  mode: 'weekly' | 'once' | 'bounded';
  startDate?: string;
  endDate?: string;
  intervalWeeks?: number;
  excludedDates?: string[];
  overrides?: Record<string, SessionOverride>;
}

export interface EditableSession extends Omit<Session, 'id'> {
  localId: string;
}

export interface Course {
  id: string;
  title: string;
  color: string;
  icon?: string;
  sessions: Session[];
}

export interface Settings {
  timeFormat: TimeFormat;
  weekStart: WeekStart;
  weekView?: 'full' | 'school';
  eventTypeIcons?: Record<string, string>;
  academicCalendar?: AcademicCalendar;
}

export interface CalendarData {
  title?: string;
  courses: Course[];
  settings?: Settings;
}
