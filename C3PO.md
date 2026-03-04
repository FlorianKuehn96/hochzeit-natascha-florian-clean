
## System Heartbeat Monitoring
- Discovered that `openclaw system heartbeat` command does not support `--model` and `--max-tokens` parameters
- Command consistently fails with "error: unknown option '--model'" (exit code 1)
- The heartbeat monitoring functionality appears to be broken or requires different syntax
- HEARTBEAT.md protocol specifies using openrouter/google/gemini-2.5-flash-lite model but this parameter is not accepted

## Technical Findings
- `openclaw system heartbeat` command only accepts: disable, enable, help, last (based on --help output)
- --development-check flag also fails with same error
- The heartbeat command appears to have limited functionality compared to HEARTBEAT.md configuration

## Workaround
- System heartbeat monitoring is currently non-functional
- HEARTBEAT.md protocol cannot be followed as specified
- No HEARTBEAT_OK can be reported until command syntax is resolved