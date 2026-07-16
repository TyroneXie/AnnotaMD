const STICKY_HEADER_CLASS = 'annotamd-sticky-table-header'

export class AnnotaMDStickyTableHeader {
  private readonly overlay: HTMLDivElement
  private readonly mutationObserver: MutationObserver
  private readonly resizeObserver: ResizeObserver | null
  private frame: number | null = null
  private activeFigure: HTMLElement | null = null
  private renderedSignature = ''

  constructor(private readonly scrollRoot: HTMLElement) {
    this.overlay = document.createElement('div')
    this.overlay.className = STICKY_HEADER_CLASS
    this.overlay.setAttribute('aria-hidden', 'true')
    document.body.appendChild(this.overlay)

    this.scrollRoot.addEventListener('scroll', this.queueRefresh, true)
    window.addEventListener('resize', this.queueRefresh)

    this.mutationObserver = new MutationObserver(this.queueRefresh)
    this.mutationObserver.observe(this.scrollRoot, {
      childList: true,
      subtree: true,
      characterData: true
    })

    this.resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(this.queueRefresh)
    this.resizeObserver?.observe(this.scrollRoot)

    this.refresh()
  }

  private readonly queueRefresh = (): void => {
    if (this.frame != null) return
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      this.refresh()
    })
  }

  refresh(): void {
    if (!this.scrollRoot.isConnected || document.body.classList.contains('annotamd-image-viewer-open')) {
      this.hide()
      return
    }

    const rootRect = this.scrollRoot.getBoundingClientRect()
    const stickyTop = rootRect.top
    const figures = Array.from(
      this.scrollRoot.querySelectorAll<HTMLElement>('figure.mu-table')
    )

    for (const figure of figures) {
      const table = figure.querySelector<HTMLTableElement>('table.mu-table-inner')
      const headerRow = table?.rows.item(0)
      if (!table || !headerRow) continue

      const figureRect = figure.getBoundingClientRect()
      const tableRect = table.getBoundingClientRect()
      const headerRect = headerRow.getBoundingClientRect()
      const headerHasScrolledAway = headerRect.top < stickyTop
      const tableStillCoversHeader = tableRect.bottom > stickyTop + headerRect.height
      if (!headerHasScrolledAway || !tableStillCoversHeader) continue

      this.render(figure, table, headerRow, rootRect, figureRect, tableRect)
      return
    }

    this.hide()
  }

  private render(
    figure: HTMLElement,
    table: HTMLTableElement,
    headerRow: HTMLTableRowElement,
    rootRect: DOMRect,
    figureRect: DOMRect,
    tableRect: DOMRect
  ): void {
    const visibleLeft = Math.max(rootRect.left, figureRect.left, tableRect.left)
    const visibleRight = Math.min(rootRect.right, figureRect.right, tableRect.right)
    const visibleWidth = Math.max(0, visibleRight - visibleLeft)
    if (visibleWidth === 0) {
      this.hide()
      return
    }

    const cellWidths = Array.from(headerRow.cells, (cell) => cell.getBoundingClientRect().width)
    const tableWidth = Math.max(table.scrollWidth, table.getBoundingClientRect().width)
    const signature = `${headerRow.textContent ?? ''}|${cellWidths.join(',')}|${tableWidth}`

    if (this.activeFigure !== figure || this.renderedSignature !== signature) {
      const cloneTable = table.cloneNode(false) as HTMLTableElement
      cloneTable.classList.add('annotamd-sticky-table-copy')
      cloneTable.style.width = `${tableWidth}px`
      cloneTable.style.tableLayout = 'fixed'

      const colgroup = document.createElement('colgroup')
      for (const width of cellWidths) {
        const col = document.createElement('col')
        col.style.width = `${width}px`
        colgroup.appendChild(col)
      }

      const body = document.createElement('tbody')
      const cloneRow = headerRow.cloneNode(true) as HTMLTableRowElement
      cloneRow.querySelectorAll<HTMLElement>('[contenteditable]').forEach((node) => {
        node.setAttribute('contenteditable', 'false')
      })
      body.appendChild(cloneRow)
      cloneTable.append(colgroup, body)
      this.overlay.replaceChildren(cloneTable)
      this.activeFigure = figure
      this.renderedSignature = signature
    }

    const cloneTable = this.overlay.firstElementChild as HTMLTableElement | null
    if (cloneTable) {
      const hiddenLeft = Math.max(0, visibleLeft - tableRect.left)
      cloneTable.style.transform = `translateX(${-hiddenLeft}px)`
    }

    Object.assign(this.overlay.style, {
      display: 'block',
      top: `${rootRect.top}px`,
      left: `${visibleLeft}px`,
      width: `${visibleWidth}px`
    })
  }

  private hide(): void {
    this.overlay.style.display = 'none'
    this.activeFigure = null
    this.renderedSignature = ''
  }

  destroy(): void {
    if (this.frame != null) cancelAnimationFrame(this.frame)
    this.frame = null
    this.scrollRoot.removeEventListener('scroll', this.queueRefresh, true)
    window.removeEventListener('resize', this.queueRefresh)
    this.mutationObserver.disconnect()
    this.resizeObserver?.disconnect()
    this.overlay.remove()
  }
}
