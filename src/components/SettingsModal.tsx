import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ModalVariant, ModalHeader, ModalBody, ModalFooter, Button, ButtonVariant, Form, FormGroup, Radio } from '@patternfly/react-core';
import { useCalendar } from '../context/CalendarContext';
import type { TimeFormat, WeekStart } from '../types/Course';
import { AVAILABLE_LANGUAGES } from '../i18n/config';
import { DEFAULT_EVENT_TYPE_ICONS } from '../utils/eventIcons';
import IconPicker from './IconPicker';
import './SettingsModal.css';
import { version } from '../../package.json';

interface SettingsModalProps { onClose: () => void; }

const SettingsModal = ({ onClose }: SettingsModalProps) => {
  const { t, i18n } = useTranslation();
  const { settings, updateSettings } = useCalendar();
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(settings.timeFormat);
  const [weekStart, setWeekStart] = useState<WeekStart>(settings.weekStart);
  const [weekView, setWeekView] = useState(settings.weekView ?? 'school');
  const [eventTypeIcons, setEventTypeIcons] = useState<Record<string, string>>(settings.eventTypeIcons ?? {});
  const [language, setLanguage] = useState(i18n.resolvedLanguage ?? 'en');
  const [showAbout, setShowAbout] = useState(false);

  const handleSave = () => {
    updateSettings({ timeFormat, weekStart, weekView, eventTypeIcons });
    i18n.changeLanguage(language);
    onClose();
  };

  return (
    <Modal variant={ModalVariant.small} aria-labelledby="settings-modal-title" isOpen onClose={showAbout ? () => setShowAbout(false) : onClose}>
      <ModalHeader title={t(showAbout ? 'about.title' : 'settings.title')} labelId="settings-modal-title" />
      <ModalBody>
        {showAbout ? <div className="about-content">
          <div className="about-brand">
            <img src="/icon.png" alt="" width="88" height="88" />
            <h3>Calendrier</h3>
            <p className="about-version">{t('about.version', { version })}</p>
            <p>{t('about.description')}</p>
          </div>
          <section aria-labelledby="about-features">
            <h3 id="about-features">{t('about.featuresTitle')}</h3>
            <p>{t('about.features')}</p>
          </section>
          <section aria-labelledby="about-storage">
            <h3 id="about-storage">{t('about.storageTitle')}</h3>
            <p>{t('about.storage')}</p>
          </section>
          <section aria-labelledby="about-license">
            <h3 id="about-license">{t('about.licenseTitle')}</h3>
            <p>{t('about.license')}</p>
          </section>
        </div> : <>
        <Form className="settings-form">
          <FormGroup label={t('settings.timeFormat')} role="radiogroup" className="pf-v6-u-mb-md">
            <Radio id="time-format-24h" name="timeFormat" label={t('settings.timeFormat24h')} isChecked={timeFormat === '24h'} onChange={() => setTimeFormat('24h')} />
            <Radio id="time-format-12h" name="timeFormat" label={t('settings.timeFormat12h')} isChecked={timeFormat === '12h'} onChange={() => setTimeFormat('12h')} />
          </FormGroup>
          <FormGroup label={t('settings.weekStartsOn')} role="radiogroup" className="pf-v6-u-mb-md">
            <Radio id="week-start-monday" name="weekStart" label={t('settings.monday')} isChecked={weekStart === 'Monday'} onChange={() => setWeekStart('Monday')} />
            <Radio id="week-start-sunday" name="weekStart" label={t('settings.sunday')} isChecked={weekStart === 'Sunday'} onChange={() => setWeekStart('Sunday')} />
          </FormGroup>
          <FormGroup label={t('settings.weekView')} role="radiogroup" className="pf-v6-u-mb-md">
            <Radio id="week-view-full" name="weekView" label={t('settings.fullWeek')} isChecked={weekView === 'full'} onChange={() => setWeekView('full')} />
            <Radio id="week-view-school" name="weekView" label={t('settings.schoolWeek')} isChecked={weekView === 'school'} onChange={() => setWeekView('school')} />
          </FormGroup>
          <FormGroup label={t('settings.eventTypeIcons')} className="pf-v6-u-mb-md">
            <div className="event-type-icon-settings">
              {['lecture', 'laboratory', 'exercise', 'seminar', 'project', 'tutorial'].map((type) => (
                <label className="event-type-icon-setting" key={type} htmlFor={`event-icon-${type}`}>
                  {t(`eventTypes.${type}`)} <IconPicker id={`event-icon-${type}`} value={eventTypeIcons[type] || DEFAULT_EVENT_TYPE_ICONS[type]} automaticLabel={t('settings.resetDefaults')} onChange={(value) => setEventTypeIcons((current) => ({ ...current, [type]: value || DEFAULT_EVENT_TYPE_ICONS[type] }))} ariaLabel={t('settings.typeIcon', { type: t(`eventTypes.${type}`) })} />
                </label>
              ))}
            </div>
            <Button variant={ButtonVariant.link} isInline onClick={() => setEventTypeIcons({ ...DEFAULT_EVENT_TYPE_ICONS })}>{t('settings.resetDefaults')}</Button>
          </FormGroup>
          <FormGroup label={t('settings.language')} role="radiogroup" className="pf-v6-u-mb-md">
            {AVAILABLE_LANGUAGES.map((lang) => <Radio key={lang.code} id={`language-${lang.code}`} name="language" label={lang.name} isChecked={language === lang.code} onChange={() => setLanguage(lang.code)} />)}
          </FormGroup>
        </Form>
        </>}
      </ModalBody>
      <ModalFooter>
        {showAbout ? <Button variant={ButtonVariant.primary} onClick={() => setShowAbout(false)}>{t('about.back')}</Button> : <>
        <Button variant={ButtonVariant.primary} onClick={handleSave}>{t('settings.save')}</Button>
        <Button variant={ButtonVariant.link} onClick={onClose}>{t('settings.cancel')}</Button>
        <Button className="settings-about-button" variant={ButtonVariant.link} onClick={() => setShowAbout(true)}>{t('about.entry')}</Button>
        </>}
      </ModalFooter>
    </Modal>
  );
};

export default SettingsModal;
