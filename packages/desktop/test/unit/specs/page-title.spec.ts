import { describe, expect, it } from 'vitest'
import {
  extractPageMetadata,
  extractPageTitle,
  getPageMetadataFallbackRequest,
  getPageTitleFallback,
  isUsablePageTitle
} from '../../../src/main/utils/pageTitle'

describe('extractPageTitle', () => {
  it('uses and decodes the document title', () => {
    expect(extractPageTitle('<title>Research &amp; Design</title>')).toBe('Research & Design')
  })

  it('falls back to application metadata for title-less SPAs', () => {
    const html = '<meta name="apple-mobile-web-app-title" content="Dify" />'
    expect(extractPageTitle(html)).toBe('Dify')
  })

  it('prefers Open Graph metadata over application metadata', () => {
    const html = [
      '<meta name="apple-mobile-web-app-title" content="Dify" />',
      '<meta property="og:title" content="Workflow editor" />'
    ].join('')
    expect(extractPageTitle(html)).toBe('Workflow editor')
  })

  it('resolves a relative favicon against the final page URL', () => {
    const html = [
      '<title>Electron 43</title>',
      '<link rel="shortcut icon" href="/assets/favicon.ico">'
    ].join('')
    expect(extractPageMetadata(html, 'https://www.toutiao.com/article/1/')).toEqual({
      title: 'Electron 43',
      icon: 'https://www.toutiao.com/assets/favicon.ico'
    })
  })

  it('uses the public mobile page for Toutiao article metadata', () => {
    const request = getPageMetadataFallbackRequest(
      'https://www.toutiao.com/article/7662629017371165190/?share_token=test'
    )
    expect(request?.url).toBe('https://m.toutiao.com/article/7662629017371165190/')
    expect(request?.userAgent).toContain('iPhone')
    expect(getPageMetadataFallbackRequest('https://www.toutiao.com/')).toBeUndefined()
  })

  it('rejects a URL-shaped document title', () => {
    const url = 'https://www.msn.cn/zh-cn/news/example/ar-AA123?from=share'
    expect(isUsablePageTitle('msn.cn/zh-cn/news/example/ar-AA123?from=share', url)).toBe(false)
    expect(isUsablePageTitle('A useful article title', url)).toBe(true)
  })

  it('derives an MSN article title from its public URL when metadata is unusable', () => {
    expect(getPageTitleFallback(
      'https://www.msn.cn/zh-cn/news/other/%E5%88%80%E9%83%8E%E5%89%8D%E5%A6%BB/ar-AA28e7be?from=share'
    )).toBe('刀郎前妻')
    expect(getPageTitleFallback('https://www.msn.cn/')).toBe('')
  })
})
