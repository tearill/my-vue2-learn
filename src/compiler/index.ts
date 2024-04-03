import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'
import { CompilerOptions, CompiledResult } from 'types/compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
// createCompilerCreator 返回值是一个函数
// 通过 baseCompile 函数返回一个配置，传递给 createCompilerCreator 调用
// 柯里化
export const createCompiler = createCompilerCreator(function baseCompile(
  template: string,
  options: CompilerOptions
): CompiledResult {

  // parse 解析得到 ast 树
  // parse 会用正则等方式解析 template 模板中的指令、class、style 等数据，形成 AST 语法树
  const ast = parse(template.trim(), options)

  /**
   将 AST 树进行优化
   优化的目标：生成模板 AST 树，检测不需要进行 DOM 改变的静态子树。
   一旦检测到这些静态树，我们就能做以下这些事情：
   1.把它们变成常数，这样我们就再也不需要每次重新渲染时创建新的节点了。
   2.在 patch 的过程中直接跳过
   */
  // optimize 的主要作用是标记 static 静态节点，这是 Vue 在编译过程中的一处优化
  // 后面当 update 更新时，会有一个 patch 的过程，diff 算法会直接跳过静态节点，从而减少了比较的过程，优化了 patch 的性能
  if (options.optimize !== false) {
    optimize(ast, options)
  }

  // 最后通过 generate 得到 render 以及 staticRenderFns
  // 也就是生成代码，把 AST 转换成 render function 字符串
  // 格式大概是类似_c('div',{id:"app"},_c('div',undefined,_v("hello"+_s(name)),_c('span',undefined,_v("world"))))
  // _c代表创建元素，_v代表创建文本，_s代表文Json.stringify--把对象解析成文本
  const code = generate(ast, options)
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
