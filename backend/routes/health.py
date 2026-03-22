from fastapi import APIRouter


def build_router(*, youtube_url: str, embed_url: str) -> APIRouter:
    router = APIRouter()

    @router.get("/health", tags=["Health"], summary="API health check")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @router.get("/app/content/video", tags=["Health"], summary="Get app help video URL")
    def get_app_help_video() -> dict[str, str]:
        return {
            "status": "ok",
            "youtube_url": youtube_url,
            "embed_url": embed_url,
        }

    return router
