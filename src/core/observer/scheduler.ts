import type Watcher from './watcher'
import config from '../config'
import Dep, { cleanupDeps } from './dep'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import { warn, nextTick, devtools, inBrowser, isIE } from '../util/index'
import type { Component } from 'types/component'

export const MAX_UPDATE_COUNT = 100

const queue: Array<Watcher> = []
const activatedChildren: Array<Component> = []
let has: { [key: number]: true | undefined | null } = {}
let circular: { [key: number]: number } = {}
let waiting = false
let flushing = false
let index = 0

/**
 * Reset the scheduler's state.
 */
function resetSchedulerState() {
  index = queue.length = activatedChildren.length = 0
  has = {}
  if (__DEV__) {
    circular = {}
  }
  waiting = flushing = false
}

// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
export let currentFlushTimestamp = 0

// Async edge case fix requires storing an event listener's attach timestamp.
let getNow: () => number = Date.now

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
if (inBrowser && !isIE) {
  const performance = window.performance
  if (
    performance &&
    typeof performance.now === 'function' &&
    getNow() > document.createEvent('Event').timeStamp
  ) {
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    getNow = () => performance.now()
  }
}

const sortCompareFn = (a: Watcher, b: Watcher): number => {
  if (a.post) {
    if (!b.post) return 1
  } else if (b.post) {
    return -1
  }

  // 按照 id 从小到大排序
  return a.id - b.id
}

/**
 * Flush both queues and run the watchers.
 */
// 刷新 Watcher 队列，执行 Watcher 更新
function flushSchedulerQueue() {
  currentFlushTimestamp = getNow()
  flushing = true
  let watcher, id

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.

  // 在调用、更新前对 Watcher 队列进行一个排序
  // 1. 保证组件的更新是先更新父节点，再更新子节点
  // 2. user Watcher 闭渲染 Watcher 更早执行（引入 user Watcher 比渲染 Watcher 更早创建）
  //    user Watcher 是 computedWatcher 和 watchWatcher，在 initState 的时候创建
  //    renderWatcher 是在 mountComponent，也就是挂载节点的时候才进行创建
  // 3. 如果在父组件 Watcher 运行的时候，这个组件被销毁了，这个组件对应的 Watcher 就不需要再执行了
  queue.sort(sortCompareFn)

  // do not cache length because more watchers might be pushed
  // as we run existing watchers
  // 不缓存队列长度，因为在更新的时候可能会触发另外的更新，导致又添加了新的 Watcher 进来
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index]
    if (watcher.before) {
      watcher.before()
    }
    id = watcher.id
    has[id] = null

    // 真正调用 watcher 更新的地方
    watcher.run()
    // in dev build, check and stop circular updates.
    if (__DEV__ && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' +
            (watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`),
          watcher.vm
        )
        break
      }
    }
  }

  // keep copies of post queues before resetting state
  const activatedQueue = activatedChildren.slice()
  const updatedQueue = queue.slice()

  resetSchedulerState()

  // call component updated and activated hooks
  callActivatedHooks(activatedQueue)
  callUpdatedHooks(updatedQueue)
  cleanupDeps()

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

function callUpdatedHooks(queue: Watcher[]) {
  let i = queue.length
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    if (vm && vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'updated')
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
export function queueActivatedComponent(vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false
  activatedChildren.push(vm)
}

function callActivatedHooks(queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 */
// 将一个观察者对象 push 进观察者队列
// 如果在队列中已经存在相同的 id 则该观察者对象将被跳过，除非它是在队列被刷新时推送
export function queueWatcher(watcher: Watcher) {

  // 获取 watcher 的 id
  const id = watcher.id

  // 如果存在相同的 id，跳过
  // watcher 去重
  if (has[id] != null) {
    return
  }

  // 如果没有对应回调方法
  if (watcher === Dep.target && watcher.noRecurse) {
    return
  }

  // 标记当前 watcher 已经在队列中
  has[id] = true

  // 如果不在执行中，不在更新队列
  if (!flushing) {

    // 把当前 watcher 加进队列
    queue.push(watcher)
  } else {
    // if already flushing, splice the watcher based on its id
    // if already past its id, it will be run next immediately.
    // 如果已经在刷新中
    // 在队列中寻找当前 watcher 的前一项
    let i = queue.length - 1
    while (i > index && queue[i].id > watcher.id) {
      i--
    }
    // 把当前的 watcher 放到前一项的后面，保证下一个执行当前 watcher
    queue.splice(i + 1, 0, watcher)
  }
  // queue the flush
  if (!waiting) {
    waiting = true

    if (__DEV__ && !config.async) {
      flushSchedulerQueue()
      return
    }

    // 进行异步调用
    nextTick(flushSchedulerQueue)
  }
}
