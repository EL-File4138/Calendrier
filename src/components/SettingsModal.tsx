import { useState } from 'react';
import { useCalendar } from '../context/CalendarContext';
import type { TimeFormat, WeekStart } from '../types/Course';
import './SettingsModal.css';

interface SettingsModalProps {
  onClose: () => void;
}

const SettingsModal = ({ onClose }: SettingsModalProps) => {
  const { settings, updateSettings } = useCalendar();
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(settings.timeFormat);
  const [weekStart, setWeekStart] = useState<WeekStart>(settings.weekStart);

  const handleSave = () => {
    updateSettings({ timeFormat, weekStart });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="settings-body">
          <div className="setting-group">
            <label className="setting-label">Time Format</label>
            <div className="setting-options">
              <label className="radio-option">
                <input
                  type="radio"
                  name="timeFormat"
                  value="24h"
                  checked={timeFormat === '24h'}
                  onChange={(e) => setTimeFormat(e.target.value as TimeFormat)}
                />
                <span>24-hour (13:00)</span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="timeFormat"
                  value="12h"
                  checked={timeFormat === '12h'}
                  onChange={(e) => setTimeFormat(e.target.value as TimeFormat)}
                />
                <span>12-hour (1:00 PM)</span>
              </label>
            </div>
          </div>

          <div className="setting-group">
            <label className="setting-label">Week Starts On</label>
            <div className="setting-options">
              <label className="radio-option">
                <input
                  type="radio"
                  name="weekStart"
                  value="Monday"
                  checked={weekStart === 'Monday'}
                  onChange={(e) => setWeekStart(e.target.value as WeekStart)}
                />
                <span>Monday</span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="weekStart"
                  value="Sunday"
                  checked={weekStart === 'Sunday'}
                  onChange={(e) => setWeekStart(e.target.value as WeekStart)}
                />
                <span>Sunday</span>
              </label>
            </div>
          </div>
        </div>

        <div className="settings-footer">
          <button className="cancel-button" onClick={onClose}>
            Cancel
          </button>
          <button className="submit-button" onClick={handleSave}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
