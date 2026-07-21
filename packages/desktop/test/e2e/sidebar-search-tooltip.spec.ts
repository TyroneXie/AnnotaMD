import { expect, test } from '@playwright/test'
import { launchElectron } from './helpers'

test('keeps the regex tooltip inside the right edge of the sidebar', async() => {
  const { app, page } = await launchElectron()
  try {
    await page.locator('.left-column ul > li').nth(1).click()
    const regexToggle = page.locator('.side-bar-search .is-regex')
    await expect(regexToggle).toBeVisible()
    await regexToggle.hover()

    await expect.poll(async() => regexToggle.evaluate((element) => {
      const tooltip = getComputedStyle(element, '::after')
      const toggleRect = element.getBoundingClientRect()
      const sidebarRect = element.closest('.right-column')?.getBoundingClientRect()
      const tooltipLeft = toggleRect.left + Number.parseFloat(tooltip.left)
      const tooltipRight = tooltipLeft + Number.parseFloat(tooltip.width)
      return {
        visibility: tooltip.visibility,
        opacity: tooltip.opacity,
        right: tooltip.right,
        whiteSpace: tooltip.whiteSpace,
        fitsInsideSidebar: Boolean(sidebarRect) &&
          tooltipLeft >= sidebarRect.left &&
          tooltipRight <= sidebarRect.right
      }
    })).toEqual({
      visibility: 'visible',
      opacity: '1',
      right: '0px',
      whiteSpace: 'nowrap',
      fitsInsideSidebar: true
    })
  } finally {
    await app.close()
  }
})
