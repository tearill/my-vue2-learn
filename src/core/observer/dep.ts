import config from '../config'
import { DebuggerOptions, DebuggerEventExtraInfo } from 'v3'

let uid = 0

const pendingCleanupDeps: Dep[] = []

export const cleanupDeps = () => {
  for (let i = 0; i < pendingCleanupDeps.length; i++) {
    const dep = pendingCleanupDeps[i]
    dep.subs = dep.subs.filter(s => s)
    dep._pending = false
  }
  pendingCleanupDeps.length = 0
}

/**
 * @internal
 */
export interface DepTarget extends DebuggerOptions {
  id: number
  addDep(dep: Dep): void
  update(): void
}

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 * @internal
 */
export default class Dep {

  // 全局唯一的 Watcher
  // 同一时间只能有一个全局的 Watcher 被计算
  // target 表明当前正在计算的 Watcher
  static target?: DepTarget | null
  id: number
  subs: Array<DepTarget | null>
  // pending subs cleanup
  _pending = false

  constructor() {

    // 自增的 id，每次 new Dep 都不一样
    // 保证每个数据对应的 Dep 是独立的
    this.id = uid++

    // 所有的依赖篮子
    // 也就是所有的 Watcher
    this.subs = []
  }

  // 添加一个依赖
  addSub(sub: DepTarget) {
    this.subs.push(sub)
  }

  // 移除一个依赖
  removeSub(sub: DepTarget) {
    // #12696 deps with massive amount of subscribers are extremely slow to
    // clean up in Chromium
    // to workaround this, we unset the sub for now, and clear them on
    // next scheduler flush.
    this.subs[this.subs.indexOf(sub)] = null
    if (!this._pending) {
      this._pending = true
      pendingCleanupDeps.push(this)
    }
  }

  // 依赖收集，当存在 Dep.target 的时候添加
  depend(info?: DebuggerEventExtraInfo) {
    if (Dep.target) {

      // 调用 watcher 的 addDep
      // 会经过一系列判断，最终调用 Dep 的 addSub，把 Watcher 加到依赖篮子里
      // 这是一个相互关联的过程，让 Watcher 知道自己依赖了它
      Dep.target.addDep(this)
      if (__DEV__ && info && Dep.target.onTrack) {
        Dep.target.onTrack({
          effect: Dep.target,
          ...info
        })
      }
    }
  }

  // 通知所有订阅者（Watcher）进行更新
  // 通知所有的依赖们，都进行更新（通知所有的 Watcher）
  notify(info?: DebuggerEventExtraInfo) {
    // stabilize the subscriber list first
    // 确保所有的依赖都是存在的
    const subs = this.subs.filter(s => s) as DepTarget[]
    if (__DEV__ && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    for (let i = 0, l = subs.length; i < l; i++) {
      const sub = subs[i]
      if (__DEV__ && info) {
        sub.onTrigger &&
          sub.onTrigger({
            effect: subs[i],
            ...info
          })
      }

      // 调用 update 方法，重新渲染
      // 这个 update 方法是 Watcher 的
      sub.update()
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
// 依赖收集完需要将 Dep.target 设为 null，防止后面重复添加依赖
Dep.target = null
const targetStack: Array<DepTarget | null | undefined> = []

// 将 watcher 观察者实例设置给 Dep.target，用以依赖收集。同时将该实例存入 target 栈中
export function pushTarget(target?: DepTarget | null) {
  targetStack.push(target)
  Dep.target = target
}

// 将观察者实例从 target 栈中取出并设置给 Dep.target
export function popTarget() {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}
