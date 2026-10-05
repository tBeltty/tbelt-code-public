import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDesktopUploadPlan, type DesktopUploadPlan } from '../scripts/desktop-upload-plan.ts'
import { loadDesktopPackageEnvironment } from '../scripts/desktop-package-environment.mjs'
import { uploadDesktopTarget } from '../scripts/upload-target.ts'

const sent = vi.hoisted(() => [] as { command: string; input: Record<string, unknown> }[])

vi.mock('../scripts/desktop-package-environment.mjs', () => ({ loadDesktopPackageEnvironment: vi.fn() }))
vi.mock('../scripts/desktop-upload-plan.ts', () => ({ createDesktopUploadPlan: vi.fn() }))
vi.mock('@aws-sdk/client-s3', () => {
  class Command {
    constructor(readonly input: Record<string, unknown>) {}
  }
  return {
    ListObjectsV2Command: class extends Command {},
    PutObjectCommand: class extends Command {},
    DeleteObjectCommand: class extends Command {},
    S3Client: class {
      async send(command: Command): Promise<unknown> {
        sent.push({ command: command.constructor.name, input: command.input })
        if (command.constructor.name !== 'ListObjectsV2Command') return {}
        return { Contents: [
          { Key: 'dsh-desk/bin/linux-x64/tbelt-code-1.0.0-linux-x64.AppImage', Size: 10 },
          { Key: 'dsh-desk/bin/linux-x64/tbelt-code-1.1.0-linux-x64.AppImage', Size: 10 },
        ] }
      }

      destroy(): void {}
    },
  }
})

const temporaryDirectories: string[] = []

afterEach(async () => {
  sent.splice(0)
  vi.resetAllMocks()
  await Promise.all(temporaryDirectories.splice(0).map(async path => rm(path, { recursive: true, force: true })))
})

describe('desktop upload command', () => {
  it('writes binaries before channel metadata and prunes old releases last', async () => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-upload-target-'))
    temporaryDirectories.push(root)
    const image = join(root, 'tbelt-code-1.2.0-linux-x64.AppImage')
    await writeFile(image, 'AppImage fixture')
    const environment = {
      DOWNLOAD_S3_ENDPOINT: 'https://storage.example.com',
      DOWNLOAD_PROD_COS_SECRET_ID: 'fixture-id',
      DOWNLOAD_PROD_COS_SECRET_KEY: 'fixture-key',
      DOWNLOAD_KEEP_VERSIONS: '2',
    }
    const plan: DesktopUploadPlan = {
      environment: 'production', target: 'linux-x64', version: '1.2.0',
      publicUrl: 'https://updates.example.com/dsh-desk/feeds/linux-x64/',
      bucket: 'fixture-bucket', keyPrefix: 'dsh-desk/feeds/linux-x64', binaryKeyPrefix: 'dsh-desk/bin/linux-x64',
      productSlug: 'tbelt-code', targetSuffix: 'linux-x64',
      secretIdEnvName: 'DOWNLOAD_PROD_COS_SECRET_ID', secretKeyEnvName: 'DOWNLOAD_PROD_COS_SECRET_KEY',
      artifacts: [
        { path: image, filename: 'tbelt-code-1.2.0-linux-x64.AppImage', key: 'dsh-desk/bin/linux-x64/tbelt-code-1.2.0-linux-x64.AppImage',
          contentType: 'application/vnd.appimage', channelMetadata: false },
        { path: join(root, 'nightly-linux.yml'), filename: 'nightly-linux.yml', key: 'dsh-desk/feeds/linux-x64/nightly-linux.yml',
          contentType: 'application/yaml', channelMetadata: true, contents: 'version: 1.2.0\n' },
      ],
    }
    vi.mocked(loadDesktopPackageEnvironment).mockReturnValue(environment)
    vi.mocked(createDesktopUploadPlan).mockResolvedValue(plan)

    await uploadDesktopTarget(['linux-x64'])

    expect(loadDesktopPackageEnvironment).toHaveBeenCalledWith('linux')
    expect(createDesktopUploadPlan).toHaveBeenCalledWith('linux-x64', { environment, latest: false })
    expect(sent.map(({ command, input }) => `${command} ${String(input.Key ?? input.Bucket)}`)).toEqual([
      'ListObjectsV2Command fixture-bucket',
      'PutObjectCommand dsh-desk/bin/linux-x64/tbelt-code-1.2.0-linux-x64.AppImage',
      'PutObjectCommand dsh-desk/feeds/linux-x64/nightly-linux.yml',
      'DeleteObjectCommand dsh-desk/bin/linux-x64/tbelt-code-1.0.0-linux-x64.AppImage',
    ])
    expect(sent[1]!.input).toMatchObject({ CacheControl: 'public, max-age=31536000, immutable' })
    expect(sent[2]!.input).toMatchObject({ Body: 'version: 1.2.0\n', CacheControl: 'no-cache' })
  })

  it('makes caches revalidate the fixed-key latest installer', async () => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-upload-target-'))
    temporaryDirectories.push(root)
    const image = join(root, 'tbelt-code-1.2.0-linux-x64.AppImage')
    await writeFile(image, 'AppImage fixture')
    const environment = {
      DOWNLOAD_S3_ENDPOINT: 'https://storage.example.com',
      DOWNLOAD_PROD_COS_SECRET_ID: 'fixture-id',
      DOWNLOAD_PROD_COS_SECRET_KEY: 'fixture-key',
    }
    const plan: DesktopUploadPlan = {
      environment: 'production', target: 'linux-x64', version: '1.2.0',
      publicUrl: 'https://updates.example.com/desktop/tbelt-code-latest-linux-x64.AppImage',
      bucket: 'fixture-bucket', keyPrefix: 'dsh-desk/feeds/linux-x64', binaryKeyPrefix: 'dsh-desk/bin/linux-x64',
      productSlug: 'tbelt-code', targetSuffix: 'linux-x64',
      secretIdEnvName: 'DOWNLOAD_PROD_COS_SECRET_ID', secretKeyEnvName: 'DOWNLOAD_PROD_COS_SECRET_KEY',
      artifacts: [
        { path: image, filename: 'tbelt-code-latest-linux-x64.AppImage', key: 'desktop/tbelt-code-latest-linux-x64.AppImage',
          contentType: 'application/vnd.appimage', channelMetadata: false, fixedKey: true },
      ],
    }
    vi.mocked(loadDesktopPackageEnvironment).mockReturnValue(environment)
    vi.mocked(createDesktopUploadPlan).mockResolvedValue(plan)

    await uploadDesktopTarget(['linux-x64', '--latest'])

    const put = sent.find(({ command }) => command === 'PutObjectCommand')
    expect(put?.input).toMatchObject({ Key: 'desktop/tbelt-code-latest-linux-x64.AppImage', CacheControl: 'no-cache' })
  })
})
