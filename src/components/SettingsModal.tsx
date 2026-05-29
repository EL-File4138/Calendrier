import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  ButtonVariant,
  Form,
  FormGroup,
  Radio
} from '@patternfly/react-core';
import { useCalendar } from '../context/CalendarContext';
import type { TimeFormat, WeekStart } from '../types/Course';
import { AVAILABLE_LANGUAGES } from '../i18n/config';

interface SettingsModalProps {
  onClose: () => void;
}

const SettingsModal = ({ onClose }: SettingsModalProps) => {
  const { t, i18n } = useTranslation();
  const { settings, updateSettings } = useCalendar();
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(settings.timeFormat);
  const [weekStart, setWeekStart] = useState<WeekStart>(settings.weekStart);
  const [language, setLanguage] = useState(i18n.language);

  const handleSave = () => {
    updateSettings({ timeFormat, weekStart });
    i18n.changeLanguage(language);
    onClose();
  };

  return (
    <Modal
      variant={ModalVariant.small}
      aria-labelledby="settings-modal-title"
      isOpen={true}
      onClose={onClose}
    >
      <ModalHeader title={t('settings.title')} labelId="settings-modal-title" />
      <ModalBody>
        <Form>
        <FormGroup label={t('settings.timeFormat')} role="radiogroup" className="pf-v6-u-mb-md">
          <Radio
            id="time-format-24h"
            name="timeFormat"
            label={t('settings.timeFormat24h')}
            isChecked={timeFormat === '24h'}
            onChange={() => setTimeFormat('24h')}
          />
          <Radio
            id="time-format-12h"
            name="timeFormat"
            label={t('settings.timeFormat12h')}
            isChecked={timeFormat === '12h'}
            onChange={() => setTimeFormat('12h')}
          />
        </FormGroup>

        <FormGroup label={t('settings.weekStartsOn')} role="radiogroup" className="pf-v6-u-mb-md">
          <Radio
            id="week-start-monday"
            name="weekStart"
            label={t('settings.monday')}
            isChecked={weekStart === 'Monday'}
            onChange={() => setWeekStart('Monday')}
          />
          <Radio
            id="week-start-sunday"
            name="weekStart"
            label={t('settings.sunday')}
            isChecked={weekStart === 'Sunday'}
            onChange={() => setWeekStart('Sunday')}
          />
        </FormGroup>

        <FormGroup label={t('settings.language')} role="radiogroup" className="pf-v6-u-mb-md">
          {AVAILABLE_LANGUAGES.map((lang) => (
            <Radio
              key={lang.code}
              id={`language-${lang.code}`}
              name="language"
              label={lang.name}
              isChecked={language === lang.code}
              onChange={() => setLanguage(lang.code)}
            />
          ))}
        </FormGroup>
      </Form>
      </ModalBody>
      <ModalFooter>
        <Button key="save" variant={ButtonVariant.primary} onClick={handleSave}>
          {t('settings.save')}
        </Button>
        <Button key="cancel" variant={ButtonVariant.link} onClick={onClose}>
          {t('settings.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default SettingsModal;
