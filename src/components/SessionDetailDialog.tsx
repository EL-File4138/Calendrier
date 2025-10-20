import { useTranslation } from 'react-i18next';
import type { Course, Session, TimeFormat } from '../types/Course';
import { formatTime } from '../utils/timeUtils';
import './SessionDetailDialog.css';

interface SessionDetailDialogProps {
  course: Course;
  session: Session;
  timeFormat: TimeFormat;
  onClose: () => void;
  onEdit: () => void;
}

const SessionDetailDialog = ({
  course,
  session,
  timeFormat,
  onClose,
  onEdit,
}: SessionDetailDialogProps) => {
  const { t } = useTranslation();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content session-detail-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{course.title}</h2>
          <button className="close-button" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="session-detail-body">
          <div className="detail-row">
            <div className="detail-label">{t('sessionDetail.day')}</div>
            <div className="detail-value">{t(`weekdays.${session.meetDay.toLowerCase()}`)}</div>
          </div>

          <div className="detail-row">
            <div className="detail-label">{t('sessionDetail.time')}</div>
            <div className="detail-value">
              {formatTime(session.startTime, timeFormat)} - {formatTime(session.endTime, timeFormat)}
            </div>
          </div>

          {session.sessionType && (
            <div className="detail-row">
              <div className="detail-label">{t('sessionDetail.sessionType')}</div>
              <div className="detail-value">{session.sessionType}</div>
            </div>
          )}

          {session.location && (
            <div className="detail-row">
              <div className="detail-label">{t('sessionDetail.location')}</div>
              <div className="detail-value">{session.location}</div>
            </div>
          )}

          {session.instructor && (
            <div className="detail-row">
              <div className="detail-label">{t('sessionDetail.instructor')}</div>
              <div className="detail-value">{session.instructor}</div>
            </div>
          )}

          <div className="detail-row">
            <div className="detail-label">{t('sessionDetail.color')}</div>
            <div className="detail-value">
              <div
                className="color-preview"
                style={{ backgroundColor: course.color }}
              ></div>
            </div>
          </div>
        </div>

        <div className="session-detail-footer">
          <button className="cancel-button" onClick={onClose}>
            {t('sessionDetail.close')}
          </button>
          <button className="submit-button" onClick={onEdit}>
            {t('sessionDetail.editCourse')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionDetailDialog;
