import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  invokeWithErrorHandling,
  noop,
  isFunction
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget, DepTarget } from './dep'
import { DebuggerEvent, DebuggerOptions } from 'v3/debug'

import type { SimpleSet } from '../util/index'
import type { Component } from 'types/component'
import { activeEffectScope, recordEffectScope } from 'v3/reactivity/effectScope'

let uid = 0

/**
 * @internal
 */
export interface WatcherOptions extends DebuggerOptions {
  deep?: boolean
  user?: boolean
  lazy?: boolean
  sync?: boolean
  before?: Function
}

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 * @internal
 */
// (核心)观察者
// 渲染 Watcher 和 computedWatcher 最大的区别如下：
// 1. 渲染 Watcher 只能作为依赖被收集到某个数据的 deps 中
// 2. computedWatcher 可以收集别的 Watcher 作为自己的依赖放到 Watcher 的 deps 中(也就是提供的 depend 方法)
export default class Watcher implements DepTarget {
  vm?: Component | null
  expression: string
  cb: Function
  id: number
  deep: boolean
  user: boolean
  lazy: boolean
  sync: boolean
  dirty: boolean
  active: boolean
  deps: Array<Dep>
  newDeps: Array<Dep>
  depIds: SimpleSet
  newDepIds: SimpleSet
  before?: Function
  onStop?: Function
  noRecurse?: boolean
  getter: Function
  value: any
  post: boolean

  // dev only
  onTrack?: ((event: DebuggerEvent) => void) | undefined
  onTrigger?: ((event: DebuggerEvent) => void) | undefined

  constructor(
    // vm 实例
    vm: Component | null,

    // getter 函数
    expOrFn: string | (() => any),

    // 执行完 update 之后的回调(比如 watch 监听属性对应回调)
    cb: Function,
    options?: WatcherOptions | null,

    // 是否是渲染 Watcher
    isRenderWatcher?: boolean
  ) {
    recordEffectScope(
      this,
      // if the active effect scope is manually created (not a component scope),
      // prioritize it
      activeEffectScope && !activeEffectScope._vm
        ? activeEffectScope
        : vm
        ? vm._scope
        : undefined
    )

    // 渲染 Watcher 挂载到 vm._watcher 上
    if ((this.vm = vm) && isRenderWatcher) {
      vm._watcher = this
    }
    // options
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      this.lazy = !!options.lazy
      this.sync = !!options.sync
      this.before = options.before
      if (__DEV__) {
        this.onTrack = options.onTrack
        this.onTrigger = options.onTrigger
      }
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    // 保存传入的属性
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.post = false
    // 脏值检查，computed
    this.dirty = this.lazy // for lazy watchers
    // 之前的依赖
    this.deps = []
    // 新依赖
    this.newDeps = []
    // 依赖对应的 id，去重
    this.depIds = new Set()
    // 新依赖对应的 id，去重
    this.newDepIds = new Set()
    this.expression = __DEV__ ? expOrFn.toString() : ''
    // parse expression for getter
    if (isFunction(expOrFn)) {
      this.getter = expOrFn
    } else {
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        __DEV__ &&
          warn(
            `Failed watching path: "${expOrFn}" ` +
              'Watcher only accepts simple dot-delimited paths. ' +
              'For full control, use a function instead.',
            vm
          )
      }
    }
    // computedWatcher 在首次进来的时候不会调用 get 求值
    this.value = this.lazy ? undefined : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  get() {
    // 执行一次数据获取
    // 把当前的 Watcher 进栈，执行的是当前 Watcher 的 getter
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      value = this.getter.call(vm, vm)
    } catch (e: any) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      // 如果存在 deep，则触发每个深层对象的依赖，追踪其变化
      if (this.deep) {

        // 递归每一个对象或者数组，触发它们的getter
        // 保证对象或数组的每一个成员都被依赖收集，形成一个“深（deep）”依赖关系
        traverse(value)
      }
      // 把当前的 Watcher 出栈
      // 用完之后删除 target，方便下一次继续执行 Watcher 的方法
      popTarget()

      // 每次 get 之后需要遍历 deps，移除对 deps.subs 数组中 Watcher 的订阅
      // 考虑根据 v-if 条件渲染不同的模板 a 和 b
      // 当满足某个条件的时候渲染 a，会去访问到 a 中的数据
      // 如果对 a 使用的数据添加了 getter 并进行了依赖收集，当修改 a 的时候会通知订阅者更新
      // 如果事件改变了条件需要渲染 b 的时候，就会对 b 使用的数据添加 getter 和依赖收集
      // 如果不进行依赖的移除，如果这时修改 a 模板的数据，就会通知 a 数据订阅的回调，重新进行 render
      // 但其实现在 a 已经不在页面上展示了，这个时候 render 的话对于性能是一种浪费
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  // 添加一个依赖关系到 Deps 集合中
  addDep(dep: Dep) {
    const id = dep.id
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)

      // 让当前 Watcher 的 deps 中持有依赖属性的 dep
      // 让 Watcher 知道自己被谁依赖了
      this.newDeps.push(dep)

      // 把 Watcher 加到依赖篮子里
      if (!this.depIds.has(id)) {

        // 使得依赖属性的 dep 中的 subs 持有 Watcher
        // 让 dep 知道自己依赖的 Watcher 是谁
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  cleanupDeps() {
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    let tmp: any = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update() {
    /* istanbul ignore else */
    if (this.lazy) {

      // 表示依赖变更，值脏了，需要重新计算
      // 重新计算的过程在 computed 的 getter 中。因为需要触发对应依赖属性的变更
      this.dirty = true
    } else if (this.sync) {

      // 同步则执行 run 直接渲染视图
      this.run()
    } else {

      // 异步推送到观察者队列中，下一个 tick 时调用
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  // 调度者工作接口，将被调度者回调
  run() {
    if (this.active) {
      // get 操作在获取 value 本身也会执行 getter
      // 从而调用 update 更新视图
      const value = this.get()
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        // 设置新的值
        this.value = value

        // 触发 Watcher 回调
        if (this.user) {
          const info = `callback for watcher "${this.expression}"`
          invokeWithErrorHandling(
            this.cb,
            this.vm,
            [value, oldValue],
            this.vm,
            info
          )
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate() {

    // 调用 get 函数求值
    this.value = this.get()

    // 把 dirty 标记为 false，表示有缓存了
    // 下次没有特殊情况再读取到相同值的时候，发现 dirty 是 false 了，就可以直接就返回
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  // 收集该 Watcher 的所有 deps 依赖
  // 收集的依赖也是 Watcher
  // 这是给 computed 属性使用的
  depend() {
    let i = this.deps.length
    while (i--) {

      // 添加依赖
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown() {
    if (this.vm && !this.vm._isBeingDestroyed) {
      remove(this.vm._scope.effects, this)
    }
    if (this.active) {
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
      if (this.onStop) {
        this.onStop()
      }
    }
  }
}
