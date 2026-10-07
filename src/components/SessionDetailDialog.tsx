import { useTranslation } from 'react-i18next';
import { useState } from 'react';
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
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription
} from '@patternfly/react-core';
import type { Course, Session, TimeFormat } from '../types/Course';
import { formatTime } from '../utils/timeUtils';
import TextInput from './ValidatedTextInput';
import InlineAlert from './InlineAlert';

interface SessionDetailDialogProps {
  course: Course;
  session: Session;
  timeFormat: TimeFormat;
  onClose: () => void;
  onEdit?: () => void;
  occurrenceDate?: string;
  onDeleteOccurrence?: () => void;
  onMoveOccurrence?: (date: string, startTime: string) => Promise<void>;
}

const SessionDetailDialog = ({
  course,
  session,
  timeFormat,
  onClose,
  onEdit,
  occurrenceDate,
  onDeleteOccurrence,
  onMoveOccurrence,
}: SessionDetailDialogProps) => {
  const { t } = useTranslation();
  const [moving, setMoving] = useState(false);
  const [date, setDate] = useState(occurrenceDate ?? '');
  const [startTime, setStartTime] = useState(session.startTime);
  const [moveError, setMoveError] = useState<string | null>(null);

  return (
    <Modal
      variant={ModalVariant.small}
      aria-labelledby="session-detail-title"
      isOpen={true}
      onClose={onClose}
    >
      <ModalHeader title={course.title} labelId="session-detail-title" />
      <ModalBody>
        {occurrenceDate && <p>{occurrenceDate}</p>}
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
        {moving && <Form id="move-occurrence" onSubmit={(event) => {
          event.preventDefault();
          void onMoveOccurrence?.(date, startTime).catch((error: unknown) => setMoveError(t(`calendar.${error instanceof Error && error.message === 'moveConflict' ? 'moveConflict' : 'invalidMove'}`)));
        }}>
          {moveError && <div id="occurrence-move-error" role="alert"><InlineAlert variant="danger" title={moveError} onClose={() => setMoveError(null)} /></div>}
          <FormGroup fieldId="occurrence-date" label={t('calendar.moveDate')} isRequired>
            <TextInput id="occurrence-date" type="date" isRequired aria-invalid={Boolean(moveError)} aria-describedby={moveError ? 'occurrence-move-error' : undefined} value={date} onChange={(_event, value) => { setDate(value); setMoveError(null); }} />
          </FormGroup>
          <FormGroup fieldId="occurrence-start" label={t('calendar.moveTime')} isRequired>
            <TextInput id="occurrence-start" type="time" isRequired aria-invalid={Boolean(moveError)} aria-describedby={moveError ? 'occurrence-move-error' : undefined} value={startTime} onChange={(_event, value) => { setStartTime(value); setMoveError(null); }} />
          </FormGroup>
          <Button variant="primary" type="submit">{t('calendar.saveMove')}</Button>
        </Form>}
      </ModalBody>
      <ModalFooter>
        {onEdit && <Button key="edit" variant={ButtonVariant.primary} onClick={onEdit}>
          {t('sessionDetail.editCourse')}
        </Button>}
        {(onMoveOccurrence || onDeleteOccurrence) && <div className="session-occurrence-actions">
          {onMoveOccurrence && <Button variant="secondary" onClick={() => setMoving(value => !value)}>{t('calendar.moveOccurrence')}</Button>}
          {onDeleteOccurrence && <Button variant="danger" onClick={onDeleteOccurrence}>{t('calendar.deleteOccurrence')}</Button>}
        </div>}
      </ModalFooter>
    </Modal>
  );
};

export default SessionDetailDialog;
