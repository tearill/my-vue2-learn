import config from '../config'
import VNode, { createEmptyVNode } from './vnode'
import { createComponent } from './create-component'
import { traverse } from '../observer/traverse'

import {
  warn,
  isDef,
  isUndef,
  isArray,
  isTrue,
  isObject,
  isPrimitive,
  resolveAsset,
  isFunction
} from '../util/index'

import { normalizeChildren, simpleNormalizeChildren } from './helpers/index'
import type { Component } from 'types/component'
import type { VNodeData } from 'types/vnode'

const SIMPLE_NORMALIZE = 1
const ALWAYS_NORMALIZE = 2

// wrapper function for providing a more flexible interface
// without getting yelled at by flow
// 这个函数只是对真正创建 VNode 的 _createElement 函数封装了一层
// 这个函数只是对参数做了一层处理，不进行额外的操作
export function createElement(
  context: Component,
  tag: any,
  data: any,
  children: any,
  normalizationType: any,
  alwaysNormalize: boolean
): VNode | Array<VNode> {

  // 如果 data 是数组或者是基本类型
  // 参数 data 可以不传递(文本节点)
  // 如果没有传递 data，移动参数
  if (isArray(data) || isPrimitive(data)) {
    normalizationType = children
    children = data
    data = undefined
  }
  if (isTrue(alwaysNormalize)) {
    normalizationType = ALWAYS_NORMALIZE
  }
  return _createElement(context, tag, data, children, normalizationType)
}

export function _createElement(
  context: Component,
  tag?: string | Component | Function | Object,
  data?: VNodeData,
  children?: any,
  normalizationType?: number
): VNode | Array<VNode> {

  // 如果data未定义（undefined或者null）|| data 已经是响应式的 => 返回创建一个空 VNode
  if (isDef(data) && isDef((data as any).__ob__)) {
    __DEV__ &&
      warn(
        `Avoid using observed data object as vnode data: ${JSON.stringify(
          data
        )}\n` + 'Always create fresh vnode data objects in each render!',
        context
      )

    // 创建空的 VNode
    return createEmptyVNode()
  }
  // object syntax in v-bind
  // 取出元素的标签名称
  if (isDef(data) && isDef(data.is)) {
    tag = data.is
  }

  // 判断动态指定的 <component :is="false"/>，是否是指定了一个 falsy 值
  // 这个时候对应 html 标签应该是空的
  if (!tag) {
    // in case of component :is set to falsy value
    return createEmptyVNode()
  }
  // warn against non-primitive key
  if (__DEV__ && isDef(data) && isDef(data.key) && !isPrimitive(data.key)) {
    warn(
      'Avoid using non-primitive value as key, ' +
        'use string/number value instead.',
      context
    )
  }
  // support single function children as default scoped slot
  if (isArray(children) && isFunction(children[0])) {
    data = data || {}
    data.scopedSlots = { default: children[0] }
    children.length = 0
  }

  // children 的规范化
  // 每一个 VNode 可能会有若干子节点，子节点也应该是 VNode 类型
  // normalizeChildren 调用场景有两个
  // 1. render 函数是手写的，当 children 只有一个节点的时候
  //    可以把 children 写成基础类型来创建单个简单的文本节点
  //    会调用 createTextVNode 创建一个文本节点的 VNode
  // 2. 当编译 slot、v-for 的时候会产生嵌套数组的情况，会调用 normalizeArrayChildren 方法
  if (normalizationType === ALWAYS_NORMALIZE) {
    children = normalizeChildren(children)
  } else if (normalizationType === SIMPLE_NORMALIZE) {
    // simpleNormalizeChildren 调用场景是 render 函数是编译生成的
    // 函数式组件返回的是一个数组而不是一个根节点
    // 所以会通过 Array.prototype.concat 方法把整个 children 数组打平，让它的深度只有一层
    children = simpleNormalizeChildren(children)
  }
  let vnode, ns

  // 如果 tag 是字符串，也就是普通 html 标签，会实例化一个普通 VNode 节点
  if (typeof tag === 'string') {
    let Ctor
    ns = (context.$vnode && context.$vnode.ns) || config.getTagNamespace(tag)

    // 判断是否是保留的标签（html、svg 标签）
    if (config.isReservedTag(tag)) {
      // platform built-in elements
      if (
        __DEV__ &&
        isDef(data) &&
        isDef(data.nativeOn) &&
        data.tag !== 'component'
      ) {
        warn(
          `The .native modifier for v-on is only valid on components but it was used on <${tag}>.`,
          context
        )
      }

      // 如果是原生的标签，直接创建标签对应的 VNode 节点就行
      vnode = new VNode(
        config.parsePlatformTagName(tag),
        data,
        children,
        undefined,
        undefined,
        context
      )
    } else if (
      (!data || !data.pre) &&
      isDef((Ctor = resolveAsset(context.$options, 'components', tag)))
    ) {
      // component
      // 从 vm 实例的 option.components 中寻找该 tag，存在则就是一个组件，创建相应节点，Ctor 为组件的构造类
      vnode = createComponent(Ctor, data, context, children, tag)
    } else {
      // unknown or unlisted namespaced elements
      // check at runtime because it may get assigned a namespace when its
      // parent normalizes children
      // 未知的元素，在运行时检查，因为父组件可能在序列化子组件的时候分配一个名字空间
      vnode = new VNode(tag, data, children, undefined, undefined, context)
    }
  } else {

    // tag 不是字符串的时候则是组件的构造类
    // direct component options / constructor
    vnode = createComponent(tag as any, data, context, children)
  }


  if (isArray(vnode)) {
    return vnode
  } else if (isDef(vnode)) {

    // 如果有名字空间，则递归所有子节点应用该名字空间
    if (isDef(ns)) applyNS(vnode, ns)
    if (isDef(data)) registerDeepBindings(data)
    return vnode
  } else {

    // 如果 vnode 没有成功创建则创建空节点
    return createEmptyVNode()
  }
}

function applyNS(vnode, ns, force?: boolean) {
  vnode.ns = ns
  if (vnode.tag === 'foreignObject') {
    // use default namespace inside foreignObject
    ns = undefined
    force = true
  }
  if (isDef(vnode.children)) {
    for (let i = 0, l = vnode.children.length; i < l; i++) {
      const child = vnode.children[i]
      if (
        isDef(child.tag) &&
        (isUndef(child.ns) || (isTrue(force) && child.tag !== 'svg'))
      ) {
        applyNS(child, ns, force)
      }
    }
  }
}

// ref #5318
// necessary to ensure parent re-render when deep bindings like :style and
// :class are used on slot nodes
function registerDeepBindings(data) {
  if (isObject(data.style)) {
    traverse(data.style)
  }
  if (isObject(data.class)) {
    traverse(data.class)
  }
}
