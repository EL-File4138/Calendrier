import { BookOpenIcon, FlaskIcon, PencilAltIcon, CommentsIcon, ProjectDiagramIcon, ChalkboardTeacherIcon, QuestionCircleIcon, CalendarAltIcon, BriefcaseIcon, UsersIcon, CoffeeIcon, HomeIcon, HeartIcon, RunningIcon, PlaneIcon, MusicIcon, StarIcon, BellIcon, ShoppingCartIcon, UtensilsIcon, LaptopIcon, CheckCircleIcon } from '@patternfly/react-icons';
import type { ComponentType } from 'react';
import type { SVGIconProps } from '@patternfly/react-icons/dist/js/createIcon';

export const EVENT_ICON_OPTIONS: Array<{ id: string; label: string; Icon: ComponentType<SVGIconProps> }> = [
  { id: 'book', label: 'Book', Icon: BookOpenIcon },
  { id: 'lab', label: 'Laboratory', Icon: FlaskIcon },
  { id: 'pencil', label: 'Pencil', Icon: PencilAltIcon },
  { id: 'comments', label: 'Discussion', Icon: CommentsIcon },
  { id: 'project', label: 'Project', Icon: ProjectDiagramIcon },
  { id: 'teacher', label: 'Teaching', Icon: ChalkboardTeacherIcon },
  { id: 'calendar', label: 'Appointment', Icon: CalendarAltIcon },
  { id: 'work', label: 'Work', Icon: BriefcaseIcon },
  { id: 'people', label: 'Gathering', Icon: UsersIcon },
  { id: 'coffee', label: 'Break', Icon: CoffeeIcon },
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'heart', label: 'Health', Icon: HeartIcon },
  { id: 'sport', label: 'Exercise', Icon: RunningIcon },
  { id: 'travel', label: 'Travel', Icon: PlaneIcon },
  { id: 'music', label: 'Music', Icon: MusicIcon },
  { id: 'star', label: 'Special event', Icon: StarIcon },
  { id: 'bell', label: 'Reminder', Icon: BellIcon },
  { id: 'shopping', label: 'Shopping', Icon: ShoppingCartIcon },
  { id: 'meal', label: 'Meal', Icon: UtensilsIcon },
  { id: 'computer', label: 'Computer', Icon: LaptopIcon },
  { id: 'task', label: 'Task', Icon: CheckCircleIcon },
  { id: 'question', label: 'Other', Icon: QuestionCircleIcon },
];

export const DEFAULT_EVENT_TYPE_ICONS: Record<string, string> = {
  lecture: 'book', laboratory: 'lab', exercise: 'pencil', seminar: 'comments', project: 'project', tutorial: 'teacher',
};
