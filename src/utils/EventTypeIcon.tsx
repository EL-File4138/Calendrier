import type { SVGIconProps } from '@patternfly/react-icons/dist/js/createIcon';
import { EVENT_ICON_OPTIONS } from './eventIcons';

export const EventTypeIcon = ({ id, ...props }: SVGIconProps & { id?: string }) => {
  const option = EVENT_ICON_OPTIONS.find((item) => item.id === id) ?? EVENT_ICON_OPTIONS.find((item) => item.id === 'question')!;
  const Icon = option.Icon;
  return <Icon {...props} />;
};
