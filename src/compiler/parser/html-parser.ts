/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson (MPL-1.1 OR Apache-2.0 OR GPL-2.0-or-later)
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'
import { unicodeRegExp } from 'core/util/lang'
import { ASTAttr, CompilerOptions } from 'types/compiler'

// Regular Expressions for parsing tags and attributes
// 匹配属性，例如 id、class
const attribute =
  /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/

// 匹配动态属性，例如 v-if、v-else
const dynamicArgAttribute =
  /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+?\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
// 识别合法的xml标签
const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*`
const qnameCapture = `((?:${ncname}\\:)?${ncname})`

// 匹配开始标签
const startTagOpen = new RegExp(`^<${qnameCapture}`)

// 匹配单标签
const startTagClose = /^\s*(\/?)>/

// 匹配结束标签
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)

// 匹配<!DOCTYPE> 声明标签
const doctype = /^<!DOCTYPE [^>]+>/i

// #7298: escape - to avoid being passed as HTML comment when inlined in page
// 匹配注释
const comment = /^<!\--/

// 匹配条件注释
const conditionalComment = /^<!\[/

// Special Elements (can contain anything)
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t',
  '&#39;': "'"
}
const encodedAttr = /&(?:lt|gt|quot|amp|#39);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#39|#10|#9);/g

// #5992
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
const shouldIgnoreFirstNewline = (tag, html) =>
  tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

function decodeAttr(value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

export interface HTMLParserOptions extends CompilerOptions {
  start?: (
    tag: string,
    attrs: ASTAttr[],
    unary: boolean,
    start: number,
    end: number
  ) => void
  end?: (tag: string, start: number, end: number) => void
  chars?: (text: string, start?: number, end?: number) => void
  comment?: (content: string, start: number, end: number) => void
}

export function parseHTML(html, options: HTMLParserOptions) {

  // 存储开始标签
  // 用栈来检测标签是否闭合
  const stack: any[] = []
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  let index = 0
  let last, lastTag

  // 这里的html就是传进来的template字符串
  // 只要html还有长度就继续循环
  while (html) {

    // 记录当前最新 html
    last = html
    // Make sure we're not in a plaintext content element like script/style
    if (!lastTag || !isPlainTextElement(lastTag)) {

      // 获取字符 '<' 的位置
      let textEnd = html.indexOf('<')

      // 当前 template 第一个字符是 <
      // template 会出现以下几种情况，重点是解析开始标签和结束标签
      // 1. <!-- 开头的注释：会找到注释的结尾，将注释截取出来，移动指针，并将注释当做当前父节点的一个子元素存储到 children 中。
      // 2. <![ 开头的 条件注释：如果是条件注释，会直接移动指针，不做任何其他操作。
      // 3. <!DOCTYPE 开头的 doctype：如果是 doctype，会直接移动指针，不做任何其他操作。
      // 4. < 开头的开始标签
      // 5. < 开头的结束标签

      // 如果位置是 0 的话说明遇到开始或者结尾标签了
      // 例如 <div> 或者 <div />
      if (textEnd === 0) {
        // Comment:
        // 注释节点
        if (comment.test(html)) {

          // 注释节点结束的位置
          const commentEnd = html.indexOf('-->')

          if (commentEnd >= 0) {
            if (options.shouldKeepComment && options.comment) {
              options.comment(
                html.substring(4, commentEnd),
                index,
                index + commentEnd + 3
              )
            }

            // 向后推进 3
            advance(commentEnd + 3)
            continue
          }
        }

        // https://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        // 解析条件注释
        if (conditionalComment.test(html)) {
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype:
        // 解析 Doctype
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // End tag:
        // 解析截取结束标签
        const endTagMatch = html.match(endTag)
        if (endTagMatch) {
          const curIndex = index
          advance(endTagMatch[0].length)
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // Start tag:
        // 解析截取开始标签
        const startTagMatch = parseStartTag()
        if (startTagMatch) {

          // 处理开始标签的解析结果，接收 parseStartTag 函数的返回值作为参数
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            advance(1)
          }
          continue
        }
      }

      let text, rest, next
      if (textEnd >= 0) {
        rest = html.slice(textEnd)
        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // < in plain text, be forgiving and treat it as text
          next = rest.indexOf('<', 1)
          if (next < 0) break
          textEnd += next
          rest = html.slice(textEnd)
        }
        text = html.substring(0, textEnd)
      }

      // 纯文本节点
      if (textEnd < 0) {
        text = html
      }

      // 截取文本节点
      if (text) {
        advance(text.length)
      }

      if (options.chars && text) {
        options.chars(text, index - text.length, index)
      }
    } else {
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      const reStackedTag =
        reCache[stackedTag] ||
        (reCache[stackedTag] = new RegExp(
          '([\\s\\S]*?)(</' + stackedTag + '[^>]*>)',
          'i'
        ))
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      index += html.length - rest.length
      html = rest
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    if (html === last) {
      options.chars && options.chars(html)
      if (__DEV__ && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`, {
          start: index + html.length
        })
      }
      break
    }
  }

  // Clean up any remaining tags
  // 清空闭合标签
  parseEndTag()

  // 在解析 template 字符串的时候，需要对字符串逐一扫描
  // 截取标签，前后推进位置
  // 例如匹配到 < 字符，指针移动 1，匹配到 <!-- 字符指针移动 4
  // 要想解析完成就必须把模板全部编译完
  function advance(n) {
    index += n
    html = html.substring(n)
  }

  // 解析开始标签
  function parseStartTag() {

    // 通过正则匹配到开始标签，如果匹配到就会返回一个 match 的匹配结果
    const start = html.match(startTagOpen)
    if (start) {

      // 定义 match 变量，它是一个对象，初始状态下拥有三个属性
      const match: any = {

        // 存储标签的名称，例如 div
        tagName: start[1],

        // 用来存储将来被匹配到的属性，例如：id、class、v-if 这些属性
        attrs: [],

        // 初始值为 index，是当前字符流读入位置在整个 html 字符串中的相对位置
        start: index
      }

      // 通过 advance 函数移动指针
      advance(start[0].length)
      let end, attr

      // 如果没有匹配到开始标签的结束部分，并且存在属性
      // 遍历找出所有属性和动态属性，保存到 attrs 中
      while (
        !(end = html.match(startTagClose)) &&
        (attr = html.match(dynamicArgAttribute) || html.match(attribute))
      ) {
        attr.start = index
        advance(attr[0].length)
        attr.end = index
        match.attrs.push(attr)
      }

      // 上一步获取了标签的属性和动态属性，但是即使这样并不能说明这是一个完整的标签
      // 只有当匹配到开始标记的结束标记时，才能证明这是一个完整的标签
      if (end) {
        match.unarySlash = end[1]
        advance(end[0].length)
        match.end = index
        return match
      }
    }
  }

  // 处理开始标签的解析结果
  function handleStartTag(match) {
    const tagName = match.tagName
    const unarySlash = match.unarySlash

    if (expectHTML) {
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag)
      }
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }

    // 先判断开始标签是否是一元标签，类似 <img />、<br/> 这样
    const unary = isUnaryTag(tagName) || !!unarySlash

    // 对 match.attrs 遍历并做了一些处理
    const l = match.attrs.length
    const attrs: ASTAttr[] = new Array(l)
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      const value = args[3] || args[4] || args[5] || ''
      const shouldDecodeNewlines =
        tagName === 'a' && args[1] === 'href'
          ? options.shouldDecodeNewlinesForHref
          : options.shouldDecodeNewlines
      attrs[i] = {
        name: args[1],
        value: decodeAttr(value, shouldDecodeNewlines)
      }
      if (__DEV__ && options.outputSourceRange) {
        attrs[i].start = args.start + args[0].match(/^\s*/).length
        attrs[i].end = args.end
      }
    }

    // 如果非一元标签，则往 stack 里 push 一个对象，并且把 tagName 赋值给 lastTag
    if (!unary) {
      stack.push({
        tag: tagName,
        lowerCasedTag: tagName.toLowerCase(),
        attrs: attrs,
        start: match.start,
        end: match.end
      })
      lastTag = tagName
    }

    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }

  // 解析结束标签
  function parseEndTag(tagName?: any, start?: any, end?: any) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    // Find the closest opened tag of the same type
    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase()
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop
      pos = 0
    }

    if (pos >= 0) {
      // Close all the open elements, up the stack
      for (let i = stack.length - 1; i >= pos; i--) {
        if (__DEV__ && (i > pos || !tagName) && options.warn) {
          options.warn(`tag <${stack[i].tag}> has no matching end tag.`, {
            start: stack[i].start,
            end: stack[i].end
          })
        }
        if (options.end) {
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the open elements from the stack
      stack.length = pos
      lastTag = pos && stack[pos - 1].tag
    } else if (lowerCasedTagName === 'br') {
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
    } else if (lowerCasedTagName === 'p') {
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}
