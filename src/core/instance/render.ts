import {
  warn,
  nextTick,
  emptyObject,
  handleError,
  defineReactive,
  isArray
} from '../util/index'

import { createElement } from '../vdom/create-element'
import { installRenderHelpers } from './render-helpers/index'
import { resolveSlots } from './render-helpers/resolve-slots'
import { normalizeScopedSlots } from '../vdom/helpers/normalize-scoped-slots'
import VNode, { createEmptyVNode } from '../vdom/vnode'

import { isUpdatingChildComponent } from './lifecycle'
import type { Component } from 'types/component'
import { currentInstance, setCurrentInstance } from 'v3/currentInstance'
import { syncSetupSlots } from 'v3/apiSetup'

export function initRender(vm: Component) {
  // vnode 树根节点
  vm._vnode = null // the root of the child tree
  vm._staticTrees = null // v-once cached trees
  const options = vm.$options
  // $vnode 存父节点，_vnode 存当前节点
  const parentVnode = (vm.$vnode = options._parentVnode!) // the placeholder node in parent tree
  const renderContext = parentVnode && (parentVnode.context as Component)

  // 处理 slot
  vm.$slots = resolveSlots(options._renderChildren, renderContext)
  vm.$scopedSlots = parentVnode
    ? normalizeScopedSlots(
        vm.$parent!,
        parentVnode.data!.scopedSlots,
        vm.$slots
      )
    : emptyObject

  // bind the createElement fn to this instance
  // so that we get proper render context inside it.
  // args order: tag, data, children, normalizationType, alwaysNormalize
  // internal version is used by render functions compiled from templates
  // @ts-expect-error

  // 绑定创建 VNode 的函数
  // 对真正创作 VNode 的 _createElement 封装了一次，让参数更丰富
  // 将 createElement 函数绑定到该实例上，该 vm 存在闭包中，不可修改，vm 实例则固定。这样我们就可以得到正确的上下文渲染
  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false)
  // normalization is always applied for the public version, used in
  // user-written render functions.
  // @ts-expect-error
  // 常规方法被用于公共版本，被用来作为用户界面的渲染方法
  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true)

  // $attrs & $listeners are exposed for easier HOC creation.
  // they need to be reactive so that HOCs using them are always updated
  const parentData = parentVnode && parentVnode.data

  /* istanbul ignore else */
  if (__DEV__) {
    defineReactive(
      vm,
      '$attrs',
      (parentData && parentData.attrs) || emptyObject,
      () => {
        !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm)
      },
      true
    )
    defineReactive(
      vm,
      '$listeners',
      options._parentListeners || emptyObject,
      () => {
        !isUpdatingChildComponent && warn(`$listeners is readonly.`, vm)
      },
      true
    )
  } else {
    defineReactive(
      vm,
      '$attrs',
      (parentData && parentData.attrs) || emptyObject,
      null,
      true
    )
    defineReactive(
      vm,
      '$listeners',
      options._parentListeners || emptyObject,
      null,
      true
    )
  }
}

export let currentRenderingInstance: Component | null = null

// for testing only
export function setCurrentRenderingInstance(vm: Component) {
  currentRenderingInstance = vm
}

export function renderMixin(Vue: typeof Component) {
  // install runtime convenience helpers
  // 挂载 render 辅助函数，对应 core/instance/render-helpers 中的所有函数
  installRenderHelpers(Vue.prototype)

  // 挂载 nextTick 方法
  Vue.prototype.$nextTick = function (fn: (...args: any[]) => any) {
    return nextTick(fn, this)
  }

  // _render 渲染函数，返回一个 VNode 节点
  Vue.prototype._render = function (): VNode {
    const vm: Component = this

    // 取到 render 函数 => 可以是自己写的，也可以是编译生成的
    const { render, _parentVnode } = vm.$options

    // 如果组件已经挂载了
    if (_parentVnode && vm._isMounted) {
      vm.$scopedSlots = normalizeScopedSlots(
        vm.$parent!,
        _parentVnode.data!.scopedSlots,
        vm.$slots,
        vm.$scopedSlots
      )
      if (vm._slotsProxy) {
        syncSetupSlots(vm._slotsProxy, vm.$scopedSlots)
      }
    }

    // set parent vnode. this allows render functions to have access
    // to the data on the placeholder node.
    vm.$vnode = _parentVnode!
    // render self
    const prevInst = currentInstance
    const prevRenderInst = currentRenderingInstance
    let vnode
    try {
      // 保存当前实例
      setCurrentInstance(vm)
      currentRenderingInstance = vm

      // 创建 VNode
      // 调用 $createElement
      vnode = render.call(vm._renderProxy, vm.$createElement)
    } catch (e: any) {
      handleError(e, vm, `render`)
      // return error render result,
      // or previous vnode to prevent render error causing blank component
      /* istanbul ignore else */
      if (__DEV__ && vm.$options.renderError) {
        try {
          vnode = vm.$options.renderError.call(
            vm._renderProxy,
            vm.$createElement,
            e
          )
        } catch (e: any) {
          handleError(e, vm, `renderError`)
          vnode = vm._vnode
        }
      } else {
        vnode = vm._vnode
      }
    } finally {
      // VNode 生成操作结束后恢复当前渲染中的实例
      currentRenderingInstance = prevRenderInst
      setCurrentInstance(prevInst)
    }
    // if the returned array contains only a single node, allow it
    if (isArray(vnode) && vnode.length === 1) {
      vnode = vnode[0]
    }
    // return empty vnode in case the render function errored out
    if (!(vnode instanceof VNode)) {
      if (__DEV__ && isArray(vnode)) {
        warn(
          'Multiple root nodes returned from render function. Render function ' +
            'should return a single root node.',
          vm
        )
      }

      // 如果 render 函数生成错误，返回的不是一个 VNode 对象，返回一个空的 VNode 节点
      vnode = createEmptyVNode()
    }
    // set parent
    // 设置父节点
    vnode.parent = _parentVnode
    return vnode
  }
}
