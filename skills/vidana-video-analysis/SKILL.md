---
name: vidana-video-analysis
description: Use when a user wants to review, diagnose, improve, or prepare a local video for a specific audience, ad platform, social channel, creative brief, or editing workflow using Vidana.
---

# Vidana Video Analysis

Use Vidana CLI as the source of truth for video analysis. The CLI calls the hosted Vidana service and returns a Markdown report.

## Requirements

- `vidana` CLI is installed.
- `VIDANA_API_KEY` is set in the environment.
- The user provides a local video path, target audience, and platform.

## Workflow

1. Check CLI availability:

```bash
vidana --help
```

2. Check API key:

```bash
test -n "$VIDANA_API_KEY"
```

If missing, tell the user to create an API key in Vidana Web and set:

```bash
export VIDANA_API_KEY="vdn_your_key_here"
```

3. Run analysis:

```bash
vidana analyze "<video-path>" \
  --audience "<target audience>" \
  --platform "<platform>" \
  --context "<optional background>"
```

4. Treat the Markdown report as source material. Do not invent analysis if Vidana fails.

## Output Guidance

After Vidana returns a report, help the user transform it into the requested artifact:

- editing checklist
- reshoot plan
- ad optimization notes
- platform-specific revision brief
- script rewrite direction

Always preserve concrete timestamps, evidence, scores, and modification actions from the Vidana report.
