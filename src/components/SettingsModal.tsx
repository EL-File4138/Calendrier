import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendar } from '../context/CalendarContext';
import type { TimeFormat, WeekStart } from '../types/Course';
import { AVAILABLE_LANGUAGES } from '../i18n/config';
import './SettingsModal.css';

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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('settings.title')}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="settings-body">
          <div className="setting-group">
            <label className="setting-label">{t('settings.timeFormat')}</label>
            <div className="setting-options">
              <label className="radio-option">
                <input
                  type="radio"
                  name="timeFormat"
                  value="24h"
                  checked={timeFormat === '24h'}
                  onChange={(e) => setTimeFormat(e.target.value as TimeFormat)}
                />
                <span>{t('settings.timeFormat24h')}</span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="timeFormat"
                  value="12h"
                  checked={timeFormat === '12h'}
                  onChange={(e) => setTimeFormat(e.target.value as TimeFormat)}
                />
                <span>{t('settings.timeFormat12h')}</span>
              </label>
            </div>
          </div>

          <div className="setting-group">
            <label className="setting-label">{t('settings.weekStartsOn')}</label>
            <div className="setting-options">
              <label className="radio-option">
                <input
                  type="radio"
                  name="weekStart"
                  value="Monday"
                  checked={weekStart === 'Monday'}
                  onChange={(e) => setWeekStart(e.target.value as WeekStart)}
                />
                <span>{t('settings.monday')}</span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="weekStart"
                  value="Sunday"
                  checked={weekStart === 'Sunday'}
                  onChange={(e) => setWeekStart(e.target.value as WeekStart)}
                />
                <span>{t('settings.sunday')}</span>
              </label>
            </div>
          </div>

          <div className="setting-group">
            <label className="setting-label">{t('settings.language')}</label>
            <div className="setting-options">
              {AVAILABLE_LANGUAGES.map((lang) => (
                <label key={lang.code} className="radio-option">
                  <input
                    type="radio"
                    name="language"
                    value={lang.code}
                    checked={language === lang.code}
                    onChange={(e) => setLanguage(e.target.value)}
                  />
                  <span>{lang.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="settings-footer">
          <button className="cancel-button" onClick={onClose}>
            {t('settings.cancel')}
          </button>
          <button className="submit-button" onClick={handleSave}>
            {t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
