import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Logger class for file and console output
 */
export class Logger {
  private logFile: string;
  private silentMode: boolean;
  private writeLogToFileEnabled: boolean = true;

  constructor(logFile: string, silentMode: boolean = false, writeLogToFileEnabled: boolean = true) {
    this.logFile = logFile;
    this.silentMode = silentMode;
    this.writeLogToFileEnabled = writeLogToFileEnabled;

    // Ensure log directory exists
    const logDir = dirname(logFile);
    const isCurrentDir = logDir === "." || logDir === "./" || logDir === "";

    if (!existsSync(logDir) && !isCurrentDir) {
      try {
        mkdirSync(logDir, { recursive: true });
      } catch (error) {
        throw new Error(`Failed to create log directory ${logDir} for log file: ${error}`);
      }
    }
  }

  /**
   * Log message to file and optionally console
   */
  log(message: string, level: "INFO" | "ERROR" | "SUCCESS" | "WARN" = "INFO"): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;

    // Always write to file if enabled, even if console is silent
    try {
      if (this.writeLogToFileEnabled) {
        appendFileSync(this.logFile, logMessage + "\n");
      }
    } catch (error) {
      // If can't write to log, output to console anyway
      console.error("Failed to write to log file:", error);
    }

    // Output to console if not in silent mode
    if (!this.silentMode) {
      const emoji =
        {
          INFO: "ℹ️",
          ERROR: "❌",
          SUCCESS: "✅",
          WARN: "⚠️",
        }[level] || "";
      console.log(`${emoji} ${message}`);
    }
  }

  info(message: string): void {
    this.log(message, "INFO");
  }

  error(message: string): void {
    this.log(message, "ERROR");
  }

  success(message: string): void {
    this.log(message, "SUCCESS");
  }

  warn(message: string): void {
    this.log(message, "WARN");
  }
}