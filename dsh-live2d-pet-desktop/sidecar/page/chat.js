// 桌宠 AI 聊天界面（桌面窗口与 DSH 页面共用的页面脚本）。
//
// 和 toolbox.js 一样是原生 DOM：不改 client.js，卡片挂 `data-panel`，hover.js 的
// 穿透判定会把光标落在上面的窗口切成"吃鼠标"。
//
// 数据全部走宿主插件 `/api/pet-chat/*`（复用 DSH 的 llm 服务，页面不接触任何密钥）。
(function () {
  'use strict'
  if (window.__ptbChat) return

  var API = '/api/pet-chat'
  var SIGNAL = 'x-dsh-pet-chat'
  var PET = '[data-dsh-live2d-pet]'

  var state = {
    open: false,
    view: 'chat',      // chat | persona
    messages: [],
    persona: '',
    usage: null,
    model: '',
    historyEnabled: true,
    streaming: false,
    controller: null,
    error: '',
  }

  var CSS = [
    '#ptb-chat{position:fixed;pointer-events:auto;display:none;width:300px;max-height:min(460px,80vh);',
    'flex-direction:column;border-radius:16px;background:rgba(255,250,240,.98);border:1px solid rgba(139,158,174,.55);',
    'box-shadow:0 14px 36px rgba(48,67,86,.24);color:#34465a;font-size:13px;line-height:1.55;',
    'font-family:"Microsoft YaHei UI","PingFang SC","Segoe UI",system-ui,sans-serif;backdrop-filter:blur(10px);z-index:2147483001}',
    '#ptb-chat *{box-sizing:border-box}',
    '.ptb-chat-head{display:flex;align-items:center;gap:6px;padding:9px 10px 7px;border-bottom:1px solid rgba(139,158,174,.28)}',
    '.ptb-chat-title{flex:1;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.ptb-chat-model{font-size:10px;color:#8b9eae;font-weight:400}',
    '.ptb-chat-btn{border:0;background:transparent;color:#5b7c99;font:inherit;font-size:11px;cursor:pointer;',
    'padding:3px 6px;border-radius:7px;white-space:nowrap}',
    '.ptb-chat-btn:hover{background:rgba(139,158,174,.18)}',
    '.ptb-chat-btn:disabled{opacity:.4;cursor:default}',
    '.ptb-chat-body{flex:1;min-height:120px;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px}',
    '.ptb-msg{max-width:86%;padding:7px 10px;border-radius:12px;white-space:pre-wrap;word-break:break-word}',
    '.ptb-msg[data-role="user"]{align-self:flex-end;background:#5b7c99;color:#fff;border-bottom-right-radius:4px}',
    '.ptb-msg[data-role="assistant"]{align-self:flex-start;background:#fff;border:1px solid rgba(139,158,174,.4);border-bottom-left-radius:4px}',
    '.ptb-msg[data-role="error"]{align-self:center;background:rgba(192,57,43,.08);color:#c0392b;font-size:12px}',
    '.ptb-chat-foot{border-top:1px solid rgba(139,158,174,.28);padding:8px}',
    '.ptb-chat-input{width:100%;min-height:34px;max-height:96px;resize:none;padding:7px 9px;border-radius:10px;',
    'border:1px solid rgba(139,158,174,.55);background:#fff;color:#34465a;font:inherit;font-size:12px;line-height:1.5}',
    '.ptb-chat-input:focus{outline:none;border-color:#5b7c99}',
    '.ptb-chat-actions{display:flex;align-items:center;gap:6px;margin-top:6px}',
    '.ptb-chat-status{flex:1;min-width:0;font-size:10px;color:#8b9eae;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.ptb-chat-primary{flex:none;height:28px;padding:0 12px;border-radius:9px;border:1px solid #5b7c99;',
    'background:#5b7c99;color:#fff;font:inherit;font-size:12px;cursor:pointer}',
    '.ptb-chat-primary:disabled{opacity:.5;cursor:default}',
    '.ptb-chat-persona{display:none;flex:1;min-height:0;flex-direction:column;padding:8px}',
    '.ptb-chat-persona textarea{flex:1;min-height:180px;resize:none;padding:8px 9px;border-radius:10px;',
    'border:1px solid rgba(139,158,174,.55);background:#fff;color:#34465a;font:inherit;font-size:12px;line-height:1.6}',
    '.ptb-chat-persona .ptb-chat-actions{margin-top:8px}',
    '.ptb-chat-toggle{display:flex;align-items:center;gap:6px;font-size:11px;color:#5b7c99;padding:4px 2px}',
  ].join('')

  var style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)

  var card = document.createElement('div')
  card.id = 'ptb-chat'
  card.setAttribute('data-panel', '')

  var head = document.createElement('div')
  head.className = 'ptb-chat-head'

  var title = document.createElement('span')
  title.className = 'ptb-chat-title'
  title.textContent = '聊天'

  var modelLabel = document.createElement('span')
  modelLabel.className = 'ptb-chat-model'

  var personaBtn = document.createElement('button')
  personaBtn.className = 'ptb-chat-btn'
  personaBtn.type = 'button'
  personaBtn.textContent = '性格'

  var clearBtn = document.createElement('button')
  clearBtn.className = 'ptb-chat-btn'
  clearBtn.type = 'button'
  clearBtn.textContent = '清空'

  var closeBtn = document.createElement('button')
  closeBtn.className = 'ptb-chat-btn'
  closeBtn.type = 'button'
  closeBtn.textContent = '×'
  closeBtn.title = '关闭'

  head.append(title, modelLabel, personaBtn, clearBtn, closeBtn)

  var body = document.createElement('div')
  body.className = 'ptb-chat-body'

  var foot = document.createElement('div')
  foot.className = 'ptb-chat-foot'

  var input = document.createElement('textarea')
  input.className = 'ptb-chat-input'
  input.rows = 2
  input.placeholder = '和她说点什么…（Enter 发送，Shift+Enter 换行）'

  var actions = document.createElement('div')
  actions.className = 'ptb-chat-actions'

  var status = document.createElement('span')
  status.className = 'ptb-chat-status'

  var sendBtn = document.createElement('button')
  sendBtn.className = 'ptb-chat-primary'
  sendBtn.type = 'button'
  sendBtn.textContent = '发送'

  actions.append(status, sendBtn)
  foot.append(input, actions)

  var personaView = document.createElement('div')
  personaView.className = 'ptb-chat-persona'

  var personaInput = document.createElement('textarea')
  var personaActions = document.createElement('div')
  personaActions.className = 'ptb-chat-actions'
  var historyToggle = document.createElement('label')
  historyToggle.className = 'ptb-chat-toggle'
  var historyCheck = document.createElement('input')
  historyCheck.type = 'checkbox'
  var historyText = document.createElement('span')
  historyText.textContent = '保存本地历史'
  historyToggle.append(historyCheck, historyText)
  var personaSave = document.createElement('button')
  personaSave.className = 'ptb-chat-primary'
  personaSave.type = 'button'
  personaSave.textContent = '保存'
  var personaBack = document.createElement('button')
  personaBack.className = 'ptb-chat-btn'
  personaBack.type = 'button'
  personaBack.textContent = '返回'
  personaActions.append(historyToggle, personaBack, personaSave)
  personaView.append(personaInput, personaActions)

  card.append(head, body, foot, personaView)
  document.body.appendChild(card)

  /* ---------------------------------------------------------------- utils */

  function h(tag, props, children) {
    var node = document.createElement(tag)
    if (props) {
      for (var key in props) {
        if (!Object.prototype.hasOwnProperty.call(props, key)) continue
        var value = props[key]
        if (value === null || value === undefined || value === false) continue
        if (key === 'class') node.className = value
        else if (key === 'text') node.textContent = String(value)
        else if (key === 'onclick') node.addEventListener('click', value)
        else if (value === true) node.setAttribute(key, '')
        else node.setAttribute(key, String(value))
      }
    }
    if (children) {
      for (var index = 0; index < children.length; index += 1) {
        var child = children[index]
        if (child === null || child === undefined) continue
        node.appendChild(child.nodeType ? child : document.createTextNode(String(child)))
      }
    }
    return node
  }

  function petRect() {
    var pet = document.querySelector(PET)
    if (!pet) return null
    var rect = pet.getBoundingClientRect()
    if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.8) {
      var canvas = pet.querySelector('canvas')
      if (canvas) rect = canvas.getBoundingClientRect()
    }
    if (rect.width < 30 || rect.height < 30) return null
    return rect
  }

  function place() {
    var rect = petRect()
    card.style.visibility = 'hidden'
    card.style.display = 'flex'
    var width = card.offsetWidth
    var height = card.offsetHeight
    var left = rect ? rect.left - width - 16 : 120
    if (left < 8) left = rect ? rect.right + 16 : 120
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8
    var top = rect ? rect.top + rect.height / 2 - height / 2 : 120
    top = Math.max(8, Math.min(top, window.innerHeight - height - 8))
    card.style.left = Math.max(8, left) + 'px'
    card.style.top = top + 'px'
    card.style.visibility = 'visible'
  }

  function apiGet(path) {
    return fetch(API + path, { headers: { accept: 'application/json' }, cache: 'no-store' }).then(function (response) {
      return response.json().catch(function () { return null }).then(function (data) {
        if (!response.ok || data === null || data.ok === false) {
          throw new Error(data && data.error ? data.error : 'HTTP ' + response.status)
        }
        return data
      })
    })
  }

  function apiPost(path, body) {
    return fetch(API + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [SIGNAL]: '1' },
      body: JSON.stringify(body),
      cache: 'no-store',
    }).then(function (response) {
      return response.json().catch(function () { return null }).then(function (data) {
        if (!response.ok || data === null || data.ok === false) {
          throw new Error(data && data.error ? data.error : 'HTTP ' + response.status)
        }
        return data
      })
    })
  }

  /* --------------------------------------------------------------- render */

  function messageNode(role, text) {
    var node = h('div', { class: 'ptb-msg', 'data-role': role })
    node.textContent = text
    return node
  }

  function renderMessages() {
    body.replaceChildren()
    var list = state.messages.slice(-24)
    for (var index = 0; index < list.length; index += 1) {
      body.appendChild(messageNode(list[index].role, list[index].text))
    }
    body.scrollTop = body.scrollHeight
  }

  function setStatus(text) {
    status.textContent = text
  }

  function showError(text) {
    body.appendChild(messageNode('error', text))
    body.scrollTop = body.scrollHeight
    setStatus('出错了')
  }

  function setStreaming(on) {
    state.streaming = on
    sendBtn.textContent = on ? '停止' : '发送'
    input.disabled = on
    personaBtn.disabled = on
    if (on) setStatus('正在回复…')
  }

  /* ----------------------------------------------------------------- chat */

  function loadState() {
    return apiGet('/state').then(function (data) {
      state.messages = Array.isArray(data.messages) ? data.messages : []
      state.persona = typeof data.persona === 'string' ? data.persona : ''
      state.usage = data.usage || null
      state.model = data.model || ''
      state.historyEnabled = data.historyEnabled !== false
      modelLabel.textContent = data.model ? data.model : ''
      historyCheck.checked = state.historyEnabled
      renderMessages()
      if (state.usage) setStatus('累计 ' + (state.usage.input || 0) + ' in / ' + (state.usage.output || 0) + ' out')
    }).catch(function (error) {
      showError('连不上 DSH：' + String(error.message || error))
    })
  }

  function endStream() {
    setStreaming(false)
    state.controller = null
    sendBtn.disabled = false
  }

  function send() {
    if (state.streaming) {
      if (state.controller) state.controller.abort()
      return
    }
    var text = input.value.trim()
    if (text === '') return
    state.error = ''
    input.value = ''
    body.appendChild(messageNode('user', text))
    var reply = messageNode('assistant', '')
    body.appendChild(reply)
    body.scrollTop = body.scrollHeight
    state.messages.push({ role: 'user', text: text, at: Date.now() })

    var controller = new AbortController()
    state.controller = controller
    setStreaming(true)
    sendBtn.disabled = false

    fetch(API + '/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', [SIGNAL]: '1' },
      body: JSON.stringify({ text: text }),
      signal: controller.signal,
      cache: 'no-store',
    }).then(function (response) {
      if (!response.ok || response.body === null) {
        throw new Error('HTTP ' + response.status)
      }
      var reader = response.body.getReader()
      var decoder = new TextDecoder()
      var buffer = ''
      var replyText = ''
      var read = function () {
        return reader.read().then(function (result) {
          if (result.done) {
            finish(replyText)
            return
          }
          buffer += decoder.decode(result.value, { stream: true })
          var parts = buffer.split('\n\n')
          buffer = parts.pop()
          for (var index = 0; index < parts.length; index += 1) {
            var frame = parts[index]
            var event = ''
            var dataLine = ''
            var lines = frame.split('\n')
            for (var line = 0; line < lines.length; line += 1) {
              if (lines[line].indexOf('event:') === 0) event = lines[line].slice(6).trim()
              else if (lines[line].indexOf('data:') === 0) dataLine += lines[line].slice(5).trim()
            }
            if (dataLine === '') continue
            var payload
            try { payload = JSON.parse(dataLine) } catch (error) { continue }
            if (event === 'delta' && typeof payload.text === 'string') {
              replyText += payload.text
              reply.textContent = replyText
              body.scrollTop = body.scrollHeight
            } else if (event === 'done') {
              state.usage = payload.usage || state.usage
            } else if (event === 'error') {
              throw new Error(payload.message || 'model-error')
            }
          }
          return read()
        })
      }
      return read()
    }).catch(function (error) {
      if (controller.signal.aborted) {
        if (reply.textContent === '') reply.textContent = '（已停止）'
        setStatus('已停止')
      } else {
        reply.textContent = ''
        showError(String(error.message || error))
      }
      endStream()
    })
  }

  var finish = function (replyText) {
    var text = (replyText || '').trim()
    if (text !== '') state.messages.push({ role: 'assistant', text: text, at: Date.now() })
    if (state.usage) setStatus('累计 ' + (state.usage.input || 0) + ' in / ' + (state.usage.output || 0) + ' out')
    else setStatus('')
    endStream()
  }

  /* -------------------------------------------------------------- persona */

  function openPersona() {
    state.view = 'persona'
    personaInput.value = state.persona
    historyCheck.checked = state.historyEnabled
    body.style.display = 'none'
    foot.style.display = 'none'
    personaView.style.display = 'flex'
    personaInput.focus()
    place()
  }

  function closePersona() {
    state.view = 'chat'
    personaView.style.display = 'none'
    body.style.display = ''
    foot.style.display = ''
    place()
  }

  function savePersona() {
    apiPost('/persona', { text: personaInput.value }).then(function (data) {
      state.persona = data.persona || personaInput.value
      setStatus('性格已保存')
      closePersona()
    }).catch(function (error) {
      setStatus('保存失败：' + String(error.message || error))
    })
  }

  function saveHistoryToggle() {
    state.historyEnabled = historyCheck.checked
    apiPost('/config', { historyEnabled: historyCheck.checked }).then(function () {
      setStatus(historyCheck.checked ? '会保存本地历史' : '不再保存本地历史')
    }).catch(function (error) {
      setStatus('设置失败：' + String(error.message || error))
    })
  }

  var clearArmed = 0
  function clearHistory() {
    // WebView2 里 window.confirm() 不一定弹得出来，改成"点两次确认"。
    if (Date.now() - clearArmed > 3000) {
      clearArmed = Date.now()
      clearBtn.textContent = '再点一次'
      setStatus('再点一次清空本地记录')
      setTimeout(function () {
        if (Date.now() - clearArmed > 3000) clearBtn.textContent = '清空'
      }, 3200)
      return
    }
    clearArmed = 0
    clearBtn.textContent = '清空'
    apiPost('/reset', {}).then(function () {
      state.messages = []
      renderMessages()
      setStatus('已清空')
    }).catch(function (error) {
      setStatus('清空失败：' + String(error.message || error))
    })
  }

  /* ---------------------------------------------------------------- modal */

  function open() {
    if (state.open) return
    state.open = true
    state.view = 'chat'
    personaView.style.display = 'none'
    body.style.display = ''
    foot.style.display = ''
    card.style.display = 'flex'
    place()
    loadState()
    setTimeout(function () { input.focus() }, 60)
  }

  function close() {
    state.open = false
    if (state.controller) state.controller.abort()
    card.style.display = 'none'
  }

  /* -------------------------------------------------------------- events */

  sendBtn.addEventListener('click', send)
  personaBtn.addEventListener('click', function () {
    if (state.view === 'persona') closePersona()
    else openPersona()
  })
  clearBtn.addEventListener('click', clearHistory)
  closeBtn.addEventListener('click', close)
  personaSave.addEventListener('click', savePersona)
  personaBack.addEventListener('click', closePersona)
  historyCheck.addEventListener('change', saveHistoryToggle)

  // 输入法：拼音选字期间按回车不能发送。
  var composing = false
  input.addEventListener('compositionstart', function () { composing = true })
  input.addEventListener('compositionend', function () { composing = false })
  input.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return
    if (event.isComposing || composing || event.shiftKey) return
    event.preventDefault()
    send()
  })

  // 双击桌宠打开聊天（单击互动保持原样）。
  document.addEventListener('dblclick', function (event) {
    var target = event.target
    if (!target || !target.closest) return
    if (!target.closest(PET)) return
    if (state.open) close()
    else open()
  }, true)

  window.addEventListener('resize', function () {
    if (state.open) place()
  })

  window.__ptbChat = {
    open: open,
    close: close,
    toggle: function () { if (state.open) close(); else open() },
    isOpen: function () { return state.open },
  }
})()
