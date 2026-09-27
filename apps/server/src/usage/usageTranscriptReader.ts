// @effect-diagnostics nodeBuiltinImport:off
/**
 * Raw filesystem access for transcript scanning.
 *
 * Isolated here so the rest of the usage code stays on Effect's `FileSystem`.
 * The direct `node:fs` streaming is deliberate: a cold 30-day window is ~1.4 GB
 * across ~1,500 files, and `readline` over a read stream is roughly an order of
 * magnitude cheaper than materialising each file. The equivalent Effect stream
 * pipeline is idiomatic but not fast enough to sit behind a page load.
 *
 * @module usageTranscriptReader
 */
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeReadline from "node:readline";

import type { UsageProviderKind } from "@t3tools/contracts";

import {
  initialCodexScanState,
  mightCarryUsage,
  parseClaudeLine,
  parseCodexLine,
  type UsageRecord,
} from "./usageTranscripts.ts";

export interface TranscriptFile {
  readonly path: string;
  readonly size: number;
  readonly mtimeMs: number;
}

/**
 * Lists `.jsonl` transcripts under `root` last modified at or after `sinceMs`.
 *
 * Errors on individual entries are swallowed: session files rotate and get
 * removed while the walk is in flight, and a partial listing is far better than
 * failing the page.
 */
export async function listTranscriptFiles(
  root: string,
  sinceMs: number,
): Promise<readonly TranscriptFile[]> {
  const found: TranscriptFile[] = [];

  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await NodeFSP.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = NodePath.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(child);
        continue;
      }
      if (!entry.name.endsWith(".jsonl")) continue;
      try {
        const stats = await NodeFSP.stat(child);
        if (stats.mtimeMs >= sinceMs) {
          found.push({ path: child, size: stats.size, mtimeMs: stats.mtimeMs });
        }
      } catch {
        // Vanished between readdir and stat.
      }
    }
  };

  await walk(root);
  return found;
}

/**
 * Filesystem identity of a directory, as `device:inode`.
 *
 * Used to tell "two servers reading the same transcript directory" apart from
 * "two machines whose hostname and home path happen to match". Returns an empty
 * string when the directory cannot be stat'd.
 */
export async function readDirectoryVolumeId(path: string): Promise<string> {
  try {
    const stats = await NodeFSP.stat(path);
    return `${stats.dev}:${stats.ino}`;
  } catch {
    return "";
  }
}

/**
 * How many lexicographically smallest session file names the digest samples.
 *
 * Min-K is deliberate: appending a new session only disturbs the sample when
 * the new name lands among the K smallest, so two scans of the same directory
 * minutes apart still agree, while a sorted prefix or newest-K would churn on
 * every insert.
 */
const CONTENT_HINT_SAMPLE_SIZE = 16;

/** Below this many distinct names the directory is too sparse to fingerprint. */
const CONTENT_HINT_MIN_NAMES = CONTENT_HINT_SAMPLE_SIZE;

/** Entry budget for the name-only walk; transcript trees stay far below this. */
const CONTENT_HINT_WALK_BUDGET = 4000;

/**
 * Content-derived identity of a transcript directory.
 *
 * `volumeId` cannot prove that "the Windows view" and "a WSL view" are the same
 * physical directory: the boundary changes both the path namespace and the
 * device/inode space. The session file names inside do not change meaning
 * across that boundary, so a digest over a stable sample of them does. Returns
 * `null` when fewer than `CONTENT_HINT_MIN_NAMES` transcripts exist — a sparse
 * directory must never merge on a weak signal. Name-only readdir, no stat calls,
 * so this stays cheap next to the scan it accompanies.
 */
export async function readDirectoryContentHint(root: string): Promise<string | null> {
  const names = new Set<string>();
  let budget = CONTENT_HINT_WALK_BUDGET;

  const walk = async (dir: string): Promise<void> => {
    if (budget <= 0) return;
    let entries;
    try {
      entries = await NodeFSP.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (budget <= 0) return;
      budget -= 1;
      // Mirrors listTranscriptFiles: symlinked subdirectories are not followed.
      if (entry.isDirectory()) {
        await walk(NodePath.join(dir, entry.name));
        continue;
      }
      if (entry.name.endsWith(".jsonl")) names.add(entry.name);
    }
  };

  await walk(root);
  if (names.size < CONTENT_HINT_MIN_NAMES) return null;
  const sample = [...names].sort().slice(0, CONTENT_HINT_SAMPLE_SIZE).join("\n");
  return NodeCrypto.createHash("sha256").update(sample).digest("hex");
}

/**
 * Streams one transcript and returns the usage records it contains, or `null`
 * when the file could not be read.
 *
 * The distinction matters to the caller's cache: a genuinely empty transcript
 * is a stable fact worth memoising, while a transient read failure memoised
 * under the same `(size, mtime)` key would silently drop that file's usage
 * until the file next changes.
 *
 * Codex carries the active model on `turn_context` lines that hold no usage of
 * their own, so those still have to pass through the reducer to keep model
 * attribution correct.
 */
export async function readTranscriptRecords(
  filePath: string,
  provider: UsageProviderKind,
): Promise<readonly UsageRecord[] | null> {
  const records: UsageRecord[] = [];
  const codexState = initialCodexScanState();

  try {
    const lines = NodeReadline.createInterface({
      input: NodeFS.createReadStream(filePath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });

    for await (const line of lines) {
      if (provider === "codex") {
        if (
          !mightCarryUsage(line, provider) &&
          !line.includes('"turn_context"') &&
          !line.includes('"session_meta"')
        ) {
          continue;
        }
        const record = parseCodexLine(line, codexState);
        if (record !== null) records.push(record);
        continue;
      }

      if (!mightCarryUsage(line, provider)) continue;
      const record = parseClaudeLine(line);
      if (record !== null) records.push(record);
    }
  } catch {
    return null;
  }

  return records;
}
