import config from '../config'
import Watcher, { WatcherOptions } from '../observer/watcher'
import { mark, measure } from '../util/perf'
import VNode, { createEmptyVNode } from '../vdom/vnode'
import { updateComponentListeners } from './events'
import { resolveSlots } from './render-helpers/resolve-slots'
import { toggleObserving } from '../observer/index'
import { pushTarget, popTarget } from '../observer/dep'
import type { Component } from 'types/component'
import type { MountedComponentVNode } from 'types/vnode'

import {
  warn,
  noop,
  remove,
  emptyObject,
  validateProp,
  invokeWithErrorHandling
} from '../util/index'
import { currentInstance, setCurrentInstance } from 'v3/currentInstance'
import { getCurrentScope } from 'v3/reactivity/effectScope'
import { syncSetupProxy } from 'v3/apiSetup'

export let activeInstance: any = null
export let isUpdatingChildComponent: boolean = false

// 保存当前的活动实例（activeInstance）到 prevActiveInstance 变量中，并将当前的 Vue 实例设置为活动实例
// activeInstance 是一个全局变量，用于保存当前正在处理的组件实例
// 保存当前的活动实例 activeInstance 是为了在组件渲染过程中建立父子组件之间的关联
export function setActiveInstance(vm: Component) {
  const prevActiveInstance = activeInstance
  activeInstance = vm

  // 返回一个恢复实例的方法，可以在适当的时机手动调用
  return () => {
    activeInstance = prevActiveInstance
  }
}

// 初始化生命周期
export function initLifecycle(vm: Component) {
  const options = vm.$options

  // locate first non-abstract parent
  // 找到第一个不是抽象组件的父级组件
  // 将 vm 对象存储到 parent 组件中（保证 parent 组件是非抽象组件，比如 keep-alive）
  let parent = options.parent
  if (parent && !options.abstract) {
    while (parent.$options.abstract && parent.$parent) {
      parent = parent.$parent
    }
    parent.$children.push(vm)
  }

  vm.$parent = parent
  vm.$root = parent ? parent.$root : vm

  vm.$children = []
  vm.$refs = {}

  // 初始化组件生命周期的一些标识
  vm._provided = parent ? parent._provided : Object.create(null)
  vm._watcher = null
  vm._inactive = null
  vm._directInactive = false
  vm._isMounted = false
  vm._isDestroyed = false
  vm._isBeingDestroyed = false
}

export function lifecycleMixin(Vue: typeof Component) {

  // 更新节点
  // 核心是调用 vm.__patch__，进行 diff 对比
  // 传入的是新的 VNode
  Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
    const vm: Component = this

    // 更新前的节点和 VNode
    // 保存当前的 $el（组件的根 DOM 元素）到 prevEl 变量中，以备后续操作使用
    const prevEl = vm.$el
    // 保存当前的虚拟节点（VNode）到 prevVnode
    const prevVnode = vm._vnode

    // 保存一下当前的 vm 实例
    // 保存当前的活动实例（activeInstance）到 prevActiveInstance 变量中，并将当前的 Vue 实例设置为活动实例
    // activeInstance 是一个全局变量，用于保存当前正在处理的组件实例
    const restoreActiveInstance = setActiveInstance(vm)

    // _vnode 改成新的 VNode
    vm._vnode = vnode

    // Vue.prototype.__patch__ is injected in entry points
    // based on the rendering backend used.
    // 如果之前没有节点，说明是首次渲染
    // 直接渲染新的节点
    if (!prevVnode) {
      // initial render
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
    } else {
      // updates
      // 如果 prevVnode 存在，说明是更新数据，需要对比 diff 然后再更新 DOM
      // 比较新旧 VNode diff，然后更新
      vm.$el = vm.__patch__(prevVnode, vnode)
    }

    // 执行完成了，恢复 vm 实例
    restoreActiveInstance()

    // update __vue__ reference
    // 更新保存的 vm 引用
    if (prevEl) {
      prevEl.__vue__ = null
    }
    if (vm.$el) {
      vm.$el.__vue__ = vm
    }
    // if parent is an HOC, update its $el as well
    // 处理高阶组件（Higher-Order Component，HOC）的更新
    // 高阶组件通过将组件作为参数传递给另一个组件，返回一个新的组件。在这种模式下，高阶组件可能会对内部组件进行一些包装或增强操作
    let wrapper: Component | undefined = vm

    // 通过 while 循环遍历父组件链，判断当前组件是否是一个高阶组件，并且父组件的虚拟节点和当前组件的虚拟节点相同
    // 如果满足这些条件，就将父组件的 $el（根 DOM 元素）更新为当前组件的 $el
    while (
      wrapper &&
      // vm.$vnode 是父组件的 vnode
      wrapper.$vnode &&
      wrapper.$parent &&
      // vm._vnode 是当前组件的 vnode
      wrapper.$vnode === wrapper.$parent._vnode
    ) {
      // 将父组件的 $el（根 DOM 元素）更新为当前组件的 $el
      wrapper.$parent.$el = wrapper.$el
      wrapper = wrapper.$parent

      // 这个操作的目的是确保高阶组件的根元素与被包装的组件的根元素保持一致
      // 由于高阶组件可能会对内部组件进行包装或增强，可能会对根元素进行一些修改
      // 为了保持一致性，需要将父组件的根元素更新为当前组件的根元素
      // 原因：避免多层嵌套之后，根组件的特性丢失
    }
    // updated hook is called by the scheduler to ensure that children are
    // updated in a parent's updated hook.
    // 这个钩子是通过 scheduler 来调度的，这样可以保证子组件的 update 是在父组件的 update 钩子里执行的
  }

  // 强制更新一遍
  Vue.prototype.$forceUpdate = function () {
    const vm: Component = this

    // 这个 watcher 是 renderWatcher
    // 本质上就是触发了 渲染watcher 的重新执行，和修改一个响应式的属性触发更新的原理是一模一样的，只是提供了一个便捷的 api
    // 门面模式
    if (vm._watcher) {
      vm._watcher.update()
    }
  }

  // 销毁示例
  Vue.prototype.$destroy = function () {
    const vm: Component = this

    // 如果正在销毁，不重复处理
    if (vm._isBeingDestroyed) {
      return
    }

    // 开始销毁的时候调用 beforeDestroy
    callHook(vm, 'beforeDestroy')

    // 标记正在销毁中
    vm._isBeingDestroyed = true

    // remove self from parent
    // 把当前实例从它的父节点中移除，断开和父节点的联系
    const parent = vm.$parent
    if (parent && !parent._isBeingDestroyed && !vm.$options.abstract) {
      remove(parent.$children, vm)
    }

    // teardown scope. this includes both the render watcher and other
    // watchers created
    // 销毁 scope
    // 3.29 备注：这里暂时不支持 scope 里面有什么，后面再回来看
    vm._scope.stop()

    // remove reference from data ob
    // frozen object may not have observer.
    // vmCount - 1，vmCount 是当前 vm 实例的个数
    if (vm._data.__ob__) {
      vm._data.__ob__.vmCount--
    }

    // call the last hook...
    // 标记销毁完成
    vm._isDestroyed = true

    // invoke destroy hooks on current rendered tree
    // 调用 patch，销毁当前 render tree
    vm.__patch__(vm._vnode, null)

    // fire destroyed hook
    // 销毁完成，调用 destroyed
    callHook(vm, 'destroyed')

    // turn off all instance listeners.
    // 取消所有的事件监听
    vm.$off()

    // remove __vue__ reference
    // 销毁引用
    if (vm.$el) {
      vm.$el.__vue__ = null
    }

    // release circular reference (#6759)
    // 断开 VNode 连接
    if (vm.$vnode) {
      vm.$vnode.parent = null
    }
  }
}

export function mountComponent(
  vm: Component,
  el: Element | null | undefined,
  hydrating?: boolean
): Component {
  vm.$el = el
  if (!vm.$options.render) {
    // @ts-expect-error invalid type
    vm.$options.render = createEmptyVNode
    if (__DEV__) {
      /* istanbul ignore if */
      if (
        (vm.$options.template && vm.$options.template.charAt(0) !== '#') ||
        vm.$options.el ||
        el
      ) {
        warn(
          'You are using the runtime-only build of Vue where the template ' +
            'compiler is not available. Either pre-compile the templates into ' +
            'render functions, or use the compiler-included build.',
          vm
        )
      } else {
        warn(
          'Failed to mount component: template or render function not defined.',
          vm
        )
      }
    }
  }
  callHook(vm, 'beforeMount')

  let updateComponent
  /* istanbul ignore if */
  if (__DEV__ && config.performance && mark) {
    updateComponent = () => {
      const name = vm._name
      const id = vm._uid
      const startTag = `vue-perf-start:${id}`
      const endTag = `vue-perf-end:${id}`

      mark(startTag)
      const vnode = vm._render()
      mark(endTag)
      measure(`vue ${name} render`, startTag, endTag)

      mark(startTag)
      vm._update(vnode, hydrating)
      mark(endTag)
      measure(`vue ${name} patch`, startTag, endTag)
    }
  } else {

    // vm._render() 生成虚拟 VNode
    // 最终调用 vm._update() 更新 DOM
    updateComponent = () => {
      vm._update(vm._render(), hydrating)
    }
  }

  const watcherOptions: WatcherOptions = {
    before() {
      if (vm._isMounted && !vm._isDestroyed) {
        callHook(vm, 'beforeUpdate')
      }
    }
  }

  if (__DEV__) {
    watcherOptions.onTrack = e => callHook(vm, 'renderTracked', [e])
    watcherOptions.onTrigger = e => callHook(vm, 'renderTriggered', [e])
  }

  // we set this to vm._watcher inside the watcher's constructor
  // since the watcher's initial patch may call $forceUpdate (e.g. inside child
  // component's mounted hook), which relies on vm._watcher being already defined
  // 渲染 Watcher
  // 1. 初始化执行回调函数
  // 2. 当 vm 实例中的监测的数据发生变化的时候执行回调函数
  new Watcher(
    vm,
    updateComponent,
    noop,
    watcherOptions,
    true /* isRenderWatcher */
  )
  hydrating = false

  // flush buffer for flush: "pre" watchers queued in setup()
  const preWatchers = vm._preWatchers
  if (preWatchers) {
    for (let i = 0; i < preWatchers.length; i++) {
      preWatchers[i].run()
    }
  }

  // manually mounted instance, call mounted on self
  // mounted is called for render-created child components in its inserted hook
  // 函数最后判断为根节点的时候设置 vm._isMounted 为 true， 表示这个实例已经挂载了，同时执行 mounted
  // vm.$vnode 表示 Vue 实例的父虚拟 VNode，所以它为 null 则表示当前是根 Vue 的实例
  if (vm.$vnode == null) {
    vm._isMounted = true
    callHook(vm, 'mounted')
  }
  return vm
}

export function updateChildComponent(
  vm: Component,
  propsData: Record<string, any> | null | undefined,
  listeners: Record<string, Function | Array<Function>> | undefined,
  parentVnode: MountedComponentVNode,
  renderChildren?: Array<VNode> | null
) {
  if (__DEV__) {
    isUpdatingChildComponent = true
  }

  // determine whether component has slot children
  // we need to do this before overwriting $options._renderChildren.

  // check if there are dynamic scopedSlots (hand-written or compiled but with
  // dynamic slot names). Static scoped slots compiled from template has the
  // "$stable" marker.
  const newScopedSlots = parentVnode.data.scopedSlots
  const oldScopedSlots = vm.$scopedSlots
  const hasDynamicScopedSlot = !!(
    (newScopedSlots && !newScopedSlots.$stable) ||
    (oldScopedSlots !== emptyObject && !oldScopedSlots.$stable) ||
    (newScopedSlots && vm.$scopedSlots.$key !== newScopedSlots.$key) ||
    (!newScopedSlots && vm.$scopedSlots.$key)
  )

  // Any static slot children from the parent may have changed during parent's
  // update. Dynamic scoped slots may also have changed. In such cases, a forced
  // update is necessary to ensure correctness.
  let needsForceUpdate = !!(
    renderChildren || // has new static slots
    vm.$options._renderChildren || // has old static slots
    hasDynamicScopedSlot
  )

  const prevVNode = vm.$vnode
  vm.$options._parentVnode = parentVnode
  vm.$vnode = parentVnode // update vm's placeholder node without re-render

  if (vm._vnode) {
    // update child tree's parent
    vm._vnode.parent = parentVnode
  }
  vm.$options._renderChildren = renderChildren

  // update $attrs and $listeners hash
  // these are also reactive so they may trigger child update if the child
  // used them during render
  const attrs = parentVnode.data.attrs || emptyObject
  if (vm._attrsProxy) {
    // force update if attrs are accessed and has changed since it may be
    // passed to a child component.
    if (
      syncSetupProxy(
        vm._attrsProxy,
        attrs,
        (prevVNode.data && prevVNode.data.attrs) || emptyObject,
        vm,
        '$attrs'
      )
    ) {
      needsForceUpdate = true
    }
  }
  vm.$attrs = attrs

  // update listeners
  listeners = listeners || emptyObject
  const prevListeners = vm.$options._parentListeners
  if (vm._listenersProxy) {
    syncSetupProxy(
      vm._listenersProxy,
      listeners,
      prevListeners || emptyObject,
      vm,
      '$listeners'
    )
  }
  vm.$listeners = vm.$options._parentListeners = listeners
  updateComponentListeners(vm, listeners, prevListeners)

  // update props
  if (propsData && vm.$options.props) {
    toggleObserving(false)
    const props = vm._props
    const propKeys = vm.$options._propKeys || []
    for (let i = 0; i < propKeys.length; i++) {
      const key = propKeys[i]
      const propOptions: any = vm.$options.props // wtf flow?
      props[key] = validateProp(key, propOptions, propsData, vm)
    }
    toggleObserving(true)
    // keep a copy of raw propsData
    vm.$options.propsData = propsData
  }

  // resolve slots + force update if has children
  if (needsForceUpdate) {
    vm.$slots = resolveSlots(renderChildren, parentVnode.context)
    vm.$forceUpdate()
  }

  if (__DEV__) {
    isUpdatingChildComponent = false
  }
}

function isInInactiveTree(vm) {
  while (vm && (vm = vm.$parent)) {
    if (vm._inactive) return true
  }
  return false
}

export function activateChildComponent(vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = false
    if (isInInactiveTree(vm)) {
      return
    }
  } else if (vm._directInactive) {
    return
  }
  if (vm._inactive || vm._inactive === null) {
    vm._inactive = false
    for (let i = 0; i < vm.$children.length; i++) {
      activateChildComponent(vm.$children[i])
    }
    callHook(vm, 'activated')
  }
}

export function deactivateChildComponent(vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = true
    if (isInInactiveTree(vm)) {
      return
    }
  }
  if (!vm._inactive) {
    vm._inactive = true
    for (let i = 0; i < vm.$children.length; i++) {
      deactivateChildComponent(vm.$children[i])
    }
    callHook(vm, 'deactivated')
  }
}

export function callHook(
  vm: Component,
  hook: string,
  args?: any[],
  setContext = true
) {
  // #7573 disable dep collection when invoking lifecycle hooks
  pushTarget()
  const prevInst = currentInstance
  const prevScope = getCurrentScope()
  setContext && setCurrentInstance(vm)
  const handlers = vm.$options[hook]
  const info = `${hook} hook`
  if (handlers) {
    for (let i = 0, j = handlers.length; i < j; i++) {
      invokeWithErrorHandling(handlers[i], vm, args || null, vm, info)
    }
  }
  // 这里是一个优化，通过 _hasHookEvent 来减少不必要的调用
  if (vm._hasHookEvent) {
    vm.$emit('hook:' + hook)
  }
  if (setContext) {
    setCurrentInstance(prevInst)
    prevScope && prevScope.on()
  }

  popTarget()
}
