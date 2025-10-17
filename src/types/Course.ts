export type Weekday = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export type TimeFormat = '12h' | '24h';
export type WeekStart = 'Monday' | 'Sunday';

export interface Session {
  id: string;
  meetDay: Weekday;
  startTime: string; // Format: "HH:mm"
  endTime: string;   // Format: "HH:mm"
  sessionType?: string;
  instructor?: string;
  location?: string;
}

export interface Course {
  id: string;
  title: string;
  color: string;
  sessions: Session[];
}

export interface Settings {
  timeFormat: TimeFormat;
  weekStart: WeekStart;
}

export interface CalendarData {
  title?: string;
  courses: Course[];
  settings?: Settings;
}
