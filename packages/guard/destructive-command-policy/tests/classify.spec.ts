/**
 * Pure unit coverage for `isDestructiveCommand`: true positives for every
 * pattern class the package README documents, true negatives for common safe
 * commands that superficially resemble a destructive shape, and the explicit
 * `git push` (no force) false-positive risk called out in the execution plan.
 */

import { describe, expect, it } from 'vitest'
import { isDestructiveCommand } from '@deepseek-ai/dsh-destructive-command-policy'

describe('isDestructiveCommand: rm recursive + force', () => {
  it.each([
    'rm -rf /',
    'rm -rf ~',
    'rm -rf .',
    'rm -rf ./build',
    'rm -fr /tmp/foo',
    'rm -r -f /var/data',
    'rm -f -r /var/data',
    'rm --recursive --force /var/data',
  ])('flags %s', (command) => {
    const result = isDestructiveCommand(command)
    expect(result.destructive).toBe(true)
    expect(result.reason).toMatch(/rm -rf/)
  })

  it('does not flag rm without both recursive and force', () => {
    expect(isDestructiveCommand('rm -f ./one-file.txt').destructive).toBe(false)
    expect(isDestructiveCommand('rm -r ./some-dir').destructive).toBe(false)
    expect(isDestructiveCommand('rm ./one-file.txt').destructive).toBe(false)
  })
})

describe('isDestructiveCommand: git push --force', () => {
  it.each([
    'git push --force',
    'git push -f',
    'git push --force origin main',
    'git push origin main --force',
    'git push --force-with-lease',
  ])('flags %s', (command) => {
    const result = isDestructiveCommand(command)
    expect(result.destructive).toBe(true)
    expect(result.reason).toMatch(/git push/)
  })

  it('does NOT flag plain git push (explicit false-positive risk)', () => {
    expect(isDestructiveCommand('git push').destructive).toBe(false)
    expect(isDestructiveCommand('git push origin main').destructive).toBe(false)
    expect(isDestructiveCommand('git push origin feature/my-branch').destructive).toBe(false)
  })
})

describe('isDestructiveCommand: git reset --hard', () => {
  it('flags git reset --hard', () => {
    const result = isDestructiveCommand('git reset --hard')
    expect(result.destructive).toBe(true)
    expect(result.reason).toMatch(/git reset --hard/)
  })

  it('flags git reset --hard HEAD~1', () => {
    expect(isDestructiveCommand('git reset --hard HEAD~1').destructive).toBe(true)
  })

  it('does not flag git reset without --hard', () => {
    expect(isDestructiveCommand('git reset').destructive).toBe(false)
    expect(isDestructiveCommand('git reset --soft HEAD~1').destructive).toBe(false)
    expect(isDestructiveCommand('git reset HEAD~1').destructive).toBe(false)
  })
})

describe('isDestructiveCommand: disk format commands', () => {
  it.each([
    'mkfs /dev/sda1',
    'mkfs.ext4 /dev/sda1',
    'mkfs.vfat /dev/disk2',
    'diskutil eraseDisk APFS MyDisk /dev/disk2',
    'format C:',
  ])('flags %s', (command) => {
    expect(isDestructiveCommand(command).destructive).toBe(true)
  })

  it('does not flag unrelated diskutil subcommands', () => {
    expect(isDestructiveCommand('diskutil list').destructive).toBe(false)
    expect(isDestructiveCommand('diskutil info disk2').destructive).toBe(false)
  })
})

describe('isDestructiveCommand: dd to a block device', () => {
  it.each([
    'dd if=/dev/zero of=/dev/sda',
    'dd if=image.iso of=/dev/disk2 bs=4m',
  ])('flags %s', (command) => {
    const result = isDestructiveCommand(command)
    expect(result.destructive).toBe(true)
    expect(result.reason).toMatch(/dd/)
  })

  it('does not flag dd writing to a regular file', () => {
    expect(isDestructiveCommand('dd if=/dev/zero of=./scratch.img bs=1m count=10').destructive).toBe(false)
    expect(isDestructiveCommand('dd if=/dev/sda of=backup.img').destructive).toBe(false)
  })
})

describe('isDestructiveCommand: recursive chmod/chown on /', () => {
  it.each([
    'chmod -R 777 /',
    'chmod --recursive 755 /',
    'chown -R root:root /',
    'chown -R root /',
  ])('flags %s', (command) => {
    expect(isDestructiveCommand(command).destructive).toBe(true)
  })

  it('does not flag recursive chmod/chown scoped to a project path', () => {
    expect(isDestructiveCommand('chmod -R 755 ./dist').destructive).toBe(false)
    expect(isDestructiveCommand('chown -R me:me /home/me/project').destructive).toBe(false)
  })

  it('does not flag non-recursive chmod/chown on /', () => {
    expect(isDestructiveCommand('chmod 755 /').destructive).toBe(false)
  })
})

describe('isDestructiveCommand: safe commands', () => {
  it.each([
    'ls -la',
    'git status',
    'git log --oneline',
    'git commit -m "message"',
    'npm install',
    'echo hello',
    'cat package.json',
    'mkdir -p ./out',
    'cp -r ./src ./backup',
  ])('does not flag %s', (command) => {
    expect(isDestructiveCommand(command).destructive).toBe(false)
  })

  it('does not flag an empty or whitespace-only command', () => {
    expect(isDestructiveCommand('').destructive).toBe(false)
    expect(isDestructiveCommand('   ').destructive).toBe(false)
  })
})

describe('isDestructiveCommand: chained commands', () => {
  it('flags a destructive command hidden after a benign one', () => {
    const result = isDestructiveCommand('echo starting && rm -rf /tmp/build')
    expect(result.destructive).toBe(true)
  })

  it('does not flag a fully benign chain', () => {
    expect(isDestructiveCommand('cd /tmp && ls -la').destructive).toBe(false)
  })

  it('flags a destructive command hidden after a pipe (confirmed regression: the previous regex splitter did not split on a bare `|`)', () => {
    const result = isDestructiveCommand('echo ok | rm -rf /')
    expect(result.destructive).toBe(true)
    expect(result.reason).toMatch(/rm -rf/)
  })

  it('does not flag a fully benign pipeline', () => {
    expect(isDestructiveCommand('cat package.json | grep name').destructive).toBe(false)
  })

  it('flags a destructive command reached through a chain combining &&, ;, ||, and | together', () => {
    const result = isDestructiveCommand('echo one && echo two; false || echo ok | rm -rf /tmp/build')
    expect(result.destructive).toBe(true)
    expect(result.reason).toMatch(/rm -rf/)
  })
})

describe('isDestructiveCommand: shell-quoting-aware tokenization', () => {
  it('still flags rm -rf on a quoted path containing spaces, now correctly tokenized as one argument', () => {
    const result = isDestructiveCommand('rm -rf "some dir with spaces"')
    expect(result.destructive).toBe(true)
    expect(result.reason).toBe('rm -rf (recursive + force removal) targeting some dir with spaces')
  })

  it('does not miscount a single quoted argument as multiple path tokens', () => {
    // Before the AST-based rewrite, whitespace-splitting would have produced
    // three separate path tokens here instead of one.
    const result = isDestructiveCommand('rm -rf "some dir with spaces"')
    expect(result.reason?.split('targeting ')[1]).toBe('some dir with spaces')
  })
})

describe('isDestructiveCommand: variable expansion / command substitution', () => {
  it('flags rm -rf targeting an unresolved variable', () => {
    const result = isDestructiveCommand('rm -rf "$TARGET"')
    expect(result.destructive).toBe(true)
    expect(result.reason).toMatch(/rm -rf/)
  })

  it('flags dd writing to an unresolved command-substitution destination', () => {
    const result = isDestructiveCommand('dd if=/dev/zero of=$(cat target)')
    expect(result.destructive).toBe(true)
    expect(result.reason).toMatch(/dd writing/)
  })

  it('flags a command name computed via command substitution', () => {
    const result = isDestructiveCommand('$(echo rm) -rf /')
    expect(result.destructive).toBe(true)
    expect(result.reason).toMatch(/command name/)
  })

  it('does not flag ordinary variable use unrelated to a destructive target', () => {
    expect(isDestructiveCommand('git commit -m "$MESSAGE"').destructive).toBe(false)
  })
})

describe('isDestructiveCommand: environment-variable-prefix bypass', () => {
  it('flags rm -rf hidden behind a leading env-var assignment (confirmed regression: the previous whitespace tokenizer read `FOO=bar` as the command name)', () => {
    const result = isDestructiveCommand('FOO=bar rm -rf /')
    expect(result.destructive).toBe(true)
    expect(result.reason).toMatch(/rm -rf/)
  })

  it('flags git push --force hidden behind multiple leading env-var assignments', () => {
    const result = isDestructiveCommand('GIT_AUTHOR_NAME=x GIT_AUTHOR_EMAIL=y git push --force')
    expect(result.destructive).toBe(true)
    expect(result.reason).toMatch(/git push/)
  })

  it('does not flag a benign command carrying a leading env-var assignment', () => {
    expect(isDestructiveCommand('NODE_ENV=production npm run build').destructive).toBe(false)
  })
})
