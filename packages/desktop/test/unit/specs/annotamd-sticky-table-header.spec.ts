import { afterEach, describe, expect, it } from 'vitest'

import { AnnotaMDStickyTableHeader } from '@/util/annotamdStickyTableHeader'

const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
  x: left,
  y: top,
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
  toJSON: () => ({})
})

const mountTable = (tableRect: DOMRect) => {
  const root = document.createElement('div')
  const figure = document.createElement('figure')
  const table = document.createElement('table')
  const row = table.insertRow()
  row.insertCell().textContent = '版本'
  row.insertCell().textContent = '说明'
  figure.className = 'mu-table'
  table.className = 'mu-table-inner'
  figure.appendChild(table)
  root.appendChild(figure)
  document.body.appendChild(root)

  root.getBoundingClientRect = () => rect(80, 50, 440, 500)
  figure.getBoundingClientRect = () => rect(100, -20, 400, 600)
  table.getBoundingClientRect = () => tableRect
  row.getBoundingClientRect = () => rect(tableRect.left, 20, tableRect.width, 40)
  Array.from(row.cells).forEach((cell, index) => {
    cell.getBoundingClientRect = () => rect(tableRect.left + index * 100, 20, 100, 40)
  })
  Object.defineProperty(table, 'scrollWidth', { value: tableRect.width })

  return { root }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('AnnotaMDStickyTableHeader', () => {
  it('aligns the sticky overlay with the inner table instead of the padded figure', () => {
    const { root } = mountTable(rect(105, -20, 380, 600))
    const stickyHeader = new AnnotaMDStickyTableHeader(root)
    const overlay = document.querySelector<HTMLElement>('.annotamd-sticky-table-header')!

    expect(overlay.style.left).toBe('105px')
    expect(overlay.style.width).toBe('380px')
    expect(overlay.querySelector<HTMLElement>('table')!.style.transform).toBe('translateX(0px)')

    stickyHeader.destroy()
  })

  it('offsets the cloned row by the actual clipped table pixels after horizontal scrolling', () => {
    const { root } = mountTable(rect(60, -20, 600, 600))
    const stickyHeader = new AnnotaMDStickyTableHeader(root)
    const overlay = document.querySelector<HTMLElement>('.annotamd-sticky-table-header')!

    expect(overlay.style.left).toBe('100px')
    expect(overlay.style.width).toBe('400px')
    expect(overlay.querySelector<HTMLElement>('table')!.style.transform).toBe('translateX(-40px)')

    stickyHeader.destroy()
  })
})
