// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type Parent from '../../../block/base/parent'
import { ParagraphFrontMenu } from '../index'
import { Muya } from '../../../muya'

const instances: Muya[] = []

afterEach(() => {
    vi.unstubAllGlobals()
    instances.splice(0).forEach(muya => muya.destroy())
    document.body.replaceChildren()
})

function bootMuya(markdown: string): Muya {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const muya = new Muya(host, { markdown } as never)
    muya.init()
    document.body.appendChild(muya.domNode)
    instances.push(muya)
    return muya
}

function blocks(muya: Muya) {
    const result: Parent[] = []
    muya.editor.scrollPage!.children.forEach(block => result.push(block as Parent))
    return result
}

describe('delete-section confirmation', () => {
    it('keeps the same focused item when entering confirmation', () => {
        const muya = bootMuya('# First\n\nbody\n\n# Second\n\nkeep\n')
        const menu = new ParagraphFrontMenu(muya, {})
        const block = blocks(muya)[0]
        Object.assign(menu as unknown as Record<string, unknown>, { _block: block, _kind: null })
        // Simulate an already-shown menu: show() is what sets status=true.
        ;(menu as unknown as { status: boolean }).status = true
        menu.render()

        const item = menu.container!.querySelector<HTMLLIElement>('li.item.delete-section')
        expect(item).toBeTruthy()

        item!.focus()
        expect(document.activeElement).toBe(item)

        menu.selectItem(new Event('click'), { label: 'delete-section' })

        const confirming = menu.container!.querySelector<HTMLLIElement>('li.item.delete-section.confirming')
        expect(confirming).toBeTruthy()
        expect(confirming).toBe(item)
        expect(document.activeElement).toBe(confirming)

        expect(menu.status).toBe(true)
    })

    it('closes on outside focus and cancels the pending confirmation', () => {
        const frames: FrameRequestCallback[] = []
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
        const muya = bootMuya('# First\n\nbody\n')
        const menu = new ParagraphFrontMenu(muya, {})
        Object.assign(menu, { _block: blocks(muya)[0], status: true })
        menu.render()
        menu.selectItem(new Event('click'), { label: 'delete-section' })
        menu.container!.querySelector<HTMLElement>('.delete-section')!.focus()

        const outside = document.createElement('button')
        document.body.appendChild(outside)
        outside.focus()
        frames.splice(0).forEach(callback => callback(0))

        expect(menu.status).toBe(false)
        expect(muya.getMarkdown()).toBe('# First\n\nbody\n')
    })

    it('requires confirmation again after hiding and reopening on the same heading', () => {
        const muya = bootMuya('# First\n\nbody\n')
        const menu = new ParagraphFrontMenu(muya, {})
        const heading = blocks(muya)[0]
        Object.assign(menu, { _block: heading, status: true })
        menu.render()
        menu.selectItem(new Event('click'), { label: 'delete-section' })
        menu.hide()

        Object.assign(menu, { _block: heading, status: true })
        menu.render()
        expect(menu.container!.querySelector('.delete-section.confirming')).toBeNull()
        menu.selectItem(new Event('click'), { label: 'delete-section' })
        expect(muya.getMarkdown()).toBe('# First\n\nbody\n')
        expect(menu.container!.querySelector('.delete-section.confirming')).not.toBeNull()
    })
})
