import { describe, expect, it } from 'vitest'
import {
  cleartextRemote, isHttpUrl, LOCAL_PROVIDER_TEMPLATES, ROUTE_PATTERN,
} from '../src/index.ts'

describe('local provider templates', () => {
  it('offers templates whose route and base URL pass the same rules as a typed provider', () => {
    expect(LOCAL_PROVIDER_TEMPLATES.map(template => template.route)).toEqual(['ollama', 'lmstudio', 'koboldcpp'])
    for (const template of LOCAL_PROVIDER_TEMPLATES) {
      expect(ROUTE_PATTERN.test(template.route), template.route).toBe(true)
      expect(isHttpUrl(template.baseURL), template.baseURL).toBe(true)
      expect(cleartextRemote(template.baseURL), template.baseURL).toBe(false)
    }
  })
})
