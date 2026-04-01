import { afterAll, describe, expect, it } from "bun:test";
import { ZipArchive } from "../src/ZipArchive";
import { Logger } from "../src/Logger";
import path, { dirname, join } from "path";
import {
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "fs";

const clientConfig = JSON.parse(
    readFileSync(path.join(__dirname, "./meta/client.config.json"), "utf-8"),
);
const pathLogFiles = join(dirname(__dirname), "logs", "zipArchiveTest.log");
const tempDir = join(dirname(__dirname), "temp");
const suiteTempDir = join(tempDir, `zip-archive-suite-${Date.now()}`);

if (!existsSync(pathLogFiles)) {
    mkdirSync(dirname(pathLogFiles), { recursive: true });
    writeFileSync(pathLogFiles, "");
}

if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
}

mkdirSync(suiteTempDir, { recursive: true });

afterAll(() => {
    rmSync(suiteTempDir, { recursive: true, force: true });
});

describe("ZipArchive", () => {
    it("should preserve structure and respect relative ignore paths", () => {
        const sourceDir = join(suiteTempDir, "source-project");
        const extractDir = join(suiteTempDir, "extracted-project");
        mkdirSync(sourceDir, { recursive: true });

        mkdirSync(join(sourceDir, "src", "nested"), { recursive: true });
        mkdirSync(join(sourceDir, "notify", "node_modules", "pkg"), { recursive: true });
        mkdirSync(join(sourceDir, "node_modules", "root-pkg"), { recursive: true });
        mkdirSync(join(sourceDir, "deploy"), { recursive: true });
        mkdirSync(join(sourceDir, "logs"), { recursive: true });

        writeFileSync(join(sourceDir, "src", "index.ts"), "console.log('index');");
        writeFileSync(join(sourceDir, "src", "nested", "keep.txt"), "keep");
        writeFileSync(join(sourceDir, "notify", "keep.txt"), "keep notify");
        writeFileSync(join(sourceDir, "notify", "node_modules", "pkg", "ignored.js"), "ignored");
        writeFileSync(join(sourceDir, "node_modules", "root-pkg", "ignored.js"), "ignored");
        writeFileSync(join(sourceDir, "deploy", "ignored.txt"), "ignored");
        writeFileSync(join(sourceDir, "logs", "ignored.txt"), "ignored");
        writeFileSync(join(sourceDir, "app.log"), "ignored");
        writeFileSync(join(sourceDir, "tool.exe"), "ignored");

        const zipArchive = new ZipArchive(clientConfig, new Logger(pathLogFiles, true));
        const archiveResult = zipArchive.createArchiveFromDirectory(sourceDir);

        zipArchive.extractArchive(
            `project${archiveResult.extension}`,
            archiveResult.data,
            extractDir,
        );

        expect(existsSync(join(extractDir, "src", "index.ts"))).toBe(true);
        expect(existsSync(join(extractDir, "src", "nested", "keep.txt"))).toBe(true);
        expect(existsSync(join(extractDir, "notify", "keep.txt"))).toBe(true);

        expect(existsSync(join(extractDir, "nested", "keep.txt"))).toBe(false);
        expect(existsSync(join(extractDir, "index.ts"))).toBe(false);

        expect(existsSync(join(extractDir, "node_modules"))).toBe(false);
        expect(existsSync(join(extractDir, "notify", "node_modules"))).toBe(false);
        expect(existsSync(join(extractDir, "deploy"))).toBe(false);
        expect(existsSync(join(extractDir, "logs"))).toBe(false);
        expect(existsSync(join(extractDir, "app.log"))).toBe(false);
        expect(existsSync(join(extractDir, "tool.exe"))).toBe(false);
    }, 5 * 60 * 1000);
});