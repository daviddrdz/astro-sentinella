from flask import jsonify


def error_response(status: int, code: str, message: str):
    return jsonify(error={"code": code, "message": message}), status
