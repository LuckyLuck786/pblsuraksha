from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['username', 'email', 'full_name', 'role', 'city', 'is_verified', 'date_joined']
    list_filter = ['role', 'is_verified', 'state']
    search_fields = ['username', 'email', 'first_name', 'last_name', 'phone']
    fieldsets = BaseUserAdmin.fieldsets + (
        ('SURAKSHA Profile', {
            'fields': ('role', 'phone', 'address', 'city', 'state', 'pincode',
                       'avatar', 'is_verified', 'latitude', 'longitude',
                       'badge_number', 'station_name')
        }),
    )