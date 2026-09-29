import { useTranslation } from 'react-i18next';
import {
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  ButtonVariant,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription
} from '@patternfly/react-core';
import type { Course, Session, TimeFormat } from '../types/Course';
import { formatTime } from '../utils/timeUtils';

interface SessionDetailDialogProps {
  course: Course;
  session: Session;
  timeFormat: TimeFormat;
  onClose: () => void;
  onEdit?: () => void;
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
    <Modal
      variant={ModalVariant.small}
      aria-labelledby="session-detail-title"
      isOpen={true}
      onClose={onClose}
    >
      <ModalHeader title={course.title} labelId="session-detail-title" />
      <ModalBody>
        <DescriptionList>
        <DescriptionListGroup>
          <DescriptionListTerm>{t('sessionDetail.day')}</DescriptionListTerm>
          <DescriptionListDescription>
            {t(`weekdays.${session.meetDay.toLowerCase()}`)}
          </DescriptionListDescription>
        </DescriptionListGroup>

        <DescriptionListGroup>
          <DescriptionListTerm>{t('sessionDetail.time')}</DescriptionListTerm>
          <DescriptionListDescription>
            {formatTime(session.startTime, timeFormat)} - {formatTime(session.endTime, timeFormat)}
          </DescriptionListDescription>
        </DescriptionListGroup>

        {session.sessionType && (
          <DescriptionListGroup>
            <DescriptionListTerm>{t('sessionDetail.sessionType')}</DescriptionListTerm>
            <DescriptionListDescription>{session.sessionType}</DescriptionListDescription>
          </DescriptionListGroup>
        )}

        {session.location && (
          <DescriptionListGroup>
            <DescriptionListTerm>{t('sessionDetail.location')}</DescriptionListTerm>
            <DescriptionListDescription>{session.location}</DescriptionListDescription>
          </DescriptionListGroup>
        )}

        {session.instructor && (
          <DescriptionListGroup>
            <DescriptionListTerm>{t('sessionDetail.instructor')}</DescriptionListTerm>
            <DescriptionListDescription>{session.instructor}</DescriptionListDescription>
          </DescriptionListGroup>
        )}

        <DescriptionListGroup>
          <DescriptionListTerm>{t('sessionDetail.color')}</DescriptionListTerm>
          <DescriptionListDescription>
            <div
              className="session-detail-color-swatch"
              style={{ backgroundColor: course.color }}
            />
          </DescriptionListDescription>
        </DescriptionListGroup>
      </DescriptionList>
      </ModalBody>
      <ModalFooter>
        {onEdit && <Button key="edit" variant={ButtonVariant.primary} onClick={onEdit}>
          {t('sessionDetail.editCourse')}
        </Button>}
        <Button key="close" variant={ButtonVariant.link} onClick={onClose}>
          {t('sessionDetail.close')}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default SessionDetailDialog;
