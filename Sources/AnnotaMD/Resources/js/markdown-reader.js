(function() {
  const MR = {
    version: '2.0.0',

    scrollToHeading(id) {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('outline-highlight');
        setTimeout(() => {
          el.classList.add('fade-out');
          setTimeout(() => {
            el.classList.remove('outline-highlight', 'fade-out');
          }, 300);
        }, 1500);
      }
    },

    scrollToLine(lineNumber) {
      const target = document.querySelector(`[data-line="${lineNumber}"]`);
      if (target) {
        target.scrollIntoView({ behavior: 'auto', block: 'start' });
        window.scrollBy(0, -8);
        return true;
      }
      let closest = null;
      let minDiff = Infinity;
      document.querySelectorAll('[data-line]').forEach(el => {
        const diff = Math.abs(parseInt(el.dataset.line) - lineNumber);
        if (diff < minDiff) {
          minDiff = diff;
          closest = el;
        }
      });
      if (closest) {
        closest.scrollIntoView({ behavior: 'auto', block: 'start' });
        window.scrollBy(0, -8);
        return true;
      }
      return false;
    },

    replaceContent(html) {
      const content = document.getElementById('mr-content');
      if (content) {
        content.innerHTML = html;
        MR._searchHighlights = [];
        MR.renderMermaid();
        MR.renderPlantUML();
        MR.renderKaTeX();
        MR.renderAdmonitions();
        MR.enableResizableTables();
        MR.enableZoomableMedia();
        MR.addCopyButtons();
        if (typeof Prism !== 'undefined') {
          Prism.highlightAll();
        }
      }
    },

    getVisibleHeading() {
      const headings = document.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]');
      let visible = null;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const threshold = 100;
      for (let i = headings.length - 1; i >= 0; i--) {
        if (headings[i].getBoundingClientRect().top <= threshold) {
          visible = {
            id: headings[i].id,
            level: parseInt(headings[i].tagName.charAt(1)),
            title: headings[i].textContent.trim(),
            lineNumber: parseInt(headings[i].dataset.line || '0')
          };
          break;
        }
      }
      return visible;
    },

    getTopVisibleLine() {
      const elements = document.querySelectorAll('[data-line]');
      const threshold = 120;
      let best = null;
      let minDiff = Infinity;
      for (let i = elements.length - 1; i >= 0; i--) {
        const rect = elements[i].getBoundingClientRect();
        const diff = threshold - rect.top;
        if (diff >= 0 && diff < minDiff) {
          minDiff = diff;
          best = elements[i];
        }
      }
      if (best) {
        return parseInt(best.dataset.line) || 1;
      }
      return 1;
    },

    getScrollPosition() {
      return {
        x: window.scrollX || document.documentElement.scrollLeft,
        y: window.scrollY || document.documentElement.scrollTop
      };
    },

    // 解析承载配置的 <script> 标签。
    // app / QuickLook 通过 src 引用脚本（src*="markdown-reader.js"）；
    // HTML 导出把脚本内联（无 src），改用 data-mr-config 标记定位。
    _configEl() {
      return document.querySelector('script[data-mr-config]')
        || document.querySelector('script[src*="markdown-reader.js"]');
    },

    // 只读环境（QuickLook 预览、导出的静态 HTML）不应出现无效的标注编辑入口。
    _isReadonly() {
      const el = this._configEl();
      return !!el && (el.dataset.isQuicklook === 'true' || el.dataset.readonly === 'true');
    },

    _resolveThemeColors() {
      const scriptTag = this._configEl();
      const isDark = scriptTag ? scriptTag.dataset.isDark === 'true' : true;

      // Mermaid strips var() refs (sanitizeDirective) and khroma needs hex for adjust/darken/invert.
      const style = getComputedStyle(document.documentElement);
      const resolve = (v) => {
        if (!v || !v.startsWith('var(')) return v;
        const inner = v.slice(4, v.lastIndexOf(')')).trim();
        const name = inner.includes(',') ? inner.slice(0, inner.indexOf(',')).trim() : inner;
        let resolved = style.getPropertyValue(name).trim();
        if (resolved.startsWith('var(')) resolved = resolve(resolved);
        return resolved || v;
      };

      // Canvas fillStyle converts CSS colors to #rrggbb but drops the alpha channel.
      // For rgba() values (common in theme borders/muted text), blend with the
      // surface background first so the result matches what users see on screen.
      const toHex = (cssColor) => {
        if (!cssColor || cssColor.startsWith('#')) return cssColor;
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.fillStyle = cssColor;
        const result = ctx.fillStyle;
        // If rgba was converted to #rrggbb, alpha was lost — pre-blend it
        if (result.startsWith('#') && cssColor.includes('rgba')) {
          const match = cssColor.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
          if (match) {
            const r = parseInt(match[1]), g = parseInt(match[2]), b = parseInt(match[3]), a = parseFloat(match[4]);
            const surface = isDark ? [24, 24, 26] : [255, 255, 255];
            const blended = [
              Math.round(surface[0] * (1 - a) + r * a),
              Math.round(surface[1] * (1 - a) + g * a),
              Math.round(surface[2] * (1 - a) + b * a)
            ];
            return '#' + blended.map(c => c.toString(16).padStart(2, '0')).join('');
          }
        }
        return result;
      };

      const surface = toHex(resolve('var(--surface)'));
      const bgElevated = toHex(resolve('var(--bg-elevated)'));
      const bgSubtle = toHex(resolve('var(--bg-subtle)'));
      const border = toHex(resolve('var(--border)'));
      const ink = toHex(resolve('var(--ink)'));
      const fgMuted = toHex(resolve('var(--fg-muted)'));

      return {
        isDark,
        themeVariables: {
          background: surface,
          mainBkg: bgElevated,
          primaryColor: bgElevated,
          primaryTextColor: ink,
          primaryBorderColor: border,
          lineColor: fgMuted,
          secondaryColor: bgElevated,
          tertiaryColor: bgSubtle,
          edgeLabelBackground: surface,
          attributeBackgroundColorOdd: bgElevated,
          attributeBackgroundColorEven: bgElevated,
          attributeBorderColor: border
        }
      };
    },

    _showMermaidError(container, msg) {
      container.innerHTML = '';
      const errBox = document.createElement('div');
      errBox.className = 'mermaid-error';
      errBox.innerHTML = '<strong>Mermaid</strong> — ' + msg;
      container.appendChild(errBox);
    },

    async _encodePlantUML(text) {
      const encoder = new TextEncoder();
      const data = encoder.encode(text);

      const cs = new CompressionStream('deflate-raw');
      const writer = cs.writable.getWriter();
      writer.write(data);
      writer.close();

      const reader = cs.readable.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const compressed = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        compressed.set(chunk, offset);
        offset += chunk.length;
      }

      const map = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
      let result = '';
      for (let i = 0; i < compressed.length; i += 3) {
        const b1 = compressed[i];
        const b2 = i + 1 < compressed.length ? compressed[i + 1] : 0;
        const b3 = i + 2 < compressed.length ? compressed[i + 2] : 0;
        result += map[b1 >> 2];
        result += map[((b1 & 0x3) << 4) | (b2 >> 4)];
        result += map[((b2 & 0xF) << 2) | (b3 >> 6)];
        result += map[b3 & 0x3F];
      }
      return result;
    },

    _showPlantUMLError(container, msg) {
      container.innerHTML = '';
      const errBox = document.createElement('div');
      errBox.className = 'plantuml-error';
      errBox.innerHTML = '<strong>PlantUML</strong> — ' + msg;
      container.appendChild(errBox);
    },

    renderMermaid() {
      const mermaidBlocks = document.querySelectorAll('code.language-mermaid, pre code.language-mermaid');
      if (mermaidBlocks.length === 0) return;
      if (typeof mermaid === 'undefined') return;

      const { isDark, themeVariables } = MR._resolveThemeColors();

      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: isDark ? 'dark' : 'default',
        themeVariables
      });

      let idx = 0;
      mermaidBlocks.forEach(block => {
        const pre = block.parentElement;
        if (!pre || pre.tagName !== 'PRE') return;
        const source = block.textContent;
        const container = document.createElement('div');
        container.className = 'mermaid-container';
        container.dataset.mermaidSource = source;
        const id = 'mermaid-' + (++idx) + '-' + Math.random().toString(36).slice(2);
        mermaid.render(id, source).then(({ svg, bindFunctions }) => {
          container.innerHTML = svg;
          MR._makeZoomableMedia(container);
          if (bindFunctions) bindFunctions(container);
        }).catch(err => {
          console.error('[AnnotaMD] mermaid.render error:', err);
          const detail = (err && err.message) ? String(err.message).substring(0, 200) : String(err).substring(0, 200);
          MR._showMermaidError(container, '渲染失败：' + detail);
        });
        pre.replaceWith(container);
      });
    },

    rerenderMermaid() {
      const containers = document.querySelectorAll('.mermaid-container');
      if (containers.length === 0) return;
      if (typeof mermaid === 'undefined') return;

      const { isDark, themeVariables } = MR._resolveThemeColors();

      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: isDark ? 'dark' : 'default',
        themeVariables
      });

      containers.forEach((container, idx) => {
        const source = container.dataset.mermaidSource;
        if (!source) return;
        const id = 'mermaid-re-' + idx + '-' + Math.random().toString(36).slice(2);
        container.innerHTML = '';
        mermaid.render(id, source).then(({ svg, bindFunctions }) => {
          container.innerHTML = svg;
          MR._makeZoomableMedia(container);
          if (bindFunctions) bindFunctions(container);
        }).catch(err => {
          console.error('[AnnotaMD] mermaid rerender error:', err);
          const detail = (err && err.message) ? String(err.message).substring(0, 200) : String(err).substring(0, 200);
          MR._showMermaidError(container, '渲染失败：' + detail);
        });
      });
    },

    async _fetchPlantUMLSVG(source, serverUrl) {
      const encoded = await MR._encodePlantUML(source);
      const svgUrl = `${serverUrl}/svg/~1${encoded}`;
      const response = await fetch(svgUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (!text.trim().startsWith('<svg')) {
        throw new Error('服务器返回了无效的 SVG 内容');
      }
      return text;
    },

    _applyPlantUMLSVG(container, svgText) {
      container.innerHTML = svgText;
      const svgEl = container.querySelector('svg');
      if (svgEl) {
        svgEl.removeAttribute('width');
        svgEl.removeAttribute('height');
        svgEl.style.maxWidth = '100%';
        svgEl.style.height = 'auto';
      }
      MR._makeZoomableMedia(container);
    },

    async renderPlantUML() {
      const plantumlBlocks = document.querySelectorAll('code.language-plantuml, pre code.language-plantuml, code.language-puml, pre code.language-puml');
      if (plantumlBlocks.length === 0) return;

      const serverUrl = 'https://www.plantuml.com/plantuml';

      const tasks = Array.from(plantumlBlocks).map(block => {
        const pre = block.parentElement;
        if (!pre || pre.tagName !== 'PRE') return Promise.resolve();

        const source = block.textContent;
        const container = document.createElement('div');
        container.className = 'plantuml-container';
        container.dataset.plantumlSource = source;

        container.innerHTML = '<div class="plantuml-loading">PlantUML...</div>';
        pre.replaceWith(container);

        return MR._fetchPlantUMLSVG(source, serverUrl)
          .then(svg => { MR._applyPlantUMLSVG(container, svg); })
          .catch(err => {
            console.error('[AnnotaMD] PlantUML render error:', err);
            MR._showPlantUMLError(container, '渲染失败：' + (err.message || String(err)).substring(0, 200));
          });
      });

      await Promise.all(tasks);
    },

    async rerenderPlantUML() {
      const containers = document.querySelectorAll('.plantuml-container');
      if (containers.length === 0) return;

      const serverUrl = 'https://www.plantuml.com/plantuml';

      const tasks = Array.from(containers).map(container => {
        const source = container.dataset.plantumlSource;
        if (!source) return Promise.resolve();
        container.innerHTML = '<div class="plantuml-loading">PlantUML...</div>';

        return MR._fetchPlantUMLSVG(source, serverUrl)
          .then(svg => { MR._applyPlantUMLSVG(container, svg); })
          .catch(err => {
            console.error('[AnnotaMD] PlantUML rerender error:', err);
            MR._showPlantUMLError(container, '渲染失败：' + (err.message || String(err)).substring(0, 200));
          });
      });

      await Promise.all(tasks);
    },

    renderKaTeX() {
      const mathElements = document.querySelectorAll('code.language-math, code.language-latex, code.language-katex');
      if (mathElements.length === 0) return;
      if (typeof katex === 'undefined') return;

      mathElements.forEach(block => {
        const pre = block.parentElement;
        const isInline = !pre || pre.tagName !== 'PRE';
        const mathContent = block.textContent;

        if (isInline) {
          const span = document.createElement('span');
          span.className = 'katex-inline';
          try {
            katex.render(mathContent, span, {
              displayMode: false,
              throwOnError: false,
              output: 'html'
            });
          } catch (e) {
            span.textContent = mathContent;
          }
          block.replaceWith(span);
        } else {
          const container = document.createElement('div');
          container.className = 'katex-display';
          try {
            katex.render(mathContent, container, {
              displayMode: true,
              throwOnError: false,
              output: 'html'
            });
          } catch (e) {
            container.textContent = mathContent;
          }
          pre.replaceWith(container);
        }
      });
    },

    renderAdmonitions() {
      const blockquotes = document.querySelectorAll('blockquote');
      const types = {
        'note': { icon: 'ℹ', label: 'Note' },
        'tip': { icon: '💡', label: 'Tip' },
        'warning': { icon: '⚠', label: 'Warning' },
        'caution': { icon: '🔥', label: 'Caution' },
        'important': { icon: '❗', label: 'Important' }
      };
      blockquotes.forEach(bq => {
        const firstP = bq.querySelector('p');
        if (!firstP) return;
        const text = firstP.textContent.trim();
        for (const [type, config] of Object.entries(types)) {
          const prefix = '[' + type.charAt(0).toUpperCase() + type.slice(1) + ']';
          if (text.startsWith(prefix)) {
            bq.classList.add('admonition', 'admonition-' + type);
            const titleSpan = document.createElement('span');
            titleSpan.className = 'admonition-title';
            titleSpan.textContent = config.label;
            const rest = text.slice(prefix.length).trim();
            if (rest) {
              firstP.textContent = rest;
            } else {
              firstP.remove();
            }
            bq.insertBefore(titleSpan, bq.firstChild);
            break;
          }
        }
      });
    },

    enableZoomableMedia() {
      const root = document.getElementById('mr-content') || document;

      root.querySelectorAll('.mermaid-container, .plantuml-container').forEach(container => {
        MR._makeZoomableMedia(container);
      });

      root.querySelectorAll('img').forEach(img => {
        if (img.closest('.mr-media-viewer')) return;
        if (img.closest('.katex, #mr-critic-toolbar, #mr-critic-popover')) return;
        MR._wrapImageForZoom(img);
      });

      MR._installMediaGestureZoom();
    },

    _wrapImageForZoom(img) {
      const link = img.parentElement && img.parentElement.tagName === 'A'
        && img.parentElement.children.length === 1
        ? img.parentElement
        : null;
      const mediaNode = link || img;
      const parent = mediaNode.parentNode;
      if (!parent) return;
      if (!MR._isStandaloneImageNode(mediaNode)) return;

      const viewer = document.createElement('span');
      viewer.className = 'mr-media-viewer mr-image-viewer';
      parent.insertBefore(viewer, mediaNode);
      viewer.appendChild(mediaNode);
      MR._makeZoomableMedia(viewer);
    },

    _isStandaloneImageNode(mediaNode) {
      if (!mediaNode || !mediaNode.parentNode) return false;
      if (mediaNode.closest && mediaNode.closest('table, pre, code, h1, h2, h3, h4, h5, h6, #mr-critic-toolbar, #mr-critic-popover')) {
        return false;
      }

      const parent = mediaNode.parentNode;
      const parentEl = parent.nodeType === Node.ELEMENT_NODE ? parent : null;
      if (!parentEl) return false;

      if (parentEl.matches && parentEl.matches('p, figure')) {
        return Array.from(parentEl.childNodes).every(node => {
          if (node === mediaNode) return true;
          if (node.nodeType === Node.TEXT_NODE) return !node.textContent.trim();
          if (node.nodeType !== Node.ELEMENT_NODE) return true;
          if (node.tagName === 'BR') return true;
          return false;
        });
      }

      return parentEl.id === 'mr-content' || parentEl.classList.contains('markdown-preview');
    },

    _makeZoomableMedia(host) {
      if (!host) return;
      const existingViewport = Array.from(host.children).find(el => el.classList && el.classList.contains('mr-media-viewport'));
      if (host.dataset.mrZoomable === 'true' && existingViewport) return;
      delete host.dataset.mrZoomable;

      const movableNodes = Array.from(host.childNodes).filter(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          return !node.classList.contains('mr-media-toolbar')
            && !node.classList.contains('mr-media-viewport')
            && !node.classList.contains('mermaid-error')
            && !node.classList.contains('plantuml-error')
            && !node.classList.contains('plantuml-loading');
        }
        return node.textContent && node.textContent.trim();
      });

      const hasMedia = movableNodes.some(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        if (node.matches('img, svg')) return true;
        return !!node.querySelector('img, svg');
      });
      if (!hasMedia) return;

      const toolbar = document.createElement('div');
      toolbar.className = 'mr-media-toolbar';

      const viewport = document.createElement('div');
      viewport.className = 'mr-media-viewport';

      const content = document.createElement('div');
      content.className = 'mr-media-content';
      movableNodes.forEach(node => content.appendChild(node));
      viewport.appendChild(content);
      MR._prepareZoomableMediaContent(host, content);

      const minus = MR._mediaZoomButton('-', 'Zoom out', () => MR._changeMediaZoom(host, -0.25));
      const label = document.createElement('span');
      label.className = 'mr-media-zoom-label';
      label.textContent = '100%';
      const plus = MR._mediaZoomButton('+', 'Zoom in', () => MR._changeMediaZoom(host, 0.25));
      const reset = MR._mediaZoomButton('1:1', 'Reset zoom', () => MR._setMediaZoom(host, 1));

      toolbar.appendChild(minus);
      toolbar.appendChild(label);
      toolbar.appendChild(plus);
      toolbar.appendChild(reset);

      host.classList.add('mr-media-viewer');
      host.dataset.mrZoomable = 'true';
      host.appendChild(toolbar);
      host.appendChild(viewport);
      host.dataset.mrBaseScale = String(MR._defaultMediaBaseScale(host, content, viewport));
      MR._setMediaZoom(host, Number.parseFloat(host.dataset.mrScale || '1') || 1);
      requestAnimationFrame(() => MR._refreshMediaZoom(host));
      setTimeout(() => MR._refreshMediaZoom(host), 120);
    },

    _installMediaGestureZoom() {
      if (MR._mediaGestureZoomInstalled) return;
      MR._mediaGestureZoomInstalled = true;

      const listenerOptions = { passive: false, capture: true };

      document.addEventListener('wheel', event => {
        if (!event.ctrlKey) return;
        const host = MR._mediaHostFromEvent(event);
        if (!host) return;

        event.preventDefault();
        event.stopPropagation();
        const now = performance.now();
        if (MR._lastNativeMediaMagnifyAt && now - MR._lastNativeMediaMagnifyAt < 80) return;
        MR._lastDomMediaPinchAt = now;
        MR._zoomMediaFromWheel(host, event.deltaY, event.deltaMode);
      }, listenerOptions);

      document.addEventListener('gesturestart', event => {
        const host = MR._mediaHostFromEvent(event);
        if (!host) return;

        event.preventDefault();
        event.stopPropagation();
        const now = performance.now();
        if (MR._lastNativeMediaMagnifyAt && now - MR._lastNativeMediaMagnifyAt < 80) return;
        host.dataset.mrGestureStartScale = host.dataset.mrScale || '1';
        MR._lastDomMediaPinchAt = now;
      }, listenerOptions);

      document.addEventListener('gesturechange', event => {
        const host = MR._mediaHostFromEvent(event);
        if (!host) return;

        event.preventDefault();
        event.stopPropagation();
        const now = performance.now();
        if (MR._lastNativeMediaMagnifyAt && now - MR._lastNativeMediaMagnifyAt < 80) return;
        const start = Number.parseFloat(host.dataset.mrGestureStartScale || host.dataset.mrScale || '1') || 1;
        const gestureScale = Number.parseFloat(event.scale || '1') || 1;
        MR._setMediaZoom(host, start * gestureScale);
        MR._lastDomMediaPinchAt = now;
      }, listenerOptions);

      document.addEventListener('gestureend', event => {
        const host = MR._mediaHostFromEvent(event);
        if (!host) return;

        event.preventDefault();
        event.stopPropagation();
        const now = performance.now();
        if (MR._lastNativeMediaMagnifyAt && now - MR._lastNativeMediaMagnifyAt < 80) return;
        delete host.dataset.mrGestureStartScale;
        MR._lastDomMediaPinchAt = now;
      }, listenerOptions);
    },

    _mediaHostFromEvent(event) {
      const target = event && event.target && event.target.nodeType === Node.ELEMENT_NODE
        ? event.target
        : event && event.target && event.target.parentElement;
      if (!target || !target.closest) return null;
      return target.closest('.mr-media-viewer[data-mr-zoomable="true"]');
    },

    _mediaHostFromPoint(clientX, clientY) {
      const x = Number(clientX);
      const y = Number(clientY);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      const el = document.elementFromPoint(x, y);
      if (!el || !el.closest) return null;
      return el.closest('.mr-media-viewer[data-mr-zoomable="true"]');
    },

    handleNativeMediaMagnify(clientX, clientY, magnification) {
      const host = MR._mediaHostFromPoint(clientX, clientY);
      if (!host) return false;

      const now = performance.now();
      if (MR._lastDomMediaPinchAt && now - MR._lastDomMediaPinchAt < 80) {
        return true;
      }

      const delta = Number(magnification);
      if (!Number.isFinite(delta) || Math.abs(delta) < 0.0005) return true;
      const clamped = Math.max(-0.35, Math.min(0.35, delta));
      MR._lastNativeMediaMagnifyAt = now;
      MR._zoomMediaByFactor(host, Math.exp(clamped * 1.8));
      return true;
    },

    _zoomMediaFromWheel(host, deltaY, deltaMode) {
      const rawDelta = Number(deltaY);
      if (!Number.isFinite(rawDelta) || Math.abs(rawDelta) < 0.01) return;
      const mode = Number(deltaMode) || 0;
      const pixelDelta = mode === 1 ? rawDelta * 16 : mode === 2 ? rawDelta * window.innerHeight : rawDelta;
      const clamped = Math.max(-80, Math.min(80, pixelDelta));
      MR._zoomMediaByFactor(host, Math.exp(-clamped * 0.006));
    },

    _zoomMediaByFactor(host, factor) {
      const current = Number.parseFloat(host.dataset.mrScale || '1') || 1;
      const nextFactor = Number(factor);
      if (!Number.isFinite(nextFactor) || nextFactor <= 0) return;
      MR._setMediaZoom(host, current * nextFactor);
    },

    _refreshMediaZoom(host) {
      if (!host || host.dataset.mrZoomable !== 'true') return;
      MR._setMediaZoom(host, Number.parseFloat(host.dataset.mrScale || '1') || 1);
    },

    _refreshAllMediaZoom() {
      document.querySelectorAll('.mr-media-viewer[data-mr-zoomable="true"]').forEach(host => {
        MR._refreshMediaZoom(host);
      });
    },

    _defaultMediaBaseScale(host, content, viewport) {
      const contentWidth = MR._mediaIntrinsicWidth(content);
      const viewportWidth = MR._mediaViewportWidth(host, viewport);
      if (!Number.isFinite(contentWidth) || contentWidth <= 0 || !Number.isFinite(viewportWidth) || viewportWidth <= 0) {
        return 1;
      }

      const fitScale = viewportWidth / contentWidth;
      const safeFitScale = Math.floor(fitScale * 100) / 100;
      return Math.max(0.01, Math.min(8, safeFitScale || 1));
    },

    _mediaViewportWidth(host, viewport) {
      const rectWidth = viewport?.getBoundingClientRect?.().width
        || host.getBoundingClientRect?.().width
        || host.parentElement?.getBoundingClientRect?.().width
        || document.getElementById('mr-content')?.getBoundingClientRect?.().width
        || window.innerWidth;
      return Math.max(1, Math.floor(rectWidth || 1));
    },

    _mediaIntrinsicWidth(content) {
      if (!content) return 0;
      const img = content.querySelector('img');
      if (img) {
        const attrWidth = Number.parseFloat(img.getAttribute('width') || '');
        return img.naturalWidth || attrWidth || img.getBoundingClientRect().width || img.scrollWidth || 0;
      }

      const svg = content.querySelector('svg');
      if (svg) {
        const attrWidth = Number.parseFloat(svg.getAttribute('width') || '');
        const viewBoxWidth = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal.width : 0;
        const rectWidth = svg.getBoundingClientRect().width || svg.scrollWidth || 0;
        return viewBoxWidth || attrWidth || rectWidth || 0;
      }

      return content.scrollWidth || content.getBoundingClientRect().width || 0;
    },

    _prepareZoomableMediaContent(host, content) {
      const isDiagram = host.classList.contains('mermaid-container') || host.classList.contains('plantuml-container');
      if (!isDiagram) return;
      content.querySelectorAll('svg').forEach(svg => {
        const viewBoxWidth = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal.width : 0;
        const widthAttr = svg.getAttribute('width') || '';
        svg.style.maxWidth = 'none';
        svg.style.height = 'auto';
        if (viewBoxWidth > 0 && (!widthAttr || widthAttr.includes('%'))) {
          svg.style.width = viewBoxWidth + 'px';
        }
      });
    },

    _mediaZoomButton(label, title, handler) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.title = title;
      button.setAttribute('aria-label', title);
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        handler();
      });
      return button;
    },

    _changeMediaZoom(host, delta) {
      const current = Number.parseFloat(host.dataset.mrScale || '1') || 1;
      MR._setMediaZoom(host, current + delta);
    },

    _setMediaZoom(host, scale) {
      const next = Math.max(0.25, Math.min(8, Math.round(scale * 100) / 100));
      const content = host.querySelector('.mr-media-content');
      const viewport = host.querySelector('.mr-media-viewport');
      const baseScale = MR._defaultMediaBaseScale(host, content, viewport);
      const actualScale = Math.round(baseScale * next * 100) / 100;
      host.dataset.mrScale = String(next);
      host.dataset.mrBaseScale = String(baseScale);
      const label = host.querySelector('.mr-media-zoom-label');
      if (content) {
        content.style.zoom = String(actualScale);
      }
      if (label) {
        label.textContent = Math.round(next * 100) + '%';
      }
      host.classList.toggle('mr-media-zoomed', Math.abs(next - 1) > 0.01);
    },

    enableResizableTables() {
      const root = document.getElementById('mr-content') || document;
      root.querySelectorAll('table').forEach(table => {
        if (table.closest('.katex')) return;
        const row = table.tHead && table.tHead.rows.length ? table.tHead.rows[0] : table.rows[0];
        if (!row || row.cells.length < 2) return;

        if (!table.parentElement || !table.parentElement.classList.contains('mr-table-wrap')) {
          const wrap = document.createElement('div');
          wrap.className = 'mr-table-wrap';
          table.parentNode.insertBefore(wrap, table);
          wrap.appendChild(table);
        }

        if (table.dataset.mrResizable === 'true') return;
        table.dataset.mrResizable = 'true';
        MR._installTableColumns(table, row);
        table.classList.add('mr-resizable-table');
        MR._installTableResizeHandles(table, row);
      });
    },

    _installTableColumns(table, row) {
      const cells = Array.from(row.cells);
      const oldColgroup = Array.from(table.children).find(el =>
        el.tagName === 'COLGROUP' && el.dataset.mrColgroup === 'true'
      );
      if (oldColgroup) oldColgroup.remove();

      const wrap = table.parentElement && table.parentElement.classList.contains('mr-table-wrap')
        ? table.parentElement
        : null;
      const wrapRect = wrap ? wrap.getBoundingClientRect() : null;
      const targetWidth = Math.max(
        1,
        Math.floor((wrapRect && wrapRect.width) || table.parentElement?.getBoundingClientRect().width || table.getBoundingClientRect().width || 1)
      );

      const previousStyle = {
        display: table.style.display,
        width: table.style.width,
        minWidth: table.style.minWidth,
        maxWidth: table.style.maxWidth,
        tableLayout: table.style.tableLayout,
        overflowX: table.style.overflowX,
        overflowY: table.style.overflowY
      };
      table.style.display = 'table';
      table.style.width = 'max-content';
      table.style.minWidth = '0px';
      table.style.maxWidth = 'none';
      table.style.tableLayout = 'auto';
      table.style.overflowX = 'visible';
      table.style.overflowY = 'visible';

      const rows = Array.from(table.rows);
      const columnCount = cells.length;
      const naturalWidths = Array.from({ length: columnCount }, (_, columnIndex) => {
        let width = 64;
        rows.forEach(rowEl => {
          const cell = rowEl.cells[columnIndex];
          if (!cell) return;
          width = Math.max(
            width,
            Math.ceil(cell.getBoundingClientRect().width || 0),
            Math.ceil(cell.scrollWidth || 0)
          );
        });
        return Math.max(64, width);
      });
      const widths = MR._fitTableColumnWidths(
        MR._capDefaultTableColumnWidths(naturalWidths, targetWidth),
        targetWidth
      );

      table.style.display = previousStyle.display;
      table.style.width = previousStyle.width;
      table.style.minWidth = previousStyle.minWidth;
      table.style.maxWidth = previousStyle.maxWidth;
      table.style.tableLayout = previousStyle.tableLayout;
      table.style.overflowX = previousStyle.overflowX;
      table.style.overflowY = previousStyle.overflowY;

      const colgroup = document.createElement('colgroup');
      colgroup.dataset.mrColgroup = 'true';
      widths.forEach(width => {
        const col = document.createElement('col');
        col.style.width = (width / targetWidth * 100) + '%';
        colgroup.appendChild(col);
      });
      table.insertBefore(colgroup, table.firstChild);

      table.style.width = '100%';
      table.style.minWidth = '100%';
      table.style.maxWidth = '100%';
      table.style.tableLayout = 'fixed';
      MR._syncTableOverflowState(table);
    },

    _capDefaultTableColumnWidths(widths, targetWidth) {
      const count = widths.length;
      if (count === 0) return widths;

      const safeTarget = Math.max(1, Math.floor(targetWidth || 1));
      const evenWidth = safeTarget / count;
      const maxShare = count === 2 ? 0.82 : count === 3 ? 0.58 : 0.46;
      const maxWidth = Math.max(evenWidth * 1.45, safeTarget * maxShare);
      const minWeight = count === 2
        ? Math.max(96, Math.min(safeTarget * 0.18, safeTarget * 0.42))
        : Math.max(64, Math.min(140, evenWidth * 0.55));

      return widths.map(width => Math.max(minWeight, Math.min(width, maxWidth)));
    },

    _fitTableColumnWidths(widths, targetWidth) {
      const count = widths.length;
      const safeTarget = Math.max(1, Math.floor(targetWidth || 1));
      if (count === 0) return [];

      const total = widths.reduce((sum, width) => sum + Math.max(1, width), 0);
      if (total <= 0) {
        const even = Math.max(1, Math.floor(safeTarget / count));
        return Array.from({ length: count }, () => even);
      }

      let minWidth = 48;
      if (safeTarget < minWidth * count) {
        minWidth = Math.max(1, safeTarget / count);
      }

      let fitted = widths.map(width => Math.max(minWidth, (Math.max(1, width) / total) * safeTarget));

      for (let attempt = 0; attempt < 4; attempt += 1) {
        const fittedTotal = fitted.reduce((sum, width) => sum + width, 0);
        const excess = fittedTotal - safeTarget;
        if (excess <= 0.5) break;
        const shrinkable = fitted
          .map((width, index) => ({ width, index, room: width - minWidth }))
          .filter(item => item.room > 0.5);
        const roomTotal = shrinkable.reduce((sum, item) => sum + item.room, 0);
        if (roomTotal <= 0) break;
        shrinkable.forEach(item => {
          fitted[item.index] = Math.max(minWidth, item.width - excess * (item.room / roomTotal));
        });
      }

      const rounded = fitted.map(width => Math.max(1, Math.round(width)));
      const order = Array.from({ length: count }, (_, index) => index)
        .sort((a, b) => rounded[b] - rounded[a]);
      let delta = safeTarget - rounded.reduce((sum, width) => sum + width, 0);
      while (delta !== 0 && order.length > 0) {
        let changed = false;
        for (const index of order) {
          if (delta === 0) break;
          if (delta > 0) {
            rounded[index] += 1;
            delta -= 1;
            changed = true;
          } else if (rounded[index] > 1) {
            rounded[index] -= 1;
            delta += 1;
            changed = true;
          }
        }
        if (!changed) break;
      }
      return rounded;
    },

    _installTableResizeHandles(table, row) {
      Array.from(row.cells).forEach((cell, index) => {
        const hasHandle = Array.from(cell.children).some(el =>
          el.classList && el.classList.contains('mr-col-resizer')
        );
        if (hasHandle) return;
        cell.classList.add('mr-resizable-cell');

        const handle = document.createElement('span');
        handle.className = 'mr-col-resizer';
        handle.title = 'Drag to resize column';
        handle.setAttribute('aria-hidden', 'true');

        const startResize = event => MR._startTableColumnResize(event, table, index);
        handle.addEventListener('mousedown', startResize);
        handle.addEventListener('touchstart', startResize, { passive: false });
        cell.appendChild(handle);
      });
    },

    _tableColumns(table) {
      const colgroup = Array.from(table.children).find(el =>
        el.tagName === 'COLGROUP' && el.dataset.mrColgroup === 'true'
      );
      return colgroup ? Array.from(colgroup.children).filter(el => el.tagName === 'COL') : [];
    },

    _columnWidth(col) {
      const width = parseFloat(col.style.width);
      if (Number.isFinite(width) && col.style.width.includes('px')) return width;
      const rectWidth = col.getBoundingClientRect ? col.getBoundingClientRect().width : 0;
      return rectWidth > 0 ? rectWidth : 64;
    },

    _setTableWidthFromColumns(table) {
      const total = MR._tableColumns(table).reduce((sum, col) => sum + MR._columnWidth(col), 0);
      const wrap = table.parentElement && table.parentElement.classList.contains('mr-table-wrap')
        ? table.parentElement
        : null;
      const wrapWidth = Math.floor((wrap && wrap.getBoundingClientRect().width) || 0);
      if (total > 0) {
        table.style.width = Math.max(Math.round(total), wrapWidth) + 'px';
        table.style.minWidth = '100%';
        table.style.maxWidth = 'none';
      }
      MR._syncTableOverflowState(table);
    },

    _syncTableOverflowState(table) {
      const wrap = table.parentElement && table.parentElement.classList.contains('mr-table-wrap')
        ? table.parentElement
        : null;
      if (!wrap) return;
      window.requestAnimationFrame(() => {
        const overflowed = table.getBoundingClientRect().width > wrap.clientWidth + 1;
        wrap.classList.toggle('mr-table-overflow', overflowed);
      });
    },

    _freezeTableColumnsToPixels(table) {
      const columns = MR._tableColumns(table);
      const row = table.tHead && table.tHead.rows.length ? table.tHead.rows[0] : table.rows[0];
      if (!row) return columns;
      columns.forEach((col, index) => {
        const cell = row.cells[index];
        const width = cell ? cell.getBoundingClientRect().width : MR._columnWidth(col);
        col.style.width = Math.max(1, Math.round(width)) + 'px';
      });
      MR._setTableWidthFromColumns(table);
      return columns;
    },

    _eventClientX(event) {
      if (event.touches && event.touches.length) return event.touches[0].clientX;
      if (event.changedTouches && event.changedTouches.length) return event.changedTouches[0].clientX;
      return Number.isFinite(event.clientX) ? event.clientX : null;
    },

    _startTableColumnResize(event, table, columnIndex) {
      if (event.type === 'mousedown' && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      let columns = MR._freezeTableColumnsToPixels(table);
      const col = columns[columnIndex];
      const startX = MR._eventClientX(event);
      if (!col || startX === null) return;

      const startWidth = col.getBoundingClientRect().width || MR._columnWidth(col);
      const minWidth = 48;

      if (MR._hideCriticToolbar) MR._hideCriticToolbar();
      if (MR._hideCommentPopover) MR._hideCommentPopover();
      window.getSelection()?.removeAllRanges();
      table.classList.add('mr-table-resizing');
      table.classList.add('mr-table-fixed');
      table.style.tableLayout = 'fixed';
      table.style.maxWidth = 'none';
      document.body.classList.add('mr-resizing-table');

      const onMove = moveEvent => {
        moveEvent.preventDefault();
        const clientX = MR._eventClientX(moveEvent);
        if (clientX === null) return;
        const nextWidth = Math.max(minWidth, Math.round(startWidth + clientX - startX));
        col.style.width = nextWidth + 'px';
        table.style.minWidth = '0px';
        MR._setTableWidthFromColumns(table);
      };

      const onEnd = () => {
        table.classList.remove('mr-table-resizing');
        document.body.classList.remove('mr-resizing-table');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
        document.removeEventListener('touchcancel', onEnd);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
      document.addEventListener('touchcancel', onEnd);
    },

    addCopyButtons() {
      const preBlocks = document.querySelectorAll('pre');
      preBlocks.forEach(pre => {
        MR._addCodeLanguageLabel(pre);
        if (pre.querySelector('.mr-copy-btn')) return;
        pre.style.position = 'relative';

        const btn = document.createElement('button');
        btn.className = 'mr-copy-btn';
        btn.type = 'button';
        btn.title = 'Copy';
        btn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11V3a1.5 1.5 0 0 1 1.5-1.5H11"/></svg>';

        btn.addEventListener('click', function() {
          const code = pre.querySelector('code');
          const text = code ? code.textContent : pre.textContent;
          navigator.clipboard.writeText(text).then(() => {
            btn.classList.add('mr-copy-btn-copied');
            btn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3.5 8.5 6.5 11.5 12.5 5.5"/></svg>';
            setTimeout(() => {
              btn.classList.remove('mr-copy-btn-copied');
              btn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11V3a1.5 1.5 0 0 1 1.5-1.5H11"/></svg>';
            }, 2000);
          }).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            btn.classList.add('mr-copy-btn-copied');
            btn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3.5 8.5 6.5 11.5 12.5 5.5"/></svg>';
            setTimeout(() => {
              btn.classList.remove('mr-copy-btn-copied');
              btn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11V3a1.5 1.5 0 0 1 1.5-1.5H11"/></svg>';
            }, 2000);
          });
        });

        pre.appendChild(btn);
      });
    },

    _addCodeLanguageLabel(pre) {
      if (pre.querySelector('.mr-code-lang-label')) return;
      const rawLanguage = MR._codeLanguageForPre(pre);
      if (!rawLanguage) return;
      pre.classList.add('mr-code-with-language');
      const label = document.createElement('span');
      label.className = 'mr-code-lang-label';
      label.textContent = MR._displayCodeLanguage(rawLanguage);
      pre.appendChild(label);
    },

    _codeLanguageForPre(pre) {
      const code = pre.querySelector('code');
      if (!code || !code.classList) return '';
      for (const className of code.classList) {
        if (className.startsWith('language-')) {
          const language = className.slice('language-'.length).trim();
          if (language && language !== 'none' && language !== 'plaintext' && language !== 'text') {
            return language;
          }
        }
      }
      return '';
    },

    _displayCodeLanguage(language) {
      const normalized = String(language || '').trim();
      const key = normalized.toLowerCase();
      const aliases = {
        bash: 'Bash',
        c: 'C',
        cpp: 'C++',
        'c++': 'C++',
        csharp: 'C#',
        cs: 'C#',
        css: 'CSS',
        diff: 'Diff',
        dockerfile: 'Dockerfile',
        go: 'Go',
        graphql: 'GraphQL',
        html: 'HTML',
        java: 'Java',
        javascript: 'JavaScript',
        js: 'JavaScript',
        json: 'JSON',
        jsx: 'JSX',
        kotlin: 'Kotlin',
        kt: 'Kotlin',
        latex: 'LaTeX',
        markdown: 'Markdown',
        md: 'Markdown',
        mermaid: 'Mermaid',
        objectivec: 'Objective-C',
        objc: 'Objective-C',
        php: 'PHP',
        plantuml: 'PlantUML',
        puml: 'PlantUML',
        python: 'Python',
        py: 'Python',
        ruby: 'Ruby',
        rb: 'Ruby',
        rust: 'Rust',
        rs: 'Rust',
        shell: 'Shell',
        sh: 'Shell',
        sql: 'SQL',
        swift: 'Swift',
        toml: 'TOML',
        ts: 'TypeScript',
        tsx: 'TSX',
        typescript: 'TypeScript',
        xml: 'XML',
        yaml: 'YAML',
        yml: 'YAML'
      };
      return aliases[key] || normalized;
    },

    _searchHighlights: [],

    highlightSearch(query, caseSensitive, wholeWord, currentIndex) {
      MR.clearSearchHighlight();
      if (!query) return 0;

      const content = document.getElementById('mr-content');
      if (!content) return 0;

      const flags = caseSensitive ? 'g' : 'gi';
      let pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (wholeWord) pattern = '\\b' + pattern + '\\b';

      let regex;
      try {
        regex = new RegExp(pattern, flags);
      } catch (e) {
        return 0;
      }

      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null);
      const textNodes = [];
      while (walker.nextNode()) {
        textNodes.push(walker.currentNode);
      }

      const allMatches = [];

      textNodes.forEach(node => {
        const text = node.textContent;
        let match;
        while ((match = regex.exec(text)) !== null) {
          allMatches.push({
            node: node,
            index: match.index,
            length: match[0].length
          });
        }
      });

      // Sort by document position in REVERSE order for safe insertion.
      // Processing from end to start prevents surroundContents from
      // splitting text nodes and invalidating later match offsets.
      const sortedAllMatches = allMatches.slice().sort((a, b) => {
        const cmp = a.node.compareDocumentPosition(b.node);
        if (cmp & Node.DOCUMENT_POSITION_FOLLOWING) return 1;  // b comes first → process b before a
        if (cmp & Node.DOCUMENT_POSITION_PRECEDING) return -1; // a comes first → process a before b
        return b.index - a.index; // same node: higher index first
      });

      // Collect mark elements in document order for indexing
      const markElements = [];

      // Use Range API to wrap matches in <mark> elements
      for (const m of sortedAllMatches) {
        const range = document.createRange();
        try {
          range.setStart(m.node, m.index);
          range.setEnd(m.node, m.index + m.length);
        } catch (e) {
          continue;
        }

        const mark = document.createElement('mark');
        mark.className = 'mr-search-highlight';

        try {
          range.surroundContents(mark);
          markElements.unshift(mark); // prepend to maintain document order
        } catch (e) {
          // surroundContents fails when range crosses element boundaries — skip
          continue;
        }
      }

      // Assign sequential indices in document order
      markElements.forEach((mark, i) => {
        mark.dataset.searchIndex = i;
      });
      MR._searchHighlights = markElements;

      const matchCount = markElements.length;

      // Highlight current match
      if (currentIndex >= 0 && currentIndex < matchCount) {
        const currentMark = content.querySelector(`mark[data-search-index="${currentIndex}"]`);
        if (currentMark) {
          currentMark.classList.add('mr-search-current');
          currentMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }

      return matchCount;
    },

    setSearchCurrent(currentIndex) {
      const content = document.getElementById('mr-content');
      if (!content) return;
      const prev = content.querySelector('.mr-search-current');
      if (prev) prev.classList.remove('mr-search-current');
      if (currentIndex >= 0) {
        const mark = content.querySelector(`mark[data-search-index="${currentIndex}"]`);
        if (mark) {
          mark.classList.add('mr-search-current');
          mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    },

    clearSearchHighlight() {
      for (const mark of MR._searchHighlights) {
        const parent = mark.parentNode;
        if (parent) {
          while (mark.firstChild) {
            parent.insertBefore(mark.firstChild, mark);
          }
          parent.removeChild(mark);
          parent.normalize();
        }
      }
      MR._searchHighlights = [];
    },

    // ===== CriticMarkup 选词标注 =====

    criticLabels: {
      delete: 'Delete', highlight: 'Highlight', comment: 'Comment', replace: 'Replace',
      confirm: 'Apply', cancel: 'Cancel', edit: 'Edit',
      commentHint: 'Add a comment…', replaceHint: 'Replace with…',
      notFound: 'Could not locate the selection in the source'
    },

    // 定位失败时的轻提示（避免「静默无反应」）
    flashCriticError(msg) {
      const text = msg || (MR.criticLabels && MR.criticLabels.notFound) || 'Could not locate the selection';
      let el = document.getElementById('mr-critic-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'mr-critic-toast';
        document.body.appendChild(el);
      }
      el.textContent = text;
      el.classList.add('visible');
      clearTimeout(MR._criticToastTimer);
      MR._criticToastTimer = setTimeout(function() { el.classList.remove('visible'); }, 2200);
    },

    setCriticLabels(labels) {
      if (labels && typeof labels === 'object') {
        MR.criticLabels = Object.assign({}, MR.criticLabels, labels);
      }
    },

    // 用 CSS Custom Highlight API 给「正在标注」的选区上一层持久高亮。
    // 仅在进入评论/替换输入态（原生选区即将因聚焦输入框而消失）时设置；
    // 普通选词阶段原生选区本身可见，叠加高亮反而会触发 WebKit 的残留重绘 bug。
    _setPendingHighlight(range) {
      try {
        if (!window.CSS || !CSS.highlights || typeof Highlight === 'undefined' || !range) return;
        MR._clearPendingHighlight();
        const cloned = range.cloneRange();
        MR._pendingHighlightRange = cloned;
        CSS.highlights.set('critic-pending', new Highlight(cloned));
      } catch (e) { /* no-op */ }
    },

    _clearPendingHighlight() {
      try {
        if (window.CSS && CSS.highlights) {
          // WebKit 偶发 bug：直接从注册表 delete 后，选区首尾字符的高亮不重绘
          // （切换窗口焦点强制全量重绘才消失）。先 clear() 范围再 delete，
          // 并轻触一个 paint-only 属性强制该块重绘。
          const hl = CSS.highlights.get('critic-pending');
          if (hl && typeof hl.clear === 'function') hl.clear();
          CSS.highlights.delete('critic-pending');
        }
        const r = MR._pendingHighlightRange;
        MR._pendingHighlightRange = null;
        if (r) {
          let el = r.commonAncestorContainer;
          if (el && el.nodeType === 3) el = el.parentElement;
          if (el && el.style) {
            el.style.webkitTextFillColor = 'currentcolor';
            requestAnimationFrame(() => { el.style.webkitTextFillColor = ''; });
          }
        }
      } catch (e) { /* no-op */ }
    },

    // 评论草稿：按「位置（行号 + 选中文本）」暂存未提交的评论，重新对同一处选词写评论时自动恢复，
    // 防止误触 Dismiss 丢失刚开始写的内容（issue #7，对应 issue 中的方案 3.3）。
    _criticDraftKey(p) {
      if (!p) return null;
      const occurrence = p.locator && Number.isFinite(p.locator.occurrence) ? p.locator.occurrence : '';
      return String(p.line || 0) + '\u0001' + occurrence + '\u0001' + (p.text || '');
    },

    // 把当前评论输入框的内容存为草稿（仅在输入态、且内容非空时）。
    _saveCriticDraft() {
      const bar = document.getElementById('mr-critic-toolbar');
      if (!bar || !bar.classList.contains('critic-input-mode')) return;
      const field = bar.querySelector('.critic-field');
      const key = MR._criticInputDraftKey;
      if (field && key && field.value.trim()) {
        MR._criticDrafts = MR._criticDrafts || {};
        MR._criticDrafts[key] = field.value;
      }
    },

    // 折叠评论中的连续空行：连续 2+ 换行 → 单个换行，并去掉首尾空白行（issue #6）
    _collapseBlankLines(s) {
      if (typeof s !== 'string') return s;
      return s.replace(/[ \t]*\r?\n(?:[ \t]*\r?\n)+/g, '\n').replace(/^\s+|\s+$/g, '');
    },

    _postCriticAction(op, text, line, payload, locator) {
      try {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.criticAction) {
          window.webkit.messageHandlers.criticAction.postMessage({
            op: op, text: text, line: line, payload: payload || null, locator: locator || null
          });
        }
      } catch (e) { /* no-op */ }
    },

    _postMarkdownEditAction(op, text, line, locator) {
      try {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.markdownEditAction) {
          window.webkit.messageHandlers.markdownEditAction.postMessage({
            op: op, text: text, line: line, locator: locator || null
          });
        }
      } catch (e) { /* no-op */ }
    },

    _postMarkdownBlockAction(op, line, level) {
      try {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.markdownBlockAction) {
          window.webkit.messageHandlers.markdownBlockAction.postMessage({
            op: op,
            line: line || 0,
            level: Number.isFinite(level) ? level : null
          });
        }
      } catch (e) { /* no-op */ }
    },

    _postEditRequest(line) {
      try {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.editRequest) {
          window.webkit.messageHandlers.editRequest.postMessage({ line: line || 0 });
        }
      } catch (e) { /* no-op */ }
    },

    _countTextOccurrences(haystack, needle) {
      if (!haystack || !needle) return 0;
      let count = 0;
      const step = Math.max(needle.length, 1);
      for (let index = haystack.indexOf(needle); index !== -1; index = haystack.indexOf(needle, index + step)) {
        count += 1;
      }
      return count;
    },

    _criticLineElementFor(node) {
      let el = (node && node.nodeType === 3) ? node.parentElement : node;
      while (el && el !== document.body) {
        if (el.dataset && el.dataset.line) return el;
        el = el.parentElement;
      }
      return null;
    },

    _criticTextBefore(root, range) {
      const r = document.createRange();
      r.selectNodeContents(root);
      r.setEnd(range.startContainer, range.startOffset);
      return r.toString();
    },

    _criticTextAfter(root, range) {
      const r = document.createRange();
      r.selectNodeContents(root);
      r.setStart(range.endContainer, range.endOffset);
      return r.toString();
    },

    _criticLocatorFor(range, text) {
      try {
        const content = document.getElementById('mr-content');
        if (!content || !range || !text) return null;
        const beforeAll = MR._criticTextBefore(content, range);
        const lineEl = MR._criticLineElementFor(range.startContainer);
        const contextRoot = lineEl && lineEl.contains(range.endContainer) ? lineEl : content;
        return {
          occurrence: MR._countTextOccurrences(beforeAll, text),
          prefix: MR._criticTextBefore(contextRoot, range).slice(-160),
          suffix: MR._criticTextAfter(contextRoot, range).slice(0, 160)
        };
      } catch (e) {
        return null;
      }
    },

    _criticLineFor(node) {
      const el = MR._criticLineElementFor(node);
      return el ? (parseInt(el.dataset.line) || 0) : 0;
    },

    _lineForEventTarget(target) {
      const el = MR._criticLineElementFor(target);
      return el ? (parseInt(el.dataset.line) || 0) : MR.getTopVisibleLine();
    },

    _blockElementFor(target) {
      let el = target && target.nodeType === 3 ? target.parentElement : target;
      while (el && el !== document.body) {
        if (el.matches && el.matches('p, h1, h2, h3, h4, h5, h6')) {
          if (el.closest('li, blockquote, table, pre, .admonition, .katex-display, #mr-critic-toolbar, #mr-critic-popover')) {
            return null;
          }
          return el.dataset && el.dataset.line ? el : null;
        }
        el = el.parentElement;
      }
      return null;
    },

    _blockLevelFor(block) {
      if (!block || !block.tagName) return null;
      if (/^H[1-6]$/.test(block.tagName)) return parseInt(block.tagName.slice(1));
      if (block.tagName === 'P') return 0;
      return null;
    },

    _selectionPayloadFromWindow() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
      const text = sel.toString();
      if (!text || !text.trim()) return null;
      const range = sel.getRangeAt(0);
      const content = document.getElementById('mr-content');
      if (!content || !content.contains(range.commonAncestorContainer)) return null;
      const block = MR._blockElementFor(range.startContainer);
      return {
        text: text,
        line: MR._criticLineFor(range.startContainer),
        locator: MR._criticLocatorFor(range, text),
        blockLevel: MR._blockLevelFor(block),
        range: range
      };
    },

    formatSelection(op) {
      const payload = MR._selectionPayloadFromWindow() || MR._criticPending;
      if (!payload || !payload.text || !payload.text.trim()) {
        MR.flashCriticError && MR.flashCriticError();
        return false;
      }
      MR._postMarkdownEditAction(op, payload.text, payload.line || 0, payload.locator || null);
      const sel = window.getSelection();
      if (sel) sel.removeAllRanges();
      MR._hideCriticToolbar();
      return true;
    },

    _commitMarkdownBlockAction(level) {
      const payload = MR._criticPending || MR._selectionPayloadFromWindow();
      if (!payload || !payload.line) {
        MR.flashCriticError && MR.flashCriticError();
        return false;
      }
      MR._postMarkdownBlockAction(level === 0 ? 'paragraph' : 'heading', payload.line, level);
      const sel = window.getSelection();
      if (sel) sel.removeAllRanges();
      MR._hideCriticToolbar();
      return true;
    },

    _ensureCriticToolbar() {
      let bar = document.getElementById('mr-critic-toolbar');
      if (bar) return bar;
      bar = document.createElement('div');
      bar.id = 'mr-critic-toolbar';
      document.body.appendChild(bar);
      // 普通模式下防止点击工具条按钮清除选区；输入模式（评论/替换）需允许聚焦输入框
      bar.addEventListener('mousedown', function(e) {
        if (!bar.classList.contains('critic-input-mode')) e.preventDefault();
      });
      return bar;
    },

    _hideCriticToolbar() {
      const bar = document.getElementById('mr-critic-toolbar');
      if (bar) {
        bar.classList.remove('visible');
        // 关键：清掉输入态标记，否则取消评论/替换后 selectionchange 守卫会一直 return，
        // 导致再次选词时工具条不再弹出。
        bar.classList.remove('critic-input-mode');
      }
      MR._criticPending = null;
      MR._clearPendingHighlight();
    },

    _showCriticToolbar(range, text, line, locator) {
      const bar = MR._ensureCriticToolbar();
      const block = MR._blockElementFor(range.startContainer);
      MR._criticPending = {
        text: text,
        line: line,
        locator: locator || null,
        blockLevel: MR._blockLevelFor(block)
      };
      const L = MR.criticLabels;
      bar.innerHTML = '';

      const mkBtn = ({ label, html, title, className, handler }) => {
        const b = document.createElement('button');
        b.type = 'button';
        if (html) b.innerHTML = html;
        else b.textContent = label;
        b.className = ['critic-icon-btn', className || ''].filter(Boolean).join(' ');
        b.title = title || label;
        b.setAttribute('aria-label', title || label);
        b.addEventListener('click', handler);
        return b;
      };

      const mkSep = () => {
        const sep = document.createElement('span');
        sep.className = 'critic-sep';
        return sep;
      };

      const mkLevelPicker = () => {
        const wrap = document.createElement('span');
        wrap.className = 'critic-level-wrap';
        const currentLevel = Number.isFinite(MR._criticPending.blockLevel)
          ? MR._criticPending.blockLevel
          : null;
        const trigger = mkBtn({
          label: 'T',
          title: L.heading || 'Paragraph / Heading',
          className: 'fmt-level',
          handler: (event) => {
            event.preventDefault();
            event.stopPropagation();
            wrap.classList.toggle('open');
          }
        });
        const menu = document.createElement('div');
        menu.className = 'critic-level-menu';

        [['P', 0], ['H1', 1], ['H2', 2], ['H3', 3], ['H4', 4], ['H5', 5], ['H6', 6]].forEach(([label, level]) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.textContent = label;
          item.className = ['critic-level-item', currentLevel === level ? 'active' : ''].filter(Boolean).join(' ');
          item.title = level === 0 ? (L.paragraph || 'Paragraph') : `${L.heading || 'Heading'} ${level}`;
          item.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            MR._commitMarkdownBlockAction(level);
          });
          menu.appendChild(item);
        });

        wrap.appendChild(trigger);
        wrap.appendChild(menu);
        return wrap;
      };

      const commentIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5C5 4.7 5.7 4 6.5 4h11c.8 0 1.5.7 1.5 1.5v8c0 .8-.7 1.5-1.5 1.5H10l-4.2 3.3c-.3.2-.8 0-.8-.4V5.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

      bar.appendChild(mkLevelPicker());
      bar.appendChild(mkSep());
      bar.appendChild(mkBtn({
        label: 'B',
        title: `${L.bold || 'Bold'} (⌘B)`,
        className: 'fmt-bold',
        handler: () => MR.formatSelection('bold')
      }));
      bar.appendChild(mkBtn({
        label: 'I',
        title: `${L.italic || 'Italic'} (⌘I)`,
        className: 'fmt-italic',
        handler: () => MR.formatSelection('italic')
      }));
      bar.appendChild(mkBtn({
        label: 'U',
        title: `${L.underline || 'Underline'} (⌘U)`,
        className: 'fmt-underline',
        handler: () => MR.formatSelection('underline')
      }));
      bar.appendChild(mkBtn({
        label: '</>',
        title: `${L.code || 'Inline code'} (⌘⇧K)`,
        className: 'fmt-code',
        handler: () => MR.formatSelection('code')
      }));
      bar.appendChild(mkSep());
      bar.appendChild(mkBtn({
        label: 'S',
        title: L.delete,
        className: 'fmt-delete critic-danger',
        handler: () => MR._commitCritic('delete')
      }));
      bar.appendChild(mkBtn({
        label: 'A',
        title: L.highlight,
        className: 'fmt-highlight',
        handler: () => MR._commitCritic('highlight')
      }));
      bar.appendChild(mkBtn({
        html: commentIcon,
        title: L.comment,
        className: 'fmt-comment',
        handler: () => MR._promptCritic('comment', L.commentHint, true)
      }));

      bar.classList.add('visible');
      MR._positionCriticToolbar(bar, range.getBoundingClientRect());
    },

    _positionCriticToolbar(bar, rect) {
      const barRect = bar.getBoundingClientRect();
      let top = rect.top - barRect.height - 8;
      if (top < 4) top = rect.bottom + 8;
      let left = rect.left + (rect.width / 2) - (barRect.width / 2);
      left = Math.max(4, Math.min(left, window.innerWidth - barRect.width - 4));
      bar.style.top = top + 'px';
      bar.style.left = left + 'px';
    },

    // op: 'comment'(多行 textarea) / 'replace'(单行 input)
    _promptCritic(op, hint, multiline) {
      const bar = document.getElementById('mr-critic-toolbar');
      if (!bar || !MR._criticPending) return;
      const L = MR.criticLabels;
      // 输入框即将抢走焦点、原生选区会消失，此时才给选区上持久高亮
      MR._setPendingHighlight(MR._criticRange);
      bar.classList.add('critic-input-mode');
      bar.innerHTML = '';

      const field = document.createElement(multiline ? 'textarea' : 'input');
      if (!multiline) field.type = 'text';
      field.className = 'critic-field';
      field.placeholder = hint;
      if (multiline) field.rows = 3;

      // 评论草稿：记录本次输入对应的位置 key，并恢复同一处未提交的草稿（issue #7）。
      // 仅评论启用草稿，replace 不需要。
      const draftKey = op === 'comment' ? MR._criticDraftKey(MR._criticPending) : null;
      MR._criticInputDraftKey = draftKey;
      MR._criticDrafts = MR._criticDrafts || {};
      if (draftKey && MR._criticDrafts[draftKey] != null) field.value = MR._criticDrafts[draftKey];

      const confirm = document.createElement('button');
      confirm.textContent = L.confirm;
      confirm.className = 'critic-primary';
      const cancel = document.createElement('button');
      cancel.textContent = L.cancel;

      const submit = () => {
        const v = field.value.trim();
        if (op === 'comment' && !v) { MR._hideCriticToolbar(); return; }
        // 提交成功 → 清除该位置的草稿
        if (draftKey) delete MR._criticDrafts[draftKey];
        // 评论内的连续空行会破坏 CriticMarkup 行内格式（cmark 会按空行拆段），
        // 提交前自动折叠空行（issue #6）。replace 仅替换正文文本，无需处理。
        const payload = op === 'comment' ? MR._collapseBlankLines(field.value) : field.value;
        MR._commitCritic(op, payload);
      };
      // 取消/Esc 关闭前先把内容存为草稿（issue #7，方案 3.3）
      const dismiss = () => { MR._saveCriticDraft(); MR._hideCriticToolbar(); };
      confirm.addEventListener('click', submit);
      cancel.addEventListener('click', dismiss);
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
        else if (e.key === 'Enter' && !multiline) { e.preventDefault(); submit(); }
        else if (e.key === 'Escape') { e.preventDefault(); dismiss(); }
      });

      const row = document.createElement('div');
      row.className = 'critic-input-row';
      row.appendChild(field);
      const btns = document.createElement('div');
      btns.className = 'critic-input-btns';
      btns.appendChild(cancel);
      btns.appendChild(confirm);
      bar.appendChild(row);
      bar.appendChild(btns);
      // 重新定位（输入态尺寸变化）+ 聚焦
      if (MR._criticRange) MR._positionCriticToolbar(bar, MR._criticRange.getBoundingClientRect());
      setTimeout(() => field.focus(), 0);
    },

    _commitCritic(op, payload) {
      const p = MR._criticPending;
      if (!p) return;
      MR._postCriticAction(op, p.text, p.line, payload, p.locator);
      const sel = window.getSelection();
      if (sel) sel.removeAllRanges();
      const bar = document.getElementById('mr-critic-toolbar');
      if (bar) bar.classList.remove('critic-input-mode');
      MR._hideCriticToolbar();
    },

    // ===== 已有评论：查看 / 编辑 / 删除 =====

    _ensureCommentPopover() {
      let pop = document.getElementById('mr-critic-popover');
      if (pop) return pop;
      pop = document.createElement('div');
      pop.id = 'mr-critic-popover';
      document.body.appendChild(pop);
      pop.addEventListener('mousedown', (e) => { e.stopPropagation(); });
      return pop;
    },

    _hideCommentPopover() {
      const pop = document.getElementById('mr-critic-popover');
      if (pop) pop.classList.remove('visible');
      MR._criticPopoverEl = null;
    },

    _positionCriticPopover(pop, rect) {
      const r = pop.getBoundingClientRect();
      let top = rect.bottom + 6;
      if (top + r.height > window.innerHeight - 4) top = Math.max(4, rect.top - r.height - 6);
      let left = rect.left + (rect.width / 2) - (r.width / 2);
      left = Math.max(4, Math.min(left, window.innerWidth - r.width - 4));
      pop.style.top = top + 'px';
      pop.style.left = left + 'px';
    },

    _showCommentPopover(el) {
      const pop = MR._ensureCommentPopover();
      MR._criticPopoverEl = el;
      const L = MR.criticLabels;
      const comment = el.dataset.comment || '';
      const line = MR._criticLineFor(el);
      pop.innerHTML = '';
      pop.classList.remove('critic-input-mode');

      const textBox = document.createElement('div');
      textBox.className = 'critic-popover-text';
      textBox.textContent = comment;
      pop.appendChild(textBox);

      // 只读环境（QuickLook / 导出 HTML）：仅展示评论内容，不提供编辑 / 删除入口
      if (!MR._isReadonly()) {
        const btns = document.createElement('div');
        btns.className = 'critic-input-btns';
        const editBtn = document.createElement('button');
        editBtn.textContent = L.edit;
        editBtn.className = 'critic-primary';
        const delBtn = document.createElement('button');
        delBtn.textContent = L.delete;
        delBtn.className = 'critic-danger';

        editBtn.addEventListener('click', () => MR._editCommentPopover(el, comment, line));
        delBtn.addEventListener('click', () => {
          MR._postCriticAction('deleteComment', comment, line, null);
          MR._hideCommentPopover();
        });

        btns.appendChild(delBtn);
        btns.appendChild(editBtn);
        pop.appendChild(btns);
      }

      pop.classList.add('visible');
      MR._positionCriticPopover(pop, el.getBoundingClientRect());
    },

    _editCommentPopover(el, oldComment, line) {
      const pop = MR._ensureCommentPopover();
      const L = MR.criticLabels;
      pop.innerHTML = '';
      pop.classList.add('critic-input-mode');

      const field = document.createElement('textarea');
      field.className = 'critic-field';
      field.rows = 3;
      field.value = oldComment;

      const btns = document.createElement('div');
      btns.className = 'critic-input-btns';
      const cancel = document.createElement('button');
      cancel.textContent = L.cancel;
      const save = document.createElement('button');
      save.textContent = L.confirm;
      save.className = 'critic-primary';

      const submit = () => {
        const v = field.value.trim();
        if (!v) {
          MR._postCriticAction('deleteComment', oldComment, line, null);
        } else {
          const next = MR._collapseBlankLines(field.value);
          if (next !== oldComment) {
            MR._postCriticAction('editComment', oldComment, line, next);
          }
        }
        MR._hideCommentPopover();
      };
      cancel.addEventListener('click', () => MR._hideCommentPopover());
      save.addEventListener('click', submit);
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
        else if (e.key === 'Escape') { e.preventDefault(); MR._hideCommentPopover(); }
      });

      const row = document.createElement('div');
      row.className = 'critic-input-row';
      row.appendChild(field);
      btns.appendChild(cancel);
      btns.appendChild(save);
      pop.appendChild(row);
      pop.appendChild(btns);
      MR._positionCriticPopover(pop, el.getBoundingClientRect());
      setTimeout(() => { field.focus(); field.select(); }, 0);
    },

    _initCriticSelection() {
      const readonly = this._isReadonly();

      // 点击已有评论气泡 → 弹出查看（只读环境无编辑/删除按钮，见 _showCommentPopover）。
      // 该查看能力在只读环境下也保留，便于阅读评论内容。
      document.addEventListener('click', (e) => {
        const bubble = e.target.closest && e.target.closest('.critic-comment');
        if (bubble) {
          e.preventDefault();
          e.stopPropagation();
          MR._showCommentPopover(bubble);
        }
      });

      // 点击空白处隐藏评论弹窗（可写环境下还兼顾工具条输入态兜底；只读环境下工具条不存在，分支自然空转）
      document.addEventListener('mousedown', (e) => {
        const pop = document.getElementById('mr-critic-popover');
        const bar = document.getElementById('mr-critic-toolbar');
        const inPop = pop && pop.contains(e.target);
        const inBar = bar && bar.contains(e.target);
        const onBubble = e.target.closest && e.target.closest('.critic-comment');
        if (!inPop && !onBubble) {
          // 防误关：编辑已有评论且输入框有内容时，点击外部不关闭（issue #7）
          const popField = pop && pop.classList.contains('critic-input-mode') && pop.querySelector('.critic-field');
          if (!(popField && popField.value.trim())) MR._hideCommentPopover();
        }
        if (!inBar && !inPop && bar && bar.classList.contains('critic-input-mode')) {
          const field = bar.querySelector('.critic-field');
          if (!(field && field.value.trim())) MR._hideCriticToolbar();
        }
      });

      if (!readonly) {
        document.addEventListener('contextmenu', (e) => {
          if (e.target.closest && e.target.closest('.mr-media-toolbar')) return;
          const payload = MR._selectionPayloadFromWindow();
          if (!payload || !payload.range) return;
          const content = document.getElementById('mr-content');
          if (!content || !content.contains(e.target)) return;
          e.preventDefault();
          MR._criticRange = payload.range.cloneRange();
          MR._showCriticToolbar(payload.range, payload.text, payload.line, payload.locator);
        });

        document.addEventListener('dblclick', (e) => {
          const content = document.getElementById('mr-content');
          if (!content || !content.contains(e.target)) return;
          if (e.target.closest && e.target.closest('a, button, input, textarea, #mr-critic-toolbar, #mr-critic-popover, .critic-comment, .copy-code-button, .table-resize-handle, .mr-media-toolbar')) {
            return;
          }
          const line = MR._lineForEventTarget(e.target);
          MR._postEditRequest(line);
        });
      }

      // 选词标注工具条仅在可写环境提供：只读环境（QuickLook / 导出 HTML）无法保存标注。
      if (readonly) return;

      const onSelectionChange = () => {
        // 输入态（评论/替换正在输入）时不刷新工具条
        const bar = document.getElementById('mr-critic-toolbar');
        if (bar && bar.classList.contains('critic-input-mode')) return;

        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
          MR._hideCriticToolbar();
          return;
        }
        const text = sel.toString();
        if (!text || !text.trim()) { MR._hideCriticToolbar(); return; }

        const range = sel.getRangeAt(0);
        const content = document.getElementById('mr-content');
        if (!content || !content.contains(range.commonAncestorContainer)) {
          MR._hideCriticToolbar();
          return;
        }
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) { MR._hideCriticToolbar(); return; }
        MR._criticRange = range.cloneRange();
        const line = MR._criticLineFor(range.startContainer);
        const locator = MR._criticLocatorFor(range, text);
        MR._showCriticToolbar(range, text, line, locator);
      };

      document.addEventListener('selectionchange', () => {
        clearTimeout(MR._criticSelTimer);
        MR._criticSelTimer = setTimeout(onSelectionChange, 120);
      });
    },

    init() {
      MR.renderMermaid();
      MR.renderPlantUML();
      MR.renderKaTeX();
      MR.renderAdmonitions();
      MR.enableResizableTables();
      MR.enableZoomableMedia();
      MR.addCopyButtons();
      MR._initCriticSelection();
      if (typeof Prism !== 'undefined') {
        Prism.highlightAll();
      }
    }
  };

  window.MR = MR;

  // ---- 滚动同步：通过 WKScriptMessageHandler 上报可见行 / 标题（替代旧 SwiftUI scrollGeometry 回调）----
  function postScrollSync() {
    try {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.scrollSync) {
        window.webkit.messageHandlers.scrollSync.postMessage({
          line: MR.getTopVisibleLine(),
          heading: MR.getVisibleHeading()
        });
      }
    } catch (e) { /* no-op */ }
  }

  let _mrScrollTimer = null;
  let _mrLastScrollSyncAt = 0;
  let _mrPostScrollSync = function() {
    const now = Date.now();
    if (now - _mrLastScrollSyncAt >= 50) {
      _mrLastScrollSyncAt = now;
      postScrollSync();
    }
    if (_mrScrollTimer) clearTimeout(_mrScrollTimer);
    _mrScrollTimer = setTimeout(function() {
      _mrLastScrollSyncAt = Date.now();
      postScrollSync();
    }, 80);
  };
  window.addEventListener('scroll', function() {
    _mrPostScrollSync();
  }, { passive: true });
  window.addEventListener('resize', function() {
    document.querySelectorAll('table.mr-resizable-table').forEach(table => {
      MR._syncTableOverflowState(table);
    });
    MR._refreshAllMediaZoom();
  }, { passive: true });

  function initAndSyncScroll() {
    MR.init();
    setTimeout(postScrollSync, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAndSyncScroll);
  } else {
    initAndSyncScroll();
  }
})();
