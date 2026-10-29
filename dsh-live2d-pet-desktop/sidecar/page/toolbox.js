// 桌宠身上的 Pet Toolbox 界面（桌面窗口专用）。
//
// 为什么用原生 DOM、而不是改 `lib/client.js`：
//   * 那份文件 465 KB / 9100 行，是宠物本体的渲染与状态机，改它风险高、上游升级必冲突；
//   * `hover.js` 的穿透判定只看 DOM 上的 `[data-panel]` / `[data-bubble]`，所以只要把
//     我们的卡片挂上这两个属性，壳就会在光标落上来时把窗口切成"吃鼠标"，其余透明区域
//     继续穿透 —— 不需要动 Rust 的窗口逻辑。
//
// 数据全部走 `/api/pet-toolbox/*`（复用现有 @local/dsh-pet-toolbox 的存储与接口），
// 桌面页与 DSH 页各写一份 DOM，但只有一份后端。
(function () {
  'use strict'
  if (window.__ptbDesktopLoaded) return
  window.__ptbDesktopLoaded = true

  var API = '/api/pet-toolbox'
  var SIGNAL = 'x-dsh-pet-toolbox'
  var PET = '[data-dsh-live2d-pet]'

  var state = {
    data: null,
    error: '',
    open: false,
    view: 'menu',
    busy: false,
    draft: '',
    when: '',
    bubble: null,
  }

  // ---------------------------------------------------------------- styles

  var CSS = [
    '#ptb-layer{position:fixed;inset:0;pointer-events:none;z-index:2147483000;',
    'font-family:"Microsoft YaHei UI","PingFang SC","Segoe UI",system-ui,sans-serif}',
    '#ptb-layer *{box-sizing:border-box}',
    '.ptb-card{position:fixed;left:0;top:0;pointer-events:auto;width:238px;padding:10px;border-radius:16px;',
    'background:rgba(255,250,240,.97);border:1px solid rgba(139,158,174,.55);',
    'box-shadow:0 12px 32px rgba(48,67,86,.22);color:#34465a;font-size:13px;line-height:1.5;',
    'backdrop-filter:blur(10px);display:none}',
    '.ptb-title{display:flex;align-items:center;justify-content:space-between;padding:2px 4px 8px;font-weight:600}',
    '.ptb-x{border:0;background:transparent;color:#8b9eae;font-size:16px;line-height:1;cursor:pointer;',
    'padding:2px 5px;border-radius:7px}',
    '.ptb-x:hover{background:rgba(139,158,174,.18);color:#34465a}',
    '.ptb-item{display:flex;align-items:center;gap:8px;width:100%;padding:8px 9px;margin:2px 0;border:0;',
    'border-radius:10px;background:transparent;color:#34465a;font:inherit;text-align:left;cursor:pointer}',
    '.ptb-item:hover{background:rgba(139,158,174,.16)}',
    '.ptb-item:disabled{opacity:.45;cursor:default}',
    '.ptb-ico{display:inline-flex;width:16px;height:16px;flex:none;color:#5b7c99}',
    '.ptb-ico svg{width:16px;height:16px}',
    '.ptb-sep{height:1px;background:rgba(139,158,174,.3);margin:6px 4px}',
    '.ptb-hint{color:#8b9eae;font-size:11px;padding:4px 6px;line-height:1.6}',
    '.ptb-warn{color:#c0392b;font-size:11px;padding:4px 6px;line-height:1.6}',
    '.ptb-row{display:flex;align-items:center;gap:7px;padding:6px 4px;border-top:1px solid rgba(139,158,174,.22)}',
    '.ptb-row:first-of-type{border-top:0}',
    '.ptb-row-main{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.ptb-row-sub{flex:none;font-size:11px;color:#8b9eae}',
    '.ptb-mini{border:0;background:transparent;color:#5b7c99;font:inherit;font-size:11px;cursor:pointer;',
    'padding:2px 5px;border-radius:6px}',
    '.ptb-mini:hover{background:rgba(139,158,174,.2)}',
    '.ptb-input{width:100%;height:30px;margin:4px 0;padding:0 9px;border-radius:9px;',
    'border:1px solid rgba(139,158,174,.55);background:#fff;color:#34465a;font:inherit;font-size:12px}',
    '.ptb-input:focus{outline:none;border-color:#5b7c99}',
    '.ptb-actions{display:flex;gap:6px;margin-top:6px}',
    '.ptb-btn{flex:1;height:30px;border-radius:9px;border:1px solid rgba(139,158,174,.55);',
    'background:#fff;color:#34465a;font:inherit;font-size:12px;cursor:pointer}',
    '.ptb-btn[data-primary]{background:#5b7c99;border-color:#5b7c99;color:#fff}',
    '.ptb-btn:disabled{opacity:.5;cursor:default}',
    '.ptb-bubble{position:fixed;left:0;top:0;pointer-events:auto;max-width:252px;padding:10px 12px;border-radius:16px;',
    'background:rgba(255,250,240,.98);border:1px solid rgba(139,158,174,.6);',
    'box-shadow:0 10px 26px rgba(48,67,86,.24);color:#34465a;font-size:13px;line-height:1.55;display:none}',
    '.ptb-bubble::after{content:"";position:absolute;left:50%;bottom:-7px;width:12px;height:12px;',
    'background:rgba(255,250,240,.98);border-right:1px solid rgba(139,158,174,.6);',
    'border-bottom:1px solid rgba(139,158,174,.6);transform:translateX(-50%) rotate(45deg);border-radius:0 0 3px 0}',
    '.ptb-bubble-text{white-space:pre-wrap;word-break:break-word}',
    '.ptb-bubble-actions{display:flex;gap:6px;margin-top:8px}',
    '.ptb-toast{position:fixed;left:50%;bottom:40px;transform:translateX(-50%);pointer-events:none;',
    'background:rgba(52,70,90,.92);color:#fff;font-size:12px;padding:6px 12px;border-radius:999px;',
    'opacity:0;transition:opacity .2s}',
  ].join('')

  var ICON = {
    chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4V5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
    sliders: '<svg viewBox="0 0 24 24"><path d="M5 6h14M5 12h14M5 18h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/></svg>',
  }

  var style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)

  var layer = document.createElement('div')
  layer.id = 'ptb-layer'

  var menuEl = document.createElement('div')
  menuEl.className = 'ptb-card'
  menuEl.setAttribute('data-panel', '')

  var bubbleEl = document.createElement('div')
  bubbleEl.className = 'ptb-bubble'
  bubbleEl.setAttribute('data-bubble', '')

  var toastEl = document.createElement('div')
  toastEl.className = 'ptb-toast'

  layer.appendChild(menuEl)
  layer.appendChild(bubbleEl)
  layer.appendChild(toastEl)
  document.body.appendChild(layer)

  // --------------------------------------------------------------- helpers

  function h(tag, props) {
    var node = document.createElement(tag)
    if (props) {
      for (var key in props) {
        if (!Object.prototype.hasOwnProperty.call(props, key)) continue
        var value = props[key]
        if (value === null || value === undefined || value === false) continue
        if (key === 'class') node.className = value
        else if (key === 'text') node.textContent = String(value)
        else if (key === 'html') node.innerHTML = value
        else if (key === 'checked') node.checked = value
        else if (key === 'value') node.value = value
        else if (key === 'oninput') node.addEventListener('input', value)
        else if (key === 'onchange') node.addEventListener('change', value)
        else if (key === 'onclick') node.addEventListener('click', value)
        else if (key === 'onkeydown') node.addEventListener('keydown', value)
        else if (value === true) node.setAttribute(key, '')
        else node.setAttribute(key, String(value))
      }
    }
    for (var index = 2; index < arguments.length; index += 1) {
      var child = arguments[index]
      if (child === null || child === undefined) continue
      if (Array.isArray(child)) {
        for (var inner = 0; inner < child.length; inner += 1) {
          if (child[inner] === null || child[inner] === undefined) continue
          node.appendChild(child[inner].nodeType ? child[inner] : document.createTextNode(String(child[inner])))
        }
      } else {
        node.appendChild(child.nodeType ? child : document.createTextNode(String(child)))
      }
    }
    return node
  }

  function pad(value) {
    return String(value).padStart(2, '0')
  }

  function fmtDue(ms) {
    var date = new Date(ms)
    return (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
  }

  function defaultWhen() {
    var date = new Date(Date.now() + 10 * 60000)
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
      + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes())
  }

  function toast(text) {
    toastEl.textContent = text
    toastEl.style.opacity = '1'
    clearTimeout(toast._timer)
    toast._timer = setTimeout(function () { toastEl.style.opacity = '0' }, 1800)
  }

  function api(path, body) {
    var init = body === undefined
      ? { headers: { accept: 'application/json' }, cache: 'no-store' }
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          cache: 'no-store',
        }
    if (body !== undefined) init.headers[SIGNAL] = '1'
    return fetch(API + path, init).then(function (response) {
      return response.json().catch(function () { return null }).then(function (data) {
        if (!response.ok || data === null || data.ok === false) {
          throw new Error(data && data.error ? data.error : 'HTTP ' + response.status)
        }
        return data
      })
    })
  }

  function petRect() {
    var pet = document.querySelector(PET)
    if (!pet) return null
    var rect = pet.getBoundingClientRect()
    // 某些版本里 `[data-dsh-live2d-pet]` 可能是铺满屏幕的容器；那种情况下用里面的
    // canvas 当锚点，否则菜单会贴到屏幕边上。
    if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.8) {
      var canvas = pet.querySelector('canvas')
      if (canvas) rect = canvas.getBoundingClientRect()
    }
    if (rect.width < 30 || rect.height < 30) return null
    return rect
  }

  // ------------------------------------------------------------- placement

  /**
   * 贴到她旁边。`measure=true` 时重新量尺寸（打开/切页/内容变化）；
   * 跟随循环用缓存尺寸，位置只在变化时写 transform —— 不再每帧读 offsetWidth，
   * 避免强制布局（那是拖动卡顿的来源）。
   */
  var menuBox = { w: 0, h: 0, x: null, y: null }
  var bubbleBox = { w: 0, h: 0, x: null, y: null }

  function placeMenu(measure) {
    if (measure === true || menuBox.w === 0) {
      menuEl.style.visibility = 'hidden'
      menuEl.style.display = 'block'
      menuBox.w = menuEl.offsetWidth
      menuBox.h = menuEl.offsetHeight
      menuEl.style.visibility = 'visible'
    }
    var rect = petRect()
    var left = rect ? rect.left - menuBox.w - 14 : 120
    if (left < 8) left = rect ? rect.right + 14 : 120
    if (left + menuBox.w > window.innerWidth - 8) left = window.innerWidth - menuBox.w - 8
    var top = rect ? rect.top + 24 : 120
    top = Math.max(8, Math.min(top, window.innerHeight - menuBox.h - 8))
    left = Math.max(8, left)
    if (menuBox.x !== null && Math.abs(menuBox.x - left) < 0.5 && Math.abs(menuBox.y - top) < 0.5) return
    menuBox.x = left
    menuBox.y = top
    menuEl.style.transform = 'translate3d(' + left + 'px,' + top + 'px,0)'
  }

  function placeBubble(measure) {
    if (measure === true || bubbleBox.w === 0) {
      bubbleEl.style.visibility = 'hidden'
      bubbleEl.style.display = 'block'
      bubbleBox.w = bubbleEl.offsetWidth
      bubbleBox.h = bubbleEl.offsetHeight
      bubbleEl.style.visibility = 'visible'
    }
    var rect = petRect()
    var left = rect ? rect.left + rect.width / 2 - bubbleBox.w / 2 : window.innerWidth / 2 - bubbleBox.w / 2
    left = Math.max(10, Math.min(left, window.innerWidth - bubbleBox.w - 10))
    var top = rect ? rect.top + 28 - bubbleBox.h - 10 : 80
    if (top < 10) top = rect ? Math.min(rect.bottom + 12, window.innerHeight - bubbleBox.h - 10) : 80
    top = Math.max(10, top)
    if (bubbleBox.x !== null && Math.abs(bubbleBox.x - left) < 0.5 && Math.abs(bubbleBox.y - top) < 0.5) return
    bubbleBox.x = left
    bubbleBox.y = top
    bubbleEl.style.transform = 'translate3d(' + left + 'px,' + top + 'px,0)'
  }

  // ----------------------------------------------------------------- views

  function switchView(view) {
    state.view = view
    if (view === 'add' && state.when === '') state.when = defaultWhen()
    render()
  }

  function render() {
    if (!state.open) {
      menuEl.style.display = 'none'
      return
    }
    menuEl.replaceChildren()
    var data = state.data
    var todos = data && Array.isArray(data.todos) ? data.todos : []
    var open = todos.filter(function (todo) { return !todo.done })

    var head = h('div', { class: 'ptb-title' },
      h('span', { text: state.view === 'menu' ? '小助手' : state.view === 'add' ? '添加提醒' : state.view === 'todos' ? '待办' : '快捷启动' }),
      h('button', { class: 'ptb-x', title: '关闭', onclick: closeMenu, text: '×' })
    )
    menuEl.appendChild(head)

    if (state.error !== '') {
      menuEl.appendChild(h('div', { class: 'ptb-warn', text: state.error }))
    }

    if (state.view === 'menu') {
      menuEl.appendChild(h('button', {
        class: 'ptb-item',
        onclick: function () { closeMenu(); if (window.__ptbChat) window.__ptbChat.open() },
      }, h('span', { class: 'ptb-ico', html: ICON.chat }), '聊天'))
      menuEl.appendChild(h('button', {
        class: 'ptb-item',
        disabled: state.error !== '',
        onclick: function () { switchView('add') },
      }, h('span', { class: 'ptb-ico', html: ICON.plus }), '添加提醒'))
      menuEl.appendChild(h('button', {
        class: 'ptb-item',
        disabled: state.error !== '',
        onclick: function () { switchView('todos') },
      }, h('span', { class: 'ptb-ico', html: ICON.list }),
        open.length > 0 ? '查看待办（' + open.length + '）' : '查看待办'))
      menuEl.appendChild(h('button', {
        class: 'ptb-item',
        disabled: state.error !== '',
        onclick: function () { switchView('apps') },
      }, h('span', { class: 'ptb-ico', html: ICON.play }), '快捷启动'))
      menuEl.appendChild(h('div', { class: 'ptb-sep' }))
      menuEl.appendChild(h('button', {
        class: 'ptb-item',
        onclick: openOriginalPanel,
      }, h('span', { class: 'ptb-ico', html: ICON.sliders }), '外观 / 动作（原面板）'))
      if (state.busy) menuEl.appendChild(h('div', { class: 'ptb-hint', text: '处理中…' }))
    } else if (state.view === 'add') {
      menuEl.appendChild(h('input', {
        class: 'ptb-input',
        placeholder: '要提醒什么？',
        value: state.draft,
        oninput: function (event) { state.draft = event.target.value },
        onkeydown: function (event) { if (event.key === 'Enter') saveTodo() },
      }))
      menuEl.appendChild(h('input', {
        class: 'ptb-input',
        type: 'datetime-local',
        value: state.when,
        oninput: function (event) { state.when = event.target.value },
      }))
      menuEl.appendChild(h('div', { class: 'ptb-actions' },
        h('button', { class: 'ptb-btn', onclick: function () { switchView('menu') }, text: '返回' }),
        h('button', { class: 'ptb-btn', 'data-primary': true, disabled: state.busy, onclick: saveTodo, text: '保存' })
      ))
      menuEl.appendChild(h('div', { class: 'ptb-hint', text: '不选时间就是一条普通待办。' }))
    } else if (state.view === 'todos') {
      if (todos.length === 0) {
        menuEl.appendChild(h('div', { class: 'ptb-hint', text: '还没有待办。' }))
      } else {
        todos.forEach(function (todo) {
          menuEl.appendChild(h('div', { class: 'ptb-row' },
            h('input', {
              type: 'checkbox',
              checked: todo.done === true,
              onchange: function () { updateTodo(todo.id, { done: todo.done !== true }) },
            }),
            h('span', { class: 'ptb-row-main', title: todo.text, text: todo.text }),
            h('span', { class: 'ptb-row-sub', text: todo.due === null ? '' : fmtDue(todo.due) }),
            h('button', {
              class: 'ptb-mini',
              title: '推迟 10 分钟',
              onclick: function () { updateTodo(todo.id, { due: Date.now() + 600000 }) },
              text: '+10',
            }),
            h('button', {
              class: 'ptb-mini',
              title: '删除',
              onclick: function () { removeTodo(todo.id) },
              text: '×',
            })
          ))
        })
      }
      menuEl.appendChild(h('div', { class: 'ptb-actions' },
        h('button', { class: 'ptb-btn', onclick: function () { switchView('menu') }, text: '返回' })
      ))
    } else if (state.view === 'apps') {
      var apps = data && Array.isArray(data.apps) ? data.apps : []
      if (apps.length === 0) {
        menuEl.appendChild(h('div', { class: 'ptb-hint', text: '还没有快捷启动项。可在 DSH 的「设置 → 桌宠工具箱」里添加。' }))
      } else {
        apps.forEach(function (app) {
          menuEl.appendChild(h('div', { class: 'ptb-row' },
            h('span', { class: 'ptb-row-main', title: app.target, text: app.label }),
            h('button', {
              class: 'ptb-mini',
              title: '运行',
              disabled: state.busy,
              onclick: function () { launchApp(app.id) },
              text: '运行',
            })
          ))
        })
      }
      menuEl.appendChild(h('div', { class: 'ptb-actions' },
        h('button', { class: 'ptb-btn', onclick: function () { switchView('menu') }, text: '返回' })
      ))
    }

    placeMenu(true)
  }

  // --------------------------------------------------------------- actions

  function run(operation) {
    state.busy = true
    render()
    return operation().then(function () {
      return load()
    }).then(function () {
      state.busy = false
      render()
      return true
    }).catch(function (error) {
      state.busy = false
      toast(String(error && error.message ? error.message : error))
      render()
      return false
    })
  }

  function saveTodo() {
    var text = state.draft.trim()
    if (text === '') {
      toast('先写提醒内容')
      return
    }
    var due = state.when === '' ? null : new Date(state.when).getTime()
    if (due !== null && !Number.isFinite(due)) {
      toast('时间格式不对')
      return
    }
    run(function () { return api('/todos', { text: text, due: due }) }).then(function (ok) {
      if (!ok) return
      state.draft = ''
      state.when = ''
      switchView('menu')
      toast('已添加')
    })
  }

  function updateTodo(id, patch) {
    var body = { id: id }
    if (patch.done !== undefined) body.done = patch.done
    if (patch.due !== undefined) body.due = patch.due
    run(function () { return api('/todos/update', body) })
  }

  function removeTodo(id) {
    run(function () { return api('/todos/delete', { id: id }) })
  }

  function launchApp(id) {
    run(function () { return api('/apps/launch', { id: id }) }).then(function (ok) {
      if (ok) toast('已启动')
    })
  }

  // --------------------------------------------------------------- bubbles

  function checkDue() {
    var due = state.data && Array.isArray(state.data.due) ? state.data.due : []
    if (due.length === 0) {
      if (state.bubble !== null) hideBubble()
      return
    }
    var first = due[0]
    if (state.bubble !== null && state.bubble.id === first.id) return
    showBubble(first)
  }

  function showBubble(todo) {
    state.bubble = todo
    bubbleEl.replaceChildren(
      h('div', { class: 'ptb-bubble-text', text: '该做：' + todo.text }),
      h('div', { class: 'ptb-bubble-actions' },
        h('button', {
          class: 'ptb-btn',
          'data-primary': true,
          onclick: function () { updateTodo(todo.id, { done: true }); hideBubble() },
          text: '完成',
        }),
        h('button', {
          class: 'ptb-btn',
          onclick: function () { updateTodo(todo.id, { due: Date.now() + 600000 }); hideBubble() },
          text: '推迟 10 分钟',
        })
      )
    )
    placeBubble(true)
    startFollow()
    flashExpression()
  }

  function hideBubble() {
    state.bubble = null
    bubbleEl.style.display = 'none'
  }

  /** 让宠物换个表情（原客户端暴露的读口）；拿不到就只留气泡，不影响功能。 */
  function flashExpression() {
    var pet = window.__dshLive2dPet
    if (!pet || typeof pet.setExpressions !== 'function') return
    var before = []
    try { before = typeof pet.expressions === 'function' ? pet.expressions() : [] } catch (error) { before = [] }
    try { pet.setExpressions(before.concat(['感叹号'])) } catch (error) { return }
    setTimeout(function () {
      try { pet.setExpressions(before) } catch (error) { /* 客户端可能在相位里，忽略 */ }
    }, 8000)
  }

  // ------------------------------------------------------------------- menu

  function openMenu() {
    state.open = true
    state.view = 'menu'
    render()
    startFollow()
  }

  function closeMenu() {
    state.open = false
    state.view = 'menu'
    menuEl.style.display = 'none'
  }

  /**
   * 菜单与提醒气泡跟着桌宠走：rAF 每帧读一次她的位置，只有真的移动了才写 transform。
   * 只在"有东西开着"的时候跑，关掉就自己停。
   */
  var followRaf = 0
  function startFollow() {
    if (followRaf !== 0) return
    var tick = function () {
      followRaf = 0
      if (!state.open && state.bubble === null) return
      if (state.open) placeMenu()
      if (state.bubble !== null) placeBubble()
      followRaf = window.requestAnimationFrame(tick)
    }
    followRaf = window.requestAnimationFrame(tick)
  }

  /**
   * 打开宠物原本的「动作 / 装扮」面板：派发一个合成 contextmenu，让原客户端的
   * React 处理器照常接管。合成事件带一个标记，避免再被我们自己的监听器截住。
   */
  function openOriginalPanel() {
    closeMenu()
    var pet = document.querySelector(PET)
    if (!pet) return
    // 原面板的 onContextMenu 挂在 `[data-hit]`（剪影那一层）上，**不是**宠物根节点；
    // 在根节点上派发事件不会往下传到子元素 —— 那样点了就是"没反应"。
    var target = pet.querySelector('[data-hit]') || pet
    var rect = target.getBoundingClientRect()
    var event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      button: 2,
      buttons: 2,
    })
    event.__ptbSynthetic = true
    target.dispatchEvent(event)
  }

  document.addEventListener('contextmenu', function (event) {
    if (event.__ptbSynthetic) return
    var target = event.target
    var pet = target && target.closest ? target.closest(PET) : null
    if (!pet) return
    event.preventDefault()
    event.stopPropagation()
    openMenu()
  }, true)

  document.addEventListener('pointerdown', function (event) {
    if (!state.open) return
    var target = event.target
    if (target && target.closest && target.closest('#ptb-layer')) return
    // 点她/拖她时先不关：卡片会跟着她走（见 startFollow）。
    if (target && target.closest && target.closest(PET)) return
    closeMenu()
  }, true)

  // 点桌面/别的程序：桌面点击会穿透到下面，页面收不到 pointerdown；
  // 这个窗口失焦就是"用户点了别处"的信号。
  window.addEventListener('blur', function () {
    if (state.open) closeMenu()
  })

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && state.open) closeMenu()
  }, true)

  window.addEventListener('resize', function () {
    if (state.open) placeMenu(true)
    if (state.bubble !== null) placeBubble(true)
  })

  // ------------------------------------------------------------------ boot

  function load() {
    return api('/state').then(function (data) {
      state.data = data
      state.error = ''
    }).catch(function (error) {
      state.data = null
      state.error = 'DSH 未连接：' + String(error && error.message ? error.message : error)
    }).then(function () {
      // **不要在这里重建卡片。**
      // 轮询每 5 秒跑一次，而 render() 会 `replaceChildren` —— 那会把正在输入的文字框、
      // 正在选的时间框整个换掉，焦点与光标一起丢；用户看到的就是"打字一两秒就被中断"。
      // 数据照常更新（到期气泡仍然会弹），卡片只在打开菜单/切页/操作完成时重建。
      checkDue()
    })
  }

  load()
  setInterval(load, 5000)
})()
