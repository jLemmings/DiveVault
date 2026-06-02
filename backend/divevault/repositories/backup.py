from __future__ import annotations

from divevault.postgres_store import (
    get_user_profile,
    get_user_profile_license_pdf,
    insert_dive_record,
    list_all_dives,
    list_device_states,
    list_user_equipment,
    save_device_state,
    save_user_equipment,
    save_user_profile,
    save_user_profile_license_pdf,
)


class BackupRepository:
    get_user_profile = staticmethod(get_user_profile)
    get_user_profile_license_pdf = staticmethod(get_user_profile_license_pdf)
    insert_dive_record = staticmethod(insert_dive_record)
    list_all_dives = staticmethod(list_all_dives)
    list_device_states = staticmethod(list_device_states)
    list_user_equipment = staticmethod(list_user_equipment)
    save_device_state = staticmethod(save_device_state)
    save_user_equipment = staticmethod(save_user_equipment)
    save_user_profile = staticmethod(save_user_profile)
    save_user_profile_license_pdf = staticmethod(save_user_profile_license_pdf)


DEFAULT_BACKUP_REPOSITORY = BackupRepository()

