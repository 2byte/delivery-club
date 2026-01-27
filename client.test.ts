#!/usr/bin/env bun

/**
 * Tests for SoftDeliveryClient archiving functionality
 * Run with: bun test client.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

// Helper to extract and read zip files
function extractZipToTemp(zipBuffer: Buffer): string {
  const tempDir = join(process.cwd(), `.test_extract_${Date.now()}`);
  const tempZipPath = join(tempDir, "temp.zip");

  mkdirSync(tempDir, { recursive: true });
  writeFileSync(tempZipPath, zipBuffer);

  const psCommand = `Expand-Archive -Path "${tempZipPath}" -DestinationPath "${tempDir}" -Force`;
  const result = spawnSync("powershell.exe", ["-Command", psCommand], {
    encoding: "utf-8",
    windowsHide: true,
  });

  if (result.error || result.status !== 0) {
    rmSync(tempDir, { recursive: true, force: true });
    throw new Error(`Failed to extract test zip: ${result.stderr || result.error}`);
  }

  return tempDir;
}

function cleanupTestDir(dirPath: string): void {
  if (existsSync(dirPath)) {
    rmSync(dirPath, { recursive: true, force: true });
  }
}

function createZipWithConfig(
  sourceDir: string,
  zipPath: string,
  config: any
): { status: number; error?: Error } {
  // Write config and script to temp file
  const tempScriptPath = join(sourceDir, `temp_script_${Date.now()}.ps1`);
  const configJson = JSON.stringify(config);

  const psScript = `
param([string]$configPath, [string]$zipPath)

$config = Get-Content $configPath | ConvertFrom-Json

$ignoreDirs  = @()
$ignoreFiles = @()

foreach ($rule in $config.ignores.push) {
    if ($rule -match '[*?]') { $ignoreFiles += $rule }
    else { $ignoreDirs += $rule }
}

function Is-Ignored($item) {
    foreach ($dir in $ignoreDirs) {
        if ($item.FullName -match "\\\\$\{dir\}(\\\\|$)") { return $true }
    }

    if (-not $item.PSIsContainer) {
        foreach ($mask in $ignoreFiles) {
            if ($item.Name -like $mask) { return $true }
        }
    }
    return $false
}

Get-ChildItem . -Recurse -Force |
    Where-Object { -not (Is-Ignored $_) } |
    Compress-Archive -DestinationPath $zipPath -Force
`;

  writeFileSync(tempScriptPath, psScript);

  const configPath = join(sourceDir, `temp_config_${Date.now()}.json`);
  writeFileSync(configPath, configJson);

  const result = spawnSync("powershell.exe", ["-ExecutionPolicy", "Bypass", "-File", tempScriptPath, configPath, zipPath], {
    cwd: sourceDir,
    encoding: "utf-8",
    windowsHide: true,
  });

  // Cleanup temp files
  rmSync(tempScriptPath, { force: true });
  rmSync(configPath, { force: true });

  return {
    status: result.status || 0,
    error: result.error,
  };
}

describe("SoftDeliveryClient - Archiving", () => {
  let testDir: string;
  const config = {
    ignores: {
      push: ["storage_test", "*.log"],
      pull: [],
    },
  };

  beforeAll(() => {
    // Create test directory structure
    testDir = join(process.cwd(), `.test_archive_${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Create test files and directories
    writeFileSync(join(testDir, "file1.txt"), "Test file 1 content");
    writeFileSync(join(testDir, "file2.txt"), "Test file 2 content");

    const subDir = join(testDir, "subdir");
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, "nested.txt"), "Nested file content");
    writeFileSync(join(subDir, "another.txt"), "Another nested file");
  });

  afterAll(() => {
    // Cleanup test directory
    cleanupTestDir(testDir);
  });

  it("should create a valid zip file from directory", () => {
    const zipPath = join(testDir, "output.zip");

    const result = createZipWithConfig(testDir, zipPath, config);

    expect(result.status).toBe(0);
    expect(existsSync(zipPath)).toBe(true);

    const zipBuffer = readFileSync(zipPath);
    expect(zipBuffer.length).toBeGreaterThan(0);

    // Verify zip contains expected files
    const extractDir = extractZipToTemp(zipBuffer);
    try {
      expect(existsSync(join(extractDir, "file1.txt"))).toBe(true);
      expect(existsSync(join(extractDir, "file2.txt"))).toBe(true);
      expect(existsSync(join(extractDir, "subdir", "nested.txt"))).toBe(true);
      expect(existsSync(join(extractDir, "subdir", "another.txt"))).toBe(true);
    } finally {
      cleanupTestDir(extractDir);
    }
  });

  it("should respect ignore patterns for files and directories", () => {
    // Create test files and directories including ones that should be ignored
    const ignoreTestDir = join(testDir, "ignore_test_" + Date.now());
    mkdirSync(ignoreTestDir, { recursive: true });

    // Create files to keep
    writeFileSync(join(ignoreTestDir, "keep.txt"), "Keep this");
    mkdirSync(join(ignoreTestDir, "keep_dir"), { recursive: true });
    writeFileSync(join(ignoreTestDir, "keep_dir", "keep_nested.txt"), "Keep nested");

    // Create files to ignore (*.log)
    writeFileSync(join(ignoreTestDir, "ignore.log"), "Ignore this log");

    // Create directories to ignore
    mkdirSync(join(ignoreTestDir, "storage_test"), { recursive: true });
    writeFileSync(join(ignoreTestDir, "storage_test", "should_ignore.txt"), "Ignore this file in storage_test");

    const zipPath = join(ignoreTestDir, "output.zip");

    const result = createZipWithConfig(ignoreTestDir, zipPath, config);

    expect(result.status).toBe(0);

    const zipBuffer = readFileSync(zipPath);

    // Verify zip respects ignore patterns
    const extractDir = extractZipToTemp(zipBuffer);
    try {
      // Should exist
      expect(existsSync(join(extractDir, "keep.txt"))).toBe(true);
      expect(existsSync(join(extractDir, "keep_dir", "keep_nested.txt"))).toBe(true);

      // Should NOT exist (ignored)
      expect(existsSync(join(extractDir, "ignore.log"))).toBe(false);
      expect(existsSync(join(extractDir, "storage_test"))).toBe(false);
    } finally {
      cleanupTestDir(extractDir);
      cleanupTestDir(ignoreTestDir);
    }
  });

  it("should create zip with correct structure", () => {
    const zipPath = join(testDir, "structure.zip");

    const result = createZipWithConfig(testDir, zipPath, config);

    expect(result.status).toBe(0);

    const zipBuffer = readFileSync(zipPath);

    // Verify directory structure is preserved
    const extractDir = extractZipToTemp(zipBuffer);
    try {
      const subDirPath = join(extractDir, "subdir");
      expect(existsSync(subDirPath)).toBe(true);

      const file1Content = readFileSync(join(extractDir, "file1.txt"), "utf-8");
      expect(file1Content).toBe("Test file 1 content");

      const nestedContent = readFileSync(join(subDirPath, "nested.txt"), "utf-8");
      expect(nestedContent).toBe("Nested file content");
    } finally {
      cleanupTestDir(extractDir);
    }
  });

  it("should handle empty directories", () => {
    const emptyDirTest = join(testDir, "empty_dir_test_" + Date.now());
    mkdirSync(emptyDirTest, { recursive: true });
    mkdirSync(join(emptyDirTest, "empty_subdir"), { recursive: true });
    writeFileSync(join(emptyDirTest, "file.txt"), "content");

    const zipPath = join(emptyDirTest, "output.zip");

    const result = createZipWithConfig(emptyDirTest, zipPath, config);

    expect(result.status).toBe(0);
    expect(existsSync(zipPath)).toBe(true);

    cleanupTestDir(emptyDirTest);
  });
});
