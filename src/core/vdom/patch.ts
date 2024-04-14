/**
 * Virtual DOM patching algorithm based on Snabbdom by
 * Simon Friis Vindum (@paldepind)
 * Licensed under the MIT License
 * https://github.com/paldepind/snabbdom/blob/master/LICENSE
 *
 * modified by Evan You (@yyx990803)
 *
 * Not type-checking this because this file is perf-critical and the cost
 * of making flow understand it is not worth it.
 */

import VNode, { cloneVNode } from './vnode'
import config from '../config'
import { SSR_ATTR } from 'shared/constants'
import { registerRef } from './modules/template-ref'
import { traverse } from '../observer/traverse'
import { activeInstance } from '../instance/lifecycle'
import { isTextInputType } from 'web/util/element'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isArray,
  makeMap,
  isRegExp,
  isPrimitive
} from '../util/index'

export const emptyNode = new VNode('', {}, [])

const hooks = ['create', 'activate', 'update', 'remove', 'destroy']

// 判断是否是相同的 VNode 节点
// 需要满足以下条件：
// 1. key 相等
// 2. asyncFactory 相等
// 3. tag 相等，当前节点的标签名
// 4. 是否都是注释节点
// 5. 是否 data（当前节点对应的对象，包含了具体的一些数据信息，是一个 VNodeData 类型，可以参考 VNodeData 类型中的数据信息）都有定义
// 6. 当标签是 <input> 的时候，type 必须相同
function sameVnode(a, b) {
  return (
    a.key === b.key &&
    a.asyncFactory === b.asyncFactory &&
    ((a.tag === b.tag &&
      a.isComment === b.isComment &&
      isDef(a.data) === isDef(b.data) &&
      sameInputType(a, b)) ||
      (isTrue(a.isAsyncPlaceholder) && isUndef(b.asyncFactory.error)))
  )
}

function sameInputType(a, b) {
  if (a.tag !== 'input') return true
  let i
  const typeA = isDef((i = a.data)) && isDef((i = i.attrs)) && i.type
  const typeB = isDef((i = b.data)) && isDef((i = i.attrs)) && i.type
  return typeA === typeB || (isTextInputType(typeA) && isTextInputType(typeB))
}

// 创建一个从 key 到索引的映射
// 这个映射用于优化 Vue 的 diff 算法，通过 key 快速定位节点
// children：旧的子节点数组，需要进行 diff 操作的节点列表。
// beginIdx 和 endIdx：需要处理的子节点的开始和结束索引，只有在这个范围内的节点会被处理。
function createKeyToOldIdx(children, beginIdx, endIdx) {
  let i, key

  // 创建一个空对象 map，用来存储从 key 到索引的映射
  const map = {}

  // 使用一个 for 循环遍历 children 数组中从 beginIdx 到 endIdx 的所有元素
  for (i = beginIdx; i <= endIdx; ++i) {
    key = children[i].key

    // 对于每个元素，函数检查它的 key 属性是否已定义
    // 如果 key 已定义，那么就将 key 和当前索引 i 添加到 map 中
    if (isDef(key)) map[key] = i
  }
  return map
}

export function createPatchFunction(backend) {
  let i, j
  const cbs: any = {}

  /**
   * modules: { ref, directives, 平台特有的一些操纵，比如 attr、class、style 等 }
   * nodeOps: { 对 DOM 元素的增删改查 API }
   */
  const { modules, nodeOps } = backend

  // 把 attrs, class, events, domProps, style, transition 等等这些内容对应的钩子放到 cbs 里面，方便调用
  for (i = 0; i < hooks.length; ++i) {
    cbs[hooks[i]] = []
    for (j = 0; j < modules.length; ++j) {
      if (isDef(modules[j][hooks[i]])) {
        cbs[hooks[i]].push(modules[j][hooks[i]])
      }
    }
  }

  // 创建一个空的节点
  function emptyNodeAt(elm) {
    return new VNode(nodeOps.tagName(elm).toLowerCase(), {}, [], undefined, elm)
  }

  function createRmCb(childElm, listeners) {
    function remove() {
      if (--remove.listeners === 0) {
        removeNode(childElm)
      }
    }
    remove.listeners = listeners
    return remove
  }

  // 移除一个节点
  function removeNode(el) {
    const parent = nodeOps.parentNode(el)
    // element may have already been removed due to v-html / v-text
    // 从父节点中移除当前节点
    if (isDef(parent)) {
      nodeOps.removeChild(parent, el)
    }
  }

  function isUnknownElement(vnode, inVPre) {
    return (
      !inVPre &&
      !vnode.ns &&
      !(
        config.ignoredElements.length &&
        config.ignoredElements.some(ignore => {
          return isRegExp(ignore)
            ? ignore.test(vnode.tag)
            : ignore === vnode.tag
        })
      ) &&
      config.isUnknownElement(vnode.tag)
    )
  }

  let creatingElmInVPre = 0

  // 新建一个节点，并插入到父节点中
  function createElm(
    vnode,
    insertedVnodeQueue,
    parentElm?: any,
    refElm?: any,
    nested?: any,
    ownerArray?: any,
    index?: any
  ) {
    if (isDef(vnode.elm) && isDef(ownerArray)) {
      // This vnode was used in a previous render!
      // now it's used as a new node, overwriting its elm would cause
      // potential patch errors down the road when it's used as an insertion
      // reference node. Instead, we clone the node on-demand before creating
      // associated DOM element for it.
      vnode = ownerArray[index] = cloneVNode(vnode)
    }

    vnode.isRootInsert = !nested // for transition enter check
    if (createComponent(vnode, insertedVnodeQueue, parentElm, refElm)) {
      return
    }

    const data = vnode.data
    const children = vnode.children
    const tag = vnode.tag
    // tag 存在则创建一个对应标签的节点
    if (isDef(tag)) {
      if (__DEV__) {
        if (data && data.pre) {
          creatingElmInVPre++
        }
        if (isUnknownElement(vnode, creatingElmInVPre)) {
          warn(
            'Unknown custom element: <' +
              tag +
              '> - did you ' +
              'register the component correctly? For recursive components, ' +
              'make sure to provide the "name" option.',
            vnode.context
          )
        }
      }

      vnode.elm = vnode.ns
        ? nodeOps.createElementNS(vnode.ns, tag)
        : nodeOps.createElement(tag, vnode)
      setScope(vnode)

      createChildren(vnode, children, insertedVnodeQueue)
      if (isDef(data)) {
        invokeCreateHooks(vnode, insertedVnodeQueue)
      }
      insert(parentElm, vnode.elm, refElm)

      if (__DEV__ && data && data.pre) {
        creatingElmInVPre--
      }
    } else if (isTrue(vnode.isComment)) {
      // 注释节点
      vnode.elm = nodeOps.createComment(vnode.text)
      insert(parentElm, vnode.elm, refElm)
    } else {
      // 默认、兜底创建文本节点
      vnode.elm = nodeOps.createTextNode(vnode.text)
      insert(parentElm, vnode.elm, refElm)
    }
  }

  function createComponent(vnode, insertedVnodeQueue, parentElm, refElm) {
    let i = vnode.data
    if (isDef(i)) {
      const isReactivated = isDef(vnode.componentInstance) && i.keepAlive
      if (isDef((i = i.hook)) && isDef((i = i.init))) {
        i(vnode, false /* hydrating */)
      }
      // after calling the init hook, if the vnode is a child component
      // it should've created a child instance and mounted it. the child
      // component also has set the placeholder vnode's elm.
      // in that case we can just return the element and be done.
      if (isDef(vnode.componentInstance)) {
        initComponent(vnode, insertedVnodeQueue)
        insert(parentElm, vnode.elm, refElm)
        if (isTrue(isReactivated)) {
          reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm)
        }
        return true
      }
    }
  }

  function initComponent(vnode, insertedVnodeQueue) {
    if (isDef(vnode.data.pendingInsert)) {
      insertedVnodeQueue.push.apply(
        insertedVnodeQueue,
        vnode.data.pendingInsert
      )
      vnode.data.pendingInsert = null
    }
    vnode.elm = vnode.componentInstance.$el
    if (isPatchable(vnode)) {
      invokeCreateHooks(vnode, insertedVnodeQueue)
      setScope(vnode)
    } else {
      // empty component root.
      // skip all element-related modules except for ref (#3455)
      registerRef(vnode)
      // make sure to invoke the insert hook
      insertedVnodeQueue.push(vnode)
    }
  }

  function reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm) {
    let i
    // hack for #4339: a reactivated component with inner transition
    // does not trigger because the inner node's created hooks are not called
    // again. It's not ideal to involve module-specific logic in here but
    // there doesn't seem to be a better way to do it.
    let innerNode = vnode
    while (innerNode.componentInstance) {
      innerNode = innerNode.componentInstance._vnode
      if (isDef((i = innerNode.data)) && isDef((i = i.transition))) {
        for (i = 0; i < cbs.activate.length; ++i) {
          cbs.activate[i](emptyNode, innerNode)
        }
        insertedVnodeQueue.push(innerNode)
        break
      }
    }
    // unlike a newly created component,
    // a reactivated keep-alive component doesn't insert itself
    insert(parentElm, vnode.elm, refElm)
  }

  // 在指定的父节点下面插入一个子节点
  function insert(parent, elm, ref) {
    if (isDef(parent)) {

      // 如果指定了 ref，则插入到 ref 这个子节点的前面
      if (isDef(ref)) {
        if (nodeOps.parentNode(ref) === parent) {
          nodeOps.insertBefore(parent, elm, ref)
        }
      } else {
        nodeOps.appendChild(parent, elm)
      }
    }
  }

  function createChildren(vnode, children, insertedVnodeQueue) {
    if (isArray(children)) {
      if (__DEV__) {
        checkDuplicateKeys(children)
      }
      for (let i = 0; i < children.length; ++i) {
        createElm(
          children[i],
          insertedVnodeQueue,
          vnode.elm,
          null,
          true,
          children,
          i
        )
      }
    } else if (isPrimitive(vnode.text)) {
      nodeOps.appendChild(vnode.elm, nodeOps.createTextNode(String(vnode.text)))
    }
  }

  // 是否可以 patch，检测 tag 是否定义
  function isPatchable(vnode) {
    while (vnode.componentInstance) {
      vnode = vnode.componentInstance._vnode
    }
    return isDef(vnode.tag)
  }

  function invokeCreateHooks(vnode, insertedVnodeQueue) {
    for (let i = 0; i < cbs.create.length; ++i) {
      cbs.create[i](emptyNode, vnode)
    }
    i = vnode.data.hook // Reuse variable
    if (isDef(i)) {
      if (isDef(i.create)) i.create(emptyNode, vnode)
      if (isDef(i.insert)) insertedVnodeQueue.push(vnode)
    }
  }

  // set scope id attribute for scoped CSS.
  // this is implemented as a special case to avoid the overhead
  // of going through the normal attribute patching process.
  function setScope(vnode) {
    let i
    if (isDef((i = vnode.fnScopeId))) {
      nodeOps.setStyleScope(vnode.elm, i)
    } else {
      let ancestor = vnode
      while (ancestor) {
        if (isDef((i = ancestor.context)) && isDef((i = i.$options._scopeId))) {
          nodeOps.setStyleScope(vnode.elm, i)
        }
        ancestor = ancestor.parent
      }
    }
    // for slot content they should also get the scopeId from the host instance.
    if (
      isDef((i = activeInstance)) &&
      i !== vnode.context &&
      i !== vnode.fnContext &&
      isDef((i = i.$options._scopeId))
    ) {
      nodeOps.setStyleScope(vnode.elm, i)
    }
  }

  // 批量新建节点
  function addVnodes(
    parentElm,
    refElm,
    vnodes,
    startIdx,
    endIdx,
    insertedVnodeQueue
  ) {
    for (; startIdx <= endIdx; ++startIdx) {
      createElm(
        vnodes[startIdx],
        insertedVnodeQueue,
        parentElm,
        refElm,
        false,
        vnodes,
        startIdx
      )
    }
  }

  function invokeDestroyHook(vnode) {
    let i, j
    const data = vnode.data
    if (isDef(data)) {
      if (isDef((i = data.hook)) && isDef((i = i.destroy))) i(vnode)
      for (i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode)
    }
    if (isDef((i = vnode.children))) {
      for (j = 0; j < vnode.children.length; ++j) {
        invokeDestroyHook(vnode.children[j])
      }
    }
  }

  // 批量移除节点
  function removeVnodes(vnodes, startIdx, endIdx) {
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx]
      if (isDef(ch)) {
        if (isDef(ch.tag)) {
          removeAndInvokeRemoveHook(ch)
          invokeDestroyHook(ch)
        } else {
          // Text node
          removeNode(ch.elm)
        }
      }
    }
  }

  function removeAndInvokeRemoveHook(vnode, rm?: any) {
    if (isDef(rm) || isDef(vnode.data)) {
      let i
      const listeners = cbs.remove.length + 1
      if (isDef(rm)) {
        // we have a recursively passed down rm callback
        // increase the listeners count
        rm.listeners += listeners
      } else {
        // directly removing
        rm = createRmCb(vnode.elm, listeners)
      }
      // recursively invoke hooks on child component root node
      if (
        isDef((i = vnode.componentInstance)) &&
        isDef((i = i._vnode)) &&
        isDef(i.data)
      ) {
        removeAndInvokeRemoveHook(i, rm)
      }
      for (i = 0; i < cbs.remove.length; ++i) {
        cbs.remove[i](vnode, rm)
      }
      if (isDef((i = vnode.data.hook)) && isDef((i = i.remove))) {
        i(vnode, rm)
      } else {
        rm()
      }
    } else {
      removeNode(vnode.elm)
    }
  }

  // 更新子节点
  // 新的 vnode 和 oldVnode 都有子节点，且子节点不一样的时候进行对比子节点的函数
  // 循环遍历两个列表，循环停止条件是：其中一个列表的开始指针 startIdx 和 结束指针 endIdx 重合
  // - 新的头和老的头对比
  // - 新的尾和老的尾对比
  // - 新的头和老的尾对比
  // - 新的尾和老的头对比

  // 以上四种只要有一种判断相等，就调用 patchVnode 对比节点文本变化或子节点变化，然后移动对比的下标，继续下一轮循环对比
  // - 如果没找到，就创建一个新的节点
  // - 如果找到了，再对比标签是不是同一个节点
  //    - 如果是同一个节点，就调用 patchVnode 进行后续对比，然后把这个节点插入到老的开始前面，并且移动新的开始下标，继续下一轮循环对比
  //    - 如果不是相同节点，就创建一个新的节点
  // - 如果老的 vnode 先遍历完，就添加新的 vnode 没有遍历的节点
  // - 如果新的 vnode 先遍历完，就删除老的 vnode 没有遍历的节点

  // !为什么会有头对尾，尾对头的操作？
  // 因为可以快速检测出 reverse 操作，加快 Diff 效率
  function updateChildren(
    parentElm,
    oldCh,
    newCh,
    insertedVnodeQueue,
    removeOnly
  ) {

    // 老 vnode 遍历的下标
    let oldStartIdx = 0

    // 新 vnode 遍历的下标
    let newStartIdx = 0

    // 老 vnode 列表长度
    let oldEndIdx = oldCh.length - 1

    // 老 vnode 列表第一个子元素
    let oldStartVnode = oldCh[0]

    // 老 vnode 列表最后一个子元素
    let oldEndVnode = oldCh[oldEndIdx]

    // 新 vnode 列表长度
    let newEndIdx = newCh.length - 1

    // 新 vnode 列表第一个子元素
    let newStartVnode = newCh[0]

    // 新 vnode 列表最后一个子元素
    let newEndVnode = newCh[newEndIdx]
    let oldKeyToIdx, idxInOld, vnodeToMove, refElm

    // removeOnly is a special flag used only by <transition-group>
    // to ensure removed elements stay in correct relative positions
    // during leaving transitions
    const canMove = !removeOnly

    if (__DEV__) {
      checkDuplicateKeys(newCh)
    }

    // 循环，规则是开始指针向右移动，结束指针向左移动移动
    // 当开始和结束的指针重合的时候就结束循环
    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {

      // 前两个判断是循环的收缩条件
      // 开始节点不存在，向后移一个
      if (isUndef(oldStartVnode)) {

        // 左指针向后移
        oldStartVnode = oldCh[++oldStartIdx] // Vnode has been moved left
      } else if (isUndef(oldEndVnode)) {
        // 结束节点不存在，向后移一个
        // 右指针向左移
        oldEndVnode = oldCh[--oldEndIdx]
      } else if (sameVnode(oldStartVnode, newStartVnode)) {
        // 新的头和老的头对比

        // 是同一节点，递归调用，继续对比这两个节点的内容和子节点
        // 比如第一次对比两个列表的 [0]，然后对比 [1]...，后面同理
        patchVnode(
          oldStartVnode,
          newStartVnode,
          insertedVnodeQueue,
          newCh,
          newStartIdx
        )

        // 指针后移
        oldStartVnode = oldCh[++oldStartIdx]
        newStartVnode = newCh[++newStartIdx]
      } else if (sameVnode(oldEndVnode, newEndVnode)) {
        // 老的尾和新的尾对比

        // 是同一节点，递归调用，继续对比这两个节点的内容和子节点
        // 比如第一次对比两个列表的 [len-1]，然后对比 [len-2]...，后面同理
        patchVnode(
          oldEndVnode,
          newEndVnode,
          insertedVnodeQueue,
          newCh,
          newEndIdx
        )

        // 指针前移一位
        oldEndVnode = oldCh[--oldEndIdx]
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldStartVnode, newEndVnode)) {
        // 老的头和新的尾对比

        // Vnode moved right
        patchVnode(
          oldStartVnode,
          newEndVnode,
          insertedVnodeQueue,
          newCh,
          newEndIdx
        )

        canMove &&
          nodeOps.insertBefore(
            parentElm,
            oldStartVnode.elm,
            nodeOps.nextSibling(oldEndVnode.elm)
          )

        // 老的列表从前往后取值，新的列表从后往前取值，然后对比(指针向中间收缩)
        oldStartVnode = oldCh[++oldStartIdx]
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldEndVnode, newStartVnode)) {
        // 老的尾和新的头对比

        // Vnode moved left
        patchVnode(
          oldEndVnode,
          newStartVnode,
          insertedVnodeQueue,
          newCh,
          newStartIdx
        )
        canMove &&
          nodeOps.insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm)

        // 老的列表从后往前取值，新的列表从前往后取值，然后对比(指针向中间收缩)
        oldEndVnode = oldCh[--oldEndIdx]
        newStartVnode = newCh[++newStartIdx]
      } else {
        // 以上四种情况都没有命中的情况

        // 创建 key 的索引，快速查找元素
        if (isUndef(oldKeyToIdx))
          oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx)

        // 拿到新开始的 key，在老的 children 里去找有没有某个节点有这个 key
        // 也就在老的 children 里面查找有没有新 children 对应的元素
        idxInOld = isDef(newStartVnode.key)
          ? oldKeyToIdx[newStartVnode.key]
          : findIdxInOld(newStartVnode, oldCh, oldStartIdx, oldEndIdx)

        // 新的 children 里有，可是没有在老的 children 里找到对应的元素
        // 在旧 vnode 里没找到，说明是新增的
        if (isUndef(idxInOld)) {
          // New element
          // 直接创建新的节点
          createElm(
            newStartVnode,
            insertedVnodeQueue,
            parentElm,
            oldStartVnode.elm,
            false,
            newCh,
            newStartIdx
          )
        } else {
          // 找到了对应的 key 的元素，进行移动操作

          // 需要移动的元素
          // 找得到就拿到老的节点
          vnodeToMove = oldCh[idxInOld]

          // 如果是相同 VNode 节点
          if (sameVnode(vnodeToMove, newStartVnode)) {

            // 把两个相同的节点做一个更新
            patchVnode(
              vnodeToMove,
              newStartVnode,
              insertedVnodeQueue,
              newCh,
              newStartIdx
            )
            // 占位，防止塌陷
            // 防止老节点移动走了之后破坏了初始的映射表位置
            oldCh[idxInOld] = undefined
            canMove &&
              nodeOps.insertBefore(
                parentElm,
                vnodeToMove.elm,
                oldStartVnode.elm
              )
          } else {
            // same key but different element. treat as new element
            // 如果是不一样的，就创建新的元素
            createElm(
              newStartVnode,
              insertedVnodeQueue,
              parentElm,
              oldStartVnode.elm,
              false,
              newCh,
              newStartIdx
            )
          }
        }
        newStartVnode = newCh[++newStartIdx]
      }
    }

    // oldStartIdx > oldEndIdx 说明老的 vnode 先遍历完
    // 说明新的 vnode 里面还有没处理上的
    if (oldStartIdx > oldEndIdx) {
      refElm = isUndef(newCh[newEndIdx + 1]) ? null : newCh[newEndIdx + 1].elm

      // 添加从 newStartIdx 到 newEndIdx 之间没遍历上的节点
      addVnodes(
        parentElm,
        refElm,
        newCh,
        newStartIdx,
        newEndIdx,
        insertedVnodeQueue
      )
    } else if (newStartIdx > newEndIdx) {
      // newStartIdx > newEndIdx 说明新的 vnode 先遍历完
      // 老的 vnode 里有不需要的

      // 删除掉老的 vnode 里没有遍历的节点
      removeVnodes(oldCh, oldStartIdx, oldEndIdx)
    }
  }

  function checkDuplicateKeys(children) {
    const seenKeys = {}
    for (let i = 0; i < children.length; i++) {
      const vnode = children[i]
      const key = vnode.key
      if (isDef(key)) {
        if (seenKeys[key]) {
          warn(
            `Duplicate keys detected: '${key}'. This may cause an update error.`,
            vnode.context
          )
        } else {
          seenKeys[key] = true
        }
      }
    }
  }

  function findIdxInOld(node, oldCh, start, end) {
    for (let i = start; i < end; i++) {
      const c = oldCh[i]
      if (isDef(c) && sameVnode(node, c)) return i
    }
  }

  // vnode diff 对比，尽可能的做节点的复用
  // 对比节点文本变化或子节点变化
  // - 如果 oldVnode 和 vnode 的引用地址是一样的，就表示节点没有变化，直接返回
  // - 如果 oldVnode 的 isAsyncPlaceholder 存在，就跳过异步组件的检查，直接返回
  // - 如果 oldVnode 和 vnode 都是静态节点，并且有一样的 key，并且 vnode 是克隆节点或者 v-once 指令控制的节点时
  //   把 oldVnode.elm 和 oldVnode.child 都复制到 vnode 上，然后返回
  // - 如果 vnode 不是文本节点也不是注释的情况下
  //     - 如果 vnode 和 oldVnode 都有子节点，而且子节点不一样的话，就调用 updateChildren 更新子节点
  //     - 如果只有 vnode 有子节点，就调用 addVnodes 创建子节点
  //     - 如果只有 oldVnode 有子节点，就调用 removeVnodes 删除该子节点
  //     - 如果 vnode 文本为 undefined，就删掉 vnode.elm 文本
  // - 如果 vnode 是文本节点但是和 oldVnode 文本内容不一样，就更新文本
  function patchVnode(
    oldVnode, // 老的虚拟 DOM 节点
    vnode, // 新的虚拟 DOM 节点
    insertedVnodeQueue, // 插入节点的队列
    ownerArray, // 节点数组
    index, // 当前节点的下标
    removeOnly?: any
  ) {

    // 新老节点引用地址是一样的，直接返回
    // 比如 props 没有改变的时候，子组件就不做渲染，直接复用
    if (oldVnode === vnode) {
      return
    }

    // 新的 vnode 真实的 DOM 元素
    if (isDef(vnode.elm) && isDef(ownerArray)) {
      // clone reused vnode
      vnode = ownerArray[index] = cloneVNode(vnode)
    }

    const elm = (vnode.elm = oldVnode.elm)

    // 如果当前节点是注释或 v-if 的，或者是异步函数，就跳过检查异步组件
    if (isTrue(oldVnode.isAsyncPlaceholder)) {
      if (isDef(vnode.asyncFactory.resolved)) {
        hydrate(oldVnode.elm, vnode, insertedVnodeQueue)
      } else {
        vnode.isAsyncPlaceholder = true
      }
      return
    }

    // reuse element for static trees.
    // note we only do this if the vnode is cloned -
    // if the new node is not cloned it means the render functions have been
    // reset by the hot-reload-api and we need to do a proper re-render.
    // 当前节点是静态节点的时候，key 也一样(代表同一个节点)
    // 或者新节点是 clone 的 或者 有 v-once 的时候(只渲染一次)
    // 只需要替换 componentInstance 即可，直接赋值返回
    if (
      isTrue(vnode.isStatic) &&
      isTrue(oldVnode.isStatic) &&
      vnode.key === oldVnode.key &&
      (isTrue(vnode.isCloned) || isTrue(vnode.isOnce))
    ) {
      vnode.componentInstance = oldVnode.componentInstance
      return
    }

    let i
    const data = vnode.data
    // 执行 prepatch 钩子函数
    // prepatch 方法就是拿到新的 vnode 的组件配置以及组件实例，去执行 updateChildComponent 方法
    // 由于更新了 vnode，那么 vnode 对应的实例 vm 的一系列属性也会发生变化
    // 包括占位符 vm.$vnode 的更新、slot 的更新，listeners 的更新，props 的更新等
    if (isDef(data) && isDef((i = data.hook)) && isDef((i = i.prepatch))) {
      i(oldVnode, vnode)
    }

    // 获取子元素列表
    const oldCh = oldVnode.children
    const ch = vnode.children

    // 执行 update 钩子函数
    if (isDef(data) && isPatchable(vnode)) {
      // 遍历调用 update 更新 oldVnode 所有属性，比如 class,style,attrs,domProps,events...
      // 这里的 update 钩子函数是 vnode 本身的钩子函数
      for (i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode)

      // 这里的 update 钩子函数是传进来的钩子函数
      if (isDef((i = data.hook)) && isDef((i = i.update))) i(oldVnode, vnode)
    }

    // 如果新节点不是文本节点，也就是说有子节点
    if (isUndef(vnode.text)) {

      // 如果新老节点都有子节点
      if (isDef(oldCh) && isDef(ch)) {

        // 如果新老节点的子节点不一样，就执行 updateChildren 函数，对比子节点
        if (oldCh !== ch)
          updateChildren(elm, oldCh, ch, insertedVnodeQueue, removeOnly)
      } else if (isDef(ch)) {
        // 如果新节点有子节点的话，就是说老节点没有子节点

        if (__DEV__) {
          checkDuplicateKeys(ch)
        }

        // 如果老节点文本节点，就是说没有子节点，就清空
        if (isDef(oldVnode.text)) nodeOps.setTextContent(elm, '')

        // 说明对比老节点，当前 update 的添加了新的节点进来
        // 添加子节点
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue)
      } else if (isDef(oldCh)) {

        // 如果新节点没有子节点，老节点有子节点，就删除
        // 说明 update 里把某些节点删掉了
        removeVnodes(oldCh, 0, oldCh.length - 1)
      } else if (isDef(oldVnode.text)) {

        // 如果老节点是文本节点，就清空
        nodeOps.setTextContent(elm, '')
      }
    } else if (oldVnode.text !== vnode.text) {

      // 新老节点都是文本节点，且文本不一样，就更新文本
      nodeOps.setTextContent(elm, vnode.text)
    }
    if (isDef(data)) {

      // 执行 postpatch 钩子
      if (isDef((i = data.hook)) && isDef((i = i.postpatch))) i(oldVnode, vnode)
    }
  }

  function invokeInsertHook(vnode, queue, initial) {
    // delay insert hooks for component root nodes, invoke them after the
    // element is really inserted
    if (isTrue(initial) && isDef(vnode.parent)) {
      vnode.parent.data.pendingInsert = queue
    } else {
      for (let i = 0; i < queue.length; ++i) {
        queue[i].data.hook.insert(queue[i])
      }
    }
  }

  let hydrationBailed = false
  // list of modules that can skip create hook during hydration because they
  // are already rendered on the client or has no need for initialization
  // Note: style is excluded because it relies on initial clone for future
  // deep updates (#7063).
  const isRenderedModule = makeMap('attrs,class,staticClass,staticStyle,key')

  // Note: this is a browser-only function so we can assume elms are DOM nodes.
  function hydrate(elm, vnode, insertedVnodeQueue, inVPre?: boolean) {
    let i
    const { tag, data, children } = vnode
    inVPre = inVPre || (data && data.pre)
    vnode.elm = elm

    if (isTrue(vnode.isComment) && isDef(vnode.asyncFactory)) {
      vnode.isAsyncPlaceholder = true
      return true
    }
    // assert node match
    if (__DEV__) {
      if (!assertNodeMatch(elm, vnode, inVPre)) {
        return false
      }
    }
    if (isDef(data)) {
      if (isDef((i = data.hook)) && isDef((i = i.init)))
        i(vnode, true /* hydrating */)
      if (isDef((i = vnode.componentInstance))) {
        // child component. it should have hydrated its own tree.
        initComponent(vnode, insertedVnodeQueue)
        return true
      }
    }
    if (isDef(tag)) {
      if (isDef(children)) {
        // empty element, allow client to pick up and populate children
        if (!elm.hasChildNodes()) {
          createChildren(vnode, children, insertedVnodeQueue)
        } else {
          // v-html and domProps: innerHTML
          if (
            isDef((i = data)) &&
            isDef((i = i.domProps)) &&
            isDef((i = i.innerHTML))
          ) {
            if (i !== elm.innerHTML) {
              /* istanbul ignore if */
              if (
                __DEV__ &&
                typeof console !== 'undefined' &&
                !hydrationBailed
              ) {
                hydrationBailed = true
                console.warn('Parent: ', elm)
                console.warn('server innerHTML: ', i)
                console.warn('client innerHTML: ', elm.innerHTML)
              }
              return false
            }
          } else {
            // iterate and compare children lists
            let childrenMatch = true
            let childNode = elm.firstChild
            for (let i = 0; i < children.length; i++) {
              if (
                !childNode ||
                !hydrate(childNode, children[i], insertedVnodeQueue, inVPre)
              ) {
                childrenMatch = false
                break
              }
              childNode = childNode.nextSibling
            }
            // if childNode is not null, it means the actual childNodes list is
            // longer than the virtual children list.
            if (!childrenMatch || childNode) {
              /* istanbul ignore if */
              if (
                __DEV__ &&
                typeof console !== 'undefined' &&
                !hydrationBailed
              ) {
                hydrationBailed = true
                console.warn('Parent: ', elm)
                console.warn(
                  'Mismatching childNodes vs. VNodes: ',
                  elm.childNodes,
                  children
                )
              }
              return false
            }
          }
        }
      }
      if (isDef(data)) {
        let fullInvoke = false
        for (const key in data) {
          if (!isRenderedModule(key)) {
            fullInvoke = true
            invokeCreateHooks(vnode, insertedVnodeQueue)
            break
          }
        }
        if (!fullInvoke && data['class']) {
          // ensure collecting deps for deep class bindings for future updates
          traverse(data['class'])
        }
      }
    } else if (elm.data !== vnode.text) {
      elm.data = vnode.text
    }
    return true
  }

  function assertNodeMatch(node, vnode, inVPre) {
    if (isDef(vnode.tag)) {
      return (
        vnode.tag.indexOf('vue-component') === 0 ||
        (!isUnknownElement(vnode, inVPre) &&
          vnode.tag.toLowerCase() ===
            (node.tagName && node.tagName.toLowerCase()))
      )
    } else {
      return node.nodeType === (vnode.isComment ? 8 : 3)
    }
  }

  // 对外暴露的 patch 方法
  // 在采取 diff 算法比较新旧节点的时候，比较只会在同层级进行, 不会跨层级比较（深度优先、同层比较）
  // - vnode 不存在，oldVnode 存在，就删掉 oldVnode
  // - vnode 存在，oldVnode 不存在，就创建 vnode
  // - 两个都存在的话，通过 sameVnode 函数(后面有详解)对比是不是同一节点
  //      - 如果是同一节点的话，通过 patchVnode 进行后续对比节点文本变化或子节点变化
  //      - 如果不是同一节点，就把 vnode 挂载到 oldVnode 的父元素下
  //          - 如果组件的根节点被替换，就遍历更新父节点，然后删掉旧的节点
  //          - 如果是服务端渲染就用 hydrating 把 oldVnode 和真实 DOM 混合
  return function patch(oldVnode, vnode, hydrating, removeOnly) {

    // 没传 vnode，也就是 destroy 调用的场景
    // vnode 不存在，oldVnode 存在，就删掉 oldVnode
    if (isUndef(vnode)) {

      // 如果有老的 vnode，销毁老的 vnode
      if (isDef(oldVnode)) invokeDestroyHook(oldVnode)
      return
    }

    let isInitialPatch = false
    const insertedVnodeQueue: any[] = []

    // 没传老的 vnode，初始化的情况
    // vnode 存在，oldVnode 不存在，创建 vnode
    if (isUndef(oldVnode)) {
      // empty mount (likely as component), create new root element
      // oldVnode 未定义的时候，也就是 root 节点，创建一个新的节点
      isInitialPatch = true
      // 直接创建新的节点
      createElm(vnode, insertedVnodeQueue)
    } else {
      // 新的 vnode 和 oldVnode 都存在

      // 更新的情况
      // 标记旧的 VNode 是否有 nodeType
      const isRealElement = isDef(oldVnode.nodeType)

      // 判断新旧 VNode 是否是相同的 VNode
      if (!isRealElement && sameVnode(oldVnode, vnode)) {
        // patch existing root node
        // 如果是相同的 VNode，直接修改现有的节点
        // 如果是同一节点的话，通过 patchVnode 进行后续对比节点文本变化或子节点变化
        patchVnode(oldVnode, vnode, insertedVnodeQueue, null, null, removeOnly)
      } else {
        // 不是相同的节点
        // 如果不是同一节点，就把 vnode 挂载到 oldVnode 的父元素下

        // 判断是否是真实节点
        if (isRealElement) {
          // mounting to a real element
          // check if this is server-rendered content and if we can perform
          // a successful hydration.
          if (oldVnode.nodeType === 1 && oldVnode.hasAttribute(SSR_ATTR)) {
            // 当旧的 VNode 是服务端渲染的元素，hydrating 记为 true
            oldVnode.removeAttribute(SSR_ATTR)
            hydrating = true
          }
          // 如果是服务端渲染就用 hydrate 把 oldVnode 和真实 DOM 混合
          // 如果是服务端渲染
          if (isTrue(hydrating)) {
            // 合并到真实 DOM 上
            if (hydrate(oldVnode, vnode, insertedVnodeQueue)) {
              // 调用 insert 钩子，直接插入
              invokeInsertHook(vnode, insertedVnodeQueue, true)
              return oldVnode
            } else if (__DEV__) {
              // 服务端渲染不一致
              warn(
                'The client-side rendered virtual DOM tree is not matching ' +
                  'server-rendered content. This is likely caused by incorrect ' +
                  'HTML markup, for example nesting block-level elements inside ' +
                  '<p>, or missing <tbody>. Bailing hydration and performing ' +
                  'full client-side render.'
              )
            }
          }
          // either not server-rendered, or hydration failed.
          // create an empty node and replace it
          // 如果不是服务端渲染或者合并到真实 DOM 失败，则创建一个空的 VNode 节点替换它
          oldVnode = emptyNodeAt(oldVnode)
        }

        // replacing existing element
        // 拿到 oldVnode 的父节点
        const oldElm = oldVnode.elm
        const parentElm = nodeOps.parentNode(oldElm)

        // create new node
        // 1. 创建新的节点
        // 根据新的 VNode 创建一个新的节点，将新元素挂载进父元素
        createElm(
          vnode,
          insertedVnodeQueue,
          // extremely rare edge case: do not insert if old element is in a
          // leaving transition. Only happens when combining transition +
          // keep-alive + HOCs. (#4590)
          oldElm._leaveCb ? null : parentElm,
          nodeOps.nextSibling(oldElm)
        )

        // update parent placeholder node element, recursively
        // 2. 更新父占位节点
        // 有父节点
        // 如果新的 vnode 的根节点存在，就是说根节点被修改了，就需要遍历更新父节点
        if (isDef(vnode.parent)) {
          let ancestor = vnode.parent

          // 是否可以 patch
          const patchable = isPatchable(vnode)

          // 遍历父节点
          // 递归更新父节点下的元素
          while (ancestor) {

            // 卸载老根节点下的全部组件
            for (let i = 0; i < cbs.destroy.length; ++i) {
              cbs.destroy[i](ancestor)
            }

            // 替换现有元素
            ancestor.elm = vnode.elm
            // 如果组件的根节点被替换，就遍历更新父节点，然后删掉旧的节点
            // 如果是 patchable，则调用 create 钩子
            if (patchable) {
              // 执行 create 钩子
              for (let i = 0; i < cbs.create.length; ++i) {
                cbs.create[i](emptyNode, ancestor)
              }
              // #6513
              // invoke insert hooks that may have been merged by create hooks.
              // e.g. for directives that uses the "inserted" hook.
              const insert = ancestor.data.hook.insert
              if (insert.merged) {
                // start at index 1 to avoid re-invoking component mounted hook
                // clone insert hooks to avoid being mutated during iteration.
                // e.g. for customed directives under transition group.
                const cloned = insert.fns.slice(1)
                for (let i = 0; i < cloned.length; i++) {
                  cloned[i]()
                }
              }
            } else {
              registerRef(ancestor)
            }

            // 更新父节点
            ancestor = ancestor.parent
          }
        }

        // destroy old node
        // 销毁旧的节点
        // 如果旧节点还存在，就删掉旧节点
        if (isDef(parentElm)) {
          removeVnodes([oldVnode], 0, 0)
        } else if (isDef(oldVnode.tag)) {

          // 否则直接卸载 oldVnode
          invokeDestroyHook(oldVnode)
        }
      }
    }

    // 返回更新后的节点
    invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch)
    return vnode.elm
  }
}
