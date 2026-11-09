/** Upload validated Desktop update artifacts or a fixed installer to an S3-compatible update bucket. */

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { type BucketObject, formatBytes, planBucketBudget } from './bucket-budget.ts'
import type { DesktopPackageTargetName } from './package-target.ts'
import { resolveDesktopUploadConfig } from './desktop-auto-update-environment.mjs'
import { loadDesktopPackageEnvironment } from './desktop-package-environment.mjs'
import { createDesktopUploadPlan, type DesktopUploadArtifact } from './desktop-upload-plan.ts'

const SUPPORTED_TARGETS = new Set<DesktopPackageTargetName>(['mac-arm64', 'mac-x64', 'win-x64', 'linux-x64'])

function targetName(value: string): DesktopPackageTargetName {
  if (!SUPPORTED_TARGETS.has(value as DesktopPackageTargetName)) {
    throw new Error(`desktop upload: unsupported target ${JSON.stringify(value)}; expected ${[...SUPPORTED_TARGETS].join(', ')}`)
  }
  return value as DesktopPackageTargetName
}

function requiredEnvironmentValue(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim()
  if (value === undefined || value === '') {
    throw new Error(`desktop upload: ${name} must be set to a non-empty value`)
  }
  return value
}

/**
 * Use the credential launcher's selected deployment only when it matches the packaged release destination.
 * @param fileEnvironment Target dotenv settings that own the release destination.
 * @param injectedEnvironment Child environment containing the DPAPI-decrypted credential pair.
 * @param selected Deployment authorized by the launcher operator.
 * @param bucket Bucket authorized by the launcher operator.
 * @param target Packaged target being uploaded.
 * @returns Release settings with only the selected credential pair replaced.
 */
export function resolveCredentialUploadEnvironment(
  fileEnvironment: NodeJS.ProcessEnv, injectedEnvironment: NodeJS.ProcessEnv,
  selected: 'test' | 'production', bucket: string,
  target: DesktopPackageTargetName,
): NodeJS.ProcessEnv {
  const platform = target === 'win-x64' ? 'win32' : 'darwin'
  const arch = target === 'mac-arm64' ? 'arm64' : 'x64'
  const destination = resolveDesktopUploadConfig(fileEnvironment, platform, arch)
  if (destination.environment !== selected || destination.bucket !== bucket) {
    throw new Error('desktop upload: credential launcher deployment or bucket differs from the packaged release destination')
  }
  if (injectedEnvironment.DSH_DESKTOP_AUTO_UPDATE_ENV !== selected
    || injectedEnvironment[`${selected === 'test' ? 'DOWNLOAD_TEST' : 'DOWNLOAD_PROD'}_COS_BUCKET`] !== bucket) {
    throw new Error('desktop upload: credential launcher environment differs from its explicit arguments')
  }
  return {
    ...fileEnvironment,
    [destination.secretIdEnvName]: requiredEnvironmentValue(injectedEnvironment, destination.secretIdEnvName),
    [destination.secretKeyEnvName]: requiredEnvironmentValue(injectedEnvironment, destination.secretKeyEnvName),
  }
}

/** Cloudflare R2 includes 10 GB-month free; stay well below it unless told otherwise. */
const DEFAULT_LIMIT_GB = 8
const DEFAULT_KEEP_VERSIONS = 2

function positiveNumber(environment: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = environment[name]?.trim()
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`desktop upload: ${name} must be a positive number, got ${JSON.stringify(raw)}`)
  }
  return value
}

async function listBucket(client: S3Client, bucket: string): Promise<BucketObject[]> {
  const objects: BucketObject[] = []
  let token: string | undefined
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }))
    for (const entry of page.Contents ?? []) {
      if (entry.Key !== undefined) objects.push({ key: entry.Key, size: entry.Size ?? 0 })
    }
    token = page.IsTruncated === true ? page.NextContinuationToken : undefined
  } while (token !== undefined)
  return objects
}

async function artifactSize(artifact: DesktopUploadArtifact): Promise<number> {
  return artifact.contents === undefined ? (await stat(artifact.path)).size : Buffer.byteLength(artifact.contents)
}

async function putArtifact(client: S3Client, bucket: string, artifact: DesktopUploadArtifact): Promise<void> {
  // Channel metadata and fixed-key installers are overwritten in place, so caches must revalidate them;
  // versioned binaries never change once written.
  const cacheControl = artifact.channelMetadata || artifact.fixedKey === true ? 'no-cache' : 'public, max-age=31536000, immutable'
  if (artifact.contents !== undefined) {
    await client.send(new PutObjectCommand({
      Bucket: bucket, Key: artifact.key, Body: artifact.contents, ContentType: artifact.contentType, CacheControl: cacheControl,
    }))
  }
  else {
    const body = createReadStream(artifact.path)
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: artifact.key,
        Body: body,
        ContentLength: (await stat(artifact.path)).size,
        ContentType: artifact.contentType,
        CacheControl: cacheControl,
      }))
    }
    finally {
      body.destroy()
    }
  }
  process.stdout.write(`desktop upload: uploaded ${artifact.key}\n`)
}

/**
 * Upload the selected target, then delete releases of it beyond the retention count.
 * @param args Target and upload options from the command line.
 * @returns Resolves after every object is written and old releases are pruned.
 */
export async function uploadDesktopTarget(args: string[]): Promise<void> {
  const { positionals, values } = parseArgs({ args, allowPositionals: true, options: { latest: { type: 'boolean' } } })
  const target = positionals[0]
  if (target === undefined || positionals.length !== 1) {
    throw new Error('desktop upload: expected exactly one target')
  }
  const name = targetName(target)
  const environment = loadDesktopPackageEnvironment(name === 'win-x64' ? 'win32' : name === 'linux-x64' ? 'linux' : 'darwin')
  const plan = await createDesktopUploadPlan(name, { environment, latest: values.latest === true })
  const client = new S3Client({
    // Any S3-compatible store works; for Cloudflare R2 use https://<account-id>.r2.cloudflarestorage.com.
    region: environment.DOWNLOAD_S3_REGION?.trim() || 'auto',
    endpoint: requiredEnvironmentValue(environment, 'DOWNLOAD_S3_ENDPOINT'),
    credentials: {
      accessKeyId: requiredEnvironmentValue(environment, plan.secretIdEnvName),
      secretAccessKey: requiredEnvironmentValue(environment, plan.secretKeyEnvName),
    },
  })
  process.stdout.write(`desktop upload: ${plan.target} ${plan.version} -> ${plan.publicUrl}\n`)
  try {
    const uploads = await Promise.all(plan.artifacts.map(async artifact => ({ key: artifact.key, size: await artifactSize(artifact) })))
    const budget = planBucketBudget({
      objects: await listBucket(client, plan.bucket),
      uploads,
      keyPrefix: plan.binaryKeyPrefix,
      productSlug: plan.productSlug,
      targetSuffix: plan.targetSuffix,
      version: plan.version,
      keepVersions: positiveNumber(environment, 'DOWNLOAD_KEEP_VERSIONS', DEFAULT_KEEP_VERSIONS),
      limitBytes: positiveNumber(environment, 'DOWNLOAD_BUCKET_LIMIT_GB', DEFAULT_LIMIT_GB) * 1e9,
    })
    process.stdout.write(`desktop upload: bucket ${formatBytes(budget.currentBytes)} now, ${formatBytes(budget.projectedBytes)} after this release\n`)
    for (const artifact of plan.artifacts) await putArtifact(client, plan.bucket, artifact)
    // Old installers go only after the new channel metadata points away from them.
    for (const object of budget.prune) {
      await client.send(new DeleteObjectCommand({ Bucket: plan.bucket, Key: object.key }))
      process.stdout.write(`desktop upload: deleted old ${object.key}\n`)
    }
  }
  finally {
    client.destroy()
  }
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  uploadDesktopTarget(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`desktop upload: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
