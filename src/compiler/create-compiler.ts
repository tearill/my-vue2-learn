import { extend } from 'shared/util'
import { CompilerOptions, CompiledResult, WarningMessage } from 'types/compiler'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'

export function createCompilerCreator(baseCompile: Function): Function {

  // 提供一个方法，根据传递的 baseOptions（不同平台可以有不同的实现）创建相应的编译器
  return function createCompiler(baseOptions: CompilerOptions) {
    function compile(
      template: string,
      options?: CompilerOptions
    ): CompiledResult {

      // 先解析一次 template，然后通过 baseCompile 编译模板

      // 最终的编译配置
      const finalOptions = Object.create(baseOptions)
      const errors: WarningMessage[] = []
      const tips: WarningMessage[] = []

      let warn = (
        msg: WarningMessage,
        range: { start: number; end: number },
        tip: string
      ) => {
        ;(tip ? tips : errors).push(msg)
      }

      // 做下面这些 merge 的目的因为不同平台可以提供自己本身平台的一个 baseOptions
      // 内部封装了平台自己的实现，然后把共同的部分抽离开来放在这层 compiler 中，所以在这里需要 merge 一下
      if (options) {
        if (__DEV__ && options.outputSourceRange) {
          // $flow-disable-line
          const leadingSpaceLength = template.match(/^\s*/)![0].length

          warn = (
            msg: WarningMessage | string,
            range: { start: number; end: number },
            tip: string
          ) => {
            const data: WarningMessage = typeof msg === 'string' ? { msg } : msg
            if (range) {
              if (range.start != null) {
                data.start = range.start + leadingSpaceLength
              }
              if (range.end != null) {
                data.end = range.end + leadingSpaceLength
              }
            }
            ;(tip ? tips : errors).push(data)
          }
        }
        // merge custom modules
        if (options.modules) {

          // 合并 modules
          finalOptions.modules = (baseOptions.modules || []).concat(
            options.modules
          )
        }
        // merge custom directives
        if (options.directives) {

          // 合并 directives
          finalOptions.directives = extend(
            Object.create(baseOptions.directives || null),
            options.directives
          )
        }
        // copy other options
        for (const key in options) {

          // 合并其余的 options，modules 与 directives 已经在上面做了特殊处理了
          if (key !== 'modules' && key !== 'directives') {
            finalOptions[key] = options[key as keyof CompilerOptions]
          }
        }
      }

      finalOptions.warn = warn

      // 运行传入的 baseCompile 函数进行基础编译
      // 基础模板编译，得到编译结果 => 编译结果是一个对象
      // {
      //   ast,
      //   render: code.render,
      //   staticRenderFns: code.staticRenderFns
      // }
      const compiled = baseCompile(template.trim(), finalOptions)
      if (__DEV__) {
        detectErrors(compiled.ast, warn)
      }
      compiled.errors = errors
      compiled.tips = tips
      return compiled
    }

    // 返回两个函数
    return {
      compile,

      // 带缓存的编译器，同时 staticRenderFns 以及 render 函数会被转换成 Function 对象
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
