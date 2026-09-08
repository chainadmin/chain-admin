---
name: Byte-exact GitHub connector pushes
description: Safely deliver an existing local commit when shell Git authentication fails but the GitHub connector works.
---

Treat shell Git authentication and the connected GitHub account as separate authentication paths. A rejected shell push does not establish that the connector needs reconnection.

**Why:** The shell credential rejected a push while the attached GitHub connection retained repository write access. The connector's Git Database API could deliver the already-validated local commit without exposing credentials.

**How to apply:** Verify the target repository and branch through the working connection. Preserve the current parent tree, compare the uploaded tree and commit hashes with the local objects, and update the branch with `force: false`. Refuse to proceed if the remote parent changed.

Use byte-preserving file transfer, not displayed shell output, for source or Git object transport.

**Why:** Shell output introduced CRLF changes and truncation despite the wrapper's requested output budget. Git commit messages also require their original trailing newline to reproduce the exact local hash.

**How to apply:** Read raw files directly; for large transfers, package committed content as compressed base64 and read that file. Preserve complete commit metadata and the raw message, including its final newline. Check byte lengths and Git hashes before updating any branch.