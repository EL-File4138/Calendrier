import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ButtonVariant, Popover, PopoverPosition } from '@patternfly/react-core';
import { EditAltIcon } from '@patternfly/react-icons';
import { EVENT_ICON_OPTIONS } from '../utils/eventIcons';
import { EventTypeIcon } from '../utils/EventTypeIcon';
import './IconPicker.css';

interface IconPickerProps {
  value?: string;
  fallbackIcon?: string;
  onChange: (value: string) => void;
  automaticLabel?: string;
  ariaLabel: string;
  id?: string;
}

const IconPicker = ({ value, fallbackIcon, onChange, automaticLabel, ariaLabel, id }: IconPickerProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    // The popover portal and modal both listen for Escape on the document.
    // Close the topmost overlay before the modal handles the same key.
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('keydown', closeOnEscape, true);
    return () => document.removeEventListener('keydown', closeOnEscape, true);
  }, [open]);
  const choose = (icon: string) => {
    onChange(icon);
    setOpen(false);
    triggerRef.current?.focus();
  };
  return (
    <Popover
      aria-label={ariaLabel}
      closeBtnAriaLabel={t('sessionDetail.close')}
      hasAutoWidth
      elementToFocus=".icon-picker-palette button"
      isVisible={open}
      position={PopoverPosition.bottomStart}
      shouldClose={() => setOpen(false)}
      bodyContent={(
        <div className="icon-picker-palette" role="group" aria-label={ariaLabel}>
          <Button variant="link" className="icon-picker-option--automatic" aria-pressed={!value} onClick={() => choose('')}>{automaticLabel ?? t('courseForm.iconAutomatic')}</Button>
          {EVENT_ICON_OPTIONS.map(({ id, label }) => (
            <Button variant={value === id ? 'secondary' : 'plain'} className="icon-picker-option" key={id} title={t(`icons.${id}`, label)} aria-label={t(`icons.${id}`, label)} aria-pressed={value === id} onClick={() => choose(id)}>
              <EventTypeIcon id={id} aria-hidden="true" />
            </Button>
          ))}
        </div>
      )}
    >
      <Button id={id} ref={triggerRef} variant={ButtonVariant.control} aria-label={ariaLabel} aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        {value || fallbackIcon ? <EventTypeIcon id={value || fallbackIcon} aria-hidden="true" /> : <EditAltIcon aria-hidden="true" />}
      </Button>
    </Popover>
  );
};

export default IconPicker;
