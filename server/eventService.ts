import EventEmitter from 'events';
import { storage } from './storage';

export type SystemEvent = 
  | 'account_created'
  | 'payment_received'
  | 'payment_overdue'
  | 'payment_failed'
  | 'one_time_payment'
  | 'manual';

export interface EventPayload {
  tenantId: string;
  consumerId: string;
  accountId?: string;
  metadata?: Record<string, any>;
}

class EventService extends EventEmitter {
  constructor() {
    super();
    this.setupEventListeners();
  }

  /**
   * Emit a system event that may trigger sequence enrollments
   */
  async emitSystemEvent(event: SystemEvent, payload: EventPayload) {
    console.log(`🔔 System event emitted: ${event}`, {
      tenantId: payload.tenantId,
      consumerId: payload.consumerId,
      accountId: payload.accountId,
    });

    this.emit(event, payload);
  }

  /**
   * Set up listeners for sequence enrollment
   */
  private setupEventListeners() {
    // Listen for each event type and check for matching sequences
    const eventTypes: SystemEvent[] = [
      'account_created',
      'payment_received',
      'payment_overdue',
      'payment_failed',
      'one_time_payment',
      'manual',
    ];

    eventTypes.forEach((eventType) => {
      this.on(eventType, async (payload: EventPayload) => {
        try {
          await this.processEventForSequences(eventType, payload);
        } catch (error) {
          console.error(`Error processing event ${eventType}:`, error);
        }
      });
    });
  }

  /**
   * Find and enroll consumers in sequences triggered by this event
   */
  private async processEventForSequences(event: SystemEvent, payload: EventPayload) {
    try {
      // Get all active sequences for this tenant that are triggered by this event
      const sequences = await storage.getCommunicationSequencesByTenant(payload.tenantId);
      
      const matchingSequences = sequences.filter(
        (seq) => 
          seq.isActive && 
          seq.triggerType === 'event' && 
          seq.triggerEvent === event
      );

      if (matchingSequences.length === 0) {
        console.log(`No active sequences found for event: ${event}`);
        return;
      }

      console.log(`Found ${matchingSequences.length} sequence(s) to enroll consumer in`);

      // Enroll the consumer in each matching sequence
      for (const sequence of matchingSequences) {
        try {
          // Check target audience filtering
          if (sequence.targetType === 'folder' && sequence.targetFolderIds && sequence.targetFolderIds.length > 0) {
            // Check if consumer has accounts in the target folders
            const consumerAccounts = await storage.getAccountsByConsumer(payload.consumerId);
            const hasAccountInTargetFolder = consumerAccounts.some(account => 
              sequence.targetFolderIds.includes(account.folderId)
            );

            if (!hasAccountInTargetFolder) {
              console.log(`Consumer ${payload.consumerId} not in target folders for sequence ${sequence.id}, skipping enrollment`);
              continue;
            }
          } else if (sequence.targetType === 'custom') {
            // Custom targeting is manual only, skip event-based enrollment
            console.log(`Sequence ${sequence.id} has custom targeting, skipping event-based enrollment`);
            continue;
          }
          // targetType 'all' proceeds to enrollment

          // Check if consumer is already enrolled in this sequence
          const existingEnrollments = await storage.getSequenceEnrollments(sequence.id);
          const alreadyEnrolled = existingEnrollments.some(
            (enrollment) => 
              enrollment.consumerId === payload.consumerId && 
              enrollment.status === 'active'
          );

          if (alreadyEnrolled) {
            console.log(`Consumer ${payload.consumerId} already enrolled in sequence ${sequence.id}`);
            continue;
          }

          // Get the first step of the sequence to schedule
          const steps = await storage.getSequenceSteps(sequence.id);
          if (steps.length === 0) {
            console.log(`Sequence ${sequence.id} has no steps, skipping enrollment`);
            continue;
          }

          const firstStep = steps[0];
          
          // Calculate when to send the first message based on triggerDelay + step delays
          const triggerDelayDays = Number(sequence.triggerDelay) || 0;
          const stepDelayDays = Number(firstStep.delayDays) || 0;
          const stepDelayHours = Number(firstStep.delayHours) || 0;
          
          const nextMessageAt = new Date();
          // Add sequence-level trigger delay
          nextMessageAt.setDate(nextMessageAt.getDate() + triggerDelayDays);
          // Add step-level delay
          nextMessageAt.setDate(nextMessageAt.getDate() + stepDelayDays);
          nextMessageAt.setHours(nextMessageAt.getHours() + stepDelayHours);
          // Reset minutes and seconds for cleaner scheduling
          nextMessageAt.setMinutes(0, 0, 0);

          // Enroll the consumer
          const enrollment = await storage.enrollConsumerInSequence({
            sequenceId: sequence.id,
            consumerId: payload.consumerId,
            status: 'active',
            currentStepId: firstStep.id,
            currentStepOrder: 1,
            nextMessageAt,
            enrolledAt: new Date(),
          });

          console.log(`✅ Consumer enrolled in sequence:`, {
            enrollmentId: enrollment.id,
            sequenceId: sequence.id,
            sequenceName: sequence.name,
            consumerId: payload.consumerId,
            event,
            nextMessageAt: nextMessageAt.toISOString(),
          });
        } catch (error) {
          console.error(`Error enrolling consumer in sequence ${sequence.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing event for sequences:', error);
    }
  }
}

// Export singleton instance
export const eventService = new EventService();
