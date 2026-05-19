Runtime resources copied into packaged apps.

To ship a no-Python-required installer, place a Python 3.11+ runtime here:

- python/darwin-arm64/bin/python3
- python/darwin-x64/bin/python3
- python/win-x64/python.exe
- python/linux-x64/bin/python3

The runtime must support `venv`, `ensurepip`, and `pip`.
