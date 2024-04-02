import { cached } from 'shared/util'
import { parseFilters } from './filter-parser'

const defaultTagRE = /\{\{((?:.|\r?\n)+?)\}\}/g
const regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g

const buildRegex = cached(delimiters => {
  const open = delimiters[0].replace(regexEscapeRE, '\\$&')
  const close = delimiters[1].replace(regexEscapeRE, '\\$&')
  return new RegExp(open + '((?:.|\\n)+?)' + close, 'g')
})

type TextParseResult = {
  expression: string
  tokens: Array<string | { '@binding': string }>
}

// 解析文本包含了字面量表达式的情况
// 比如：<div>1111: {{ text }}</div>
// 解析之后是：
// {
//   expression: "\"1111: \"+_s(text)"",
//   tokens: ["1111: ", {@binding: "text"}]
// }
export function parseText(
  text: string,
  delimiters?: [string, string]
): TextParseResult | void {
  //@ts-expect-error
  // 根据插值表达式的分隔符创建正则
  // 正则表达式用于匹配插值表达式
  const tagRE = delimiters ? buildRegex(delimiters) : defaultTagRE

  // 使用正则判断文本中是否包含插值语法，如果没有就退出
  if (!tagRE.test(text)) {
    return
  }

  // 创建两个数组变量 tokens 和 rawTokens，用于保存解析后的表达式和原始表达式
  const tokens: string[] = []
  const rawTokens: any[] = []

  // lastIndex 用于记录上一次匹配的位置
  let lastIndex = (tagRE.lastIndex = 0)

  // match 用于存储当前匹配到的结果
  let match, index, tokenValue

  // 只要依然存在插值，就继续解析
  while ((match = tagRE.exec(text))) {

    // 通过 match.index 获取当前匹配到的插值表达式在 text 中的起始位置
    index = match.index
    // push text token
    // 如果当前匹配到的插值表达式之前还有普通文本内容，则将该文本内容添加到 rawTokens 和 tokens 数组中
    if (index > lastIndex) {
      rawTokens.push((tokenValue = text.slice(lastIndex, index)))
      tokens.push(JSON.stringify(tokenValue))
    }
    // tag token
    // 解析插值表达式中的内容，通过 parseFilters 函数对匹配到的表达式进行处理
    // 并将处理结果添加到 tokens 数组中
    const exp = parseFilters(match[1].trim())
    tokens.push(`_s(${exp})`)

    // 将原始的插值表达式对象 { '@binding': exp } 添加到 rawTokens 数组中
    rawTokens.push({ '@binding': exp })

    // 更新 lastIndex 的值，使其指向当前匹配到的插值表达式的结束位置
    lastIndex = index + match[0].length
  }

  // 循环结束后，如果最后一个插值表达式之后还有普通文本内容
  // 则将该文本内容添加到 rawTokens 和 tokens 数组中
  if (lastIndex < text.length) {
    rawTokens.push((tokenValue = text.slice(lastIndex)))
    tokens.push(JSON.stringify(tokenValue))
  }
  return {

    // 解析后的表达式字符串
    expression: tokens.join('+'),

    // 解析后的原始表达式数组
    tokens: rawTokens
  }
}
