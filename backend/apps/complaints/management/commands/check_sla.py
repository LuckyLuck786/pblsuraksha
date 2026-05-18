"""
check_sla — Safe City Connect SLA Auto-Escalation Command

Usage:
    python manage.py check_sla
    python manage.py check_sla --dry-run    # preview without writing

Schedule with cron:
    0 * * * *  /path/to/.venv/bin/python /path/to/manage.py check_sla

SLA thresholds (hours from complaint creation):
    critical   → escalate after  4 h  (first escalation), then  8 h (second)
    high       → escalate after 12 h / 24 h
    medium     → escalate after 24 h / 48 h
    low        → escalate after 72 h / 120 h
"""

import logging
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from datetime import timedelta

logger = logging.getLogger('apps.complaints')


# SLA thresholds: (first_escalation_hours, second_escalation_hours)
SLA = {
    'critical': (4,   8),
    'high'    : (12,  24),
    'medium'  : (24,  48),
    'low'     : (72, 120),
}

ESCALATION_NOTE = (
    'This complaint has breached its SLA threshold and has been auto-escalated. '
    'Immediate attention is required.'
)


class Command(BaseCommand):
    help = 'Check all open complaints for SLA breaches and escalate as needed.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            default=False,
            help='Show what would be escalated without making any changes.',
        )

    def handle(self, *args, **options):
        from apps.complaints.models import Complaint, ComplaintUpdate

        dry_run = options['dry_run']
        now     = timezone.now()

        # Only open / in-progress complaints
        open_qs = Complaint.objects.filter(
            status__in=['pending', 'open', 'in_progress']
        ).select_related('assigned_to')

        escalated_first  = 0
        escalated_second = 0
        already_max      = 0

        for complaint in open_qs:
            priority = (complaint.priority or 'medium').lower()
            first_h, second_h = SLA.get(priority, SLA['medium'])
            age = now - complaint.created_at

            first_threshold  = timedelta(hours=first_h)
            second_threshold = timedelta(hours=second_h)

            # Already at second escalation level — nothing more to do
            if age >= second_threshold and complaint.priority == 'critical':
                already_max += 1
                continue

            # Second escalation: age ≥ second threshold AND not yet marked urgent
            if age >= second_threshold:
                msg = (
                    f'[SLA BREACH — LEVEL 2] Complaint {complaint.complaint_id} '
                    f'({priority.upper()}) is {age.seconds // 3600}h+ old. '
                    f'Escalated to critical priority.'
                )
                if not dry_run:
                    if complaint.priority != 'critical':
                        complaint.priority = 'critical'
                        complaint.save(update_fields=['priority', 'updated_at'])
                    ComplaintUpdate.objects.create(
                        complaint=complaint,
                        new_status=complaint.status,
                        updated_by=None,
                        notes=f'[AUTO-ESCALATION LEVEL 2] {ESCALATION_NOTE}',
                    )
                self.stdout.write(self.style.ERROR(f'  ESCALATED (L2): {msg}'))
                logger.warning(msg)
                escalated_second += 1

            # First escalation: age ≥ first threshold but not yet second
            elif age >= first_threshold:
                msg = (
                    f'[SLA BREACH — LEVEL 1] Complaint {complaint.complaint_id} '
                    f'({priority.upper()}) is {age.seconds // 3600}h+ old.'
                )
                if not dry_run:
                    ComplaintUpdate.objects.create(
                        complaint=complaint,
                        new_status=complaint.status,
                        updated_by=None,
                        notes=f'[AUTO-ESCALATION LEVEL 1] {ESCALATION_NOTE}',
                    )
                self.stdout.write(self.style.WARNING(f'  ESCALATED (L1): {msg}'))
                logger.warning(msg)
                escalated_first += 1

        prefix = '[DRY RUN] ' if dry_run else ''
        summary = (
            f'{prefix}SLA check complete — '
            f'{escalated_first} first-level escalations, '
            f'{escalated_second} second-level escalations, '
            f'{already_max} already at maximum priority.'
        )
        self.stdout.write(self.style.SUCCESS(summary))
        logger.info(summary)
