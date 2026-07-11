from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from botocore.exceptions import ClientError

from app.storage.s3 import get_storage

router = APIRouter(tags=["media"])


@router.get("/exercise-media/{path:path}", include_in_schema=False)
async def serve_media(path: str):
    storage = get_storage()
    try:
        obj = storage.open(path)
        return StreamingResponse(
            obj["Body"],
            media_type=obj.get("ContentType", "application/octet-stream"),
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        if error_code in ("NoSuchKey", "404"):
            raise HTTPException(status_code=404, detail="Media not found")
        raise HTTPException(status_code=502, detail="Storage unavailable")
