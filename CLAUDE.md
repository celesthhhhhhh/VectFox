# Shell Access
Bash is available via the Bash tool. Always use `bash` (not PowerShell) for file editing and JSON operations in this project — PowerShell 5.1 corrupts UTF-8 multibyte characters (Chinese text) when reading files.

# Tools usage
You should use whatever tools on bash shell instead of using PowerShell because it's just works better.  You can install whatever tools you need.

To install new packages on this machine, use `winget`:
```
winget install <package-id> --source winget
```
Example: `winget install jqlang.jq --source winget`

# Fallback or migration

ALWAYS ask user when you try to do fallback or migration logic, because these logic will become very difficult to troubleshoot in the future.  Always ask user before proceed.