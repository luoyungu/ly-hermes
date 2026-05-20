Optional runtime resources.

Hermes Desktop does not package Python by default. The installer checks for
system Python 3.11+ and shows setup guidance when it is missing.

If a future release needs a no-Python-required installer, restore the
`build/runtime` extraResources entry in `electron-builder.yml` and place a
Python 3.11+ runtime here:

- python/darwin-arm64/bin/python3
- python/darwin-x64/bin/python3
- python/win-x64/python.exe
- python/linux-x64/bin/python3

The runtime must support `venv`, `ensurepip`, and `pip`.
