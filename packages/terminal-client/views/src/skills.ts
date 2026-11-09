/**
 * Skills: the rows of the `/skills` list and the line that invokes one.
 * @module @deepseek-ai/dsh-terminal-views/skills
 */
import type { PickerItem } from './picker.ts'
import { oneLine } from './lines.ts'

/** One skill the person can invoke. */
export interface SkillRow {
  readonly name: string
  readonly description: string
}

/**
 * Rows of the skills list.
 * @param skills - the skills the Host offers.
 * @returns one item per skill, named as the slash command that invokes it.
 */
export function skillItems(skills: readonly SkillRow[]): PickerItem[] {
  return skills.map(skill => ({ value: skill.name, label: `/${skill.name}`, detail: oneLine(skill.description) }))
}

/**
 * The message that invokes a skill.
 * @param name - the skill name.
 * @param args - the text after the name, possibly empty.
 * @returns `/name` followed by the arguments.
 */
export function skillMessage(name: string, args: string): string {
  return args === '' ? `/${name}` : `/${name} ${args}`
}
