/**
 * Script the Browser tab runs inside the visited page to let the user click one
 * element. It installs a full-viewport overlay in a closed shadow root, outlines
 * the hovered element, and settles with `{ picked }`, `{ cancelled: true }` (Escape,
 * a newer pick, or `window.__tbeltElementPick.cancel()`), or `{ error }`. The
 * extraction logic and its budgets follow Orca's `grab-guest-*` scripts (MIT, see
 * `LICENSES/Orca-MIT.txt`). The page is hostile: the host clamps the result again
 * in `payload.ts`, and every call first cancels any state a page predefined under
 * the same global.
 */
import { PICK_BUDGET, PICK_SAFE_ATTRIBUTES, PICK_SECRET_PATTERNS, PICK_STYLE_PROPERTIES } from './payload.ts'

/** Name of the page global that holds the active pick's `cancel` hook. */
export const PICK_GLOBAL = '__tbeltElementPick'

const GUEST_BODY = String.raw`
  var KEY = '__KEY__';
  var BUDGET = __BUDGET__;
  var SAFE_ATTRS = __SAFE_ATTRS__;
  var SECRET_PATTERNS = __SECRET_PATTERNS__;
  var STYLE_PROPS = __STYLE_PROPS__;
  var SAFE_PROTOCOLS = ['http:', 'https:', 'file:'];
  var TEXT_NODE_SCAN_LIMIT = 80;
  var SIBLING_SCAN_LIMIT = 80;

  var previous = window[KEY];
  if (previous) {
    try { previous.cancel(); } catch (e) {}
    try { delete window[KEY]; } catch (e) {}
  }

  function clamp(value, max) {
    if (!value || typeof value !== 'string') return '';
    return value.length <= max ? value : value.slice(0, max) + ' (truncated)';
  }

  function hasSecret(value) {
    if (!value) return false;
    var lower = String(value).toLowerCase();
    for (var i = 0; i < SECRET_PATTERNS.length; i++) {
      if (lower.indexOf(SECRET_PATTERNS[i]) !== -1) return true;
    }
    return false;
  }

  function cleanUrl(value) {
    try {
      var url = new URL(value);
      if (url.protocol === 'about:') return url.toString() === 'about:blank' ? 'about:blank' : '';
      if (SAFE_PROTOCOLS.indexOf(url.protocol) === -1) return '';
      url.search = '';
      url.hash = '';
      return url.toString();
    } catch (e) {
      return '';
    }
  }

  function boundedText(el, max) {
    try {
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      var text = '';
      var inspected = 0;
      var node = walker.nextNode();
      while (node && text.length < max + 20 && inspected < TEXT_NODE_SCAN_LIMIT) {
        inspected++;
        text += ' ' + (node.nodeValue || '').slice(0, max + 20);
        node = walker.nextNode();
      }
      return clamp(text.split(/\s+/).filter(Boolean).join(' '), max);
    } catch (e) {
      return '';
    }
  }

  function safeAttributes(el) {
    var attrs = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var name = el.attributes[i].name.toLowerCase();
      var value = el.attributes[i].value;
      if (SAFE_ATTRS.indexOf(name) === -1 && name.indexOf('aria-') !== 0) continue;
      if (hasSecret(value)) attrs[name] = '[redacted]';
      else if ((name === 'href' || name === 'src' || name === 'action') && value) attrs[name] = cleanUrl(value);
      else attrs[name] = clamp(value, 200);
    }
    return attrs;
  }

  function accessibility(el) {
    var tag = el.tagName.toLowerCase();
    var label = el.getAttribute('aria-label');
    var name = label || null;
    if (!name && (tag === 'button' || tag === 'a' || tag === 'label')) name = boundedText(el, 100) || null;
    if (!name) name = el.getAttribute('title') || el.getAttribute('alt') || null;
    return { role: el.getAttribute('role') || tag, accessibleName: name };
  }

  function styleSubset(el) {
    var computed = window.getComputedStyle(el);
    var result = {};
    for (var i = 0; i < STYLE_PROPS.length; i++) {
      result[STYLE_PROPS[i]] = computed.getPropertyValue(STYLE_PROPS[i].replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); })) || '';
    }
    return result;
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, function (ch) { return '\\' + ch; });
  }

  function stableClasses(el, limit) {
    var result = [];
    if (!el.classList) return result;
    for (var i = 0; i < el.classList.length && result.length < limit; i++) {
      var cls = el.classList[i];
      if (!cls || cls.length > 60 || hasSecret(cls)) continue;
      if (/^css-[a-z0-9]+$/i.test(cls) || (/^[A-Za-z0-9_-]{12,}$/.test(cls) && /\d/.test(cls) && /[A-Z]/.test(cls))) continue;
      result.push(cls);
    }
    return result;
  }

  function selectorPart(el) {
    var tag = el.tagName.toLowerCase();
    if (el.id && !hasSecret(el.id)) return tag + '#' + cssEscape(el.id);
    var classes = stableClasses(el, 2);
    return classes.length > 0 ? tag + classes.map(function (cls) { return '.' + cssEscape(cls); }).join('') : tag;
  }

  function isUnique(selector) {
    try { return document.querySelectorAll(selector).length === 1; } catch (e) { return false; }
  }

  function nthSuffix(el) {
    var index = 1;
    var sibling = el.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === el.tagName) index++;
      sibling = sibling.previousElementSibling;
    }
    if (index > 1) return ':nth-of-type(' + index + ')';
    sibling = el.nextElementSibling;
    while (sibling) {
      if (sibling.tagName === el.tagName) return ':nth-of-type(1)';
      sibling = sibling.nextElementSibling;
    }
    return '';
  }

  function buildSelector(el) {
    var parts = [];
    var current = el;
    while (current && current.nodeType === 1 && current !== document.body && parts.length < 10) {
      var part = selectorPart(current);
      if (current.parentElement && !isUnique(parts.concat([part]).reverse().join(' > '))) part += nthSuffix(current);
      parts.unshift(part);
      var selector = parts.join(' > ');
      if (isUnique(selector)) return clamp(selector, BUDGET.selectorMaxLength);
      current = current.parentElement;
    }
    return clamp(parts.join(' > ') || el.tagName.toLowerCase(), BUDGET.selectorMaxLength);
  }

  function readablePath(el) {
    var parts = [];
    var current = el;
    while (current && current !== document.documentElement && parts.length < 6) {
      var tag = current.tagName.toLowerCase();
      if (tag === 'html' || tag === 'body') break;
      var aria = current.getAttribute('aria-label');
      var classes = stableClasses(current, 1);
      var label = tag;
      if (current.id && !hasSecret(current.id)) label = '#' + cssEscape(current.id);
      else if (aria && !hasSecret(aria)) label = tag + '[aria-label="' + clamp(aria, 40).replace(/"/g, '\\"') + '"]';
      else if (classes.length > 0) label = '.' + cssEscape(classes[0]);
      parts.unshift(label);
      current = current.parentElement;
    }
    return clamp(parts.join(' > '), BUDGET.pathMaxLength);
  }

  function ancestors(el) {
    var path = [];
    var current = el.parentElement;
    while (current && current !== document.documentElement && path.length < BUDGET.ancestorPathMaxEntries) {
      var role = current.getAttribute('role');
      path.push(role ? current.tagName.toLowerCase() + '[role=' + role + ']' : current.tagName.toLowerCase());
      current = current.parentElement;
    }
    return path;
  }

  function nearbyText(el) {
    var results = [];
    var previousSibling = el.previousElementSibling;
    var nextSibling = el.nextElementSibling;
    var inspected = 0;
    while (results.length < BUDGET.nearbyTextMaxEntries && inspected < SIBLING_SCAN_LIMIT && (previousSibling || nextSibling)) {
      var side = [previousSibling, nextSibling];
      previousSibling = previousSibling && previousSibling.previousElementSibling;
      nextSibling = nextSibling && nextSibling.nextElementSibling;
      for (var i = 0; i < 2; i++) {
        if (!side[i] || results.length >= BUDGET.nearbyTextMaxEntries) continue;
        inspected++;
        var text = boundedText(side[i], BUDGET.nearbyTextEntryMaxLength);
        if (text) results.push(text);
      }
    }
    return results;
  }

  function htmlSnippet(el) {
    var clone = el.cloneNode(true);
    var scripts = clone.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) scripts[i].remove();
    return clamp(clone.outerHTML || '', BUDGET.htmlSnippetMaxLength);
  }

  function extract(el) {
    var rect = el.getBoundingClientRect();
    var classes = el.getAttribute('class') || '';
    return {
      page: {
        url: cleanUrl(window.location.href),
        title: document.title || '',
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      },
      target: {
        tagName: el.tagName.toLowerCase(),
        selector: buildSelector(el),
        elementPath: readablePath(el),
        cssClasses: hasSecret(classes) ? '[redacted]' : clamp(classes, BUDGET.cssClassesMaxLength),
        textSnippet: boundedText(el, BUDGET.textSnippetMaxLength),
        htmlSnippet: htmlSnippet(el),
        attributes: safeAttributes(el),
        accessibility: accessibility(el),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        computedStyles: styleSubset(el)
      },
      nearbyText: nearbyText(el),
      ancestorPath: ancestors(el)
    };
  }

  // The overlay is the full-viewport click catcher, so the page never receives the selecting click.
  var host = document.createElement('div');
  host.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:all;cursor:crosshair;';
  document.documentElement.appendChild(host);
  var shadow = host.attachShadow({ mode: 'closed' });
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;display:none;pointer-events:none;border:2px solid #4cc9e0;border-radius:3px;background:rgba(76,201,224,0.12);box-shadow:0 0 0 1px rgba(0,0,0,0.35);';
  var label = document.createElement('div');
  label.style.cssText = 'position:fixed;display:none;pointer-events:none;max-width:300px;padding:3px 8px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;border-radius:4px;background:rgba(16,16,16,0.94);color:#e5e5e5;font:11px/1.4 system-ui,sans-serif;';
  shadow.appendChild(box);
  shadow.appendChild(label);

  function elementAt(x, y) {
    host.style.pointerEvents = 'none';
    var el = document.elementFromPoint(x, y);
    host.style.pointerEvents = 'all';
    return el === document.documentElement || el === document.body ? null : el;
  }

  function highlight(el) {
    if (!el) {
      box.style.display = 'none';
      label.style.display = 'none';
      return;
    }
    var rect = el.getBoundingClientRect();
    box.style.cssText += 'display:block;left:' + rect.x + 'px;top:' + rect.y + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px;';
    var text = boundedText(el, 40);
    label.textContent = el.tagName.toLowerCase() + (text ? '  "' + text + '"' : '') + '  ' + Math.round(rect.width) + 'x' + Math.round(rect.height);
    var top = rect.bottom + 6;
    if (top + 28 > window.innerHeight) top = rect.top - 28;
    label.style.cssText += 'display:block;left:' + Math.max(4, rect.x) + 'px;top:' + top + 'px;';
  }

  return await new Promise(function (resolve) {
    var settled = false;
    function finish(result) {
      if (settled) return;
      settled = true;
      host.removeEventListener('mousemove', onMove);
      host.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey, true);
      try { host.remove(); } catch (e) {}
      try { delete window[KEY]; } catch (e) {}
      resolve(result);
    }
    function onMove(event) { highlight(elementAt(event.clientX, event.clientY)); }
    function onClick(event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      var el = elementAt(event.clientX, event.clientY);
      if (!el) { finish({ cancelled: true }); return; }
      try { finish({ picked: extract(el) }); }
      catch (error) { finish({ error: String(error && error.message || error) }); }
    }
    function onKey(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      finish({ cancelled: true });
    }
    host.addEventListener('mousemove', onMove);
    host.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey, true);
    window[KEY] = { cancel: function () { finish({ cancelled: true }); } };
  });
`

/** Guest script that starts one pick; its promise settles with `{ picked }`, `{ cancelled }`, or `{ error }`. */
export const PICK_GUEST_SCRIPT = `(async function () {
  'use strict';${GUEST_BODY
    .replace('__KEY__', PICK_GLOBAL)
    .replace('__BUDGET__', JSON.stringify(PICK_BUDGET))
    .replace('__SAFE_ATTRS__', JSON.stringify(PICK_SAFE_ATTRIBUTES))
    .replace('__SECRET_PATTERNS__', JSON.stringify(PICK_SECRET_PATTERNS))
    .replace('__STYLE_PROPS__', JSON.stringify(PICK_STYLE_PROPERTIES))}
})()`

/** Guest script that cancels the active pick, if any; it settles the pending pick as cancelled. */
export const PICK_CANCEL_SCRIPT = `(function () {
  var active = window.${PICK_GLOBAL};
  if (active && typeof active.cancel === 'function') active.cancel();
  return true;
})()`
