import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { DATA_DIR } from "../utils/paths.js";
import type { CronJob } from "shared";

const AGENTS_DIR = join(DATA_DIR, "agents");

function cronJobsPath(alias: string): string {
  return join(AGENTS_DIR, alias, "cron-jobs.json");
}

function ensureAgentDir(alias: string): void {
  const dir = join(AGENTS_DIR, alias);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readJobs(alias: string): CronJob[] {
  const path = cronJobsPath(alias);
  if (!existsSync(path)) return [];
  try {
    const data = readFileSync(path, "utf8");
    return JSON.parse(data) as CronJob[];
  } catch {
    return [];
  }
}

function writeJobs(alias: string, jobs: CronJob[]): void {
  ensureAgentDir(alias);
  writeFileSync(cronJobsPath(alias), JSON.stringify(jobs, null, 2));
}

export function listCronJobs(alias: string): CronJob[] {
  return readJobs(alias);
}

export function getCronJob(alias: string, jobId: string): CronJob | undefined {
  const jobs = readJobs(alias);
  return jobs.find((j) => j.id === jobId);
}

export function createCronJob(alias: string, job: Omit<CronJob, "id">): CronJob {
  const jobs = readJobs(alias);
  const newJob: CronJob = {
    ...job,
    id: randomUUID(),
  };
  jobs.push(newJob);
  writeJobs(alias, jobs);
  return newJob;
}

export function updateCronJob(alias: string, jobId: string, updates: Partial<CronJob>): CronJob | undefined {
  const jobs = readJobs(alias);
  const index = jobs.findIndex((j) => j.id === jobId);
  if (index === -1) return undefined;

  // Don't allow changing the id
  const { id: _id, ...safeUpdates } = updates;
  jobs[index] = { ...jobs[index], ...safeUpdates };
  writeJobs(alias, jobs);
  return jobs[index];
}

export function deleteCronJob(alias: string, jobId: string): boolean {
  const jobs = readJobs(alias);
  const index = jobs.findIndex((j) => j.id === jobId);
  if (index === -1) return false;

  jobs.splice(index, 1);
  writeJobs(alias, jobs);
  return true;
}
