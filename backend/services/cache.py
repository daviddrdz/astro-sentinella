import threading
import time
from collections import OrderedDict


class TTLCache:
    def __init__(self, ttl_s: float, max_items: int):
        self._ttl = ttl_s
        self._max = max_items
        self._data: OrderedDict = OrderedDict()
        self._locks: dict = {}
        self._guard = threading.Lock()

    def clear(self):
        with self._guard:
            self._data.clear()
            self._locks.clear()

    def _fresh(self, key):
        hit = self._data.get(key)
        if hit and hit[0] > time.monotonic():
            self._data.move_to_end(key)
            return hit
        return None

    def get_or_compute(self, key, compute):
        with self._guard:
            hit = self._fresh(key)
            if hit:
                return hit[1]
            lock = self._locks.setdefault(key, threading.Lock())
        with lock:  # solo un hilo calcula; los demás reutilizan el resultado
            with self._guard:
                hit = self._fresh(key)
                if hit:
                    return hit[1]
            value = compute()  # si lanza excepción, no se cachea
            with self._guard:
                self._data[key] = (time.monotonic() + self._ttl, value)
                while len(self._data) > self._max:
                    self._data.popitem(last=False)
                self._locks.pop(key, None)
            return value
