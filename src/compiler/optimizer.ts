import { makeMap, isBuiltInTag, cached, no } from 'shared/util'
import { ASTElement, CompilerOptions, ASTNode } from 'types/compiler'

let isStaticKey
let isPlatformReservedTag

const genStaticKeysCached = cached(genStaticKeys)

/**
 * Goal of the optimizer: walk the generated template AST tree
 * and detect sub-trees that are purely static, i.e. parts of
 * the DOM that never needs to change.
 *
 * Once we detect these sub-trees, we can:
 *
 * 1. Hoist them into constants, so that we no longer need to
 *    create fresh nodes for them on each re-render;
 * 2. Completely skip them in the patching process.
 */
// optimize 的主要作用是遍历通过 template 生成的 AST 树，标记 static 静态节点，这是 Vue 在编译过程中的一处优化
// 后面当 update 更新时，会有一个 patch 的过程，diff 算法会直接跳过静态节点，从而减少了比较的过程，优化了 patch 的性能
// 因为有很多数据是首次渲染后就永远不会变化的，那么这部分数据生成的 DOM 也不会变化
export function optimize(
  root: ASTElement | null | undefined,
  options: CompilerOptions
) {

  // 没有根节点，返回
  if (!root) return

  // 判断是否是静态 key
  isStaticKey = genStaticKeysCached(options.staticKeys || '')

  // 是否是保留标签(HTML 标签、SVG 标签)
  isPlatformReservedTag = options.isReservedTag || no
  // first pass: mark all non-static nodes.
  // 标记静态节点
  markStatic(root)
  // second pass: mark static roots.
  // 标记静态根
  markStaticRoots(root, false)
}

// 生成静态 key
function genStaticKeys(keys: string): Function {
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap' +
      (keys ? ',' + keys : '')
  )
}

// 标记静态节点
function markStatic(node: ASTNode) {
  // 标记是否是静态节点
  node.static = isStatic(node)
  if (node.type === 1) {
    // do not make component slot content static. this avoids
    // 1. components not able to mutate slot nodes
    // 2. static slot content fails for hot-reloading
    if (
      !isPlatformReservedTag(node.tag) &&
      node.tag !== 'slot' &&
      node.attrsMap['inline-template'] == null
    ) {
      return
    }
    // 如果这个节点是一个普通元素，则遍历它的所有 children，递归执行 markStatic
    // 一旦子节点有不是 static 的情况，则它的父节点的 static 均变成 false
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      markStatic(child)
      if (!child.static) {
        node.static = false
      }
    }

    // 因为所有的 elseif 和 else 节点都不在 children 中，
    // 如果节点的 ifConditions 不为空，则遍历 ifConditions 拿到所有条件中的 block
    // 也就是它们对应的 AST 节点，递归执行 markStatic
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}

// 标记静态根
function markStaticRoots(node: ASTNode, isInFor: boolean) {
  if (node.type === 1) {
    // 对于已经是 static 的节点或者是 v-once 指令的节点，node.staticInFor = isInFor
    if (node.static || node.once) {
      node.staticInFor = isInFor
    }
    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.
    // 有资格成为 staticRoot 的节点，除了本身是一个静态节点外
    // 必须满足拥有 children，并且 children 不能只是一个文本节点
    if (
      node.static &&
      node.children.length &&
      !(node.children.length === 1 && node.children[0].type === 3)
    ) {
      node.staticRoot = true
      return
    } else {
      node.staticRoot = false
    }

    // 遍历 children 以及 ifConditions，递归执行 markStaticRoots
    if (node.children) {
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}

// 判断是否是静态节点
function isStatic(node: ASTNode): boolean {

  // 如果是表达式，就是非静态
  if (node.type === 2) {
    // expression
    return false
  }

  // 如果是纯文本，就是静态
  if (node.type === 3) {
    // text
    return true
  }

  return !!(
    // 对于一个普通元素，如果有 pre 属性，那么它使用了 v-pre 指令，是静态
    node.pre ||
    (!node.hasBindings && // no dynamic bindings
      // 没有使用 v-if、v-for，没有使用其它指令（不包括 v-once）
      !node.if &&
      !node.for && // not v-if or v-for or v-else
      // 非内置组件
      !isBuiltInTag(node.tag) && // not a built-in
      // 是保留的标签
      isPlatformReservedTag(node.tag) && // not a component
      // 非带有 v-for 的 template 标签的直接子节点
      !isDirectChildOfTemplateFor(node) &&
      // 节点的所有属性的 key 都满足静态 key
      Object.keys(node).every(isStaticKey))
  )
}

function isDirectChildOfTemplateFor(node: ASTElement): boolean {
  while (node.parent) {
    node = node.parent
    if (node.tag !== 'template') {
      return false
    }
    if (node.for) {
      return true
    }
  }
  return false
}
