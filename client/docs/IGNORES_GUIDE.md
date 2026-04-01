# Ignore Patterns Cheat Sheet

This document describes how `ignores.push` patterns are interpreted when creating archives from directories.

## Overview

The client uses one shared config for all platforms:

```json
{
  "ignores": {
    "push": [
      "node_modules",
      ".git",
      ".env",
      ".env*",
      "dist",
      "build",
      "coverage",
      "*.log",
      "*.tmp",
      ".DS_Store",
      "Thumbs.db"
    ],
    "pull": []
  }
}
```

On Windows, archive creation uses PowerShell.
On Unix-like systems, archive creation uses `tar`.

The same ignore list is used on both platforms.

## Recommended Pattern Types

### Ignore directories everywhere

Use plain directory names:

```json
"node_modules"
".git"
"dist"
"build"
"coverage"
```

These patterns match directory names at any nesting level.

Examples:

- `node_modules`
- `.git`
- `dist`
- `storage_test`

### Ignore file families by mask

Use wildcard masks:

```json
"*.log"
"*.tmp"
"*.bak"
"*.map"
```

Examples:

- `*.log` matches `app.log`
- `*.tmp` matches `cache.tmp`
- `*.map` matches `bundle.js.map`

### Ignore exact file names or file prefixes

Use literal names or wildcard prefixes:

```json
".env"
".env*"
"Thumbs.db"
".DS_Store"
```

Examples:

- `.env` matches only `.env`
- `.env*` matches `.env.local`, `.env.production`, `.env.test`

## Cross-Platform Rules

### Works well on both Windows and Unix

- `node_modules`
- `.git`
- `dist`
- `*.log`
- `*.tmp`
- `.env`
- `.env*`

### Avoid path-specific patterns

Do not rely on platform-specific separators or absolute paths.

Avoid:

- `C:\\temp\\foo`
- `/var/tmp/foo`
- `src\\dist`
- `src/dist`
- `./node_modules`
- `**/node_modules`

These may behave differently across PowerShell and `tar`.

## Normalization Rules

The client normalizes some patterns before using them:

- trailing `/` is removed
- trailing `\` is removed

So these are treated the same:

```json
"dist"
"dist/"
"dist\\"
```

## Best Practices

Use this style for portable configs:

```json
{
  "ignores": {
    "push": [
      "node_modules",
      ".git",
      ".env",
      ".env*",
      "dist",
      "build",
      "coverage",
      "*.log",
      "*.tmp"
    ],
    "pull": []
  }
}
```

## Quick Reference

| Goal | Pattern |
|---|---|
| Ignore all `node_modules` directories | `node_modules` |
| Ignore all Git metadata | `.git` |
| Ignore build output | `dist` |
| Ignore temp files | `*.tmp` |
| Ignore log files | `*.log` |
| Ignore only `.env` | `.env` |
| Ignore all env variants | `.env*` |
| Ignore macOS metadata | `.DS_Store` |
| Ignore Windows metadata | `Thumbs.db` |

## Notes

- Patterns without `*` or `?` are best used for directory names or exact file names.
- Patterns with `*` or `?` are treated as file masks.
- If you need full glob semantics like `packages/*/dist` or `**/*.map`, the current implementation should be extended explicitly for glob-based matching.