import logging
from minio        import Minio
from app.config   import get_settings

logger   = logging.getLogger(__name__)
settings = get_settings()


class StorageService:
    def __init__(self):
        self.client = Minio(
            f"{settings.MINIO_ENDPOINT}:{settings.MINIO_PORT}",
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_USE_SSL,
        )
        self.bucket = settings.MINIO_BUCKET

    def download(self, key: str) -> bytes:
        resp = self.client.get_object(self.bucket, key)
        data = resp.read()
        resp.close()
        resp.release_conn()
        return data
