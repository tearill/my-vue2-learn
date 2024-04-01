import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import {
  shouldDecodeNewlines,
  shouldDecodeNewlinesForHref
} from './util/compat'
import type { Component } from 'types/component'
import type { GlobalAPI } from 'types/global-api'

const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

// 获取 Vue 原型上的 $mount 方法(公共的 $mount 方法)并重新定义
// 在公共 $mount 的基础上，增加了编译的过程
const mount = Vue.prototype.$mount
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {

  // 转换成 DOM 对象
  el = el && query(el)

  /* istanbul ignore if */

  // 不能挂载到 body 标签和 html 标签下(因为会整个覆盖)
  if (el === document.body || el === document.documentElement) {
    __DEV__ &&
      warn(
        `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
      )
    return this
  }

  // 拿到所有的配置
  const options = this.$options

  // 判断是否有自定义 render 方法
  // resolve template/el and convert to render function
  // 如果没有自定义 render 方法
  if (!options.render) {

    // template 模板部分
    let template = options.template

    // 判断 new 的时候是否指定 template
    if (template) {

      // 如果是 string
      if (typeof template === 'string') {

        // 如果给的是 id
        if (template.charAt(0) === '#') {

          // 通过 id 去 DOM 里面寻找元素
          template = idToTemplate(template)
          /* istanbul ignore if */
          // 如果没找到，进行提示，没有传递根节点
          if (__DEV__ && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) {

        // 如果是 DOM 节点，取出 innerHTML
        template = template.innerHTML
      } else {
        // 无效的 template 属性，直接退出
        if (__DEV__) {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    }
    else if (el) {

      // 如果只给了 el，调用 getOuterHTML(el)
      // 直接拿 el 的内容作为 template
      // @ts-expect-error
      template = getOuterHTML(el)
    }

    // 再次判断是否有 template，进行模板编译
    if (template) {
      /* istanbul ignore if */
      if (__DEV__ && config.performance && mark) {

        // 标记开始编译
        mark('compile')
      }

      // 生成 render 函数
      // 这里返回 render 和 staticRenderFns 这两个函数
      // 这里有一个编译时优化：static 静态不需要在 VNode 更新时进行 patch，优化性能
      const { render, staticRenderFns } = compileToFunctions(
        template,
        {
          outputSourceRange: __DEV__,
          shouldDecodeNewlines,
          shouldDecodeNewlinesForHref,
          delimiters: options.delimiters,
          comments: options.comments
        },
        this
      )
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      if (__DEV__ && config.performance && mark) {

        // 标记结束，计算耗时
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }

  // 调用公共的 mount 函数，最终调用 mountComponent
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
function getOuterHTML(el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

// 编译生成 render 函数的方法
Vue.compile = compileToFunctions

export default Vue as GlobalAPI
