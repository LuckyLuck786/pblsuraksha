"""
SURAKSHA - Seed demo data command
Run: python manage.py seed_data
"""

import random
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Seeds the database with demo data for SURAKSHA'

    def handle(self, *args, **options):
        from apps.accounts.models import User
        from apps.complaints.models import Complaint, ComplaintUpdate, Notification

        self.stdout.write('🌱 Seeding SURAKSHA demo data...')

        # ── Create Users ──────────────────────────────────────────────────
        admin_user, _ = User.objects.get_or_create(
            username='admin',
            defaults={
                'email': 'admin@suraksha.gov.in',
                'first_name': 'System', 'last_name': 'Admin',
                'role': 'admin', 'city': 'Bengaluru', 'is_staff': True,
                'is_superuser': True, 'is_verified': True,
            }
        )
        admin_user.set_password('admin123')
        admin_user.save()

        authority, _ = User.objects.get_or_create(
            username='officer_ravi',
            defaults={
                'email': 'ravi.kumar@ksp.gov.in',
                'first_name': 'Ravi', 'last_name': 'Kumar',
                'role': 'authority', 'city': 'Bengaluru',
                'badge_number': 'KSP-4521',
                'station_name': 'Koramangala Police Station',
                'is_verified': True,
            }
        )
        authority.set_password('officer123')
        authority.save()

        citizen1, _ = User.objects.get_or_create(
            username='priya_sharma',
            defaults={
                'email': 'priya@gmail.com',
                'first_name': 'Priya', 'last_name': 'Sharma',
                'role': 'citizen', 'city': 'Bengaluru',
                'phone': '9876543210', 'is_verified': True,
            }
        )
        citizen1.set_password('citizen123')
        citizen1.save()

        self.stdout.write('  ✅ Users created')

        # ── Sample Complaints ─────────────────────────────────────────────
        complaints_data = [
            {
                'title': 'Mobile phone stolen at Koramangala bus stop',
                'description': 'My mobile phone was stolen by a chain snatcher near the 6th block bus stop in Koramangala at around 7:30 PM. The perpetrator was on a blue scooter and sped away. I have partial number plate details.',
                'category': 'theft', 'status': 'in_progress', 'priority': 'high',
                'incident_location': 'Koramangala 6th Block, Bengaluru',
                'latitude': 12.9352, 'longitude': 77.6245,
                'severity_score': 7.2, 'ai_category': 'theft', 'ai_priority': 'high',
            },
            {
                'title': 'Online fraud via UPI payment',
                'description': 'I received a call from someone posing as my bank manager asking me to share OTP for KYC verification. I lost Rs 45,000 from my account immediately after sharing the OTP. This is clear cybercrime and financial fraud.',
                'category': 'fraud', 'status': 'acknowledged', 'priority': 'high',
                'incident_location': 'Indiranagar, Bengaluru',
                'latitude': 12.9784, 'longitude': 77.6408,
                'severity_score': 6.8, 'ai_category': 'cybercrime', 'ai_priority': 'high',
            },
            {
                'title': 'Rash driving causing accident near MG Road',
                'description': 'A speeding car ran a red light at MG Road junction and hit a two-wheeler causing the rider to fall and sustain injuries. The car sped away without stopping. The injured person has been taken to a hospital.',
                'category': 'traffic', 'status': 'pending', 'priority': 'critical',
                'incident_location': 'MG Road Junction, Bengaluru',
                'latitude': 12.9754, 'longitude': 77.6074,
                'severity_score': 8.5, 'ai_category': 'traffic', 'ai_priority': 'critical',
            },
            {
                'title': 'Harassment in apartment complex',
                'description': 'My neighbor has been repeatedly harassing and verbally abusing my family for the past 3 weeks. He bangs on our door late at night and uses abusive language. We have video evidence on CCTV.',
                'category': 'harassment', 'status': 'resolved', 'priority': 'medium',
                'incident_location': 'HSR Layout, Bengaluru',
                'latitude': 12.9116, 'longitude': 77.6474,
                'severity_score': 5.5, 'ai_category': 'harassment', 'ai_priority': 'medium',
                'resolution_details': 'Mediation conducted. Warning issued to the neighbor.',
            },
            {
                'title': 'Suspicious drug activity near school',
                'description': 'I have noticed a group of individuals gathering near the entrance of Government High School in the evenings exchanging small packets. This appears to be drug dealing activity and poses a risk to students.',
                'category': 'drug_activity', 'status': 'in_progress', 'priority': 'critical',
                'incident_location': 'Jayanagar, Bengaluru',
                'latitude': 12.9250, 'longitude': 77.5938,
                'severity_score': 9.0, 'ai_category': 'drug_activity', 'ai_priority': 'critical',
            },
        ]

        created_complaints = []
        for cd in complaints_data:
            c, created = Complaint.objects.get_or_create(
                title=cd['title'],
                defaults={**cd, 'reporter': citizen1}
            )
            created_complaints.append(c)

            if created:
                ComplaintUpdate.objects.create(
                    complaint=c,
                    updated_by=citizen1,
                    new_status='pending',
                    message='Complaint submitted by citizen.',
                    is_public=True
                )
                if c.status != 'pending':
                    ComplaintUpdate.objects.create(
                        complaint=c,
                        updated_by=authority,
                        old_status='pending',
                        new_status=c.status,
                        message='Complaint reviewed and assigned to investigating officer.',
                        is_public=True
                    )

        self.stdout.write('  ✅ Sample complaints created')
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('🎉 SURAKSHA demo data seeded successfully!'))
        self.stdout.write('')
        self.stdout.write('📋 Login credentials:')
        self.stdout.write('  Admin:    admin / admin123')
        self.stdout.write('  Officer:  officer_ravi / officer123')
        self.stdout.write('  Citizen:  priya_sharma / citizen123')