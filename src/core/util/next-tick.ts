/* globals MutationObserver */

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIE, isIOS, isNative } from './env'

export let isUsingMicroTask = false

// 存放异步执行的回调，任务队列
const callbacks: Array<Function> = []

// 一个标记位，如果已经有 timerFun 被推送到任务队列中去则不需要重复推送
let pending = false

// 在当前执行的任务结束之后执行回调
function flushCallbacks() {
  // 一个标记位，标记等待状态（即函数已经被推入任务队列或者主线程，已经在等待当前栈执行完毕去执行）
  // 这样就不需要在 push 多个回调到 callbacks 时将 timerFunc 多次推入任务队列或者主线程
  pending = false

  // 复制回调队列
  const copies = callbacks.slice(0)

  // 清空回调
  callbacks.length = 0

  // 执行所有 callback
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// Here we have async deferring wrappers using microtasks.
// In 2.5 we used (macro) tasks (in combination with microtasks).
// However, it has subtle problems when state is changed right before repaint
// (e.g. #6813, out-in transitions).
// Also, using (macro) tasks in event handler would cause some weird behaviors
// that cannot be circumvented (e.g. #7109, #7153, #7546, #7834, #8109).
// So we now use microtasks everywhere, again.
// A major drawback of this tradeoff is that there are some scenarios
// where microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690, which have workarounds)
// or even between bubbling of the same event (#6566).
let timerFunc

// The nextTick behavior leverages the microtask queue, which can be accessed
// via either native Promise.then or MutationObserver.
// MutationObserver has wider support, however it is seriously bugged in
// UIWebView in iOS >= 9.3.3 when triggered in touch event handlers. It
// completely stops working after triggering a few times... so, if native
// Promise is available, we will use it:
/* istanbul ignore next, $flow-disable-line */
// 下面这一段代码的目的是在下一个事件循环中执行 flushCallbacks
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()

  // 微任务
  timerFunc = () => {
    p.then(flushCallbacks)
    // In problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    if (isIOS) setTimeout(noop)
  }
  isUsingMicroTask = true
} else if (
  !isIE &&
  typeof MutationObserver !== 'undefined' &&
  (isNative(MutationObserver) ||
    // PhantomJS and iOS 7.x
    MutationObserver.toString() === '[object MutationObserverConstructor]')
) {
  // Use MutationObserver where native Promise is not available,
  // e.g. PhantomJS, iOS7, Android 4.4
  // (#6466 MutationObserver is unreliable in IE11)
  // Promise 不存在的时候，使用 MutationObserver 代替 Promise
  // 新建一个 textNode 的 DOM 对象，用 MutationObserver 绑定该 DOM 并指定回调函数
  // 在 DOM 变化的时候则会触发回调，该回调会进入主线程（比任务队列优先执行）
  // 即 textNode.data = String(counter) 时便会触发回调
  let counter = 1
  const observer = new MutationObserver(flushCallbacks)
  const textNode = document.createTextNode(String(counter))
  observer.observe(textNode, {
    characterData: true
  })
  timerFunc = () => {
    counter = (counter + 1) % 2
    textNode.data = String(counter)
  }
  isUsingMicroTask = true
} else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // 宏任务
  // Fallback to setImmediate.
  // Technically it leverages the (macro) task queue,
  // but it is still a better choice than setTimeout.
  // MutationObserver 不存在的时候降级使用 setImmediate
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else {
  // Fallback to setTimeout.
  // 最终降级使用 setTimeout，将回调推入任务队列尾部
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

export function nextTick(): Promise<void>
export function nextTick<T>(this: T, cb: (this: T, ...args: any[]) => any): void
export function nextTick<T>(cb: (this: T, ...args: any[]) => any, ctx: T): void
/**
 * @internal
 */
// nextTick 实现
// nextTick 的实现是 microTimerFunc
export function nextTick(cb?: (...args: any[]) => any, ctx?: object) {
  let _resolve

  // 将回调函数加入异步队列
  // nextTick 是把要执行的任务放入一个队列中，在下一个 tick 同步执行
  callbacks.push(() => {

    // 不直接放入，包裹了一层，使得回调调用的时候支持错误处理
    // 除了渲染Watcher  还有自己手动调用的 nextTick 一起被收集到数组
    if (cb) {
      try {

        // 尝试调用
        cb.call(ctx)
      } catch (e: any) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      _resolve(ctx)
    }
  })

  // 当前没有异步任务正在执行
  // 如果多次调用 nextTick  只会执行一次异步 等异步队列清空之后再把标志变为false
  if (!pending) {
    pending = true

    // 通过 setTimeout 将 flushCallbacks 方法推入下一个事件循环中执行
    // 也就是在下一个事件循环的时候执行所有的回调
    timerFunc()
  }
  // $flow-disable-line
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
