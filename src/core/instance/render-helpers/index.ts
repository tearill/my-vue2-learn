import { toNumber, toString, looseEqual, looseIndexOf } from 'shared/util'
import { createTextVNode, createEmptyVNode } from 'core/vdom/vnode'
import { renderList } from './render-list'
import { renderSlot } from './render-slot'
import { resolveFilter } from './resolve-filter'
import { checkKeyCodes } from './check-keycodes'
import { bindObjectProps } from './bind-object-props'
import { renderStatic, markOnce } from './render-static'
import { bindObjectListeners } from './bind-object-listeners'
import { resolveScopedSlots } from './resolve-scoped-slots'
import { bindDynamicKeys, prependModifier } from './bind-dynamic-keys'

export function installRenderHelpers(target: any) {
  // 处理 v-once 的渲染函数
  target._o = markOnce

  // 将字符串转换为数字，如果转换失败会返回原字符串
  target._n = toNumber

  // 将 val 转换为字符串
  target._s = toString

  // 处理 v-for 列表渲染
  target._l = renderList

  // 处理 slot 的渲染
  target._t = renderSlot

  // 检测两个变量是否相等
  target._q = looseEqual

  // 检测数组中是否包含与 val 变量相等的项
  target._i = looseIndexOf

  // 处理 static 树的渲染
  target._m = renderStatic

  // 处理 filters
  target._f = resolveFilter

  // 从 config 配置中检测 event keyCode 是否存在
  target._k = checkKeyCodes

  // 合并 v-bind 指令到 VNode 中
  target._b = bindObjectProps

  // 创建一个文本 VNode 节点
  target._v = createTextVNode

  // 创建一个空的 VNode 节点
  target._e = createEmptyVNode

  // 处理 scoped slots
  target._u = resolveScopedSlots

  // 将一个对象 value 中的事件监听器合并到一个 Vue 组件的 data 对象的 on 属性中
  target._g = bindObjectListeners

  // 将一个包含动态键值对的数组 values 绑定到一个基础对象 baseObj 上
  target._d = bindDynamicKeys

  // 在事件名前面添加修饰符标记，只在 value 是字符串的时候添加前缀标记，否则返回原 value
  target._p = prependModifier
}
