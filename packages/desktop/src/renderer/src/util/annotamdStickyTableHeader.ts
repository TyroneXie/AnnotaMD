const STICKY_HEADER_CLASS = 'annotamd-sticky-table-header'

interface TableCandidate {
  figure: HTMLElement
  table: HTMLTableElement
  headerRow: HTMLTableRowElement
  headerTop: number
  headerHeight: number
  tableBottom: number
}

export class AnnotaMDStickyTableHeader {
  private readonly overlay: HTMLDivElement
  private readonly mutationObserver: MutationObserver
  private readonly resizeObserver: ResizeObserver | null
  private frame: number | null = null
  private activeFigure: HTMLElement | null = null
  private renderedSignature = ''
  private candidates: TableCandidate[] = []
  private observedElements = new Set<Element>()
  private layoutDirty = true

  constructor(private readonly scrollRoot: HTMLElement) {
    this.overlay = document.createElement('div')
    this.overlay.className = STICKY_HEADER_CLASS
    this.overlay.setAttribute('aria-hidden', 'true')
    document.body.appendChild(this.overlay)

    this.scrollRoot.addEventListener('scroll', this.queueRefresh, true)
    this.scrollRoot.addEventListener('load', this.queueRebuild, true)
    window.addEventListener('resize', this.queueRebuild)

    this.mutationObserver = new MutationObserver(this.queueRebuild)
    this.mutationObserver.observe(this.scrollRoot, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    })

    this.resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(this.queueRebuild)

    this.refresh()
  }

  private readonly queueRebuild = (): void => {
    this.layoutDirty = true
    this.queueRefresh()
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
    const rebuilt = this.layoutDirty
    if (rebuilt) this.rebuildCandidates(rootRect)

    const stickyContentTop = this.scrollRoot.scrollTop
    let low = 0
    let high = this.candidates.length - 1
    let activeIndex = -1
    while (low <= high) {
      const middle = (low + high) >> 1
      if (this.candidates[middle].headerTop < stickyContentTop) {
        activeIndex = middle
        low = middle + 1
      } else {
        high = middle - 1
      }
    }

    if (activeIndex >= 0) {
      const candidate = this.candidates[activeIndex]
      if (candidate.tableBottom > stickyContentTop + candidate.headerHeight) {
        this.render(
          candidate,
          rootRect,
          candidate.figure.getBoundingClientRect(),
          candidate.table.getBoundingClientRect(),
          rebuilt
        )
        return
      }
    }

    this.hide()
  }

  private rebuildCandidates(rootRect: DOMRect): void {
    const scrollTop = this.scrollRoot.scrollTop
    const candidates: TableCandidate[] = []
    const nextObserved = new Set<Element>([this.scrollRoot])

    for (const figure of this.scrollRoot.querySelectorAll<HTMLElement>('figure.mu-table')) {
      const table = figure.querySelector<HTMLTableElement>('table.mu-table-inner')
      const headerRow = table?.rows.item(0)
      if (!table || !headerRow) continue
      const tableRect = table.getBoundingClientRect()
      const headerRect = headerRow.getBoundingClientRect()
      candidates.push({
        figure,
        table,
        headerRow,
        headerTop: headerRect.top - rootRect.top + scrollTop,
        headerHeight: headerRect.height,
        tableBottom: tableRect.bottom - rootRect.top + scrollTop
      })
      nextObserved.add(figure)
      nextObserved.add(table)
      nextObserved.add(headerRow)
    }
    candidates.sort((first, second) => first.headerTop - second.headerTop)
    this.candidates = candidates
    this.layoutDirty = false

    if (this.resizeObserver) {
      for (const element of this.observedElements) {
        if (!nextObserved.has(element)) this.resizeObserver.unobserve(element)
      }
      for (const element of nextObserved) {
        if (!this.observedElements.has(element)) this.resizeObserver.observe(element)
      }
    }
    this.observedElements = nextObserved

    if (this.activeFigure && !candidates.some(({ figure }) => figure === this.activeFigure)) {
      this.activeFigure = null
      this.renderedSignature = ''
    }
  }

  private render(
    candidate: TableCandidate,
    rootRect: DOMRect,
    figureRect: DOMRect,
    tableRect: DOMRect,
    geometryChanged: boolean
  ): void {
    const { figure, table, headerRow } = candidate
    const visibleLeft = Math.max(rootRect.left, figureRect.left, tableRect.left)
    const visibleRight = Math.min(rootRect.right, figureRect.right, tableRect.right)
    const visibleWidth = Math.max(0, visibleRight - visibleLeft)
    if (visibleWidth === 0) {
      this.hide()
      return
    }

    if (this.activeFigure !== figure || geometryChanged || !this.renderedSignature) {
      const cellWidths = Array.from(headerRow.cells, (cell) => cell.getBoundingClientRect().width)
      const tableWidth = Math.max(table.scrollWidth, tableRect.width)
      const headerStyle = getComputedStyle(headerRow.cells[0])
      const signature = [
        headerRow.textContent ?? '',
        cellWidths.join(','),
        tableWidth,
        headerStyle.fontFamily,
        headerStyle.fontSize
      ].join('|')
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
      }
      this.activeFigure = figure
      this.renderedSignature = signature
      this.overlay.style.fontFamily = headerStyle.fontFamily
      this.overlay.style.fontSize = headerStyle.fontSize
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
  }

  destroy(): void {
    if (this.frame != null) cancelAnimationFrame(this.frame)
    this.frame = null
    this.scrollRoot.removeEventListener('scroll', this.queueRefresh, true)
    this.scrollRoot.removeEventListener('load', this.queueRebuild, true)
    window.removeEventListener('resize', this.queueRebuild)
    this.mutationObserver.disconnect()
    this.resizeObserver?.disconnect()
    this.overlay.remove()
  }
}
