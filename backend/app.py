import os

from flask import Flask, current_app
from flask_limiter import Limiter, RateLimitExceeded
from flask_limiter.util import get_remote_address

from routes.errors import error_response
from routes.frames import frames_bp
from routes.metadata import metadata_bp

app = Flask(__name__)
app.config.from_mapping(
    # Use a shared store (e.g. redis://) when running multiple workers or instances.
    RATELIMIT_STORAGE_URI=os.environ.get("RATELIMIT_STORAGE_URI", "memory://"),
    RATELIMIT_HEADERS_ENABLED=True,
    METADATA_RATE_LIMIT=os.environ.get("METADATA_RATE_LIMIT", "30 per minute"),
    FRAME_IMAGE_RATE_LIMIT=os.environ.get("FRAME_IMAGE_RATE_LIMIT", "10 per minute"),
)

# Keyed on the socket address; forwarded headers are only trustworthy behind a known proxy.
limiter = Limiter(get_remote_address, app=app)
limiter.limit(lambda: current_app.config["METADATA_RATE_LIMIT"])(metadata_bp)
limiter.limit(lambda: current_app.config["FRAME_IMAGE_RATE_LIMIT"])(frames_bp)

app.register_blueprint(frames_bp)
app.register_blueprint(metadata_bp)


@app.errorhandler(RateLimitExceeded)
def rate_limited(_exc):
    return error_response(429, "rate_limited", "Too many requests. Try again later.")


if __name__ == "__main__":
    app.run(debug=True)