import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePreferencesStore } from '@/store/preferences'

describe('preferences transient edit modes', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('does not restore edit modes from persisted preferences', () => {
    const store = usePreferencesStore()

    store.SET_USER_PREFERENCE({
      sourceCode: true,
      typewriter: true,
      focus: true
    })

    expect(store.sourceCode).toBe(false)
    expect(store.typewriter).toBe(false)
    expect(store.focus).toBe(false)
  })
})
